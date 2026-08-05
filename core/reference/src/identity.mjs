/**
 * Identity and causal ordering.
 *
 * Every identity in this product must be globally unique and machine-independent,
 * because domain truth will one day travel between machines (Architecture §11.2).
 * That requirement is honoured here on day one even though no synchronisation exists.
 *
 * Two mechanisms:
 *   - ULID     : sortable, collision-free identifiers generated without coordination.
 *   - HLC      : a Hybrid Logical Clock, giving events an ordering that respects
 *                causality AND stays close to wall-clock time.
 *
 * Why an HLC rather than plain timestamps: two machines' clocks disagree. Plain
 * timestamps would let a later event sort before an earlier one it depended on,
 * which would make replay non-deterministic and merge unsound. Why not plain
 * logical counters: they lose all relationship to real time, so a human reading
 * the log could not tell when anything happened. An HLC gives both.
 */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Encode `value` as `length` Crockford base32 characters. */
function encodeBase32(value, length) {
  let out = '';
  for (let i = length - 1; i >= 0; i--) {
    out = CROCKFORD[value % 32n] + out;
    value /= 32n;
  }
  return out;
}

let lastUlidMs = 0n;
let lastUlidRandom = 0n;

/**
 * A ULID: 48 bits of milliseconds + 80 bits of randomness, base32 encoded.
 * Monotonic within a millisecond so identifiers minted in a tight loop still sort
 * in creation order.
 *
 * @param {number} [nowMs]
 * @returns {string} 26 characters
 */
export function ulid(nowMs = Date.now()) {
  const ms = BigInt(nowMs);
  if (ms === lastUlidMs) {
    lastUlidRandom += 1n;
  } else {
    lastUlidMs = ms;
    lastUlidRandom = randomBits80();
  }
  return encodeBase32(ms, 10) + encodeBase32(lastUlidRandom, 16);
}

function randomBits80() {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

/** @returns {boolean} */
export function isUlid(value) {
  return typeof value === 'string' && value.length === 26 &&
    [...value].every((c) => CROCKFORD.includes(c));
}

/**
 * A Hybrid Logical Clock.
 *
 * `wall` is milliseconds since epoch, never allowed to go backwards.
 * `counter` disambiguates events sharing a millisecond.
 */
export class Clock {
  #wall = 0;
  #counter = 0;
  #now;

  /** @param {() => number} [now] injectable for deterministic tests */
  constructor(now = Date.now) {
    this.#now = now;
  }

  /** Mint a timestamp for a locally originated event. */
  tick() {
    const physical = this.#now();
    if (physical > this.#wall) {
      this.#wall = physical;
      this.#counter = 0;
    } else {
      this.#counter += 1;
    }
    return { wall: this.#wall, counter: this.#counter };
  }

  /**
   * Absorb a timestamp observed from another machine, so that anything this
   * machine does next sorts after it. This is what makes the clock a *merge*
   * primitive rather than merely a local sequence.
   */
  observe(stamp) {
    const physical = this.#now();
    const wall = Math.max(physical, this.#wall, stamp.wall);
    if (wall === this.#wall && wall === stamp.wall) {
      this.#counter = Math.max(this.#counter, stamp.counter) + 1;
    } else if (wall === this.#wall) {
      this.#counter += 1;
    } else if (wall === stamp.wall) {
      this.#counter = stamp.counter + 1;
    } else {
      this.#counter = 0;
    }
    this.#wall = wall;
    return { wall: this.#wall, counter: this.#counter };
  }
}

/**
 * The total order used for replay.
 *
 * Deterministic on every machine, forever: wall, then counter, then origin
 * machine. The machine tiebreak is what guarantees two machines folding the
 * same set of events arrive at byte-identical state (Architecture §11.2,
 * "log-merge, not state-merge").
 *
 * @returns {number} negative if `a` sorts first
 */
export function compareEvents(a, b) {
  if (a.at.wall !== b.at.wall) return a.at.wall - b.at.wall;
  if (a.at.counter !== b.at.counter) return a.at.counter - b.at.counter;
  if (a.machine !== b.machine) return a.machine < b.machine ? -1 : 1;
  return 0;
}
