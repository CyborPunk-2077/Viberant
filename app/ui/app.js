/**
 * The page.
 *
 * It holds no truth. Everything on screen came from the server a moment ago and
 * everything you press goes straight back to it. That is deliberate: if this
 * file kept its own idea of how things stand, it would eventually show you
 * something that is not true, and being believable is the whole product.
 *
 * The two exceptions are choices you have made but not yet acted on — which
 * account an app should open with, which folder it should open in. Those live
 * here until you press the button, because until then they have not happened.
 */

const $ = (s) => document.querySelector(s);
const view = $('#view');
const layer = $('#layer');

/**
 * Asking the server something, and telling it to do something.
 *
 * These used to be one function that decided which it was by whether you had
 * passed anything along with it. Every button whose errand needed no details —
 * clear the list, get the latest, join the workspace — therefore asked a
 * question where it meant to give an instruction, got nothing back, and did
 * nothing at all. Silently: the failure landed inside a promise nobody was
 * watching. Two functions, so the choice is made by the person writing the line
 * rather than by an accident of what they had to say.
 *
 * Neither ever throws. Anything that goes wrong comes back in the one shape
 * everything in this product uses, so a fault shows up as a sentence on the
 * screen rather than as a button that does nothing.
 */
async function reach(method, path, body) {
  let res;
  try {
    res = await fetch(path, method === 'POST'
      ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }
      : undefined);
  } catch {
    return {
      ok: false,
      sentence: 'The manager is not answering.',
      action: 'It may have stopped. Start Viberant again.',
    };
  }

  try {
    return await res.json();
  } catch {
    return {
      ok: false,
      sentence: 'Something went wrong here.',
      action: 'Try that again.',
    };
  }
}

const get = (path) => reach('GET', path);
const post = (path, body) => reach('POST', path, body);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ago = (at) => {
  if (!at) return '';
  const secs = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  return `${Math.floor(secs / 86400)} days ago`;
};

const size = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB`
  : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.round(bytes / 1e3)} KB`);

const tail = (path) => String(path ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '';

// ---------------------------------------------------------------------------
// The one place a sentence is shown
// ---------------------------------------------------------------------------

let said = null;
const say = (r) => { said = r && r.sentence ? r : null; return r; };

function saidHtml() {
  if (!said) return '';
  const tone = said.ok === false ? 'bad' : said.ok === true ? 'good' : '';
  return `<div class="said ${tone}"><b>${esc(said.sentence)}</b>${
    said.action ? `<span>${esc(said.action)}</span>` : ''}</div>`;
}

// ---------------------------------------------------------------------------
// Where we are
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'projects', name: 'Projects', glyph: '◳' },
  { id: 'apps', name: 'AI apps', glyph: '✦' },
  { id: 'terminals', name: 'Terminals', glyph: '❯' },
  { id: 'workspace', name: 'Workspace', glyph: '⌸' },
  { id: 'ship', name: 'Deploy', glyph: '↗' },
  { id: 'settings', name: 'Settings', glyph: '⚙' },
];

/**
 * The places, in groups.
 *
 * Six things in one undivided column is a list you read every time rather than
 * a shape you learn. Grouped, it is three short lists, and which group a place
 * is in says something true about it: the first three are where you start
 * something, the next two are where it leaves this computer, and the last is
 * where you change how the manager behaves. Settings stays a place of its own
 * rather than an icon in a corner, which is D-69 and still right.
 */
const GROUPS = [
  { name: 'Work', places: ['projects', 'apps', 'terminals'] },
  { name: 'Out into the world', places: ['workspace', 'ship'] },
  { name: 'This computer', places: ['settings'] },
];

/** The two behind the icons at the far end, out of the way of the daily five. */
const ASIDE = [
  { id: 'feedback', name: 'Tell us what is wrong', glyph: '✎' },
];

