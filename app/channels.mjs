/**
 * Several conversations down one connection.
 *
 * A peer connection is one sealed pipe. Everything that wants to use it — a
 * question and its answer, a build's output coming back, a page being fetched
 * through it — would otherwise need its own connection, its own handshake and
 * its own agreement about who is speaking. Three of those is three protocols,
 * and three protocols is two that are wrong.
 *
 * So: one connection, many channels. Each frame says which channel it belongs
 * to and what kind of thing it is, and either end may open one.
 *
 *   [channel: 4 bytes][kind: 1 byte][length: 4 bytes][that many bytes]
 *
 * **Nothing here is encryption or authentication.** Both happened before this
 * saw anything — `peers.greet` proved who is at each end and agreed the key,
 * and `conversation` seals and opens every byte. This only decides which of
 * several things a byte belongs to, which is why it is small enough to read.
 */

import { PassThrough } from 'node:stream';

const OPEN = 1;
const DATA = 2;
const END = 3;
const FAILED = 4;

/** As much as one frame carries, so a channel cannot ask for a gigabyte. */
const MOST_IN_ONE = 256 * 1024;
/** How many may be open at once from one connection. */
const MOST_CHANNELS = 32;

const header = (channel, kind, length) => {
  const out = Buffer.alloc(9);
  out.writeUInt32BE(channel, 0);
  out[4] = kind;
  out.writeUInt32BE(length, 5);
  return out;
};

/**
 * Turn one conversation into many.
 *
 * Returns a way to open a channel and a way to be told about one somebody else
 * opened. Both ends do the same thing; the only asymmetry is that channels
 * opened from here are even-numbered and channels opened from there are odd, so
 * two ends opening at the same moment cannot collide on a number.
 */
export function channels(conversation, { odd = false } = {}) {
  const open = new Map();
  let next = odd ? 1 : 2;
  let onOpen = () => {};
  let shut = false;

  let held = Buffer.alloc(0);

  conversation.incoming.on('data', (chunk) => {
    held = held.length ? Buffer.concat([held, chunk]) : chunk;
    for (;;) {
      if (held.length < 9) return;
      const channel = held.readUInt32BE(0);
      const kind = held[4];
      const length = held.readUInt32BE(5);
      if (length > MOST_IN_ONE) return closeAll(new Error('a frame larger than anything this sends'));
      if (held.length < 9 + length) return;

      const body = held.subarray(9, 9 + length);
      held = held.subarray(9 + length);
      arrived(channel, kind, body);
    }
  });
  conversation.incoming.on('end', () => closeAll(null));
  conversation.incoming.on('error', (e) => closeAll(e));

  function arrived(channel, kind, body) {
    if (kind === OPEN) {
      if (open.size >= MOST_CHANNELS) return send(channel, FAILED, Buffer.from('too many'));
      const one = make(channel, String(body));
      open.set(channel, one);
      onOpen(one);
      return;
    }

    const one = open.get(channel);
    if (!one) return;

    if (kind === DATA) { one.incoming.write(body); return; }

    /**
     * They have finished talking, which is not the same as the channel closing.
     *
     * A channel carries a conversation, and most conversations have two halves:
     * a request goes one way and an answer comes back. Treating the end of the
     * first as the end of the channel meant a GET with no body closed the
     * channel the instant it was sent — and the answer, when it came, arrived
     * for a channel nobody was listening on any more and was dropped in
     * silence. Every preview waited thirty seconds and then gave up.
     *
     * So a channel goes when **both** ends have finished, or when either one
     * fails.
     */
    if (kind === END) {
      one.incoming.end();
      one.endedByThem = true;
      if (one.endedByMe) open.delete(channel);
      return;
    }
    if (kind === FAILED) {
      one.incoming.destroy(new Error(String(body) || 'that stopped'));
      open.delete(channel);
    }
  }

  const send = (channel, kind, body = Buffer.alloc(0)) => conversation
    .send(Buffer.concat([header(channel, kind, body.length), body]))
    .catch(() => closeAll(new Error('that connection is gone')));

  function make(channel, what) {
    const incoming = new PassThrough();
    return {
      channel,
      what,
      incoming,
      endedByMe: false,
      endedByThem: false,

      /** Send some bytes down this channel, in pieces it will carry. */
      async write(bytes) {
        const all = Buffer.from(bytes);
        for (let at = 0; at < all.length; at += MOST_IN_ONE) {
          await send(channel, DATA, all.subarray(at, Math.min(at + MOST_IN_ONE, all.length)));
        }
      },

      /** Pour a whole stream down it, and say when it has finished. */
      async pour(stream) {
        try {
          for await (const chunk of stream) await this.write(chunk);
          this.end();
        } catch (e) {
          await send(channel, FAILED, Buffer.from(String(e?.message ?? e).slice(0, 200)));
          open.delete(channel);
        }
      },

      /** Say there is no more from this end. The other half may still answer. */
      end() {
        if (this.endedByMe) return;
        this.endedByMe = true;
        send(channel, END);
        if (this.endedByThem) open.delete(channel);
      },
      fail: (why) => {
        send(channel, FAILED, Buffer.from(String(why ?? 'that stopped').slice(0, 200)));
        open.delete(channel);
      },
    };
  }

  function closeAll(why) {
    if (shut) return;
    shut = true;
    for (const one of open.values()) {
      if (why) one.incoming.destroy(why); else one.incoming.end();
    }
    open.clear();
  }

  return {
    /** Start a channel, saying what it is for. */
    async start(what) {
      if (shut) throw new Error('that connection is closed');
      if (open.size >= MOST_CHANNELS) throw new Error('too many things at once on one connection');
      const channel = next;
      next += 2;
      const one = make(channel, what);
      open.set(channel, one);
      await send(channel, OPEN, Buffer.from(String(what)));
      return one;
    },

    /** Be told when the other end starts one. */
    whenOpened(fn) { onOpen = fn; },

    get howMany() { return open.size; },
    close: () => closeAll(null),
  };
}

export const __testOnly = { OPEN, DATA, END, FAILED, MOST_IN_ONE, MOST_CHANNELS };
