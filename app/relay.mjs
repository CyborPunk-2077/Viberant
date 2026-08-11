/**
 * The machine in the middle, for the networks most people actually have.
 *
 * Two computers behind two ordinary home routers usually cannot open a
 * connection to each other. The honest answers are a machine in the middle or
 * "sorry, use a cable", and this is the first one.
 *
 * **It cannot read anything it carries.** Both ends agreed a key before this
 * saw a byte, and everything that passes through is sealed with it. What this
 * sees is: a ticket, a length, and that many bytes it cannot open. That is not
 * a promise about how careful the code is — it is a fact about what arrives.
 *
 * **It does not hold anything.** Bytes are written on as they come, with the
 * socket's own back-pressure doing the pacing. A relay that buffered a file
 * would need the memory of the largest thing anybody ever sent, and somebody
 * would eventually send a 40 GB one.
 *
 * The ticket is how two ends find each other: the side that wants to be reached
 * asks the control plane for one, the other side is given the same ticket, and
 * this pairs them. Whoever arrives first waits; the second one joins them. A
 * ticket works once and expires.
 *
 * Running one is deliberately ordinary — `node app/relay.mjs` on anything with
 * a public address. There is nothing of anybody's in it, so it needs no backup,
 * no database, and no trust.
 */

import { createServer, createConnection } from 'node:net';

import { frames, framed } from './peers.mjs';

/** Where a relay listens unless told otherwise. */
export const RELAY_PORT = 47780;

/** How long a ticket waits for its other half before it is thrown away. */
const TICKET_LASTS = 60 * 1000;
/** How long a connection may say nothing at all before it is closed. */
const SILENCE = 90 * 1000;
/** How many pairs one address may be part of at once. */
const PAIRS_PER_ADDRESS = 8;
/** How much one side may push per second before it is slowed down. */
const BYTES_A_SECOND = 25 * 1024 * 1024;

/**
 * Start a relay.
 *
 * Returns the server and a small window onto what it is doing, which is what
 * the diagnostics page reads — how many pairs, how many bytes, and nothing
 * about who or what.
 */