/** The mark. Drawn, not fetched — this app never reaches the network to draw itself. */
const LOGO = `
  <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
    <defs><linearGradient id="vb" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--vibe-a)"/><stop offset="1" stop-color="var(--vibe-b)"/>
    </linearGradient></defs>
    <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#vb)"/>
    <path d="M10 11.5 L16 21 L22 11.5" fill="none" stroke="rgba(255,255,255,.92)"
          stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

/**
 * The marks of the two services, as they are drawn everywhere else.
 *
 * A sign-in button that does not carry the mark people already know makes them
 * stop and read, which is the one thing a sign-in button must not do.
 */
const GITHUB_MARK = `
  <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="var(--ink)">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
      0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01
      1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95
      0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27
      2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82
      2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0
      .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
  </svg>`;

const ANTHROPIC_MARK = `
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="#d97757">
    <path d="M13.83 5h-3.2L4.6 19h3.3l1.2-3h6l1.2 3h3.3L13.83 5Zm-3.66 8.4 1.9-4.9 1.9 4.9h-3.8Z"/>
  </svg>`;

const OPENAI_MARK = `
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="#10a37f">
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3.2 5.2 3v6l-5.2 3-5.2-3v-6l5.2-3Zm0 2.3L8.8 9.4v5.2L12 16.5l3.2-1.9V9.4L12 7.5Z"/>
  </svg>`;

const MARKS = { github: () => GITHUB_MARK, google: () => GOOGLE_MARK, anthropic: () => ANTHROPIC_MARK, openai: () => OPENAI_MARK };

/** The badge for one way in: the real mark where there is one, a letter otherwise. */
const wayBadge = (w) => (MARKS[w.mark]
  ? `<span class="badge plain">${MARKS[w.mark]()}</span>`
  : `<span class="badge" style="background:${esc(w.tint)}">${esc(w.initial)}</span>`);

const GOOGLE_MARK = `
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 1.9-1.6 4.9-4.5 6.9l6.9 5.4c4.1-3.8 6.6-9.4 6.6-15.6z"/>
    <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8.1 41 15.4 46 24 46z"/>
    <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.1-5.5z"/>
    <path fill="#EA4335" d="M24 10.2c4.1 0 6.9 1.8 8.5 3.3l6.1-6C34.9 4 29.9 2 24 2 15.4 2 8.1 7 4.4 14.1l7.1 5.5C13.3 14.3 18.2 10.2 24 10.2z"/>
  </svg>`;

const at = { tab: 'projects', inside: false };
let me = { machine: null, machineName: '', github: null, google: null, workspace: {}, settings: {}, current: null };

/**
 * The name to put in the corner, and whether there is one at all.
 *
 * Two different accounts can be signed in and they mean different things:
 * GitHub is where a second copy of your work goes, Google is only a name. The
 * corner shows whichever you have, GitHub first, because that is the one the
 * rest of the app leans on.
 */
const signedInAs = () => me.github ?? me.google?.email ?? me.google?.name ?? null;

/** Choices made but not yet acted on. */
const chosen = { account: {}, folder: {} };

async function refreshMe() {
  me = await get('/me');
  const look = me.settings?.appearance ?? 'system';
  document.documentElement.dataset.theme = look === 'system' ? '' : look;
  drawNav();
}

/**
 * The account menu, at the foot of the rail.
 *
 * Everything to do with who you are, in one place: which accounts are on this
 * computer, switching between them, adding another, signing one out, and the
 * name your saved work is signed with. It says something useful whether or not
 * you are signed in — a menu that is empty when signed out is a menu that looks
 * broken.
 */
async function openWhoPanel() {
  const panel = $('#who-panel');
  const wasOpen = !panel.hidden;
  closePanels();
  if (wasOpen) return;

  panel.innerHTML = '<div class="head">GitHub</div><div class="pick"><span class="spin"></span> looking…</div>';
  panel.hidden = true;
  openPanel(panel);

  const g = await get('/github');
  const signedIn = (g.accounts ?? []).length > 0;

  // Two services, said apart, because they are not the same offer. GitHub is
  // where a second copy of your work goes. Google is a name and nothing else.
  // Rolling them into one list made both sound like the same half-promise.
  const mark = (svg) => `<span style="display:grid;place-items:center;width:1.1rem">${svg}</span>`;

  panel.innerHTML = `
    <div class="head">GitHub</div>
    ${signedIn ? g.accounts.map((a) => `
      <button class="pick ${a.active ? 'on' : ''}" data-gh-use="${esc(a.name)}">
        <span class="dot ${a.active ? 'live' : 'off'}"></span>
        <span class="grow"><b>${esc(a.name)}</b><br>
          <span class="sub">${a.active ? 'in use right now' : 'switch to this one'}</span></span>
      </button>`).join('')
    : `<div class="pick"><span class="sub">Not signed in. Your work stays on this
         computer until you are, and everything here still works without it.</span></div>`}

    <button class="pick" id="gh-add">
      ${mark(GITHUB_MARK)}
      <span class="grow">${signedIn ? 'Sign in to another account' : 'Sign in with GitHub'}
        <span class="sub">Opens your browser with a code.</span></span></button>

    ${g.active ? `<button class="pick" id="gh-out"><span>↷</span>
      <span class="grow">Sign ${esc(g.active)} out
        <span class="sub">On this computer only. You can sign back in from here.</span></span></button>` : ''}

    <div class="head">Google</div>
    ${me.google ? `
      <div class="pick on">
        <span class="dot live"></span>
        <span class="grow"><b>${esc(me.google.email ?? me.google.name ?? 'signed in')}</b><br>
          <span class="sub">a name on this computer, nothing more</span></span>
      </div>
      <button class="pick" id="google-out"><span>↷</span>
        <span class="grow">Sign out of Google
          <span class="sub">On this computer only.</span></span></button>` : `
      <button class="pick" id="gh-google">
        ${mark(GOOGLE_MARK)}
        <span class="grow">Sign in with Google
          <span class="sub">Puts your name on this computer. Not where work is kept.</span></span></button>`}

    <hr>
    <button class="pick" id="gh-name"><span>✎</span>
      <span class="grow">Your name on saved work
        <span class="sub">${esc(g.identity?.name || 'not set yet')}</span></span></button>`;

  for (const b of panel.querySelectorAll('[data-gh-use]')) {
    b.onclick = async () => {
      closePanels();
      say(await post('/github/switch', { name: b.dataset.ghUse }));
      await refreshMe();
      draw();
    };
  }

  $('#gh-add').onclick = () => { closePanels(); signInToGitHub(); };
  $('#gh-google')?.addEventListener('click', () => { closePanels(); signInToGoogle(); });
  $('#google-out')?.addEventListener('click', async () => {
    closePanels();
    say(await post('/google/signout'));
    await refreshMe();
    draw();
  });
  $('#gh-name').onclick = () => { closePanels(); identitySheet(g); };

  $('#gh-out')?.addEventListener('click', async () => {
    closePanels();
    const sure = await confirmThat({
      title: 'Sign out',
      what: `${g.active} will be signed out on this computer.`,
      why: 'Nothing on GitHub itself changes, and you can sign back in from this same menu.',
      confirm: 'Sign out',
      danger: true,
    });
    if (!sure) return;
    say(await post('/github/signout', { name: g.active }));
    await refreshMe();
    draw();
  });
}

/** The name every save is signed with. Asked for once, in two boxes. */
function identitySheet(g) {
  sheet({
    title: 'Your name on saved work',
    narrow: true,
    body: `
      <p class="sub">Everything you save is signed with this. It is not shown to anyone
        except people who look at the project itself.</p>
      <label class="field">Name</label>
      <input id="id-name" style="width:100%;margin-bottom:.8rem"
        value="${esc(g.identity?.name ?? '')}" placeholder="Your name">
      <label class="field">Email</label>
      <input id="id-mail" style="width:100%"
        value="${esc(g.identity?.email ?? '')}" placeholder="you@example.com">`,
    foot: '<button class="quiet" id="id-no">Never mind</button><button class="go" id="id-yes">Save</button>',
    onOpen: () => {
      $('#id-no').onclick = closeLayer;
      $('#id-yes').onclick = async () => {
        closeLayer();
        say(await post('/github/identity', { name: $('#id-name').value, email: $('#id-mail').value }));
        draw();
      };
    },
  });
}

const placeCalled = (id) => [...TABS, ...ASIDE].find((t) => t.id === id);

/** One place in the rail, drawn the same way wherever it appears. */
const railTab = (t) => `
  <button class="tab ${at.tab === t.id ? 'on' : ''}" data-tab="${t.id}"
    data-tip="${esc(t.name)}" data-key="${esc(shortcutFor(t.id) ?? '')}"
    ${at.tab === t.id ? 'aria-current="page"' : ''}>
    <span class="glyph" aria-hidden="true">${t.glyph}</span>
    <span class="label">${esc(t.name)}</span>
  </button>`;

function drawNav() {
  $('#nav').innerHTML = `
    <div class="rail">
      <div class="logo">${LOGO}<span class="wordmark">Viberant</span></div>

      ${GROUPS.map((g) => `
        <div class="group">
          <span class="label-tiny">${esc(g.name)}</span>
          <div class="places">${g.places.map((id) => railTab(placeCalled(id))).join('')}</div>
        </div>`).join('')}

      <div class="rest"></div>

      <div class="places">${ASIDE.map(railTab).join('')}</div>

      <div class="foot">
        <div class="drop">
          <button class="who" id="who" data-tip="${esc(signedInAs() ?? 'Not signed in')}">
            <span class="face">${signedInAs() ? esc(signedInAs().slice(0, 1).toUpperCase()) : '?'}</span>
            <span class="grow">
              <span class="name">${esc(signedInAs() ?? 'Not signed in')}</span>
              <span class="what">${esc(me.machineName || 'this computer')}</span>
            </span>
          </button>
          <div class="panel" hidden id="who-panel"></div>
        </div>
      </div>
    </div>`;

  for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => go(b.dataset.tab);
  $('#who').onclick = (e) => { e.stopPropagation(); openWhoPanel(); };

  drawTop();
}

/**
 * The bar across the work: where you are, and the way to everything by typing.
 *
 * Deliberately shallow and deliberately almost empty. A header is chrome — it
 * says where you are and gets out of the way. Anything that belongs to the page
 * belongs on the page, not up here.
 */
function drawTop() {
  const here = placeCalled(at.tab);
  const open = me.currentName;

  $('#top').innerHTML = `
    <nav class="crumb" aria-label="Where you are">
      <b class="here">${esc(here?.name ?? '')}</b>
      ${open ? `<span class="sep" aria-hidden="true">/</span>
        <span class="here" title="${esc(me.current ?? '')}">${esc(open)}</span>` : ''}
    </nav>
    <div class="rest"></div>
    <button class="seek" id="seek" data-tip="Find anything, or do anything" data-key="Ctrl K">
      <span aria-hidden="true">⌕</span>
      <span class="what">Search Viberant…</span>
      <span class="kbd">Ctrl K</span>
    </button>`;

  $('#seek').onclick = openPalette;
}

/**
 * Sand falling from the pointer.
 *
 * Grains are shed while the pointer moves, then fall the whole height of the
 * window under gravity, drifting a little on the way. Drawn on one canvas at
 * the screen's real pixel density, so on a sharp display they are sharp rather
 * than four soft blobs.
 *
 * The loop runs only while grains exist, so a still pointer costs nothing at
 * all. Off under reduced motion, and there is a switch in Settings.
 *
 * It carries no meaning. It never marks anything, never points at anything and
 * never indicates state — which is what keeps it decoration rather than a
 * notification, and is the only rule it has to obey.
 */
function shedGrains() {
  const canvas = $('#grains');
  if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ink = canvas.getContext('2d', { alpha: true });
  const grains = [];
  const MOST = 900;
  let running = false;
  let lastX = null;
  let lastY = null;
  let scale = 1;

  const fit = () => {
    // The real density of the screen, so a grain is a grain and not a smudge.
    scale = Math.min(devicePixelRatio || 1, 3);
    canvas.width = Math.round(innerWidth * scale);
    canvas.height = Math.round(innerHeight * scale);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ink.setTransform(scale, 0, 0, scale, 0, 0);
  };
  fit();
  addEventListener('resize', fit, { passive: true });

  const tint = () => {
    const style = getComputedStyle(document.documentElement);
    return [
      style.getPropertyValue('--vibe-b').trim() || '#22d3ee',
      style.getPropertyValue('--vibe-a').trim() || '#8b5cf6',
    ];
  };

  addEventListener('pointermove', (e) => {
    if (me.settings && me.settings.grains === false) return;

    const moved = lastX === null ? 0 : Math.hypot(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;

    // A slow drag sheds a trickle, a flick sheds a handful.
    const many = Math.min(9, 1 + Math.round(moved / 4));
    const colours = tint();

    for (let i = 0; i < many && grains.length < MOST; i++) {
      grains.push({
        x: e.clientX + (Math.random() - 0.5) * 10,
        y: e.clientY + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 0.3,
        vy: Math.random() * 0.35,
        // Sub-pixel sizes are what make it read as sand rather than as dots.
        r: 0.35 + Math.random() * 0.75,
        spin: (Math.random() - 0.5) * 0.05,
        drift: 0.3 + Math.random() * 0.7,
        life: 1,
        // Long enough to reach the bottom of the window from anywhere in it.
        fade: 0.0016 + Math.random() * 0.0022,
        colour: colours[Math.random() < 0.72 ? 0 : 1],
      });
    }
    if (!running) { running = true; requestAnimationFrame(fall); }
  }, { passive: true });

  let drifted = 0;

  function fall() {
    ink.clearRect(0, 0, innerWidth, innerHeight);
    drifted += 0.012;

    for (let i = grains.length - 1; i >= 0; i--) {
      const g = grains[i];

      g.vy += 0.033;
      g.vx += Math.sin(drifted + g.y * 0.012) * 0.006 * g.drift;
      g.vx *= 0.995;
      g.x += g.vx;
      g.y += g.vy;
      g.life -= g.fade;

      // Gone when it leaves the window or finally fades, whichever is first —
      // so a grain shed at the top is still visible at the bottom.
      if (g.life <= 0 || g.y > innerHeight + 4) { grains.splice(i, 1); continue; }

      ink.globalAlpha = Math.min(1, g.life) * 0.75;
      ink.fillStyle = g.colour;
      ink.beginPath();
      ink.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ink.fill();
    }
    ink.globalAlpha = 1;

    if (grains.length) requestAnimationFrame(fall);
    else { running = false; ink.clearRect(0, 0, innerWidth, innerHeight); }
  }
}

const SCREENS = {};

/**
 * The places whose contents are read down rather than across.
 *
 * Everything else is rows — a name, its facts, and what you can do about it —
 * and rows want the width of the monitor. These are sentences and controls, and
 * a line of prose the width of a 1920 screen is one nobody's eye can track back
 * from. It is the same page either way; only how far it is allowed to spread
 * changes.
 */
const READING = new Set(['settings', 'feedback']);

async function go(tab, { keepSaid = false } = {}) {
  at.tab = tab;
  if (!keepSaid) said = null;
  closePanels();
  view.classList.toggle('reading', READING.has(tab));
  drawNav();
  await draw();
}

// ---------------------------------------------------------------------------
// Everything by typing
//
// One field and a list. It is a way to reach what is already there and never a
// place anything lives only here — a thing you can do exclusively through a
// palette is a thing somebody who does not know it exists cannot do at all.
// ---------------------------------------------------------------------------

/** The places worth a key of their own, and the key. */
const SHORTCUTS = {
  projects: '1', apps: '2', terminals: '3', workspace: '4', ship: '5', settings: ',',
};
const shortcutFor = (id) => (SHORTCUTS[id] ? `Ctrl ${SHORTCUTS[id].toUpperCase()}` : null);

/**
 * Everything the palette can reach.
 *
 * Built fresh each time it opens rather than held, because half of it depends
 * on what is open right now, and a list that is quietly out of date is worse
 * than one that costs a millisecond to build.
 */
function everything() {
  const out = [];

  for (const t of [...TABS, ...ASIDE]) {
    out.push({
      group: 'Go to', glyph: t.glyph, what: t.name,
      key: shortcutFor(t.id), run: () => go(t.id),
    });
  }

  if (me.currentName) {
    out.push({
      group: 'This project', glyph: '◳', what: `Open ${me.currentName}`,
      where: 'projects', run: () => go('projects'),
    });
    out.push({
      group: 'This project', glyph: '↑', what: 'Save and send',
      run: async () => { await go('projects'); $('#save')?.click(); },
    });
  }

  // Only errands here. Every place is already above under "Go to", and listing
  // Settings twice makes the list longer without making anything reachable.
  out.push({ group: 'Do', glyph: '＋', what: 'Add a project', run: async () => { await go('projects'); $('#add')?.click(); } });
  out.push({ group: 'Do', glyph: '⟳', what: 'Check the other computers again', run: async () => { await go('workspace'); $('#w-refresh')?.click(); } });

  return out;
}

/** Everything whose words contain what was typed, in the order typed matters. */
function matching(all, typed) {
  const want = typed.trim().toLowerCase();
  if (!want) return all;
  return all
    .map((one) => {
      const words = `${one.what} ${one.group}`.toLowerCase();
      const at = words.indexOf(want);
      return at < 0 ? null : { ...one, rank: one.what.toLowerCase().startsWith(want) ? 0 : at + 1 };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank);
}

let paletteOpen = false;

function openPalette() {
  if (paletteOpen) return closeLayer();
  const all = everything();
  let shown = all;
  let on = 0;

  const list = () => {
    if (!shown.length) return '<div class="none">Nothing here by that name.</div>';
    const groups = [];
    for (const one of shown) {
      const last = groups[groups.length - 1];
      if (last && last.name === one.group) last.items.push(one);
      else groups.push({ name: one.group, items: [one] });
    }
    let n = -1;
    return groups.map((g) => `
      <div class="group">
        <span class="label-tiny">${esc(g.name)}</span>
        ${g.items.map((one) => {
    n += 1;
    return `<button class="hit ${n === on ? 'on' : ''}" data-hit="${n}" role="option" ${n === on ? 'aria-selected="true"' : ''}>
            <span class="glyph" aria-hidden="true">${one.glyph ?? '·'}</span>
            <span class="what">${esc(one.what)}</span>
            ${one.key ? `<span class="kbd">${esc(one.key)}</span>` : ''}
          </button>`;
  }).join('')}
      </div>`).join('');
  };

  layer.innerHTML = `
    <div class="veil">
      <div class="palette" role="dialog" aria-modal="true" aria-label="Search Viberant">
        <div class="ask">
          <span aria-hidden="true" style="color:var(--faint)">⌕</span>
          <input id="pal-ask" placeholder="Search Viberant…" autocomplete="off"
            role="combobox" aria-expanded="true" aria-controls="pal-found">
        </div>
        <div class="found" id="pal-found" role="listbox">${list()}</div>
        <footer>
          <span><span class="kbd">↑↓</span> move</span>
          <span><span class="kbd">↵</span> choose</span>
          <span><span class="kbd">Esc</span> close</span>
        </footer>
      </div>
    </div>`;
  paletteOpen = true;

  const found = $('#pal-found');
  const ask = $('#pal-ask');
  ask.focus();

  const repaint = () => {
    found.innerHTML = list();
    wire();
    found.querySelector('.hit.on')?.scrollIntoView({ block: 'nearest' });
  };

  const choose = async (n) => {
    const one = shown[n];
    if (!one) return;
    closeLayer();
    await one.run();
  };

  const wire = () => {
    for (const b of found.querySelectorAll('[data-hit]')) {
      b.onclick = () => choose(Number(b.dataset.hit));
      b.onmousemove = () => {
        const n = Number(b.dataset.hit);
        if (n === on) return;
        on = n;
        found.querySelector('.hit.on')?.classList.remove('on');
        b.classList.add('on');
      };
    }
  };
  wire();

  ask.oninput = () => { shown = matching(all, ask.value); on = 0; repaint(); };
  ask.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); on = Math.min(on + 1, shown.length - 1); repaint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); on = Math.max(on - 1, 0); repaint(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(on); }
    else if (e.key === 'Escape') { e.preventDefault(); closeLayer(); }
  };

  $('.veil').onclick = (e) => { if (e.target === $('.veil')) closeLayer(); };
}

// ---------------------------------------------------------------------------
// The keyboard
//
// One listener. There used to be two, with overlapping ideas about Escape, and
// the older one began `e.target.matches(...)` — which throws outright whenever
// the key was pressed with nothing focused, because the target is then the
// window and a window has no such thing. An exception inside a key handler
// surfaces nowhere a person would look, which is D-65's whole point and the
// fourth time this codebase has produced that exact shape.
//
// Nothing here takes a key the browser or Windows already means something by.
// Bare digits used to move between places, which meant typing a number
// anywhere outside a box teleported you; every shortcut now needs Ctrl, and
// every one of them is also reachable by pressing something.
// ---------------------------------------------------------------------------

/** Whether the keystroke belongs to a box somebody is typing in. */
const typing = (e) => {
  const el = e.target;
  return el instanceof HTMLElement
    && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    return openPalette();
  }

  if (e.key === 'Escape') {
    if (layer.innerHTML) return closeLayer();
    if (document.querySelector('.panel:not([hidden])')) return closePanels();
    if (at.inside) {
      at.inside = false;
      post('/close').then(refreshMe).then(() => draw());
    }
    return;
  }

  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || typing(e)) return;

  const place = Object.keys(SHORTCUTS).find((id) => SHORTCUTS[id] === e.key);
  if (place) { e.preventDefault(); go(place); }
});

// ---------------------------------------------------------------------------
// What a control means, on hover
//
// Only ever a name and a key — never the only place something is said, which
// is the rule that keeps a tooltip a convenience rather than a hiding place.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// A menu where the pointer is
//
// The same items a row's own overflow button opens, so right-clicking is a
// shortcut for people who expect it and never the only way to reach anything.
// A menu that exists only on right-click is a menu most people never find.
// ---------------------------------------------------------------------------

let ctxEl = null;

const closeCtx = () => { ctxEl?.remove(); ctxEl = null; };

/**
 * @param {{x:number,y:number}} where  In window coordinates.
 * @param {Array<{what:string,run:Function,danger?:boolean}|'-'>} items
 */
function menuAt(where, items) {
  closeCtx();
  closePanels();

  ctxEl = document.createElement('div');
  ctxEl.className = 'panel';
  ctxEl.setAttribute('role', 'menu');
  ctxEl.style.position = 'fixed';
  ctxEl.innerHTML = items.map((one, i) => (one === '-'
    ? '<hr>'
    : `<button class="pick ${one.danger ? 'danger' : ''}" role="menuitem" data-ctx="${i}">
         <span class="grow">${esc(one.what)}</span>
       </button>`)).join('');
  document.body.appendChild(ctxEl);

  // Measured at the moment of opening and placed where there is actually room,
  // which is D-57 — the answer is only knowable now.
  const room = ctxEl.getBoundingClientRect();
  ctxEl.style.left = `${Math.max(8, Math.min(where.x, innerWidth - room.width - 8))}px`;
  ctxEl.style.top = `${Math.max(8, Math.min(where.y, innerHeight - room.height - 8))}px`;

  const buttons = [...ctxEl.querySelectorAll('[data-ctx]')];
  for (const b of buttons) {
    b.onclick = () => { closeCtx(); items[Number(b.dataset.ctx)].run(); };
  }
  buttons[0]?.focus();

  ctxEl.onkeydown = (e) => {
    const n = buttons.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); buttons[Math.min(n + 1, buttons.length - 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); buttons[Math.max(n - 1, 0)]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeCtx(); }
  };
}

addEventListener('pointerdown', (e) => {
  if (ctxEl && !ctxEl.contains(e.target)) closeCtx();
}, true);
addEventListener('scroll', closeCtx, { passive: true, capture: true });

let tipTimer = null;
let tipEl = null;

const hideTip = () => { clearTimeout(tipTimer); tipEl?.remove(); tipEl = null; };

addEventListener('pointerover', (e) => {
  const on = e.target instanceof HTMLElement ? e.target.closest('[data-tip]') : null;
  if (!on) return;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => {
    // Only where the words are actually hidden. A button with its name written
    // on it does not need to be told what its name is.
    if (!on.isConnected) return;
    const label = on.querySelector('.label');
    if (label && getComputedStyle(label).display !== 'none' && !on.dataset.key) return;

    hideTip();
    const room = on.getBoundingClientRect();
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.innerHTML = `<span>${esc(on.dataset.tip)}</span>${
      on.dataset.key ? `<span class="kbd">${esc(on.dataset.key)}</span>` : ''}`;
    document.body.appendChild(tipEl);

    // Measured at the moment of opening and flipped where there is no room,
    // which is D-57 applied to something much smaller than a menu.
    const mine = tipEl.getBoundingClientRect();
    const left = Math.min(room.right + 8, innerWidth - mine.width - 8);
    tipEl.style.left = `${Math.max(8, left)}px`;
    tipEl.style.top = `${Math.max(8, Math.min(room.top + (room.height - mine.height) / 2, innerHeight - mine.height - 8))}px`;
  }, 380);
}, { passive: true });

addEventListener('pointerout', hideTip, { passive: true });
addEventListener('pointerdown', hideTip, { passive: true });
addEventListener('scroll', hideTip, { passive: true, capture: true });

/**
 * Draw the screen you are on.
 *
 * `quietly` is for the things that happen on a timer rather than because you
 * pressed something — a folder changing, another computer moving. Those used to
 * replace the whole page every few seconds, which is what the flicker was:
 * scroll position jumping, hover states dropping, the account menu closing
 * itself mid-reach.
 *
 * A timed redraw now builds the page off-screen first and only swaps it in if
 * what it says has actually changed. Nothing you pressed is ever deferred.
 */
let lastDrawn = '';

/**
 * The shape of what is coming, while it is still coming.
 *
 * Every screen here asks the manager something before it can draw, and until
 * now it drew nothing at all while it waited — so pressing a place did visibly
 * nothing for as long as that took. The Workspace tab was the worst of them at
 * two seconds (D-87 fixed the cause) but every one of them has a moment of it,
 * and a moment of nothing reads as the app being stuck rather than busy.
 *
 * Held back by a beat, deliberately. Anything that answers quickly should never
 * flash a skeleton on the way — that is a flicker being added in the name of
 * removing one. Below the threshold you see the page appear; above it you see
 * the shape of the page and then the page, which is the difference between
 * waiting and wondering.
 */
const HOLD_BACK = 120;

const skeleton = () => `
  <div class="skel" aria-hidden="true">
    <div class="line" style="width:11rem;height:18px;margin:0 0 .6rem"></div>
    <div class="line" style="width:24rem;max-width:100%;height:11px;margin:0 0 2rem"></div>
    <div class="lane">
      ${('<div class="row-skel"><div class="line" style="flex:1;max-width:16rem"></div>'
        + '<div class="line" style="width:4rem"></div></div>').repeat(4)}
    </div>
  </div>`;

async function draw({ quietly = false } = {}) {
  if (!quietly) {
    // Only if it is actually slow. Cleared the moment the real page is ready,
    // whether that is before or after this fires.
    // Compared against what was there when the wait began, so a screen that
    // draws in two stages is never overwritten by a skeleton arriving late.
    let drawn = false;
    const before = view.innerHTML;
    const waiting = setTimeout(() => {
      if (!drawn && view.innerHTML === before) view.innerHTML = skeleton();
    }, HOLD_BACK);

    try {
      await SCREENS[at.tab]?.();
    } finally {
      drawn = true;
      clearTimeout(waiting);
    }

    lastDrawn = view.innerHTML;
    paintNews();
    return;
  }

  const before = view.innerHTML;

  // Where you were, and what you were on, captured before anything is replaced.
  //
  // Rebuilding the page empties the one thing that scrolls, which collapses its
  // height, which makes the browser clamp how far down it is to zero. Then the
  // new page arrives and you are at the top. Nothing in here called `scrollTo`;
  // losing your place was a side effect of replacing the contents, and it
  // happened every time anything on screen changed at all — another computer
  // appearing, a transfer counting up, or just "3 min ago" becoming "4 min ago".
  const room = view.closest('main') ?? document.scrollingElement;
  const wasAt = room?.scrollTop ?? 0;
  const hadFocus = document.activeElement;
  const focusedId = hadFocus && hadFocus !== document.body ? hadFocus.id : null;

  await SCREENS[at.tab]?.();
  const after = view.innerHTML;

  // Nothing moved. Put the page back exactly as it was, so a scroll position
  // and a half-open menu survive a poll that had nothing to report.
  if (after === before) return;

  if (room && room.scrollTop !== wasAt) {
    // Clamped by the browser to whatever the new page allows, which is the
    // right answer when the page genuinely got shorter.
    room.scrollTop = wasAt;
  }
  if (focusedId) $(`#${focusedId}`)?.focus?.();

  lastDrawn = after;
  paintNews();
}

function closePanels() {
  for (const p of document.querySelectorAll('.panel')) {
    p.hidden = true;
    p.classList.remove('above', 'leftward');
  }
}

/**
 * Open a hanging panel where there is actually room for it.
 *
 * A menu that opens downward off the bottom of the window, or rightward off the
 * edge, is a menu you cannot use — and it happens to whichever card lands near
 * an edge, so it looks random. Measured once at the moment of opening, because
 * that is the only moment the answer is knowable.
 */
function openPanel(panel) {
  const wasOpen = !panel.hidden;
  closePanels();
  if (wasOpen) return;

  panel.hidden = false;
  const room = panel.getBoundingClientRect();

  if (room.bottom > innerHeight - 8) panel.classList.add('above');
  if (room.left < 8) panel.classList.add('leftward');
}

addEventListener('click', (e) => { if (!e.target.closest('.drop')) closePanels(); });

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

function closeLayer() { layer.innerHTML = ''; paletteOpen = false; }

