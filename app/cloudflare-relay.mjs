/**
 * A secure WebSocket made to look like the byte stream the peer protocol
 * already uses.
 *
 * Cloudflare never sees a different protocol: after two holders of the same
 * one-use ticket are paired, every binary message is an arbitrary run of the
 * existing end-to-end encrypted stream. Framing, identity checks, sync,
 * resumable transfers and conflicts therefore remain exactly where they are.
 */
import { Duplex } from 'node:stream';

const OPEN = 1;
const MOST_BUFFERED = 1024 * 1024;

function dataBytes(data) {
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(data);
}

class WebSocketDuplex extends Duplex {
  constructor(socket) {
    super();
    this.socket = socket;
    this.endedByPeer = false;

    this.onMessage = (event) => {
      if (typeof event.data === 'string') return;
      try { this.push(dataBytes(event.data)); } catch { this.destroy(); }
    };
    this.onClose = () => {
      this.endedByPeer = true;
      this.push(null);
    };
    this.onError = () => this.destroy();
    socket.addEventListener('message', this.onMessage);
    socket.addEventListener('close', this.onClose);
    socket.addEventListener('error', this.onError);
  }

  _read() { /* WebSocket delivery is already event driven. */ }

  _write(chunk, _encoding, done) {
    if (this.socket.readyState !== OPEN) return done(new Error('the relay connection closed'));
    try { this.socket.send(Buffer.from(chunk)); } catch (error) { return done(error); }

    // Do not let a fast disk turn an interrupted network into unbounded RAM.
    const finishWhenDrained = () => {
      if (this.socket.readyState !== OPEN) return done(new Error('the relay connection closed'));
      if (Number(this.socket.bufferedAmount || 0) <= MOST_BUFFERED) return done();
      const timer = setTimeout(finishWhenDrained, 5);
      timer.unref?.();
    };
    finishWhenDrained();
  }

  _final(done) {
    if (this.socket.readyState === OPEN) this.socket.close(1000, 'finished');
    done();
  }

  _destroy(error, done) {
    this.socket.removeEventListener('message', this.onMessage);
    this.socket.removeEventListener('close', this.onClose);
    this.socket.removeEventListener('error', this.onError);
    if (!this.endedByPeer && this.socket.readyState < 2) {
      try { this.socket.close(1000, 'closed'); } catch { /* already closing */ }
    }
    done(error);
  }

  // The peer code also speaks to net.Socket. These are harmless equivalents.
  setNoDelay() { return this; }
  setTimeout() { return this; }
}

/** Join the hibernating Cloudflare relay pair for one control-plane ticket. */
export function dialWebSocketRelay({ url, ticket, within = 60_000, WebSocketClass = globalThis.WebSocket }) {
  return new Promise((done) => {
    if (typeof WebSocketClass !== 'function') return done(null);
    let address;
    try {
      address = new URL(url);
      const local = ['127.0.0.1', 'localhost', '::1'].includes(address.hostname);
      if (address.protocol !== 'wss:' && !(address.protocol === 'ws:' && local)) return done(null);
      address.searchParams.set('ticket', ticket);
    } catch { return done(null); }

    let socket;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.removeEventListener?.('message', onMessage);
      socket?.removeEventListener?.('close', onClose);
      socket?.removeEventListener?.('error', onClose);
      done(value);
    };
    const onClose = () => finish(null);
    const onMessage = (event) => {
      if (typeof event.data !== 'string') return;
      let said;
      try { said = JSON.parse(event.data); } catch { return; }
      if (said?.waiting) return;
      if (!said?.joined) { try { socket.close(); } catch { /* already closed */ } return finish(null); }
      const stream = new WebSocketDuplex(socket);
      return finish({ socket: stream, alreadyRead: Buffer.alloc(0) });
    };
    const timer = setTimeout(() => {
      try { socket?.close?.(1000, 'timed out'); } catch { /* already closed */ }
      finish(null);
    }, within);
    timer.unref?.();

    try {
      socket = new WebSocketClass(address.toString());
      socket.binaryType = 'arraybuffer';
      socket.addEventListener('message', onMessage);
      socket.addEventListener('close', onClose);
      socket.addEventListener('error', onClose);
    } catch { finish(null); }
  });
}

export const __testOnly = { WebSocketDuplex };