export function start({ port = RELAY_PORT, host = '0.0.0.0' } = {}) {
  /** Tickets with one side waiting. */
  const waiting = new Map();
  /** How many pairs each address is part of, so one cannot take the lot. */
  const busy = new Map();

  const counted = { paired: 0, refused: 0, bytes: 0, open: 0 };

  const server = createServer((socket) => {
    socket.setNoDelay(true);
    socket.setTimeout(SILENCE, () => socket.destroy());

    const from = socket.remoteAddress ?? 'unknown';
    if ((busy.get(from) ?? 0) >= PAIRS_PER_ADDRESS) {
      counted.refused += 1;
      return socket.destroy();
    }

    const reader = frames();
    let ticket = null;
    let joined = false;

    // Only the first frame is read by this machine. Everything after it is
    // forwarded without being looked at, which is the whole design.
    const onData = (chunk) => {
      if (joined) return;
      let got;
      try { got = reader.take(chunk); } catch { return socket.destroy(); }

      for (const frame of got) {
        if (joined) return;
        let asked;
        try { asked = JSON.parse(frame.toString()); } catch { return socket.destroy(); }

        const wanted = String(asked?.ticket ?? '');
        if (!/^[0-9a-f]{32,64}$/.test(wanted)) { counted.refused += 1; return socket.destroy(); }

        ticket = wanted;
        const already = waiting.get(ticket);

        if (!already) {
          const timer = setTimeout(() => {
            if (waiting.get(ticket)?.socket === socket) {
              waiting.delete(ticket);
              socket.destroy();
            }
          }, TICKET_LASTS);
          timer.unref?.();
          waiting.set(ticket, { socket, timer, from, reader, onData });
          socket.write(framed(Buffer.from(JSON.stringify({ waiting: true }))));
          return;
        }

        // The other half. A ticket works once.
        clearTimeout(already.timer);
        waiting.delete(ticket);
        joined = true;
        counted.paired += 1;
        counted.open += 2;

        busy.set(from, (busy.get(from) ?? 0) + 1);
        busy.set(already.from, (busy.get(already.from) ?? 0) + 1);

        already.socket.write(framed(Buffer.from(JSON.stringify({ joined: true }))));
        socket.write(framed(Buffer.from(JSON.stringify({ joined: true }))));

        /**
         * Stop reading, on both sides, before forwarding starts.
         *
         * The side that arrived first has been sitting here with a control
         * reader attached, which means it is in flowing mode. Leave that
         * listener on and it reads the *other computer's* handshake as though
         * it were addressed to this machine, decides it is nonsense, and hangs
         * up — so nothing could ever get through a relay. Anything it has
         * already taken off the wire goes back on before the pipe is joined.
         */
        /**
         * Not paused here, and that is the difference worth naming.
         *
         * Everywhere else a stream is handed across an `await` to a reader that
         * attaches later, and it must be paused or what arrives in between is
         * lost. Here the handover is three statements in one tick — detach,
         * put back, pipe — with nothing able to run between them, so there is
         * no window. Pausing anyway leaves the socket stranded: `pipe` resumes
         * a stream it has just been given, and a stream paused inside its own
         * data handler in the same tick does not come back.
         *
         * Tried, and it stopped the relay forwarding anything at all.
         */
        socket.off('data', onData);
        already.socket.off('data', already.onData);
        for (const [s, held] of [[socket, reader.rest], [already.socket, already.reader.rest]]) {
          if (held?.length) s.unshift(held);
        }

        pipeBothWays(already.socket, socket);
      }
    };

    socket.on('data', onData);
    socket.on('error', () => socket.destroy());
    socket.on('close', () => {
      if (ticket && waiting.get(ticket)?.socket === socket) waiting.delete(ticket);
      if (joined) {
        counted.open = Math.max(0, counted.open - 1);
        busy.set(from, Math.max(0, (busy.get(from) ?? 1) - 1));
        if (!busy.get(from)) busy.delete(from);
      }
    });
  });

  /**
   * Forward, with the socket's own back-pressure doing the pacing.
   *
   * `pipe` handles that already: when the far side is behind, the near side is
   * paused, and this machine holds one chunk rather than a file. The pacing on
   * top is a ceiling on how fast one pair may push, so one enthusiastic
   * transfer cannot take a relay away from everybody else.
   */
  function pipeBothWays(a, b) {
    for (const [from, to] of [[a, b], [b, a]]) {
      let since = Date.now();
      let sent = 0;

      /**
       * Forwarded first, counted second.
       *
       * Attaching a `data` listener starts a paused stream flowing, so a
       * counter added *before* the pipe takes the first chunks on its own and
       * they never reach the other side. That is how the first frame of a
       * handshake vanished the moment the sockets were correctly paused before
       * being handed over — the bug had been there all along, hidden by the
       * stream already flowing for the wrong reason.
       */
      from.pipe(to);

      from.on('data', (chunk) => {
        counted.bytes += chunk.length;
        sent += chunk.length;

        const elapsed = Date.now() - since;
        if (elapsed >= 1000) { since = Date.now(); sent = 0; return; }
        if (sent > BYTES_A_SECOND) {
          from.pause();
          const rest = 1000 - elapsed;
          setTimeout(() => { since = Date.now(); sent = 0; from.resume(); }, rest).unref?.();
        }
      });
      from.on('error', () => { a.destroy(); b.destroy(); });
      from.on('close', () => { a.destroy(); b.destroy(); });
    }
  }

  server.on('error', () => { /* a port already taken is not worth ending over */ });

  // Resolves once it is actually listening, so whoever started it can ask what
  // port it got — which matters when it was told to take any free one.
  const listening = new Promise((done) => { server.once('listening', () => done(server.address())); });
  server.listen(port, host);

  return {
    server,
    port,
    listening,
    /** Numbers, and only numbers. Nothing here says who or what. */
    counted,
    stop: () => new Promise((done) => {
      for (const one of waiting.values()) { clearTimeout(one.timer); one.socket.destroy(); }
      waiting.clear();
      server.close(() => done());
    }),
  };
}