function sheet({ title, body, foot = '', narrow = false, onOpen }) {
  layer.innerHTML = `
    <div class="veil">
      <div class="sheet ${narrow ? 'narrow' : ''}" role="dialog" aria-modal="true">
        <header><b>${esc(title)}</b><button class="quiet x" id="sheet-x">close</button></header>
        <div class="body" id="sheet-body">${body}</div>
        ${foot ? `<footer>${foot}</footer>` : ''}
      </div>
    </div>`;
  $('#sheet-x').onclick = closeLayer;
  layer.querySelector('.veil').onclick = (e) => { if (e.target === e.currentTarget) closeLayer(); };
  onOpen?.($('#sheet-body'));
}

/**
 * Ask for one line of text.
 *
 * The browser's own box for this does not exist inside the app's own window, so
 * asking for it would silently do nothing. This is that, in the app.
 */
function ask({ title, label, value = '', placeholder = '', confirm = 'Done' }) {
  return new Promise((resolve) => {
    sheet({
      title,
      narrow: true,
      body: `<label class="field">${esc(label)}</label>
             <input id="ask-input" style="width:100%" value="${esc(value)}" placeholder="${esc(placeholder)}">`,
      foot: `<button class="quiet" id="ask-no">Never mind</button>
             <button class="go" id="ask-yes">${esc(confirm)}</button>`,
      onOpen: () => {
        const input = $('#ask-input');
        input.focus();
        input.select();
        const done = (v) => { closeLayer(); resolve(v); };
        $('#ask-yes').onclick = () => done(input.value.trim() || null);
        $('#ask-no').onclick = () => done(null);
        input.onkeydown = (e) => {
          if (e.key === 'Enter') done(input.value.trim() || null);
          if (e.key === 'Escape') done(null);
        };
      },
    });
  });
}

function confirmThat({ title, what, why, confirm = 'Yes, do it', danger = false }) {
  return new Promise((resolve) => {
    sheet({
      title,
      narrow: true,
      body: `<p style="margin:0 0 .6rem">${esc(what)}</p>
             ${why ? `<p style="margin:0;color:var(--quiet);font-size:.89rem">${esc(why)}</p>` : ''}`,
      foot: `<button class="quiet" id="c-no">Never mind</button>
             <button class="${danger ? 'danger' : 'go'}" id="c-yes">${esc(confirm)}</button>`,
      onOpen: () => {
        $('#c-yes').onclick = () => { closeLayer(); resolve(true); };
        $('#c-no').onclick = () => { closeLayer(); resolve(false); };
      },
    });
  });
}

