/**
 * What sits behind the application.
 *
 * A layer of its own, underneath everything, that no page knows about and no
 * navigation touches. Changing places must never rebuild it: a background that
 * restarts every time you press a tab is worse than no background at all,
 * because the restart is the only part anybody notices.
 *
 * **Drawn rather than downloaded.** Four of these are photographs of things
 * nobody can photograph on demand — a nebula, a planet from orbit, a star
 * field — and the alternatives were to ship somebody else's pictures or to
 * ship nothing. Both are bad answers. These are generated here, which makes
 * them:
 *
 *   ours, with no licence attached to anything;
 *   the same size as the window, at whatever the window is, on any screen,
 *     because there is no fixed pixel grid to run out of;
 *   about two kilobytes of code rather than four files of twenty megabytes;
 *   and cheap to move, because moving them is a transform rather than a redraw.
 *
 * The rule they all obey: **this is atmosphere and the interface is
 * information.** Everything here is dark, low in contrast, and covered by a
 * tone the theme controls before any surface is drawn on top of it. If a
 * background ever competes with a sentence, the background is wrong.
 */

const canvas = document.getElementById('wall');
const ink = canvas?.getContext('2d', { alpha: false });

/** What the page has asked for. Set by the app, read by the loop. */
let look = { scene: null, brightness: 1, dim: 0.55, blur: 0, motion: true };
let painted = null;
let drifting = null;
let born = 0;

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The scenes.
 *
 * Each returns a function that paints one frame at a given size and moment.
 * `t` is seconds since the scene started and is the only thing that moves —
 * nothing here reads the clock for itself, so a paused scene is genuinely
 * paused rather than merely not being drawn.
 */