/**
 * Reach a peer through a relay.
 *
 * Both ends do the same thing with the same ticket and one of them arrives
 * first. After the relay says the two are joined, the socket is an ordinary
 * pipe to the other computer and the handshake happens over it exactly as it
 * would on a local network — the relay is not part of that conversation and
 * cannot join it.
 */
/**
 * Reach a peer through a relay.
 *
 * Answers with the socket **and** whatever was already read off it, because a
 * socket alone is not enough to hand over safely — see the note where it is
 * gathered. `null` still means it did not happen.
 */
export function dialRelay({ host, port = RELAY_PORT, ticket, within = 60000 }) {
  return new Promise((done) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; clearTimeout(waiting); done(v); } };

    const socket = createConnection({ host, port });
    const waiting = setTimeout(() => { socket.destroy(); finish(null); }, within);
    const reader = frames();

    socket.once('error', () => finish(null));
    socket.on('close', () => finish(null));

    const onData = (chunk) => {
      let got;
      try { got = reader.take(chunk); } catch { socket.destroy(); return finish(null); }
      for (let i = 0; i < got.length; i += 1) {
        let said;
        try { said = JSON.parse(got[i].toString()); } catch { socket.destroy(); return finish(null); }
        if (said?.waiting) continue;
        if (!said?.joined) { socket.destroy(); return finish(null); }

        /**
         * Joined. Everything from here belongs to the other computer.
         *
         * Anything already read past this point is put back on the stream
         * rather than dropped: the relay starts forwarding the moment it pairs
         * two sides, so the peer's first frame regularly arrives in the same
         * chunk as the word that they are paired. Read as control, it looked
         * like nonsense and the connection was closed; swallowed, the handshake
         * simply waited forever for something it had already been given.
         */
        /**
         * Stopped before it is let go of, then handed back whole.
         *
         * Reading the control frames put this socket into flowing mode, and
         * taking the listener off does **not** put it back — so everything that
         * arrived between the relay pairing the two sides and the handshake
         * attaching its own reader went into nothing. The far end's hello is
         * exactly what arrives in that window, and under load it arrives there
         * often enough to fail one run in three.
         *
         * The same mistake as `sync.firstLine` and as the relay's own pairing,
         * which is three times now — a stream handed from one reader to another
         * must be paused first, every time.
         */
        /**
         * Joined. Everything from here belongs to the other computer.
         *
         * What has already been taken off the wire is handed to whoever reads
         * next, rather than pushed back onto the stream and hoped for. The
         * relay starts forwarding the moment it pairs two sides, so the peer's
         * first frame regularly arrives in the same chunk as the word that they
         * are paired — and a socket with its listener removed keeps reading into
         * nothing, so putting it back was a race rather than a fix.
         */
        // Stop the stream before handing it to the next reader. Bytes that
        // arrive after this callback but before that reader attaches otherwise
        // disappear into a flowing socket with no listener. The next reader
        // resumes it after attaching.
        socket.pause();
        socket.off('data', onData);
        clearTimeout(waiting);
        const alreadyRead = Buffer.concat([...got.slice(i + 1).map(framed), reader.rest]);
        return finish({ socket, alreadyRead });
      }
    };

    socket.once('connect', () => {
      socket.setNoDelay(true);
      socket.on('data', onData);
      socket.write(framed(Buffer.from(JSON.stringify({ ticket }))));
    });
  });
}

// Running this file directly starts a relay and nothing else.
if (process.argv[1] && process.argv[1].endsWith('relay.mjs')) {
  const running = start({ port: Number(process.env.PORT || RELAY_PORT) });
  process.stdout.write(`relay listening on ${running.port}\n`);
}
