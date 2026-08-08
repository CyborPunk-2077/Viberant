/**
 * Looking at something running on another computer.
 *
 * Somebody starts a development server on the machine under their desk and
 * wants to see it from the laptop they are actually holding. The obvious answer
 * is to put that server on the internet, and it is the wrong one: a dev server
 * is unauthenticated by design, usually talks to a real database, and prints
 * stack traces at strangers.
 *
 * So nothing is exposed. A small server runs **here**, on this computer, on an
 * address only this computer can reach. Each request it receives is carried
 * down the connection that already exists to the other machine — proved,
 * sealed, and refused if that machine says no — and answered by the dev server
 * there, which never learns the internet exists.
 *
 * Two consequences worth being clear about:
 *
 *   the only way in is through Viberant, on a computer already in the
 *     workspace, with a connection already established;
 *   turning Viberant off turns this off, because it *is* Viberant.
 */

import { createServer, request as httpRequest } from 'node:http';

/** Where a preview listens here. Loopback only, never a real address. */
export const HERE = '127.0.0.1';

/** How long one request may take before it is given up on. */
const ANSWER_WITHIN = 30000;
/** How large one answer may be. A dev server that sends more is not a page. */
const MOST_IN_ONE_ANSWER = 64 * 1024 * 1024;

const going = new Map();

/**
 * Open a window onto a port on another computer.
 *
 * Returns an address on this computer. Everything that arrives there is asked
 * for over the peer connection and answered from there.
 */
export async function open({ peer, channels, port, name }) {
  const server = createServer(async (incoming, answer) => {
    let channel;
    try {
      channel = await channels.start(`preview:${port}`);
    } catch {
      answer.writeHead(503, { 'content-type': 'text/plain' });
      return answer.end('That computer is not answering just now.');
    }

    /**
     * The request, said once at the top of the channel.
     *
     * Headers that describe *this* connection rather than the request are left
     * out: a hop-by-hop header forwarded to another machine describes a
     * connection that does not exist there.
     */
    const headers = { ...incoming.headers };
    for (const drop of ['connection', 'keep-alive', 'upgrade', 'proxy-authenticate',
      'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'host']) {
      delete headers[drop];
    }

    await channel.write(`${JSON.stringify({
      method: incoming.method,
      path: incoming.url,
      headers,
      port,
    })}\n`);

    incoming.on('data', (chunk) => channel.write(chunk).catch(() => {}));
    incoming.on('end', () => channel.end());

    let said = false;
    let held = '';
    let sent = 0;

    const gaveUp = setTimeout(() => {
      if (!answer.headersSent) {
        answer.writeHead(504, { 'content-type': 'text/plain' });
        answer.end('That computer did not answer in time.');
      }
      channel.fail('took too long');
    }, ANSWER_WITHIN);

    channel.incoming.on('data', (chunk) => {
      if (!said) {
        held += chunk.toString('binary');
        const at = held.indexOf('\n');
        if (at === -1) return;
        let head;
        try { head = JSON.parse(held.slice(0, at)); } catch { return channel.fail('unreadable'); }
        const rest = Buffer.from(held.slice(at + 1), 'binary');
        held = '';
        said = true;
        answer.writeHead(head.status ?? 200, head.headers ?? {});
        if (rest.length) { sent += rest.length; answer.write(rest); }
        return;
      }
      sent += chunk.length;
      if (sent > MOST_IN_ONE_ANSWER) { channel.fail('too large'); return answer.destroy(); }
      answer.write(chunk);
    });

    channel.incoming.on('end', () => { clearTimeout(gaveUp); answer.end(); });
    channel.incoming.on('error', () => {
      clearTimeout(gaveUp);
      if (!answer.headersSent) answer.writeHead(502, { 'content-type': 'text/plain' });
      answer.end('That computer stopped answering.');
    });
  });

  await new Promise((done) => server.listen(0, HERE, done));
  const at = `http://${HERE}:${server.address().port}`;

  const one = { at, port, name, peer: peer?.who?.deviceId ?? null, server, began: Date.now() };
  going.set(at, one);
  return {
    ok: true,
    at,
    sentence: `${name ?? 'That project'} is running on ${peer?.who?.displayName ?? 'that computer'}.`,
    action: 'This address works on this computer only, and only while Viberant is open.',
  };
}

/**
 * Answer a request that arrived over a connection, from the dev server here.
 *
 * The far half. It talks to `127.0.0.1` on this machine and nowhere else — a
 * request that could name any address would be a way to reach anything this
 * computer can reach, which is most of a corporate network.
 */
export function answer(channel, { allowedPorts = null } = {}) {
  let said = false;
  let held = '';

  channel.incoming.on('data', (chunk) => {
    if (said) return;
    held += chunk.toString();
    const at = held.indexOf('\n');
    if (at === -1) return;

    let asked;
    try { asked = JSON.parse(held.slice(0, at)); } catch { return channel.fail('unreadable'); }
    const body = Buffer.from(held.slice(at + 1), 'binary');
    held = '';
    said = true;

    const port = Number(asked.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return channel.fail('not a port');
    if (allowedPorts && !allowedPorts.includes(port)) {
      return channel.fail('that is not a port this computer is offering');
    }

    const onward = httpRequest({
      host: HERE,
      port,
      path: String(asked.path ?? '/'),
      method: String(asked.method ?? 'GET'),
      headers: asked.headers ?? {},
    }, async (from) => {
      await channel.write(`${JSON.stringify({
        status: from.statusCode,
        headers: from.headers,
      })}\n`);
      from.on('data', (c) => channel.write(c).catch(() => {}));
      from.on('end', () => channel.end());
      from.on('error', () => channel.fail('that server stopped'));
    });

    onward.on('error', () => channel.fail('nothing is answering on that port here'));
    if (body.length) onward.write(body);
    onward.end();
  });
}

/** Every window this computer has open onto another. */
export const openWindows = () => [...going.values()].map((one) => ({
  at: one.at, port: one.port, name: one.name, began: one.began,
}));

/** Close one. */
export function close(at) {
  const one = going.get(at);
  if (!one) return { ok: true, sentence: 'That was already closed.' };
  one.server.close();
  going.delete(at);
  return { ok: true, sentence: 'That preview is closed.' };
}

/** Close all of them, which is what leaving does. */
export function closeEverything() {
  for (const at of [...going.keys()]) close(at);
}

export const __testOnly = { going, MOST_IN_ONE_ANSWER };