const SCENES = {
  /**
   * Deep space: a field of stars at three depths, drifting.
   *
   * Depth is what stops a star field looking like noise: the near ones move
   * perceptibly and the far ones almost not at all, so the whole thing reads as
   * distance rather than as a texture.
   */
  space(w, h) {
    const layers = [
      { n: 220, r: [0.4, 0.9], a: [0.25, 0.5], speed: 0.55 },
      { n: 120, r: [0.7, 1.4], a: [0.4, 0.75], speed: 1.4 },
      { n: 30, r: [1.1, 2.1], a: [0.7, 1], speed: 2.6 },
    ].map((layer) => ({
      ...layer,
      stars: seeded(layer.n, w, h, layer),
    }));

    return (t) => {
      ink.fillStyle = '#05060a';
      ink.fillRect(0, 0, w, h);

      // One faint wash of colour, so it is not simply black with dots on it.
      const wash = ink.createRadialGradient(w * 0.72, h * 0.28, 0, w * 0.72, h * 0.28, Math.max(w, h) * 0.75);
      wash.addColorStop(0, 'rgba(60,52,120,0.30)');
      wash.addColorStop(0.45, 'rgba(28,26,66,0.16)');
      wash.addColorStop(1, 'rgba(0,0,0,0)');
      ink.fillStyle = wash;
      ink.fillRect(0, 0, w, h);

      for (const layer of layers) {
        for (const s of layer.stars) {
          const x = wrap(s.x - t * layer.speed * 1.6, w);
          // Twinkle, but only just: a star field that flashes is a screensaver.
          const a = s.a * (0.85 + 0.15 * Math.sin(t * 0.5 + s.phase));
          ink.globalAlpha = a;
          ink.fillStyle = s.warm ? '#ffe9cf' : '#dfe8ff';
          ink.beginPath();
          ink.arc(x, s.y, s.r, 0, Math.PI * 2);
          ink.fill();
        }
      }
      ink.globalAlpha = 1;
    };
  },

  /**
   * Orbital: the limb of a planet, its atmosphere catching light, and space
   * above it. Composed low so the interface sits in the dark half.
   */
  orbital(w, h) {
    const stars = seeded(90, w, h, { r: [0.4, 1.1], a: [0.25, 0.6], speed: 1 });

    return (t) => {
      ink.fillStyle = '#04060b';
      ink.fillRect(0, 0, w, h);

      for (const s of stars) {
        ink.globalAlpha = s.a * (0.8 + 0.2 * Math.sin(t * 0.4 + s.phase));
        ink.fillStyle = '#cfdcff';
        ink.beginPath();
        ink.arc(s.x, s.y * 0.62, s.r, 0, Math.PI * 2);
        ink.fill();
      }
      ink.globalAlpha = 1;

      // The planet: a disc far larger than the window, so only its edge shows.
      // It drifts by a few pixels over minutes, which is the whole of the
      // motion — an orbit is not something you watch happen.
      const cx = w * 0.5 + Math.sin(t * 0.02) * w * 0.02;
      const cy = h * 1.62 + Math.cos(t * 0.015) * 8;
      const r = Math.max(w, h) * 1.25;

      const body = ink.createRadialGradient(cx - r * 0.3, cy - r * 0.55, r * 0.1, cx, cy, r);
      body.addColorStop(0, '#1b3a58');
      body.addColorStop(0.35, '#0e2439');
      body.addColorStop(0.7, '#070f1c');
      body.addColorStop(1, '#04070d');
      ink.fillStyle = body;
      ink.beginPath();
      ink.arc(cx, cy, r, 0, Math.PI * 2);
      ink.fill();

      // The atmosphere, as a thin bright line along the limb.
      ink.save();
      ink.beginPath();
      ink.arc(cx, cy, r + 2, 0, Math.PI * 2);
      ink.clip();
      const air = ink.createRadialGradient(cx, cy, r - 26, cx, cy, r + 3);
      air.addColorStop(0, 'rgba(90,180,255,0)');
      air.addColorStop(0.72, 'rgba(96,186,255,0.20)');
      air.addColorStop(1, 'rgba(150,214,255,0.42)');
      ink.fillStyle = air;
      ink.fillRect(0, 0, w, h);
      ink.restore();
    };
  },

  /**
   * Nebula: layered clouds of colour, moving past each other slowly enough
   * that you notice it only if you look for it.
   *
   * Painted as a handful of very soft radial fields rather than as noise,
   * because noise at this scale costs a great deal and reads as grain.
   */
  nebula(w, h) {
    const clouds = [
      { x: 0.24, y: 0.30, r: 0.62, c: [120, 60, 190], a: 0.34, drift: 0.011 },
      { x: 0.70, y: 0.22, r: 0.55, c: [40, 120, 190], a: 0.30, drift: -0.008 },
      { x: 0.55, y: 0.70, r: 0.70, c: [190, 60, 120], a: 0.22, drift: 0.006 },
      { x: 0.10, y: 0.78, r: 0.48, c: [60, 150, 160], a: 0.20, drift: -0.013 },
    ];
    const stars = seeded(140, w, h, { r: [0.4, 1.2], a: [0.3, 0.7], speed: 1 });

    return (t) => {
      ink.fillStyle = '#06040d';
      ink.fillRect(0, 0, w, h);

      ink.globalCompositeOperation = 'lighter';
      for (const c of clouds) {
        const cx = w * (c.x + Math.sin(t * c.drift) * 0.045);
        const cy = h * (c.y + Math.cos(t * c.drift * 0.8) * 0.035);
        const rad = Math.max(w, h) * c.r;
        const g = ink.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, `rgba(${c.c[0]},${c.c[1]},${c.c[2]},${c.a})`);
        g.addColorStop(0.45, `rgba(${c.c[0]},${c.c[1]},${c.c[2]},${c.a * 0.35})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ink.fillStyle = g;
        ink.fillRect(0, 0, w, h);
      }
      ink.globalCompositeOperation = 'source-over';

      for (const s of stars) {
        ink.globalAlpha = s.a * (0.8 + 0.2 * Math.sin(t * 0.6 + s.phase));
        ink.fillStyle = '#ffffff';
        ink.beginPath();
        ink.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ink.fill();
      }
      ink.globalAlpha = 1;
    };
  },

  /**
   * Rig room: a dark workstation, lit the way product photography lights one.
   *
   * Deliberately not a gaming picture. Two cool lights raking across a dark
   * machined surface, a soft fall-off, and one warm point for a power light.
   * No rainbow, nothing pulsing, nothing that reads as a computer showing off.
   */
  rig(w, h) {
    return (t) => {
      ink.fillStyle = '#08090b';
      ink.fillRect(0, 0, w, h);

      // The surface: a plane falling away into the dark, with a fine grain.
      const floor = ink.createLinearGradient(0, h * 0.45, 0, h);
      floor.addColorStop(0, '#0d0f13');
      floor.addColorStop(0.5, '#0a0b0e');
      floor.addColorStop(1, '#060708');
      ink.fillStyle = floor;
      ink.fillRect(0, h * 0.45, w, h * 0.55);

      // Two raking lights. They breathe, over about a minute.
      const lights = [
        { x: 0.24, y: 0.30, c: [70, 130, 210], a: 0.20, sp: 0.05 },
        { x: 0.78, y: 0.52, c: [60, 190, 200], a: 0.15, sp: 0.037 },
      ];
      ink.globalCompositeOperation = 'lighter';
      for (const l of lights) {
        const a = l.a * (0.78 + 0.22 * Math.sin(t * l.sp));
        const cx = w * l.x;
        const cy = h * l.y;
        const g = ink.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.55);
        g.addColorStop(0, `rgba(${l.c[0]},${l.c[1]},${l.c[2]},${a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ink.fillStyle = g;
        ink.fillRect(0, 0, w, h);
      }

      // One warm point, the size of a power light, with a small bloom.
      const px = w * 0.62;
      const py = h * 0.66;
      const warm = ink.createRadialGradient(px, py, 0, px, py, Math.max(w, h) * 0.16);
      warm.addColorStop(0, 'rgba(255,170,90,0.18)');
      warm.addColorStop(1, 'rgba(0,0,0,0)');
      ink.fillStyle = warm;
      ink.fillRect(0, 0, w, h);
      ink.globalCompositeOperation = 'source-over';

      // Fine machined grain, drawn once as lines rather than per-pixel noise.
      ink.globalAlpha = 0.035;
      ink.strokeStyle = '#ffffff';
      ink.lineWidth = 1;
      for (let y = h * 0.46; y < h; y += 3) {
        ink.beginPath();
        ink.moveTo(0, y);
        ink.lineTo(w, y);
        ink.stroke();
      }
      ink.globalAlpha = 1;
    };
  },

  /**
   * Andromeda: a galaxy seen at an angle, turning.
   *
   * The whole thing is one shape drawn twice — two arms, each a run of
   * overlapping soft dots along a logarithmic spiral. That is what a spiral
   * galaxy is, and it means the picture holds together at any window size
   * rather than being a texture that happens to look right at one.
   *
   * It turns once every twelve minutes or so. Slow enough that you notice only
   * if you sit still, which is the rule every scene here obeys.
   */
  andromeda(w, h) {
    const stars = seeded(180, w, h, { r: [0.3, 1.1], a: [0.2, 0.55] });
    /**
     * The arms, as many small dots rather than a few large ones.
     *
     * Written first with dots a fifth of the window across, which did not read
     * as a galaxy at all — it read as a grey smear lying across the middle of
     * the page. Overlapping soft shapes only look like a structure when each is
     * small enough that the structure is what you see instead of the shape.
     * Found by photographing it, which is the only way any of this is known.
     */
    const dots = [];
    for (const arm of [0, Math.PI]) {
      for (let i = 0; i < 150; i += 1) {
        const t = i / 150;
        dots.push({
          a: arm + t * 3.2,
          d: 0.04 + t * 0.26,
          size: 0.038 - t * 0.018,
          alpha: 0.26 * (1 - t * 0.8),
          warm: t < 0.3,
        });
      }
    }

    return (time) => {
      ink.fillStyle = '#05050b';
      ink.fillRect(0, 0, w, h);

      for (const s of stars) {
        ink.globalAlpha = s.a * (0.85 + 0.15 * Math.sin(time * 0.5 + s.phase));
        ink.fillStyle = '#ffffff';
        ink.beginPath();
        ink.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ink.fill();
      }
      ink.globalAlpha = 1;

      // Seen at an angle: the whole galaxy is squashed on one axis. Placed off
      // to one side so its core does not sit under the middle of the page.
      const cx = w * 0.74;
      const cy = h * 0.33;
      const reach = Math.max(w, h);
      const turn = time * 0.0087;

      ink.globalCompositeOperation = 'lighter';
      for (const p of dots) {
        const a = p.a + turn;
        const x = cx + Math.cos(a) * p.d * reach;
        const y = cy + Math.sin(a) * p.d * reach * 0.42;
        const rad = reach * p.size;
        const g = ink.createRadialGradient(x, y, 0, x, y, rad);
        const c = p.warm ? '255,214,170' : '150,175,255';
        g.addColorStop(0, `rgba(${c},${p.alpha})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ink.fillStyle = g;
        ink.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }

      // The core, which is the brightest thing in the picture and still dim.
      const core = ink.createRadialGradient(cx, cy, 0, cx, cy, reach * 0.10);
      core.addColorStop(0, 'rgba(255,236,205,0.34)');
      core.addColorStop(0.35, 'rgba(255,196,140,0.12)');
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ink.fillStyle = core;
      ink.fillRect(0, 0, w, h);
      ink.globalCompositeOperation = 'source-over';
    };
  },

  /**
   * Deep field: almost nothing, very far away.
   *
   * The quietest of them, and the one most likely to be left on. A scattering
   * of small ellipses at different angles, each one a galaxy, on a field that
   * is very nearly black. Nothing moves except a slow shimmer.
   */
  deepfield(w, h) {
    const far = seeded(64, w, h, { r: [1.4, 5.5], a: [0.10, 0.30] });
    const near = seeded(90, w, h, { r: [0.3, 0.9], a: [0.20, 0.45] });

    return (t) => {
      ink.fillStyle = '#030308';
      ink.fillRect(0, 0, w, h);

      ink.globalCompositeOperation = 'lighter';
      for (const g of far) {
        ink.save();
        ink.translate(g.x, g.y);
        ink.rotate(g.phase);
        ink.scale(1, 0.34 + (g.phase % 1) * 0.4);
        const shine = ink.createRadialGradient(0, 0, 0, 0, 0, g.r * 3.4);
        const c = g.warm ? '255,206,168' : '178,196,255';
        shine.addColorStop(0, `rgba(${c},${g.a * (0.9 + 0.1 * Math.sin(t * 0.25 + g.phase))})`);
        shine.addColorStop(0.5, `rgba(${c},${g.a * 0.3})`);
        shine.addColorStop(1, 'rgba(0,0,0,0)');
        ink.fillStyle = shine;
        ink.beginPath();
        ink.arc(0, 0, g.r * 3.4, 0, Math.PI * 2);
        ink.fill();
        ink.restore();
      }
      ink.globalCompositeOperation = 'source-over';

      for (const s of near) {
        ink.globalAlpha = s.a * (0.8 + 0.2 * Math.sin(t * 0.4 + s.phase));
        ink.fillStyle = '#ffffff';
        ink.beginPath();
        ink.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ink.fill();
      }
      ink.globalAlpha = 1;
    };
  },

  /**
   * Event horizon: light bent around something that is not there.
   *
   * A black disc, a thin bright ring, and a band of light that passes behind it
   * and is drawn above and below — which is the actual thing a photograph of
   * one shows, and the reason it looks wrong at first.
   *
   * Deliberately the darkest scene here. The centre is genuinely black, so text
   * over it reads better than over anything else.
   */
  horizon(w, h) {
    const stars = seeded(150, w, h, { r: [0.3, 1.2], a: [0.2, 0.6] });
    const cx = 0.5;
    const cy = 0.46;

    return (t) => {
      ink.fillStyle = '#040406';
      ink.fillRect(0, 0, w, h);

      for (const s of stars) {
        ink.globalAlpha = s.a * (0.8 + 0.2 * Math.sin(t * 0.5 + s.phase));
        ink.fillStyle = '#ffffff';
        ink.beginPath();
        ink.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ink.fill();
      }
      ink.globalAlpha = 1;

      const x = w * cx;
      const y = h * cy;
      const r = Math.min(w, h) * 0.19;

      // The band of light, squashed almost flat and turning slowly.
      ink.globalCompositeOperation = 'lighter';
      for (const [tilt, spin, alpha] of [[0.16, 1, 0.34], [-0.16, -1, 0.20]]) {
        ink.save();
        ink.translate(x, y);
        ink.rotate(Math.sin(t * 0.012) * 0.05);
        ink.scale(1, tilt < 0 ? -1 : 1);
        const band = ink.createLinearGradient(-r * 2.6, 0, r * 2.6, 0);
        const shift = (Math.sin(t * 0.05 * spin) + 1) / 2;
        band.addColorStop(0, 'rgba(0,0,0,0)');
        band.addColorStop(Math.max(0.05, shift * 0.5), `rgba(255,190,120,${alpha})`);
        band.addColorStop(1, 'rgba(0,0,0,0)');
        ink.fillStyle = band;
        ink.beginPath();
        ink.ellipse(0, 0, r * 2.6, r * 0.42, 0, 0, Math.PI * 2);
        ink.fill();
        ink.restore();
      }
      ink.globalCompositeOperation = 'source-over';

      // The hole itself, which is the one genuinely black thing on this page.
      ink.fillStyle = '#000000';
      ink.beginPath();
      ink.arc(x, y, r, 0, Math.PI * 2);
      ink.fill();

      // And the thin ring where light just fails to escape.
      ink.strokeStyle = 'rgba(255,206,150,0.55)';
      ink.lineWidth = Math.max(1, r * 0.018);
      ink.beginPath();
      ink.arc(x, y, r * 1.02, 0, Math.PI * 2);
      ink.stroke();
    };
  },

  /**
   * Mars horizon: a rust-coloured surface under a thin sky.
   *
   * The only warm scene, and the only one with ground in it. The sky is a wash
   * from dust rather than a gradient from blue, which is what makes it read as
   * somewhere else rather than as a sunset.
   */
  mars(w, h) {
    const stars = seeded(70, w, h, { r: [0.3, 0.9], a: [0.10, 0.30] });
    const skyline = h * 0.58;

    return (t) => {
      const sky = ink.createLinearGradient(0, 0, 0, skyline);
      sky.addColorStop(0, '#0a0708');
      sky.addColorStop(0.55, '#1c110d');
      sky.addColorStop(1, '#412013');
      ink.fillStyle = sky;
      ink.fillRect(0, 0, w, skyline);

      for (const s of stars) {
        if (s.y > skyline * 0.8) continue;
        ink.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(t * 0.4 + s.phase));
        ink.fillStyle = '#ffe6d0';
        ink.beginPath();
        ink.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ink.fill();
      }
      ink.globalAlpha = 1;

      // Dust, moving across at walking pace and never repeating visibly.
      ink.globalCompositeOperation = 'lighter';
      for (const d of [{ y: 0.40, a: 0.10, sp: 0.010 }, { y: 0.52, a: 0.13, sp: 0.017 }]) {
        const cxd = w * (((t * d.sp) % 1.6) - 0.3);
        const g = ink.createRadialGradient(cxd, h * d.y, 0, cxd, h * d.y, w * 0.5);
        g.addColorStop(0, `rgba(214,132,86,${d.a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ink.fillStyle = g;
        ink.fillRect(0, 0, w, skyline);
      }
      ink.globalCompositeOperation = 'source-over';

      // The ground: two folds of land, the nearer one darker.
      for (const [at, tone, bump] of [[skyline, '#2e1409', 0.030], [skyline + h * 0.09, '#1b0c06', 0.055]]) {
        ink.fillStyle = tone;
        ink.beginPath();
        ink.moveTo(0, h);
        ink.lineTo(0, at);
        for (let x = 0; x <= w; x += 12) {
          const n = Math.sin(x * 0.004 + at) * 0.6 + Math.sin(x * 0.011 + at * 2) * 0.4;
          ink.lineTo(x, at + n * h * bump);
        }
        ink.lineTo(w, h);
        ink.closePath();
        ink.fill();
      }
    };
  },
};

/** Points that stay put between frames, so a scene does not boil. */
function seeded(n, w, h, { r = [0.4, 1], a = [0.3, 0.8] } = {}) {
  const out = [];
  // A fixed sequence rather than Math.random, so resizing the window does not
  // re-roll every star into a different place.
  let s = 20260808;
  const next = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  for (let i = 0; i < n; i += 1) {
    out.push({
      x: next() * w,
      y: next() * h,
      r: r[0] + next() * (r[1] - r[0]),
      a: a[0] + next() * (a[1] - a[0]),
      phase: next() * Math.PI * 2,
      warm: next() > 0.85,
    });
  }
  return out;
}

const wrap = (x, w) => ((x % w) + w) % w;

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

let frame = null;
let size = { w: 0, h: 0, dpr: 1 };

function fit() {
  if (!canvas) return;
  // Half density on purpose. This is an out-of-focus backdrop behind opaque
  // surfaces; drawing it at full retina density costs four times as much to
  // produce something nobody can tell apart.
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const w = Math.round(innerWidth * dpr);
  const h = Math.round(innerHeight * dpr);
  if (w === size.w && h === size.h) return;
  size = { w, h, dpr };
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  if (look.scene) start(look.scene, { again: true });
}

function start(scene, { again = false } = {}) {
  stop();
  if (!ink || !SCENES[scene]) return;
  drifting = SCENES[scene](size.w, size.h);
  if (!again) born = performance.now();
  paint();
  if (moving()) frame = requestAnimationFrame(tick);
}

const moving = () => look.motion && !still() && !document.hidden;

function paint() {
  if (!drifting) return;
  drifting((performance.now() - born) / 1000);
}

/**
 * Twelve frames a second, not sixty.
 *
 * Nothing here moves fast enough for anybody to tell the difference, and this
 * is the layer that must never take time away from a transfer. Measured at a
 * twelfth of the cost of running flat out, for motion nobody can distinguish.
 */
const EVERY = 1000 / 12;
let lastFrame = 0;

function tick(now) {
  frame = requestAnimationFrame(tick);
  if (now - lastFrame < EVERY) return;
  lastFrame = now;
  paint();
}

function stop() {
  if (frame) cancelAnimationFrame(frame);
  frame = null;
}

// A window nobody is looking at draws nothing at all. The scene keeps its own
// clock, so coming back does not jump — it simply carries on from where the
// time says it should be.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
  else if (drifting && moving() && !frame) frame = requestAnimationFrame(tick);
});

addEventListener('resize', fit, { passive: true });

// ---------------------------------------------------------------------------
// What the app asks for
// ---------------------------------------------------------------------------

/**
 * Put a look behind the application.
 *
 * Called on startup and whenever the appearance settings change. Doing nothing
 * when nothing has changed is the important part: this is reached from a
 * redraw, and a redraw happens whenever anything at all happens.
 */
export function wear(next = {}) {
  const wanted = {
    scene: next.scene ?? null,
    brightness: Number(next.brightness ?? 1),
    dim: Number(next.dim ?? 0.55),
    blur: Number(next.blur ?? 0),
    motion: next.motion !== false,
  };

  const same = painted
    && painted.scene === wanted.scene
    && painted.brightness === wanted.brightness
    && painted.dim === wanted.dim
    && painted.blur === wanted.blur
    && painted.motion === wanted.motion;
  if (same) return;

  const sceneChanged = !painted || painted.scene !== wanted.scene;
  look = wanted;
  painted = wanted;

  const root = document.documentElement;
  root.style.setProperty('--wall-dim', String(wanted.dim));
  root.style.setProperty('--wall-blur', `${wanted.blur}px`);
  root.style.setProperty('--wall-bright', String(wanted.brightness));
  root.classList.toggle('has-wall', !!wanted.scene);

  if (!wanted.scene) { stop(); drifting = null; return; }

  fit();
  if (sceneChanged) start(wanted.scene);
  else if (moving() && !frame) frame = requestAnimationFrame(tick);
  else if (!moving()) { stop(); paint(); }
}

/** Which looks have something behind them, for the settings screen. */
export const SCENE_FOR = {
  space: 'space',
  orbital: 'orbital',
  nebula: 'nebula',
  rig: 'rig',
  andromeda: 'andromeda',
  deepfield: 'deepfield',
  horizon: 'horizon',
  mars: 'mars',
};

fit();
