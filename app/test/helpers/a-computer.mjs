/**
 * A second Viberant, as its own process.
 *
 * A device identity belongs to an installation, and two of them inside one
 * process would share a module and therefore share a key — which is not two
 * computers, it is one computer talking to itself. So a test that needs a
 * second computer starts one, with its own home folder, and asks it to do
 * things over the channel a parent and child process already have.
 *
 * Everything it does is the real code. Nothing here is a stand-in.
 */

import * as device from '../../device.mjs';
import * as peers from '../../peers.mjs';
import * as relay from '../../relay.mjs';
import * as parcel from '../../parcel.mjs';
import * as channelsOf from '../../channels.mjs';
import * as syncing from '../../sync.mjs';

const say = (id, body) => process.send?.({ id, ...body });

process.on('message', async (asked) => {
  const { id, what } = asked;
  try {
    if (what === 'card') return say(id, { ok: true, card: await device.card() });

    if (what === 'whatIsHere') {
      const held = await parcel.whatIsAlreadyHere(asked.into, { forOffer: asked.forOffer ?? null });
      return say(id, { ok: true, have: held?.have ?? null });
    }

    /**
     * Wait on the relay, take whatever arrives, and put it where told.
     *
     * The same unwrap every other transfer uses, with resuming on when asked
     * for — so what this proves is that the ordinary path works over a relay,
     * not that some special remote path does.
     */
    if (what === 'receive') {
      const joined = await relay.dialRelay({
        host: '127.0.0.1', port: asked.relayPort, ticket: asked.ticket,
      });
      if (!joined) return say(id, { ok: false, why: 'the relay did not join us' });

      const known = await peers.greet(joined.socket, { alreadyRead: joined.alreadyRead });
      if (!known) return say(id, { ok: false, why: 'the handshake did not finish' });

      const peer = peers.conversation(joined.socket, { ...known, kind: peers.RELAY });

      const held = asked.resume
        ? await parcel.whatIsAlreadyHere(asked.into, { forOffer: asked.forOffer ?? null })
        : null;

      const out = await parcel.unwrap(peers.poured(peer), asked.into, {
        keep: asked.keep === true,
        forOffer: asked.forOffer ?? null,
        have: held,
      });

      peer.close();
      return say(id, {
        ok: out.ok,
        resumable: out.resumable ?? false,
        have: out.have ?? 0,
        carriedOver: out.carriedOver ?? 0,
        files: out.files ?? 0,
        bytes: out.bytes ?? 0,
        sentence: out.sentence ?? null,
      });
    }

    /**
     * Wait on the relay and serve a sync: work out what the asker is missing
     * and send only that. The far half of the real thing, in a real process.
     */
    if (what === 'serveSync') {
      const joined = await relay.dialRelay({
        host: '127.0.0.1', port: asked.relayPort, ticket: asked.ticket,
      });
      if (!joined) return say(id, { ok: false, why: 'the relay did not join us' });

      const known = await peers.greet(joined.socket, { alreadyRead: joined.alreadyRead });
      if (!known) return say(id, { ok: false, why: 'the handshake did not finish' });

      const peer = peers.conversation(joined.socket, { ...known, kind: peers.RELAY });
      const post = channelsOf.channels(peer, { odd: true });

      post.whenOpened(async (channel) => {
        if (!channel.what.startsWith('sync:')) return channel.fail('not that');
        const out = await syncing.serve({ channel, dir: asked.dir, everything: false });
        say(id, { ok: true, ...out });
      });
      return;
    }

    say(id, { ok: false, why: `nothing here does ${what}` });
  } catch (e) {
    say(id, { ok: false, why: String(e?.message ?? e) });
  }
});

process.send?.({ id: 0, ready: true });