/** Pick a folder by clicking down to it, or by using the one Windows has. */
function pickFolder({ title = 'Choose a folder', confirm = 'Use this folder', startAt = null } = {}) {
  return new Promise((resolve) => {
    let herePath = null;

    const paint = async (path) => {
      const box = $('#walk-box');
      box.innerHTML = '<div class="item"><span class="spin"></span> looking…</div>';
      const r = await get(`/browse?at=${encodeURIComponent(path ?? '')}`);
      if (!r.ok) { box.innerHTML = `<div class="item">${esc(r.sentence)}</div>`; return; }

      herePath = r.at;
      $('#walk-here').textContent = r.at;
      $('#walk-up').disabled = !r.up;
      $('#walk-take').textContent = r.project ? `${confirm} ✓ a project` : confirm;
      box.innerHTML = r.folders.length
        ? r.folders.map((f) => `
            <div class="item" data-into="${esc(f.path)}">
              <span class="leaf">${f.project ? '◆' : '▸'}</span>
              <span class="grow">${esc(f.name)}</span>
              ${f.project ? '<span class="chip">a project</span>' : ''}
            </div>`).join('')
        : '<div class="item"><span class="leaf">·</span> nothing inside this one</div>';

      for (const item of box.querySelectorAll('[data-into]')) item.onclick = () => paint(item.dataset.into);
      $('#walk-up').onclick = () => paint(r.up);
    };

    sheet({
      title,
      body: `
        <div class="bar" id="walk-starts"></div>
        <div class="walk">
          <div class="here"><button class="quiet small" id="walk-up">↑ up</button><span id="walk-here"></span></div>
          <div class="list" id="walk-box"></div>
        </div>`,
      foot: `<button class="quiet" id="walk-native">Use the Windows folder chooser</button>
             <button class="quiet" id="walk-no">Never mind</button>
             <button class="go" id="walk-take">${esc(confirm)}</button>`,
      onOpen: async () => {
        $('#walk-no').onclick = () => { closeLayer(); resolve(null); };
        $('#walk-take').onclick = () => { closeLayer(); resolve(herePath); };
        $('#walk-native').onclick = async () => {
          const button = $('#walk-native');
          button.disabled = true;
          button.textContent = 'Waiting for the chooser…';
          const r = await post('/browse/choose', { startAt: herePath });
          button.disabled = false;
          button.textContent = 'Use the Windows folder chooser';
          if (r.ok) { closeLayer(); resolve(r.path); return; }
          if (r.cancelled) return;
          say(r);
          closeLayer();
          resolve(null);
          draw();
        };

        const { places } = await get('/browse/starts');
        $('#walk-starts').innerHTML = places
          .map((p) => `<button class="small" data-start="${esc(p.path)}">${esc(p.name)}</button>`).join('');
        for (const b of document.querySelectorAll('[data-start]')) b.onclick = () => paint(b.dataset.start);
        await paint(startAt ?? places[0]?.path ?? null);
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * Where a project stands with you, in the order work actually goes.
 *
 * A project you have just added has not been started, which is a real answer
 * rather than the absence of one — so there is no such thing as unmarked.
 */
const MARK_LOOK = {
  notStarted: { name: 'Yet to start' },
  working: { name: 'Working on it' },
  finished: { name: 'Finished' },
  published: { name: 'Published' },
};

const stateChip = (mark) => {
  const which = MARK_LOOK[mark] ? mark : 'notStarted';
  return `<span class="state ${which}"><span class="pip"></span>${esc(MARK_LOOK[which].name)}</span>`;
};

SCREENS.projects = async () => {
  if (at.inside) return drawOpenProject();

  const d = await get('/projects');
  const busy = d.projects.filter((p) => p.unsaved).length;

  view.innerHTML = `
    <h1>Your projects</h1>
    <p class="sub">Pick one, and every app on this computer opens already inside it.
      ${d.projects.length
    ? `${d.projects.length} here${busy ? `, ${busy} with work you have not saved` : ', all saved'}.`
    : ''}</p>

    <div class="bar">
      <button class="go" id="p-add">Choose a folder…</button>
      ${me.github ? '<button id="p-cloud">Bring one down from GitHub…</button>' : ''}
    </div>
    ${saidHtml()}

    ${d.projects.length
    ? `<h2>On this computer</h2><div class="stack">${d.projects.map(projectSlab).join('')}</div>`
    : `<div class="empty"><b>Nothing here yet.</b>
         Choose a folder above and it becomes the project every app opens into.</div>`}

    ${me.github ? `
      <h2>On GitHub, not on this computer
        <button class="quiet small" id="p-refresh" style="float:right;text-transform:none;letter-spacing:0">check again</button>
      </h2>
      <div id="cloud"><div class="row"><span class="spin"></span>
        <div class="grow">Asking GitHub what you have…</div></div></div>` : ''}`;
  said = null;

  $('#p-add').onclick = async () => {
    const path = await pickFolder({ title: 'Which folder is the project?', confirm: 'Open this folder' });
    if (path) await openProject(path);
  };
  $('#p-cloud')?.addEventListener('click', fromGitHub);

  lastMarks = d.marks;

  for (const el of document.querySelectorAll('[data-open]')) {
    el.onclick = (e) => { if (e.target.closest('button')) return; openProject(el.dataset.open); };
    // The same items the overflow button opens. Never the only way to reach them.
    el.oncontextmenu = (e) => {
      e.preventDefault();
      const one = d.projects.find((p) => p.path === el.dataset.open);
      menuAt({ x: e.clientX, y: e.clientY }, moreForProject(el.dataset.open, !!one?.private));
    };
  }
  if (me.github) {
    drawCloud(d.projects);
    $('#p-refresh').onclick = () => drawCloud(d.projects, { again: true });
  }

  for (const b of document.querySelectorAll('[data-open-now]')) {
    b.onclick = () => { b.classList.add('working'); openProject(b.dataset.openNow); };
  }
  for (const b of document.querySelectorAll('[data-mark]')) b.onclick = () => markSheet(b.dataset.mark, d.marks);
  for (const b of document.querySelectorAll('[data-look]')) b.onclick = () => statusSheet(b.dataset.look);
  for (const b of document.querySelectorAll('[data-more]')) {
    b.onclick = (e) => {
      e.stopPropagation();
      const room = b.getBoundingClientRect();
      menuAt({ x: room.right - 200, y: room.bottom + 6 },
        moreForProject(b.dataset.more, b.dataset.now === '1'));
    };
  }
};

/**
 * The four marks, kept from the last time the list was drawn.
 *
 * The sheet that sets one is now reached from a menu built outside the function
 * that has the list to hand, and passing it down through three layers to be
 * used once is worse than remembering it here.
 */
let lastMarks = [];

/**
 * One project, with the four things worth knowing at a glance: what state it is
 * in, when you last stopped, what you were doing when you did, and where it is.
 */
function projectSlab(p) {
  const mark = MARK_LOOK[p.mark] ? p.mark : 'notStarted';
  const spine = mark === 'published' ? 'published' : p.unsaved ? 'unsaved' : 'clean';
  return `
    <div class="slab" data-open="${esc(p.path)}">
      <span class="spine ${spine}"></span>
      <div class="grow">
        <div class="line1">
          <b>${esc(p.name)}</b>
          ${stateChip(mark)}
          ${p.kind ? `<span class="chip">${esc(p.kind)}</span>` : ''}
          ${p.private ? '' : '<span class="chip vibe">offered</span>'}
          ${p.toSend ? `<span class="chip attention">${p.toSend} to send</span>` : ''}
        </div>
        <div class="fact"><em>${esc(p.says)}</em> · ${esc(p.saved)}
          · ${p.shared ? 'on GitHub' : 'only on this computer'}</div>
        ${p.lastDid ? `<div class="did">Last time: ${esc(p.lastDid)}</div>` : ''}
        <div class="path">${esc(p.path)}</div>
      </div>
      <div class="acts">
        <button class="go small" data-open-now="${esc(p.path)}">Open</button>
        <button class="small icon" data-more="${esc(p.path)}" data-now="${p.private ? '1' : '0'}"
          data-tip="More for this project" aria-label="More for ${esc(p.name)}">⋯</button>
      </div>
    </div>`;
}

/**
 * Everything else a project row can do.
 *
 * There were four buttons on every row, competing with each other and with the
 * four facts the row exists to show. Only one of them is what you came for —
 * Open — and the rest are things you do occasionally to one project. One
 * primary action and an overflow says that; four equal buttons says they are
 * four equally likely things, which is not true of any of them.
 */
const moreForProject = (path, isPrivate) => [
  { what: 'Open it', run: () => openProject(path) },
  { what: 'What is in it', run: () => statusSheet(path) },
  { what: 'Where you have got to', run: () => markSheet(path, lastMarks) },
  '-',
  {
    what: isPrivate ? 'Offer it to my other computers' : 'Stop offering it',
    run: async () => {
      say(await post('/projects/private', { path, private: !isPrivate }));
      draw();
    },
  },
];

/**
 * The projects on your GitHub account that are not on this computer yet.
 *
 * Kept beneath the ones that are here, because the ones that are here are the
 * ones you can actually work on. Bringing one down is one press and one
 * question — where it should go.
 *
 * Held for a few minutes once fetched: asking GitHub takes a second or two and
 * the answer does not change while you are looking at it.
 */
let cloudHeld = null;

async function drawCloud(here, { again = false } = {}) {
  const box = $('#cloud');
  if (!box) return;

  if (again || !cloudHeld || Date.now() - cloudHeld.at > 5 * 60_000) {
    box.innerHTML = '<div class="row"><span class="spin"></span><div class="grow">Asking GitHub what you have…</div></div>';
    cloudHeld = { at: Date.now(), r: await get('/github/mine') };
  }
  const r = cloudHeld.r;

  if (!r.ok) {
    box.innerHTML = `<div class="empty"><b>${esc(r.sentence)}</b>${r.action ? `<br>${esc(r.action)}` : ''}</div>`;
    return;
  }

  // A project already on this computer is not news.
  const names = new Set(here.map((p) => p.name.toLowerCase()));
  const missing = r.projects.filter((p) => !names.has(p.name.toLowerCase()));

  if (!missing.length) {
    box.innerHTML = `<div class="empty"><b>Everything on GitHub is already here.</b>
      All ${r.projects.length} of them.</div>`;
    return;
  }

  box.innerHTML = `<div class="lane">${missing.map((p) => `
    <div class="slab" style="cursor:default">
      <span class="spine ${p.visibility === 'public' ? 'published' : ''}"></span>
      <div class="grow">
        <div class="line1"><b>${esc(p.name)}</b>
          <span class="chip">${esc(p.visibility)}</span>
          ${p.copied ? '<span class="chip">a copy of somebody else\'s</span>' : ''}</div>
        <div class="fact">${esc(p.about ?? 'No description on GitHub.')}</div>
        <div class="did">Changed ${ago(p.changed)}</div>
      </div>
      <div class="acts">
        <button class="go small" data-pull="${esc(p.url)}" data-name="${esc(p.name)}">Bring it here…</button>
        <button class="quiet small" data-seepage="${esc(p.url)}">Open on GitHub</button>
      </div>
    </div>`).join('')}</div>`;

  for (const b of box.querySelectorAll('[data-pull]')) {
    b.onclick = async () => {
      const into = await pickFolder({
        title: `Where should ${b.dataset.name} go on this computer?`,
        confirm: 'Put it in here',
        startAt: me.settings?.workFolder,
      });
      if (!into) return;
      say({ sentence: `Bringing ${b.dataset.name} down…` });
      draw();
      const r2 = await post('/github/bring', { url: b.dataset.pull, into });
      say(r2);
      cloudHeld = null;
      await refreshMe();
      draw();
    };
  }
  for (const b of box.querySelectorAll('[data-seepage]')) {
    b.onclick = () => post('/open/page', { at: b.dataset.seepage });
  }
}

async function openProject(path) {
  const r = await post('/open', { path });
  if (r.ok === false) { say(r); return draw(); }
  at.inside = true;
  said = null;
  await refreshMe();
  await draw();
}

const MARK_GLYPH = { notStarted: '○', working: '◐', finished: '●', published: '◆' };

function markSheet(path, marks) {
  sheet({
    title: 'Where have you got to?',
    narrow: true,
    body: `<div class="menu">
      ${marks.map((m) => `
        <button class="opt" data-set="${esc(m.id)}">
          <span class="glyph">${MARK_GLYPH[m.id] ?? '·'}</span>
          <span><span class="what">${esc(m.name)}</span><br><span class="why">${esc(m.blurb)}</span></span>
        </button>`).join('')}
    </div>`,
    onOpen: () => {
      for (const b of document.querySelectorAll('[data-set]')) {
        b.onclick = async () => {
          closeLayer();
          say(await post('/projects/mark', { path, mark: b.dataset.set }));
          draw();
        };
      }
    },
  });
}

/**
 * What is actually in a project.
 *
 * Ordered by the questions somebody brings to a folder they have not opened in
 * three weeks: what is this, how big is it, what was I doing, what is
 * unfinished, where does it live.
 */
async function statusSheet(path) {
  sheet({
    title: tail(path),
    body: '<div class="row"><span class="spin"></span><div class="grow">Looking through it…</div></div>',
    onOpen: async (body) => {
      const c = await get(`/contents?at=${encodeURIComponent(path)}`);
      if (c.ok === false) {
        body.innerHTML = `<p><b>${esc(c.sentence)}</b><br><span style="color:var(--quiet)">${esc(c.action ?? '')}</span></p>`;
        return;
      }

      const most = Math.max(1, ...c.size.madeOf.map((m) => m.count));
      const began = c.began ? new Date(c.began) : null;
      const days = began ? Math.max(1, Math.round((Date.now() - began.getTime()) / 86400000)) : null;

      body.innerHTML = `
        ${c.about ? `<p style="margin:0 0 1.2rem;line-height:1.6">${esc(c.about.says)}
          <br><span style="color:var(--faint);font-size:.8rem">from ${esc(c.about.from)}</span></p>` : ''}

        <div class="facts">
          <div class="one"><b>${c.size.files}${c.size.capped ? '+' : ''}</b><span>files</span></div>
          <div class="one"><b>${esc(size(c.size.bytes))}</b><span>of work</span></div>
          <div class="one"><b>${c.where.saves ?? 0}</b><span>saves</span></div>
          <div class="one"><b>${days ? (days > 90 ? `${Math.round(days / 30)}mo` : `${days}d`) : '—'}</b><span>going</span></div>
        </div>

        ${c.size.madeOf.length ? `
          <h2 style="margin-top:0">What it is made of</h2>
          <div class="bars">
            ${c.size.madeOf.map((m) => `
              <div class="bar1">
                <span style="min-width:6rem">${esc(m.name)}</span>
                <span class="track"><span class="fill" style="width:${Math.round((m.count / most) * 100)}%"></span></span>
                <span class="n">${m.count}</span>
              </div>`).join('')}
          </div>` : ''}

        ${c.size.folders.length ? `
          <h2>Inside it</h2>
          <div style="display:flex;gap:.35rem;flex-wrap:wrap">
            ${c.size.folders.map((f) => `<span class="chip">${esc(f)}</span>`).join('')}
          </div>` : ''}

        <h2>What you were doing</h2>
        ${c.saves.length ? `<div class="lane">${c.saves.map((s) => `
          <div class="slab" style="cursor:default;padding:.6rem .8rem">
            <span class="spine clean"></span>
            <div class="grow">
              <div style="font-weight:500">${esc(s.what)}</div>
              <div class="did">${esc(s.when)} · ${esc(s.by)}</div>
            </div>
          </div>`).join('')}</div>`
    : '<p style="color:var(--quiet);margin:0">Nothing saved here yet.</p>'}

        <h2>Not saved yet</h2>
        ${c.changed.total ? `
          <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.6rem">
            ${c.changed.kinds.map((k) => `<span class="chip attention">${k.count} ${esc(k.says)}</span>`).join('')}
          </div>
          <details>
            <summary style="cursor:pointer;color:var(--quiet);font-size:.85rem">Which files</summary>
            <div class="log" style="margin-top:.5rem">${esc(c.changed.files.map((f) => f.name).join('\n'))}${
  c.changed.more ? esc(`\n… and ${c.changed.more} more`) : ''}</div>
          </details>`
    : '<p style="color:var(--quiet);margin:0">Nothing. Everything here is saved.</p>'}

        <h2>Where it lives</h2>
        <p style="margin:0 0 .8rem;color:var(--quiet)">
          ${c.where.shared
    ? `On GitHub${c.where.visibility ? `, ${c.where.visibility === 'public' ? 'where anyone can see it' : 'where only you can see it'}` : ''}.
             ${c.where.toSend ? `${c.where.toSend} saved change${c.where.toSend === 1 ? '' : 's'} not sent yet.` : 'Everything sent.'}`
    : 'Only on this computer. If it is lost, it is lost.'}
        </p>

        ${c.missing.some((m) => !m.there) ? `
          <div class="needs">
            ${c.missing.map((m) => `
              <div class="need">
                <span class="${m.there ? 'tick' : 'cross'}">${m.there ? '✓' : '○'}</span>
                <div><b style="font-weight:500">${esc(m.file)}</b><br><span>${esc(m.why)}</span></div>
              </div>`).join('')}
          </div>` : ''}`;
    },
    foot: `<button class="quiet" id="s-forget">Take it off the list</button>
           <button class="go" id="s-open">Open this project</button>`,
  });

  $('#s-open').onclick = async () => {
    closeLayer();
    await openProject(path);
  };
  $('#s-forget').onclick = async () => {
    closeLayer();
    const sure = await confirmThat({
      title: 'Take it off the list?',
      what: `${tail(path)} would stop being listed here.`,
      why: 'The folder itself is not touched. Nothing in it is deleted.',
      confirm: 'Take it off',
      danger: true,
    });
    if (!sure) return;
    say(await post('/projects/forget', { path }));
    at.inside = false;
    await refreshMe();
    draw();
  };
}

async function fromGitHub() {
  sheet({
    title: 'Your projects on GitHub',
    body: '<div class="row"><span class="spin"></span><div class="grow">Asking GitHub what you have…</div></div>',
    onOpen: async (body) => {
      const r = await get('/github/mine');
      if (!r.ok) {
        body.innerHTML = `<p><b>${esc(r.sentence)}</b><br><span style="color:var(--quiet)">${esc(r.action ?? '')}</span></p>`;
        return;
      }
      body.innerHTML = `
        <p class="sub" style="margin-bottom:1rem">Pick one and it comes down to this computer, ready to open.</p>
        ${r.projects.map((p) => `
          <div class="row pick" data-url="${esc(p.url)}" data-name="${esc(p.name)}">
            <span class="dot ${p.visibility === 'public' ? 'live' : 'off'}"></span>
            <div class="grow"><div class="name">${esc(p.name)}</div>
              <div class="note">${esc(p.about ?? 'No description')} · changed ${ago(p.changed)}</div></div>
            <span class="chip">${esc(p.visibility)}</span>
          </div>`).join('')}`;
      for (const row of body.querySelectorAll('[data-url]')) {
        row.onclick = async () => {
          closeLayer();
          const into = await pickFolder({ title: `Where should ${row.dataset.name} go?`, confirm: 'Put it in here' });
          if (!into) return;
          say({ sentence: `Bringing ${row.dataset.name} down…` });
          draw();
          say(await post('/github/bring', { url: row.dataset.url, into }));
          await refreshMe();
          draw();
        };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// One project, open
// ---------------------------------------------------------------------------

async function drawOpenProject() {
  const [p, t] = await Promise.all([get('/project'), get('/tools')]);
  if (!p.open) { at.inside = false; return draw(); }

  const open = whatIsOpen(p, t.tools);

  view.innerHTML = `
    <button class="quiet" id="back" style="margin:0 0 1rem;padding-left:0">← all projects</button>
    <h1>${esc(p.name)}
      <span style="vertical-align:middle;margin-left:.5rem">${stateChip(p.mark)}</span>
    </h1>
    <p class="sub">${esc(p.says)} · ${esc(p.saved)}
      · ${p.situation?.shared ? 'on GitHub' : 'only on this computer'}
      <br><span style="color:var(--faint)">${esc(p.dir)}</span></p>

    <div class="card" style="margin-bottom:1.4rem">
      <label class="field">What did you do?</label>
      <div class="bar" style="margin:0">
        <input id="msg" placeholder="Made the sign-in page work" style="flex:1">
        <button class="go" id="pub">Save and send to GitHub</button>
        <button id="more">More…</button>
      </div>
    </div>
    ${saidHtml()}

    <h2>Open this project in</h2>
    <div class="bar">
      <button id="to-apps">Choose an AI app →</button>
      <button id="to-terms">Open a terminal here →</button>
      <button id="to-ship">Deploy it →</button>
    </div>

    ${open.length ? `
      <h2>Pick up where you left off
        <button class="quiet small" id="tidy" style="float:right;text-transform:none;letter-spacing:0">clear the list</button>
      </h2>
      <div class="lane">
        ${open.map((g) => `
          <div class="slab" data-again="${esc(g.assistant)}">
            <span class="dot ${g.rank === 'moving' ? 'live' : g.rank === 'waiting on you' ? 'attention' : 'off'}"></span>
            <div class="grow">
              <div class="line1"><b>${esc(g.name)}</b>
                ${g.times > 1 ? `<span class="chip">opened ${g.times} times</span>` : ''}
                ${g.canCarryOn ? '<span class="chip cool">carries on where you left off</span>' : ''}
                ${g.here ? '' : '<span class="chip">not on this computer now</span>'}
              </div>
              <div class="fact">Last opened ${esc(g.ago)}.</div>
            </div>
            <div class="acts">
              ${g.here ? `<button class="go small" data-again-now="${esc(g.assistant)}">Open again</button>` : ''}
              <button class="quiet small" data-done="${esc(g.ids.join(' '))}">finished</button>
              <button class="quiet small" data-drop="${esc(g.ids.join(' '))}">remove</button>
            </div>
          </div>`).join('')}
      </div>` : ''}`;
  said = null;

  $('#back').onclick = async () => { at.inside = false; await post('/close'); await refreshMe(); draw(); };
  $('#pub').onclick = saveAndSend;
  $('#msg').onkeydown = (e) => { if (e.key === 'Enter') saveAndSend(); };
  $('#more').onclick = () => gitHubSheet(p);
  $('#to-apps').onclick = () => go('apps');
  $('#to-terms').onclick = () => go('terminals');
  $('#to-ship').onclick = () => go('ship');
  $('#tidy')?.addEventListener('click', async () => {
    const sure = await confirmThat({
      title: 'Clear the list',
      what: 'Everything on this list stops being listed.',
      why: 'Nothing that is running is stopped, and no file is touched. This is only the note of what you opened.',
      confirm: 'Clear it',
    });
    if (!sure) return;
    say(await post('/tidy'));
    draw();
  });

  for (const b of document.querySelectorAll('[data-done]')) {
    b.onclick = async (e) => {
      e.stopPropagation();
      say(await post('/done', { efforts: b.dataset.done.split(' ') }));
      draw();
    };
  }
  for (const b of document.querySelectorAll('[data-drop]')) {
    b.onclick = async (e) => {
      e.stopPropagation();
      say(await post('/drop', { efforts: b.dataset.drop.split(' ') }));
      draw();
    };
  }

  // The whole card takes you back to that app — which is the thing you came to
  // this list to do.
  for (const el of document.querySelectorAll('[data-again]')) {
    el.onclick = (e) => { if (e.target.closest('button')) return; openAgain(el.dataset.again); };
  }
  for (const b of document.querySelectorAll('[data-again-now]')) {
    b.onclick = (e) => { e.stopPropagation(); openAgain(b.dataset.againNow); };
  }
}

/**
 * What you have open here, one card per app.
 *
 * Opening the same assistant five times in an afternoon is one thing you are
 * doing. New presses are already folded into one entry, but a list recorded
 * before that was true still has the old ones in it — and either way, the thing
 * you want from this list is "take me back to Codex", not a receipt for every
 * time you pressed the button.
 */
function whatIsOpen(p, tools) {
  const byApp = new Map();

  for (const rank of p.home.ranks) {
    for (const e of rank.efforts) {
      const id = e.assistant ?? e.intent;
      const app = tools.find((x) => x.id === e.assistant);
      const group = byApp.get(id) ?? {
        assistant: e.assistant,
        name: app?.name ?? e.intent,
        here: !!app?.here,
        canCarryOn: !!app?.canCarryOn,
        ids: [],
        times: 0,
        rank: rank.name,
        ago: e.ago,
        newest: e.changedAt ?? 0,
      };
      group.ids.push(e.id);
      group.times += 1;
      if ((e.changedAt ?? 0) >= group.newest) {
        group.newest = e.changedAt ?? 0;
        group.ago = e.ago;
        group.rank = rank.name;
      }
      byApp.set(id, group);
    }
  }

  return [...byApp.values()].sort((a, b) => b.newest - a.newest);
}

/** Open an app again in this project, carrying on where it left off. */
async function openAgain(assistant) {
  say(await post('/launch', {
    tool: assistant,
    carryOn: true,
    profile: chosen.account[assistant] ?? null,
  }));
  draw();
}

async function saveAndSend() {
  const button = $('#pub');
  button.disabled = true;
  button.textContent = 'Saving…';
  say(await post('/publish', { message: $('#msg').value.trim() }));
  draw();
}

function gitHubSheet(p) {
  const s = p.situation ?? {};
  const has = !!s.shared;

  const options = [
    { id: 'save', glyph: '⌂', what: 'Save here only', can: true,
      why: 'Keep a point you can come back to, without sending it anywhere.' },
    { id: 'latest', glyph: '↓', what: 'Get the latest from GitHub', can: has,
      why: has ? 'Bring down anything your other computers have sent. Refuses if you have unsaved work.'
        : 'Nothing to get — this project has no copy on GitHub yet.' },
    { id: 'copy', glyph: '＋', what: 'Make a copy on GitHub', can: !has,
      why: has ? 'It already has one.' : 'Puts this project on your GitHub account so it is safe and reachable.' },
    { id: 'visibility', glyph: '◎',
      what: s.visibility === 'public' ? 'Make it private again' : 'Let anyone see it', can: has,
      why: has ? (s.visibility === 'public'
        ? 'Right now anyone with the address can read it. This puts it back to just you.'
        : 'Right now only you can see it. This makes it readable by anybody.')
        : 'It needs a copy on GitHub first.' },
    { id: 'undo', glyph: '↺', what: 'Take back the last save', can: (s.saves ?? 0) > 1 || !has,
      why: 'Undoes the act of saving. Every file stays exactly as it is. Only works if it has not gone to GitHub.' },
    { id: 'changes', glyph: '≡', what: 'See what changed', can: true,
      why: 'A plain list of every file that is different since you last saved.' },
    { id: 'open', glyph: '↗', what: 'Open it on GitHub', can: has,
      why: has ? 'In your browser.' : 'It needs a copy on GitHub first.' },
    { id: 'allow', glyph: '🔑', what: 'Let this computer send to GitHub', can: true,
      why: 'If sending says it cannot prove who you are, this fixes it for every project on this computer. Asked once.' },
  ];

  sheet({
    title: `${p.name} and GitHub`,
    body: `
      <p class="sub" style="margin-bottom:1rem">
        GitHub is where a second copy of your work lives, so a lost laptop is an
        inconvenience rather than a disaster — and it is how your other computers
        get what you did here.
      </p>
      <div class="menu">
        ${options.map((o) => `
          <button class="opt" data-do="${o.id}" ${o.can ? '' : 'disabled'}>
            <span class="glyph">${o.glyph}</span>
            <span><span class="what">${esc(o.what)}</span><br><span class="why">${esc(o.why)}</span></span>
          </button>`).join('')}
      </div>`,
    onOpen: () => {
      for (const b of document.querySelectorAll('[data-do]')) b.onclick = () => doGitHub(b.dataset.do, p);
    },
  });
}

async function doGitHub(what, p) {
  const s = p.situation ?? {};

  if (what === 'changes') { closeLayer(); return statusSheet(p.dir); }

  if (what === 'allow') {
    closeLayer();
    const sure = await confirmThat({
      title: 'Let this computer send to GitHub',
      what: 'This computer will use the GitHub account you are signed in to here whenever it sends anything.',
      why: 'It changes one setting for every project on this computer, and it is the setting GitHub itself recommends. Nothing about your projects changes.',
      confirm: 'Set it up',
    });
    if (!sure) return;
    say(await post('/github/allowSending'));
    return draw();
  }

  if (what === 'open') {
    closeLayer();
    const picture = await get('/github');
    if (picture.picture?.url) post('/open/page', { at: picture.picture.url });
    return;
  }

  if (what === 'save') {
    closeLayer();
    const message = await ask({
      title: 'Save here only',
      label: 'What did you do?',
      value: $('#msg')?.value ?? '',
      placeholder: 'Made the sign-in page work',
      confirm: 'Save it',
    });
    if (message === null) return;
    say(await post('/github/save', { message }));
    return draw();
  }

  if (what === 'copy') { closeLayer(); return firstTimeSheet(); }

  if (what === 'visibility') {
    closeLayer();
    const toPublic = s.visibility !== 'public';
    const sure = !toPublic || !me.settings?.confirmPublic || await confirmThat({
      title: 'Let anyone see it',
      what: `Anybody who finds ${p.name} on GitHub will be able to read all of it.`,
      why: 'Check there are no passwords or keys in the files first. Once it is out, assume somebody has a copy.',
      confirm: 'Yes, let anyone see it',
      danger: true,
    });
    if (!sure) return;
    say(await post('/github/visibility', { visibility: toPublic ? 'public' : 'private' }));
    return draw();
  }

  if (what === 'undo') {
    closeLayer();
    const sure = await confirmThat({
      title: 'Take back the last save',
      what: 'The last save is undone.',
      why: 'Nothing you have written is lost — every file stays exactly as it is now. Only the save itself goes.',
      confirm: 'Take it back',
      danger: true,
    });
    if (!sure) return;
    say(await post('/github/undo'));
    return draw();
  }

  if (what === 'latest') {
    closeLayer();
    say({ sentence: 'Getting the latest…' });
    draw();
    say(await post('/github/latest'));
    return draw();
  }
}

/**
 * Putting a project on GitHub for the first time.
 *
 * One question — what it should be called. Everything else is worked out from
 * the project: what it is built with, how it is run, what should stay on your
 * computer. Nothing you wrote is ever overwritten, and the one thing that is
 * genuinely your decision, what other people may do with your work, is offered
 * and explained rather than assumed.
 */
async function firstTimeSheet() {
  const d = await get('/publish/first');
  if (d.ok === false) { say(d); return draw(); }

  // Said here rather than after the form. Being signed out cannot succeed, and
  // the failure it produces from the far end is indistinguishable from a name
  // already taken — which is how somebody was told to pick another name for a
  // project that did not exist, over and over, with no way out of it.
  if (!d.who) {
    return sheet({
      title: `Put ${d.name} on GitHub`,
      narrow: true,
      body: `
        <p class="sub">This needs you signed in to GitHub first. There is nowhere for
          a copy of your work to go until there is an account for it to go to.</p>
        <p class="sub">Everything on this computer carries on working without it —
          your work is saved here either way.</p>`,
      foot: `<button class="quiet" id="fp-later">Never mind</button>
             <button class="go" id="fp-in">Sign in with GitHub</button>`,
      onOpen: () => {
        $('#fp-later').onclick = () => { closeLayer(); draw(); };
        $('#fp-in').onclick = () => { closeLayer(); signInToGitHub(); };
      },
    });
  }

  sheet({
    title: `Put ${d.name} on GitHub`,
    body: `
      <p class="sub">You will be asked one thing. Everything a project on GitHub
        usually has, this works out from the project itself. It will be made on
        your account, ${esc(d.who)}.</p>

      <label class="field">What should it be called on GitHub?</label>
      <input id="fp-name" style="width:100%;margin-bottom:1rem" value="${esc(d.suggested)}">

      <label class="field">One line about what it is. Leave it blank and one is written from your own notes.</label>
      <input id="fp-about" style="width:100%;margin-bottom:1.2rem" placeholder="A manager for opening one project across your AI apps">

      <h2 style="margin-top:0">Who can see it</h2>
      <div class="menu" style="margin-bottom:1.2rem">
        <button class="opt on" data-vis="private">
          <span class="glyph">◎</span>
          <span><span class="what">Only me</span><br>
            <span class="why">Nobody else can find or read it. You can change this whenever.</span></span>
        </button>
        <button class="opt" data-vis="public">
          <span class="glyph">◉</span>
          <span><span class="what">Anyone</span><br>
            <span class="why">Readable by anybody who finds it. Check there are no keys or passwords in the files first.</span></span>
        </button>
      </div>

      <h2>What other people may do with it</h2>
      <div class="menu">
        ${d.licences.map((l, i) => `
          <button class="opt ${i === 0 ? 'on' : ''}" data-lic="${esc(l.id)}">
            <span class="glyph">§</span>
            <span><span class="what">${esc(l.name)}</span><br><span class="why">${esc(l.blurb)}</span></span>
          </button>`).join('')}
      </div>

      ${d.willMake.length ? `
        <h2>What will be written for you</h2>
        <div class="needs">
          ${d.willMake.map((f) => `
            <div class="need"><span class="tick">＋</span>
              <div><b style="font-weight:500">${esc(f)}</b><br>
                <span>${f === 'README.md'
    ? 'The page people land on, written from what this project is and how it runs.'
    : 'So build output, dependencies and anything holding a key stay on your computer.'}</span></div>
            </div>`).join('')}
        </div>
        <p class="note" style="color:var(--faint);font-size:.82rem;margin-top:.6rem">
          Anything you already wrote is left exactly as it is.</p>` : `
        <p class="note" style="color:var(--quiet);margin-top:1rem">
          This project already has everything it needs. Nothing will be written.</p>`}`,
    foot: `<span class="left">Afterwards, Save and send is the only button you need.</span>
           <button class="quiet" id="fp-no">Never mind</button>
           <button class="go" id="fp-yes">Put it on GitHub</button>`,
    onOpen: (body) => {
      let visibility = 'private';
      let licence = 'none';

      const choose = (group, value) => {
        for (const b of body.querySelectorAll(`[data-${group}]`)) b.classList.remove('on');
        body.querySelector(`[data-${group}="${value}"]`)?.classList.add('on');
      };
      for (const b of body.querySelectorAll('[data-vis]')) {
        b.onclick = () => { visibility = b.dataset.vis; choose('vis', visibility); };
      }
      for (const b of body.querySelectorAll('[data-lic]')) {
        b.onclick = () => { licence = b.dataset.lic; choose('lic', licence); };
      }

      $('#fp-no').onclick = closeLayer;
      $('#fp-yes').onclick = async () => {
        const name = $('#fp-name').value.trim();
        if (!name) return;
        const description = $('#fp-about').value.trim() || null;
        closeLayer();
        const r = await post('/publish/first', { name, description, licence, visibility });
        if (r.ok) watchJob(r.job); else { say(r); draw(); }
      };
    },
  });
}

// ---------------------------------------------------------------------------
// AI apps
// ---------------------------------------------------------------------------

SCREENS.apps = async () => {
  const [t, p] = await Promise.all([get('/tools'), get('/project')]);
  const here = t.tools.filter((x) => x.here);
  const away = t.tools.filter((x) => !x.here);

  view.innerHTML = `
    <h1>AI apps</h1>
    <p class="sub">Each one opens already inside the folder shown on its card, with the
      account you picked. You never add the folder by hand again.</p>
    ${whereBar(p)}
    ${saidHtml()}

    ${here.length ? `
      <h2>On this computer</h2>
      <div class="grid">${here.map((x) => appTile(x, p, t)).join('')}</div>` : `
      <div class="empty"><b>None of the AI apps were found here.</b>
        Any of the ones below can be installed from this page.</div>`}

    ${away.length ? `
      <h2>Not on this computer</h2>
      <div class="grid">${away.map((x) => appTile(x, p, t)).join('')}</div>` : ''}

    <div id="job"></div>`;
  said = null;

  wireWhereBar();
  wireAppCards(t, p);
  // Redraw the errand once, without starting a second loop watching it.
  if (watching) paintJob({ again: !jobTimer });
};

/**
 * Which folder everything on this page will start in.
 *
 * One choice for the page rather than one per card. Every card said the same
 * thing, which is a lot of ink to say one fact.
 */
function whereBar(p) {
  const dir = chosen.folder.all ?? p.dir ?? null;
  return `
    <div class="bar">
      <span style="color:var(--quiet);font-size:.86rem">Start in</span>
      <button class="folderchip" id="where-all">
        <span>📁</span><b>${esc(dir ? tail(dir) : 'no folder chosen')}</b>
        <span style="color:var(--faint)">${esc(dir ?? 'pick one')}</span>
      </button>
      ${chosen.folder.all ? '<button class="quiet small" id="where-clear">use the open project</button>' : ''}
    </div>`;
}

function wireWhereBar() {
  $('#where-all')?.addEventListener('click', async () => {
    const path = await pickFolder({ title: 'Start everything in which folder?', confirm: 'Start in here' });
    if (!path) return;
    chosen.folder.all = path;
    draw();
  });
  $('#where-clear')?.addEventListener('click', () => { delete chosen.folder.all; draw(); });
}

const whereFor = (id, p) => chosen.folder.all ?? p?.dir ?? null;

function appTile(x, p, t) {
  const ways = x.ways ?? [];
  const account = chosen.account[x.id] ?? x.active ?? null;

  if (!x.here) {
    return `
      <div class="tile flat away">
        <div class="top"><span class="dot off"></span><span class="title">${esc(x.name)}</span>
          ${x.made ? `<span class="chip" style="margin-left:auto">${esc(x.made)}</span>` : ''}</div>
        <div class="note">Not on this computer. Its own page has the installer and the steps.</div>
        <div class="doing">
          ${x.installs
    ? `<button class="go small" data-install="${esc(x.id)}">Install ${esc(x.name)}</button>` : ''}
          <button class="${x.installs ? 'quiet ' : ''}small" data-getpage="${esc(x.install ?? '')}">
            ${x.installs ? 'Its page ↗' : `How to install ${esc(x.name)} ↗`}</button>
        </div>
        ${x.installs ? `<div class="note" style="color:var(--faint);font-size:.76rem">Runs ${esc(x.installs)}</div>` : ''}
      </div>`;
  }

  // A window this app has but this computer does not still gets its button. It
  // says where to get it rather than not being there at all.
  const canWindow = ways.includes('desktop');
  const windowElsewhere = !canWindow && x.windowElsewhere;

  return `
    <div class="tile flat">
      <div class="top">
        <span class="dot ${account || x.signedIn ? 'live' : 'off'}"></span>
        <span class="title">${esc(x.name)}</span>
        ${x.made ? `<span class="chip" style="margin-left:auto">${esc(x.made)}</span>` : ''}
      </div>
      <div class="note">${account
    ? `Will open as “${esc(account)}”`
    : x.signedIn ? 'Signed in on this computer'
      : x.config ? 'Not signed in yet' : 'Signs you in inside its own window'}</div>
      ${x.opensInBrowser ? '<div class="note" style="color:var(--faint);font-size:.78rem">Its window is a page it opens in your browser.</div>' : ''}
      ${windowElsewhere ? `<div class="note" style="color:var(--faint);font-size:.78rem">${esc(x.terminalOnlyBecause ?? 'Its own window is not on this computer yet.')}</div>` : ''}

      <div class="doing">
        ${canWindow
    ? `<button class="go small" data-launch="${esc(x.id)}" data-how="desktop">Open</button>`
    : windowElsewhere
      ? `<button class="go small" data-getwindow="${esc(x.windowElsewhere)}" data-name="${esc(x.name)}">Open ↗</button>`
      : ''}
        ${ways.includes('terminal') ? `
          <span class="pair">
            <button class="small" data-launch="${esc(x.id)}" data-how="terminal">Terminal</button>
            <button class="small" data-which="${esc(x.id)}">▾</button>
          </span>` : ''}
        <span class="drop">
          <button class="small" data-account="${esc(x.id)}">Account ▾</button>
          <div class="panel" hidden id="acct-${esc(x.id)}">${accountPanel(x, t)}</div>
        </span>
      </div>
    </div>`;
}

/**
 * The account panel: the services this app can sign you in with, and the
 * accounts already kept for it. Both in the place you are about to press Open.
 */
function accountPanel(x, t) {
  const ways = x.signIns ?? [];
  const keys = x.keys ?? [];
  const keeps = x.profiles ?? [];
  const account = chosen.account[x.id] ?? x.active ?? null;

  return `
    ${ways.length ? `
      <div class="head">Sign in with</div>
      <div class="services">
        ${ways.map((w) => `
          <button class="service" data-way="${esc(x.id)}|${esc(w.id)}" title="${esc(w.then ?? '')}">
            ${wayBadge(w)}${esc(w.name)}
          </button>`).join('')}
      </div>` : ''}

    <div class="head">${x.config ? 'Accounts kept on this computer' : 'Accounts'}</div>
    ${!x.config
      ? `<div class="pick"><span class="sub">${esc(x.name)} keeps its account inside itself, so this
           manager cannot hold more than one for it.</span></div>`
      : keeps.length ? keeps.map((k) => `
          <button class="pick ${k.name === account ? 'on' : ''}" data-use="${esc(x.id)}|${esc(k.name)}">
            <span class="dot ${k.name === account ? 'live' : 'off'}"></span>
            <span class="grow"><b>${esc(k.name)}</b><br>
              <span class="sub">${k.active ? 'signed in right now' : `last used ${ago(k.lastUsed)}`}</span></span>
            <span class="sub" data-forget="${esc(x.id)}|${esc(k.name)}">✕</span>
          </button>`).join('')
        : '<div class="pick"><span class="sub">None kept yet. Sign in above, then keep it under a name — after that you can switch without signing out of either.</span></div>'}

    ${x.config ? `<hr>
      <button class="pick" data-keep="${esc(x.id)}"><span>＋</span>
        <span class="grow">Keep the one I am signed in to…</span></button>` : ''}
    ${keys.length ? `
      <button class="pick" data-keys="${esc(x.id)}"><span>⚿</span>
        <span class="grow">Use a key instead
          <span class="sub">${keys.length === 1 && !ways.length
    ? `${esc(x.name)} works this way rather than with an account.`
    : 'For an account that only issues keys.'}</span></span></button>` : ''}`;
}

function wireAppCards(t, p) {
  for (const b of document.querySelectorAll('[data-launch]')) {
    b.onclick = async () => {
      const { launch, how } = b.dataset;
      // The press is acknowledged before anything is asked of the server. These
      // apps take seconds to put a window up, and a button that looks untouched
      // for that long reads as a button that did not work.
      b.classList.add('working');
      b.disabled = true;
      say(await post('/launch', {
        tool: launch, how, dir: whereFor(launch, p), profile: chosen.account[launch] ?? null,
      }));
      await draw();
    };
  }

  for (const b of document.querySelectorAll('[data-which]')) {
    b.onclick = () => whichTerminal(b.dataset.which, whereFor(b.dataset.which, p), t.terminals);
  }

  for (const b of document.querySelectorAll('[data-getwindow]')) {
    b.onclick = async () => {
      const go = await confirmThat({
        title: `${b.dataset.name}'s own window`,
        what: `What is installed here is ${b.dataset.name} for the terminal, not its window.`,
        why: 'Its download page has the window version. Once it is installed, this button opens it.',
        confirm: 'Open the download page',
      });
      if (go) post('/open/page', { at: b.dataset.getwindow });
    };
  }

  for (const b of document.querySelectorAll('[data-account]')) {
    b.onclick = (e) => {
      e.stopPropagation();
      openPanel($(`#acct-${CSS.escape(b.dataset.account)}`));
    };
  }

  // Pressing a provider starts that app's own sign-in, which is the thing that
  // opens the provider's real flow. Nothing here opens a web page and hopes.
  for (const b of document.querySelectorAll('[data-way]')) {
    b.onclick = async (e) => {
      e.stopPropagation();
      closePanels();
      const [tool, method] = b.dataset.way.split('|');
      const r = await post('/signin/tool', { tool, method, dir: whereFor(tool, p) });
      say(r);
      await draw();
      if (r.ok && r.inATerminal) carryTheLink(t.tools.find((x) => x.id === tool) ?? { name: tool });
    };
  }

  for (const b of document.querySelectorAll('[data-keys]')) {
    b.onclick = async (e) => {
      e.stopPropagation();
      closePanels();
      const app = t.tools.find((x) => x.id === b.dataset.keys);
      keysSheet(app, p);
    };
  }

  for (const b of document.querySelectorAll('[data-use]')) {
    b.onclick = (e) => {
      if (e.target.dataset.forget) return;
      e.stopPropagation();
      const [tool, name] = b.dataset.use.split('|');
      chosen.account[tool] = name;
      closePanels();
      draw();
    };
  }

  for (const s of document.querySelectorAll('[data-forget]')) {
    s.onclick = async (e) => {
      e.stopPropagation();
      const [tool, name] = s.dataset.forget.split('|');
      const sure = await confirmThat({
        title: 'Throw this account away',
        what: `The kept copy of “${name}” is deleted from this computer.`,
        why: 'You would have to sign in to that account again to get it back.',
        confirm: 'Throw it away',
        danger: true,
      });
      if (!sure) return;
      if (chosen.account[tool] === name) delete chosen.account[tool];
      say(await post('/profile/forget', { tool, name }));
      draw();
    };
  }

  for (const b of document.querySelectorAll('[data-keep]')) {
    b.onclick = async (e) => {
      e.stopPropagation();
      closePanels();
      const name = await ask({
        title: 'Keep this account',
        label: 'What should it be called? Something you will recognise — “work”, “personal”.',
        placeholder: 'work',
        confirm: 'Keep it',
      });
      if (!name) return;
      say(await post('/profile/save', { tool: b.dataset.keep, name }));
      draw();
    };
  }

  for (const b of document.querySelectorAll('[data-install]')) {
    b.onclick = async () => {
      b.classList.add('working');
      const r = await post('/install', { tool: b.dataset.install });
      if (r.ok) watchJob(r.job); else { say(r); draw(); }
    };
  }

  for (const b of document.querySelectorAll('[data-getpage]')) {
    b.onclick = () => post('/open/page', { at: b.dataset.getpage });
  }
}

/**
 * Carrying the link out of the window it was printed in.
 *
 * These apps run their own sign-in and most of them open your browser for you.
 * Some do not: they print an address into the terminal and wait, which leaves
 * you looking at eighty characters of nonsense with no way forward that does not
 * involve selecting text in a black window. OpenCode does exactly this.
 *
 * We cannot read what that window printed — it is not ours to read, and taking
 * its output away from it would break the sign-in it is in the middle of. What
 * we can do is take the line off your hands: paste it here and the browser opens
 * at it. One press instead of a fight with a mouse.
 *
 * Offered every time rather than only when needed, because the alternative is
 * guessing which apps do this, and being wrong about it is exactly the failure
 * this is here to fix.
 */
function carryTheLink(app) {
  sheet({
    title: `Signing in to ${app.name ?? 'this app'}`,
    narrow: true,
    body: `
      <p class="sub">Its own sign-in is running in the window that just opened. Most
        of them open your browser by themselves — if yours did, you are done here
        and can close this.</p>
      <p class="sub">If instead it printed a long address and is waiting, copy that
        line and put it below. Nothing about it is kept.</p>
      <label class="field">The address it printed</label>
      <input id="link-at" style="width:100%" placeholder="https://…" spellcheck="false">
      <div class="said" id="link-said" hidden></div>`,
    foot: `<button class="quiet" id="link-close">Close</button>
      <button class="go" id="link-go">Open it in my browser</button>`,
    onOpen: () => {
      const box = $('#link-at');
      box.focus();

      const open = async () => {
        // Pasting a whole terminal line is the normal case, so the address is
        // picked out of whatever came with it rather than being demanded clean.
        const found = String(box.value).match(/https:\/\/\S+/);
        const trouble = $('#link-said');
        if (!found) {
          trouble.hidden = false;
          trouble.className = 'said bad';
          trouble.innerHTML = '<b>There is no address in that.</b><span>It starts with https:// and is usually the longest line in the window.</span>';
          return;
        }
        const r = await post('/open/page', { at: found[0] });
        trouble.hidden = false;
        trouble.className = r.ok ? 'said good' : 'said bad';
        trouble.innerHTML = r.ok
          ? '<b>Your browser is opening at it.</b><span>Finish there and the window behind this one carries on by itself.</span>'
          : `<b>${esc(r.sentence)}</b><span>${esc(r.action ?? '')}</span>`;
      };

      $('#link-go').onclick = open;
      box.onkeydown = (e) => { if (e.key === 'Enter') open(); };
      $('#link-close').onclick = () => { closeLayer(); draw(); };
    },
  });
}

/**
 * Signing in with a key.
 *
 * Kept off the card on purpose. A key is not an account: it identifies a
 * project's billing rather than a person, it does not expire when you leave,
 * and pasting one is a different act from signing in. The apps that only work
 * this way say so; for the rest it is the way round when an account cannot be
 * had.
 */
function keysSheet(app, p) {
  sheet({
    title: `Use a key with ${app.name}`,
    narrow: true,
    body: `
      <p class="sub">A key is not an account. It identifies a project rather than a
        person and it does not stop working when you sign out somewhere else — so
        keep it as carefully as a password.</p>
      <div class="menu">
        ${app.keys.map((k) => `
          <button class="opt" data-usekey="${esc(k.id)}">
            <span class="glyph">⚿</span>
            <span><span class="what">${esc(k.name)}</span><br>
              <span class="why">${esc(k.then ?? 'Paste it in the window that opens.')}</span></span>
          </button>`).join('')}
      </div>`,
    onOpen: (body) => {
      for (const b of body.querySelectorAll('[data-usekey]')) {
        b.onclick = async () => {
          closeLayer();
          say(await post('/signin/tool', { tool: app.id, method: b.dataset.usekey, dir: whereFor(app.id, p) }));
          draw();
        };
      }
    },
  });
}

function whichTerminal(toolId, dir, terminals) {
  sheet({
    title: 'Which terminal?',
    narrow: true,
    body: `<div class="menu">${terminals.map((t) => `
      <button class="opt" data-in="${esc(t.id)}">
        <span class="glyph">❯</span>
        <span><span class="what">${esc(t.name)}</span><br><span class="why">${esc(t.blurb)}</span></span>
      </button>`).join('')}</div>`,
    onOpen: () => {
      for (const b of document.querySelectorAll('[data-in]')) {
        b.onclick = async () => {
          closeLayer();
          say(await post('/launch', {
            tool: toolId, how: 'terminal', terminal: b.dataset.in, dir,
            profile: chosen.account[toolId] ?? null,
          }));
          draw();
        };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Terminals
// ---------------------------------------------------------------------------

SCREENS.terminals = async () => {
  const [{ terminals }, p] = await Promise.all([get('/terminals'), get('/project')]);
  const dir = whereFor(null, p);

  view.innerHTML = `
    <h1>Terminals</h1>
    <p class="sub">Each of these opens already inside the folder above, so the first thing
      you type is the thing you meant to type.</p>
    ${whereBar(p)}
    ${saidHtml()}

    <h2>On this computer</h2>
    <div class="grid">
      ${terminals.map((t) => `
        <div class="tile flat">
          <div class="top"><span class="dot live"></span><span class="title">${esc(t.name)}</span></div>
          <div class="note">${esc(t.blurb)}</div>
          <div class="doing">
            <button class="go small" data-open-term="${esc(t.id)}" ${dir ? '' : 'disabled'}>Open here</button>
          </div>
        </div>`).join('')}
    </div>`;
  said = null;

  wireWhereBar();

  for (const b of document.querySelectorAll('[data-open-term]')) {
    b.onclick = async () => {
      b.classList.add('working');
      say(await post('/terminal', { terminal: b.dataset.openTerm, dir: whereFor(null, p) }));
      draw();
    };
  }
};

// ---------------------------------------------------------------------------
// Putting it out into the world
// ---------------------------------------------------------------------------

let watching = null;

SCREENS.ship = async () => {
  const d = await get('/ship');
  if (!d.open) {
    view.innerHTML = `<h1>Deploy</h1>
      <div class="empty"><b>No project is open.</b> Pick one first and this page fills in.</div>`;
    return;
  }

  const { site, app } = d;

  view.innerHTML = `
    <h1>Deploy</h1>
    <p class="sub">Two different errands, because they really are different. A website
      lives at an address and gets replaced whole. An application is downloaded and
      installed, and old copies stay out there.</p>
    ${saidHtml()}
    <div class="split">
      <div class="card">
        <h2 style="margin-top:0">A website</h2>
        <p class="note" style="color:var(--quiet);font-size:.88rem">
          People visit an address and see the newest version. Putting up a new one
          replaces the old one everywhere, at once.</p>
        ${site.buildStep ? '<p class="chip cool">this project builds itself first</p>' : ''}
        ${d.project?.shared ? '' : `
          <div class="row" style="margin-bottom:.6rem">
            <span class="dot attention"></span>
            <div class="grow"><div class="name">This project is not on GitHub yet</div>
              <div class="note">Everything below needs it there first. One question and it is.</div></div>
            <button class="go small" id="dep-publish">Put it on GitHub…</button>
          </div>`}

        <div style="margin-top:.8rem">
          ${site.places.map((pl) => `
            <div class="row" style="margin-bottom:.4rem">
              <span class="dot ${pl.ready ? 'live' : 'off'}"></span>
              <div class="grow"><div class="name">${esc(pl.name)}</div>
                <div class="note">${esc(pl.ready ? pl.blurb : pl.missing ?? pl.blurb)}</div></div>
              <button class="${pl.ready ? 'go ' : ''}small" data-site="${esc(pl.id)}" ${pl.ready ? '' : 'disabled'}>Put it up</button>
            </div>`).join('')}
        </div>
      </div>

      <div class="card">
        <h2 style="margin-top:0">An application</h2>
        <p class="note" style="color:var(--quiet);font-size:.88rem">
          People download a file and install it. Whatever they installed stays installed
          until they take a newer one, so every version you put out lives on.</p>
        ${app.packStep
          ? `<p class="chip cool">builds with this project's own “${esc(app.packStep)}” step</p>`
          : '<p class="chip attention">this project does not say how to build itself yet</p>'}
        ${app.installers.length ? `
          <div style="margin-top:.8rem">
            ${app.installers.map((f) => `
              <div class="row" style="margin-bottom:.4rem">
                <span class="dot live"></span>
                <div class="grow"><div class="name">${esc(f.name)}</div>
                  <div class="note">${esc(size(f.size))} · already built, in ${esc(f.where)}</div></div>
              </div>`).join('')}
          </div>` : ''}
        <div class="bar" style="margin:.8rem 0 0">
          <button class="go small" id="app-build" ${app.packStep || app.manager === 'cargo' ? '' : 'disabled'}>Build it</button>
          <button class="small" id="app-out" ${app.canRelease && (app.packStep || app.installers.length) ? '' : 'disabled'}>Build and give it out</button>
        </div>
        ${app.canRelease ? '' : `
          <p class="note" style="color:var(--quiet);font-size:.85rem;margin-top:.6rem">
            Giving it out needs a copy of this project on GitHub, and you signed in to it.
            ${d.project?.shared ? '' : '<button class="quiet small" id="dep-publish2">Put it on GitHub…</button>'}</p>`}
      </div>
    </div>

    <div id="job"></div>`;
  said = null;

  for (const id of ['#dep-publish', '#dep-publish2']) {
    $(id)?.addEventListener('click', () => firstTimeSheet());
  }

  for (const b of document.querySelectorAll('[data-site]')) {
    b.onclick = async () => {
      b.classList.add('working');
      const r = await post('/ship/site', { place: b.dataset.site });
      if (r.ok) watchJob(r.job); else { say(r); draw(); }
    };
  }
  $('#app-build').onclick = async () => {
    const r = await post('/ship/app', { giveOut: false });
    if (r.ok) watchJob(r.job); else { say(r); draw(); }
  };
  $('#app-out').onclick = async () => {
    const version = await ask({
      title: 'Give it out',
      label: 'What version is this? People will see this number.',
      value: app.version ?? '1.0.0',
      confirm: 'Build and give it out',
    });
    if (!version) return;
    const r = await post('/ship/app', { giveOut: true, version });
    if (r.ok) watchJob(r.job); else { say(r); draw(); }
  };

  // Redraw the errand once, without starting a second loop watching it.
  if (watching) paintJob({ again: !jobTimer });
};

/**
 * Watching a long errand, with exactly one loop doing the watching.
 *
 * This is where three separate complaints all came from — the app refreshing by
 * itself, flashing while something was deploying or being offered, and losing
 * your place when you had scrolled down. One cause, and it multiplies.
 *
 * Every screen that can show an errand ended with `if (watching) paintJob()`,
 * and `paintJob` ended by asking for itself again in a second. Nothing stopped
 * the loop that was already running. So each redraw *added* a loop: deploy
 * something, change tabs twice, and four independent pollers are now replacing
 * the same piece of the page every second, each on its own beat. That is what
 * the flashing was. It is also why it got worse the longer you used it.
 *
 * Now: one timer, held here, cancelled before another is ever set. Starting a
 * watch twice is starting it once.
 */
let jobTimer = null;
let jobShown = null;

function stopWatchingJob() {
  clearTimeout(jobTimer);
  jobTimer = null;
}

async function watchJob(id) {
  stopWatchingJob();
  watching = id;
  jobShown = null;
  await paintJob();
}

/**
 * Draw the errand, changing only what changed.
 *
 * The whole panel used to be rebuilt every second, which threw away the open or
 * closed state of what it printed, threw away where you had scrolled inside it,
 * and — because it is inside the page's one scroll container — could move the
 * page under you. Lines are appended now, and the rest is written only when its
 * text is actually different.
 */
async function paintJob({ again = true } = {}) {
  const box = $('#job');
  if (!box || !watching) return;

  const j = await get(`/job?id=${encodeURIComponent(watching)}`);
  if (j.ok === false && !j.lines) { watching = null; stopWatchingJob(); return; }

  // Built once. Everything after this is an edit, not a replacement.
  if (jobShown !== watching) {
    jobShown = watching;
    box.innerHTML = `
      <h2>${esc(j.what)}</h2>
      <div class="card">
        <div class="bar" style="margin-bottom:.7rem">
          <span id="job-mark"></span>
          <b id="job-says"></b>
          <span style="flex:1"></span>
          <span id="job-clear"></span>
        </div>
        <p class="note" id="job-does" style="color:var(--quiet);margin:0 0 .7rem;display:none"></p>
        <ul class="steps" id="job-steps"></ul>
        <details id="job-more">
          <summary style="cursor:pointer;color:var(--quiet);font-size:var(--t-sub)">What it printed</summary>
          <div class="log" id="job-log" style="margin-top:.5rem"></div>
        </details>
      </div>`;
  }

  const set = (id, html) => {
    const el = $(`#${id}`);
    if (el && el.innerHTML !== html) el.innerHTML = html;
  };

  set('job-mark', j.running
    ? '<span class="spin"></span>'
    : `<span class="dot ${j.ok ? 'live' : 'trouble'}"></span>`);
  set('job-says', esc(j.running ? 'Working on it. This can take a few minutes.' : j.sentence ?? ''));
  set('job-clear', j.running ? '' : '<button class="quiet small" id="job-close">clear</button>');
  set('job-steps', j.steps.map((s) => `<li><span class="tick">✓</span> ${esc(s.sentence)}</li>`).join(''));

  const does = $('#job-does');
  if (does) {
    const words = j.action && !j.running ? esc(j.action) : '';
    if (does.innerHTML !== words) does.innerHTML = words;
    does.style.display = words ? '' : 'none';
  }

  // Appended rather than rewritten, and only the lines that are new. A log that
  // is thrown away and rebuilt per line cannot be read while it is running.
  const log = $('#job-log');
  if (log) {
    const had = Number(log.dataset.lines ?? 0);
    if (j.lines.length < had) { log.textContent = ''; log.dataset.lines = '0'; }
    const fresh = j.lines.slice(Number(log.dataset.lines ?? 0));
    if (fresh.length) {
      const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      log.append(document.createTextNode(`${fresh.join('\n')}\n`));
      log.dataset.lines = String(j.lines.length);
      // Follows along only if you were already at the bottom. Scrolling back to
      // read something is a decision, and it is not ours to undo every second.
      if (nearBottom) log.scrollTop = log.scrollHeight;
    }
  }

  const more = $('#job-more');
  if (more && j.ok === false && !more.dataset.opened) { more.open = true; more.dataset.opened = '1'; }

  $('#job-close')?.addEventListener('click', () => {
    watching = null;
    stopWatchingJob();
    box.innerHTML = '';
    jobShown = null;
  });

  stopWatchingJob();
  if (!again) return;

  if (j.running) {
    jobTimer = setTimeout(paintJob, 1000);
  } else {
    // Finished. The page is told once, quietly, so what changed underneath the
    // errand appears — and never with a full redraw, which is what made the
    // whole application blink at the end of every deploy.
    jobTimer = setTimeout(() => { if (!layer.innerHTML) draw({ quietly: true }); }, 600);
  }
}

// ---------------------------------------------------------------------------
// Shared workspace
// ---------------------------------------------------------------------------

let workspaceTimer = null;

SCREENS.workspace = async () => {
  clearTimeout(workspaceTimer);
  const w = await get('/workspace');

  if (!w.joined) {
    view.innerHTML = `
      <h1>Shared workspace</h1>
      <p class="sub">Every computer signed in to the same GitHub account, in one place —
        and folders that go straight from one to another across your own network.</p>
      ${saidHtml()}
      <div class="card">
        <p style="margin-top:0">Joining makes one small private project on your own GitHub
          account called <b>viberant-workspace</b>. Every computer you sign in on puts three
          things in it: who it is, which projects it is offering, and anything you type here.
          There is no service of ours in the middle.</p>
        <p style="color:var(--quiet);font-size:.89rem">It also puts one random number in there,
          which is what lets two computers on the same network recognise each other as
          <b>yours</b> — being signed in to the same account is a claim anybody nearby could
          make, and holding a number out of a project only you can read is not.</p>
        <p style="color:var(--quiet);font-size:.89rem">Folders never go through GitHub. They go
          straight from one computer to the other across your own network, and only when
          somebody asks for one.</p>
        <div class="bar" style="margin:1rem 0 0">
          <button class="go" id="w-join" ${me.github ? '' : 'disabled'}>Join my shared workspace</button>
          ${me.github ? '' : '<span class="note" style="color:var(--quiet)">Sign in to GitHub first — the account button is at the bottom left.</span>'}
        </div>
      </div>`;
    said = null;
    $('#w-join')?.addEventListener('click', async () => {
      const b = $('#w-join');
      b.disabled = true;
      b.textContent = 'Joining…';
      say(await post('/workspace/join'));
      await refreshMe();
      draw();
    });
    return;
  }

  const known = w.machines ?? [];
  const nearby = new Map((w.around ?? []).map((m) => [m.machine, m]));
  const mine = known.find((m) => m.you);
  const others = known.filter((m) => !m.you);
  const theirs = (w.projects ?? []).filter((p) => !p.yours);
  const reachable = others.filter((m) => nearby.has(m.id)).length;

  view.innerHTML = `
    <h1>Shared workspace</h1>
    <p class="sub">Every computer signed in to <b>${esc(w.account ?? '')}</b> on GitHub.
      Folders move straight between them across this network — never through GitHub.
      ${w.mismatch ? '<b style="color:var(--attention)">You are signed in as somebody else right now, so this is out of step.</b>' : ''}</p>
    ${saidHtml()}
    ${w.trouble ? `<div class="said bad"><b>${esc(w.trouble.sentence)}</b>
      <span>${esc(w.trouble.action ?? '')}</span>
      <span>Until this is fixed, your other computers cannot see this one at all.</span></div>` : ''}

    <div class="tally">
      <div class="one"><b>${known.length}</b><span>computer${known.length === 1 ? '' : 's'} in all</span></div>
      <div class="one ${reachable ? '' : 'warn'}"><b>${reachable}</b><span>reachable on this network</span></div>
      <div class="one"><b>${(w.offers ?? []).length}</b><span>folder${(w.offers ?? []).length === 1 ? '' : 's'} you are offering</span></div>
      <div class="grow"></div>
      <div class="one">
        <b style="font-size:1rem;line-height:2">${w.sharingHere ? '● on' : '○ off'}</b>
        <span>this computer can be reached</span>
      </div>
    </div>

    <h2>Your other computers</h2>
    ${others.length ? `<div class="lane">${others.map((m) => {
    const near = nearby.get(m.id);
    return `
      <div class="slab" style="cursor:default">
        <span class="dot ${near ? 'live' : m.hereNow ? 'attention' : 'off'}"></span>
        <div class="grow">
          <div class="line1"><b>${esc(m.name)}</b>
            <span class="chip">${esc(m.kind ?? '')}</span>
            ${near ? '<span class="chip live">on this network</span>' : ''}</div>
          <div class="fact">${near ? 'Here now, and folders can move both ways.'
      : m.hereNow ? 'Signed in, but not on this network — notes travel, folders cannot.'
        : `Last seen ${ago(m.lastHere)}.`}</div>
          ${m.workingOn ? `<div class="did">Working on ${esc(m.workingOn)}</div>` : ''}
        </div>
        <div class="acts">
          ${near ? `<button class="go small" data-peek="${esc(m.id)}">See what it is offering</button>` : ''}
        </div>
      </div>`;
  }).join('')}</div>`
    : `<div class="empty"><b>Only this computer so far.</b>
         Install Viberant on another one, sign in to the same GitHub account, and press Join there.</div>`}

    <h2>This computer</h2>
    <div class="slab" style="cursor:default">
      <span class="dot ${w.sharingHere ? 'live' : 'off'}"></span>
      <div class="grow">
        <div class="line1"><b>${esc(mine?.name ?? me.machineName)}</b>
          <span class="chip vibe">this one</span></div>
        <div class="fact">${w.sharingHere
    ? 'Your other computers can find this one and ask it for what it offers.'
    : 'Not reachable by your other computers at the moment.'}</div>
      </div>
      <div class="acts">
        <button class="small" id="w-rename">Rename</button>
        ${w.sharingHere ? '' : '<button class="go small" id="w-share-on">Let the others reach it</button>'}
      </div>
    </div>

    <h2>Folders this computer is offering</h2>
    ${(w.offers ?? []).length ? `<div class="lane">${(w.offers ?? []).map((o) => `
      <div class="slab" style="cursor:default">
        <span class="dot live"></span>
        <div class="grow">
          <div class="line1"><b>${esc(o.name)}</b>
            <span class="chip">${o.files} files</span>
            <span class="chip">${esc(size(o.bytes))}</span>
            ${o.everything ? '<span class="chip">everything included</span>' : ''}</div>
          <div class="fact">Any of your computers on this network can take a copy — when it asks.</div>
          <div class="path">${esc(o.path ?? '')}</div>
        </div>
        <div class="acts"><button class="quiet small" data-unoffer="${esc(o.id)}">Stop offering</button></div>
      </div>`).join('')}</div>`
    : `<div class="empty"><b>Nothing offered yet.</b>
         Offer a folder and your other computers can take a copy. Nothing moves until one asks.</div>`}
    <div class="bar" style="margin-top:.6rem">
      <button class="go" id="w-offer-folder">Offer a folder…</button>
    </div>

    <h2>Projects your other computers have</h2>
    ${theirs.length ? `<div class="lane">${theirs.map((p) => `
      <div class="slab" style="cursor:default">
        <span class="dot ${p.url ? 'live' : 'off'}"></span>
        <div class="grow">
          <div class="line1"><b>${esc(p.name)}</b>
            ${p.kind ? `<span class="chip">${esc(p.kind)}</span>` : ''}
            <span class="chip">on ${esc(p.fromName)}</span></div>
          <div class="fact">${esc(p.says ?? '')}</div>
          ${p.lastDid ? `<div class="did">Last time: ${esc(p.lastDid)}</div>` : ''}
          ${p.url ? '' : '<div class="did">No copy on GitHub — ask that computer to offer the folder instead.</div>'}
        </div>
        <div class="acts">
          <button class="small" data-bring='${esc(JSON.stringify(p))}' ${p.url ? '' : 'disabled'}>Bring it from GitHub</button>
        </div>
      </div>`).join('')}</div>`
    : `<div class="empty"><b>Nothing listed yet.</b>
         Every project on your other computers shows here unless it is marked private there.</div>`}

    <h2>Notes between your computers</h2>
    <div class="card">
      <div class="talk" id="talk">
        ${(w.said ?? []).map((s) => `
          <div class="bubble ${s.you ? 'mine' : ''}">
            <div style="font-size:.74rem;color:var(--faint)">${esc(s.fromName)} · ${ago(s.at)}</div>
            ${esc(s.text)}
          </div>`).join('') || '<p style="color:var(--quiet);margin:0">Nothing said yet. Leave a note for whichever computer you sit at next.</p>'}
      </div>
      <div class="bar" style="margin:.8rem 0 0">
        <input id="w-say" placeholder="Leave a note for your other computer" style="flex:1">
        <button class="go" id="w-send">Say it</button>
      </div>
    </div>

    <div class="bar" style="margin-top:1.6rem">
      <button class="quiet small" id="w-refresh">Check again now</button>
      <button class="quiet small danger" id="w-leave">Take this computer out of the workspace</button>
    </div>

    <div id="job"></div>`;
  said = null;

  const talk = $('#talk');
  if (talk) talk.scrollTop = talk.scrollHeight;

  $('#w-say').onkeydown = (e) => { if (e.key === 'Enter') $('#w-send').click(); };
  $('#w-send').onclick = async () => {
    const text = $('#w-say').value.trim();
    if (!text) return;
    $('#w-say').value = '';
    const r = await post('/workspace/say', { text });
    if (!r.ok) say(r);
    draw();
  };
  // Acknowledged before anything is asked of the manager, per D-62 — this
  // reaches GitHub and takes seconds, and it used to look untouched for all of
  // them. What came back used to be thrown away too, so a computer that could
  // not write a word of what it knew pressed this and was told nothing at all.
  $('#w-refresh').onclick = async () => {
    const b = $('#w-refresh');
    b.disabled = true;
    b.textContent = 'Checking…';
    const r = await post('/workspace/refresh');
    say(r.ok === false ? r : (r.trouble ?? { ok: true, sentence: 'Checked. Everything this computer knows has gone out.' }));
    draw();
  };
  $('#w-share-on')?.addEventListener('click', async () => { say(await post('/local/on')); await refreshMe(); draw(); });
  $('#w-rename')?.addEventListener('click', async () => {
    const name = await ask({
      title: 'Name this computer',
      label: 'What should your other computers call it?',
      value: me.machineName,
      confirm: 'Call it that',
    });
    if (!name) return;
    say(await post('/settings', { id: 'machineName', value: name }));
    await post('/workspace/refresh');
    await refreshMe();
    draw();
  });
  $('#w-offer-folder').onclick = offerFolder;
  $('#w-leave').onclick = async () => {
    const sure = await confirmThat({
      title: 'Take this computer out',
      what: 'This computer stops appearing to the others.',
      why: 'Nothing on it is touched, and nothing of yours on GitHub is deleted. You can join again whenever.',
      confirm: 'Take it out',
      danger: true,
    });
    if (!sure) return;
    say(await post('/workspace/leave'));
    await refreshMe();
    draw();
  };

  for (const b of document.querySelectorAll('[data-peek]')) b.onclick = () => peekAt(b.dataset.peek, w);
  for (const b of document.querySelectorAll('[data-unoffer]')) {
    b.onclick = async () => { say(await post('/local/withdraw', { id: b.dataset.unoffer })); draw(); };
  }
  for (const b of document.querySelectorAll('[data-bring]')) {
    b.onclick = async () => {
      const entry = JSON.parse(b.dataset.bring);
      const into = await pickFolder({ title: `Where should ${entry.name} go?`, confirm: 'Put it in here', startAt: w.workFolder });
      if (!into) return;
      say({ sentence: `Bringing ${entry.name} to this computer…` });
      draw();
      say(await post('/workspace/bring', { entry, into }));
      await refreshMe();
      draw();
    };
  }

  // Redraw the errand once, without starting a second loop watching it.
  if (watching) paintJob({ again: !jobTimer });
  workspaceTimer = setTimeout(() => {
    if (at.tab === 'workspace' && !layer.innerHTML && !watching) draw({ quietly: true });
  }, 20000);
};

/** Offer a folder to the other computers on this network. */
async function offerFolder() {
  const path = await pickFolder({ title: 'Which folder do you want to offer?', confirm: 'Offer this folder' });
  if (!path) return;

  const light = await post('/local/weigh', { path, everything: false });
  const heavy = await post('/local/weigh', { path, everything: true });

  sheet({
    title: `Offer ${tail(path)}`,
    narrow: true,
    body: `
      <p class="sub">Your other computers will see this in their list. Nothing moves until
        one of them asks for it, and it goes straight across your network — never through
        GitHub and never through anything of ours.</p>
      <div class="menu">
        <button class="opt" data-offer="0">
          <span class="glyph">◔</span>
          <span><span class="what">Just the work — ${esc(light.says)}</span><br>
            <span class="why">Leaves out the folders that get rebuilt anyway, like node_modules and build output.
              ${light.skipped ? `${light.skipped} of them here.` : ''}</span></span>
        </button>
        <button class="opt" data-offer="1">
          <span class="glyph">●</span>
          <span><span class="what">Everything — ${esc(heavy.says)}</span><br>
            <span class="why">Exactly what is in the folder, including everything that could be rebuilt.</span></span>
        </button>
      </div>`,
    onOpen: () => {
      for (const b of document.querySelectorAll('[data-offer]')) {
        b.onclick = async () => {
          closeLayer();
          say(await post('/local/offer', { path, everything: b.dataset.offer === '1' }));
          draw();
        };
      }
    },
  });
}

/** What one of your computers has on offer right now. */
async function peekAt(machineId, w) {
  const which = (w.machines ?? []).find((m) => m.id === machineId);
  sheet({
    title: `What ${which?.name ?? 'it'} is offering`,
    body: '<div class="row"><span class="spin"></span><div class="grow">Asking it…</div></div>',
    onOpen: async (body) => {
      const r = await get(`/local/offers?machine=${encodeURIComponent(machineId)}`);
      if (!r.ok) {
        body.innerHTML = `<p><b>${esc(r.sentence)}</b><br><span style="color:var(--quiet)">${esc(r.action ?? '')}</span></p>`;
        return;
      }
      if (!r.offers.length) {
        body.innerHTML = `<div class="empty"><b>${esc(r.from)} is not offering anything.</b>
          On that computer, use “Offer a folder” and it will show up here.</div>`;
        return;
      }
      body.innerHTML = `
        <p class="sub">Choose one and say where it should go. It comes straight across your
          network. Nothing on this computer is changed until you pick a folder.</p>
        ${r.offers.map((o) => `
          <div class="row">
            <span class="dot live"></span>
            <div class="grow"><div class="name">${esc(o.name)}</div>
              <div class="note">${o.files} files · ${esc(size(o.bytes))}${o.everything ? ' · everything included' : ''}
                ${o.about ? ` · ${esc(o.about)}` : ''}</div></div>
            <button class="go small" data-take="${esc(o.id)}" data-name="${esc(o.name)}">Bring it here…</button>
          </div>`).join('')}`;

      for (const b of body.querySelectorAll('[data-take]')) {
        b.onclick = async () => {
          closeLayer();
          const into = await pickFolder({
            title: `Where should ${b.dataset.name} go on this computer?`,
            confirm: 'Put it in here',
            startAt: w.workFolder,
          });
          if (!into) return;
          const started = await post('/local/take', {
            machine: machineId, offer: b.dataset.take, name: b.dataset.name, into,
          });
          if (started.ok) watchJob(started.job); else { say(started); draw(); }
        };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

SCREENS.settings = async () => {
  const [{ settings, record }, { terminals }] = await Promise.all([post('/settings'), get('/terminals')]);

  view.innerHTML = `
    <h1>Settings</h1>
    <p class="sub">Everything here changes how the manager behaves, never what it tells you
      is true.</p>
    ${saidHtml()}

    <div class="card">
      ${settings.map((s) => `
        <div class="setting">
          <div class="about"><b>${esc(s.name)}</b><span>${esc(s.why)}</span></div>
          <div class="set">${control(s, terminals)}</div>
        </div>`).join('')}
    </div>

    <h2>This computer</h2>
    <div class="card">
      <div class="setting">
        <div class="about"><b>Everything the manager has written down</b>
          <span>A folder of plain text files. Open it in Explorer, read any of it, delete the
            folder and it is as if this never ran.</span></div>
        <div class="set"><button class="small" id="open-record">Open the folder</button></div>
      </div>
      <div class="setting">
        <div class="about"><b>Where it keeps them</b><span>${esc(record)}</span></div>
        <div class="set"></div>
      </div>
      <div class="setting">
        <div class="about"><b>Put every setting back</b>
          <span>Only the settings above. Your projects, accounts and history are untouched.</span></div>
        <div class="set"><button class="small danger" id="reset">Put them back</button></div>
      </div>
    </div>`;
  said = null;

  for (const b of document.querySelectorAll('[data-toggle]')) {
    b.onclick = async () => {
      await post('/settings', { id: b.dataset.toggle, value: b.dataset.now !== '1' });
      await refreshMe();
      draw();
    };
  }
  for (const b of document.querySelectorAll('[data-text]')) {
    b.onclick = async () => {
      const value = await ask({
        title: b.dataset.title,
        label: b.dataset.title,
        value: b.dataset.value,
        confirm: 'Save',
      });
      if (!value) return;
      say(await post('/settings', { id: b.dataset.text, value }));
      await refreshMe();
      draw();
    };
  }
  for (const b of document.querySelectorAll('[data-folder]')) {
    b.onclick = async () => {
      const path = await pickFolder({ title: b.dataset.title, confirm: 'Use this folder', startAt: b.dataset.value });
      if (!path) return;
      say(await post('/settings', { id: b.dataset.folder, value: path }));
      await refreshMe();
      draw();
    };
  }
  for (const sel of document.querySelectorAll('[data-choose]')) {
    sel.onchange = async () => {
      say(await post('/settings', { id: sel.dataset.choose, value: sel.value }));
      await refreshMe();
      draw();
    };
  }

  $('#open-record').onclick = async () => { say(await post('/settings/openRecord')); draw(); };
  $('#reset').onclick = async () => {
    const sure = await confirmThat({
      title: 'Put every setting back',
      what: 'Every setting goes back to how it started.',
      why: 'Your projects, your accounts and everything written down are untouched.',
      confirm: 'Put them back',
      danger: true,
    });
    if (!sure) return;
    say(await post('/settings/reset'));
    await refreshMe();
    draw();
  };
};

function control(s, terminals) {
  if (s.kind === 'yesNo') {
    return `<button class="switch ${s.value ? 'on' : ''}" data-toggle="${esc(s.id)}"
      data-now="${s.value ? '1' : '0'}" aria-label="${esc(s.name)}"></button>`;
  }
  if (s.kind === 'choice') {
    return `<select data-choose="${esc(s.id)}">
      ${s.choices.map((c) => `<option value="${esc(c.id)}" ${c.id === s.value ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
    </select>`;
  }
  if (s.kind === 'terminal') {
    return `<select data-choose="${esc(s.id)}">
      <option value="">Whichever is here</option>
      ${terminals.map((t) => `<option value="${esc(t.id)}" ${t.id === s.value ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
    </select>`;
  }
  if (s.kind === 'folder') {
    return `<button class="small" data-folder="${esc(s.id)}" data-title="${esc(s.name)}"
      data-value="${esc(s.value ?? '')}">${esc(tail(s.value) || 'Choose…')}</button>`;
  }
  if (s.kind === 'secret') {
    // Never carries the value, in or out. The page is only ever told whether
    // there is one, and it only ever sends a new one.
    return `<button class="small" data-text="${esc(s.id)}" data-title="${esc(s.name)}" data-value="">
      ${s.value ? 'Set — replace it' : 'Set…'}</button>`;
  }
  return `<button class="small" data-text="${esc(s.id)}" data-title="${esc(s.name)}"
    data-value="${esc(s.value ?? '')}">${esc(shortened(s.value) || 'Set…')}</button>`;
}

/** Long enough to recognise, short enough not to push the row off the edge. */
const shortened = (value) => {
  const s = String(value ?? '');
  return s.length > 34 ? `${s.slice(0, 16)}…${s.slice(-12)}` : s;
};

// ---------------------------------------------------------------------------
// Telling us what is wrong
// ---------------------------------------------------------------------------

SCREENS.feedback = async () => {
  const d = await get('/feedback');

  view.innerHTML = `
    <h1>Tell us what is wrong</h1>
    <p class="sub">This is early, and the most useful thing anybody can do is say
      what annoyed them the moment it happened — before you have worked around it
      and forgotten. It goes to the project's own list on GitHub.</p>
    ${saidHtml()}

    <div class="card">
      <label class="field">What happened?</label>
      <textarea id="fb-what" rows="5" style="width:100%;margin-bottom:1rem"
        placeholder="I pressed Open on Antigravity and nothing appeared."></textarea>

      <label class="field">What kind of thing is it?</label>
      <div class="menu" style="margin-bottom:1rem">
        ${d.kinds.map((k, i) => `
          <button class="opt ${i === 0 ? 'on' : ''}" data-kind="${esc(k.id)}">
            <span class="glyph">${['✕', '?', '＋', '✓'][i] ?? '·'}</span>
            <span><span class="what">${esc(k.name)}</span><br><span class="why">${esc(k.blurb)}</span></span>
          </button>`).join('')}
      </div>

      <div class="bar" style="margin:0">
        <button class="go" id="fb-send" ${me.github ? '' : 'disabled'}>Send it</button>
        <span class="note" style="color:var(--quiet);font-size:.84rem">
          ${me.github
    ? 'What you typed, plus which computer and which version. Nothing about your projects.'
    : 'Sign in to GitHub first — it is sent as you, to the project\'s own list.'}
        </span>
      </div>
    </div>

    ${d.said.length ? `
      <h2>What you have said before</h2>
      <div class="lane">
        ${d.said.slice(0, 12).map((s) => `
          <div class="slab" style="cursor:default">
            <span class="spine clean"></span>
            <div class="grow">
              <div class="line1"><b>${esc(d.kinds.find((k) => k.id === s.kind)?.name ?? s.kind)}</b>
                <span class="chip">${ago(s.at)}</span></div>
              <div class="fact">${esc(s.what)}</div>
            </div>
          </div>`).join('')}
      </div>` : ''}`;
  said = null;

  let kind = d.kinds[0]?.id ?? 'wrong';
  for (const b of document.querySelectorAll('[data-kind]')) {
    b.onclick = () => {
      kind = b.dataset.kind;
      for (const o of document.querySelectorAll('[data-kind]')) o.classList.remove('on');
      b.classList.add('on');
    };
  }
  $('#fb-send').onclick = async () => {
    const what = $('#fb-what').value.trim();
    if (!what) return;
    $('#fb-send').disabled = true;
    $('#fb-send').textContent = 'Sending…';
    say(await post('/feedback', { what, kind }));
    draw();
  };
};

// ---------------------------------------------------------------------------
// The same project, on two computers at once
// ---------------------------------------------------------------------------

/**
 * What the other computers are doing to the projects you also have.
 *
 * Asked every few seconds while the app is open, because the whole value of it
 * is that "your laptop has newer work" appears while you still care. Comparing
 * two short fingerprints costs nothing on either side — no files move to find
 * out whether any file should.
 *
 * It never syncs anything. It raises things; you decide.
 */
let liveTimer = null;
let liveNews = [];
let liveSeen = '';

async function watchTheOthers() {
  clearTimeout(liveTimer);
  const again = (ms) => { liveTimer = setTimeout(watchTheOthers, ms); };

  if (document.hidden || !me.sharingHere) return again(8000);

  const r = await get('/live');
  liveNews = r.news ?? [];

  // Only redraw when what it says has actually changed. A strip that rebuilds
  // itself every three seconds is a strip nobody can click.
  const now = JSON.stringify(liveNews.map((n) => `${n.from}|${n.name}|${n.kind}|${n.theirs?.mark ?? ''}`));
  if (now !== liveSeen) {
    liveSeen = now;
    paintNews();
  }
  again(3500);
}

function newsHtml() {
  if (!liveNews.length) return '';
  return `<div id="news">${liveNews.map((n, i) => `
    <div class="news ${esc(n.kind)}">
      <span class="spine ${n.kind === 'collision' ? 'unsaved' : n.kind === 'behind' ? 'published' : 'clean'}"></span>
      <div class="grow">
        <b>${esc(n.sentence)}</b>
        <span>${esc(n.action ?? '')}</span>
      </div>
      <div class="acts">
        ${(n.may ?? []).includes('takeTheirs')
    ? `<button class="go small" data-sync="${i}">Bring theirs across</button>` : ''}
        ${(n.may ?? []).includes('bring')
    ? `<button class="go small" data-fetch="${i}">Bring it here…</button>` : ''}
        ${(n.may ?? []).includes('save')
    ? `<button class="small" data-savefirst="${i}">Save mine first</button>` : ''}
        <button class="quiet small" data-hush="${i}">Leave it</button>
      </div>
    </div>`).join('')}</div>`;
}

/** Put the strip at the top of whatever is on screen, without redrawing it. */
function paintNews() {
  const hold = $('#view');
  if (!hold) return;
  const there = $('#news');
  if (!liveNews.length) { there?.remove(); return; }

  const wanted = newsHtml();
  if (there && there.outerHTML === wanted) return;
  if (there) there.outerHTML = wanted;
  else hold.insertAdjacentHTML('afterbegin', wanted);
  wireNews();
}

function wireNews() {
  for (const b of document.querySelectorAll('[data-sync]')) {
    b.onclick = async () => {
      const n = liveNews[Number(b.dataset.sync)];
      const sure = await confirmThat({
        title: `Bring ${n.name} across from ${n.fromName}`,
        what: `Your copy of ${n.name} is replaced with the one on ${n.fromName}.`,
        why: 'Your copy is moved aside first, not deleted, and the sentence afterwards says exactly where it went. If anything goes wrong on the way, it is put straight back.',
        confirm: 'Bring theirs across',
      });
      if (!sure) return;
      const r = await post('/live/sync', { name: n.name, from: n.from, path: n.path });
      if (r.ok) watchJob(r.job); else { say(r); draw(); }
    };
  }
  for (const b of document.querySelectorAll('[data-fetch]')) {
    b.onclick = async () => {
      const n = liveNews[Number(b.dataset.fetch)];
      const into = await pickFolder({
        title: `Where should ${n.name} go on this computer?`,
        confirm: 'Put it in here',
        startAt: me.settings?.workFolder,
      });
      if (!into) return;
      const r = await post('/live/sync', { name: n.name, from: n.from, path: `${into}\\${n.name}` });
      if (r.ok) watchJob(r.job); else { say(r); draw(); }
    };
  }
  for (const b of document.querySelectorAll('[data-savefirst]')) {
    b.onclick = async () => {
      const n = liveNews[Number(b.dataset.savefirst)];
      await post('/open', { path: n.path });
      at.inside = true;
      await refreshMe();
      go('projects');
      say({
        ok: true,
        sentence: `${n.name} is open. Save what you have, then bring theirs across.`,
        action: 'Nothing of yours can be walked over while it is unsaved.',
      });
    };
  }
  for (const b of document.querySelectorAll('[data-hush]')) {
    b.onclick = async () => {
      const n = liveNews[Number(b.dataset.hush)];
      await post('/live/leave', { from: n.from, name: n.name, mark: n.theirs?.mark });
      liveNews.splice(Number(b.dataset.hush), 1);
      liveSeen = '';
      paintNews();
    };
  }
}

// ---------------------------------------------------------------------------
// Noticing the folder changed underneath us
// ---------------------------------------------------------------------------

let lastPulse = null;

async function checkPulse() {
  if (document.hidden || layer.innerHTML || watching) return;
  // A redraw underneath an open menu closes it in your hand.
  if (document.querySelector('.panel:not([hidden])')) return;
  try {
    const { pulse } = await get('/pulse');
    if (lastPulse !== null && pulse !== lastPulse && at.tab === 'projects') await draw({ quietly: true });
    lastPulse = pulse;
  } catch { /* the server is starting or stopping; nothing to say about it */ }
}
setInterval(checkPulse, 4000);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/**
 * The way in.
 *
 * Signing in is asked for first, because almost everything worth doing here goes
 * through your GitHub account — where a second copy of your work lives, and how
 * your other computers recognise each other.
 *
 * It is asked for, not demanded. Everything that happens on this computer alone
 * — opening projects, starting apps, saving your work — works without any
 * account at all, and a product that held those hostage to a sign-in would be
 * lying about what it needs.
 */
function showGate({ trouble = null } = {}) {
  const gate = $('#gate');
  gate.hidden = false;
  gate.innerHTML = `
    <div class="welcome">
      <div class="bead"></div>
      <h1>Welcome to Viberant</h1>
      <p>Open your project in any AI app, save it, and pick it up on your other
        computer.</p>

      ${trouble ? `<div class="said bad" style="text-align:left">
        <b>${esc(trouble.sentence)}</b>
        ${trouble.action ? `<span>${esc(trouble.action)}</span>` : ''}
      </div>` : ''}

      <div class="ways">
        <button class="wayin" id="in-github">
          <span class="mark">${GITHUB_MARK}</span>
          <span class="grow">
            <b>Continue with GitHub</b>
            <span>Keeps a second copy of your work, and lets your computers find each other.</span>
          </span>
        </button>

        <button class="wayin" id="in-google">
          <span class="mark">${GOOGLE_MARK}</span>
          <span class="grow">
            <b>Continue with Google</b>
            <span>Puts your Google name on this computer.</span>
          </span>
        </button>
      </div>

      <div class="later">
        <button class="quiet" id="in-later">Skip for now</button>
      </div>
    </div>`;

  $('#in-github').onclick = () => signInToGitHub({ inGate: true });
  $('#in-google').onclick = () => signInToGoogle({ inGate: true });
  $('#in-later').onclick = async () => {
    // Closing it must mean closed. It used to come back every launch, which is
    // the app overruling a decision you had already made.
    hideGate();
    await post('/settings', { id: 'welcomed', value: true });
    await refreshMe();
    draw();
  };
}

/** Put the way in away, and let go of what it was holding. */
function hideGate() {
  const gate = $('#gate');
  gate.hidden = true;
  gate.innerHTML = '';
}

/**
 * Signing in to GitHub, from wherever you pressed it.
 *
 * One path, used by the welcome and by the account menu. The code is the whole
 * of it, shown large: the one thing being asked of anybody at this moment is to
 * carry eight characters from here to there, and everything else on screen is in
 * the way of that.
 *
 * Two rules learned by watching somebody use it:
 *
 *   A failure never closes the way in. Closing the welcome and putting the
 *   reason behind it is indistinguishable, from where you are sitting, from the
 *   button doing nothing at all.
 *
 *   Changing your mind puts you back where you were, not into the app.
 */
async function signInToGitHub({ inGate = false } = {}) {
  // Who was signed in before. Without it, "sign in to another account" looks at
  // the account you already had, decides it succeeded, and closes itself.
  const before = me.github ?? null;

  const started = await post('/github/signin');
  if (!started.ok) {
    if (inGate) return showGate({ trouble: started });
    say(started);
    return draw();
  }

  let watching = null;

  const stop = async ({ giveUp = false, backToWelcome = false } = {}) => {
    clearInterval(watching);
    if (giveUp) await post('/github/signin/stop');
    closeLayer();
    if (inGate && backToWelcome) showGate();
    else if (inGate) hideGate();
  };

  const paint = (code, where = 'https://github.com/login/device') => {
    sheet({
      title: 'Signing in to GitHub',
      narrow: true,
      body: `
        <p class="sub">${code
    ? 'Your browser is opening at the page below. Put this code in and this page will notice by itself.'
    : 'Asking GitHub for a code.'}</p>
        <div class="code">${code ? esc(code) : '<span class="spin"></span>'}</div>
        ${code ? `
          <div class="menu">
            <button class="opt" id="in-again">
              <span class="glyph">${GITHUB_MARK}</span>
              <span><span class="what">Open the page again</span><br>
                <span class="why">${esc(String(where).replace(/^https:\/\//, ''))}</span></span>
            </button>
          </div>` : ''}`,
      foot: '<button class="quiet" id="in-cancel">Never mind</button>',
      onOpen: () => {
        $('#in-again')?.addEventListener('click', () => post('/open/page', { at: where }));
        $('#in-cancel').onclick = async () => {
          await stop({ giveUp: true, backToWelcome: true });
          if (!inGate) draw();
        };
      },
    });
  };

  paint(null);

  watching = setInterval(async () => {
    const r = await get('/github/signin');

    if (r.signin?.code && $('#layer .code')?.textContent.trim() !== r.signin.code) {
      paint(r.signin.code, r.signin.at);
    }

    // Done means the sign-in itself finished, or the account actually changed.
    // Not merely "somebody is signed in", which was true before we started.
    const finished = r.signin && !r.signin.running && r.signin.ok === true;
    const changed = r.github && r.github !== before;

    if (finished || changed) {
      await stop();
      await post('/settings', { id: 'welcomed', value: true });
      await refreshMe();
      say({
        ok: true,
        sentence: `Signed in as ${r.github ?? 'your GitHub account'}.`,
        action: before && r.github !== before
          ? `${before} is still signed in here too — switch between them from the account menu.`
          : 'Everything on this computer now has a home to go to.',
      });
      return draw();
    }

    if (r.signin && !r.signin.running && r.signin.ok === false) {
      clearInterval(watching);
      closeLayer();
      await refreshMe();
      if (inGate) return showGate({ trouble: r.signin });
      say(r.signin);
      draw();
    }
  }, 1200);
}

/**
 * Signing in to Viberant itself with Google.
 *
 * If no Google application has been registered yet, this says so and shows what
 * to do — because a Google sign-in cannot exist without one, and that is true of
 * every Google button anywhere rather than a shortcoming of this app.
 */
async function signInToGoogle({ inGate = false } = {}) {
  // Changing your mind puts you back where you were, not into the app. The same
  // rule the GitHub way in follows, for the same reason.
  const backWhereYouWere = () => { if (inGate) showGate(); else draw(); };

  const started = await post('/google/signin');

  if (started.needsSetup) {
    return sheet({
      title: 'Sign in with Google',
      narrow: true,
      body: `
        <p class="sub">A Google sign-in has to be backed by an application registered
          with Google. Every Google button you have ever pressed is — there is no
          anonymous way in, by design. Making one is free and takes about five
          minutes, and it is asked once.</p>
        <div class="menu">
          <button class="opt" id="g-console">
            <span class="glyph">${GOOGLE_MARK}</span>
            <span><span class="what">Open the Google Cloud console</span><br>
              <span class="why">Credentials → Create credentials → OAuth client ID → TV and Limited Input.</span></span>
          </button>
          <button class="opt" id="g-settings">
            <span class="glyph">⚙</span>
            <span><span class="what">Paste the two values into Settings</span><br>
              <span class="why">Client ID and client secret. They stay on this computer.</span></span>
          </button>
        </div>
        <p class="sub" style="margin-top:1rem">Everything else here works without it —
          this is only for putting your Google name on this computer.</p>`,
      foot: '<button class="quiet" id="g-close">Close</button>',
      onOpen: () => {
        $('#g-console').onclick = () => post('/open/page', { at: started.howToRegister });
        $('#g-settings').onclick = () => { closeLayer(); hideGate(); go('settings'); };
        $('#g-close').onclick = () => { closeLayer(); backWhereYouWere(); };
      },
    });
  }

  if (started.ok === false) {
    if (inGate) return showGate({ trouble: started });
    say(started);
    return draw();
  }

  let watching = null;
  const stop = () => { clearInterval(watching); closeLayer(); };

  const paint = (code, where) => sheet({
    title: 'Signing in to Google',
    narrow: true,
    body: `
      <p class="sub">${code
    ? 'Your browser is opening at the page below. Put this code in and pick your account.'
    : 'Asking Google for a code.'}</p>
      <div class="code">${code ? esc(code) : '<span class="spin"></span>'}</div>
      ${code ? `
        <div class="menu">
          <button class="opt" id="g-again">
            <span class="glyph">${GOOGLE_MARK}</span>
            <span><span class="what">Open the page again</span><br>
              <span class="why">${esc(String(where ?? '').replace(/^https:\/\//, ''))}</span></span>
          </button>
        </div>` : ''}`,
    foot: '<button class="quiet" id="g-cancel">Never mind</button>',
    onOpen: () => {
      $('#g-again')?.addEventListener('click', () => post('/open/page', { at: where }));
      $('#g-cancel').onclick = () => { stop(); backWhereYouWere(); };
    },
  });

  paint(null, null);

  watching = setInterval(async () => {
    const r = await get('/google/signin');
    if (!r.signin) return;

    const code = r.signin.code;
    if (code && $('#layer .code')?.textContent.trim() !== code) {
      paint(code, r.signin.at);
      post('/open/page', { at: r.signin.at });
    }

    // Done means this attempt finished, not merely that somebody is signed in —
    // which was already true if you came here to change accounts.
    if (r.signin.running) return;

    stop();
    await refreshMe();

    // A failure never closes the way in. Closing it and putting the reason
    // behind it is indistinguishable, from where you are sitting, from the
    // button having done nothing at all.
    if (r.signin.ok !== true) {
      if (inGate) return showGate({ trouble: r.signin });
      say(r.signin);
      return draw();
    }

    if (inGate) hideGate();
    await post('/settings', { id: 'welcomed', value: true });
    await refreshMe();
    say(r.signin);
    draw();
  }, 1500);
}

const start = async () => {
  shedGrains();
  await refreshMe();
  const p = await get('/project');
  at.inside = !!p.open;
  await draw();

  const skip = me.settings?.opening === false
    || matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    $('#opening')?.classList.add('going');
    $('#frame').classList.add('up');
    setTimeout(() => $('#opening')?.remove(), 500);
    // Asked once, on a computer that has never signed in to anything. After
    // that the corner is where you go, and nothing stands in front of the app
    // again.
    if (!signedInAs() && !me.settings?.welcomed) showGate();
    watchTheOthers();
  }, skip ? 120 : 1600);
};

start();
