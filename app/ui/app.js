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

import * as wall from './wallpaper.js';

const $ = (s) => document.querySelector(s);
const view = $('#view');
const layer = $('#layer');

/**
 * Writing the same page again costs nothing.
 *
 * Setting `innerHTML` to the very same string still throws every element away
 * and builds them all again — the browser does not compare, it obeys. That is
 * the flicker: sitting on a screen touching nothing, something polls, finds
 * that nothing has changed, rebuilds the whole page anyway, and for one frame
 * the page is gone.
 *
 * The quiet redraw already noticed *afterwards* that nothing had moved and put
 * the scroll position back. Noticing afterwards is repair. This is the same
 * check happening before the damage, and it is done here — once, on the one
 * element every screen writes into — rather than at thirteen call sites where
 * the fourteenth would be written without it.
 *
 * Most redraws are identical, because most of what polls has nothing new to
 * say. Those are now free.
 */
let lastPainted = null;

Object.defineProperty(view, 'innerHTML', {
  get() { return Element.prototype.__lookupGetter__('innerHTML').call(this); },
  set(html) {
    /*
     * Compared against what a screen last *produced*, not against what is on
     * the page now.
     *
     * Comparing with the page is what does not work, and it took measuring to
     * see why: several screens draw in two stages — the page, then a slower
     * answer written into a box inside it. So the page is never equal to what
     * the screen produces, the guard never matches, and every poll rebuilds
     * everything. Nine rebuilds in fifty idle seconds, measured, on a screen
     * where nothing at all had happened.
     *
     * Remembering the production makes the comparison honest: the same page
     * built twice is written once, and the slow answers filled in afterwards
     * are left exactly where they are.
     */
    if (lastPainted === html) return;
    lastPainted = html;
    Element.prototype.__lookupSetter__('innerHTML').call(this, html);
  },
  configurable: true,
});

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
  const days = Math.floor(secs / 86400);
  // "1 days ago" is the kind of thing that makes a screen look unfinished, and
  // it is one line to not do.
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

const size = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB`
  : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB`
    // Under a kilobyte, "0 KB" is worse than saying nothing. A file of a few
    // dozen bytes is a real thing somebody offered and it has a real size.
    : bytes >= 1e3 ? `${Math.round(bytes / 1e3)} KB`
      : `${Math.round(bytes)} bytes`);

const tail = (path) => String(path ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '';

/**
 * Where something is, in the fewest characters that still identify it.
 *
 * The last two parts and the drive. Every project on this computer shares the
 * first eighty characters of its path, so showing them puts the same string
 * under sixteen different names and calls it information.
 */
function shortPath(path) {
  const parts = String(path ?? '').split(/[\\/]/).filter(Boolean);
  if (parts.length <= 3) return String(path ?? '');
  return `${parts[0]}\\…\\${parts.slice(-2).join('\\')}`;
}

// ---------------------------------------------------------------------------
// The one place a sentence is shown
// ---------------------------------------------------------------------------

let said = null;
const say = (r) => { said = r && r.sentence ? r : null; return r; };

/**
 * The three or four numbers a screen is actually about.
 *
 * Each one is a mark, a number and what it counts. `tone` is only ever the
 * truth about that number — `live` when something genuinely is, `warn` when
 * something genuinely wants attention — never a way of making a card look
 * important.
 *
 * @param {Array<{mark: string, big: string|number, what: string, tone?: string,
 *   signal?: boolean}>} ones
 */
function summary(ones) {
  const shown = ones.filter(Boolean);
  if (!shown.length) return '';

  return `
    <div class="summary">
      ${shown.map((one) => `
        <div class="one ${esc(one.tone ?? '')}">
          ${one.signal ? SIGNAL : ''}
          <span class="mark" aria-hidden="true">${one.mark}</span>
          <span class="said">
            <span class="big">${esc(String(one.big))}</span>
            <span class="what">${one.pip ? '<span class="pip"></span>' : ''}${esc(one.what)}</span>
          </span>
        </div>`).join('')}
    </div>`;
}

/**
 * A line that means something is connected, drawn rather than fetched.
 *
 * Three strokes at different depths, the nearest one brighter. It appears only
 * on a card that is reporting a live connection — not as decoration, and
 * never over a word.
 */
const SIGNAL = `
  <svg class="signal" viewBox="0 0 200 90" preserveAspectRatio="none" aria-hidden="true"
    fill="none" stroke="var(--vibe-b)" stroke-linecap="round">
    <path d="M0 62 C 40 62, 52 22, 84 22 S 132 62, 200 40" stroke-width="1" opacity=".35"/>
    <path d="M0 70 C 46 70, 58 34, 96 34 S 146 66, 200 52" stroke-width="1.2" opacity=".55"/>
    <path d="M0 78 C 52 78, 66 46, 108 46 S 158 72, 200 64" stroke-width="1.4" opacity=".8"/>
  </svg>`;

/** A terminal, in the shape the summary cards use. */
const TERM_SUM_MARK = '<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
  + 'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
  + '<rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1.6"/><path d="M4.6 6.4 6.9 8.4 4.6 10.4M8.8 10.6h2.8"/></svg>';

/** The marks the summary cards use. Two strokes each, no more. */
const SUM_MARK = {
  computers: '<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.4" y="2.6" width="9" height="6.4" rx="1.2"/><rect x="7.6" y="7" width="7" height="6.4" rx="1.2"/></svg>',
  folder: '<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M1.8 12.4V4a1 1 0 0 1 1-1h3l1.4 1.6h5a1 1 0 0 1 1 1v6.8a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1Z"/></svg>',
  pulse: '<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8h3l2-4.5L9.5 12 11.5 8H15"/></svg>',
  running: '<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6"/><path d="M8 4.4V8l2.4 1.6" stroke-linecap="round"/></svg>',
  done: '<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.4 6.4 11.6 13 4.8"/></svg>',
  project: '<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2.4" width="12" height="11.2" rx="1.6"/><path d="M2 6.2h12"/></svg>',
  world: '<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="5.8"/><ellipse cx="8" cy="8" rx="2.5" ry="5.8"/><path d="M2.4 8h11.2"/></svg>',
};

function saidHtml() {
  if (!said) return '';
  const tone = said.ok === false ? 'bad' : said.ok === true ? 'good' : '';
  return `<div class="said ${tone}"><b>${esc(said.sentence)}</b>${
    said.action ? `<span>${esc(said.action)}</span>` : ''}</div>`;
}

// ---------------------------------------------------------------------------
// Where we are
// ---------------------------------------------------------------------------

/**
 * One mark per place, drawn rather than typed.
 *
 * They were letters — the kind of characters a font happens to have — and
 * every one of them was a different width, a different weight and sat on a
 * different part of the line. Centred in a box they still looked scattered,
 * because the shapes themselves do not agree. These are all one viewBox, one
 * stroke weight, and one optical size, so the column of them is a column.
 */
const mark = (d) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
  stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const TABS = [
  { id: 'home', name: 'Home', glyph: mark('<path d="M2 7.2 8 2l6 5.2v6.3H9.8V9.7H6.2v3.8H2Z"/>') },
  { id: 'projects', name: 'Projects', glyph: mark('<rect x="2" y="2.5" width="12" height="11" rx="1.8"/><path d="M2 6.2h12"/>') },
  { id: 'ask', name: 'AI Assistant', glyph: mark('<path d="M13.5 9.5A2.5 2.5 0 0 1 11 12H6l-3 2.2V4.5A2.5 2.5 0 0 1 5.5 2h5.5A2.5 2.5 0 0 1 13.5 4.5Z"/>') },
  { id: 'apps', name: 'AI apps', glyph: mark('<path d="M8 1.8 9.6 6 14 7.6 9.6 9.2 8 13.4 6.4 9.2 2 7.6 6.4 6Z"/>') },
  { id: 'terminals', name: 'Terminals', glyph: mark('<rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.6"/><path d="M4.8 6.4 7 8.4l-2.2 2M8.8 10.6h2.6"/>') },
  { id: 'workspace', name: 'Workspace', glyph: mark('<circle cx="4.6" cy="4.6" r="2.1"/><circle cx="11.4" cy="4.6" r="2.1"/><path d="M1.6 13.4c0-2 1.4-3.2 3-3.2s3 1.2 3 3.2M8.4 13.4c0-2 1.4-3.2 3-3.2s3 1.2 3 3.2"/>') },
  { id: 'activity', name: 'Activity', glyph: mark('<path d="M1.4 8h3l1.8-4.6L9.6 12.6 11.4 8h3.2"/>') },
  { id: 'ship', name: 'Deploy', glyph: mark('<path d="M8 13.6V3.2M8 3.2 4.4 6.8M8 3.2l3.6 3.6"/>') },
  { id: 'settings', name: 'Settings', glyph: mark('<circle cx="8" cy="8" r="2.3"/><path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5"/>') },
  { id: 'keybinds', name: 'Keybinds', glyph: mark('<rect x="1.6" y="3" width="12.8" height="10" rx="1.7"/><path d="M4 6h1M7.5 6h1M11 6h1M4 9h1M7.5 9h4.5M4 11.2h5"/>') },
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
  { name: 'Work', places: ['home', 'projects', 'ask', 'apps', 'terminals'] },
  { name: 'Workspace', places: ['workspace', 'activity', 'ship'] },
  { name: 'System', places: ['settings', 'keybinds'] },
];

/** The two behind the icons at the far end, out of the way of the daily five. */
const ASIDE = [
  {
    id: 'feedback',
    name: 'Tell us what is wrong',
    glyph: mark('<path d="M11.2 2.6 13.4 4.8 5.6 12.6 2.6 13.4l.8-3Z"/>'),
  },
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

const at = { tab: 'home', inside: false };
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
  wallFromSettings(me.settings);
  drawNav();
}

/**
 * Put whatever the settings ask for behind the application.
 *
 * The only place that decides this. `wear` does nothing when nothing has
 * changed, which matters because this is reached from every redraw and a
 * redraw happens whenever anything at all happens — a background that
 * restarted on every navigation would be worse than having none.
 */
function wallFromSettings(s = {}) {
  const look = s.appearance ?? 'system';
  wall.wear({
    scene: wall.SCENE_FOR[look] ?? null,
    dim: (s.wallDim ?? 55) / 100,
    blur: s.wallBlur ?? 0,
    motion: s.wallMotion !== false,
    brightness: 1,
  });
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

  /*
   * A row is a mark, a title and a line about it — three things, said as three
   * things.
   *
   * The title used to be a bare piece of text with the explanation tucked in
   * beside it, which meant nothing could lay them out: they ran together on one
   * line, the line was longer than a menu of fixed width, and the end of every
   * row was cut off against the edge. Now the title is an element of its own and
   * the explanation sits under it, so wrapping is the normal case rather than
   * something a stylesheet has to rescue.
   */
  const row = (title, about) => `<span class="grow"><b class="pick-title">${title}</b>${
    about ? `<span class="sub">${about}</span>` : ''}</span>`;

  panel.innerHTML = `
    <div class="head">GitHub</div>
    ${signedIn ? g.accounts.map((a) => `
      <button class="pick ${a.active ? 'on' : ''}" data-gh-use="${esc(a.name)}">
        <span class="dot ${a.active ? 'live' : 'off'}"></span>
        ${row(esc(a.name), a.active ? 'in use right now' : 'switch to this one')}
      </button>`).join('')
    : `<div class="pick">${row('Not signed in', `Your work stays on this computer
         until you are, and everything here still works without it.`)}</div>`}

    <button class="pick" id="gh-add">
      ${mark(GITHUB_MARK)}
      ${row(signedIn ? 'Sign in to another account' : 'Sign in with GitHub', 'Opens your browser with a code.')}</button>

    ${g.active ? `<button class="pick" id="gh-out"><span class="pick-mark">↷</span>
      ${row(`Sign ${esc(g.active)} out`, 'On this computer only. You can sign back in from here.')}</button>` : ''}

    <div class="head">Google</div>
    ${me.google ? `
      <div class="pick on">
        <span class="dot live"></span>
        ${row(esc(me.google.email ?? me.google.name ?? 'signed in'), 'a name on this computer, nothing more')}
      </div>
      <button class="pick" id="google-out"><span class="pick-mark">↷</span>
        ${row('Sign out of Google', 'On this computer only.')}</button>` : `
      <button class="pick" id="gh-google">
        ${mark(GOOGLE_MARK)}
        ${row('Sign in with Google', 'Puts your name on this computer. Not where work is kept.')}</button>`}

    <hr>
    <button class="pick" id="gh-name"><span class="pick-mark">✎</span>
      ${row('Your name on saved work', esc(g.identity?.name || 'not set yet'))}</button>`;

  // It was placed while it said "looking…". It is a different size now.
  if (!panel.hidden) placeFloating(panel);

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
    aria-label="${esc(t.name)}"
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
          <button class="who" id="who" aria-label="Account" data-tip="${esc(signedInAs() ?? 'Not signed in')}">
            <span class="face">${signedInAs() ? esc(signedInAs().slice(0, 1).toUpperCase()) : '?'}</span>
            <span class="grow">
              <span class="name">${esc(signedInAs() ?? 'Not signed in')}</span>
              <span class="what">${esc([
    me.github ? 'GitHub' : null,
    me.google ? 'Google' : null,
    me.machineName || 'this computer',
  ].filter(Boolean).join(' · '))}</span>
            </span>
          </button>
          <div class="panel" hidden data-floats id="who-panel"></div>
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
    <button class="seek" id="seek" aria-label="Search Viberant" data-tip="Find anything, or do anything" data-key="Ctrl K">
      <span aria-hidden="true">⌕</span>
      <span class="what">Search Viberant…</span>
      <span class="kbd">Ctrl K</span>
    </button>
    <div class="drop" id="moving-drop" hidden>
      <button class="moving" id="moving" aria-label="Work in progress" data-tip="What is moving right now">
        <span class="spin" aria-hidden="true"></span>
        <span id="moving-count" class="mono"></span>
      </button>
      <div class="panel" hidden id="moving-panel"></div>
    </div>
    <button class="statepill" id="reachpill" hidden></button>`;

  $('#seek').onclick = openPalette;
  $('#moving').onclick = (e) => { e.stopPropagation(); openMovingPanel(); };
  paintMoving();
  paintReach();
}

/**
 * Whether the other computers can reach this one, said in the corner.
 *
 * It belongs up here because it is true of the whole app rather than of one
 * screen: nothing that involves another computer works while it is off, and
 * finding that out by pressing something and having it fail is the wrong order.
 * Pressing it goes to the place where it can be changed.
 *
 * Absent, not empty, when this computer is in no workspace at all — a state
 * about a thing you are not part of is noise.
 */
async function paintReach() {
  const pill = $('#reachpill');
  if (!pill) return;

  const w = await get('/workspace').catch(() => null);
  if (!pill.isConnected) return;

  if (!w?.joined) { pill.hidden = true; return; }

  const near = (w.around ?? []).length;
  const on = !!w.sharingHere;

  pill.hidden = false;
  pill.className = `statepill ${on ? 'live' : 'warn'}`;
  pill.innerHTML = `<span class="pip"></span><span>${esc(on
    ? (near ? `${near} computer${near === 1 ? '' : 's'} here` : 'Reachable')
    : 'Not reachable')}</span>`;
  pill.title = on
    ? 'Your other computers can find this one and ask it for what it offers.'
    : 'Your other computers cannot reach this one. Press to see why.';
  pill.onclick = () => go('workspace');
}

// ---------------------------------------------------------------------------
// What is moving right now
//
// A transfer belongs to the manager, not to the page that started it — it keeps
// going when you walk away from Workspace, and there was nowhere to see that.
// One count in the corner, and it is absent entirely when nothing is moving.
// ---------------------------------------------------------------------------

let moving = [];

/**
 * Errands worth a place in the corner: anything still running.
 *
 * It used to be transfers only, and it recognised one by matching the sentence
 * against "Bringing" — which is a rule that breaks the day somebody rewords a
 * sentence, and which left a build or a deploy invisible the moment you walked
 * away from the page that started it. Every errand says what kind it is now,
 * written down when it begins.
 */
const isMoving = (j) => j.running;

/** What each kind is called in the corner, and the mark for it. */
const KIND_WORDS = {
  transfer: { one: 'transfer', many: 'transfers', mark: '↓' },
  build: { one: 'build', many: 'builds', mark: '⚒' },
  deploy: { one: 'deploy', many: 'deploys', mark: '↗' },
  send: { one: 'send', many: 'sends', mark: '↑' },
  sync: { one: 'sync', many: 'syncs', mark: '⇄' },
  git: { one: 'save', many: 'saves', mark: '✓' },
  remote: { one: 'errand on another computer', many: 'errands on your other computers', mark: '▸' },
  ai: { one: 'question', many: 'questions', mark: '◇' },
  other: { one: 'errand', many: 'errands', mark: '●' },
};

async function checkMoving() {
  const { jobs: all } = await get('/jobs');
  const now = (all ?? []).filter(isMoving);

  // Compared before anything is touched, so a corner that has nothing new to
  // say does not redraw itself every two seconds (D-68). The comparison covers
  // what is shown — which errands, and what each is doing now — because a step
  // changing is the thing worth repainting for.
  const shape = (list) => list.map((j) => {
    const doing = j.steps?.length ? j.steps[j.steps.length - 1].sentence : j.lines?.length ?? 0;
    return `${j.id}:${j.kind}:${doing}`;
  }).join('|');

  const before = shape(moving);
  const after = shape(now);
  moving = now;

  // The background, very slightly awake while something is genuinely running.
  // The same list the corner is drawn from, so it can never say one thing while
  // the room says another — and it is nothing at all when nothing is going on.
  wall.somethingIsHappening(now.length);

  // Painted whenever what is shown changed, and always when it becomes empty:
  // the corner disappearing is the one transition that must never be missed,
  // because what is left behind is a count of things that have finished.
  if (before !== after || (!now.length && !$('#moving-drop')?.hidden)) paintMoving();
}

function paintMoving() {
  const drop = $('#moving-drop');
  if (!drop) return;
  drop.hidden = moving.length === 0;
  if (!moving.length) { $('#moving-panel').hidden = true; return; }

  // Grouped by kind, so "2 transfers · 1 build" rather than "3 things".
  const byKind = {};
  for (const j of moving) byKind[j.kind ?? 'other'] = (byKind[j.kind ?? 'other'] ?? 0) + 1;
  const words = Object.entries(byKind)
    .map(([kind, n]) => `${KIND_WORDS[kind]?.mark ?? '●'} ${n}`)
    .join('  ');

  $('#moving-count').textContent = words;
  $('#moving').dataset.tip = Object.entries(byKind)
    .map(([kind, n]) => `${n} ${n === 1 ? KIND_WORDS[kind]?.one : KIND_WORDS[kind]?.many}`)
    .join(', ');

  const panel = $('#moving-panel');
  if (panel.hidden) return;
  panel.innerHTML = movingHtml();
  wireMoving();
  listenToTheWorkspace();
}

const movingHtml = () => `
  <div class="head">Happening now</div>
  ${moving.map((j) => `
    <div class="mover">
      <div class="line1">
        <b>${esc(j.what)}</b>
        <span class="chip">${esc(KIND_WORDS[j.kind ?? 'other']?.one ?? 'errand')}</span>
      </div>
      <div class="fact mono">${esc(
    j.steps?.length ? j.steps[j.steps.length - 1].sentence
      : j.lines?.[j.lines.length - 1] ?? 'Getting ready…',
  )}</div>
      <div class="bar" style="margin:.35rem 0 0">
        <button class="quiet small" data-watch="${esc(j.id)}">Watch it</button>
      </div>
    </div>`).join('')}`;

/**
 * Going to an errand takes you to the page that owns it.
 *
 * An errand belongs to a screen — a build to Deploy, a transfer to Workspace —
 * and watching one means being where it is reported, not being shown a copy of
 * it somewhere else.
 */
function wireMoving() {
  for (const b of $('#moving-panel').querySelectorAll('[data-watch]')) {
    b.onclick = async () => {
      const j = moving.find((one) => one.id === b.dataset.watch);
      closePanels();
      if (j?.kind === 'transfer') await go('workspace');
      else if (j?.kind === 'build' || j?.kind === 'deploy') await go('ship');
      await watchJob(b.dataset.watch);
      $('#job')?.scrollIntoView({ block: 'nearest' });
    };
  }
}

function openMovingPanel() {
  const panel = $('#moving-panel');
  panel.innerHTML = movingHtml();
  openPanel(panel);
  wireMoving();
}

/**
 * One stream of what is happening, opened once.
 *
 * Every screen used to ask on a timer whether anything had changed. This is the
 * other way round: the manager says so, once, to whichever screen is open —
 * so a note typed on another computer lands here without anybody pressing
 * anything, and without a page being rebuilt to show one sentence.
 *
 * Everything carries an identifier and nothing is acted on twice, because a
 * stream that reconnects replays what it thinks was missed and a note appearing
 * twice is worse than one appearing late.
 */
const heardAlready = new Set();
let stream = null;
let backOff = 1000;

function listenToTheWorkspace() {
  stream?.close();
  stream = new EventSource('/events');

  stream.onopen = () => { backOff = 1000; };

  stream.onmessage = (e) => {
    let one;
    try { one = JSON.parse(e.data); } catch { return; }
    if (!one?.id || heardAlready.has(one.id)) return;
    heardAlready.add(one.id);
    somethingHappened(one);
  };

  /*
   * A stream that drops comes back, slower each time, up to half a minute.
   *
   * Asking again immediately and forever is how a laptop that closed its lid
   * wakes up having hammered something all night.
   */
  stream.onerror = () => {
    stream?.close();
    stream = null;
    setTimeout(listenToTheWorkspace, backOff);
    backOff = Math.min(backOff * 2, 30000);
  };
}

/**
 * One line in the corner about something that happened somewhere else.
 *
 * Not a redraw and not a dialog. Somebody is in the middle of something, and a
 * computer in another room changing a file is not a reason to move anything
 * under their hands. It says what happened, it can be pressed to go where
 * something can be done about it, and it goes away on its own.
 *
 * They stack, and there are never many, because what produces them is already
 * coalesced — a folder that settles says one thing, not one per file.
 */
function mention({ what, bad = false, goTo = null }) {
  let tray = $('#mentions');
  if (!tray) {
    tray = document.createElement('div');
    tray.id = 'mentions';
    document.body.append(tray);
  }

  const line = document.createElement('button');
  line.className = `mention ${bad ? 'bad' : ''}`;
  line.innerHTML = `<span class="dot ${bad ? 'attention' : 'live'}"></span><span>${esc(what)}</span>`;
  line.onclick = () => { line.remove(); if (goTo) go(goTo); };
  tray.append(line);

  // Long enough to read a short sentence and look up, and no longer.
  setTimeout(() => line.remove(), 9000);
  // Never a wall of them: the oldest go when there are more than a handful.
  while (tray.children.length > 4) tray.firstChild.remove();
}

/**
 * Something happened to the project being looked at, said on the project.
 *
 * Returns whether it was dealt with here. One line appears above the copies,
 * naming who changed it and offering the two things there are to do about it.
 * No redraw: a change arriving is not a reason to rebuild a screen somebody is
 * reading, and rebuilding it is how a selection and a scroll position are lost.
 */
function saidAboutThisProject(one) {
  const named = one.project ?? null;
  if (!named || !lookingAtProject) return false;
  if (String(named).toLowerCase() !== String(lookingAtProject).toLowerCase()) return false;

  const middle = document.querySelector('.wsenv .middle');
  if (!middle || !middle.isConnected) return false;

  const already = $('#ws-news');
  const line = already ?? document.createElement('div');
  line.id = 'ws-news';
  line.className = `said ${one.kind === 'sync.failed' ? 'bad' : ''}`;

  const what = one.kind === 'project.changed'
    ? `${one.fromName ?? 'Another computer'} changed ${named}.`
    : one.text ?? 'A sync finished.';

  line.innerHTML = `<b>${esc(what)}</b>
    <span class="acts">
      <button class="small" id="ws-news-look">See what is different…</button>
    </span>`;
  if (!already) middle.prepend(line);

  $('#ws-news-look').onclick = () => {
    const look = $('#ws-look');
    if (look) look.click(); else draw({ quietly: true });
  };
  return true;
}

/**
 * One thing happened. Change the smallest part of the page that says so.
 *
 * Never a redraw. The whole reason this exists is that a sentence arriving
 * should cost a sentence, not a rebuilt screen and a lost scroll position.
 */
function somethingHappened(one) {
  /*
   * Something changed somewhere else. Said in the corner, not drawn over
   * whatever somebody is doing.
   *
   * One line, coalesced by whoever sent it — a folder that settles produces
   * one of these, not one per file the disk touched. Pressing it goes to the
   * place where something can be done about it; ignoring it costs nothing.
   */
  if (one.kind === 'project.changed' || one.kind === 'sync.completed' || one.kind === 'sync.failed') {
    // Inside the workspace, a change to the project on screen belongs on the
    // project rather than in the corner. Written into the one element that says
    // it, so nothing else on the page moves and nobody loses their place.
    if (at.tab === 'workspace' && saidAboutThisProject(one)) return;

    mention({
      bad: one.kind === 'sync.failed',
      what: one.kind === 'project.changed'
        ? `${one.fromName ?? 'Another computer'} changed ${one.project ?? 'a project'}`
        : one.text ?? 'A sync finished',
      goTo: one.kind === 'project.changed' ? 'workspace' : 'activity',
    });
    return;
  }

  /*
   * A note, put where notes are drawn — one element appended, never a redraw.
   *
   * It follows along only if you were already at the bottom. Scrolling back to
   * read something is a decision, and it is not ours to undo. And if the fold
   * is shut there is nothing to append to, so the fold counts it instead of the
   * note being lost.
   */
  if (one.kind === 'note') {
    noteArrived({
      id: one.id,
      at: one.at,
      text: one.text ?? '',
      fromName: one.fromName ?? 'Another computer',
    });
  }
}

const SCREENS = {};

/** What Activity has asking on its own behalf, cleared when you leave it. */
let activityTimer = null;

/**
 * The places whose contents are read down rather than across.
 *
 * Everything else is rows — a name, its facts, and what you can do about it —
 * and rows want the width of the monitor. These are sentences and controls, and
 * a line of prose the width of a 1920 screen is one nobody's eye can track back
 * from. It is the same page either way; only how far it is allowed to spread
 * changes.
 */
// The redesigned preferences and feedback studios both own multi-column
// desktop canvases. Their individual paragraphs already cap their line length.
const READING = new Set();

async function go(tab, { keepSaid = false } = {}) {
  // Whatever the screen you are leaving had asking on its own behalf.
  clearTimeout(activityTimer);
  // The rail names the hub, not whichever workspace happened to be open last.
  // Only an explicit Open action changes this to the collaboration room.
  if (tab === 'workspace') workspacePlace = 'home';
  // The rail names the project command center. Opening a project is explicit;
  // the open project remains available to the other tools without replacing
  // the meaning of the Projects navigation item.
  if (tab === 'projects') at.inside = false;
  at.tab = tab;
  if (!keepSaid) said = null;
  closePanels();
  // It describes something on the page you are leaving, so it leaves with it.
  closeInspector();
  view.classList.toggle('reading', READING.has(tab));
  (view.closest('main') || view).scrollTop = 0;
  drawNav();
  await draw();
}

// ---------------------------------------------------------------------------
// Asking about this project
//
// Every one of these answers a specific question and is shown as a state
// rather than as a conversation: what it is doing, then what it found. There is
// no text box waiting for anything and no history to scroll — the question was
// the button you pressed.
// ---------------------------------------------------------------------------

/** The steps an errand of this kind goes through, said the same way each time. */
const AI_STEPS = {
  explain: ['Reading what it printed', 'Reading the project', 'Working out why'],
  diagnose: ['Reading the project', 'Looking for what would stop it'],
  review: ['Reading what you changed', 'Looking it over'],
  ask: ['Reading the project', 'Looking for what you asked about', 'Answering'],
  propose: ['Reading the project', 'Working out the change', 'Writing it out'],
};

let asking = null;

// Provider discovery is network work, never opening-a-menu work. Keep the
// last useful answer for ten minutes, show it (or the local catalogue)
// immediately, and refresh stale entries after the sheet is already usable.
const AI_MODEL_CACHE_MS = 10 * 60 * 1000;
const aiModelLists = new Map();
let aiPickerGeneration = 0;

const modelNamed = (who, id) => {
  for (const m of who.models ?? []) {
    const one = (m.models ?? []).find((x) => x.id === id);
    if (one) return one.name;
  }
  return id ?? '';
};

/**
 * Setting up the one that answers, without leaving what you were doing.
 *
 * The old behaviour was to say "there is a box for this in Settings" and leave
 * somebody four presses away from the question they had already typed. This is
 * the whole errand in one place: get a key, paste it, have it checked, and go
 * straight back to the question.
 *
 * Two things it deliberately does not do. It does not sign anybody in to
 * anything \u2014 paying one of these companies every month is not the same
 * arrangement as a key, at any of the three, and pretending otherwise would
 * produce a refusal nobody could interpret. And it never shows a key that is
 * already here; it says whether there is one.
 *
 * @param {Function|null} andThen run once something is ready \u2014 the question
 *   somebody asked before finding out there was nothing to ask it of.
 */
async function setUpAi(andThen = null) {
  const who = await get('/ai');
  const now = Date.now();

  who.models = (who.models ?? []).map((provider) => {
    const cached = aiModelLists.get(provider.id);
    return {
      ...provider,
      availableModels: cached?.models?.length ? cached.models : provider.models,
      discovery: cached ? { ok: true, models: cached.models, cached: true } : null,
      cacheFresh: !!cached && now - cached.at < AI_MODEL_CACHE_MS,
    };
  });

  const row = (m) => `
    <div class="card ai-one">
      <div class="line1">
        <b>${esc(m.name)}</b>
        ${m.ready
    ? '<span class="chip cool">a key is here</span>'
    : '<span class="chip">no key yet</span>'}
        ${m.id === who.chosen ? '<span class="chip">this one is asked</span>' : ''}
      </div>
      <label class="field" for="ai-m-${esc(m.id)}">Which model</label>
      <select id="ai-m-${esc(m.id)}" data-model="${esc(m.id)}" style="width:100%">
        ${(m.availableModels ?? m.models).map((one) => `
          <option value="${esc(one.id)}" ${one.id === m.using ? 'selected' : ''}>${esc(one.name)} \u2014 ${esc(one.why)}</option>`).join('')}
      </select>
      <div class="model-source" data-model-source="${esc(m.id)}">${m.ready
    ? (m.discovery?.ok
      ? `${m.discovery.models.length} cached compatible models · ready now`
      : 'Showing local compatible choices · checking this API account in the background')
    : 'Connect an API key to verify exactly what this account can use'}</div>
      <label class="field" for="ai-k-${esc(m.id)}">${m.ready ? 'Replace the key' : 'Paste the key'}</label>
      <input type="password" id="ai-k-${esc(m.id)}" data-key="${esc(m.id)}" style="width:100%"
        placeholder="${m.ready ? 'leave empty to keep the one that is here' : 'it stays on this computer'}"
        autocomplete="off" spellcheck="false">
      <div class="bar" style="margin:.55rem 0 0">
        <button class="quiet small" data-get="${esc(m.id)}">Get a key from ${esc(m.name)} \u2192</button>
        <button class="go small" data-save="${esc(m.id)}">Save it</button>
        ${m.ready && m.id !== who.chosen
    ? `<button class="small" data-use="${esc(m.id)}">Ask this one</button>` : ''}
      </div>
      <div class="fact" data-note="${esc(m.id)}"></div>
    </div>`;

  sheet({
    title: 'Set up the one that answers',
    body: `
      <p style="margin-top:0">A key from whichever of these you already pay for. The
        question, and the few files it needs, go to that one and nowhere else \u2014 and
        the key stays on this computer.</p>
      ${who.models.map(row).join('')}
      <p style="color:var(--quiet);font-size:.89rem">Paying one of these every month is a
        different arrangement from a key, at all three. Being signed in to one on this
        computer does not pay for a question asked here.</p>`,
    foot: '<button class="quiet" id="ai-shut">Done</button>',
  });

  const generation = ++aiPickerGeneration;
  layer.dataset.aiPicker = String(generation);

  $('#ai-shut').onclick = () => { closeLayer(); draw(); };

  const note = (id, r) => {
    const box = layer.querySelector(`[data-note="${id}"]`);
    if (!box) return;
    box.className = `fact ${r.ok ? 'good' : 'bad'}`;
    box.textContent = [r.sentence, r.action].filter(Boolean).join(' ');
  };

  for (const b of layer.querySelectorAll('[data-get]')) {
    b.onclick = async () => note(b.dataset.get, await post('/ai/get-key', { provider: b.dataset.get }));
  }

  for (const sel of layer.querySelectorAll('[data-model]')) {
    sel.onchange = async () => note(sel.dataset.model,
      await post('/ai/choose', { model: sel.value, provider: sel.dataset.model }));
  }

  for (const b of layer.querySelectorAll('[data-use]')) {
    b.onclick = async () => {
      const out = await post('/ai/choose', { provider: b.dataset.use });
      if (!out.ok) return note(b.dataset.use, out);
      closeLayer();
      if (andThen) return andThen();
      draw();
    };
  }

  for (const b of layer.querySelectorAll('[data-save]')) {
    b.onclick = async () => {
      const id = b.dataset.save;
      const field = layer.querySelector(`[data-key="${id}"]`);
      const typed = field?.value ?? '';
      if (!typed.trim()) {
        return note(id, { ok: false, sentence: 'Nothing was pasted.', action: 'Paste the key first.' });
      }

      const was = b.textContent;
      b.disabled = true;
      b.textContent = 'Checking it\u2026';
      note(id, { ok: true, sentence: 'Asking one small question with it, to see whether it works.' });

      const out = await post('/ai/key', { provider: id, key: typed });

      b.disabled = false;
      b.textContent = was;
      // Never left sitting in a field somebody might walk away from.
      if (field) field.value = '';
      note(id, out);
      if (!out.ok) return;

      // It works, so go back to whatever somebody was doing when they found out
      // there was nothing to ask.
      closeLayer();
      if (andThen) return andThen();
      draw();
    };
  }

  // Nothing above waits for a provider. Stale or missing lists are refreshed
  // independently and painted into the still-open sheet as each one answers.
  for (const provider of who.models.filter((one) => one.ready && !one.cacheFresh)) {
    (async () => {
      const found = await get(`/ai/models?provider=${encodeURIComponent(provider.id)}`);
      if (found.ok && found.models?.length) {
        aiModelLists.set(provider.id, { at: Date.now(), models: found.models });
      }
      if (!layer.isConnected || layer.dataset.aiPicker !== String(generation)) return;

      const source = layer.querySelector(`[data-model-source="${provider.id}"]`);
      const select = layer.querySelector(`[data-model="${provider.id}"]`);
      if (!source || !select) return;

      if (!found.ok || !found.models?.length) {
        source.textContent = `${found.sentence ?? `${provider.name} could not be checked.`} ${found.action ?? ''}`.trim();
        return;
      }

      select.innerHTML = found.models.map((one) => `
        <option value="${esc(one.id)}" ${one.id === provider.using ? 'selected' : ''}>${esc(one.name)} — ${esc(one.why)}</option>`).join('');
      source.textContent = `${found.models.length} compatible models exposed to this API account · refreshed now`;
    })();
  }
}

/**
 * Ask, and show it happening.
 *
 * The states are shown because these take a few seconds and a blank panel for
 * a few seconds is indistinguishable from one that is broken. They are also the
 * honest account of what it is doing — reading the project is a real step, and
 * saying so is how somebody knows what was looked at.
 */
async function askAssistant(kind, where, body = {}) {
  const box = $('#ai-out');
  if (!box) return;
  box.closest('.assistant-panel')?.classList.add('has-output');

  asking = kind;
  const steps = AI_STEPS[kind] ?? ['Working'];
  let at = 0;

  const paint = () => {
    if (asking !== kind) return;
    box.innerHTML = `
      <div class="ai-state">
        <span class="spin"></span>
        <span>${esc(steps[Math.min(at, steps.length - 1)])}…</span>
      </div>`;
  };
  paint();
  const moving = setInterval(() => { at += 1; paint(); }, 1400);

  const r = await post(where, body);
  clearInterval(moving);
  if (asking !== kind) return;
  asking = null;

  if (!r.ok) return whenItWouldNot(box, r, { kind, where, body });

  if (r.proposal) return showProposal(box, r);

  if (r.nothingToDo) {
    box.innerHTML = `
      <div class="ai-state">
        <span>${esc(r.sentence)}</span>
      </div>
      <div class="ai-from">${esc(r.action ?? '')}</div>`;
    return;
  }

  /*
   * An answer, shown as an answer to a question somebody asked.
   *
   * It used to be a paragraph on its own with a line under it. Which is fine
   * for one press of a button and wrong the moment somebody types — there is
   * nothing on the screen saying what was asked, so an answer that has drifted
   * off the point looks like a wrong answer rather than a misread question.
   * The question goes above it, and which company answered goes on top, where
   * somebody deciding whether to trust it is already looking.
   */
  box.innerHTML = `
    <div class="ai-exchange">
      <div class="ai-head">
        <span class="who">${esc(r.model ?? 'the model')}${r.using ? ` · ${esc(modelShort(r.using))}` : ''}</span>
        ${r.insteadOf ? `<span class="chip">${esc(r.insteadOf)} could not, so this one did</span>` : ''}
        <span class="rest"></span>
        <button class="quiet small" id="ai-copy">Copy</button>
      </div>
      ${body.question || body.wanted ? `
        <div class="ai-asked">${esc(body.question ?? body.wanted)}</div>` : ''}
      <div class="ai-said">${asParagraphs(r.text)}</div>
      ${r.becauseOf ? `<div class="ai-from">${esc(r.becauseOf)}</div>` : ''}
      <div class="ai-from">Read only what this question needed, from ${esc(me.currentName ?? 'this project')} and nowhere else.</div>
      <div class="bar" style="margin:.7rem 0 0">
        <label class="find" style="flex:1;min-width:12rem">
          <span class="mark" aria-hidden="true">?</span>
          <input id="ai-more" placeholder="Ask something else about this" aria-label="Ask something else">
        </label>
        <button class="small" id="ai-more-go">Ask</button>
      </div>
    </div>`;

  /*
   * The next question, where the last answer is.
   *
   * Somebody who has just read an answer has another question, and making them
   * scroll back up to a box at the top is how a useful thing comes to feel like
   * a form. It is the same box and the same errand — not a chat, and nothing
   * is remembered between questions, which is what keeps every answer about the
   * project rather than about the conversation.
   */
  const askMore = () => {
    const next = $('#ai-more')?.value.trim();
    if (!next) return;
    const top = $('#ai-q');
    if (top) top.value = next;
    askAssistant('ask', '/ai/ask', { question: next });
  };
  $('#ai-more-go').onclick = askMore;
  $('#ai-more').onkeydown = (e) => { if (e.key === 'Enter') askMore(); };

  $('#ai-copy').onclick = async () => {
    await navigator.clipboard?.writeText(r.text ?? '');
    $('#ai-copy').textContent = 'Copied';
  };
}

/** A model's own name, shortened to the part a person would say out loud. */
const modelShort = (id) => String(id ?? '').replace(/-latest$/, '').replace(/-\d{8}$/, '');

/**
 * A refusal, and the one or two things there are to do about it.
 *
 * Four different things go wrong here and they need four different things from
 * a person: a key that is not there, a key that is not accepted, a queue that
 * passes on its own, and an account with nothing left on it. Drawn the same
 * way, three of those send somebody off to fix the fourth.
 *
 * **The question is kept, in every one of them.** That is the part that matters
 * more than the wording: whatever was typed is still on the screen, and Try
 * again asks the same question rather than making anybody remember it.
 */
function whenItWouldNot(box, r, { kind, where, body }) {
  const queued = r.kind === 'RATE_LIMITED';
  const noKey = !!r.setting;
  const badKey = r.kind === 'AUTH_INVALID';
  const noModel = r.kind === 'MODEL_UNAVAILABLE';
  const aboutMoney = r.kind === 'BILLING_REQUIRED' || r.kind === 'SPEND_LIMIT';

  /*
   * What they said about it, in their words, kept out of the way.
   *
   * Four facts and not one of them is anybody's business but this machine's:
   * which company, which model, what they returned and what they called it.
   * No key, no account, no header. It is folded away because somebody who
   * cannot ask a question does not want a status code first — but the one
   * time they are talking to somebody who can help, it is the only thing worth
   * having, and reading it off a screen beats asking them to find a log.
   */
  const facts = [
    r.providerName ?? r.provider,
    r.model,
    r.status ? `HTTP ${r.status}` : null,
    r.code ?? r.type,
  ].filter(Boolean);

  box.innerHTML = `
    <div class="ai-state bad">
      <b>${esc(r.sentence ?? 'That could not be answered.')}</b>
      ${r.action ? `<span>${esc(r.action)}</span>` : ''}
      ${r.waited ? `<span>It waited ${esc(String(r.waited))} seconds and asked again, and got the same answer.</span>` : ''}
    </div>
    <div class="bar" style="margin:.6rem 0 0" id="ai-what-now"></div>
    <div class="fact" id="ai-else"></div>
    ${facts.length ? `
      <details class="ai-detail">
        <summary>What they said</summary>
        <span class="mono">${esc(facts.join(' \u00b7 '))}</span>
      </details>` : ''}`;

  // The one thing to do, named for the thing that actually went wrong.
  const first = r.noneAtAll ? { does: 'setup', says: 'Connect AI' }
    : noKey ? { does: 'setup', says: 'Set it up now' }
      : badKey ? { does: 'setup', says: 'Replace the key' }
        : noModel ? { does: 'setup', says: 'Pick another model' }
          : { does: 'retry', says: queued ? 'Try again now' : 'Try again' };

  const acts = $('#ai-what-now');
  acts.innerHTML = `
    <button class="go small" data-ai-do="${first.does}">${esc(first.says)}</button>
    ${noKey ? '' : '<button class="quiet small" data-ai-do="setup">Change which one answers\u2026</button>'}`;

  /*
    * Which companies there are, said rather than left to be found.
    *
    * "Viberant has no key for Claude yet" reads as though Claude were the only
    * one there is, and sends somebody off to open an account with a company
    * they may not have chosen. There are three, and any one is enough.
    */
  if (r.noneAtAll) {
    const line = $('#ai-else');
    if (line) {
      line.className = 'fact';
      line.textContent = 'Claude, OpenAI or Gemini \u2014 whichever you already pay for. Any one is enough.';
    }
  }

  const again = () => askAssistant(kind, where, body);

  for (const b of acts.querySelectorAll('[data-ai-do]')) {
    b.onclick = () => (b.dataset.aiDo === 'setup' ? setUpAi(again) : again());
  }

  /**
   * Somebody else who could answer this, offered and never taken quietly.
   *
   * The answer already says who could — worked out where the keys are, rather
   * than asked for a second time from a page. Pressing one asks *this* question
   * of *that* company, once. **It does not change which company is chosen**,
   * which the old version of this did: two presses and somebody was paying a
   * company they had never picked, with nothing on screen saying so.
   */
  const others = r.couldAlsoAsk ?? [];
  if (others.length && (queued || badKey || aboutMoney || r.kind === 'PROVIDER_UNAVAILABLE')) {
    const line = $('#ai-else');
    if (!line) return;

    line.className = 'bar';
    line.style.marginTop = '.4rem';
    line.innerHTML = others.map((m) => `
      <button class="quiet small" data-ask-instead="${esc(m.id)}">Ask ${esc(m.name)} instead</button>`).join('');

    for (const b of line.querySelectorAll('[data-ask-instead]')) {
      // The same question, the same context, one company named for it. What
      // comes back says which one answered, in the answer.
      b.onclick = () => askAssistant(kind, where, { ...body, instead: b.dataset.askInstead });
    }
  }
}

/**
 * A change somebody has been offered, with every file it would touch.
 *
 * Approving a change you cannot see is not approving it, so this shows what
 * each file becomes before there is anything to press. The button says how many
 * files it will write, because "Apply" on its own does not say what it costs.
 */
function showProposal(box, r) {
  const p = r.proposal;

  box.innerHTML = `
    <div class="ai-said"><p>${esc(p.what)}</p></div>
    <div class="proposal">
      <div class="head">Would change ${p.changes.length === 1 ? 'one file' : `${p.changes.length} files`}</div>
      ${p.changes.map((c, i) => `
        <details class="change">
          <summary>
            <span class="mono">${esc(c.path)}</span>
            <span class="chip">${c.was === null ? 'new' : 'replaced'}</span>
          </summary>
          <pre class="log">${esc(c.becomes.slice(0, 4000))}${c.becomes.length > 4000 ? '\n…' : ''}</pre>
        </details>`).join('')}
      <div class="bar" style="margin:.7rem 0 0">
        <button class="go small" id="prop-yes">Apply to ${p.changes.length === 1 ? 'the file' : `${p.changes.length} files`}</button>
        <button class="quiet small" id="prop-no">Leave it</button>
      </div>
    </div>
    <div class="ai-from">Suggested by ${esc(r.model ?? 'the model')}. Nothing has been changed yet.</div>`;

  $('#prop-no').onclick = () => { box.innerHTML = ''; };
  $('#prop-yes').onclick = async () => {
    const b = $('#prop-yes');
    b.disabled = true;
    b.classList.add('working');
    const out = await post('/ai/apply', { id: p.id });
    say(out);
    draw();
  };
}

/**
 * What came back, as paragraphs and lists rather than one block.
 *
 * Deliberately not a Markdown renderer. Three things are recognised — a blank
 * line, a numbered point, a bullet — because that is what these answers
 * actually contain, and anything more is a rendering engine nobody asked for.
 */
/**
 * What a model wrote, read as a person would read it.
 *
 * Models write `**Fix:**` and `### What I found`, and every one of those marks
 * used to arrive on screen exactly as typed — asterisks, hashes and all — which
 * makes a careful answer look like something that leaked out of a machine.
 *
 * **Everything is escaped first, and the marks are read afterwards, on the
 * escaped text.** That order is the whole safety of it: by the time anything is
 * looked for, there is no `<` left that came from the model, so nothing it says
 * can become a tag. Only the few marks below are understood, and each one turns
 * into one plain element this page already knows how to draw.
 */
const asRichText = (s) => esc(String(s ?? ''))
  .replace(/`([^`\n]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])[*_]([^*_\n]+?)[*_](?=$|[\s).,!?:;])/g, '$1<em>$2</em>');

/** A line that is only a heading — hashes, or a bolded line ending in a colon. */
const headingIn = (line) => {
  const hashed = line.match(/^\s*#{1,4}\s+(.*)$/);
  if (hashed) return hashed[1].replace(/\s*#+\s*$/, '');
  const bolded = line.match(/^\s*\*\*(.+?)\*\*:?\s*$/);
  return bolded ? bolded[1] : null;
};

function asParagraphs(text) {
  return String(text ?? '').split(/\n{2,}/).map((para) => {
    const lines = para.split('\n').filter((l) => l.trim());
    if (!lines.length) return '';

    const listed = lines.length > 1 && lines.every((l) => /^\s*(?:[-*•]|\d+[.)])\s/.test(l));
    if (listed) {
      return `<ul>${lines.map((l) => `<li>${asRichText(l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ''))}</li>`).join('')}</ul>`;
    }

    // A heading on its own line, then whatever it introduces.
    const out = [];
    let run = [];
    const flush = () => {
      if (run.length) out.push(`<p>${asRichText(run.join(' ').trim())}</p>`);
      run = [];
    };
    for (const line of lines) {
      const head = headingIn(line);
      if (head) { flush(); out.push(`<b class="ai-head">${asRichText(head)}</b>`); }
      else run.push(line.trim());
    }
    flush();
    return out.join('');
  }).join('');
}

// ---------------------------------------------------------------------------
// The thing beside the work
//
// Open only when something is selected, and closed by selecting nothing. It
// shows what is actually known and never invents a field to fill a column: a
// machine whose address this computer has not been told is a machine with no
// address line, not one reading "unknown".
// ---------------------------------------------------------------------------

let inspecting = null;

/** Show something beside the work, or nothing at all. */
/**
 * Two computers and the line between them, drawn from what is true.
 *
 * The line is the one thing on this page that carries meaning rather than
 * decoration: it is the shape of a real connection, and its colour says how
 * that connection is made. Straight and green for the same network, curved and
 * violet through something in the middle, dashed and grey for a computer that
 * is not there at all. Nothing here is drawn when nothing is connected.
 */
function topology({ here, there, how, good = true }) {
  const relayed = /relay/i.test(how ?? '');
  const gone = !good;

  return `
    <div class="insp-map">
      <svg viewBox="0 0 260 96" aria-hidden="true">
        <path d="${relayed ? 'M64 48 C 104 20, 156 20, 196 48' : 'M64 48 H196'}"
          fill="none" stroke="${gone ? 'var(--line-strong)' : relayed ? 'var(--vibe-b)' : 'var(--live)'}"
          stroke-width="1.4" ${gone ? 'stroke-dasharray="4 5"' : ''}/>
        ${gone ? '' : `<circle r="3" fill="${relayed ? 'var(--vibe-b)' : 'var(--live)'}">
          <animateMotion dur="2.6s" repeatCount="indefinite"
            path="${relayed ? 'M64 48 C 104 20, 156 20, 196 48' : 'M64 48 H196'}"/>
        </circle>`}
        <circle cx="44" cy="48" r="19" fill="var(--raised)" stroke="var(--vibe-b)" stroke-width="1.2"/>
        <circle cx="216" cy="48" r="19" fill="var(--raised)"
          stroke="${gone ? 'var(--line-strong)' : 'var(--live)'}" stroke-width="1.2"/>
      </svg>
      <div class="ends">
        <span><b>${esc(here)}</b><span>this computer</span></span>
        <span class="rest"></span>
        <span class="right"><b>${esc(there)}</b><span>${esc(how ?? 'not reachable')}</span></span>
      </div>
    </div>`;
}

function inspect(what) {
  inspecting = what;
  const shellBox = $('#inspector');
  const inlineBox = at.tab === 'workspace' ? $('#ws-context') : null;
  const box = inlineBox ?? shellBox;
  const work = $('#work');
  if (!box || !work) return;

  // Workspace owns a visible context column. Everywhere else keeps using the
  // shell inspector. The same inspector data and actions render in both places.
  if (inlineBox && shellBox) {
    shellBox.hidden = true;
    shellBox.innerHTML = '';
    work.classList.remove('with-inspector');
    inlineBox.hidden = false;
  }

  if (!what) {
    box.hidden = !inlineBox;
    box.innerHTML = inlineBox ? `
      <div class="wscontext-empty">
        <span class="kindmark">${KIND_MARK.project}</span>
        <b>Select a person, computer, or project</b>
        <span>Its live collaboration details and safe actions appear here.</span>
      </div>` : '';
    work.classList.remove('with-inspector');
    for (const on of document.querySelectorAll('.trow.on')) on.classList.remove('on');
    return;
  }

  box.hidden = false;
  if (!inlineBox) work.classList.add('with-inspector');
  box.innerHTML = `
    <div class="insp-head">
      <span class="kindmark">${what.mark ?? ''}</span>
      <span class="grow"><b>${esc(what.name)}</b><span class="what">${esc(what.kind ?? '')}</span></span>
      <button class="quiet small icon" id="insp-close" aria-label="Close">✕</button>
    </div>
    ${what.body ?? ''}
    ${(what.facts ?? []).filter((f) => f.value !== null && f.value !== undefined && f.value !== '')
    .map((f) => `<dl class="insp-fact">
        <dt>${esc(f.label)}</dt>
        <dd class="${f.mono ? 'mono' : ''} ${f.dim ? 'dim' : ''}">${f.html ?? esc(String(f.value))}</dd>
      </dl>`).join('')}
    ${(what.counts ?? []).length ? `
      <div class="insp-part">${esc(what.countsAre ?? 'In all')}</div>
      <div class="insp-counts">
        ${what.counts.map((one) => `
          <span><b>${esc(String(one.many))}</b><span>${esc(one.what)}</span></span>`).join('')}
      </div>` : ''}
    ${(what.acts ?? []).length ? `
      <div class="insp-part">What you can do</div>
      <div class="insp-acts">${
  what.acts.map((a, i) => `
    <button class="${a.danger ? 'danger' : ''}" data-insp="${i}">
      <span>${esc(a.what)}</span>
      <span class="go" aria-hidden="true">${a.danger ? '' : '\u2192'}</span>
    </button>`).join('')
}</div>` : ''}
    ${what.sharesFrom ? `
      <div class="insp-part">Shared with this workspace</div>
      <div class="insp-shares" id="insp-shares">
        <span class="quiet">Asking\u2026</span>
      </div>` : ''}
    ${what.map ? `
      <div class="insp-part">How it is reached</div>
      ${topology(what.map)}` : ''}`;

  if (what.sharesFrom) whatTheyShare(what.sharesFrom);
  what.onOpen?.(box);

  $('#insp-close').onclick = () => inspect(null);
  for (const b of box.querySelectorAll('[data-insp]')) {
    b.onclick = () => what.acts[Number(b.dataset.insp)].run();
  }
}

/**
 * What one computer is offering, shown where it belongs: on that computer.
 *
 * **Not a list of everything everywhere.** There used to be one section called
 * *available from your other computers*, which is a page about the network
 * rather than about anybody's work — and the moment there were two computers
 * with a few folders each it was a wall of names with no way to tell whose was
 * whose. Offered things belong to whoever is offering them, so they are here,
 * behind pressing that computer.
 *
 * Only what was explicitly offered. Asked of that computer each time it is
 * looked at, so what is shown is what is true now rather than what was true
 * when something was last drawn.
 */
async function whatTheyShare({ deviceId, name, online }) {
  const box = $('#insp-shares');
  if (!box) return;

  if (!online) {
    box.innerHTML = `<span class="quiet">${esc(name)} is not here, so what it is
      offering cannot be asked for.</span>`;
    return;
  }

  const said = await get(`/local/offers?machine=${encodeURIComponent(deviceId)}`);
  if (!box.isConnected) return;

  const offers = said?.offers ?? [];
  if (!offers.length) {
    box.innerHTML = `<span class="quiet">${esc(name)} is not offering anything to this
      workspace.</span>`;
    return;
  }

  // A folder offered whole is a project as far as anybody here is concerned;
  // the only distinction that matters is whether it is one file or many.
  const kindOf = (one) => (one.kind === 'file' ? 'file' : 'project');

  box.innerHTML = offers.map((one) => `
    <div class="share">
      <span class="kindmark" aria-hidden="true">${KIND_MARK[kindOf(one)]}</span>
      <span class="grow">
        <b>${esc(one.name)}</b>
        <span class="what">${esc(KIND_WORD[kindOf(one)])}${
  one.files > 1 ? ` \u00b7 ${one.files} files` : ''}${one.bytes ? ` \u00b7 ${esc(size(one.bytes))}` : ''}</span>
      </span>
      <button class="small" data-bring-share="${esc(one.id)}"
        data-share-name="${esc(one.name)}">Bring here</button>
    </div>`).join('');

  for (const b of box.querySelectorAll('[data-bring-share]')) {
    b.onclick = async () => {
      b.disabled = true;
      b.textContent = 'Bringing\u2026';
      const out = await post('/local/take', {
        machine: deviceId, offer: b.dataset.bringShare, name: b.dataset.shareName,
      });

      /*
       * What became of it, said on the button that started it.
       *
       * A long errand goes to the list of errands, which is right. A short one
       * finishes before anybody has looked away, and sending them to another
       * screen to find out means pressing this looks like it did nothing.
       */
      if (!out.job) {
        b.disabled = false;
        b.textContent = 'Bring here';
        return say(out);
      }

      const done = await waitForJob(out.job);
      b.textContent = done?.ok ? 'Brought here' : 'Did not come';
      b.classList.toggle('nope', !done?.ok);
      b.disabled = !!done?.ok;
      if (!done?.ok) {
        b.disabled = false;
        say(done ?? { ok: false, sentence: 'That did not come across.', action: 'Try again.' });
      }
      return undefined;
    };
  }
}

/** Wait for one errand to finish, and hand back what it said. */
async function waitForJob(id, within = 120000) {
  const stop = Date.now() + within;
  for (;;) {
    const all = await get('/jobs');
    const one = (all.jobs ?? []).find((x) => x.id === id);
    if (one?.finished) return one;
    if (Date.now() > stop) return null;
    await new Promise((go) => { setTimeout(go, 700); });
  }
}

/**
 * A row that tells you about itself when you press it.
 *
 * Selecting is not doing. Pressing the row shows what is known; the controls
 * inside it still do what they say, so a press on one of those must not also
 * select — which is what `closest` and the check below are for.
 */
function wireInspect(which, show) {
  for (const row of document.querySelectorAll(which)) {
    row.onclick = (e) => {
      if (e.target.closest('button, a, input, select, .tacts')) return;
      for (const on of document.querySelectorAll('.trow.on')) on.classList.remove('on');
      row.classList.add('on');
      show(row);
    };
  }
}

/** What is known about one of your computers, without leaving the list. */
function inspectMachine(m, near, w) {
  if (!m) return inspect(null);

  // Its projects that have been saved and sent, which is the only thing that
  // can be fetched when the computer itself is not on this network.
  const onGitHub = (w.projects ?? []).filter((p) => p.from === m.id && p.url);

  /**
   * The one you are sitting at needs the opposite sentence.
   *
   * "Reachable now: no" about this computer read as though something were
   * wrong with the network, when the question is only whether you have let the
   * others reach it — a switch, on this page, that you decide.
   */
  const here = m.you;

  inspect({
    name: m.name,
    kind: here ? 'This computer' : 'Your computer',
    mark: (here ? w.sharingHere : near) ? '◉' : '○',
    facts: [
      here
        ? { label: 'The others can reach it', value: w.sharingHere ? 'Yes' : 'No' }
        : { label: 'Reachable now', value: near ? 'Yes, on this network' : 'No' },
      {
        label: 'What that means',
        value: here
          ? w.sharingHere
            ? 'Your other computers can find this one and ask it for what it offers. Nothing leaves until one asks.'
            : 'Your other computers cannot ask this one for anything. Notes still travel.'
          : near
            ? 'Whole folders can move between here and there, straight across your network.'
            : m.hereNow
              ? 'It is signed in, so notes reach it. Folders cannot move until you are both on the same network.'
              : 'Nothing reaches it until it is opened again.',
      },
      { label: 'Last here', value: here ? 'Now' : ago(m.lastHere) },
      { label: 'Working on', value: m.workingOn },
      { label: 'Kind', value: m.kind },
      { label: 'Known by', value: m.id, mono: true, dim: true },
    ],
    // What it has, as three numbers rather than as a sentence about a number.
    countsAre: here ? 'What this one offers' : 'What it offers',
    counts: [
      {
        many: here
          ? (w.offers ?? []).filter((o) => o.kind !== 'project').length
          : (w.projects ?? []).filter((p) => p.from === m.id && p.kind !== 'project').length,
        what: 'folders',
      },
      {
        many: here
          ? (w.offers ?? []).filter((o) => o.kind === 'project').length
          : (w.projects ?? []).filter((p) => p.from === m.id && p.kind === 'project').length,
        what: 'projects',
      },
      { many: here ? (w.offers ?? []).length : (w.projects ?? []).filter((p) => p.from === m.id).length, what: 'in all' },
    ],
    // The one graphic worth drawing: two computers and how they are joined.
    map: here ? null : {
      here: w.machineName ?? 'This computer',
      there: m.name,
      how: near ? 'Direct · this network' : m.hereNow ? 'Notes only' : 'Not reachable',
      good: !!near,
    },
    /*
     * What this computer has, reached from this computer.
     *
     * There used to be a second list further down the page holding everybody's
     * projects mixed together — two places to look and two places to keep
     * right. One place, and it is the computer you pressed.
     */
    acts: here
      ? [
        { what: 'Rename it', run: () => $('#w-rename')?.click() },
        ...(w.sharingHere ? [] : [{ what: 'Let the others reach it', run: () => $('#w-share-on')?.click() }]),
      ]
      : [
        ...(near ? [{ what: 'See what it is offering', run: () => peekAt(m.id, w) }] : []),
        ...(near && me.current
          ? [{ what: `What is different in ${me.currentName}…`, run: () => whatIsDifferent(m, w) }]
          : []),
        ...(onGitHub.length
          ? [{ what: `Get a copy from GitHub\u2026 (${onGitHub.length})`, run: () => copiesFrom(m, onGitHub, w) }]
          : []),
      ],
  });
}

/**
 * What is different between the open project here and the same one there.
 *
 * Nothing moves. Somebody looking at "twelve changed" has not asked for
 * anything to happen, and a page that began a transfer because you looked at
 * it would be the worst thing in this product — so this asks, compares, and
 * says. What to do about it is a separate press.
 */
async function whatIsDifferent(m, w, about = null) {
  const named = about?.project?.name ?? me.currentName;
  const mineAt = about ? about.mineAt : me.current;

  sheet({
    title: `${named} · here and on ${m.name}`,
    narrow: true,
    body: '<div class="ai-state"><span class="spin"></span> Asking what that computer has…</div>',
    foot: '<button class="quiet" id="diff-no">Close</button>',
  });
  $('#diff-no').onclick = closeLayer;

  // Whichever of their offerings is this project, by name. Nothing is compared
  // against a folder that merely happens to be next in a list.
  const mine = (named ?? '').toLowerCase();
  const theirs = about?.offer
    ? { offer: about.offer }
    : (w.projects ?? []).find((one) => one.from === m.id
      && String(one.name).toLowerCase() === mine);

  const nowhereHere = !mineAt
    ? { ok: false, sentence: `There is no copy of ${named} on this computer yet.`,
      action: `Ask ${m.name} to send one, or open the folder here first.` }
    : null;

  const out = nowhereHere ?? (theirs
    ? await post('/workspace/changes', { device: m.id, offer: theirs.offer ?? theirs.id, dir: mineAt })
    : { ok: false, sentence: `${m.name} is not offering ${named}.`, action: 'Ask for it to be offered there first.' });

  const body = $('#sheet-body');
  if (!body || !body.isConnected) return;

  if (!out.ok) {
    body.innerHTML = `<div class="said bad"><b>${esc(out.sentence)}</b>
      ${out.action ? `<span>${esc(out.action)}</span>` : ''}</div>`;
    return;
  }

  const word = { UP_TO_DATE: 'Up to date', CHANGES_AVAILABLE: 'Changes available', CONFLICT: 'Both changed' }[out.state];

  body.innerHTML = `
    <div class="factbar">
      <span><b>State</b>${esc(word)}</span>
      <span><b>Different</b>${out.added + out.changed}</span>
      <span><b>Size</b>${esc(size(out.bytes))}</span>
    </div>
    <ul class="steps">
      <li><span>${out.added} only on ${esc(m.name)}</span></li>
      <li><span>${out.changed} different on both</span></li>
      <li><span>${out.unchanged} the same</span></li>
    </ul>
    ${out.conflicts.length ? `
      <div class="said bad">
        <b>${out.conflicts.length} ${out.conflicts.length === 1 ? 'file has' : 'files have'} been changed in both places.</b>
        <span>Nothing is written over without you saying so. Choose for each one —
          whatever you keep is left exactly as it is, and whatever you take replaces
          your copy, with the old one kept first under Ways back.</span>
      </div>
      <div class="sheetlist">
        ${out.conflicts.map((path) => `
          <div class="trow">
            <span class="tname"><b class="mono">${esc(path)}</b></span>
            <span class="tacts">
              <span class="pair">
                <button class="small on" data-choose="${esc(path)}" data-side="mine">Keep mine</button>
                <button class="small" data-choose="${esc(path)}" data-side="theirs">Take ${esc(m.name)}'s</button>
              </span>
            </span>
          </div>`).join('')}
      </div>` : ''}
    ${out.examples.length && !out.conflicts.length ? `
      <div class="mono" style="color:var(--faint);font-size:var(--t-meta);margin-top:.6rem">${
  out.examples.map(esc).join('<br>')}</div>` : ''}`;

  const foot = layer.querySelector('.sheet footer');
  if (foot && out.state !== 'UP_TO_DATE') {
    foot.insertAdjacentHTML('afterbegin',
      `<button class="go" id="diff-sync">Bring ${out.added + out.changed} over</button>`);
  }

  /*
   * A choice per file, and mine is the answer until somebody says otherwise.
   *
   * The safe one is the one already chosen. Somebody who presses Bring without
   * reading this keeps every one of their own versions, which is the outcome
   * that cannot lose anybody's work.
   */
  const keeping = new Set(out.conflicts);

  for (const b of layer.querySelectorAll('[data-choose]')) {
    b.onclick = () => {
      const path = b.dataset.choose;
      if (b.dataset.side === 'mine') keeping.add(path); else keeping.delete(path);
      for (const other of layer.querySelectorAll(`[data-choose="${CSS.escape(path)}"]`)) {
        other.classList.toggle('on', other.dataset.side === b.dataset.side);
      }
    };
  }

  $('#diff-sync')?.addEventListener('click', async () => {
    const b = $('#diff-sync');
    b.disabled = true;
    b.textContent = 'Bringing it over…';

    const started = await post('/sync/bring', {
      device: m.id,
      offer: theirs?.offer ?? theirs?.id,
      path: mineAt,
      keepMine: [...keeping],
    });

    closeLayer();
    if (started.job) return watchJob(started.job);
    say(started);
    draw();
  });
}

/**
 * Copies of another computer's projects, from GitHub.
 *
 * Only what has been saved and sent, and it says so — that gap is exactly how
 * 1.3 GB arrived as 300 MB and looked like a broken transfer. When the computer
 * itself is on this network the other way is better, and is offered above this.
 */
function copiesFrom(m, projects, w) {
  sheet({
    title: `${m.name} \u00b7 copies on GitHub`,
    body: `
      <p class="sub">Copies of what has been <b>saved and sent</b> from ${esc(m.name)}.
        Anything changed there and not yet sent is not in them.</p>
      <div class="sheetlist">
        ${projects.map((p) => `
          <div class="trow">
            <span class="kindmark" aria-hidden="true">${KIND_MARK.project}</span>
            <span class="tname">
              <b>${esc(p.name)}</b>
              <span class="where">${esc(p.says ?? 'on GitHub')}</span>
            </span>
            <span class="tacts">
              <button class="go small" data-bring='${esc(JSON.stringify(p))}'>Get the copy</button>
            </span>
          </div>`).join('')}
      </div>`,
    foot: '<button class="quiet" id="copies-no">Never mind</button>',
  });
  $('#copies-no').onclick = closeLayer;
  wireBring(layer, w);
}

/** What is known about something this computer is offering. */
function inspectOffered(o) {
  if (!o) return inspect(null);

  inspect({
    name: o.name,
    kind: KIND_WORD[o.kind] ?? 'Folder',
    mark: KIND_MARK[o.kind] ?? KIND_MARK.folder,
    facts: [
      { label: 'Where it is', value: o.path, mono: true },
      { label: 'How big', value: size(o.bytes) },
      { label: 'What is in it', value: o.kind === 'file' ? null : `${o.files} files in ${o.dirs} folders` },
      {
        label: 'Everything included',
        value: o.everything
          ? 'Yes — including what is normally left out, like installed packages'
          : 'No — the parts a project rebuilds for itself are left out',
      },
      { label: 'Left out', value: o.skipped ? `${o.skipped} could not be read` : null },
      {
        label: 'Who can take it',
        value: 'Only your own computers, and only when one asks. Nothing moves on its own.',
      },
    ],
    acts: [
      { what: 'Show it in Explorer', run: () => post('/reveal', { path: o.path }) },
      { what: 'Copy where it is', run: () => navigator.clipboard?.writeText(o.path ?? '') },
      {
        what: 'Stop offering it',
        danger: true,
        run: async () => { say(await post('/local/withdraw', { id: o.id })); inspect(null); draw(); },
      },
    ],
  });
}

/** Close it when the page underneath changes to something it cannot describe. */
const closeInspector = () => { if (inspecting) inspect(null); };

// ---------------------------------------------------------------------------
// Everything by typing
//
// One field and a list. It is a way to reach what is already there and never a
// place anything lives only here — a thing you can do exclusively through a
// palette is a thing somebody who does not know it exists cannot do at all.
// ---------------------------------------------------------------------------

/** The places worth a key of their own, and the key. */
const SHORTCUTS = {
  home: '0', projects: '1', ask: '2', apps: '3', terminals: '4',
  workspace: '5', activity: '6', ship: '7', settings: ',', keybinds: '/', palette: 'k',
};
const shortcutKey = (id) => me.keybinds?.[id] ?? SHORTCUTS[id];
const shortcutFor = (id) => (shortcutKey(id) ? `Ctrl ${shortcutKey(id).toUpperCase()}` : null);

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
      group: 'This project', glyph: '↑', what: 'Git Push',
      run: async () => { await go('projects'); $('#pub')?.click(); },
    });

    /**
     * Asking about a project, from anywhere.
     *
     * These live at the bottom of the project page, which is the right place to
     * find them and the wrong place to be when the thought arrives. Typing
     * "wrong" and pressing enter is how somebody actually asks.
     */
    out.push({
      group: 'Ask about this project', glyph: '◇', what: 'Is anything wrong with it?',
      run: async () => { await go('projects'); $('#ai-diagnose')?.click(); },
    });
    out.push({
      group: 'Ask about this project', glyph: '◇', what: 'Look over my changes',
      run: async () => { await go('projects'); $('#ai-review')?.click(); },
    });
    out.push({
      group: 'Ask about this project', glyph: '◇', what: 'Ask a question about it',
      run: async () => { await go('projects'); $('#ai-q')?.focus(); },
    });
    out.push({
      group: 'Ask about this project', glyph: '◇', what: 'Ask for a change',
      run: async () => {
        await go('projects');
        const box = $('#ai-q');
        if (!box) return;
        box.focus();
        box.placeholder = 'Say what you want changed, then press Ask for a change';
      },
    });
  }

  // Only errands here. Every place is already above under "Go to", and listing
  // Settings twice makes the list longer without making anything reachable.
  out.push({ group: 'Do', glyph: '＋', what: 'Add a project', run: async () => { await go('projects'); $('#add')?.click(); } });
  out.push({ group: 'Do', glyph: '⟳', what: 'Check the other computers again', run: async () => { await go('workspace'); $('#w-refresh')?.click(); } });

  /**
   * Everything about a workspace, reachable by typing.
   *
   * Every one of these presses the same control the page has, rather than
   * calling a route of its own — a palette that is a second way to do
   * something is a second thing to keep correct.
   */
  out.push({ group: 'Your team', glyph: '✉', what: 'Invite somebody', run: async () => { await go('workspace'); $('#team-invite')?.click(); } });
  out.push({ group: 'Your team', glyph: '⊕', what: 'Make a workspace', run: async () => { await go('workspace'); $('#team-make')?.click(); } });
  out.push({ group: 'Your team', glyph: '→', what: 'Join a workspace with a code', run: async () => { await go('workspace'); $('#team-join')?.click(); } });
  out.push({
    group: 'Your team',
    glyph: '▸',
    what: 'Do something on another computer',
    run: async () => {
      await go('workspace');
      const first = document.querySelector('[data-remote]');
      if (first) return first.click();
      say({
        ok: false,
        sentence: 'No other computer of yours is online.',
        action: 'Open Viberant on one of them.',
      });
      draw();
    },
  });
  out.push({
    group: 'Your team',
    glyph: '⇄',
    what: 'Catch this project up with another computer',
    run: async () => {
      await go('workspace');
      const first = document.querySelector('[data-remote]');
      if (first) return first.click();
      say({
        ok: false,
        sentence: 'No other computer of yours is online.',
        action: 'Open Viberant on one of them.',
      });
      draw();
    },
  });
  out.push({
    group: 'Your team',
    glyph: '≡',
    what: 'Compare two computers',
    run: async () => {
      await go('workspace');
      const first = document.querySelector('[data-compare]');
      if (first) return first.click();
      say({
        ok: false,
        sentence: 'There is nothing to compare this computer with yet.',
        action: 'Invite somebody, or open Viberant on another computer of yours.',
      });
      draw();
    },
  });

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
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === shortcutKey('palette')) {
    e.preventDefault();
    return openPalette();
  }

  if (e.key === 'Escape') {
    if (layer.innerHTML) return closeLayer();
    if (document.querySelector('.panel:not([hidden])')) return closePanels();
    if (inspecting) return inspect(null);
    if (at.inside) {
      at.inside = false;
      post('/close').then(refreshMe).then(() => draw());
    }
    return;
  }

  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || typing(e)) return;

  const place = Object.keys(SHORTCUTS).find((id) => id !== 'palette' && shortcutKey(id) === e.key.toLowerCase());
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

  // `hanging` rather than `panel`, and the difference is the whole bug.
  //
  // A menu here used to be given the class every dropdown in the app uses. The
  // click that opened it then carried on up to the document, where the handler
  // that closes dropdowns hid every `.panel` on the page — including the one
  // half a millisecond old. Pressing Offer created a menu and hid it, so the
  // button did nothing at all.
  //
  // Answering that with `stopPropagation` on each caller is the version that
  // works until somebody adds a caller and forgets. These menus have their own
  // class and their own closing, so the two mechanisms cannot reach each other.
  ctxEl = document.createElement('div');
  ctxEl.className = 'panel hanging';
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
 * Which screen the last finished paint belonged to.
 *
 * Used to tell arriving somewhere new — where there is nothing yet, and waiting
 * on a blank space is honest — apart from redrawing the screen somebody is
 * already reading, where replacing it with an outline of itself is not.
 */
let lastPaintedTab = null;

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

let drawingPage = false;
let redrawAfter = false;

/**
 * Draw one screen at a time.
 *
 * Several screens wait on the manager before mounting. Without this small
 * queue, a slow page can answer after somebody has already pressed another
 * place and put the old page under the new place's selected rail item. The
 * latest requested place always gets the final pass.
 */
async function draw(options = {}) {
  if (drawingPage) { redrawAfter = true; return; }
  drawingPage = true;
  let next = options;
  try {
    do {
      redrawAfter = false;
      const beganAt = at.tab;
      await drawOnce(next);
      next = {};
      if (at.tab !== beganAt) redrawAfter = true;
    } while (redrawAfter);
  } finally {
    drawingPage = false;
  }
}

async function drawOnce({ quietly = false } = {}) {
  if (!quietly) {
    const drawingTab = at.tab;
    // Only if it is actually slow. Cleared the moment the real page is ready,
    // whether that is before or after this fires.
    // Compared against what was there when the wait began, so a screen that
    // draws in two stages is never overwritten by a skeleton arriving late.
    let drawn = false;
    const before = view.innerHTML;

    /*
     * An outline of the page, and only where there is no page yet.
     *
     * This is the whole of "everything vanishes for five seconds". Anything
     * slower than a tenth of a second replaced the screen with its own outline
     * — and pressing Deploy, or Git Push, or anything that talks to GitHub
     * or to another computer, is *always* slower than that. So the reward for
     * pressing a button was watching the page you were reading disappear, wait,
     * and come back. The work was never the problem; showing nothing while it
     * happened was.
     *
     * Now it only stands in for a screen that is not there yet: the first paint,
     * or arriving on a tab you were not on. Redrawing a screen already in front
     * of somebody leaves it in front of them, however long it takes, and what is
     * running says so where it was started.
     */
    const already = lastPaintedTab === drawingTab && before.length > 200;
    const waiting = already ? null : setTimeout(() => {
      if (!drawn && view.innerHTML === before) view.innerHTML = skeleton();
    }, HOLD_BACK);

    try {
      await SCREENS[drawingTab]?.();
    } finally {
      drawn = true;
      if (waiting) clearTimeout(waiting);
    }

    lastPaintedTab = drawingTab;
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

  lastPaintedTab = at.tab;
  lastDrawn = after;
  paintNews();
}

function closePanels() {
  // Not the ones that hang at the pointer. Those are made and destroyed by
  // `menuAt`, and a second thing quietly hiding them is how pressing Offer came
  // to open a menu and close it in the same click.
  for (const p of document.querySelectorAll('.panel:not(.hanging)')) {
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

  /*
   * A panel that hangs out of something that scrolls has to leave it.
   *
   * The account menu lives at the foot of the rail, and the rail scrolls. An
   * absolutely-positioned child of a scrolling box is clipped by that box and
   * counts towards what it has to scroll — so the menu was cut off at the rail's
   * edge and gave the rail a sideways scrollbar of its own. That is the reported
   * "protrusion", and no width fixes it, because the container is the problem.
   *
   * Marked panels are placed against the window instead, measured at the moment
   * of opening, which is the only moment the answer is knowable (D-57).
   */
  if (panel.dataset.floats !== undefined) return placeFloating(panel);

  const room = panel.getBoundingClientRect();
  if (room.bottom > innerHeight - 8) panel.classList.add('above');
  if (room.left < 8) panel.classList.add('leftward');
}

/**
 * Put a floating panel where it fits, measured now.
 *
 * Called again whenever its contents change, and that is the point. It is
 * opened holding "looking…" while the account is fetched, so measuring once at
 * opening measures the placeholder — three lines tall — and then the real
 * content arrives, grows to ten times that, and hangs off the bottom of the
 * window. Placing something by its size means placing it whenever its size
 * is decided, not whenever it appears.
 */
function placeFloating(panel) {
  const anchor = panel.previousElementSibling ?? panel.parentElement;
  const from = anchor.getBoundingClientRect();

  panel.style.position = 'fixed';
  panel.style.left = '0px';
  panel.style.top = '0px';
  // Never taller than the window it floats in. On a short window a menu with
  // plenty in it — several accounts, two services, a name — grew past the
  // bottom edge and its last rows sat over whatever was under them, out of
  // reach. Clamped before measuring, so the placement below sees the real
  // height, and what does not fit scrolls inside the menu instead.
  panel.style.maxHeight = `${innerHeight - 16}px`;
  panel.style.overflowY = 'auto';
  const mine = panel.getBoundingClientRect();

  const left = Math.min(Math.max(8, from.left), Math.max(8, innerWidth - mine.width - 8));
  // Above the thing it belongs to when there is room, which at the foot of a
  // rail there normally is. Otherwise below it, and never past either edge.
  const above = from.top - mine.height - 6;
  const top = above >= 8
    ? above
    : Math.max(8, Math.min(from.bottom + 6, innerHeight - mine.height - 8));

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

addEventListener('click', (e) => { if (!e.target.closest('.drop')) closePanels(); });

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/**
 * Things to stop when whatever is on top goes away.
 *
 * A sheet with a clock in it leaves the clock running otherwise, ticking
 * against elements that are no longer there — once per second, forever, and
 * one more every time the sheet is opened again.
 */
let closingJobs = [];
const whenLayerCloses = (fn) => { closingJobs.push(fn); };

/**
 * Stop whatever the thing on top had running.
 *
 * Called from both ways a layer goes away, and that second way is the one that
 * was missing: writing a new sheet over an old one replaces the old one just as
 * finally as closing it does, and anything the old one had ticking went on
 * ticking against elements that no longer existed.
 */
function runClosingJobs() {
  for (const fn of closingJobs) { try { fn(); } catch { /* it is going anyway */ } }
  closingJobs = [];
}

function closeLayer() {
  runClosingJobs();
  layer.innerHTML = '';
  paletteOpen = false;
}

function sheet({ title, body, foot = '', narrow = false, onOpen }) {
  runClosingJobs();
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
function ask({ title, label, value = '', placeholder = '', confirm = 'Done', danger = false }) {
  return new Promise((resolve) => {
    sheet({
      title,
      narrow: true,
      body: `<label class="field">${esc(label)}</label>
             <input id="ask-input" style="width:100%" value="${esc(value)}" placeholder="${esc(placeholder)}">`,
      foot: `<button class="quiet" id="ask-no">Never mind</button>
             <button class="${danger ? 'danger' : 'go'}" id="ask-yes">${esc(confirm)}</button>`,
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
        </div>
        <label class="field" for="walk-path">Or type where it is</label>
        <div class="bar" style="margin:0">
          <input id="walk-path" class="mono" style="flex:1" spellcheck="false"
            placeholder="D:\\Projects\\something">
          <button class="small" id="walk-go">Go there</button>
        </div>`,
      foot: `<button class="quiet" id="walk-native">Use the Windows folder chooser</button>
             <button class="quiet" id="walk-no">Never mind</button>
             <button class="go" id="walk-take">${esc(confirm)}</button>`,
      onOpen: async () => {
        $('#walk-no').onclick = () => { closeLayer(); resolve(null); };

        /*
         * Typing where it is, for anybody who already knows.
         *
         * Clicking down to a folder is eleven presses when pasting the path is
         * one, and somebody who has it in their clipboard should not have to
         * walk a tree to use it.
         */
        const goThere = async () => {
          const typed = $('#walk-path').value.trim();
          if (!typed) return;
          const r = await get(`/browse?at=${encodeURIComponent(typed)}`);
          if (!r.ok) {
            $('#walk-box').innerHTML = `<div class="item">${esc(r.sentence ?? 'That folder is not there.')}</div>`;
            return;
          }
          $('#walk-path').value = '';
          paint(typed);
        };
        $('#walk-go').onclick = goThere;
        $('#walk-path').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); goThere(); } };
        $('#walk-take').onclick = () => { closeLayer(); resolve(herePath); };
        $('#walk-native').onclick = async () => {
          const button = $('#walk-native');
          button.disabled = true;
          button.textContent = 'Waiting for the chooser…';
          const r = await post('/browse/choose', {});
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

// ---------------------------------------------------------------------------
// Home — a command center made from the state the other screens already own
// ---------------------------------------------------------------------------

SCREENS.home = async () => {
  const [projectsState, teamState, aiState, jobsState] = await Promise.all([
    get('/projects'), get('/team'), get('/ai'), get('/jobs'),
  ]);

  const projects = projectsState.projects ?? [];
  const recent = projects.slice(0, 7);
  const attention = projects.filter((one) => one.unsaved || (one.toSend ?? 0) > 0);
  const activeJobs = (jobsState.jobs ?? []).filter((one) => one.running);
  const finishedJobs = (jobsState.jobs ?? []).filter((one) => !one.running).slice(0, 5);
  const devices = [...(teamState.mine ?? []), ...(teamState.team ?? [])];
  const people = new Set(devices.map((one) => one.person || one.displayName).filter(Boolean));
  const online = devices.filter((one) => one.online).length;
  const readyAi = (aiState.models ?? []).filter((one) => one.ready);
  const continueWith = projects.find((one) => one.path === me.current) ?? recent[0] ?? null;

  const selected = continueWith;
  const sourceFor = (one) => /copy on GitHub/.test(one.reach ?? '') ? 'GitHub' : one.private ? 'This computer' : 'Offered';
  const projectCard = (one) => `
    <article class="home-work-card ${one.path === selected?.path ? 'on' : ''}" data-home-select="${esc(one.path)}">
      <span class="project-badge">${KIND_MARK.project}</span>
      <button class="quiet icon" data-home-more="${esc(one.path)}" aria-label="More for ${esc(one.name)}">⋯</button>
      <div class="grow"><b>${esc(one.name)}</b><small>${esc(sourceFor(one))} · ${one.unsaved ? `${one.unsaved} changes waiting` : esc(one.saved ?? 'Not saved yet')}</small></div>
      <button class="small" data-home-open="${esc(one.path)}">Open</button>
    </article>`;

  const projectDirectoryRow = (one) => `
    <article class="home-directory-row ${one.path === selected?.path ? 'on expanded' : ''}" data-home-select="${esc(one.path)}" data-home-name="${esc(one.name.toLowerCase())}">
      <div class="home-directory-line">
        <span class="project-mini-mark ${one.unsaved ? 'attention' : ''}">${KIND_MARK.project}</span>
        <span class="grow"><b>${esc(one.name)}</b><small><span class="dot ${one.unsaved ? 'attention' : 'live'}"></span>${one.unsaved ? `${one.unsaved} changes waiting` : esc(one.saved ?? 'Ready')}</small></span>
        <span class="home-directory-role">${esc(MARK_LOOK[one.mark]?.name ?? 'Yet to start')}</span>
        <span aria-hidden="true">⌄</span>
      </div>
      ${one.path === selected?.path ? `<div class="home-project-expanded">
        <section><span class="eyebrow">Project</span><b>${esc(one.name)}</b><small class="mono">${esc(shortPath(one.path))}</small></section>
        <section><span class="eyebrow">Source & state</span><b>${esc(sourceFor(one))}</b><small>${one.unsaved ? `${one.unsaved} local changes need attention` : 'Everything here is settled'}</small></section>
        <section><span class="eyebrow">Continue</span><div class="acts"><button class="go small" data-home-open="${esc(one.path)}">Open project</button><button class="small" data-home-inspect="${esc(one.path)}">Inspect</button></div></section>
      </div>` : ''}
    </article>`;

  const deviceRow = (one) => `
    <article class="home-device-row" data-home-device data-home-name="${esc(`${one.displayName ?? ''} ${one.person ?? ''}`.trim().toLowerCase())}">
      <span class="device-mark">▣</span><span class="grow"><b>${esc(one.displayName ?? 'Computer')}</b><small>${esc(one.person ?? 'Workspace member')} · ${esc(one.how ?? 'Known computer')}</small></span><span class="share-state"><span class="dot ${one.online ? 'live' : 'off'}"></span>${one.online ? 'Reachable' : 'Offline'}</span>
    </article>`;

  view.innerHTML = `
    <div class="ref-home-page home-reference">
      <header class="ref-pagehead">
        <div class="grow">
          <h1>Home</h1>
          <p>Your command center for projects, computers, tools, and recent work.</p>
        </div>
        <div class="acts">
          <button id="home-search">⌕ Search</button>
          <button class="go" id="home-add">＋ Add project</button>
        </div>
      </header>
      ${saidHtml()}

      <section class="home-work-strip ref-panel" aria-label="Continue working">
        <div class="home-strip-head"><b>Continue working</b><button class="quiet small" id="home-all-projects">View all</button></div>
        <div class="home-work-cards">
          <button class="home-action-card" id="home-add-card"><span>＋</span><b>Add project</b><small>Choose a folder on this computer</small></button>
          <button class="home-action-card" id="home-github" ${me.github ? '' : 'disabled title="Sign in to GitHub first"'}><span>${GITHUB_MARK}</span><b>GitHub Explorer</b><small>${me.github ? 'Find or bring in a project' : 'Connect GitHub in Settings'}</small></button>
          ${recent.slice(0, 4).map(projectCard).join('')}
        </div>
      </section>

      <div class="ref-home-layout">
        <main>
          <section class="ref-panel home-directory">
            <div class="home-directory-head">
              <div><h2>Projects & computers</h2><div class="home-directory-tabs"><button class="on" data-home-view="projects">Projects <span>${projects.length}</span></button><button data-home-view="devices">Computers <span>${devices.length}</span></button></div></div>
              <label class="find"><span>⌕</span><input id="home-directory-search" placeholder="Search projects or computers…"></label>
            </div>
            <div class="home-directory-list" id="home-project-directory">${recent.length ? recent.map(projectDirectoryRow).join('') : '<div class="empty compact">Projects you open will appear here.</div>'}</div>
            <div class="home-directory-list" id="home-device-directory" hidden>${devices.length ? devices.map(deviceRow).join('') : '<div class="empty compact">No Workspace computers are known yet.</div>'}</div>
          </section>
        </main>

        <aside class="ref-home-inspector">
          <div class="home-top-pair">
            <section class="ref-panel home-quick-actions"><div class="ref-panel-head"><h2>Quick actions</h2></div><button id="home-quick-add">Add project <span>›</span></button><button id="home-terminal">Open terminal <span>›</span></button><button id="home-ask">Ask AI <span>›</span></button><button id="home-apps">AI apps <span>›</span></button></section>
            <section class="ref-panel home-overview"><div class="ref-panel-head"><h2>Workstation</h2></div><div class="home-overview-name"><span class="project-badge">V</span><span><b>${esc(signedInAs() || 'Viberant')}</b><small>${online ? 'Reachable' : 'On this computer'}</small></span></div><div class="ref-workspace-counts"><span><b>${projects.length}</b><small>Projects</small></span><span><b>${online}</b><small>Online</small></span><span><b>${readyAi.length}</b><small>AI ready</small></span></div></section>
          </div>

          <section class="ref-panel ref-home-activity">
            <div class="ref-panel-head"><div><h2>${activeJobs.length ? 'Happening now' : 'Recent activity'}</h2></div><button class="quiet small" id="home-activity">View all</button></div>
            <div class="ref-job-list">${(activeJobs.length ? activeJobs : finishedJobs).slice(0, 5).map((job) => `<div><span class="summary-mark">${SUM_MARK.pulse}</span><span class="grow"><b>${esc(job.what)}</b><small>${esc(job.project ?? kindCalled(job.kind))}</small></span><span>${job.running ? 'Now' : 'Done'}</span></div>`).join('') || attention.slice(0,5).map((one) => `<button data-home-select="${esc(one.path)}"><span class="project-mini-mark">${KIND_MARK.project}</span><span class="grow"><b>${esc(one.name)}</b><small>${one.unsaved ? `${one.unsaved} changes waiting` : `${one.toSend} waiting to be sent`}</small></span><span>Review</span></button>`).join('') || '<p>Builds, transfers, AI work, and deployments will appear here.</p>'}</div>
          </section>

          <section class="ref-panel ref-home-workspace"><div class="ref-panel-head"><div><h2>Workspace</h2><small>${esc(teamState.workspace?.name ?? 'Not joined')}</small></div><span class="dot ${online ? 'live' : 'off'}"></span></div><div class="home-workspace-body"><div><b>${people.size}</b><small>people</small></div><div><b>${devices.length}</b><small>computers</small></div><p>${online ? `${online} computer${online === 1 ? '' : 's'} reachable now.` : 'Open Workspace to connect with another computer.'}</p><button class="go wide" id="home-workspace">${teamState.workspace ? 'Open Workspace' : 'Set up Workspace'}</button></div></section>
        </aside>
      </div>
    </div>`;
  said = null;

  const add = async () => {
    const path = await pickFolder({ title: 'Which folder is the project?', confirm: 'Open this folder' });
    if (path) await openProject(path);
  };
  $('#home-add').onclick = add;
  $('#home-add-card').onclick = add;
  $('#home-quick-add').onclick = add;
  $('#home-add-empty')?.addEventListener('click', add);
  $('#home-search').onclick = openPalette;
  $('#home-all-projects').onclick = async () => {
    at.inside = false;
    await post('/close');
    await refreshMe();
    go('projects');
  };
  $('#home-ask')?.addEventListener('click', () => go('ask'));
  $('#home-terminal')?.addEventListener('click', () => go('terminals'));
  $('#home-workspace').onclick = () => go('workspace');
  $('#home-activity').onclick = () => go('activity');
  $('#home-github').onclick = () => fromGitHub();
  $('#home-apps').onclick = () => go('apps');
  for (const row of document.querySelectorAll('[data-home-open]')) row.onclick = (event) => { event.stopPropagation(); openProject(row.dataset.homeOpen); };
  for (const row of document.querySelectorAll('[data-home-inspect]')) row.onclick = (event) => { event.stopPropagation(); statusSheet(row.dataset.homeInspect); };
  for (const button of document.querySelectorAll('[data-home-view]')) button.onclick = () => {
    const showingProjects = button.dataset.homeView === 'projects';
    $('#home-project-directory').hidden = !showingProjects;
    $('#home-device-directory').hidden = showingProjects;
    for (const other of document.querySelectorAll('[data-home-view]')) other.classList.toggle('on', other === button);
  };
  $('#home-directory-search').oninput = (event) => {
    const want = event.currentTarget.value.trim().toLowerCase();
    for (const row of document.querySelectorAll('[data-home-name]')) row.hidden = !!want && !row.dataset.homeName.includes(want);
  };
  for (const row of document.querySelectorAll('[data-home-select]')) row.onclick = () => {
    const chosen = projects.find((one) => one.path === row.dataset.homeSelect);
    if (!chosen) return;
    me.current = chosen.path;
    draw();
  };
  for (const button of document.querySelectorAll('[data-home-more]')) button.onclick = (event) => {
    event.stopPropagation();
    const one = projects.find((project) => project.path === button.dataset.homeMore);
    const room = button.getBoundingClientRect();
    menuAt({ x: room.right - 200, y: room.bottom + 6 }, moreForProject(one.path, !!one.private));
  };
};

// ---------------------------------------------------------------------------
// Keybinds — only actions the app can execute, edited with conflict checks
// ---------------------------------------------------------------------------

let keybindGroup = 'all';

SCREENS.keybinds = async () => {
  const state = await get('/keybinds');
  const actions = (state.groups ?? []).flatMap((group) => group.actions.map((one) => ({ ...one, groupName: group.name })));

  view.innerHTML = `
    <div class="keybind-page">
      <header class="pagehead command-head">
        <div class="grow"><span class="eyebrow">Keyboard control</span><h1>Keybinds</h1>
          <p class="sub">Move through Viberant without leaving the keyboard. Every binding below runs a real visible action.</p></div>
        <button class="quiet" id="keys-reset-all">Reset defaults</button>
      </header>
      ${saidHtml()}
      <div class="keybind-toolbar">
        <label class="find"><span>⌕</span><input id="keys-find" placeholder="Search shortcuts…"></label>
        <div class="segmented">${[['all', 'All'], ...(state.groups ?? []).map((one) => [one.id, one.name])].map(([id, name]) => `
          <button data-key-group="${esc(id)}" class="${keybindGroup === id ? 'on' : ''}">${esc(name)}</button>`).join('')}</div>
      </div>
      <div class="keybind-groups" id="keybind-groups">
        ${(state.groups ?? []).map((group) => `
          <section class="keybind-group" data-group="${esc(group.id)}">
            <div class="keybind-group-title"><span class="eyebrow">${esc(group.name)}</span><span>${group.actions.length} shortcuts</span></div>
            ${group.actions.map((one) => `
              <div class="keybind-row" data-key-row="${esc(`${one.name} ${one.why}`.toLowerCase())}">
                <span class="keybind-action"><b>${esc(one.name)}</b><small>${esc(one.why)}</small></span>
                <span class="keycaps"><kbd>Ctrl</kbd><span>+</span><kbd>${esc(one.key.toUpperCase())}</kbd></span>
                <span class="keybind-default">${one.key === one.default ? 'Default' : `Default: Ctrl ${esc(one.default.toUpperCase())}`}</span>
                <button class="small" data-edit-key="${esc(one.id)}">Edit</button>
                <button class="quiet small" data-reset-key="${esc(one.id)}" ${one.key === one.default ? 'disabled' : ''}>Reset</button>
              </div>`).join('')}
          </section>`).join('')}
      </div>
      <div class="keybind-note"><span>i</span><p><b>Shortcuts pause while you type.</b> Viberant only listens after Ctrl, never takes a bare key, and leaves Windows and browser shortcuts alone.</p></div>
    </div>`;
  said = null;

  const filter = () => {
    const want = $('#keys-find').value.trim().toLowerCase();
    for (const group of document.querySelectorAll('.keybind-group')) {
      const inGroup = keybindGroup === 'all' || group.dataset.group === keybindGroup;
      let shown = 0;
      for (const row of group.querySelectorAll('[data-key-row]')) {
        row.hidden = !inGroup || (want && !row.dataset.keyRow.includes(want));
        if (!row.hidden) shown += 1;
      }
      group.hidden = !shown;
    }
  };
  $('#keys-find').oninput = filter;
  for (const button of document.querySelectorAll('[data-key-group]')) {
    button.onclick = () => { keybindGroup = button.dataset.keyGroup; draw(); };
  }
  for (const button of document.querySelectorAll('[data-edit-key]')) {
    button.onclick = () => editKeybind(actions.find((one) => one.id === button.dataset.editKey));
  }
  for (const button of document.querySelectorAll('[data-reset-key]')) {
    button.onclick = async () => {
      say(await post('/keybinds/reset', { id: button.dataset.resetKey }));
      await refreshMe();
      draw();
    };
  }
  $('#keys-reset-all').onclick = async () => {
    const sure = await confirmThat({ title: 'Reset every shortcut?', what: 'Every edited key will return to the default shown on this page.', why: 'Nothing else in Viberant changes.', confirm: 'Reset shortcuts' });
    if (!sure) return;
    say(await post('/keybinds/reset', {}));
    await refreshMe();
    draw();
  };
  filter();
};

function editKeybind(one) {
  if (!one) return;
  let chosenKey = one.key;
  sheet({
    title: `Shortcut for ${one.name}`,
    narrow: true,
    body: `<div class="keybind-capture" id="keybind-capture" tabindex="0">
      <span>Press the new key</span><div class="keycaps"><kbd>Ctrl</kbd><span>+</span><kbd id="captured-key">${esc(one.key.toUpperCase())}</kbd></div>
      <p>One printable key. Ctrl is always included.</p></div><div id="keybind-error"></div>`,
    foot: '<button class="quiet" id="key-cancel">Never mind</button><button class="go" id="key-save">Save shortcut</button>',
    onOpen: () => {
      const capture = $('#keybind-capture');
      capture.focus();
      capture.onkeydown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.key.length !== 1 || /\s/.test(event.key)) return;
        chosenKey = event.key.toLowerCase();
        $('#captured-key').textContent = chosenKey.toUpperCase();
        $('#keybind-error').innerHTML = '';
      };
      $('#key-cancel').onclick = closeLayer;
      $('#key-save').onclick = async () => {
        const out = await post('/keybinds', { id: one.id, key: chosenKey });
        if (!out.ok) {
          $('#keybind-error').innerHTML = `<div class="said bad"><b>${esc(out.sentence)}</b><span>${esc(out.action ?? '')}</span></div>`;
          return;
        }
        closeLayer();
        say(out);
        await refreshMe();
        draw();
      };
    },
  });
}

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

let projectListFilter = 'all';
let projectFocusPath = null;

const stateChip = (mark) => {
  const which = MARK_LOOK[mark] ? mark : 'notStarted';
  return `<span class="state ${which}"><span class="pip"></span>${esc(MARK_LOOK[which].name)}</span>`;
};

SCREENS.projects = async () => {
  // The desktop process can keep a project open across a renderer reload. Keep
  // the Projects tab in that real project context instead of dropping back to
  // the library just because the front-end routing flag was recreated.
  if (!at.inside) {
    const currentProject = await get('/project');
    if (currentProject.open) at.inside = true;
  }
  if (at.inside) return drawOpenProject();

  const d = await get('/projects');
  const busy = d.projects.filter((p) => p.unsaved).length;
  // Counted from what each project actually says about itself, rather than
  // from a field that would have to be kept in step with it.
  const onGitHub = d.projects.filter((p) => /copy on GitHub/.test(p.reach ?? '')).length;
  const waiting = d.projects.filter((p) => (p.toSend ?? 0) > 0).length;
  const notStarted = d.projects.filter((p) => !p.mark || p.mark === 'notStarted').length;
  const focused = d.projects.find((p) => p.path === projectFocusPath) ?? d.projects[0] ?? null;

  view.innerHTML = `
    <div class="pagehead command-head">
      <div class="grow">
        <span class="eyebrow">Your work</span>
        <h1>Projects</h1>
        <p class="sub">Pick one, and every app on this computer opens already inside it.</p>
      </div>
      <div class="acts">
        <button id="p-explore">${GITHUB_MARK} GitHub Explorer</button>
        ${me.github ? '<button id="p-cloud">Your GitHub projects…</button>' : ''}
        <button class="go" id="p-add">＋ Add project</button>
      </div>
    </div>
    ${saidHtml()}

    ${d.projects.length ? `
      <section class="project-command-center">
        <div class="project-signal-ribbon" aria-label="Project summary">
          <div class="signal-primary"><span class="signal-mark">${SUM_MARK.project}</span>
            <span><b>${d.projects.length}</b><small>projects ready here</small></span></div>
          <div class="signal-line ${busy ? 'warn' : ''}"><b>${busy}</b><span>need attention</span></div>
          <div class="signal-line"><b>${onGitHub}</b><span>connected to GitHub${waiting ? ` · ${waiting} behind` : ''}</span></div>
          <div class="signal-line"><b>${notStarted}</b><span>not started</span></div>
        </div>

        <div class="project-command-grid">
          <div class="project-library">
            <div class="project-library-tools" aria-label="Project controls">
              <div class="segmented" id="p-filters">
                ${[
    ['all', 'All', d.projects.length],
    ['working', 'Working', d.projects.filter((p) => p.mark === 'working').length],
    ['notStarted', 'Not started', notStarted],
    ['finished', 'Finished', d.projects.filter((p) => p.mark === 'finished').length],
    ['published', 'Published', d.projects.filter((p) => p.mark === 'published').length],
    ['attention', 'Attention', busy],
  ].map(([id, name, count]) => `<button class="${projectListFilter === id ? 'on' : ''}"
                  data-project-filter="${id}">${name}<span>${count}</span></button>`).join('')}
              </div>
              <label class="find command-find">
                <span class="mark" aria-hidden="true">⌕</span>
                <input id="p-find" placeholder="Find a project…" aria-label="Search projects">
                <span class="kbd">Ctrl K</span>
              </label>
            </div>
            <div class="project-tile-grid" id="p-list">
              ${d.projects.map(projectRow).join('')}
            </div>
          </div>
          <aside class="project-focus" id="p-focus">${projectFocus(focused)}</aside>
        </div>
      </section>`
    : `<div class="empty">
         <b>No projects yet.</b>
         A project is just a folder. Add one and every app here opens straight into it.
         <span class="acts"><button class="go" id="p-add-2">Add a folder…</button></span>
       </div>`}

    ${me.github ? `
      <div class="sect">
        <h2>On GitHub, not here</h2>
        <div class="rest"></div>
        <div class="acts"><button class="quiet small" id="p-refresh">Check again</button></div>
      </div>
      <div id="cloud" class="sheetlist projects-cols"><div class="trow"><span class="spin"></span>
        <span class="tcell">Asking GitHub what you have…</span></div></div>` : ''}`;
  said = null;

  const addFolder = async () => {
    const path = await pickFolder({ title: 'Which folder is the project?', confirm: 'Open this folder' });
    if (path) await openProject(path);
  };
  $('#p-add')?.addEventListener('click', addFolder);
  $('#p-add-2')?.addEventListener('click', addFolder);
  $('#p-cloud')?.addEventListener('click', fromGitHub);
  $('#p-explore').onclick = openGitHubExplorer;

  // Narrowing a list is a thing you do to the page you are looking at, so it
  // happens here rather than by asking the manager again and redrawing.
  const find = $('#p-find');
  const filterProjects = () => {
    const want = find?.value.trim().toLowerCase() ?? '';
      let showing = 0;
      for (const row of document.querySelectorAll('#p-list [data-name]')) {
        const inText = !want || row.dataset.name.includes(want);
        const inGroup = projectListFilter === 'all'
          || (projectListFilter === 'attention' && row.dataset.attention === '1')
          || row.dataset.mark === projectListFilter;
        const match = inText && inGroup;
        row.hidden = !match;
        if (match) showing += 1;
      }
      $('#p-none')?.remove();
      if (!showing) {
        $('#p-list').insertAdjacentHTML('beforeend',
          `<div class="empty" id="p-none"><b>No project matches “${esc(find.value.trim())}”.</b></div>`);
      }
  };
  if (find) find.oninput = filterProjects;
  for (const b of document.querySelectorAll('[data-project-filter]')) {
    b.onclick = () => {
      projectListFilter = b.dataset.projectFilter;
      for (const other of document.querySelectorAll('[data-project-filter]')) other.classList.toggle('on', other === b);
      filterProjects();
    };
  }

  lastMarks = d.marks;

  const wireProjectFocus = (p) => {
    $('#focus-open')?.addEventListener('click', () => openProject(p.path));
    $('#focus-inspect')?.addEventListener('click', () => inspectProject(p));
    $('#focus-reveal')?.addEventListener('click', () => post('/reveal', { path: p.path }));
    $('#focus-more')?.addEventListener('click', (e) => {
      const room = e.currentTarget.getBoundingClientRect();
      menuAt({ x: room.right - 200, y: room.bottom + 6 }, moreForProject(p.path, !!p.private));
    });
  };
  if (focused) wireProjectFocus(focused);

  for (const el of document.querySelectorAll('[data-open]')) {
    // One press selects and shows what is known about it; two opens it. A row
    // that opened a project on a single press meant you could not look at one
    // without leaving the list you were looking at it from.
    el.onclick = (e) => {
      if (e.target.closest('button')) return;
      for (const other of document.querySelectorAll('#p-list .on')) other.classList.remove('on');
      el.classList.add('on');
      const chosen = d.projects.find((p) => p.path === el.dataset.open);
      if (!chosen) return;
      projectFocusPath = chosen.path;
      $('#p-focus').innerHTML = projectFocus(chosen);
      wireProjectFocus(chosen);
    };
    el.ondblclick = (e) => { if (e.target.closest('button')) return; openProject(el.dataset.open); };
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
  if (focused) document.querySelector(`[data-open="${CSS.escape(focused.path)}"]`)?.classList.add('on');
};

/**
 * One project, beside the list it is in.
 *
 * Only what this computer actually knows. Where a project has no copy on GitHub
 * there is no repository line at all — an empty field reading "none" is a field
 * that costs a row and says nothing.
 *
 * The repository is asked for separately because it means going to the project
 * on disk, and the rest of this appears at once.
 */
async function inspectProject(p) {
  if (!p) return inspect(null);

  const facts = [
    { label: 'Where it is', value: p.path, mono: true },
    { label: 'State', value: MARK_LOOK[p.mark]?.name ?? 'Yet to start' },
    { label: 'Last saved', value: p.saved },
    { label: 'Unsaved changes', value: p.unsaved || null },
    { label: 'Kind', value: p.kind },
    { label: 'Your other computers', value: p.private ? 'Not offered' : 'Offered' },
  ];

  inspect({
    name: p.name,
    kind: 'Project',
    mark: KIND_MARK.project,
    facts,
    acts: [
      { what: 'Open it', run: () => openProject(p.path) },
      { what: 'Show it in Explorer', run: () => post('/reveal', { path: p.path }) },
      { what: 'What is in it', run: () => statusSheet(p.path) },
      { what: 'Take it out of this list', run: () => forgetProject(p.path) },
      { what: 'Delete it from this computer…', danger: true, run: () => deleteProject(p.path) },
    ],
  });

  // The binding and how the project stands, once it has been asked. Added to
  // what is already on screen rather than replacing it, so nothing moves.
  const b = await get(`/project/binding?path=${encodeURIComponent(p.path)}`);
  if (inspecting?.name !== p.name) return;

  const added = [];
  if (b?.bound) {
    added.push({
      label: 'GitHub',
      mono: true,
      value: `${b.owner}/${b.repo}`,
      html: `<a href="${esc(b.url ?? '#')}" target="_blank" rel="noreferrer">${esc(b.owner)}/${esc(b.repo)}</a>`,
    });
    if (b.branch) added.push({ label: 'Line', value: b.branch, mono: true });
  }

  // Only what was actually checked. A tick nobody verified is worse than a
  // blank line, because it is the thing somebody believes until they press
  // Build and find out otherwise.
  const checks = b?.health?.checks ?? [];
  if (checks.length) {
    added.push({
      label: 'How it stands',
      value: checks.length,
      html: `<span class="checks">${checks.map((c) => `
        <span class="check ${c.state}">
          <span class="pip"></span>
          <b>${esc(c.name)}</b>
          <span>${esc(c.says)}</span>
        </span>`).join('')}</span>`,
    });
  }

  if (!added.length) return;
  inspect({ ...inspecting, facts: [...facts.slice(0, 1), ...added, ...facts.slice(1)] });
}

/**
 * The four marks, kept from the last time the list was drawn.
 *
 * The sheet that sets one is now reached from a menu built outside the function
 * that has the list to hand, and passing it down through three layers to be
 * used once is worse than remembering it here.
 */
let lastMarks = [];

/** The selected project as a workbench, not a second copy of the library row. */
function projectFocus(p) {
  if (!p) return '<div class="empty compact"><b>Nothing selected.</b>Choose a project to see its working context.</div>';
  const hasGitHub = /copy on GitHub/.test(p.reach ?? '');
  const mark = MARK_LOOK[p.mark] ? p.mark : 'notStarted';
  return `
    <div class="focus-kicker"><span>In focus</span>${stateChip(mark)}</div>
    <div class="focus-identity">
      <span class="project-badge" aria-hidden="true">${KIND_MARK.project}</span>
      <div><h2>${esc(p.name)}</h2><span class="mono">${esc(shortPath(p.path))}</span></div>
    </div>
    <p class="focus-sentence">${p.unsaved
    ? `${p.unsaved} unsaved change${p.unsaved === 1 ? '' : 's'} need your attention.`
    : `Everything here is saved. ${esc(p.saved ?? '')}`}</p>
    <div class="focus-facts">
      <div><span>Source</span><b>${hasGitHub ? 'GitHub' : p.private ? 'This computer' : 'Offered'}</b></div>
      <div><span>Kind</span><b>${esc(p.kind || 'Project')}</b></div>
      <div><span>Last saved</span><b>${esc(p.saved || 'Not yet')}</b></div>
    </div>
    <div class="focus-primary-actions">
      <button class="go" id="focus-open">Open project</button>
      <button id="focus-inspect">Project details</button>
    </div>
    <div class="focus-secondary-actions">
      <button class="quiet" id="focus-reveal">Show in Explorer</button>
      <button class="quiet icon" id="focus-more" aria-label="More project actions">⋯</button>
    </div>`;
}

/**
 * One project, with the four things worth knowing at a glance: what state it is
 * in, when you last stopped, what you were doing when you did, and where it is.
 */
function projectRow(p) {
  const mark = MARK_LOOK[p.mark] ? p.mark : 'notStarted';
  const hasGitHub = /copy on GitHub/.test(p.reach ?? '');
  return `
    <article class="project-tile" data-open="${esc(p.path)}"
      data-name="${esc(p.name.toLowerCase())} ${esc(String(p.path).toLowerCase())}"
      data-attention="${p.unsaved ? '1' : '0'}" data-github="${hasGitHub ? '1' : '0'}"
      data-mark="${esc(mark)}">
      <div class="project-tile-top">
        <span class="project-mini-mark ${p.unsaved ? 'attention' : ''}" aria-hidden="true">${KIND_MARK.project}</span>
        <span class="grow"><b>${esc(p.name)}</b><small class="mono">${esc(shortPath(p.path))}</small></span>
        <button class="quiet small icon" data-more="${esc(p.path)}" data-now="${p.private ? '1' : '0'}"
          data-tip="More for ${esc(p.name)}" aria-label="More for ${esc(p.name)}">⋯</button>
      </div>
      <div class="project-tile-status">
        ${stateChip(mark)}
        <span class="project-source"><span class="dot ${hasGitHub ? 'live' : p.private ? 'off' : 'cool'}"></span>${
  hasGitHub ? 'GitHub' : p.private ? 'This computer' : 'Offered'}</span>
      </div>
      <div class="project-tile-foot">
        <span class="${p.unsaved ? 'warn' : 'dim'}">${p.unsaved ? `${p.unsaved} unsaved` : esc(p.saved ?? 'Not saved yet')}</span>
        <button class="small" data-open-now="${esc(p.path)}">Open</button>
      </div>
    </article>`;
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
  { what: 'Show it in Explorer', run: () => post('/reveal', { path }) },
  { what: 'Copy where it is', run: () => navigator.clipboard?.writeText(path) },
  '-',
  { what: 'What is in it', run: () => statusSheet(path) },
  { what: 'Where you have got to', run: () => markSheet(path, lastMarks) },
  {
    what: isPrivate ? 'Offer it to my other computers' : 'Stop offering it',
    run: async () => {
      say(await post('/projects/private', { path, private: !isPrivate }));
      draw();
    },
  },
  '-',
  { what: 'Take it out of this list', run: () => forgetProject(path) },
  { what: 'Delete it from this computer…', danger: true, run: () => deleteProject(path) },
];

/**
 * Stop keeping a project in the list. Nothing on disk is touched.
 *
 * Asked about anyway, because "remove" is a word people read as "delete" and
 * the two live next to each other in the same menu. One sentence saying what
 * this is *not* costs a press and prevents a fright.
 */
async function forgetProject(path) {
  const sure = await confirmThat({
    title: `Take ${tail(path)} out of the list`,
    what: 'It stops being listed here.',
    why: `Every file stays exactly where it is, at ${path}. Nothing is deleted, `
      + 'and nothing on GitHub or on your other computers changes. Add the folder '
      + 'again whenever you like.',
    confirm: 'Take it out',
  });
  if (!sure) return;
  say(await post('/projects/forget', { path }));
  draw();
}

/**
 * Put a project's folder in the recycle bin.
 *
 * The only destructive thing in the product, so it says exactly what it will
 * remove, exactly what it will not, and where it is going — and it asks for the
 * project's own name, because a mis-click should not be able to reach this.
 */
async function deleteProject(path) {
  const name = tail(path);
  const typed = await ask({
    title: `Delete ${name} from this computer`,
    label: `This puts ${path} in your recycle bin. Nothing on GitHub is deleted, and `
      + `no copy on your other computers is touched. Type ${name} to confirm.`,
    value: '',
    confirm: 'Delete it',
    danger: true,
  });
  if (typed === null) return;
  if (String(typed).trim() !== name) {
    say({ ok: false, sentence: 'That is not the name of the project, so nothing was deleted.', action: 'Try again if you meant to.' });
    return draw();
  }
  say(await post('/projects/delete', { path }));
  draw();
}

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

/**
 * GitHub discovery lives beside Projects rather than in a browser-shaped
 * detour. Public search works without an account; the account tab is shown
 * only when one is genuinely connected.
 */
function openGitHubExplorer() {
  let mode = 'explore';
  let sort = 'updated';
  let timer = null;

  const shell = () => `
    <div class="github-explorer">
      <div class="github-explorer-tabs">
        <button data-gh-mode="explore" class="${mode === 'explore' ? 'on' : ''}">Explore</button>
        <button data-gh-mode="mine" class="${mode === 'mine' ? 'on' : ''}" ${me.github ? '' : 'disabled'}>Your projects</button>
      </div>
      <label class="find github-find"><span>⌕</span><input id="github-find" placeholder="Search projects, topics, people…"></label>
      <div class="github-explorer-filters">
        <select id="github-sort" aria-label="Sort GitHub results">
          <option value="updated" ${sort === 'updated' ? 'selected' : ''}>Recently updated</option>
          <option value="stars" ${sort === 'stars' ? 'selected' : ''}>Most starred</option>
          <option value="forks" ${sort === 'forks' ? 'selected' : ''}>Most copied</option>
        </select>
        <span id="github-total"></span>
      </div>
      <div class="github-results" id="github-results"><div class="github-loading"><span class="spin"></span> Asking GitHub…</div></div>
    </div>`;

  inspect({
    name: 'GitHub Explorer',
    kind: 'Find and bring projects',
    mark: GITHUB_MARK,
    body: shell(),
    onOpen: wire,
  });

  function wire(box) {
    for (const button of box.querySelectorAll('[data-gh-mode]')) {
      button.onclick = () => {
        mode = button.dataset.ghMode;
        box.querySelector('.github-explorer').outerHTML = shell();
        wire(box);
      };
    }
    $('#github-sort').onchange = (event) => { sort = event.target.value; search(); };
    $('#github-find').oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(search, 280);
    };
    search();
  }

  async function search() {
    const results = $('#github-results');
    if (!results) return;
    results.innerHTML = '<div class="github-loading"><span class="spin"></span> Asking GitHub…</div>';
    const query = $('#github-find')?.value.trim() ?? '';
    const out = mode === 'mine'
      ? await get('/github/mine')
      : await get(`/github/explore?q=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}&limit=30`);
    if (!results.isConnected) return;
    $('#github-total').textContent = out.ok && Number.isFinite(out.total) ? `${out.total.toLocaleString()} found` : '';
    if (!out.ok) {
      results.innerHTML = `<div class="said bad"><b>${esc(out.sentence)}</b><span>${esc(out.action ?? '')}</span></div>`;
      return;
    }
    const projects = out.projects ?? [];
    results.innerHTML = projects.length ? projects.map((one, index) => `
      <article class="github-result">
        <div class="github-result-head"><span class="github-owner-mark">${esc((one.owner ?? one.fullName ?? one.name).slice(0, 1).toUpperCase())}</span>
          <div class="grow"><b>${esc(one.fullName ?? `${one.owner ? `${one.owner}/` : ''}${one.name}`)}</b>
            <span>${esc(one.about ?? 'No description provided.')}</span></div></div>
        <div class="github-result-facts">
          ${one.language ? `<span><i class="language-dot"></i>${esc(one.language)}</span>` : ''}
          <span>${esc(one.visibility ?? 'public')}</span>
          ${one.stars ? `<span>★ ${one.stars.toLocaleString()}</span>` : ''}
          ${one.forks ? `<span>⑂ ${one.forks.toLocaleString()}</span>` : ''}
          ${one.changed ? `<span>${esc(ago(one.changed))}</span>` : ''}
        </div>
        <div class="github-result-actions">
          <button class="quiet small" data-github-page="${esc(one.url)}">Open on GitHub</button>
          <button class="go small" data-github-bring="${index}">Bring to Viberant</button>
        </div>
      </article>`).join('') : '<div class="empty compact"><b>No projects matched.</b>Try another name, owner, or topic.</div>';

    for (const button of results.querySelectorAll('[data-github-page]')) {
      button.onclick = () => post('/open/page', { at: button.dataset.githubPage });
    }
    for (const button of results.querySelectorAll('[data-github-bring]')) {
      button.onclick = async () => {
        const one = projects[Number(button.dataset.githubBring)];
        const into = await pickFolder({
          title: `Where should ${one.name} live?`, confirm: 'Put the project here',
          startAt: me.settings?.workFolder,
        });
        if (!into) return;
        button.disabled = true;
        button.textContent = 'Bringing…';
        const brought = await post('/github/bring', { url: one.cloneUrl ?? one.url, into });
        if (!brought.ok) {
          button.disabled = false;
          button.textContent = 'Bring to Viberant';
          say(brought);
          return draw();
        }
        closeInspector();
        await refreshMe();
        at.inside = true;
        draw();
      };
    }
  }
}

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
  inspect(null);
  // Home used to open the folder in state and then repaint Home over it. An
  // explicit project open always lands in Project Detail, regardless of which
  // command-center row initiated it.
  at.tab = 'projects';
  at.inside = true;
  said = null;
  (view.closest('main') || view).scrollTop = 0;
  await refreshMe();
  drawNav();
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

/**
 * Asking about the project that is open, wherever you are standing.
 *
 * The same panel appears on the open project and on a place of its own, because
 * these are the same four questions either way and having two of them would
 * mean two that drift apart. What differs is only how much room it has.
 */
function askPanel(p, { heading = 'Ask about this project', expanded = false } = {}) {
  const suggestions = `
    <div class="assistant-suggestions" aria-label="Suggested questions">
      <button data-ai-prompt="Give me a concise overview of this project">Project overview</button>
      <button data-ai-prompt="What should I work on next in this project?">What next?</button>
      <button data-ai-prompt="Where are the highest-risk parts of this project?">Find risks</button>
    </div>`;
  const composer = `
    <div class="assistant-composer">
      <span class="assistant-spark" aria-hidden="true">✦</span>
      <input id="ai-q" placeholder="Ask anything about ${esc(p?.name ?? 'this project')}…"
        aria-label="Ask about this project">
      <button class="quiet small" id="ai-diagnose">Check project</button>
      <button class="quiet small" id="ai-review" ${p?.situation?.unsaved ? '' : 'disabled'}
        data-tip="${p?.situation?.unsaved ? 'Look over what you have changed but not saved'
    : 'Nothing unsaved to look at'}">Review changes</button>
      <button class="small" id="ai-change"
        data-tip="Shows every file it would write before anything changes">Plan a change</button>
      <button class="go small" id="ai-ask">Ask</button>
    </div>`;

  return `
    <div class="assistant-panel ${expanded ? 'expanded' : ''}">
      <header class="assistant-head">
        <div><span class="eyebrow">Project intelligence</span><h2>${esc(heading)}</h2></div>
        <button class="provider-pill" id="ai-who">Reading provider…</button>
      </header>
      ${expanded ? `
        <div class="assistant-stage">
          <div class="assistant-welcome">
            <span class="assistant-orbit" aria-hidden="true">✦</span>
            <span class="eyebrow">Ready with ${esc(p?.name ?? 'this project')}</span>
            <h3>What do you want to understand?</h3>
            <p>Ask how it fits together, where risk is concentrated, or how to approach a change.</p>
            ${suggestions}
            <div class="assistant-scope-line">
              <span><b>${p?.situation?.unsaved ?? 0}</b> unsaved</span>
              <span>Answers stay scoped to this project</span>
              <span>Changes wait for your approval</span>
            </div>
          </div>
          <div class="assistant-result" id="ai-out"></div>
        </div>
        ${composer}` : `${suggestions}${composer}<div class="assistant-result" id="ai-out"></div>`}
    </div>`;
}

function wireAskPanel() {
  /**
   * Which one is about to be asked, said before anybody asks it.
   *
   * A question here costs money at whichever company answers it, so which
   * company that is belongs on screen next to the button rather than three
   * pages away in Settings. It also says when the chosen one has no key and
   * another is standing in, because being charged by a company you did not pick
   * is a surprise nobody should get from a manager.
   */
  get('/ai').then((who) => {
    const label = $('#ai-who');
    if (!label) return;
    label.textContent = who.ok
      ? (who.insteadOf ? `${who.name}, not ${who.insteadOf}` : `${who.name} \u00b7 ${modelNamed(who, who.using)}`)
      : 'no AI connected yet';
    label.title = who.ok
      ? who.insteadOf
        ? `${who.insteadOf} is chosen and has no key here, so ${who.name} is being asked instead. Press to change it.`
        : `Questions go to ${who.name} and nowhere else. Press to change which one, or which model.`
      : `${who.sentence} ${who.action} Press to do it here.`;
    label.classList.add('pressable');
    label.onclick = () => setUpAi();
  });

  $('#ai-diagnose').onclick = () => askAssistant('diagnose', '/ai/diagnose');
  $('#ai-review').onclick = () => askAssistant('review', '/ai/review');
  const askIt = () => {
    const q = $('#ai-q').value.trim();
    if (q) askAssistant('ask', '/ai/ask', { question: q });
  };
  $('#ai-ask').onclick = askIt;
  $('#ai-q').onkeydown = (e) => { if (e.key === 'Enter') askIt(); };
  for (const b of document.querySelectorAll('[data-ai-prompt]')) {
    b.onclick = () => {
      $('#ai-q').value = b.dataset.aiPrompt;
      askIt();
    };
  }
  $('#ai-change').onclick = () => {
    const q = $('#ai-q').value.trim();
    if (!q) return say({ ok: false, sentence: 'There was nothing to ask for.', action: 'Say what you want changed first.' }) && draw();
    askAssistant('propose', '/ai/propose', { wanted: q });
  };
}

/**
 * A place for asking, so it is not something you find by opening a project.
 *
 * It was reachable before, but only from inside one screen, which meant nobody
 * who had not already gone looking knew it existed. A place in the rail is the
 * whole of the difference between a feature and a feature somebody uses.
 */
SCREENS.ask = async () => {
  const [p, projectsState, who] = await Promise.all([get('/project'), get('/projects'), get('/ai')]);
  const projects = projectsState.projects ?? [];
  const providers = who.models ?? [];
  const providerName = who.ok ? (who.insteadOf ? `${who.name}, not ${who.insteadOf}` : who.name) : 'Not connected';
  const modelName = who.ok ? modelNamed(who, who.using) : 'Choose a provider';
  const projectChoices = projects.slice(0, 4).map((one) => `
    <button class="ref-assistant-project ${one.path === p.dir ? 'on' : ''}" data-assistant-open="${esc(one.path)}">
      <span class="project-mini-mark">${KIND_MARK.project}</span>
      <span class="grow"><b>${esc(one.name)}</b><small>${esc(shortPath(one.path))}</small></span>
      ${one.path === p.dir ? '<span class="check">✓</span>' : ''}
    </button>`).join('');
  const providerChoices = providers.map((provider) => `
    <section class="ref-model-group ${provider.id === who.model?.id ? 'on' : ''}">
      <button class="ref-model-provider" data-ai-provider="${esc(provider.id)}">
        <span class="provider-monogram">${esc(provider.name.slice(0, 2).toUpperCase())}</span>
        <span class="grow"><b>${esc(provider.name)}</b><small>${provider.ready ? 'Connected' : 'Needs a key'}</small></span>
        <span>⌄</span>
      </button>
      <div class="ref-model-list">
        ${(provider.models ?? []).map((model) => `<button data-ai-model="${esc(provider.id)}|${esc(model.id)}" class="${provider.id === who.model?.id && model.id === who.using ? 'on' : ''}" ${provider.ready ? '' : 'disabled'}><span>${esc(model.name)}</span>${model.free ? '<small>Included</small>' : ''}</button>`).join('')}
      </div>
    </section>`).join('');

  view.innerHTML = `
    <div class="ref-assistant-page">
    <header class="ref-assistant-head">
      <div class="grow"><h1>AI Assistant</h1><p>Your project-aware coding partner. Context stays visible and every proposed change waits for review.</p></div>
      <div class="acts"><button id="ask-change-project">Change project</button><button class="go" id="assistant-new">＋ New question</button></div>
    </header>
    ${saidHtml()}

    ${p?.name ? `
      <div class="ref-assistant-shell">
        <aside class="ref-assistant-rail">
          <section class="ref-assistant-chooser">
            <div class="ref-side-title"><span><b>1</b> Project</span><button class="quiet icon" id="assistant-all-projects" aria-label="Choose another project">⌄</button></div>
            <div class="ref-current-project"><span class="project-badge">${KIND_MARK.project}</span><span class="grow"><b>${esc(p.name)}</b><small>${esc(shortPath(p.dir))}</small></span><span>⌃</span></div>
            <span class="ref-side-label">From Projects</span>
            <div class="ref-assistant-projects">${projectChoices}</div>
            <button class="quiet wide small" id="assistant-view-projects">View all projects →</button>
          </section>
          <section class="ref-assistant-chooser model-chooser">
            <div class="ref-side-title"><span><b>2</b> AI provider & model</span><button class="quiet icon" id="ai-pick" aria-label="Set up AI">⌄</button></div>
            <div class="ref-current-model"><span class="provider-monogram">AI</span><span class="grow"><b>${esc(providerName)}</b><small>${esc(modelName)}</small></span></div>
            <div class="ref-provider-groups">${providerChoices}</div>
            <button class="quiet wide small" id="assistant-model-details">Provider settings →</button>
          </section>
        </aside>

        <main class="ref-assistant-main">${askPanel(p, { heading: `${providerName} with ${p.name}`, expanded: true })}</main>

        <aside class="ref-assistant-facts">
          <section><div class="panel-title"><b>Project facts</b><span>Live</span></div>
            <div class="context-item"><span>Name</span><b>${esc(p.name)}</b></div>
            <div class="context-item"><span>Path</span><b title="${esc(p.dir)}">${esc(shortPath(p.dir))}</b></div>
            <div class="context-item"><span>Type</span><b>${esc(p.kind ?? 'Project')}</b></div>
            <div class="context-item"><span>Last saved</span><b>${esc(p.saved ?? 'Not yet')}</b></div>
            <div class="context-item"><span>Changes here</span><b>${p.situation?.unsaved ?? 0}</b></div>
            <button class="wide" id="assistant-reindex">Inspect project files</button>
          </section>
          <section><div class="panel-title"><b>AI settings</b><span>${esc(providerName)}</span></div>
            <div class="context-item"><span>Model</span><b>${esc(modelName)}</b></div>
            <div class="context-item"><span>Project context</span><b>On</b></div>
            <div class="context-item"><span>File changes</span><b>Approval required</b></div>
            <button class="wide" id="assistant-ai-settings">Change provider or model</button>
          </section>
          <section class="ref-suggested-tasks"><div class="panel-title"><b>Suggested tasks</b></div>
            <button data-ai-prompt="Review the recent changes and identify the most important risk."><span>⌁</span><span><b>Review recent changes</b><small>Find important risks</small></span></button>
            <button data-ai-prompt="Explain the architecture and the boundaries between its main parts."><span>◇</span><span><b>Map the architecture</b><small>Understand the project</small></span></button>
            <button data-ai-prompt="What should I do next in this project, and why?"><span>↗</span><span><b>Plan what comes next</b><small>Choose the next useful step</small></span></button>
          </section>
          <section class="ref-assistant-promo"><span class="eyebrow">AI apps</span><h3>Keep building in your favorite coding app.</h3><p>Open the current project with the same context.</p><button class="go" id="assistant-open-apps">Explore AI apps →</button></section>
        </aside>
      </div>`
    : `<div class="empty"><b>Nothing is open yet.</b>
        These questions are about a project, so there has to be one.
        <span class="acts"><button class="go" id="ask-pick">Choose a project\u2026</button></span></div>`}
    </div>`;
  said = null;

  $('#ask-pick')?.addEventListener('click', chooseProjectForAssistant);
  $('#ask-change-project')?.addEventListener('click', chooseProjectForAssistant);
  $('#assistant-all-projects')?.addEventListener('click', chooseProjectForAssistant);
  $('#assistant-view-projects')?.addEventListener('click', chooseProjectForAssistant);
  $('#ai-pick')?.addEventListener('click', () => setUpAi());
  $('#assistant-model-details')?.addEventListener('click', () => setUpAi());
  $('#assistant-ai-settings')?.addEventListener('click', () => setUpAi());
  $('#assistant-open-apps')?.addEventListener('click', () => go('apps'));
  $('#assistant-new')?.addEventListener('click', () => {
    const out = $('#ai-out');
    if (out) out.innerHTML = '';
    $('.assistant-panel')?.classList.remove('has-output');
    if ($('#ai-q')) { $('#ai-q').value = ''; $('#ai-q').focus(); }
  });
  for (const button of document.querySelectorAll('[data-assistant-open]')) button.onclick = async () => {
    const opened = await post('/open', { path: button.dataset.assistantOpen });
    if (!opened.ok) return say(opened) && draw();
    await refreshMe();
    draw();
  };
  for (const button of document.querySelectorAll('[data-ai-provider]')) button.onclick = () => setUpAi();
  for (const button of document.querySelectorAll('[data-ai-model]')) button.onclick = async () => {
    const [provider, model] = button.dataset.aiModel.split('|');
    say(await post('/ai/choose', { provider, model }));
    draw();
  };
  if (p?.name) {
    wireAskPanel();
    $('#assistant-reindex').onclick = () => statusSheet(p.dir);
  }
};

/**
 * Pick the Assistant context from Viberant projects first. Browsing the disk
 * remains available as a secondary route for a folder not known here yet.
 */
async function chooseProjectForAssistant() {
  const [local, remote] = await Promise.all([
    get('/projects'),
    get('/github/mine').catch(() => ({ ok: false, projects: [] })),
  ]);
  const localRows = (local.projects ?? []).map((project) => `
    <button class="assistant-project-choice" data-assistant-local="${esc(project.path)}">
      <span class="project-badge">${KIND_MARK.project}</span>
      <span class="grow"><b>${esc(project.name)}</b><span>${esc(project.path)}</span></span>
      ${stateChip(project.mark)}
    </button>`).join('');
  const remoteRows = (remote.projects ?? []).slice(0, 20).map((project, index) => `
    <div class="assistant-project-choice remote">
      <span class="project-badge">${MARKS.github()}</span>
      <span class="grow"><b>${esc(project.fullName ?? project.name)}</b><span>${esc(project.about ?? `${project.visibility} on GitHub`)}</span></span>
      <button class="small" data-assistant-remote="${index}">Bring here…</button>
    </div>`).join('');

  sheet({
    title: 'Choose project context',
    body: `<div class="assistant-project-picker">
      <label class="search-line"><span aria-hidden="true">⌕</span><input id="assistant-project-search" type="search" placeholder="Search projects…" autocomplete="off"></label>
      <span class="eyebrow">On this computer</span>
      <div>${localRows || '<div class="empty small">No local projects are known yet.</div>'}</div>
      <span class="eyebrow assistant-remote-title">Your GitHub projects</span>
      <div>${remoteRows || `<div class="empty small">${remote.ok ? 'No GitHub projects were found.' : 'Connect GitHub to choose a project that is not on this computer yet.'}</div>`}</div>
    </div>`,
    foot: '<button class="quiet" id="assistant-browse-folder">Browse for another folder…</button><button id="assistant-project-done">Cancel</button>',
  });

  $('#assistant-project-search').oninput = () => {
    const wanted = $('#assistant-project-search').value.trim().toLowerCase();
    for (const row of layer.querySelectorAll('.assistant-project-choice')) {
      row.hidden = !!wanted && !row.textContent.toLowerCase().includes(wanted);
    }
  };
  $('#assistant-project-done').onclick = closeLayer;
  $('#assistant-browse-folder').onclick = async () => {
    const path = await pickFolder({ title: 'Choose a project folder', confirm: 'Use this project' });
    if (!path) return;
    const opened = await post('/open', { path });
    if (!opened.ok) return say(opened);
    closeLayer();
    draw();
  };
  for (const row of layer.querySelectorAll('[data-assistant-local]')) {
    row.onclick = async () => {
      const opened = await post('/open', { path: row.dataset.assistantLocal });
      if (!opened.ok) return say(opened);
      closeLayer();
      draw();
    };
  }
  for (const button of layer.querySelectorAll('[data-assistant-remote]')) {
    button.onclick = async () => {
      const project = remote.projects[Number(button.dataset.assistantRemote)];
      const into = await pickFolder({ title: `Where should ${project.name} go?`, confirm: 'Bring it here' });
      if (!into) return;
      const brought = await post('/github/bring', { url: project.cloneUrl, into });
      if (!brought.ok) return say(brought);
      closeLayer();
      draw();
    };
  }
}

async function drawOpenProject() {
  const [p, t, platforms] = await Promise.all([get('/project'), get('/tools'), get('/project/platforms')]);
  if (!p.open) { at.inside = false; return draw(); }

  const open = whatIsOpen(p, t.tools);
  const binding = await get(`/project/binding?path=${encodeURIComponent(p.dir)}`);
  const webReady = platforms.web?.category === 'WEB_SAFE';
  const webExists = !!platforms.web?.root;
  const webLive = platforms.web?.status === 'LIVE';
  const webSteps = [
    ['Analyze', true],
    ['Compatibility', !!platforms.web?.category],
    ['Create', webExists],
    ['Preview', !!platforms.web?.at],
    ['Deploy', webLive],
  ];

  /*
   * The two shapes a web version can take, as real choices rather than
   * decoration. One that cannot work here is shown with the reason it cannot,
   * instead of quietly not responding — and once a target exists, the cards
   * state which shape it actually is.
   */
  const category = platforms.web?.category ?? null;
  const recommended = platforms.recommendation === 'WEB_COMPANION' ? 'WEB_COMPANION' : 'STANDALONE_WEB';
  const existingArch = platforms.web?.architecture ?? (webExists ? 'STANDALONE_WEB' : null);
  const architectures = [
    { id: 'STANDALONE_WEB', name: 'Standalone Web',
      why: 'The browser target runs on its own, with nothing reaching back to this computer.',
      cannot: category === 'DESKTOP_ONLY' ? 'No browser surface was found in this project.' : null },
    { id: 'WEB_COMPANION', name: 'Web Companion',
      why: 'A browser interface connects securely to the desktop capabilities it needs.',
      cannot: category === 'WEB_SAFE' ? 'Nothing here needs the desktop computer, so there is nothing for a companion to connect.' : null },
  ];
  let chosenArchitecture = existingArch
    ?? architectures.find((one) => one.id === recommended && !one.cannot)?.id
    ?? architectures.find((one) => !one.cannot)?.id
    ?? null;
  const archCard = (one) => {
    if (webExists) {
      const isIt = existingArch === one.id;
      return `<div class="architecture-choice ${isIt ? 'on' : 'cannot'}"><span class="choice-dot"></span>
        <span><b>${esc(one.name)}</b><small>${isIt ? 'This is the shape of the created target.' : esc(one.why)}</small></span></div>`;
    }
    if (one.cannot) {
      return `<div class="architecture-choice cannot"><span class="choice-dot"></span>
        <span><b>${esc(one.name)}</b><small>${esc(one.cannot)}</small></span></div>`;
    }
    return `<button class="architecture-choice ${chosenArchitecture === one.id ? 'on' : ''}" data-arch="${one.id}"><span class="choice-dot"></span>
      <span><b>${esc(one.name)}</b><small>${esc(one.why)}</small></span></button>`;
  };

  view.innerHTML = `
    <div class="ref-project-detail">
      <div class="ref-project-crumbs"><button class="backlink" id="back">Projects</button><span>›</span><span>${esc(p.name)}</span><span>›</span><b>Platforms</b></div>
      <header class="ref-project-identity">
        <div class="project-badge" aria-hidden="true">${KIND_MARK.project}</div>
        <div class="grow"><div class="identity-line"><h1>${esc(p.name)}</h1>${stateChip(p.mark)}</div><div class="path">${esc(p.dir)}</div></div>
        <div class="acts"><button id="pd-reveal">Open</button><button id="to-terms">Terminal</button><button id="more">Share</button><button class="go" id="to-ship">Deploy</button><button class="quiet icon" id="to-apps" aria-label="Open in AI app">⋯</button></div>
        <div class="ref-project-meta"><span><small>Type</small><b>Desktop app</b></span><span><small>Source</small><b>${binding?.bound ? 'GitHub' : 'This computer'}</b></span><span><small>Last saved</small><b>${esc(p.saved || 'Not yet')}</b></span><span><small>Changes</small><b class="${p.situation?.unsaved ? 'warn' : ''}">${p.situation?.unsaved || 'None'}</b></span><span><small>Sessions</small><b>${open.length}</b></span></div>
      </header>

      <nav class="ref-project-tabs" aria-label="Project sections"><button>Overview</button><button class="on" data-project-scroll="project-platforms">Platforms</button><button data-project-jump="activity">Builds</button><button data-project-jump="settings">Settings</button><button data-project-jump="activity">Activity</button></nav>
      ${saidHtml()}

      <div class="ref-project-layout">
        <main>
          <section class="ref-platform-heading"><div><h2>Platforms</h2><p>Build and deliver this project without changing the desktop application.</p></div><span class="chip ${webReady ? 'live' : 'attention'}">${webReady ? 'Web ready' : 'Adaptation required'}</span><button class="go" id="platform-create" ${webExists ? 'hidden' : ''}>Create Web Version</button></section>

          <section class="ref-platform-desktop"><span class="platform-mark desktop">▣</span><span class="grow"><b>Desktop</b><small>${esc(platforms.desktop?.says ?? 'The desktop project stays unchanged.')}</small></span><span><small>State</small><b class="good">${esc(platforms.desktop?.status ?? 'READY')}</b></span><button data-project-jump="activity">Build</button></section>

          <section class="ref-platform-web" id="project-platforms">
            <div class="ref-platform-web-head"><span class="platform-mark web">◎</span><div class="grow"><div><h2>Web</h2><span class="chip vibe">${esc(String(platforms.web?.status ?? 'UNKNOWN').replaceAll('_', ' '))}</span></div><p>${esc(platforms.web?.says ?? 'No web analysis is available.')}</p></div><div class="ref-web-steps">${webSteps.map(([name, done], index) => `<span class="${done ? 'done' : ''}"><i>${index + 1}</i>${name}</span>`).join('')}</div></div>
            <div class="ref-platform-analysis">
              <section><span class="eyebrow">Project analysis</span><div class="ref-analysis-list"><div><span class="dot live"></span><b>${platforms.scanned ?? 0} source files inspected</b><small>Complete</small></div><div><span class="dot ${(platforms.browserFiles ?? []).length ? 'live' : 'off'}"></span><b>Browser surface</b><small>${(platforms.browserFiles ?? []).length ? `${platforms.browserFiles.length} files found` : 'Not found'}</small></div>${(platforms.blockers ?? []).slice(0,4).map((one) => `<button data-platform-blocker="${esc(one.id)}"><span class="dot attention"></span><b>${esc(one.says)}</b><small>${one.count}</small></button>`).join('')}</div><button class="wide" id="platform-analyze">Re-run analysis</button></section>
              <section class="ref-compatibility"><span class="eyebrow">Compatibility report</span><div class="compatibility-orbit ${webReady ? 'ready' : ''}"><b>${webReady ? 'Ready' : esc(platforms.web?.category?.replaceAll('_',' ') ?? 'Unknown')}</b><small>Web compatibility</small></div><div class="ref-compat-facts"><span><i class="dot live"></i><b>Desktop remains intact</b></span><span><i class="dot ${(platforms.blockers ?? []).length ? 'attention' : 'live'}"></i><b>${(platforms.blockers ?? []).length} adapter group${(platforms.blockers ?? []).length === 1 ? '' : 's'}</b></span></div></section>
              <section class="ref-architecture"><div class="section-rubric"><span><span class="eyebrow">Architecture</span><b>${architectures.find((one) => one.id === recommended)?.name ?? 'Desktop only'}</b></span><span class="good">Recommended</span></div>${architectures.map(archCard).join('')}<div class="ref-platform-actions">${platforms.web?.at ? '<button class="go" id="platform-open-web">Open Web</button>' : ''}${webExists ? '<button class="go" id="platform-preview">Preview in your browser</button><button id="platform-open-root">Show the files</button>' : '<button class="go" id="platform-create-inline">Create Web Version</button>'}${webReady ? '<button id="platform-deploy">Deploy</button>' : ''}</div></section>
            </div>
            <div class="ref-platform-lower"><section><span class="eyebrow">Shared browser logic</span><p>${(platforms.browserFiles ?? []).length ? `${platforms.browserFiles.length} browser-facing files can be reused.` : 'No isolated browser-facing files were identified yet.'}</p></section><section><span class="eyebrow">Desktop-only capabilities</span><p>${(platforms.blockers ?? []).map((one) => esc(one.says)).slice(0,3).join(' · ') || 'None detected'}</p></section><section><span class="eyebrow">What happens next</span><p>${webExists ? 'Preview the generated target, review it, then deploy.' : 'Create a separate web target; the desktop project remains untouched.'}</p></section></div>
          </section>

          <section class="ref-project-overview">
            <div class="section-rubric"><span><b>Project overview</b><small>${esc(p.says || 'Ready to work')}</small></span><div class="acts"><button data-project-look="1">Inspect files</button><button data-project-jump="ask">AI Assistant</button></div></div>
            <div class="ref-project-work"><div>${askPanel(p,{heading:'Project intelligence'})}</div><div class="save-console-v2"><div class="panel-title"><b>Git Push</b><span>${p.situation?.unsaved ? `${p.situation.unsaved} waiting` : 'Up to date'}</span></div><label class="field" for="msg">What did you do?</label><textarea id="msg" rows="3" placeholder="Made the sign-in page work"></textarea><button class="go wide" id="pub">Git Push</button><div id="going" class="going"></div></div></div>
          </section>

          <section class="project-sessions-v2 ref-project-sessions">
          <div class="section-rubric"><span><b>Recent sessions</b><small>Return to the tools you used here</small></span>
            ${open.length ? '<button class="quiet small" id="tidy">Clear list</button>' : ''}</div>
          ${open.length ? `<div class="lane session-lane">
            ${open.map((g) => `
              <div class="slab" data-again="${esc(g.assistant)}">
                <span class="dot ${g.rank === 'moving' ? 'live' : g.rank === 'waiting on you' ? 'attention' : 'off'}"></span>
                <div class="grow">
                  <div class="line1"><b>${esc(g.name)}</b>
                    ${g.times > 1 ? `<span class="chip">opened ${g.times} times</span>` : ''}
                    ${g.canCarryOn ? '<span class="chip cool">can continue</span>' : ''}
                  </div>
                  <div class="fact">Last opened ${esc(g.ago)}${g.here ? '' : ' · not on this computer now'}.</div>
                </div>
                <div class="acts">
                  ${g.here ? `<button class="go small" data-again-now="${esc(g.assistant)}">Open again</button>` : ''}
                  <button class="quiet small" data-done="${esc(g.ids.join(' '))}">Finished</button>
                  <button class="quiet small" data-drop="${esc(g.ids.join(' '))}">Remove</button>
                </div>
              </div>`).join('')}
          </div>` : '<div class="empty compact"><b>No recent sessions.</b>Open an AI app or terminal and it will appear here.</div>'}
          </section>
        </main>

        <aside class="ref-github-explorer">
          <div class="ref-explorer-head"><span>${GITHUB_MARK}</span><b>GitHub Explorer</b><button class="quiet icon" id="ref-explorer-close" aria-label="Close GitHub Explorer">×</button></div>
          <div class="segmented"><button class="on" id="p-explore-inline">Explore</button><button id="p-yours-inline">Your projects</button></div>
          <label class="find"><span>⌕</span><input id="ref-explorer-search" placeholder="Search GitHub projects…" readonly></label>
          ${binding?.bound ? `<article class="ref-bound-project"><span class="project-mini-mark">${GITHUB_MARK}</span><div class="grow"><b>${esc(binding.owner)}/${esc(binding.repo)}</b><small>Connected to this project</small></div><div class="ref-fact-list"><div><span>Line</span><b>${esc(binding.branch ?? 'Default')}</b></div><div><span>State</span><b class="good">Connected</b></div></div><button class="wide" id="ref-open-github">Open on GitHub</button></article>` : `<div class="empty compact"><b>No GitHub project connected.</b><button class="go" id="ref-connect-github">Connect this project</button></div>`}
          <div class="ref-explorer-note"><span class="eyebrow">Project context</span><p>Explore public projects or bring one into Viberant without leaving this screen.</p></div>
          <button class="go wide" id="ref-launch-explorer">Open GitHub Explorer</button>
          <div class="ref-project-shortcuts"><button id="side-apps">Open in an AI app <span>→</span></button><button id="side-term">Open a terminal <span>→</span></button><button id="side-ship">Deploy this project <span>→</span></button><button id="side-files">Inspect project files <span>→</span></button></div>
        </aside>
      </div>
    </div>`;
  said = null;

  $('#back').onclick = async () => { at.inside = false; await post('/close'); await refreshMe(); draw(); };
  $('#pd-reveal').onclick = () => post('/reveal', { path: p.dir });
  $('#pub').onclick = saveAndSend;
  $('#msg').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveAndSend(); };
  showWhereItGoes();
  $('#more').onclick = () => gitHubSheet(p);
  $('#p-explore-inline')?.addEventListener('click', openGitHubExplorer);
  $('#p-yours-inline')?.addEventListener('click', fromGitHub);
  $('#ref-launch-explorer')?.addEventListener('click', openGitHubExplorer);
  $('#ref-explorer-search')?.addEventListener('click', openGitHubExplorer);
  $('#ref-connect-github')?.addEventListener('click', () => gitHubSheet(p));
  $('#ref-open-github')?.addEventListener('click', () => post('/open-outside', { url: binding.url }));
  $('#ref-explorer-close')?.addEventListener('click', () => document.querySelector('.ref-project-layout')?.classList.add('explorer-closed'));
  /**
   * Which one is about to be asked, said before anybody asks it.
   *
   * A question here costs money at whichever company answers it, so which
   * company that is belongs on screen next to the button rather than three
   * pages away in Settings. It also says when the chosen one has no key and
   * another is standing in, because being charged by a company you did not pick
   * is a surprise nobody should get from a manager.
   */
  wireAskPanel();

  $('#to-apps').onclick = () => go('apps');
  $('#to-terms').onclick = () => go('terminals');
  $('#to-ship').onclick = () => go('ship');
  $('#side-ship').onclick = () => go('ship');
  $('#side-apps').onclick = () => go('apps');
  $('#side-term').onclick = () => go('terminals');
  for (const b of document.querySelectorAll('[data-project-look]')) b.onclick = () => statusSheet(p.dir);
  $('#side-files').onclick = () => statusSheet(p.dir);
  for (const b of document.querySelectorAll('[data-project-jump]')) b.onclick = () => go(b.dataset.projectJump);
  for (const b of document.querySelectorAll('[data-project-scroll]')) b.onclick = () => {
    document.getElementById(b.dataset.projectScroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#platform-analyze').onclick = async () => { await get('/project/platforms?fresh=1'); draw(); };
  $('#platform-deploy')?.addEventListener('click', () => go('ship'));
  $('#platform-open-web')?.addEventListener('click', () => post('/open-outside', { url: platforms.web.at }));
  $('#platform-open-root')?.addEventListener('click', () => post('/reveal', { path: platforms.web.root }));
  for (const b of document.querySelectorAll('[data-arch]')) b.onclick = () => {
    chosenArchitecture = b.dataset.arch;
    for (const other of document.querySelectorAll('[data-arch]')) other.classList.toggle('on', other === b);
  };
  /*
   * One press, one tab. The button is held down while the manager answers, so
   * a double click cannot start two of anything — and the server reuses a
   * preview already running rather than starting another.
   */
  $('#platform-preview')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (b.disabled) return;
    b.disabled = true;
    const out = await post('/project/platforms/preview', {});
    b.disabled = false;
    say(out);
    draw();
  });
  const createWebTarget = async () => {
    const made = await post('/project/platforms/create', { architecture: chosenArchitecture });
    say(made);
    if (made.ok) draw(); else {
      inspect({
        name: 'Web compatibility', kind: made.report?.web?.category?.replaceAll('_', ' ') ?? 'Needs adaptation',
        facts: (made.report?.blockers ?? []).map((one) => ({ label: one.says, value: `${one.count} source file${one.count === 1 ? '' : 's'}` })),
      });
      draw();
    }
  };
  $('#platform-create')?.addEventListener('click', createWebTarget);
  $('#platform-create-inline')?.addEventListener('click', createWebTarget);
  for (const b of document.querySelectorAll('[data-platform-blocker]')) b.onclick = () => {
    const blocker = (platforms.blockers ?? []).find((one) => one.id === b.dataset.platformBlocker);
    inspect({ name: blocker.says, kind: 'Web adaptation detail', facts: blocker.files.map((file) => ({ label: 'Found in', value: file })) });
  };
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

/**
 * Where this project's work would go, said before you press anything.
 *
 * The reported fault was work arriving on an account nobody chose. Half the fix
 * is refusing to send when the project and the signed-in account disagree; the
 * other half is this — the destination on screen, next to the button, so a
 * wrong one is obvious while it is still cheap to notice.
 *
 * Fetched after the page is drawn rather than before, because it asks GitHub
 * who you are and nothing else on this screen should wait for that.
 */
let goingTo = null;

async function showWhereItGoes() {
  const box = $('#going');
  if (!box) return;

  const d = await get('/project/destination');
  goingTo = d;
  if (!box.isConnected) return;

  if (d.binding?.isWorkspace) {
    box.className = 'going bad';
    box.innerHTML = `<b>${esc(d.sentence)}</b><span>${esc(d.action)}</span>`;
    return;
  }
  if (d.plan === 'refuse' || d.ok === false) {
    box.className = 'going';
    box.innerHTML = `<span>${esc(d.sentence ?? '')}</span>`;
    return;
  }
  if (d.plan === 'name') {
    /*
     * Where it came from, and where it would go — said before anything is
     * pressed, and asked rather than assumed.
     *
     * An address a project arrived with belongs to whoever it came from. The
     * account in use here decides where work goes, so this says which account
     * that is, and the one press asks what the destination should be called.
     * Nothing in the project changes until that question is answered.
     */
    box.className = 'going';
    box.innerHTML = d.reason === 'another-account'
      ? `<span>This came from <b class="mono">${esc(d.binding.owner)}/${esc(d.binding.repo)}</b>, which belongs to another account.</span>
         <span>Sending puts it on <b>${esc(d.session.login)}</b>, under a name you choose. Where it came from is kept in the project.</span>`
      : `<span>Not on GitHub yet. Sending makes a copy on
         <b>${esc(d.session.login)}</b>, private, under a name you choose.</span>`;
    return;
  }

  box.className = 'going';
  box.innerHTML = `<span>Goes to
    <b class="mono">${esc(d.binding.owner)}/${esc(d.binding.repo)}</b>
    ${d.binding.branch ? `<span class="mono">· ${esc(d.binding.branch)}</span>` : ''}
    ${d.binding.url ? `<a href="${esc(d.binding.url)}" target="_blank" rel="noreferrer">on GitHub ↗</a>` : ''}</span>`;
}

/**
 * What this project should be called on the account in use.
 *
 * Asked at the moment of pressing, rather than as a separate errand somebody
 * has to find first. Nothing in the project has been changed when this appears,
 * and nothing is changed if it is dismissed — which is what makes moving
 * between accounts safe: an account is chosen, not applied.
 */
function askDestinationName({ login, suggested, from = null, sentence = null, action = null }) {
  return new Promise((resolve) => {
    sheet({
      title: `Send it to ${login}`,
      narrow: true,
      body: `
        ${sentence ? `<div class="said bad"><b>${esc(sentence)}</b>${action ? `<span>${esc(action)}</span>` : ''}</div>` : ''}
        <p class="sub">${from
    ? `This came from <b class="mono">${esc(from)}</b>, which belongs to another account.
         Your work goes to <b>${esc(login)}</b> instead, and where it came from is kept in the project.`
    : `A place for this on <b>${esc(login)}</b> is made as you send it, and only you will be able to see it.`}</p>
        <label class="field">What should it be called there?</label>
        <input id="dest-name" style="width:100%" value="${esc(suggested ?? '')}">
        <p class="sub" style="margin-top:1rem">Letters, numbers, dots and dashes. Anything already
          on that account under another name is left exactly as it is.</p>`,
      foot: `<button class="quiet" id="dest-no">Never mind</button>
             <button class="go" id="dest-yes">Send it</button>`,
      onOpen: () => {
        const input = $('#dest-name');
        input.focus();
        input.select();
        const done = (v) => { closeLayer(); resolve(v); };
        $('#dest-yes').onclick = () => done(input.value.trim() || null);
        $('#dest-no').onclick = () => done(null);
        input.onkeydown = (e) => {
          if (e.key === 'Enter') done(input.value.trim() || null);
          if (e.key === 'Escape') done(null);
        };
      },
    });
  });
}

/**
 * The one button, and the only question it ever asks.
 *
 * A project of your own goes in one press. Anything that needs somewhere on
 * your account to go is asked what it should be called, once, and then goes. A
 * name already holding different work is refused and asked again — nothing on
 * GitHub is written over to make a send succeed, and no second name is chosen
 * on somebody's behalf.
 */
async function saveAndSend() {
  const button = $('#pub');
  button.disabled = true;
  button.textContent = 'Saving…';

  // What the page said, handed back with the press. If the project has been
  // repointed since this screen was drawn, the manager refuses rather than
  // sending somewhere the person was never shown.
  const expect = goingTo?.binding?.bound
    ? `${goingTo.binding.owner}/${goingTo.binding.repo}` : null;

  const message = $('#msg').value.trim();
  let out = await post('/publish', { message, expect });

  // A handful of tries, because each refusal is a real answer from GitHub about
  // that one name and the person is choosing the next one.
  for (let asked = 0; out.needsName && asked < 5; asked += 1) {
    const where = out.destination?.bound
      ? `${out.destination.owner}/${out.destination.repo}` : null;
    const name = await askDestinationName({
      login: out.session?.login ?? goingTo?.session?.login ?? 'your account',
      suggested: out.suggested,
      from: where,
      sentence: out.nameTaken ? out.sentence : null,
      action: out.nameTaken ? out.action : null,
    });

    if (!name) {
      // Honest about what did happen. A refused name still saved the work here.
      say(out.saved ? out : { ok: true, sentence: 'Nothing was sent, and nothing was changed.' });
      return draw();
    }
    out = await post('/publish', { message, expect, name });
  }

  say(out);
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
    foot: `<span class="left">Afterwards, Git Push is the only button you need.</span>
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
  // How many of the installed ones have an account chosen for them, which is
  // the fact this page exists to make true and never said out loud.
  const signedInto = here.filter((x) => (chosen.account[x.id] ?? x.active)).length;

  const context = whereFor(null, p);
  const accountRows = here.map((x) => `<div><span class="provider-monogram">${esc((x.made ?? x.name).slice(0, 1))}</span><span class="grow"><b>${esc(x.made ?? x.name)}</b><small>${esc(chosen.account[x.id] ?? x.active ?? (x.signedIn ? 'Signed in inside the app' : 'No account selected'))}</small></span><span class="chip ${chosen.account[x.id] || x.active || x.signedIn ? 'live' : ''}">${chosen.account[x.id] || x.active || x.signedIn ? 'Ready' : 'App managed'}</span></div>`).join('');

  view.innerHTML = `
    <div class="ref-apps-page">
      <header class="ref-apps-head"><div class="grow"><h1>AI apps</h1><p>Launch your coding tools with the right project and account context.</p></div><button id="apps-refresh">↻ Refresh</button></header>
      ${saidHtml()}

      <div class="ref-apps-layout">
        <main>
          <section class="ref-apps-summary">
            <span><i>${APP_MARK}</i><b>${here.length}</b><small>Apps ready</small></span>
            <span><i>◎</i><b>${signedInto} / ${here.length}</b><small>Accounts selected</small></span>
            <span><i>◇</i><b>${away.length}</b><small>Available to add</small></span>
            <span><i>↗</i><b>${esc(context ? tail(context) : 'Choose project')}</b><small>Launch context</small></span>
          </section>

          <section class="ref-apps-toolbar">
            <label class="find"><span>⌕</span><input id="apps-search" placeholder="Search AI apps…"></label>
            <div class="ref-app-filters"><button class="on" data-app-filter="all">All <span>${t.tools.length}</span></button><button data-app-filter="ready">Ready <span>${here.length}</span></button><button data-app-filter="account">Needs account <span>${Math.max(0, here.length - signedInto)}</span></button><button data-app-filter="away">Not installed <span>${away.length}</span></button></div>
          </section>

          ${here.length ? `<section class="ref-apps-section" data-app-section="ready"><div class="ref-app-section-title"><span><i class="dot live"></i><b>Installed & ready</b></span><small>${here.length}</small></div><div class="tool-launch-table"><div class="tool-launch-head"><span>AI app</span><span>Provider / account</span><span>Signed in</span><span>Browser login</span><span>Launch mode</span><span>Actions</span></div>${here.map((x) => appRow(x, p, t)).join('')}</div></section>` : `<div class="empty"><b>None of the AI apps were found here.</b>Choose one below to install it.</div>`}

          ${away.length ? `<section class="ref-apps-section" data-app-section="away"><div class="ref-app-section-title"><span><i class="dot off"></i><b>Not installed</b></span><small>${away.length}</small></div><div class="tool-catalog-v2">${away.map((x) => appRow(x, p, t)).join('')}</div></section>` : ''}
          <p class="ref-apps-tip">✦ Apps open with the selected project. Viberant never invents an account state an app has not reported.</p>
        </main>

        <aside class="ref-apps-inspector">
          <div class="ref-apps-inspector-head"><b>Launch context</b><span>ⓘ</span></div>
          <section><span class="eyebrow">Project folder</span><div class="ref-launch-folder"><span>□</span><span class="grow"><b>${esc(context ? tail(context) : 'No project selected')}</b><small>${esc(context ?? 'Choose a project or folder')}</small></span></div><button class="wide" id="where-all">Change project</button>${chosen.folder.all ? '<button class="quiet wide small" id="where-clear">Use the open project</button>' : ''}</section>
          <section><span class="eyebrow">Account selection</span><p>Accounts are kept per app and only shown when the app reports them.</p><div class="ref-account-list">${accountRows || '<p>No installed AI apps were found.</p>'}</div><button class="wide" id="apps-manage-accounts">Manage accounts</button></section>
          <section class="ref-browser-truth"><span class="eyebrow">Launch behavior</span><div><span class="dot live"></span><span><b>Project-aware context</b><small>The selected folder opens with the app.</small></span></div><div><span class="dot live"></span><span><b>No extra command window</b><small>Desktop apps open in their own window.</small></span></div><div><span class="dot live"></span><span><b>Truthful sign-in state</b><small>App-managed accounts stay labeled as such.</small></span></div></section>
        </aside>
      </div>
      <div id="job"></div>
    </div>`;
  said = null;

  wireWhereBar();
  wireAppCards(t, p);
  $('#apps-refresh').onclick = () => draw();
  $('#apps-manage-accounts').onclick = () => go('settings');
  const filterApps = () => {
    const wanted = $('#apps-search').value.trim().toLowerCase();
    const mode = document.querySelector('[data-app-filter].on')?.dataset.appFilter ?? 'all';
    for (const row of document.querySelectorAll('.tool-launch-row,.tool-missing-row')) {
      const isAway = row.classList.contains('tool-missing-row');
      const needsAccount = !isAway && /Not selected|No account selected/.test(row.textContent);
      const inMode = mode === 'all' || (mode === 'away' && isAway) || (mode === 'ready' && !isAway) || (mode === 'account' && needsAccount);
      row.hidden = !inMode || (!!wanted && !row.textContent.toLowerCase().includes(wanted));
    }
    for (const section of document.querySelectorAll('[data-app-section]')) section.hidden = ![...section.querySelectorAll('.tool-launch-row,.tool-missing-row')].some((row) => !row.hidden);
  };
  $('#apps-search').oninput = filterApps;
  for (const button of document.querySelectorAll('[data-app-filter]')) button.onclick = () => {
    for (const other of document.querySelectorAll('[data-app-filter]')) other.classList.toggle('on', other === button);
    filterApps();
  };
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

/**
 * One AI app, as a row.
 *
 * It was a card in a grid: eleven of them, each with its own border, its own
 * primary purple button, and — for the six that are not installed — the same
 * sentence repeated word for word. Cards are for things that are conceptually
 * separate from each other. These are eleven of one kind of thing, which is a
 * list, and a list of eleven fits on a screen with room left over.
 *
 * The account, which is the thing you change just before pressing Open, sits
 * next to Open rather than three lines below the name (D-35).
 */
function appRow(x, p, t) {
  const ways = x.ways ?? [];
  const account = chosen.account[x.id] ?? x.active ?? null;

  if (!x.here) {
    return `
      <div class="tool-missing-row">
        <span class="kindmark quiet" aria-hidden="true">${APP_MARK}</span>
        <span class="grow">
          <b>${esc(x.name)}</b>
          ${x.installs ? `<small>${esc(x.installs)}</small>` : ''}
        </span>
        <span class="tool-maker">${x.made ? esc(x.made) : ''}</span>
        <span class="acts">
          <button class="quiet small" data-getpage="${esc(x.install ?? '')}"
            data-tip="Its own installation page">Instructions ↗</button>
          ${x.installs ? `<button class="small" data-install="${esc(x.id)}">Install</button>` : ''}
        </span>
      </div>`;
  }

  // A window this app has but this computer does not still gets its button. It
  // says where to get it rather than not being there at all.
  const canWindow = ways.includes('desktop');
  const windowElsewhere = !canWindow && x.windowElsewhere;

  const says = account ? `as ${account}`
    : x.signedIn ? 'signed in'
      : x.config ? 'no account chosen' : 'signs you in itself';

  return `
    <div class="tool-launch-row">
      <div class="tool-launch-identity"><span class="kindmark" aria-hidden="true">${APP_MARK}</span>
        <span class="grow"><b>${esc(x.name)}</b><small>${x.made ? esc(x.made) : 'Coding assistant'}</small></span>
      </div>
      <div class="tool-provider"><b>${esc(x.made ?? x.name)}</b><small>${esc(account ?? (x.signedIn ? 'App account' : 'No account selected'))}</small>
        <span class="drop">
          <button class="quiet small" data-account="${esc(x.id)}" data-tip="Which account ${esc(x.name)} opens as">Account ▾</button>
          <div class="panel" hidden id="acct-${esc(x.id)}">${accountPanel(x, t)}</div>
        </span>
      </div>
      <div class="tool-truth"><span class="dot ${account || x.signedIn ? 'live' : 'off'}"></span><span><b>${account || x.signedIn ? 'Yes' : 'Not selected'}</b><small>${esc(says)}</small></span></div>
      <div class="tool-truth"><span class="dot ${x.opensInBrowser ? 'live' : 'off'}"></span><span><b>${x.opensInBrowser ? 'Yes' : 'App managed'}</b><small>${x.opensInBrowser ? 'Browser-first flow' : 'Uses its own sign-in'}</small></span></div>
      <div class="tool-mode"><b>${esc(whereFor(x.id, p) ? 'Project' : 'No project')}</b><small>${esc(whereFor(x.id, p) ? tail(whereFor(x.id, p)) : 'Choose context above')}</small></div>
      <div class="tool-launch-actions">
        ${ways.includes('terminal') ? `
          <span class="pair">
            <button class="small" data-launch="${esc(x.id)}" data-how="terminal">Terminal</button>
            <button class="small" data-which="${esc(x.id)}" aria-label="Which terminal">▾</button>
          </span>` : ''}
        ${canWindow
    ? `<button class="go small" data-launch="${esc(x.id)}" data-how="desktop">Open</button>`
    : windowElsewhere
      ? `<button class="small" data-getwindow="${esc(x.windowElsewhere)}" data-name="${esc(x.name)}"
           data-tip="${esc(x.terminalOnlyBecause ?? 'Its own window is a separate download')}">Get window ↗</button>`
      : ''}
      </div>
    </div>`;
}

/** One mark for an AI app, so a row says what kind of thing it is at a glance. */
const APP_MARK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
  + 'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M8 2.2l1.5 3.6 3.6 1.5-3.6 1.5L8 12.4 6.5 8.8 2.9 7.3l3.6-1.5z"/></svg>';

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

let selectedTerminal = null;

SCREENS.terminals = async () => {
  const [{ terminals }, p, sessions] = await Promise.all([
    get('/terminals'), get('/project'), get('/remote/sessions'),
  ]);
  const dir = whereFor(null, p);
  const selected = terminals.find((one) => one.id === selectedTerminal) ?? terminals[0] ?? null;
  selectedTerminal = selected?.id ?? null;

  view.innerHTML = `
    <div class="pagehead command-head">
      <div class="grow">
        <span class="eyebrow">Developer workstation</span>
        <h1>Terminals</h1>
        <p class="sub">Start a shell in the right project and keep remote sessions visible.</p>
      </div>
      <div class="acts">${whereBar(p)}</div>
    </div>
    ${saidHtml()}

    <section class="terminal-summary-strip">
      <span><span class="summary-mark">${TERM_MARK}</span><b>${terminals.length}</b><small>Available shells</small></span>
      <span><span class="summary-mark active">⌁</span><b>${sessions.sessions?.filter((one) => one.running).length ?? 0}</b><small>Running remote sessions</small></span>
      <span><span class="summary-mark folder">□</span><b>${esc(dir ? tail(dir) : 'Choose project')}</b><small>Selected project</small></span>
      <span class="summary-project"><span class="summary-mark">›_</span><b>${esc(dir ?? 'No folder chosen')}</b><small>Every shell starts in this context</small></span>
    </section>

    <div class="terminal-console-v2">
      <div class="terminal-console-main">
      <div class="terminal-toolbar-v2"><div class="section-rubric"><span><b>All terminals</b><small>Each opens directly in the context above</small></span><span class="count">${terminals.length}</span></div>
        <label class="find"><span>⌕</span><input id="terminal-search" placeholder="Search terminals…"></label></div>
      <div class="terminal-choice-list">
      ${terminals.map((t) => `
        <article class="terminal-choice ${t.id === selectedTerminal ? 'on' : ''}" data-terminal-choice="${esc(t.id)}">
          <span class="kindmark" aria-hidden="true">${TERM_MARK}</span>
          <span class="grow"><b>${esc(t.name)}</b><small>${esc(t.blurb)}</small></span>
          <span class="terminal-runtime">Local shell</span>
          <span class="chip live">Available</span>
          <button class="${t.id === selectedTerminal ? 'go' : ''} small" data-open-term="${esc(t.id)}" ${dir ? '' : 'disabled'}>Start here</button>
        </article>`).join('')}
      </div>

    ${(sessions.sessions ?? []).length ? `
      <div class="sect"><h2>Running here for another computer</h2>
        <span class="count">${sessions.sessions.length}</span></div>
      <div class="remote-session-dock">
        ${sessions.sessions.map((one) => `
          <div class="trow">
            <span class="dot ${one.running ? 'live' : 'off'}"></span>
            <span class="tname">
              <b>${esc(one.what ?? one.kind)}</b>
              <span class="where">Asked for by ${esc(one.who ?? 'another computer')}
                · ${esc(ago(one.began))}</span>
            </span>
            <span class="tacts">
              ${one.running ? `<button class="small danger" data-stop-here="${esc(one.id)}">Stop it</button>` : ''}
            </span>
          </div>`).join('')}
      </div>` : ''}
        <section class="terminal-reach-v2">
          <div class="section-rubric"><span><b>What a terminal here can reach</b><small>The selected project stays the working boundary.</small></span></div>
          <div class="terminal-reach-grid">
            <span><b>Project files</b><small>Read, write, and run inside the selected folder.</small></span>
            <span><b>Dependencies</b><small>Use installed packages, runtimes, and local services.</small></span>
            <span><b>Environment</b><small>Use this Windows account's variables and permissions.</small></span>
            <span><b>Network</b><small>Connect only through the shell and permissions you start.</small></span>
          </div>
        </section>
      </div>
      <aside class="terminal-rail-v2">
        <div class="terminal-inspector-head"><span class="kindmark">${TERM_MARK}</span><span class="grow"><small>Selected shell</small><h3>${esc(selected?.name ?? 'No shell')}</h3></span><span class="chip live">Available</span></div>
        <div class="terminal-inspector-tabs"><span class="on">Overview</span><span>Session</span><span>Permissions</span></div>
        <section><div class="panel-title"><b>Project context</b></div>
          <div class="context-item"><span>Project</span><b>${esc(p?.name ?? 'Folder')}</b></div>
          <div class="context-item"><span>Starts in</span><b class="mono">${esc(dir ?? 'Not chosen')}</b></div>
        </section>
        <section><div class="panel-title"><b>Shell & runtime</b></div>
          <div class="context-item"><span>Shell</span><b>${esc(selected?.name ?? 'Not selected')}</b></div>
          <div class="context-item"><span>Location</span><b>This computer</b></div>
          <p>${esc(selected?.blurb ?? 'Choose an available shell.')}</p>
        </section>
        <section><div class="panel-title"><b>Permissions</b></div>
          <div class="context-item"><span>Local mode</span><b>Project folder</b></div>
          <p>Workspace membership never grants remote terminal access. An owner must allow a specific computer from that computer's Workspace details.</p>
        </section>
        <button class="go wide" data-open-term="${esc(selected?.id ?? '')}" ${dir && selected ? '' : 'disabled'}>Start in this project</button>
        <div class="context-item"><span>Remote sessions here</span><b>${sessions.sessions?.filter((one) => one.running).length ?? 0}</b></div>
      </aside>
    </div>`;
  said = null;

  $('#t-pick')?.addEventListener('click', () => $('#where')?.click());

  for (const b of document.querySelectorAll('[data-stop-here]')) {
    b.onclick = async () => {
      say(await post('/remote/stop', { session: b.dataset.stopHere }));
      draw();
    };
  }

  wireWhereBar();

  $('#terminal-search')?.addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    for (const row of document.querySelectorAll('[data-terminal-choice]')) {
      row.hidden = query && !row.innerText.toLowerCase().includes(query);
    }
  });

  for (const choice of document.querySelectorAll('[data-terminal-choice]')) {
    choice.onclick = (event) => {
      if (event.target.closest('button')) return;
      selectedTerminal = choice.dataset.terminalChoice;
      draw({ quietly: true });
    };
  }

  for (const b of document.querySelectorAll('[data-open-term]')) {
    b.onclick = async (e) => {
      if (e.target !== b && e.target.closest('button') !== b && e.target.closest('button')) return;
      const pressed = e.target.closest('button') ?? b;
      pressed.classList?.add('working');
      say(await post('/terminal', { terminal: b.dataset.openTerm, dir: whereFor(null, p) }));
      draw();
    };
  }
};

/**
 * Vercel's row: connected as somebody, or the one thing to do about it.
 *
 * Four states rather than three, and the fourth is the one that was missing.
 * "Could not ask just now" is not "not connected", and drawing it as though it
 * were is how somebody comes to make a second token they did not need.
 */
function vercelRow(d) {
  const v = d.vercel ?? {};
  const canBuild = !!d.look?.frameworkId;

  // Nothing to put online. Said before anything is pressed, and the button is
  // not merely disabled: a disabled button with no reason beside it is the same
  // as a broken one.
  if (d.web && d.web.ok === false) {
    return `
      <div class="trow">
        <span class="kindmark quiet" aria-hidden="true">${SITE_MARK}</span>
        <span class="tname">
          <b>Vercel</b>
          <span class="where">${esc(d.web.sentence ?? 'There is no website in this project.')}</span>
        </span>
        <span class="tacts">
          <span class="state notStarted"><span class="pip"></span>Nothing to put online</span>
        </span>
      </div>`;
  }

  const state = v.connected && v.reachable === false
    ? { s: 'working', word: `Connected as ${v.login}, out of date` }
    : v.connected ? { s: 'finished', word: `Connected as ${v.login}` }
      : v.reachable === false ? { s: 'working', word: 'Cannot check just now' }
        : { s: 'notStarted', word: 'Not connected' };

  const says = v.connected
    ? (!v.here
      ? 'Connected, but the command that builds and uploads is not on this computer yet.'
      : `${canBuild ? `Builds this ${d.look.framework} project itself` : 'Builds the site itself'}${
        d.web?.inside ? `, from the ${d.web.inside} folder inside it,` : ''} and gives it an address${
        d.slug && d.slug !== d.name ? `, as "${d.slug}"` : ''}.`)
    : v.reachable === false
      ? 'Vercel could not be reached. Nothing here has changed.'
      : 'A token from your Vercel account, made in your browser. It stays on this computer.';

  return `
    <div class="trow">
      <span class="kindmark" aria-hidden="true">${SITE_MARK}</span>
      <span class="tname">
        <b>Vercel</b>
        <span class="where">${esc(says)}</span>
      </span>
      <span class="tacts">
        <span class="state ${state.s}"><span class="pip"></span>${esc(state.word)}</span>
        ${v.connected
    ? `${v.here ? '' : '<button class="quiet small" id="v-how">How to install it</button>'}
       <button class="quiet small" id="v-manage">Account\u2026</button>
       <button class="go small" data-site="vercel" ${v.here ? '' : 'disabled'}>Deploy website</button>`
    : `<button class="quiet small" id="v-again">Check again</button>
       <button class="go small" id="v-connect">Connect Vercel\u2026</button>`}
      </span>
    </div>`;
}

/**
 * Connecting Vercel, in one window, without waiting on a browser to come back.
 *
 * The old way started Vercel's own sign-in as a background command and waited.
 * That command wants a terminal: somewhere to print the address it needs you to
 * visit, and something to read your answer from. It has neither here, so it
 * waited forever and all anybody saw was a spinner \u2014 sometimes with the
 * browser half having plainly succeeded, which is the worst of both.
 *
 * A token is Vercel's own supported way for something that is not a terminal to
 * act on your behalf. It is made on a page, it is checked here before it is
 * kept, and it is still there after this app is restarted.
 */
async function connectVercel(andThen = null) {
  sheet({
    title: 'Connect Vercel',
    narrow: true,
    body: `
      <ol class="steps-numbered">
        <li>Open your Vercel account page and make a token. Any name, any expiry.</li>
        <li>Copy it \u2014 Vercel shows it once.</li>
        <li>Paste it here. It is checked with Vercel before anything is kept, and it
          stays on this computer.</li>
      </ol>
      <label class="field" for="v-token">The token</label>
      <input type="password" id="v-token" style="width:100%" autocomplete="off" spellcheck="false"
        placeholder="it stays on this computer">
      <div class="fact" id="v-note"></div>`,
    foot: `<button class="quiet" id="v-page">Open the token page \u2192</button>
           <button class="quiet" id="v-never">Never mind</button>
           <button class="go" id="v-save">Connect</button>`,
  });

  const note = (r) => {
    const box = $('#v-note');
    if (!box) return;
    box.className = `fact ${r.ok ? 'good' : 'bad'}`;
    box.textContent = [r.sentence, r.action].filter(Boolean).join(' ');
  };

  $('#v-page').onclick = async () => note(await post('/ship/get-token'));
  $('#v-never').onclick = closeLayer;
  $('#v-token').focus();

  const save = async () => {
    const field = $('#v-token');
    const typed = field?.value ?? '';
    if (!typed.trim()) return note({ ok: false, sentence: 'Nothing was pasted.', action: 'Paste the token first.' });

    const b = $('#v-save');
    b.disabled = true;
    b.textContent = 'Checking it\u2026';
    note({ ok: true, sentence: 'Asking Vercel who this token belongs to.' });

    const out = await post('/ship/token', { token: typed });

    b.disabled = false;
    b.textContent = 'Connect';
    if (field) field.value = '';
    note(out);
    if (!out.ok) return;

    closeLayer();
    say(out);
    if (andThen) return andThen();
    draw();
  };

  $('#v-save').onclick = save;
  $('#v-token').onkeydown = (e) => { if (e.key === 'Enter') save(); };
}

/** The mark for a place a website lives: a globe, reduced to two strokes. */
const SITE_MARK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
  + 'stroke-width="1.3"><circle cx="8" cy="8" r="5.6"/><ellipse cx="8" cy="8" rx="2.4" ry="5.6"/>'
  + '<path d="M2.6 8h10.8"/></svg>';

/** The mark for a terminal. A prompt, which is what one actually looks like. */
const TERM_MARK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
  + 'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M4 5.5L6.8 8 4 10.5M8.6 10.8h3.4"/></svg>';

// ---------------------------------------------------------------------------
// Putting it out into the world
// ---------------------------------------------------------------------------

let watching = null;

function deployReferenceMarkup({ d, platforms, site, app, bind }) {
  const live = d.deployedTo?.url;
  const webStatus = String(platforms.web?.status ?? 'UNKNOWN').replaceAll('_', ' ');
  const webReady = d.web?.ok !== false && platforms.web?.category === 'WEB_SAFE';
  const canBuildApp = !!(app.packStep || app.manager === 'cargo');
  const vercel = d.vercel ?? {};
  const vercelAction = vercel.connected
    ? `<button class="go" data-site="vercel" ${vercel.here && webReady ? '' : 'disabled'}>Deploy with Vercel</button>`
    : `<button class="go" id="v-connect">Connect Vercel</button>`;
  const pages = site.places.find((place) => place.id === 'pages');
  const adaptation = (platforms.blockers ?? []).slice(0, 4);
  const installer = app.installers?.[0];

  return `
    <div class="ref-deploy-page">
      <header class="ref-pagehead">
        <div><span class="eyebrow">Release center</span><h1>Deploy</h1>
          <p>Build, release, and deliver ${esc(d.name)} across web and desktop.</p></div>
        <div class="acts"><button class="quiet" id="deploy-settings">Deployment settings</button>
          <button class="go" id="deploy-new">＋ New deployment</button></div>
      </header>
      ${saidHtml()}

      <div class="ref-deploy-shell">
        <main class="ref-deploy-main">
          <section class="ref-deploy-signals">
            <article><span class="summary-mark">◎</span><span><small>Web target readiness</small><b>${esc(webStatus)}</b><em class="${webReady ? 'good-text' : 'warn'}">${esc(platforms.web?.category?.replaceAll('_', ' ') ?? 'Not analyzed')}</em></span></article>
            <article><span class="summary-mark">▣</span><span><small>Desktop build status</small><b>${installer ? 'Ready' : canBuildApp ? 'Ready to build' : 'Not configured'}</b><em>${installer ? esc(app.version ?? '') : esc(app.packStep ?? '')}</em></span></article>
            <article><span class="summary-mark">▤</span><span><small>Unsaved changes</small><b>${esc(d.project?.unsaved ?? 0)} ${Number(d.project?.unsaved ?? 0) === 1 ? 'file' : 'files'}</b><em>${d.project?.unsaved ? 'Review before release' : 'Everything saved'}</em></span></article>
            <article><span class="summary-mark good-text">⌁</span><span><small>Deployment health</small><b>${live ? 'Healthy' : 'Not online'}</b><em>${live ? 'Website is responding' : 'No active website'}</em></span></article>
          </section>

          <section class="ref-panel ref-website" id="deploy-websites">
            <div class="ref-panel-head"><span class="summary-mark">◎</span><div><h2>Website deployment</h2><p>Deploy a web-safe target or deliver a companion experience.</p></div><button class="quiet" id="dep-platforms">Compatibility report ↗</button></div>
            <div class="ref-target-grid">
              <article class="ref-target-card"><div class="ref-target-title"><span class="target-logo">▲</span><div><h3>Vercel</h3><span class="pill">Recommended</span></div></div>
                <p>${esc(vercel.connected ? `Connected as ${vercel.login}` : vercel.sentence ?? 'Preview deployments and production releases.')}</p>
                <ul><li>Automatic builds</li><li>Preview addresses</li><li>Custom domains</li><li>Server-side functions</li></ul>${vercelAction}
                ${vercel.connected ? `<button class="quiet" id="v-manage">Account…</button>` : ''}</article>
              <article class="ref-target-card"><div class="ref-target-title"><span class="target-logo">●</span><div><h3>GitHub Pages</h3><span class="pill ${pages?.ready ? 'good' : ''}">${pages?.ready ? 'Available' : 'Unavailable'}</span></div></div>
                <p>${esc(pages?.blurb ?? 'Publish a browser-ready project from its GitHub copy.')}</p>
                <ul><li>Works with public projects</li><li>Secure address</li><li>Built-in history</li><li>No separate account</li></ul>
                <button data-site="pages" ${pages?.ready && webReady ? '' : 'disabled'}>Deploy with GitHub Pages</button></article>
              <article class="ref-target-card recommended"><span class="eyebrow">${esc(platforms.recommendation === 'WEB_COMPANION' ? 'Desktop-first flow' : 'Recommended flow')}</span>
                <h3>${platforms.recommendation === 'WEB_COMPANION' ? 'Standalone Web + Web Companion' : 'Standalone Web'}</h3>
                <p>${esc(platforms.web?.says ?? 'Prepare a browser-safe surface before deploying.')}</p>
                <ul><li>Reuse browser-safe interface logic</li><li>Keep computer-only modules private</li><li>Connect only when native access is needed</li><li>Review every blocking capability</li></ul>
                <button class="go" id="deploy-adapt">${platforms.web?.root ? 'Open web target' : 'Configure web target'}</button></article>
            </div>
            <div class="ref-adaptation"><div class="ref-adapt-title"><b>Adaptation plan</b><span>what is included and what still needs work</span></div>
              <div class="ref-adapt-steps">${adaptation.length ? adaptation.map((item, index) => `<div><span class="summary-mark">${index + 1}</span><span><b>${esc(item.says)}</b><small>${item.count} ${item.count === 1 ? 'place' : 'places'} found</small></span><em>${index < 2 ? 'Needs adapter' : 'Keep on desktop'}</em></div>`).join('') : '<p>No browser blockers were found.</p>'}</div>
              <footer><span>ⓘ Only browser-safe parts are deployed. Computer-only features continue to run locally.</span><button class="quiet" id="deploy-guide">Open adaptation guide ↗</button></footer>
            </div>
          </section>

          <section class="ref-panel ref-desktop-release">
            <div class="ref-panel-head"><span class="summary-mark">▣</span><div><h2>Desktop release</h2><p>Build a Windows installer without changing the desktop project.</p></div></div>
            <div class="ref-desktop-grid"><div><small>Installer build status</small><b class="${installer ? 'good-text' : ''}">${installer ? 'Ready' : canBuildApp ? 'Ready to build' : 'Not configured'}</b><span>${installer ? `${esc(installer.name)} · ${esc(size(installer.size))}` : esc(app.packStep ?? 'No build step')}</span></div>
              <div><small>Platforms</small><div class="ref-platforms"><span class="on">⊞ Windows x64</span><span title="This project currently builds on Windows">Apple —</span><span title="This project currently builds on Windows">Linux —</span></div></div>
              <div><small>Release actions</small><div class="acts"><button class="go" id="app-build" ${canBuildApp ? '' : 'disabled'}>${installer ? 'Build again' : 'Build installer'}</button><button id="app-out" ${app.canRelease && canBuildApp ? '' : 'disabled'}>Build &amp; publish</button>${installer ? `<button class="quiet" data-show-built="${esc(installer.path)}">Show installer</button>` : ''}</div></div></div>
          </section>
          <div id="job"></div>
        </main>

        <aside class="ref-deploy-inspector">
          <div class="ref-inspector-head"><b>Selected target</b><button class="quiet icon" id="deploy-inspector-close" aria-label="Close selected target">×</button></div>
          <div class="ref-selected-target"><span class="target-logo">▲</span><div><h2>Vercel</h2><p>${live ? 'Production website' : 'Web target'}</p></div><span class="pill">Recommended</span></div>
          <section><h3>Target details</h3><dl><dt>Project</dt><dd>${esc(d.name)}</dd><dt>Environment</dt><dd>Production</dd><dt>Framework</dt><dd>${esc(d.look?.framework ?? 'Not detected')}</dd><dt>Output</dt><dd>${esc(d.look?.output ?? 'Not created')}</dd><dt>GitHub</dt><dd>${bind.bound ? esc(`${bind.owner}/${bind.repo}`) : 'Not connected'}</dd></dl></section>
          <section><h3>Current output</h3>${live ? `<button class="ref-url" data-open-live="${esc(live)}">${esc(String(live).replace(/^https?:\/\//, ''))} ↗</button>` : `<p class="muted">Nothing from this project is online yet.</p>`}${installer ? `<div class="ref-build-row"><span class="dot live"></span><span><b>${esc(app.version ?? installer.name)}</b><small>${esc(size(installer.size))} · available here</small></span></div>` : ''}</section>
          <section><h3>Requirements</h3><dl><dt>Web analysis</dt><dd>${esc(webStatus)}</dd><dt>Browser blockers</dt><dd>${(platforms.blockers ?? []).reduce((sum, item) => sum + Number(item.count ?? 0), 0)}</dd><dt>Build step</dt><dd>${esc(d.look?.build ?? d.look?.scripts?.build ?? 'Not configured')}</dd></dl><button class="quiet wide" id="deploy-inspect-project">Open project</button></section>
          <section class="ref-recent-releases"><h3>Available builds</h3>${(app.installers ?? []).slice(0, 4).map((item) => `<button data-show-built="${esc(item.path)}"><span class="dot live"></span><span>${esc(item.name)}</span><small>${esc(size(item.size))}</small></button>`).join('') || '<p class="muted">No installer has been built yet.</p>'}</section>
        </aside>
      </div>
    </div>`;
}

SCREENS.ship = async () => {
  const [d, platforms] = await Promise.all([get('/ship'), get('/project/platforms')]);
  if (!d.open) {
    view.innerHTML = `
      <div class="pagehead">
        <div class="grow">
          <h1>Deploy</h1>
          <p class="sub">Put a website into the world, or hand out an application under a
            version. Two errands, never one button.</p>
        </div>
      </div>
      <div class="empty">
        <b>No project is open.</b>
        Deploying is something you do to a project, so pick one and this fills in with
        what it can actually be sent to.
        <span class="acts"><button class="go" id="s-pick">Choose a project…</button></span>
      </div>`;
    $('#s-pick').onclick = () => go('projects');
    return;
  }

  const { site, app } = d;

  const bind = d.binding ?? {};
  view.innerHTML = deployReferenceMarkup({ d, platforms, site, app, bind });
  said = null;

  for (const b of document.querySelectorAll('[data-show-built]')) {
    b.onclick = () => post('/reveal', { path: b.dataset.showBuilt });
  }
  for (const b of document.querySelectorAll('[data-open-live]')) {
    b.onclick = () => post('/open-outside', { url: b.dataset.openLive });
  }
  for (const b of document.querySelectorAll('[data-copy-live]')) {
    b.onclick = async () => {
      await navigator.clipboard?.writeText(b.dataset.copyLive);
      b.textContent = 'Copied';
    };
  }
  $('#dep-platforms')?.addEventListener('click', async () => {
    await go('projects');
    setTimeout(() => document.getElementById('project-platforms')?.scrollIntoView({ behavior: 'smooth' }), 100);
  });
  // Deployment settings are who every deploy and release acts as — the
  // accounts part of Settings — not the general list of preferences.
  $('#deploy-settings')?.addEventListener('click', () => { settingsPlace = 'accounts'; go('settings'); });
  $('#deploy-new')?.addEventListener('click', () => document.getElementById('deploy-websites')?.scrollIntoView({ behavior: 'smooth' }));
  /*
   * "Open web target" opens the web target — running, in the browser, once
   * per press. Only when there is nothing to open yet does it go to the
   * Projects panel where one is configured.
   */
  $('#deploy-adapt')?.addEventListener('click', async (e) => {
    if (platforms.web?.root) {
      const b = e.currentTarget;
      if (b.disabled) return;
      b.disabled = true;
      const out = await post('/project/platforms/preview', {});
      b.disabled = false;
      say(out);
      return draw();
    }
    await go('projects');
    setTimeout(() => document.getElementById('project-platforms')?.scrollIntoView({ behavior: 'smooth' }), 100);
  });
  $('#deploy-guide')?.addEventListener('click', async () => {
    await go('projects');
    setTimeout(() => document.getElementById('project-platforms')?.scrollIntoView({ behavior: 'smooth' }), 100);
  });
  $('#deploy-inspect-project')?.addEventListener('click', () => go('projects'));
  $('#deploy-inspector-close')?.addEventListener('click', () => document.querySelector('.ref-deploy-shell')?.classList.add('inspector-closed'));

  for (const id of ['#dep-publish', '#dep-publish2']) {
    $(id)?.addEventListener('click', () => firstTimeSheet());
  }

  /**
   * Start a long errand, and make it obvious that it started.
   *
   * These take minutes and the panel that reports them lives at the bottom of
   * the page, under two full-height panels. Pressing a button that then does
   * nothing you can see, in a place you cannot see, is indistinguishable from
   * pressing a button that does not work — which is exactly how this was
   * reported. Acknowledged at once (D-62), and the errand is brought into view.
   */
  const begin = async (button, where, body) => {
    button.disabled = true;
    button.classList.add('working');
    const was = button.textContent;

    const r = await post(where, body);
    if (!r.ok) {
      button.disabled = false;
      button.classList.remove('working');
      button.textContent = was;
      say(r);
      return draw();
    }
    await watchJob(r.job);
    $('#job')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  for (const b of document.querySelectorAll('[data-site]')) {
    b.onclick = () => begin(b, '/ship/site', { place: b.dataset.site });
  }

  $('#v-connect')?.addEventListener('click', () => connectVercel());

  /**
   * Ask Vercel again, rather than trusting what was true twenty seconds ago.
   *
   * The answer is kept for a moment so that drawing this page three times does
   * not ask three times. This is how somebody says "no, ask now".
   */
  $('#v-again')?.addEventListener('click', async () => {
    const b = $('#v-again');
    b.disabled = true;
    b.textContent = 'Asking…';
    const out = await post('/ship/again');
    say(out.vercel?.connected
      ? { ok: true, sentence: `Vercel is connected as ${out.vercel.login}.` }
      : { ok: false, sentence: out.vercel?.sentence ?? 'Vercel is not connected.', action: out.vercel?.action ?? null });
    draw();
  });

  $('#v-how')?.addEventListener('click', () => {
    say({
      ok: false,
      sentence: 'The command that builds and uploads is not on this computer.',
      action: 'Install it once in a terminal with: npm install -g vercel',
    });
    draw();
  });

  $('#v-manage')?.addEventListener('click', async () => {
    const sure = await confirmThat({
      title: `Stop acting as ${d.vercel?.login ?? 'this account'}?`,
      what: 'The token is removed from this computer, and nothing here can put a site online until another is added.',
      why: 'Nothing that is already online is touched and nothing on Vercel is deleted. This only forgets the token.',
      confirm: 'Forget the token',
      danger: true,
    });
    if (!sure) return;
    say(await post('/ship/forget'));
    draw();
  });
  $('#app-build').onclick = () => begin($('#app-build'), '/ship/app', { giveOut: false });
  $('#app-out').onclick = async () => {
    const version = await ask({
      title: 'Build and publish',
      label: 'What version is this? People will see this number.',
      value: app.version ?? '1.0.0',
      confirm: 'Build and publish',
    });
    if (!version) return;
    await begin($('#app-out'), '/ship/app', { giveOut: true, version });
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
  // A screen that stopped watching must not be called back later, or the
  // callback from a previous errand fires against a page that has moved on.
  whenJobEnds = null;
}

/**
 * Watch an errand, and optionally be told once when it is over.
 *
 * The callback is what lets a screen that started something reflect the result
 * of it. Connecting Vercel is the case that needed it: the browser says yes,
 * the errand ends, and the row has to stop saying "Not connected" without
 * anybody restarting anything.
 */
let whenJobEnds = null;

/**
 * Whether this watch ever saw the errand actually running.
 *
 * The whole of the Activity bug. When an errand finishes, the screen that
 * started it is redrawn once so that whatever changed underneath appears —
 * a site that is now live, a file that now exists. Opening a *finished* errand
 * to read it went down the same path: painted, found it finished, and six
 * hundred milliseconds later redrew the page. The redraw replaced the box the
 * detail had just been written into, so it opened and then closed itself, and
 * from the outside it looked like the button did not work.
 *
 * Nothing changed underneath, because nothing happened — it was over before
 * anybody pressed anything. So there is nothing to redraw for.
 */
let sawItRunning = false;

async function watchJob(id, onEnd = null) {
  stopWatchingJob();
  watching = id;
  jobShown = null;
  whenJobEnds = onEnd;
  sawItRunning = false;
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

  // Built when there is nothing to edit — which is a different question from
  // "is this a different errand", and getting those two confused is what made
  // a finished build vanish off the screen.
  //
  // Every redraw replaces the page, so `#job` comes back as an empty div while
  // this function still believes it drew into it a moment ago. It then skipped
  // the rebuild and wrote each piece into an element that no longer existed —
  // silently, because writing into nothing is not an error. From the outside:
  // press Build, watch it work, and then the whole result disappears.
  if (jobShown !== watching || !box.querySelector('#job-says')) {
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
        <div class="bar" id="job-made" style="margin:0 0 .7rem;display:none"></div>
        <div id="job-ask" style="margin:0 0 .7rem;display:none"></div>
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

  // What it produced, offered rather than described. An errand that made a file
  // and then only tells you it made a file has stopped one step short of being
  // useful — and the address of a site that is now live is the single thing
  // anybody wants off this panel.
  const madeBox = $('#job-made');
  if (madeBox) {
    const bits = [];
    if (j.release) {
      bits.push(`<button class="go small" data-open-out="${esc(j.release)}">Open the release ↗</button>`);
    } else if (j.at && /^https?:/i.test(j.at)) {
      bits.push(`<button class="go small" data-open-out="${esc(j.at)}">Open the website ↗</button>`);
      bits.push(`<button class="small" data-copy-out="${esc(j.at)}">Copy the address</button>`);
    }
    // Where the whole of it can be read at whoever ran it, offered on both
    // endings: after a good one out of interest, after a bad one out of need.
    if (j.inspect && /^https?:/i.test(j.inspect)) {
      bits.push(`<button class="quiet small" data-open-out="${esc(j.inspect)}">See it on Vercel ↗</button>`);
    }
    for (const m of j.made ?? []) {
      bits.push(`<button class="small" data-show-out="${esc(m.path)}"
        data-tip="${esc(m.path)}">Show ${esc(m.name)}</button>`);
    }
    const html = bits.join('');
    if (madeBox.innerHTML !== html) madeBox.innerHTML = html;
    madeBox.style.display = bits.length ? '' : 'none';

    for (const b of madeBox.querySelectorAll('[data-open-out]')) {
      b.onclick = () => post('/open-outside', { url: b.dataset.openOut });
    }
    for (const b of madeBox.querySelectorAll('[data-copy-out]')) {
      b.onclick = async () => {
        await navigator.clipboard?.writeText(b.dataset.copyOut);
        b.textContent = 'Copied';
      };
    }
    for (const b of madeBox.querySelectorAll('[data-show-out]')) {
      b.onclick = () => post('/reveal', { path: b.dataset.showOut });
    }
  }

  /**
   * Try again, where trying again is a thing this can actually do.
   *
   * Only for errands whose whole input is the project that is still open — a
   * deploy or a build. A retry that quietly ran against something else would be
   * worse than no retry, so anything this cannot repeat exactly does not offer
   * one.
   */
  const clear = $('#job-clear');
  if (clear && j.running === false && j.ok === false) {
    const again = j.kind === 'deploy' ? { at: '/ship/site', body: { place: 'vercel' } }
      : j.kind === 'build' ? { at: '/ship/app', body: { giveOut: false } }
        : null;

    if (again && !clear.querySelector('[data-retry]')) {
      clear.innerHTML = '<button class="small" data-retry="1">Try again</button>';
      clear.querySelector('[data-retry]').onclick = async () => {
        const out = await post(again.at, again.body);
        if (out.job) return watchJob(out.job);
        say(out);
        draw();
      };
    }
  } else if (clear && clear.querySelector('[data-retry]')) {
    clear.innerHTML = '';
  }

  /*
   * Something failed and there are four hundred lines underneath saying why, of
   * which one matters. This is the single most useful place in the product to
   * be able to ask — the question is already obvious, the context is already
   * here, and nobody has to describe the problem to anything.
   */
  const ask = $('#job-ask');
  if (ask) {
    const worthAsking = j.ok === false && (j.lines?.length ?? 0) > 0;
    ask.innerHTML = worthAsking
      ? '<button class="small" id="job-why">Ask why this failed</button><div id="ai-out"></div>'
      : '';
    ask.style.display = worthAsking ? '' : 'none';
    $('#job-why')?.addEventListener('click', () => {
      askAssistant('explain', '/ai/explain', { job: watching });
    });
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

  if (j.running) sawItRunning = true;

  stopWatchingJob();
  if (!again) return;

  if (j.running) {
    jobTimer = setTimeout(paintJob, 1000);
    return;
  }

  // Finished. The page is told once, quietly, so what changed underneath the
  // errand appears — and never with a full redraw, which is what made the
  // whole application blink at the end of every deploy.
  const told = whenJobEnds;
  whenJobEnds = null;

  // Opened to be read rather than watched to its end. Nothing has changed
  // underneath since it was drawn, so redrawing would throw away the thing
  // somebody has just opened and put nothing new in its place.
  if (!sawItRunning && !told) return;

  jobTimer = setTimeout(() => {
    if (told) return told(j);
    if (!layer.innerHTML) draw({ quietly: true });
  }, 600);
}

// ---------------------------------------------------------------------------
// Shared workspace
// ---------------------------------------------------------------------------

let workspaceTimer = null;

/**
 * A file, a folder and a project, told apart at a glance.
 *
 * Three different things happen when one of these arrives — a file lands as
 * itself, a folder lands as a folder, a project lands and then becomes
 * something you can open — so they are three different marks rather than three
 * identical squares with different words beside them.
 */
const KIND_MARK = {
  file: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M9 1.5H4.5A1.5 1.5 0 0 0 3 3v10a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 13V5.5L9 1.5Z"/><path d="M9 1.5V5a.5.5 0 0 0 .5.5H13"/></svg>',
  folder: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 4.2A1.2 1.2 0 0 1 3.2 3h2.9l1.4 1.6h5.3A1.2 1.2 0 0 1 14 5.8v6A1.2 1.2 0 0 1 12.8 13H3.2A1.2 1.2 0 0 1 2 11.8V4.2Z"/></svg>',
  project: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2"/><path d="M5.4 6.2 7.2 8l-1.8 1.8M8.8 9.8h2"/></svg>',
};

const KIND_WORD = { file: 'File', folder: 'Folder', project: 'Project' };

/**
 * Your computers and your team, wherever they are.
 *
 * The same list whether a computer is in the next room or on another
 * continent — because from where somebody is sitting it is the same list, and
 * splitting it into "local" and "remote" would be showing them the plumbing.
 *
 * What each row says about how it is connected is three words. Everything
 * underneath — addresses, which way was tried, whether a relay was needed —
 * lives in diagnostics, where somebody goes on purpose.
 */
async function drawTeam() {
  const box = $('#team');
  if (!box) return;

  const t = await get('/team');
  if (!box.isConnected) return;

  if (!t.workspace) {
    box.innerHTML = `
      <div class="sect"><h2>Your team</h2></div>
      <div class="empty"><b>No workspace yet.</b>
        A workspace is how your own computers, and anybody you invite, see each
        other — on this network or from anywhere.
        <span class="acts">
          <button class="go" id="team-make">Make one</button>
          <button class="small" id="team-join">I have a code</button>
        </span>
      </div>`;
    $('#team-make').onclick = makeWorkspace;
    $('#team-join').onclick = joinWorkspace;
    return;
  }

  /*
   * A person, and the computers they sit at.
   *
   * These were one flat list, so somebody with a laptop and a desktop looked
   * like two people — and worse, a computer's name was read as a person's name.
   * They are different things: a person has a role and was invited; a computer
   * is a key, and is either reachable or not.
   */
  const everybody = [...t.mine, ...t.team];
  const people = new Map();
  for (const one of everybody) {
    const who = one.person || one.displayName;
    if (!people.has(who)) people.set(who, { person: who, devices: [], you: false });
    const theirs = people.get(who);
    theirs.devices.push(one);
    theirs.you ||= one.you;
  }

  const deviceRow = (one) => `
    <div class="trow tap" data-teamdev="${esc(one.deviceId)}">
      <span class="dot ${one.online ? 'live' : 'off'}"></span>
      <span class="tname">
        <b>${esc(one.displayName)}</b>
        <span class="where">${one.online ? esc(one.how) : `Last here ${one.lastHere ? ago(one.lastHere) : 'a while ago'}`}</span>
      </span>
      <span class="chip">${one.online ? 'Online' : 'Offline'}</span>
      <span class="tacts"><span class="onhover">
        ${one.you ? '' : `<button class="small" data-compare="${esc(one.deviceId)}">Compare</button>`}
        ${one.you || !one.online ? '' : `<button class="small" data-remote="${esc(one.deviceId)}">Do something…</button>`}
      </span></span>
    </div>`;

  const personRow = (who) => {
    const on = who.devices.filter((d) => d.online).length;
    return `
      <div class="person">
        <div class="who">
          <span class="dot ${on ? 'live' : 'off'}"></span>
          <b>${esc(who.person)}</b>
          ${who.you ? '<span class="chip vibe">you</span>' : ''}
          <span class="rest"></span>
          <span class="count">${on
    ? `${on} of ${who.devices.length} here`
    : `${who.devices.length} computer${who.devices.length === 1 ? '' : 's'}, none here`}</span>
        </div>
        <div class="sheetlist machine-cols">${who.devices.map(deviceRow).join('')}</div>
      </div>`;
  };

  /**
   * The doorway, and it is a doorway rather than a page.
   *
   * What somebody wants from here is one of two things: which workspace, and
   * whether anything in it needs them. Both are above the fold and the second
   * is the reason the first is worth pressing. Everything about actually
   * working together is on the other side of Enter, which is why this stayed
   * short instead of growing another list.
   */
  const here = [...t.mine, ...t.team].filter((one) => one.online).length;

  box.innerHTML = `
    <div class="wsdoor">
      <div class="grow">
        <h2>${esc(t.workspace.name)}</h2>
        <span class="sub" id="team-standing">${people.size} ${people.size === 1 ? 'person' : 'people'}
          \u00b7 ${here} of ${t.mine.length + t.team.length} computers here</span>
      </div>
      <button class="go" id="team-enter">\u2190 Back to the workspace</button>
    </div>

    ${t.stillWorks ? `<div class="said"><b>${esc(t.stillWorks.sentence)}</b></div>` : ''}

    ${[...people.values()].sort((a, b) => Number(b.you) - Number(a.you)).map(personRow).join('')}

    <div class="bar" style="margin-top:var(--s4)">
      <button class="small" id="team-invite">Invite somebody</button>
      <button class="quiet small" id="team-manage">Manage\u2026</button>
    </div>

    <div id="lately"></div>`;

  /*
   * How many projects, and whether any of them is waiting. Filled in after,
   * because it means asking every computer that is here what it is offering,
   * and the door should be open before that comes back.
   */
  get('/team/projects').then((shared) => {
    const line = $('#team-standing');
    if (!line || !line.isConnected) return;
    const many = (shared.projects ?? []).length;
    const waiting = shared.needsAttention ?? 0;
    line.innerHTML = `${people.size} ${people.size === 1 ? 'person' : 'people'}
      \u00b7 ${here} of ${t.mine.length + t.team.length} computers here
      \u00b7 ${many} shared ${many === 1 ? 'project' : 'projects'}`;
    if (waiting) {
      line.insertAdjacentHTML('beforeend',
        ` <span class="chip attention">${waiting} needs attention</span>`);
    }
  });

  $('#team-enter').onclick = () => { workspacePlace = 'inside'; draw(); };
  $('#team-invite').onclick = inviteSomebody;
  $('#team-manage').onclick = () => manageWorkspace(t);

  // Invitations that are still worth showing, with the same clock the workspace
  // wrote down — so this list can never outlive what it is describing.
  const live = (t.invites ?? []).filter((one) => one.expiresAt > Date.now());
  if (live.length) {
    const soonest = Math.min(...live.map((one) => one.expiresAt));
    const at = $('#team-invite');
    if (at) {
      at.textContent = `Invite somebody (${live.length} waiting)`;
      at.title = `The next one runs out in ${Math.max(1, Math.round((soonest - Date.now()) / 60000))} minutes.`;
    }
  }

  drawLately();

  for (const b of box.querySelectorAll('[data-compare]')) {
    b.onclick = (e) => { e.stopPropagation(); compareWith(b.dataset.compare); };
  }
  for (const b of box.querySelectorAll('[data-remote]')) {
    b.onclick = (e) => { e.stopPropagation(); doSomethingOn(b.dataset.remote, t); };
  }

  wireInspect('[data-teamdev]', (r) => {
    const id = r.dataset.teamdev;
    inspectTeamDevice([...t.mine, ...t.team].find((one) => one.deviceId === id), t);
  });
}

/**
 * What has actually happened here.
 *
 * Not a feed. A feed is something you scroll because it might contain
 * something; this is a short list you look at when you want to know why
 * something is different from how you left it. Every line is an event that
 * measurably occurred — nobody is watching anybody, and there is no
 * "somebody is looking at Atlas", because nothing here can know that.
 */
async function drawLately() {
  const box = $('#lately');
  if (!box) return;

  const said = await get('/team/activity');
  if (!box.isConnected || !said.activity?.length) return;

  fill(box, `
    ${box.dataset.titled ? '' : '<div class="sect"><h2>Lately</h2></div>'}
    <ul class="steps">
      ${said.activity.slice(0, 12).map((one) => `
        <li><span>${esc(one.sentence)}</span>
          <span style="color:var(--faint)">${esc(ago(one.at))}</span></li>`).join('')}
    </ul>`);
}

/**
 * Write into a box, unless it is already showing exactly that.
 *
 * The same guard the whole page has, for the boxes filled in afterwards. What
 * it buys is that something looked at on a timer can be looked at on a timer:
 * a list that has not changed costs nothing, keeps its scroll, and does not
 * blink. Without it, every check is a rebuild of something identical.
 */
function fill(box, html) {
  if (!box || box.dataset.showing === html) return;
  box.dataset.showing = html;
  box.innerHTML = html;
}

/** What is known about one computer in the workspace. */
function inspectTeamDevice(one, t) {
  if (!one) return inspect(null);

  inspect({
    name: one.displayName,
    kind: one.you ? 'This computer' : 'In this workspace',
    mark: one.online ? '\u25c9' : '\u25cb',
    facts: [
      { label: 'Right now', value: one.online ? 'Online' : 'Offline' },
      { label: 'Connected', value: one.online ? one.how : null },
      {
        label: 'What that means',
        value: one.how === 'This network'
          ? 'On the same network as this one, so folders move at full speed and never leave the building.'
          : one.how === 'Direct \u00b7 Internet'
            ? 'Straight to that computer across the internet.'
            : one.how === 'Relay'
              ? 'Through a machine in the middle, which cannot read any of it.'
              : null,
      },
      { label: 'Last here', value: one.you ? 'Now' : (one.lastHere ? ago(one.lastHere) : 'a while ago') },
      { label: 'Belongs to', value: one.person },
      {
        label: 'May run things here',
        value: one.you ? 'It is this computer' : (one.trusted ? 'Yes' : 'No'),
      },
      { label: 'Known by', value: one.deviceId, mono: true, dim: true },
    ],
    // What this computer is offering, asked of it rather than assumed.
    sharesFrom: { deviceId: one.deviceId, name: one.displayName, online: one.online },
    acts: one.you ? [] : [
      { what: 'Compare with this computer', run: () => compareWith(one.deviceId) },
      ...(one.online ? [{ what: 'Do something on it\u2026', run: () => doSomethingOn(one.deviceId, t) }] : []),
      { what: 'Take it out of the workspace\u2026', danger: true, run: () => revokeDevice(one) },
    ],
  });
}

/** A person is not a computer: summarize their presence, then let devices speak for themselves. */
function inspectPerson(who, projects, busy) {
  if (!who) return inspect(null);
  const online = who.devices.filter((one) => one.online).length;
  const copies = projects.reduce((many, project) => many
    + project.copies.filter((copy) => copy.person === who.person).length, 0);

  inspect({
    name: who.person,
    kind: who.you ? 'You, in this workspace' : 'Member of this workspace',
    mark: online ? '\u25c9' : '\u25cb',
    facts: [
      { label: 'Right now', value: online ? `${online} of ${who.devices.length} computers reachable` : 'No computers reachable' },
      { label: 'Last shared work', value: busy ? `${busy.project} \u00b7 ${ago(busy.at)}` : 'Nothing shared lately' },
      { label: 'Shared copies', value: copies ? `${copies} across their computers` : 'No copies visible right now' },
    ],
    countsAre: 'Computers',
    counts: [
      { many: who.devices.length, what: who.devices.length === 1 ? 'computer' : 'computers' },
      { many: online, what: 'reachable' },
    ],
  });
}

// ---------------------------------------------------------------------------
// Making one, joining one, inviting somebody
// ---------------------------------------------------------------------------

async function makeWorkspace() {
  const name = await ask({
    title: 'Make a workspace',
    label: 'What should it be called?',
    value: 'My workspace',
    confirm: 'Make it',
  });
  if (!name) return;
  const made = await post('/team/create', { name });
  say(made);
  if (made.ok) workspacePlace = 'inside';
  draw();
}

async function joinWorkspace() {
  const code = await ask({
    title: 'Join a workspace',
    label: 'The code somebody read you',
    value: '',
    confirm: 'Join',
  });
  if (!code) return;
  const joined = await post('/team/join', { code });
  say(joined);
  if (joined.ok) workspacePlace = 'inside';
  draw();
}

/**
 * A code, shown once, with what it is and is not said next to it.
 *
 * It is bootstrap and not a password: ten minutes, one use. Saying so on the
 * sheet is the difference between somebody treating it carefully for the right
 * reason and treating it carelessly for the wrong one.
 */
async function inviteSomebody() {
  const made = await post('/team/invite', {});
  if (!made.ok) return say(made), draw();

  sheet({
    title: 'Invite somebody',
    narrow: true,
    body: `
      <p style="margin-top:0">Read this to them. They type it into Viberant on their
        own computer, and their computers appear here.</p>
      <div class="card" style="text-align:center;padding:1.4rem" id="inv-card">
        <div class="mono" id="inv-code" style="font-size:2rem;letter-spacing:.18em">${esc(made.code)}</div>
        <div style="color:var(--faint);margin-top:.5rem" id="inv-left"></div>
      </div>
      <p style="color:var(--quiet);font-size:.89rem">It works once, and it is a way in
        rather than a key \u2014 nothing that travels between your computers is protected
        by it. Each computer proves who it is with a key it made itself and never sends.</p>`,
    foot: `<button class="quiet" id="inv-copy">Copy it</button>
           <button class="go" id="inv-done">Done</button>`,
  });

  /**
   * A code that goes when it goes.
   *
   * The clock is the one the workspace wrote down, not one this page started —
   * so closing the sheet and opening it again cannot give a dying code another
   * ten minutes, and neither can restarting the app. When it runs out the code
   * is taken off the screen rather than left sitting there being refused by
   * anybody who tries it.
   */
  const tick = setInterval(() => {
    const box = $('#inv-left');
    if (!box || !box.isConnected) return clearInterval(tick);

    const left = made.expiresAt - Date.now();
    if (left > 0) {
      const m = Math.floor(left / 60000);
      const sec = Math.floor((left % 60000) / 1000);
      box.textContent = `Runs out in ${m}:${String(sec).padStart(2, '0')}`;
      return;
    }

    clearInterval(tick);
    const card = $('#inv-card');
    if (card) {
      card.innerHTML = `<b>That invitation has run out.</b>
        <div style="color:var(--faint);margin-top:.4rem">It will not work for anybody now,
          including anybody who wrote it down.</div>`;
    }
    const copy = $('#inv-copy');
    if (copy) { copy.disabled = true; copy.textContent = 'Copy it'; }

    const done = $('#inv-done');
    if (done) {
      done.textContent = 'Make a new one';
      done.onclick = async () => { closeLayer(); await inviteSomebody(); };
    }
  }, 1000);

  // Cleared whichever way the sheet goes, so nothing is left ticking against a
  // page that is not there any more.
  whenLayerCloses(() => clearInterval(tick));

  $('#inv-copy').onclick = () => navigator.clipboard?.writeText(made.code);
  $('#inv-done').onclick = () => { clearInterval(tick); closeLayer(); draw(); };
}

/**
 * Leaving, renaming, and closing — three different things, said as three.
 *
 * Leaving affects this computer. Closing ends the arrangement for everybody.
 * Neither touches a single file, and both say so, because the fear that stops
 * people pressing either is that their work is about to go.
 */
async function leaveWorkspace(t) {
  closeLayer();
  const sure = await confirmThat({
    title: `Leave ${t.workspace?.name ?? 'this workspace'}?`,
    what: 'This computer stops appearing to the others, and stops being able to reach them.',
    why: 'Nothing on this computer is touched. Your projects, your files and your GitHub are exactly as they were, and the workspace carries on for everybody else.',
    confirm: 'Leave Workspace',
  });
  if (!sure) return;
  say(await post('/team/leave', {}));
  workspacePlace = 'home';
  lookingAtProject = null;
  lookingAtPerson = null;
  lookingAtDevice = null;
  inspect(null);
  await refreshMe();
  draw();
}

async function deleteWorkspace(t) {
  closeLayer();
  const sure = await confirmThat({
    title: `Delete ${t.workspace?.name ?? 'this workspace'}?`,
    what: 'It ends for everybody. Every computer in it, every invitation, and every membership.',
    why: 'No files are deleted anywhere — not yours, and not anybody else\u2019s copies of what was shared. What ends is the arrangement, not the work.',
    confirm: 'Delete Workspace',
    danger: true,
  });
  if (!sure) return;
  say(await post('/team/close', {}));
  workspacePlace = 'home';
  lookingAtProject = null;
  lookingAtPerson = null;
  lookingAtDevice = null;
  inspect(null);
  await refreshMe();
  draw();
}

async function manageWorkspace(t) {
  sheet({
    title: t.workspace?.name ?? 'This workspace',
    narrow: true,
    body: `
      <p style="margin-top:0">${t.mine.length + t.team.length} computer${
  t.mine.length + t.team.length === 1 ? '' : 's'}, and ${t.team.length ? 'a team' : 'just yours'}.</p>
      <div class="menu">
        ${t.mayManage ? `<button class="pick" data-ws="rename"><b>Rename it</b>
          <span>Only the name changes.</span></button>` : ''}
        <button class="pick" data-ws="leave"><b>Leave Workspace</b>
          <span>This computer stops appearing to the others. Your projects, your files and
            your GitHub are untouched, and it carries on for everybody else.</span></button>
        ${t.mayManage ? `<button class="pick danger" data-ws="close"><b>Delete Workspace\u2026</b>
          <span>Ends the arrangement: membership, every computer's place in it, and every
            invitation. Nobody's files are deleted \u2014 not yours, and not anybody
            else's copies of what was shared.</span></button>` : ''}
      </div>`,
    foot: '<button class="quiet" id="ws-no">Never mind</button>',
  });

  $('#ws-no').onclick = closeLayer;

  $('[data-ws="rename"]')?.addEventListener('click', async () => {
    closeLayer();
    const name = await ask({
      title: 'Rename this workspace',
      label: 'What should it be called?',
      value: t.workspace?.name ?? '',
      confirm: 'Rename it',
    });
    if (!name) return;
    say(await post('/team/rename', { name }));
    draw();
  });

  $('[data-ws="leave"]')?.addEventListener('click', () => leaveWorkspace(t));

  $('[data-ws="close"]')?.addEventListener('click', () => deleteWorkspace(t));
}

async function revokeDevice(one) {
  const sure = await confirmThat({
    title: `Take ${one.displayName} out?`,
    what: 'It stops being able to reach anything in this workspace.',
    why: 'Nothing on that computer is touched, nothing of theirs is deleted, and their own GitHub is untouched.',
    confirm: 'Take it out',
    danger: true,
  });
  if (!sure) return;
  say(await post('/team/revoke', { what: one.deviceId }));
  inspect(null);
  draw();
}

// ---------------------------------------------------------------------------
// Two computers, side by side
// ---------------------------------------------------------------------------

/**
 * Why does this work here and not there?
 *
 * Shown as two columns of facts with the differences first, because that is
 * the shape of the answer. The row about settings says on itself that it is
 * names only, so nobody has to wonder whether a value is about to appear.
 */
async function compareWith(deviceId) {
  sheet({
    title: 'Comparing two computers',
    narrow: true,
    body: '<div class="ai-state"><span class="spin"></span> Asking that computer what it is\u2026</div>',
    foot: '<button class="quiet" id="cmp-close">Close</button>',
  });
  $('#cmp-close').onclick = closeLayer;

  const out = await post('/machine/compare', { device: deviceId });
  const body = document.querySelector('.sheet .body');
  if (!body) return;

  if (!out.ok) {
    body.innerHTML = `<div class="said bad"><b>${esc(out.sentence)}</b>
      <span>${esc(out.action ?? '')}</span></div>`;
    return;
  }

  const line = (d) => `
    <div class="trow">
      <span class="tname"><b>${esc(d.what)}</b>${d.note ? `<span class="where">${esc(d.note)}</span>` : ''}</span>
      <span class="metric">${esc(d.mine)}</span>
      <span class="metric">${esc(d.theirs)}</span>
    </div>`;

  body.innerHTML = `
    <p style="margin-top:0">${esc(out.sentence)}</p>
    <div class="sheetlist compare-cols">
      <div class="thead">
        <span></span>
        <span>${esc(out.mine.name)}</span>
        <span>${esc(out.theirs.name)}</span>
      </div>
      ${out.differences.map(line).join('')}
    </div>
    ${out.same.length ? `
      <div class="label-tiny" style="padding:1rem 0 .4rem">The same on both</div>
      <div class="fact">${out.same.map((s) => esc(s.what)).join(' \u00b7 ')}</div>` : ''}
    <div class="bar" style="margin-top:1rem">
      <button class="small" id="cmp-ask">Ask why they differ</button>
    </div>
    <div id="cmp-said"></div>`;

  $('#cmp-ask').onclick = async () => {
    const said = $('#cmp-said');
    said.innerHTML = '<div class="ai-state"><span class="spin"></span> Looking at the difference\u2026</div>';
    const answer = await post('/ai/why-different', { device: deviceId });
    said.innerHTML = answer.ok
      ? `<div class="ai-said">${asParagraphs(answer.text)}<div class="ai-from">${esc(answer.model ?? '')}</div></div>`
      : `<div class="said bad"><b>${esc(answer.sentence)}</b><span>${esc(answer.action ?? '')}</span></div>`;
  };
}

// ---------------------------------------------------------------------------
// Doing something on a computer of yours
// ---------------------------------------------------------------------------

/**
 * The three things, offered together, with what each needs said plainly.
 *
 * Nothing here decides whether it is allowed. That is decided on the computer
 * being asked, and a refusal comes back as a sentence — which is why the menu
 * offers everything and does not grey anything out on a guess.
 */
async function doSomethingOn(deviceId, t) {
  const one = [...t.mine, ...t.team].find((d) => d.deviceId === deviceId);
  sheet({
    title: `On ${one?.displayName ?? 'that computer'}`,
    narrow: true,
    body: `
      <p style="margin-top:0"><b>${esc(one?.displayName ?? 'That computer')}</b> is on
        ${esc(one?.how ?? 'this network')}. Everything below happens <b>there</b>, and that
        computer decides whether to allow it \u2014 not this one.</p>
      ${me.current ? '' : `<div class="said"><b>No project is open here.</b>
        <span>Most of these are about a project, so they need one open first.</span></div>`}
      <div class="menu">
        <button class="pick" data-on="sync" ${me.current ? '' : 'disabled'}>
          <b>See what is different</b>
          <span>Compares this project with theirs. Nothing moves until you say so, and
            what would be replaced is kept first.</span>
          <span class="go">${me.current ? '\u2192' : 'needs a project'}</span></button>
        <button class="pick" data-on="terminal">
          <b>Open a terminal there</b>
          <span>A shell on that computer, in this project's folder.</span>
          <span class="go">\u2192</span></button>
        <button class="pick" data-on="run" ${me.current ? '' : 'disabled'}>
          <b>Run it there</b>
          <span>Whatever the project calls its dev command.</span>
          <span class="go">${me.current ? '\u2192' : 'needs a project'}</span></button>
        <button class="pick" data-on="build" ${me.current ? '' : 'disabled'}>
          <b>Build it there</b>
          <span>Runs the project's own build, and tells you how it went.</span>
          <span class="go">${me.current ? '\u2192' : 'needs a project'}</span></button>
        <button class="pick" data-on="bring">
          <b>Bring back what it built</b>
          <span>Lands beside your project rather than in it, so nothing of yours is replaced.</span>
          <span class="go">\u2192</span></button>
        <button class="pick" data-on="preview">
          <b>Look at what is running there</b>
          <span>Opens on this computer only. Nothing is put on the internet.</span>
          <span class="go">\u2192</span></button>
      </div>
      <p style="color:var(--quiet);font-size:var(--t-meta)">Running things on somebody
        else's computer is off until they allow it, one at a time. If one of these is
        refused, that is why, and it will say so.</p>`,
    foot: '<button class="quiet" id="on-close">Close</button>',
  });
  $('#on-close').onclick = closeLayer;

  for (const b of document.querySelectorAll('[data-on]')) {
    b.onclick = async () => {
      const which = b.dataset.on;
      closeLayer();
      if (which === 'terminal') return openRemoteTerminal(deviceId, one);

      if (which === 'bring') {
        say({ ok: true, sentence: 'Asking for what it built…' });
        draw();
        say(await post('/remote/bring-built', { device: deviceId }));
        return draw();
      }

      if (which === 'preview') return openPreview(deviceId, one);

      // Looking first, and never moving anything because a menu item was
      // pressed. What to do about it is the next press, inside that sheet.
      if (which === 'sync') return whatIsDifferent({ id: deviceId, name: one?.displayName }, t);

      const out = await post('/remote/do', { asDevice: deviceId, name: which === 'run' ? 'dev' : 'build' });
      say(out);
      draw();
    };
  }
}

/**
 * Looking at something running on another computer.
 *
 * The address that comes back works on this computer and nowhere else, and the
 * sheet says so — because the reasonable assumption on being handed a link is
 * that it is a link, and this one is not.
 */
async function openPreview(deviceId, who) {
  const port = await ask({
    title: 'Look at what is running there',
    label: `Which address is it on, on ${who?.displayName ?? 'that computer'}?`,
    value: '5173',
    confirm: 'Open it',
  });
  if (!port) return;

  const out = await post('/remote/preview', { device: deviceId, port: Number(port), name: me.currentName });
  if (!out.ok) return say(out), draw();

  sheet({
    title: 'Running there',
    narrow: true,
    body: `
      <p style="margin-top:0">${esc(out.sentence)}</p>
      <div class="card" style="text-align:center;padding:1.2rem">
        <div class="mono" style="font-size:1.1rem">${esc(out.at)}</div>
      </div>
      <p style="color:var(--quiet);font-size:.89rem">${esc(out.action)} It goes through the
        connection those two computers already have, so nothing about it is reachable
        by anybody else.</p>`,
    foot: `<button class="quiet" id="pv-close">Close it</button>
           <button class="go" id="pv-open">Open it</button>`,
  });

  /**
   * Opened here rather than through the manager.
   *
   * The route that opens an address in a browser only ever takes ones on the
   * web, on purpose — it is for GitHub and sign-in pages, and letting it open
   * anything would make it a way to point somebody's browser wherever you like.
   * A preview is on this computer, so the window opens it directly.
   */
  $('#pv-open').onclick = () => window.open(out.at, '_blank', 'noopener');
  $('#pv-close').onclick = async () => {
    say(await post('/remote/preview/close', { at: out.at }));
    closeLayer();
    draw();
  };
}

/**
 * A terminal on another computer.
 *
 * Deliberately plain: a monospace box, what it says, and a line to type into.
 * The name of the computer is at the top and stays there, because the one
 * mistake this makes possible is forgetting which machine you are on.
 */
async function openRemoteTerminal(deviceId, who) {
  const out = await post('/remote/terminal', { asDevice: deviceId });
  if (!out.ok) return say(out), draw();

  sheet({
    title: `${who?.displayName ?? 'That computer'} \u00b7 terminal`,
    body: `
      <div class="said"><b>${esc(who?.displayName ?? 'That computer')}</b>
        <span>${esc(out.sentence)}</span></div>
      <pre id="term-out" class="termout"></pre>
      <div class="bar" style="margin:.6rem 0 0">
        <input id="term-in" class="mono" placeholder="Type here, then press enter" style="flex:1">
      </div>`,
    foot: '<button class="quiet danger" id="term-close">Close this session</button>',
  });

  const out_ = $('#term-out');
  const line = $('#term-in');
  line?.focus();

  const tick = setInterval(async () => {
    if (!out_.isConnected) return clearInterval(tick);
    const said = await get(`/remote/terminal/said?session=${encodeURIComponent(out.session)}`);
    if (said.text) {
      out_.textContent += said.text;
      out_.scrollTop = out_.scrollHeight;
    }
  }, 500);

  /**
   * Reading what it says back stops the moment this window goes away.
   *
   * Closing this window does not close the session on the other computer, and
   * that is deliberate — something left running there is still running, and
   * saying otherwise would be the dishonest half of the two. It appears under
   * Activity for as long as it lasts, which is where it can be stopped.
   */
  whenLayerCloses(() => clearInterval(tick));

  line.onkeydown = async (e) => {
    if (e.key !== 'Enter') return;
    const text = line.value;
    line.value = '';
    out_.textContent += `${text}\n`;
    await post('/remote/terminal/type', { session: out.session, text: `${text}\n` });
  };

  $('#term-close').onclick = async () => {
    clearInterval(tick);
    await post('/remote/terminal/close', { session: out.session });
    closeLayer();
    draw();
  };
}

/**
 * The workspaces this computer is in, before going into one.
 *
 * The question this answers is "which one", and after that it gets out of the
 * way. Everything about actually working together is behind Enter.
 */
/**
 * Saying something, wired wherever the box happens to be.
 *
 * The same three elements appear on the overview and inside the workspace, so
 * the handling of them is one function rather than two that drift.
 */
function wireSaying() {
  if (!$('#w-say')) return;
  $('#w-say').onkeydown = (e) => { if (e.key === 'Enter') $('#w-send').click(); };

  /**
   * A note appears when you press the button, and then says what became of it.
   *
   * It used to wait for the whole errand and then redraw the page, so pressing
   * Send did nothing visible for seconds and then rebuilt the screen underneath
   * you. It is on screen immediately, marked as on its way, and the mark
   * changes when it lands. Nothing is redrawn: one element is appended, which
   * is what actually happened.
   *
   * **What the mark says is what is true, and only that.** `reached` is the
   * number of computers that said back that they had written it down — not
   * how many were online, and not how many a connection opened to. So a note
   * that nobody has yet says so, plainly, with the way to try again next to it,
   * rather than claiming it was sent because sending was attempted.
   */
  $('#w-send').onclick = async () => {
    const box = $('#w-say');
    const text = box.value.trim();
    if (!text) return;
    box.value = '';
    await sendOneNote(text);
  };
}

/** Say one thing, and keep saying what became of it until it is settled. */
async function sendOneNote(text, into = null) {
  const talkBox = $('#talk');
  const empty = talkBox?.querySelector('p.quiet');
  if (empty) empty.remove();

  const mine = into ?? document.createElement('div');
  mine.className = 'bubble mine going';
  // The stream can report the locally saved note before this request returns.
  // Give both paths one identity up front so the optimistic bubble cannot be
  // followed by a duplicate of itself.
  const eventId = mine.dataset.note || crypto.randomUUID();
  mine.dataset.note = eventId;
  heardAlready.add(eventId);
  mine.innerHTML = `<div class="who">You \u00b7 <span>Sending\u2026</span></div>${esc(text)}`;
  if (!into) talkBox?.append(mine);
  if (talkBox) talkBox.scrollTop = talkBox.scrollHeight;

  const r = await post('/workspace/say', { text, id: eventId });
  if (!mine.isConnected) return;

  mine.classList.remove('going');
  const when = mine.querySelector('.who span');

  if (r.ok) {
    // Marked with the identifier the manager gave it, so the same note arriving
    // back down the stream is recognised rather than added twice.
    if (r.event?.id) {
      mine.dataset.note = r.event.id;
      heardAlready.add(r.event.id);
      howFarItGot.set(r.event.id, r.reached ?? 0);
    }
    if (when) {
      when.textContent = r.reached
        ? `Sent to ${r.reached} ${r.reached === 1 ? 'computer' : 'computers'}`
        : 'Here only \u2014 nobody else has it';
    }
    mine.classList.toggle('alone', !r.reached);
    return;
  }

  mine.classList.add('nope');
  if (when) when.textContent = 'Failed';
  mine.title = [r.sentence, r.action].filter(Boolean).join(' ');

  const again = document.createElement('button');
  again.className = 'quiet small again';
  again.textContent = 'Try again';
  again.onclick = () => { again.remove(); sendOneNote(text, mine); };
  mine.append(again);
}

async function drawLegacyWorkspace() {
  clearTimeout(workspaceTimer);
  const w = await get('/workspace');

  if (!w.joined) {
    /**
     * Two different things, and only one of them needs GitHub.
     *
     * The workspace built on a GitHub project came first and is still how your
     * own computers keep a note for each other. The team below is Viberant's
     * own, stands on device keys, and needs no account anywhere — so it is
     * drawn whether or not the other one has been joined. Tying it to the
     * older one would have meant needing GitHub to reach a computer in the
     * next room, which is the opposite of the point.
     */
    view.innerHTML = `
      <div class="pagehead">
        <div class="grow"><button class="wsback" id="legacy-back">\u2190 Workspaces</button>
          <h1>Your own computers</h1>
          <p class="sub">The older account-backed way your computers exchange folders.</p></div>
      </div>
      <h2>Shared workspace through GitHub</h2>
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
    $('#legacy-back').onclick = () => { workspacePlace = 'home'; draw(); };
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
  /**
   * This computer's own row, which exists before its file does.
   *
   * The first time somebody joins there is nothing written down yet — the
   * heartbeat has not run — and the row was drawing from `me` while carrying no
   * identifier at all. Pressing it selected a row and then found nothing to
   * describe, which reads as broken and is D-65's exact shape. It stands in for
   * itself instead, out of what this computer already knows.
   */
  const mine = known.find((m) => m.you) ?? {
    id: me.machine,
    name: me.machineName,
    you: true,
    hereNow: true,
    lastHere: Date.now(),
    kind: null,
    workingOn: me.currentName ?? null,
  };
  const others = known.filter((m) => !m.you);
  const reachable = others.filter((m) => nearby.has(m.id)).length;

  view.innerHTML = `
    <div class="pagehead">
      <div class="grow">
        <h1>Shared workspace</h1>
        <p class="sub">This workspace was made on the GitHub account
          <b>${esc(w.account ?? 'unknown')}</b>. Folders move straight between your
          computers across this network — never through GitHub.</p>
        ${/*
          * Two accounts, said as two accounts.
          *
          * A workspace belongs to whoever made it, and the account Viberant is
          * signed in to is a separate thing that may differ — which is an
          * ordinary arrangement, not a fault. Saying only one of them is how
          * this page came to name the wrong owner.
          */
    w.workspaceGithub ? `<p class="sub ws-accounts">
          <span>Workspace owner <b>${esc(w.owner ?? 'unknown')}</b></span>
          <span>Workspace GitHub <b class="mono">${esc(w.workspaceGithub)}</b></span>
          <span>Current Viberant GitHub <b>${esc(w.signedInAs ?? 'not signed in')}</b></span>
        </p>` : ''}
      </div>
      <div class="acts">
        <button class="quiet small" id="legacy-back">\u2190 Workspaces</button>
        <button class="small" id="w-refresh">Check again</button>
        <button class="go" id="w-offer">Offer…</button>
      </div>
    </div>
    ${/*
      * One trouble, said once.
      *
      * The standing fault below and the passing message above are two different
      * things that had become the same words: pressing Check again said what
      * was wrong, and the page underneath said it too, so the screen carried
      * the same sentence twice with two different endings. Whichever arrived
      * second is the same news, so only the standing one is kept.
      */
    w.trouble && said?.sentence === w.trouble.sentence ? '' : saidHtml()}
    ${w.trouble ? `<div class="said bad"><b>${esc(w.trouble.sentence)}</b>
      <span>${esc(w.trouble.action ?? '')}</span>
      <span>Until this is fixed, your other computers cannot see this one at all.</span></div>` : ''}

    ${summary([
    {
      mark: SUM_MARK.computers,
      big: known.length,
      what: `computer${known.length === 1 ? '' : 's'} in all`,
      tone: reachable ? 'live' : '',
    },
    {
      mark: SUM_MARK.folder,
      big: (w.offers ?? []).length,
      what: `folder${(w.offers ?? []).length === 1 ? '' : 's'} you are offering`,
    },
    {
      mark: SUM_MARK.pulse,
      big: w.sharingHere ? 'Reachable' : 'Not reachable',
      what: w.sharingHere
        ? `this computer${reachable ? `, and ${reachable} of yours` : ''}`
        : 'your other computers cannot ask this one',
      tone: w.sharingHere ? 'live' : 'warn',
      pip: w.sharingHere,
      signal: w.sharingHere && reachable > 0,
    },
  ])}

    <div id="team"></div>

    <div class="sect"><h2>Also signed in to your GitHub account</h2>
      <span class="count">${known.length}</span></div>
    <p class="sub" style="margin:-.4rem 0 .7rem">Being on the same account is not being in a
      workspace. Nobody here can be reached, asked for anything, or told anything until they
      join one — which is the list above.</p>
    <div class="sheetlist machine-cols">
      <div class="trow tap on-this" data-machine="${esc(mine.id)}">
        <span class="dot ${w.sharingHere ? 'live' : 'off'}"></span>
        <span class="tname">
          <b>${esc(mine.name)}</b>
          <span class="where">${w.sharingHere
    ? 'Your other computers can find this one and ask it for what it offers.'
    : 'Not reachable by your other computers at the moment.'}</span>
        </span>
        <span class="chip vibe">this one</span>
        <span class="tacts">
          <span class="onhover">
            <button class="small" id="w-rename">Rename</button>
            ${w.sharingHere ? '' : '<button class="go small" id="w-share-on">Let the others reach it</button>'}
          </span>
        </span>
      </div>
      ${others.map((m) => {
    const near = nearby.get(m.id);
    return `
      <div class="trow tap" data-machine="${esc(m.id)}">
        <span class="dot ${near ? 'live' : m.hereNow ? 'attention' : 'off'}"></span>
        <span class="tname">
          <b>${esc(m.name)}</b>
          <span class="where">${near ? 'Here now, and folders can move both ways.'
      : m.hereNow ? 'Signed in, but not on this network — notes travel, folders cannot.'
        : `Last seen ${ago(m.lastHere)}.`}${m.workingOn ? ` · Working on ${esc(m.workingOn)}` : ''}</span>
        </span>
        <span class="chip">${esc(m.kind ?? '')}</span>
        <span class="tacts">
          <span class="onhover">
            ${near ? `<button class="go small" data-peek="${esc(m.id)}">See what it is offering</button>` : ''}
          </span>
        </span>
      </div>`;
  }).join('')}
    </div>
    ${others.length ? '' : `<div class="empty"><b>Only this computer so far.</b>
         Install Viberant on another one, sign in to the same GitHub account, and press Join there.</div>`}

    <div class="sect"><h2>What this computer is offering</h2>
      <span class="count">${(w.offers ?? []).length}</span></div>
    ${(w.offers ?? []).length ? `<div class="sheetlist offer-cols">${(w.offers ?? []).map((o) => `
      <div class="trow tap" data-offered="${esc(o.id)}">
        <span class="kindmark" aria-hidden="true">${KIND_MARK[o.kind] ?? KIND_MARK.folder}</span>
        <span class="tname">
          <b>${esc(o.name)}</b>
          <span class="where" title="${esc(o.path ?? '')}">${esc(shortPath(o.path ?? ''))}</span>
        </span>
        <span class="metric">${esc(size(o.bytes))}</span>
        <span class="metric quiet">${o.kind === 'file' ? '' : `${o.files} files`}</span>
        <span class="state finished"><span class="pip"></span>Shared</span>
        <span class="tacts">
          <button class="small icon" data-offered-more="${esc(o.id)}"
            data-tip="More for ${esc(o.name)}" aria-label="More for ${esc(o.name)}">⋯</button>
        </span>
      </div>`).join('')}</div>`
    : `<div class="empty"><b>Nothing offered yet.</b>
         Offer a file or a folder and your other computers can take a copy. Nothing moves until one asks.
         <span class="acts"><button class="go" id="w-offer-empty">Offer…</button></span></div>`}

    <div class="sect"><h2>Notes</h2>
      <span class="count">${(w.said ?? []).length}</span></div>
    <div class="card">
      <div class="talk short" id="talk">
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
      <button class="quiet small danger" id="w-leave">Take this computer out of the workspace</button>
    </div>

    <div id="job"></div>`;
  said = null;

  const talk = $('#talk');
  if (talk) talk.scrollTop = talk.scrollHeight;

  wireSaying();
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

  $('#legacy-back').onclick = () => { workspacePlace = 'home'; draw(); };

  for (const b of document.querySelectorAll('[data-peek]')) {
    b.onclick = (e) => { e.stopPropagation(); peekAt(b.dataset.peek, w); };
  }

  /**
   * One press tells you about a row; it never does anything to it.
   *
   * The same arrangement Projects has, for the same reason: what a computer is
   * and what it can reach right now are facts somebody wants without leaving
   * the list, and there was nowhere on this page to put them.
   */
  wireInspect('[data-machine]', (row) => {
    const id = row.dataset.machine;
    inspectMachine(known.find((m) => m.id === id) ?? (id === mine.id ? mine : null),
      nearby.get(id), w);
  });
  wireInspect('[data-offered]', (row) => {
    inspectOffered((w.offers ?? []).find((o) => o.id === row.dataset.offered));
  });

  // Offering is one control with two answers rather than two buttons, because
  // they are the same decision with a different noun in it.
  const offerMenu = (e) => {
    const room = e.currentTarget.getBoundingClientRect();
    menuAt({ x: Math.min(room.left, innerWidth - 220), y: room.bottom + 6 }, [
      { what: 'Offer a file…', run: offerFile },
      { what: 'Offer a folder…', run: offerFolder },
    ]);
  };
  $('#w-offer').onclick = offerMenu;
  $('#w-offer-empty')?.addEventListener('click', offerMenu);

  for (const b of document.querySelectorAll('[data-offered-more]')) {
    const one = (w.offers ?? []).find((o) => o.id === b.dataset.offeredMore);
    const items = [
      { what: 'Show it in Explorer', run: () => post('/reveal', { path: one?.path }) },
      { what: 'Copy where it is', run: () => navigator.clipboard?.writeText(one?.path ?? '') },
      '-',
      {
        what: 'Stop offering it',
        run: async () => { say(await post('/local/withdraw', { id: b.dataset.offeredMore })); draw(); },
      },
    ];
    b.onclick = (e) => {
      e.stopPropagation();
      const room = b.getBoundingClientRect();
      menuAt({ x: room.right - 210, y: room.bottom + 6 }, items);
    };
    b.closest('[data-offered]').oncontextmenu = (e) => {
      e.preventDefault();
      menuAt({ x: e.clientX, y: e.clientY }, items);
    };
  }
  // Redraw the errand once, without starting a second loop watching it.
  if (watching) paintJob({ again: !jobTimer });
  workspaceTimer = setTimeout(() => {
    if (at.tab === 'workspace' && !layer.innerHTML && !watching) draw({ quietly: true });
  }, 20000);
};

/**
 * Bringing a copy of somebody else's project here.
 *
 * Written once and wired wherever those buttons are drawn, which is now the
 * sheet belonging to the computer they came from rather than a second list of
 * everybody's projects mixed together.
 */
function wireBring(where, w) {
  for (const b of where.querySelectorAll('[data-bring]')) {
    b.onclick = async () => {
      const entry = JSON.parse(b.dataset.bring);

      // Said before it happens, not discovered afterwards. A copy from GitHub
      // carries what has been saved and sent and nothing else, and somebody
      // who wanted the folder deserves to know that is not what they are
      // getting \u2014 that gap is exactly how 1.3 GB arrived as 300 MB.
      const anyway = await confirmThat({
        title: `Bring ${entry.name} from GitHub`,
        what: `${entry.fromName} is not on this network, so this comes from GitHub.`,
        why: 'That carries what has been saved and sent \u2014 not anything unsaved, and nothing '
          + 'deliberately left out of what gets saved. For the whole folder, have both computers '
          + 'on the same network and ask that computer for it instead.',
        confirm: 'Bring the saved work',
      });
      if (!anyway) return;

      const into = await pickFolder({
        title: `Where should ${entry.name} go?`,
        confirm: 'Put it in here',
        startAt: w?.workFolder,
      });
      if (!into) return;

      closeLayer();
      const r = await post('/workspace/bring', { entry, into });
      if (r.job) { await watchJob(r.job); return; }

      say(r);
      await refreshMe();
      draw();
    };
  }
}

/**
 * Offer one file to the other computers on this network.
 *
 * Its own errand rather than a mode of the folder one, because there is nothing
 * to decide: a file is the file. The question the folder version has to ask —
 * whether to include the folders that get rebuilt anyway — has no meaning here,
 * and a sheet that asks a question with one answer is a sheet that wastes a
 * press.
 */
async function offerFile() {
  const chosen = await post('/choose/file');
  if (chosen.cancelled) return;
  if (!chosen.ok) return say(chosen), draw();

  say(await post('/local/offer', { path: chosen.path, kind: 'file' }));
  draw();
}

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

/**
 * Which GitHub account this manager will actually use, with room to say it.
 *
 * It had no home but the panel in the corner, which is 272 pixels wide and was
 * being asked to hold a list of accounts, a paragraph explaining what signing
 * in to another one does, and two buttons. That is where the reported clipping
 * came from, and no amount of shortening the paragraph fixes a column that
 * narrow — the answer is somewhere with room, which is here.
 *
 * The corner keeps quick switching. This is where you come to check.
 *
 * Drawn after the page rather than with it, because it asks GitHub who you are
 * and nothing else on this screen should wait for the network.
 */
async function drawGitHubSettings() {
  const box = $('#gh-settings');
  if (!box) return;

  const g = await get('/github');
  if (!box.isConnected) return;

  const row = (title, why, control) => `
    <div class="setting">
      <div class="about"><b>${title}</b><span>${why}</span></div>
      <div class="set">${control}</div>
    </div>`;

  if (!g.here) {
    box.innerHTML = row('GitHub is not on this computer',
      'The GitHub helper is what lets this manager make copies of your work and find '
      + 'your other computers. It is a separate free download.',
      '<button class="small" id="gh-get">How to get it ↗</button>');
    $('#gh-get').onclick = () => post('/open-outside', { url: 'https://cli.github.com' });
    return;
  }

  const others = (g.accounts ?? []).filter((a) => a.name !== g.account);

  box.innerHTML = `
    ${g.account ? row(
    `<span class="who-now"><span class="dot live"></span>${esc(g.account)}</span>`,
    `Everything this manager does on GitHub uses this account — new copies of your
      projects, sending your work, and the place your computers find each other.${
  g.reachable === false ? ' GitHub could not be reached just now, so this is the last account it confirmed.' : ''}`,
    '<button class="small" id="gh-out">Sign out</button>',
  ) : g.reachable === false ? row(
    /**
     * Could not ask is not the same as nobody, and saying the wrong one of
     * those is what made this screen contradict every other screen in the app.
     */
    'Cannot check just now',
    'GitHub could not be reached, so this computer cannot say which account it is '
      + 'using. Nothing has changed — it will say as soon as it can ask.',
    '<button class="small" id="gh-again">Check again</button>',
  ) : row(
    'Not signed in',
    'Nothing here needs an account, but a second copy of your work and your other '
      + 'computers both do.',
    '<button class="go small" id="gh-in">Sign in to GitHub</button>',
  )}

    ${others.length ? row(
    'Also signed in on this computer',
    'Switching changes which account every GitHub action here uses, at once.',
    others.map((a) => `<button class="small" data-gh-use="${esc(a.name)}">Use ${esc(a.name)}</button>`).join(''),
  ) : ''}

    ${g.account ? row(
    'Another account',
    'Opens your browser so GitHub can confirm it is you. The account you are using '
      + 'now stays signed in and is never replaced without you choosing it.',
    '<button class="small" id="gh-add">Add an account</button>',
  ) : ''}

    ${row('Your name on saved work',
    g.identity?.name
      ? `Work saved here is signed ${esc(g.identity.name)} &lt;${esc(g.identity.email ?? '')}&gt;.`
      : 'Nothing can be saved at all until this is set.',
    `<button class="small" id="gh-name">${g.identity?.name ? 'Change it' : 'Set it'}</button>`)}`;

  $('#gh-out')?.addEventListener('click', async () => { say(await post('/github/signout')); await refreshMe(); draw(); });
  $('#gh-in')?.addEventListener('click', () => signInToGitHub({}));
  $('#gh-again')?.addEventListener('click', async () => {
    say(await post('/github/refresh', {}));
    await refreshMe();
    draw();
  });
  $('#gh-add')?.addEventListener('click', () => signInToGitHub({}));
  $('#gh-name').onclick = () => identitySheet(g);
  for (const b of box.querySelectorAll('[data-gh-use]')) {
    b.onclick = async () => {
      b.classList.add('working');
      say(await post('/github/switch', { name: b.dataset.ghUse }));
      await refreshMe();
      draw();
    };
  }
}

/**
 * The Google names on this computer.
 *
 * Its own section, well away from GitHub, because the two are constantly
 * confused and only one of them decides anything. The sentence here says which
 * is which, once, rather than leaving somebody to work it out from where the
 * buttons happen to be.
 */
async function drawGoogleSettings() {
  const box = $('#google-settings');
  if (!box) return;

  const g = await get('/google');
  if (!box.isConnected) return;

  const row = (title, why, control) => `
    <div class="setting">
      <div class="about"><b>${title}</b><span>${why}</span></div>
      <div class="set">${control}</div>
    </div>`;

  const others = (g.accounts ?? []).filter((a) => !a.active);
  const now = (g.accounts ?? []).find((a) => a.active);

  box.innerHTML = `
    ${now ? row(
    `<span class="who-now"><span class="dot live"></span>${esc(now.name)}</span>`,
    'A name on this computer, and something for your other computers to know you '
      + 'by. It decides nothing about where your work goes — that is GitHub, above.',
    `<button class="small" data-goog-out="${esc(now.name)}">Sign out</button>`,
  ) : row(
    'Not signed in',
    'Optional. Everything here works without it, and it never affects where your work goes.',
    '<button class="small" id="goog-in">Sign in with Google</button>',
  )}

    ${others.length ? row(
    'Also signed in here',
    'Switching changes the name on this computer and nothing else.',
    others.map((a) => `<button class="small" data-goog-use="${esc(a.name)}">Use ${esc(a.name)}</button>`
      + `<button class="quiet small" data-goog-out="${esc(a.name)}">Sign out</button>`).join(''),
  ) : ''}

    ${now ? row(
    'Another account',
    'A work address and a personal one can both be here. Signing in to a second no '
      + 'longer signs you out of the first.',
    '<button class="small" id="goog-add">Add an account</button>',
  ) : ''}`;

  $('#goog-in')?.addEventListener('click', () => signInToGoogle({}));
  $('#goog-add')?.addEventListener('click', () => signInToGoogle({}));
  for (const b of box.querySelectorAll('[data-goog-use]')) {
    b.onclick = async () => {
      say(await post('/google/switch', { name: b.dataset.googUse }));
      await refreshMe();
      draw();
    };
  }
  for (const b of box.querySelectorAll('[data-goog-out]')) {
    b.onclick = async () => {
      say(await post('/google/signout', { name: b.dataset.googOut }));
      await refreshMe();
      draw();
    };
  }
}

/**
 * Whether there is a newer one, and the one step this will not take for you.
 *
 * The refusal is on the page rather than only in the code, because a person who
 * cannot see why a button is missing concludes it is broken. What is missing is
 * a signature, and saying so out loud is the difference between a limitation
 * and an explanation.
 */
async function drawNewerSettings({ force = false } = {}) {
  const box = $('#newer-settings');
  if (!box) return;

  const n = force ? await post('/newer', {}) : await get('/newer');
  if (!box.isConnected) return;

  const row = (title, why, control) => `
    <div class="setting">
      <div class="about"><b>${title}</b><span>${why}</span></div>
      <div class="set">${control}</div>
    </div>`;

  box.innerHTML = `
    ${n.newer ? row(
    `${esc(n.name)}<span class="chip cool" style="margin-left:.5rem">new</span>`,
    `${esc(n.sentence)} ${esc(n.action)}`,
    '<button class="go small" id="newer-get">Get it</button>',
  ) : row(
    esc(n.sentence),
    n.known
      ? 'Checked against what has been released.'
      : esc(n.action ?? 'Try again in a moment.'),
    '<button class="small" id="newer-again">Check again</button>',
  )}

    ${n.newer && n.whatsNew?.length ? row(
    'What is new',
    n.whatsNew.map((l) => esc(l)).join(' · '),
    '',
  ) : ''}

    ${row(
    'It does not install itself',
    `${esc(n.signing.sentence)} ${esc(n.signing.action)}`,
    '',
  )}`;

  $('#newer-again')?.addEventListener('click', () => drawNewerSettings({ force: true }));
  $('#newer-get')?.addEventListener('click', async () => {
    if (!n.at) return;
    say(await post('/open/page', { at: n.at }));
    draw();
  });
}

/**
 * Whether the chosen picture leaves anything readable, said out loud.
 *
 * Waits for the picture to have arrived rather than guessing, and only ever
 * speaks when there is something to say — a picture that is already dark
 * enough needs no sentence, and a compliment about it would be noise.
 */
function checkPictureReads({ fix = false } = {}) {
  const judge = async () => {
    const light = wall.brightnessOfPicture();
    if (light === null) {
      // Only worth saying when somebody just asked for it. On an ordinary draw
      // a picture that is not there yet is a picture still arriving.
      if (!fix) return;
      return say({
        ok: false,
        sentence: 'That picture could not be read.',
        action: 'Check it is still where you left it, and choose it again.',
      }) && draw();
    }

    // How much has to be over it before text on top of it reads. Worked out
    // from the picture itself rather than picked: a bright photograph needs
    // most of it covered and a dark one needs hardly any.
    const needs = Math.round(Math.min(90, Math.max(20, light * 105)));
    const now = Number(me.settings?.wallDim ?? 55);
    if (needs <= now) return;

    /**
     * Fixed when it was just chosen; only said otherwise.
     *
     * Choosing a picture is somebody asking for a picture, not asking for an
     * unreadable page, so the manager sets what it takes. But somebody who
     * later pulls the slider down has *decided* — moving it back for them would
     * be the app overruling a person about their own screen, which nothing here
     * is allowed to do. So it says it, once, and leaves the slider alone.
     */
    if (!fix) {
      return say({
        ok: false,
        sentence: 'The picture behind this is bright enough to make the words on top of it hard to read.',
        action: `Covering ${needs} in a hundred of it would fix that. The slider below is at ${now}.`,
      }) && draw();
    }

    say({
      ok: false,
      sentence: 'That picture is bright enough to make the words on top of it hard to read.',
      action: `It has been covered ${needs} in a hundred to fix that, and the slider below undoes it.`,
    });
    await post('/settings', { id: 'wallDim', value: needs });
    await refreshMe();
    draw();
  };

  addEventListener('wall-picture', judge, { once: true });
  // And in case it was already here, so the answer does not wait on an event
  // that has already happened.
  setTimeout(() => { if (wall.brightnessOfPicture() !== null) judge(); }, 400);
}

/**
 * What kind of errand this is, said as a word and a colour rather than a code.
 *
 * The kinds come from the errand itself, which named itself when it began, so
 * nothing here guesses from a sentence.
 */
const JOB_KINDS = [
  { id: 'all', name: 'All' },
  { id: 'transfer', name: 'Transfer' },
  { id: 'git', name: 'Saving' },
  { id: 'build', name: 'Build' },
  { id: 'deploy', name: 'Deploy' },
  { id: 'ai', name: 'Asking' },
  { id: 'remote', name: 'Other computers' },
  { id: 'sync', name: 'Sync' },
  { id: 'send', name: 'Sending' },
];

/** Which kinds are being shown. Kept between redraws, not between sessions. */
let activityFilter = 'all';

/**
 * Everything that is happening, or happened, or is still sitting there.
 *
 * Five things were built and then left with no way in. Long errands were only
 * visible on whichever screen started them, so a build begun on one page and
 * finished on another simply vanished. What a build made, what somebody else is
 * running on this computer, which previews are still open, and what was kept
 * before a folder was written over — all real, all working, none of it
 * reachable by anybody who had not read the source.
 *
 * They belong together because they answer one question: what has this computer
 * got going on. Nothing here starts anything. It shows, and it stops.
 */
SCREENS.activity = async () => {
  const [{ jobs }, p] = await Promise.all([get('/jobs'), get('/project')]);
  const [sessions, previews, built, ways, workspaceEvents] = await Promise.all([
    get('/remote/sessions'),
    get('/remote/previews'),
    p?.dir ? get('/remote/built') : Promise.resolve({ ok: false }),
    p?.dir ? get('/waysback') : Promise.resolve({ ok: true, waysBack: [] }),
    get('/team/activity').catch(() => ({ ok: false, activity: [] })),
  ]);

  const workspaceActivity = workspaceEvents.activity ?? [];
  const mine = activityFilter === 'workspace'
    ? []
    : jobs.filter((j) => activityFilter === 'all' || j.kind === activityFilter);
  const running = mine.filter((j) => !j.finished);
  const over = mine.filter((j) => j.finished).slice(0, 14);
  const finishedWell = over.filter((j) => j.ok);
  const needsAttention = over.filter((j) => !j.ok);
  const back = ways.waysBack ?? [];

  // Only the kinds that actually happened here, plus whichever is chosen, so
  // this is a list of what you have rather than a list of what exists.
  const had = new Set(jobs.map((j) => j.kind));
  const filters = [
    ...JOB_KINDS.filter((k) => k.id === 'all' || had.has(k.id) || k.id === activityFilter),
    ...(workspaceActivity.length ? [{ id: 'workspace', name: 'Workspace' }] : []),
  ];

  const jobLine = (j) => `
    <div class="trow activity-event ${j.id === watching ? 'on' : ''}" data-job-open="${esc(j.id)}">
      <span class="dot ${j.finished ? (j.ok ? 'off' : 'attention') : 'live'}"></span>
      <span class="tname">
        <b>${esc(j.what)}</b>
        <span class="where">${esc(j.sentence ?? (j.steps?.at(-1)?.sentence ?? 'Working…'))}</span>
      </span>
      <span class="tcell dim">${esc(j.project ?? '')}</span>
      <span class="tcell"><span class="chip">${esc(kindCalled(j.kind))}</span></span>
      <span class="tcell dim">${esc(ago(j.finished ?? j.started))}</span>
      <span class="tacts">
        <span class="onhover"><button class="small" data-job-open="${esc(j.id)}">Look at it</button></span>
      </span>
    </div>`;

  const workspaceLine = (one) => `
    <div class="activity-workspace-event">
      <span class="activity-kind-mark">${/failed|did not/.test(one.kind) ? '!' : '•'}</span>
      <span class="grow"><b>${esc(one.sentence)}</b><small>Workspace · ${esc(ago(one.at))}</small></span>
    </div>`;

  const recentWorkspace = (activityFilter === 'all' || activityFilter === 'workspace')
    ? workspaceActivity.slice(0, activityFilter === 'workspace' ? 18 : 8)
    : [];
  const activeRemote = (sessions.sessions ?? []).filter((one) => one.running);
  const attentionTotal = needsAttention.length + workspaceActivity.filter((one) => /failed|did not/.test(one.kind)).length;

  view.innerHTML = `
    <div class="pagehead command-head">
      <div class="grow">
        <span class="eyebrow">Operational history</span>
        <h1>Activity</h1>
        <p class="sub">Track work in progress, items needing attention, and completed output across this computer.</p>
      </div>
      <div class="acts"><button class="quiet" id="act-again">Look again</button></div>
    </div>
    ${saidHtml()}

    <section class="activity-summary-strip">
      <span><i>${SUM_MARK.running}</i><b>${running.length}</b><small>Live work</small></span>
      <span><i>${SUM_MARK.computers}</i><b>${workspaceActivity.length}</b><small>Workspace events</small></span>
      <span><i>${SUM_MARK.computers}</i><b>${activeRemote.length}</b><small>Remote sessions</small></span>
      <span class="${attentionTotal ? 'attention' : ''}"><i>${attentionTotal ? '!' : SUM_MARK.done}</i><b>${attentionTotal}</b><small>Needs attention</small></span>
    </section>

    <div class="activity-filterbar">
      <div class="activity-tabs">
        ${filters.map((k) => `<button class="${k.id === activityFilter ? 'on' : ''}" data-filter="${esc(k.id)}">${esc(k.name)}</button>`).join('')}
      </div>
      <span class="activity-live-state"><span class="dot live"></span> Live</span>
    </div>

    <div class="activity-layout">
      <div class="activity-main">
    <div class="section-rubric"><span><b>Happening now</b><small>Output from anything still running</small></span><span class="count">${running.length}</span></div>
    ${running.length
    ? `<div class="activity-stream-v2 act-cols">
        ${running.map(jobLine).join('')}</div>`
    : '<div class="activity-empty-v2 compact"><span>○</span><div><b>Nothing is running.</b><small>New work appears here immediately.</small></div></div>'}

    <div class="activity-recent-grid">
      <section>
        <div class="section-rubric activity-finished-head"><span><b>Recent activity</b><small>Finished work and Workspace updates</small></span><span class="count">${finishedWell.length + recentWorkspace.length}</span></div>
        <div class="activity-stream-v2 act-cols">
          ${finishedWell.map(jobLine).join('')}
          ${recentWorkspace.map(workspaceLine).join('')}
          ${!finishedWell.length && !recentWorkspace.length ? '<div class="activity-empty-inline">No recent activity in this view.</div>' : ''}
        </div>
      </section>
      <section>
        <div class="section-rubric activity-finished-head"><span><b>Needs attention</b><small>Work that did not finish cleanly</small></span><span class="count">${needsAttention.length}</span></div>
        <div class="activity-stream-v2 act-cols attention-list">
          ${needsAttention.map(jobLine).join('')}
          ${!needsAttention.length ? '<div class="activity-empty-inline good">Nothing needs attention.</div>' : ''}
        </div>
      </section>
    </div>
      </div>
      <aside class="activity-side">
      <div id="job"></div>
      ${watching ? '' : `<div class="activity-context-v2">
        <span class="eyebrow">Operational scope</span>
        <h2>${p?.name ? esc(p.name) : 'This computer'}</h2>
        <p>Select an item to see its progress, output, and available actions here.</p>
        <div><span>Workspace updates</span><b>${workspaceActivity.length}</b></div>
        <div><span>Remote sessions</span><b>${activeRemote.length}</b></div>
        <div><span>Open previews</span><b>${previews.windows?.length ?? 0}</b></div>
      </div>`}

    <div class="sect"><h2>Being run here by another computer</h2>
      <span class="count">${sessions.sessions?.length ?? 0}</span></div>
    ${sessions.sessions?.length ? `
      <div class="sheetlist">
        ${sessions.sessions.map((one) => `
          <div class="trow">
            <span class="dot ${one.running ? 'live' : 'off'}"></span>
            <span class="tname">
              <b>${esc(one.what ?? one.kind)}</b>
              <span class="where">Asked for by ${esc(one.who ?? 'another computer')}
                · ${esc(one.where ?? '')} · ${esc(ago(one.began))}</span>
            </span>
            <span class="tacts">
              ${one.running ? `<button class="small danger" data-stop="${esc(one.id)}">Stop it</button>` : ''}
            </span>
          </div>`).join('')}
      </div>`
    : `<div class="card" style="color:var(--quiet)">Nothing. Another computer in your workspace
        can be allowed to run something here, and it would appear on this list while it did.</div>`}

    ${previews.windows?.length ? `
      <div class="sect"><h2>Previews still open</h2><span class="count">${previews.windows.length}</span></div>
      <div class="sheetlist">
        ${previews.windows.map((w) => `
          <div class="trow">
            <span class="dot live"></span>
            <span class="tname"><b>${esc(w.name ?? 'A preview')}</b>
              <span class="where mono">${esc(String(w.port))} · open since ${esc(ago(w.began))}</span></span>
            <span class="tacts"><button class="small" data-shut="${esc(w.at)}">Close it</button></span>
          </div>`).join('')}
      </div>` : ''}

    ${p?.name ? `
      <div class="sect"><h2>What the last build made</h2>
        <span class="count">${esc(p.name)}</span></div>
      <div class="card" style="color:${built.ok ? 'var(--ink)' : 'var(--quiet)'}">
        ${esc(built.sentence ?? 'Nothing has been built here yet.')}
        ${built.ok ? `<div class="mono" style="color:var(--faint);margin-top:.3rem">${esc(built.at)}</div>` : ''}
        ${built.ok ? '' : `<div style="margin-top:.3rem">${esc(built.action ?? '')}</div>`}
      </div>

      <div class="sect"><h2>Ways back</h2><span class="count">${back.length}</span></div>
      ${back.length ? `
        <div class="sheetlist">
          ${back.map((one) => `
            <div class="trow">
              <span class="dot off"></span>
              <span class="tname">
                <b>${esc(one.files)} file${one.files === 1 ? '' : 's'} kept</b>
                <span class="where">${esc(one.why ?? 'before something was written over')}
                  · ${esc(ago(one.at))}</span>
              </span>
              <span class="tacts"><button class="small" data-back="${esc(one.id)}">Put it back…</button></span>
            </div>`).join('')}
        </div>`
    : `<div class="card" style="color:var(--quiet)">Nothing has been written over in
        ${esc(p.name)}, so there is nothing to go back to. Anything that arrives from
        another computer is kept here first, automatically.</div>`}` : ''}
      </aside>
    </div>`;
  said = null;

  $('#act-again').onclick = () => draw();

  for (const b of document.querySelectorAll('[data-filter]')) {
    b.onclick = () => { activityFilter = b.dataset.filter; draw(); };
  }

  /*
   * Opening one to read it, which used to close itself.
   *
   * The row and the button on it both carry the mark, so pressing anywhere on
   * the row works — and the handler stops the press there, because the row is
   * inside the row. Without that, one press was counted twice and the second
   * one arrived after the first had already redrawn.
   */
  for (const b of document.querySelectorAll('[data-job-open]')) {
    b.onclick = (e) => {
      e.stopPropagation();
      watchJob(b.dataset.jobOpen);
      // Only the marks change, and only on the rows. The page is not redrawn,
      // because redrawing it is what threw the detail away.
      for (const row of document.querySelectorAll('.act-cols .trow')) {
        row.classList.toggle('on', row.dataset.jobOpen === b.dataset.jobOpen);
      }
    };
  }

  for (const b of document.querySelectorAll('[data-stop]')) {
    b.onclick = async () => {
      say(await post('/remote/stop', { session: b.dataset.stop }));
      draw();
    };
  }

  for (const b of document.querySelectorAll('[data-shut]')) {
    b.onclick = async () => {
      say(await post('/remote/preview/close', { at: b.dataset.shut }));
      draw();
    };
  }

  for (const b of document.querySelectorAll('[data-back]')) {
    b.onclick = async () => {
      // Blunt on purpose, and said so before it happens: every file it holds
      // goes over whatever is there now.
      const sure = await confirmThat({
        title: 'Put these files back?',
        what: 'Every file that was kept is written over whatever is in the project now.',
        why: 'This is the copy taken just before something wrote over them. Anything you have changed in those files since then is replaced.',
        confirm: 'Put them back',
        danger: true,
      });
      if (!sure) return;
      say(await post('/waysback/restore', { id: b.dataset.back }));
      draw();
    };
  }

  /*
   * Whatever was open stays open across a redraw.
   *
   * The same line every other screen that shows an errand has. Activity did not
   * have it, so anything that redrew the page — a filter, a stop, an errand
   * finishing elsewhere — left an empty box where the detail had been.
   */
  if (watching) return paintJob({ again: !jobTimer });
  if (running.length) watchJob(running[0].id);

  /*
   * Looking again, which is now free when nothing has changed.
   *
   * This screen used to notice a new errand only because something else
   * redrew the page. Once identical redraws stopped rebuilding anything, that
   * accident stopped happening too — and an errand started from somewhere
   * else never appeared here. So it asks on its own, and the answer costs
   * nothing at all unless there is something new to say.
   */
  clearTimeout(activityTimer);
  activityTimer = setTimeout(() => {
    if (at.tab === 'activity' && !layer.innerHTML) draw({ quietly: true });
  }, 3000);
};


/** What a kind of errand is called, in words. */
const kindCalled = (id) => JOB_KINDS.find((k) => k.id === id)?.name ?? id ?? 'Other';

/** Which part of Settings is being looked at. Kept between redraws. */
let settingsPlace = 'accounts';

/**
 * Which project is being looked at inside the workspace, and which person.
 *
 * Kept between redraws so a change arriving from another computer does not
 * throw away what somebody had selected. That is the whole reason it lives out
 * here rather than inside the screen.
 */
/**
 * Workspace has two product levels, plus one deliberately subordinate legacy
 * page. A membership may stay active for discovery while this remains `home`;
 * navigation and peer state are related, but they are not the same state.
 */
let workspacePlace = 'home'; // home | inside | legacy
let lookingAtProject = null;
let lookingAtPerson = null;
let lookingAtDevice = null;

/**
 * The workspace, as the place work actually happens.
 *
 * Three columns, because there are three questions and they are asked in this
 * order: who is here, what are we working on, and what about the thing I just
 * pressed. The list of computers used to be the whole page, which answered the
 * first question three times and the other two never.
 *
 * Projects come first among equals. Computers are how a project has more than
 * one copy; they are not the point.
 */
/**
 * How a project stands, as one word and one colour.
 *
 * Four states and no more. Every extra one is a thing somebody has to learn
 * the meaning of before they can read the screen at a glance, which is the
 * whole job this screen has.
 */
const PROJECT_STATE = {
  CHANGES_AVAILABLE: { says: 'Changes waiting', tone: 'attention' },
  UP_TO_DATE: { says: 'Up to date', tone: 'good' },
  ONLY_HERE: { says: 'Only on this computer', tone: 'quiet' },
  ONLY_THEIRS: { says: 'Not on this computer', tone: 'quiet' },
};

/** What one computer said it did to a project, in the fewest words that carry it. */
function changeInWords(c) {
  const bits = [
    c.added ? `${c.added} added` : null,
    c.modified ? `${c.modified} rewritten` : null,
    c.gone ? `${c.gone} gone` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' \u00b7 ') : null;
}

/** Offers from reachable member computers, read from the existing peer registry. */
async function workspaceHomeState(t) {
  if (!t.workspace) return { projects: [], offers: [], failed: 0 };

  const shared = await get('/team/projects').catch(() => ({ projects: [] }));
  const projects = shared.projects ?? [];
  const copiesHere = new Set(projects.filter((p) => p.mine).map((p) => p.name.toLowerCase()));
  const devices = [...(t.mine ?? []), ...(t.team ?? [])].filter((one) => !one.you && one.online);
  let failed = 0;

  const answers = await Promise.all(devices.map(async (one) => {
    const said = await get(`/local/offers?machine=${encodeURIComponent(one.deviceId)}`).catch(() => null);
    if (!said?.ok) { failed += 1; return []; }
    return (said.offers ?? []).map((offer) => ({
      ...offer,
      deviceId: one.deviceId,
      device: one.displayName,
      person: one.person ?? one.displayName,
      how: one.how,
      haveCopy: offer.kind === 'file' ? null : copiesHere.has(String(offer.name).toLowerCase()),
    }));
  }));

  return { projects, offers: answers.flat(), failed };
}

/** Bring one real offer over using the transfer path already used by inspectors. */
async function receiveWorkspaceOffer(one, workFolder) {
  const into = await pickFolder({
    title: `Where should ${one.name} go on this computer?`,
    confirm: 'Put it in here',
    startAt: workFolder,
  });
  if (!into) return;

  const started = await post('/local/take', {
    machine: one.deviceId, offer: one.id, name: one.name, into,
  });
  if (started.ok) watchJob(started.job); else { say(started); draw(); }
}

/** Inspect an offer without creating a second representation of it. */
function inspectWorkspaceOffer(one, workFolder) {
  inspect({
    name: one.name,
    kind: `${one.kind === 'file' ? 'File' : 'Folder'} shared with you`,
    mark: KIND_MARK[one.kind === 'file' ? 'file' : 'project'],
    facts: [
      { label: 'Offered by', value: `${one.person} on ${one.device}` },
      { label: 'Reachable', value: one.how || 'Yes' },
      { label: 'Contents', value: one.files ? `${one.files} file${one.files === 1 ? '' : 's'}` : null },
      { label: 'Size', value: one.bytes ? size(one.bytes) : null },
      { label: 'On this computer', value: one.haveCopy === null ? null : (one.haveCopy ? 'A copy is already here' : 'No copy here yet') },
    ],
    acts: [{ what: one.haveCopy ? 'Receive another copy…' : 'Receive…', run: () => receiveWorkspaceOffer(one, workFolder) }],
  });
}

/**
 * The collaboration hub. It is always the destination of the main rail item;
 * opening, making, or joining is the only way from here into a workspace.
 */
async function drawWorkspaceHome() {
  clearTimeout(workspaceTimer);
  const [device, t, recentActivity] = await Promise.all([get('/me/device'), get('/team'), get('/team/activity')]);
  const state = await workspaceHomeState(t);
  const all = device.all ?? [];
  const everybody = [...(t.mine ?? []), ...(t.team ?? [])];
  const people = new Map();
  for (const one of everybody) {
    const name = one.person || one.displayName;
    if (!people.has(name)) people.set(name, { name, devices: [], you: false });
    people.get(name).devices.push(one);
    people.get(name).you ||= one.you;
  }
  const here = everybody.filter((one) => one.online).length;

  const workspaceCards = all.map((one) => {
    const current = one.id === device.workspace?.id;
    return `
      <article class="wshome-workspace ${current ? 'current' : ''}">
        <div class="workspace-card-top">
          <span class="workspace-orbit" aria-hidden="true"><span></span></span>
          ${current ? '<span class="chip live">Reachable</span>' : '<span class="chip">Known</span>'}
        </div>
        <span class="grow">
          <b>${esc(one.name)}</b>
          <span>${current
    ? `${people.size} ${people.size === 1 ? 'person' : 'people'} \u00b7 ${everybody.length} computer${everybody.length === 1 ? '' : 's'}`
    : 'Open to check its people and shared projects'}</span>
        </span>
        <button class="${current ? 'go' : 'quiet'} small workspace-open" data-open-workspace="${esc(one.id)}">Open workspace <span aria-hidden="true">\u2192</span></button>
      </article>`;
  }).join('');

  const shareRows = state.offers.map((one, index) => `
    <div class="wshome-share" data-home-share="${index}">
      <span class="kindmark" aria-hidden="true">${KIND_MARK[one.kind === 'file' ? 'file' : 'project']}</span>
      <span class="grow">
        <b>${esc(one.name)}</b>
        <span>${esc(one.person)} \u00b7 ${esc(one.device)}${one.files ? ` \u00b7 ${one.files} files` : ''}${one.bytes ? ` \u00b7 ${esc(size(one.bytes))}` : ''}</span>
      </span>
      <span class="share-state"><span class="dot live"></span>${esc(one.how || 'Reachable')}</span>
      ${one.haveCopy === true ? '<span class="chip">Copy here</span>' : ''}
      <button class="small" data-receive-share="${index}">${one.haveCopy ? 'Receive another…' : 'Receive…'}</button>
    </div>`).join('');

  const peopleRows = [...people.values()].sort((a, b) => Number(b.you) - Number(a.you)).map((who) => {
    const online = who.devices.filter((one) => one.online).length;
    return `
      <div class="wshome-person">
        <div class="wshome-person-head">
          <span class="person-avatar">${esc(who.name.slice(0, 1).toUpperCase())}</span>
          <span class="grow"><b>${esc(who.name)}</b><span>${online
    ? `${online} of ${who.devices.length} computers reachable`
    : `${who.devices.length} computer${who.devices.length === 1 ? '' : 's'} offline`}</span></span>
          ${who.you ? '<span class="chip vibe">you</span>' : ''}
        </div>
        <div class="wshome-devices">${who.devices.map((one) => `
          <div class="wshome-device">
            <span class="dot ${one.online ? 'live' : 'off'}"></span>
            <span class="grow"><b>${esc(one.displayName)}</b><span>${one.online ? esc(one.how || 'Reachable') : esc(ago(one.lastHere))}</span></span>
          </div>`).join('')}</div>
      </div>`;
  }).join('');

  view.innerHTML = `
    <div class="ref-wshome">
      <header class="ref-pagehead">
        <div class="grow">
          <h1>Workspace Home</h1>
          <p>Your central hub for workspaces, people, devices, and shared resources.</p>
        </div>
        <div class="acts">
          <button class="small" id="home-join">Join workspace</button>
          <button class="go" id="home-create">Create workspace</button>
        </div>
      </header>
      ${saidHtml()}

      <section class="ref-panel ref-workspace-carousel">
        <div class="ref-panel-head"><div><h2>Your Workspaces</h2><span class="eyebrow">${all.length} available on this computer</span></div><button class="quiet small" id="home-view-all">View all</button></div>
        <div class="wshome-carousel">
          <button class="wshome-action-card" id="home-create-card">
            <span class="action-mark">+</span><b>Create workspace</b><span>Start a new collaboration space</span>
          </button>
          <button class="wshome-action-card" id="home-join-card">
            <span class="action-mark">\u21c4</span><b>Join with code</b><span>Use an invitation from somebody</span>
          </button>
          ${workspaceCards || `
            <div class="wshome-empty"><b>No workspaces on this computer yet.</b>
              <span>Create one for a new group, or join with a code somebody sent you.</span></div>`}
        </div>
      </section>

      <div class="ref-wshome-layout">
        <main>
          <section class="ref-panel ref-member-directory">
            <div class="ref-directory-head"><div><h2>Members & Devices</h2><div class="ref-directory-tabs"><button class="on">People <span>${people.size}</span></button><button>Devices <span>${everybody.length}</span></button></div></div><label class="find"><span>⌕</span><input id="workspace-member-search" placeholder="Search members or devices…"></label></div>
            <div class="ref-member-list">${[...people.values()].sort((a,b)=>Number(b.you)-Number(a.you)).map((who,index)=>{
    const online=who.devices.filter((one)=>one.online).length;
    const offered=state.offers.filter((one)=>who.devices.some((deviceOne)=>deviceOne.deviceId===one.deviceId));
    return `<article class="ref-member ${index===0?'expanded':''}" data-member-search="${esc(`${who.name} ${who.devices.map((one)=>one.displayName).join(' ')}`.toLowerCase())}">
      <div class="ref-member-head"><span class="person-avatar">${esc(who.name.slice(0,1).toUpperCase())}</span><span class="grow"><b>${esc(who.name)}${who.you?' <small>(You)</small>':''}</b><small><span class="dot ${online?'live':'off'}"></span>${online?`${online} computer${online===1?'':'s'} online`:'Offline'}</small></span>${who.you?'<span class="chip vibe">Owner</span>':''}<span>⌄</span></div>
      <div class="ref-member-devices">${who.devices.map((one)=>`<div class="ref-member-device"><span class="device-mark">▣</span><span class="grow"><b>${esc(one.displayName)}</b><small>${one.online?esc(one.how||'Reachable'):esc(ago(one.lastHere))}</small></span><span class="share-state"><span class="dot ${one.online?'live':'off'}"></span>${one.online?'Online':'Offline'}</span></div>`).join('')}
        ${offered.length?`<div class="ref-member-offers"><span class="eyebrow">Available from these computers</span>${offered.map((one)=>{const index=state.offers.indexOf(one);return `<div class="ref-member-offer" data-home-share="${index}"><span class="kindmark">${KIND_MARK[one.kind==='file'?'file':'project']}</span><span class="grow"><b>${esc(one.name)}</b><small>${esc(one.device)}${one.files?` · ${one.files} files`:''}${one.bytes?` · ${esc(size(one.bytes))}`:''}</small></span><button class="small" data-receive-share="${index}">${one.haveCopy?'Another copy':'Bring here'}</button></div>`}).join('')}</div>`:''}
      </div></article>`}).join('')||'<div class="empty compact"><b>No members yet.</b>Create or join a workspace to see people here.</div>'}</div>
          </section>

          <section class="ref-panel ref-shared-home">
            <div class="ref-panel-head"><div><span class="eyebrow">Available now</span><h2>Shared with you</h2></div><span class="count">${state.offers.length}</span></div>
            <div class="wshome-list">${shareRows||`<div class="wshome-empty"><b>${t.workspace?'Nothing is being offered by another reachable computer.':'Open or join a workspace to see what other computers offer.'}</b><span>${t.workspace?'This updates as member computers appear and disappear.':'Offers remain on the computer sharing them until you ask for a copy.'}</span></div>`}</div>
            ${state.failed?`<p class="home-note">${state.failed} reachable computer${state.failed===1?'':'s'} could not answer just now.</p>`:''}
          </section>
        </main>

        <aside class="ref-wshome-side">
          <div class="ref-wshome-topcards">
          <section class="ref-panel ref-workspace-actions">
            <span class="eyebrow">Quick Actions</span>
            <button id="home-quick-invite" ${t.workspace?'':'disabled'}>Invite people <span>→</span></button>
            <button id="home-quick-offer" ${t.workspace?'':'disabled'}>Share a project <span>→</span></button>
            <button id="home-quick-manage" ${t.workspace?'':'disabled'}>Manage workspace <span>→</span></button>
          </section>
          <section class="ref-panel wshome-overview">
            <span class="eyebrow">Workspace Overview</span><div class="ref-workspace-name"><span class="workspace-monogram">${esc((t.workspace?.name??'--').slice(0,2).toUpperCase())}</span><h3>${esc(t.workspace?.name ?? 'No workspace open')}</h3></div>
            <div class="wshome-stats">
              <span><b>${people.size}</b><small>people</small></span>
              <span><b>${everybody.length}</b><small>computers</small></span>
              <span><b>${state.projects.length}</b><small>projects</small></span>
            </div>
            <p><span class="dot ${here ? 'live' : 'off'}"></span>${here} of ${everybody.length} computers reachable</p>
          </section>
          </div>
          <section class="ref-panel ref-workspace-activity">
            <div class="ref-panel-head"><div><h2>Recent Activity</h2><span class="eyebrow">Only meaningful collaboration events</span></div><button class="quiet small" id="home-activity-all">View all</button></div>
            <div class="ref-activity-list">${(recentActivity.activity??[]).slice(0,6).map((one)=>`<div><span class="dot ${/failed|could not/i.test(one.sentence)?'attention':'off'}"></span><span class="grow"><b>${esc(one.sentence)}</b><small>${esc(ago(one.at))}</small></span></div>`).join('')||'<p>Workspace activity will appear here.</p>'}</div>
          </section>
          <section class="ref-panel ref-workspace-enter">
            <span class="eyebrow">Collaboration</span><h2>${t.workspace?'Open the workspace to chat and work together.':'Choose a workspace above to begin.'}</h2><p>${t.workspace?'Membership stays intact when you return to this Home screen.':'Create one or join with an invitation code.'}</p>
            ${t.workspace?`<button class="go wide" id="home-open-active">Open ${esc(t.workspace.name)} →</button>`:''}
            <button class="quiet wide" id="home-legacy">Your own computers through GitHub</button>
          </section>
        </aside>
      </div>
    </div>`;
  said = null;

  $('#home-create').onclick = makeWorkspace;
  $('#home-join').onclick = joinWorkspace;
  $('#home-create-card').onclick = makeWorkspace;
  $('#home-join-card').onclick = joinWorkspace;
  $('#home-quick-invite')?.addEventListener('click', inviteSomebody);
  $('#home-quick-offer')?.addEventListener('click', offerSomething);
  $('#home-quick-manage')?.addEventListener('click', () => manageWorkspace(t));
  $('#home-activity-all')?.addEventListener('click', () => go('activity'));
  $('#home-legacy').onclick = () => { workspacePlace = 'legacy'; draw(); };
  $('#home-view-all').onclick = () => document.querySelector('.wshome-carousel')?.scrollTo({ left: 9999, behavior: 'smooth' });
  $('#home-open-active')?.addEventListener('click', async () => {
    workspacePlace = 'inside'; lookingAtProject = null; await draw();
  });
  const memberSearch = $('#workspace-member-search');
  if (memberSearch) memberSearch.oninput = () => {
    const want = memberSearch.value.trim().toLowerCase();
    for (const row of document.querySelectorAll('[data-member-search]')) row.hidden = !!want && !row.dataset.memberSearch.includes(want);
  };
  for (const button of document.querySelectorAll('[data-open-workspace]')) {
    button.onclick = async () => {
      button.disabled = true;
      const opened = await post('/team/open', { workspace: button.dataset.openWorkspace });
      if (!opened.ok) { say(opened); return draw(); }
      workspacePlace = 'inside';
      lookingAtProject = null;
      (view.closest('main') || view).scrollTop = 0;
      await draw();
    };
  }
  for (const row of document.querySelectorAll('[data-home-share]')) {
    row.onclick = () => inspectWorkspaceOffer(state.offers[Number(row.dataset.homeShare)], t.workFolder);
  }
  for (const button of document.querySelectorAll('[data-receive-share]')) {
    button.onclick = (event) => {
      event.stopPropagation();
      receiveWorkspaceOffer(state.offers[Number(button.dataset.receiveShare)], t.workFolder);
    };
  }

  workspaceTimer = setTimeout(() => {
    if (at.tab === 'workspace' && workspacePlace === 'home' && !layer.innerHTML) draw({ quietly: true });
  }, 10000);
}

/**
 * The workspace, as the place work actually happens.
 *
 * Two columns and the inspector the shell already has, which makes three, and
 * they are three questions in the order somebody asks them: who is here, what
 * are we working on, and what about the thing I just pressed.
 *
 * **Projects come first among equals.** Computers are how a project comes to
 * have more than one copy; they are not the point. The version of this screen
 * that listed computers answered the least interesting of the three questions
 * three times over and the other two never.
 */
/**
 * The workspace, which is the screen rather than something behind a button on it.
 *
 * **This was a door, and that was the mistake.** The page somebody landed on
 * was a long column about the plumbing \u2014 which GitHub account the older
 * workspace was made on, which computers are signed in to it, what this one is
 * offering, a note box — with the room itself behind an *Enter workspace*
 * button most people never pressed. Everything worth having was one press away
 * and looked like it did not exist.
 *
 * So the room is the screen. Three columns, and they are three questions asked
 * in this order: who is here, what are we working on, and what about the thing
 * I just pressed. The plumbing is still reachable and is now folded away at the
 * bottom of the left column, where infrastructure belongs.
 */
function workspaceRoomReference({ t, registry, people, everybody, projects, here, hereNow, waiting, mineToShare, relevantOffers, workspaceActivity }) {
  const workspaces = registry.all ?? [];
  const allBytes = mineToShare.reduce((total, one) => total + (one.bytes ?? 0), 0);
  return `
    <div class="ref-room">
      <aside class="ref-room-rail">
        <div class="ref-room-rail-head"><span>Workspaces</span><button class="quiet icon" id="ws-room-join" aria-label="Join workspace">＋</button></div>
        <div class="ref-room-workspaces">${workspaces.map((one) => `<button class="${one.id === t.workspace.id ? 'on' : ''}" data-room-workspace="${esc(one.id)}"><span class="workspace-monogram">${esc(one.name.slice(0,2).toUpperCase())}</span><span class="grow"><b>${esc(one.name)}</b><small>${one.id === t.workspace.id ? `${people.size} members · ${hereNow} online` : 'Open workspace'}</small></span></button>`).join('')}</div>
        <button class="ref-room-join" id="ws-room-join-link">＋ Join Workspace</button>
        <div class="ref-room-connection"><span><span class="dot ${hereNow ? 'live' : 'off'}"></span>${hereNow ? 'Online' : 'Offline'}</span><small>${hereNow ? 'Connected to the workspace' : 'Waiting for another computer'}</small></div>
      </aside>

      <main class="ref-room-main">
        <header class="ref-room-head">
          <button class="backlink" id="ws-back">← Workspaces</button>
          <div class="ref-room-identity"><span class="workspace-monogram">${esc(t.workspace.name.slice(0,2).toUpperCase())}</span><div class="grow"><div><h1>${esc(t.workspace.name)}</h1><span class="chip ${waiting ? 'attention' : 'live'}">${waiting ? `${waiting} waiting` : 'Up to date'}</span></div><p>Workspace · ${people.size} member${people.size === 1 ? '' : 's'} · ${hereNow} online</p></div><div class="acts">${t.mayManage ? '<button id="ws-invite">Invite</button>' : ''}<button class="go" id="ws-offer">Share project</button><button class="quiet icon" id="ws-manage" aria-label="Workspace actions">⋯</button></div></div>
          <nav class="ref-room-tabs"><button class="on" data-room-scroll="room-overview">Overview</button><button data-room-scroll="room-people">People</button><button data-room-scroll="room-projects">Projects</button><button data-room-scroll="room-chat">Chat</button><button data-room-scroll="room-activity">Activity</button><button id="ws-settings-tab">Settings</button></nav>
        </header>
        ${saidHtml()}

        <section class="ref-room-summary" id="room-overview"><div><span class="summary-mark">${SUM_MARK.computers}</span><span><small>Members</small><b>${people.size}</b><em>${hereNow} online</em></span></div><div><span class="summary-mark">${SUM_MARK.project}</span><span><small>Projects</small><b>${projects.length}</b><em>${waiting ? `${waiting} need attention` : 'Up to date'}</em></span></div><div><span class="summary-mark">${SUM_MARK.pulse}</span><span><small>Activity</small><b>${(workspaceActivity.activity ?? []).length}</b><em>Recent events</em></span></div><div><span class="summary-mark">▣</span><span><small>Shared total</small><b>${allBytes ? esc(size(allBytes)) : '—'}</b><em>${mineToShare.length} item${mineToShare.length === 1 ? '' : 's'}</em></span></div></section>

        <div class="ref-room-overview-grid">
          <section class="ref-panel ref-room-activity" id="room-activity"><div class="ref-panel-head"><h2>Recent Activity</h2><button class="quiet small" id="ws-activity-all">View all</button></div><div>${(workspaceActivity.activity ?? []).slice(0,7).map((one) => `<div class="ref-room-event"><span class="dot ${/failed|could not/i.test(one.sentence) ? 'attention' : 'off'}"></span><span class="grow"><b>${esc(one.sentence)}</b><small>${esc(ago(one.at))}</small></span></div>`).join('') || '<p class="quiet">Nothing meaningful has happened here yet.</p>'}</div><footer><span class="dot ${waiting ? 'attention' : 'live'}"></span>${waiting ? 'Some projects need attention' : 'Workspace is up to date'}</footer></section>
          <section class="ref-panel ref-room-projects" id="room-projects"><div class="ref-panel-head"><h2>Workspace Projects</h2><button class="small" id="ws-offer-project">New project</button></div><div>${projects.map((one) => { const state = PROJECT_STATE[one.state] ?? PROJECT_STATE.ONLY_HERE; return `<button class="${one.name === here?.name ? 'on' : ''}" data-wsproject="${esc(one.name)}"><span class="project-mini-mark">${KIND_MARK.project}</span><span class="grow"><b>${esc(one.name)}</b><small>${one.mine?.path ? esc(shortPath(one.mine.path)) : `${one.copies.length} copies`}</small></span><span class="share-state"><span class="dot ${state.tone === 'attention' ? 'attention' : state.tone === 'good' ? 'live' : 'off'}"></span>${esc(state.says)}</span><span>⋮</span></button>`; }).join('') || '<div class="empty compact"><b>No shared project yet.</b></div>'}</div></section>
        </div>

        <section class="ref-room-project-detail">${here ? projectInWorkspace(here) : `<div class="empty"><b>No shared project yet.</b><button class="go" id="ws-offer-empty">Offer a folder…</button></div>`}</section>

        <section class="ref-panel ref-room-sharing"><div class="ref-panel-head"><div><h2>Available from other computers</h2><span class="eyebrow">Live offers in this workspace</span></div><span class="count">${relevantOffers.length}</span></div><div class="ref-room-offers">${relevantOffers.slice(0,6).map((one,index) => `<div data-inside-offer="${index}"><span class="kindmark">${KIND_MARK[one.kind === 'file' ? 'file' : 'project']}</span><span class="grow"><b>${esc(one.name)}</b><small>${esc(one.person)} · ${esc(one.device)}${one.files ? ` · ${one.files} files` : ''}</small></span><button class="small" data-inside-receive="${index}">${one.haveCopy ? 'Another copy' : 'Bring here'}</button></div>`).join('') || '<div class="empty compact">No reachable computer is offering anything right now.</div>'}</div></section>
        <aside class="wscontext" id="ws-context" aria-label="Workspace context" hidden></aside>
      </main>

      <aside class="ref-room-right">
        <section class="ref-room-people" id="room-people"><div class="ref-room-right-head"><h2>People (${people.size})</h2>${t.mayManage ? '<button class="quiet icon" id="ws-invite-person" aria-label="Invite people">＋</button>' : ''}</div><div>${[...people.values()].sort((a,b)=>Number(b.you)-Number(a.you)).map((who) => { const online = who.devices.filter((one)=>one.online).length; return `<div class="wsperson" data-person="${esc(who.person)}"><button class="who"><span class="person-avatar">${esc(who.person.slice(0,1).toUpperCase())}</span><span class="grow"><b>${esc(who.person)}${who.you ? ' (You)' : ''}</b><small><span class="dot ${online ? 'live' : 'off'}"></span>${online ? 'Online' : 'Offline'}</small></span>${who.you ? '<span class="chip vibe">Owner</span>' : ''}</button>${who.devices.map((d)=>`<button class="wsdevice" data-wsdevice="${esc(d.deviceId)}"><span class="dot ${d.online ? 'live' : 'off'}"></span><span>${esc(d.displayName)}</span></button>`).join('')}</div>`; }).join('')}</div></section>
        <section class="ref-room-chat" id="room-chat"><div class="ref-room-right-head"><div><h2>Workspace Chat</h2><small><span class="dot ${hereNow ? 'live' : 'off'}"></span>${hereNow} online</small></div><span class="count" id="general-count"></span></div><div class="wsgeneral" id="wsnotes"></div></section>
        <section class="ref-room-danger"><button class="quiet" id="ws-leave">Leave Workspace</button>${t.mayManage ? '<button class="danger" id="ws-delete">Delete Workspace</button>' : ''}<button class="quiet" id="ws-github">GitHub sharing</button></section>
      </aside>
    </div>`;
}

SCREENS.workspace = async () => {
  if (workspacePlace === 'home') return drawWorkspaceHome();
  if (workspacePlace === 'legacy') return drawLegacyWorkspace();
  const t = await get('/team');
  if (!t.workspace) { workspacePlace = 'home'; return drawWorkspaceHome(); }

  const [shared, offers, workspaceActivity, available, registry] = await Promise.all([
    get('/team/projects'), get('/local/offers'), get('/team/activity'), workspaceHomeState(t), get('/me/device'),
  ]);

  const everybody = [...(t.mine ?? []), ...(t.team ?? [])];
  const people = new Map();
  for (const one of everybody) {
    const who = one.person || one.displayName;
    if (!people.has(who)) people.set(who, { person: who, devices: [], you: false });
    people.get(who).devices.push(one);
    people.get(who).you ||= one.you;
  }

  const projects = shared.projects ?? [];
  const here = projects.find((one) => one.name === lookingAtProject) ?? projects[0] ?? null;
  lookingAtProject = here?.name ?? null;

  const hereNow = everybody.filter((one) => one.online).length;
  const waiting = shared.needsAttention ?? 0;
  const mineToShare = offers?.offers ?? [];
  const devicesForPerson = lookingAtPerson && people.has(lookingAtPerson)
    ? new Set(people.get(lookingAtPerson).devices.map((one) => one.deviceId)) : null;
  const relevantOffers = (available.offers ?? []).filter((one) => (
    lookingAtDevice ? one.deviceId === lookingAtDevice
      : devicesForPerson ? devicesForPerson.has(one.deviceId) : true
  ));

  view.innerHTML = `
    <div class="wscrumb"><button class="wsback" id="ws-back">\u2190 Back to Workspaces</button></div>
    <div class="wshead">
      <div class="wsidentity grow">
        <div class="workspace-monogram" aria-hidden="true">${esc(t.workspace.name.slice(0, 2).toUpperCase())}</div>
        <div class="grow"><span class="eyebrow">Workspace</span><h1>${esc(t.workspace.name)}</h1>
          <span class="workspace-id">${esc(t.workspace.id ?? '')}</span></div>
        <span class="chip ${waiting ? 'attention' : ''}">${waiting
    ? `${waiting} ${waiting === 1 ? 'project needs' : 'projects need'} attention`
    : 'Everything up to date'}</span>
      </div>
      <div class="wsfacts">
        <span><b>${hereNow}</b> of ${everybody.length} here</span>
        <span><b>${projects.length}</b> shared</span>
      </div>
      <div class="acts">
        ${t.mayManage ? '<button class="small" id="ws-invite">Invite people</button>' : ''}
        <button class="small" id="ws-offer">Add shared project</button>
        <button class="small" id="ws-leave">Leave Workspace</button>
        ${t.mayManage ? '<button class="danger small" id="ws-delete">Delete Workspace</button>' : ''}
        <button class="quiet small icon" id="ws-manage" data-tip="Workspace settings" aria-label="Workspace settings">\u22ef</button>
      </div>
    </div>
    ${saidHtml()}

    <div class="wsenv">
      <div class="side">
        <div class="label-tiny">People <span class="count">${people.size}</span></div>
        ${[...people.values()].sort((a, b) => Number(b.you) - Number(a.you)).map((who) => {
    const on = who.devices.filter((d) => d.online).length;
    const busy = shared.doing?.[who.person] ?? null;
    const what = busy ? changeInWords(busy) : null;
    return `
          <div class="wsperson ${who.person === lookingAtPerson ? 'on' : ''}" data-person="${esc(who.person)}">
            <button class="who">
              <span class="dot ${on ? 'live' : 'off'}"></span>
              <span class="grow">
                <b>${esc(who.person)}</b>
                ${busy ? `<span class="doing">In ${esc(busy.project)}${
  what ? ` \u00b7 ${esc(what)}` : ''} \u00b7 ${esc(ago(busy.at))}</span>`
    : '<span class="doing quiet">Nothing shared lately</span>'}
              </span>
              ${who.you ? '<span class="chip vibe">you</span>' : ''}
            </button>
            ${who.devices.map((d) => `
              <button class="wsdevice ${d.online ? '' : 'away'}" data-wsdevice="${esc(d.deviceId)}">
                <span class="dot ${d.online ? 'live' : 'off'}"></span>
                <span class="grow">${esc(d.displayName)}</span>
                <span class="how">${esc(d.online ? d.how : ago(d.lastHere))}</span>
              </button>`).join('')}
          </div>`;
  }).join('')}

        <div class="label-tiny stacked">Shared projects <span class="count">${projects.length}</span></div>
        ${projects.length ? projects.map((one) => {
    const state = PROJECT_STATE[one.state] ?? PROJECT_STATE.ONLY_HERE;
    return `
          <button class="wsproject ${one.name === lookingAtProject ? 'on' : ''}" data-wsproject="${esc(one.name)}">
            <span class="dot ${state.tone === 'attention' ? 'attention' : state.tone === 'good' ? 'live' : 'off'}"></span>
            <span class="grow">
              <b>${esc(one.name)}</b>
              <span class="where">${esc(state.says)} \u00b7 ${one.copies.length} cop${one.copies.length === 1 ? 'y' : 'ies'}</span>
            </span>
          </button>`;
  }).join('')
    : `<div class="empty small"><b>Nothing shared yet.</b>
        A project is here because somebody offered it.</div>`}

        <div class="label-tiny stacked">Recent activity
          <span class="count">${(workspaceActivity.activity ?? []).length}</span></div>
        <div class="wsrail-activity">${(workspaceActivity.activity ?? []).slice(0, 5).map((one) => `
          <button data-workspace-activity>
            <span class="dot ${/failed|could not/i.test(one.sentence) ? 'attention' : 'off'}"></span>
            <span class="grow"><b>${esc(one.sentence)}</b><small>${esc(ago(one.at))}</small></span>
          </button>`).join('') || '<span class="quiet">Nothing meaningful has happened here yet.</span>'}</div>

        <!--
          What this computer is putting up, where somebody can see it and take
          it down again. It used to be a section of its own halfway down a page
          about the network; it belongs beside the people it is being offered to.
        -->
        <div class="label-tiny stacked">You are sharing
          <span class="count">${mineToShare.length}</span></div>
        ${mineToShare.length ? mineToShare.map((one) => `
          <div class="wsmine">
            <span class="kindmark" aria-hidden="true">${KIND_MARK[one.kind === 'file' ? 'file' : 'project']}</span>
            <span class="grow">
              <b>${esc(one.name)}</b>
              <span class="where">${one.kind === 'file' ? 'File' : 'Project'}${
  one.files > 1 ? ` \u00b7 ${one.files} files` : ''}${one.bytes ? ` \u00b7 ${esc(size(one.bytes))}` : ''}</span>
            </span>
            <button class="quiet small icon" data-stop-offer="${esc(one.id)}"
              data-tip="Stop offering ${esc(one.name)}" aria-label="Stop offering ${esc(one.name)}">\u00d7</button>
          </div>`).join('')
    : `<div class="empty small"><b>You are not offering anything.</b>
        Offer a file or a folder and everybody here can ask for a copy.</div>`}

        <div class="label-tiny stacked">${lookingAtDevice || lookingAtPerson ? 'Sharing from this selection' : 'Available from others'}
          <span class="count">${relevantOffers.length}</span></div>
        ${relevantOffers.length ? relevantOffers.slice(0, 6).map((one, index) => `
          <div class="wsmine wsremote" data-inside-offer="${index}">
            <span class="kindmark" aria-hidden="true">${KIND_MARK[one.kind === 'file' ? 'file' : 'project']}</span>
            <span class="grow"><b>${esc(one.name)}</b>
              <span class="where">${esc(one.person)} \u00b7 ${esc(one.device)}${one.files ? ` \u00b7 ${one.files} files` : ''}</span></span>
            <button class="quiet small" data-inside-receive="${index}">${one.haveCopy ? 'Another copy' : 'Bring here'}</button>
          </div>`).join('')
    : '<div class="empty small"><b>No reachable computer is offering anything here.</b></div>'}

        <details class="wsmore plumbing">
          <summary>Your own computers, through GitHub</summary>
          <div class="acts" style="padding-bottom:var(--s3)">
            <button class="quiet small" id="ws-github">Open that page</button>
          </div>
        </details>
      </div>

      <div class="middle">
        ${here ? projectInWorkspace(here) : `
          <div class="empty"><b>No shared project yet.</b>
            Offer a folder and it becomes something everybody here can have a copy of.
            <span class="acts"><button class="go" id="ws-offer-empty">Offer a folder\u2026</button></span></div>`}

        <div class="wschat-head"><div><span class="eyebrow">Everyone here</span><h2>General chat</h2></div>
          <span class="count" id="general-count"></span></div>
        <div class="wsgeneral" id="wsnotes"></div>
      </div>

      <aside class="wscontext" id="ws-context" aria-label="Workspace context"></aside>
    </div>`;
  view.innerHTML = workspaceRoomReference({ t, registry, people, everybody, projects, here, hereNow, waiting, mineToShare, relevantOffers, workspaceActivity });
  said = null;

  $('#ws-back').onclick = () => {
    workspacePlace = 'home';
    lookingAtProject = null;
    lookingAtPerson = null;
    lookingAtDevice = null;
    closeInspector();
    (view.closest('main') || view).scrollTop = 0;
    draw();
  };
  $('#ws-invite')?.addEventListener('click', inviteSomebody);
  $('#ws-invite-person')?.addEventListener('click', inviteSomebody);
  $('#ws-manage')?.addEventListener('click', () => manageWorkspace(t));
  $('#ws-settings-tab')?.addEventListener('click', () => manageWorkspace(t));
  $('#ws-leave')?.addEventListener('click', () => leaveWorkspace(t));
  $('#ws-delete')?.addEventListener('click', () => deleteWorkspace(t));
  for (const b of [$('#ws-offer'), $('#ws-offer-empty'), $('#ws-offer-project')]) b?.addEventListener('click', offerSomething);
  $('#ws-github')?.addEventListener('click', () => { workspacePlace = 'legacy'; draw(); });
  $('#ws-activity-all')?.addEventListener('click', () => go('activity'));
  $('#ws-room-join')?.addEventListener('click', joinWorkspace);
  $('#ws-room-join-link')?.addEventListener('click', joinWorkspace);
  for (const b of document.querySelectorAll('[data-room-scroll]')) b.onclick = () => document.getElementById(b.dataset.roomScroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  for (const b of document.querySelectorAll('[data-room-workspace]')) b.onclick = async () => {
    if (b.classList.contains('on')) return;
    const opened = await post('/team/open', { workspace: b.dataset.roomWorkspace });
    if (!opened.ok) { say(opened); return draw(); }
    lookingAtProject = null; lookingAtPerson = null; lookingAtDevice = null; await draw();
  };

  for (const b of document.querySelectorAll('[data-stop-offer]')) {
    b.onclick = async () => {
      b.disabled = true;
      say(await post('/local/withdraw', { id: b.dataset.stopOffer }));
      draw();
    };
  }
  for (const row of document.querySelectorAll('[data-inside-offer]')) {
    row.onclick = () => inspectWorkspaceOffer(relevantOffers[Number(row.dataset.insideOffer)], t.workFolder);
  }
  for (const button of document.querySelectorAll('[data-inside-receive]')) {
    button.onclick = (event) => {
      event.stopPropagation();
      receiveWorkspaceOffer(relevantOffers[Number(button.dataset.insideReceive)], t.workFolder);
    };
  }

  for (const b of document.querySelectorAll('[data-wsproject]')) {
    b.onclick = async () => {
      lookingAtProject = b.dataset.wsproject;
      lookingAtPerson = null;
      lookingAtDevice = null;
      await draw({ quietly: true });
      inspectSharedProject(projects.find((one) => one.name === lookingAtProject));
    };
  }
  for (const b of document.querySelectorAll('.wsperson > .who')) {
    b.onclick = () => {
      const who = b.parentElement.dataset.person;
      lookingAtPerson = who;
      lookingAtDevice = null;
      inspectPerson(people.get(who), projects, shared.doing?.[who] ?? null);
    };
  }
  for (const b of document.querySelectorAll('[data-wsdevice]')) {
    b.onclick = (e) => {
      e.stopPropagation();
      lookingAtPerson = null;
      lookingAtDevice = b.dataset.wsdevice;
      inspectTeamDevice(everybody.find((d) => d.deviceId === b.dataset.wsdevice), t);
    };
  }

  wireProjectInWorkspace(here, t);
  drawWorkspaceNotes();

  /*
   * The inspector, filled rather than waiting to be. A panel that is empty
   * until somebody guesses to press something is a panel most people never see.
   */
  const chosenDevice = everybody.find((one) => one.deviceId === lookingAtDevice);
  if (chosenDevice) inspectTeamDevice(chosenDevice, t);
  else if (lookingAtPerson && people.has(lookingAtPerson)) {
    inspectPerson(people.get(lookingAtPerson), projects, shared.doing?.[lookingAtPerson] ?? null);
  } else if (here) inspectSharedProject(here);
  else inspect(null);

  /*
   * Looked at again every so often, and almost always for nothing. What is said
   * arrives on the stream; who is here does not, because going quiet is the
   * absence of a thing. The page is compared against what it last produced and
   * each box against what it is showing, so a workspace where nothing moved is
   * checked and never touched.
   */
  clearTimeout(workspaceTimer);
  workspaceTimer = setTimeout(() => { if (at.tab === 'workspace') draw({ quietly: true }); }, 10000);
};

/** Offer one file, or a whole folder — the two things there are to offer. */
function offerSomething() {
  sheet({
    title: 'Offer something to this workspace',
    narrow: true,
    body: `
      <p class="sub">Everybody in this workspace will see it and can ask for a copy.
        Nothing moves until one of them does, and it goes straight from this computer
        to theirs.</p>
      <div class="menu">
        <button class="pick" data-offer-kind="folder">
          <b>A folder</b>
          <span>A project, or anything else with files in it. Changes to it are noticed
            and said out loud.</span>
          <span class="go">\u2192</span>
        </button>
        <button class="pick" data-offer-kind="file">
          <b>One file</b>
          <span>Exactly the one you choose, and nothing around it.</span>
          <span class="go">\u2192</span>
        </button>
      </div>`,
    foot: '<button class="quiet" id="offer-no">Close</button>',
  });
  $('#offer-no').onclick = closeLayer;

  for (const b of layer.querySelectorAll('[data-offer-kind]')) {
    b.onclick = () => {
      closeLayer();
      return b.dataset.offerKind === 'file' ? offerFile() : offerFolder();
    };
  }
}

/**
 * The middle column: one project, and everything there is to do about it.
 *
 * The order is the order of the questions somebody actually has. What is this
 * and how does it stand; is anything waiting and what do I do about it; who
 * else has a copy and which of them moved; what has happened here lately.
 *
 * **It fills the column on purpose.** The version before this said the name,
 * one row, and two collapsed headings, and left two thirds of the screen
 * empty — which reads as a feature that was started and abandoned rather than
 * as a workspace with nothing wrong in it. A project with one copy and nothing
 * waiting is a perfectly ordinary state and it now says so, in words, with the
 * thing to do about it.
 */
function projectInWorkspace(p) {
  const state = PROJECT_STATE[p.state] ?? PROJECT_STATE.ONLY_HERE;
  const from = p.waitingOn ?? null;
  const what = from ? changeInWords(from) : null;
  const alone = p.copies.length === 1;

  return `
    <div class="wsproj">
      <div class="label-tiny ws-selected-label">Selected project</div>
      <div class="top">
        <span class="ws-project-mark" aria-hidden="true">${KIND_MARK.project}</span>
        <div class="grow">
          <div class="ws-project-name"><h2>${esc(p.name)}</h2><span class="chip vibe">Shared project</span></div>
          ${p.mine?.path ? `<span class="mono ws-project-path">${esc(p.mine.path)}</span>` : ''}
          <div class="facts">
            <span class="state ${esc(state.tone)}">${esc(state.says)}</span>
            ${from ? `<span>Changes from ${esc(from.person)}</span>` : '<span>No changes waiting</span>'}
          </div>
        </div>
      </div>

      <div class="ws-project-metrics">
        <span><small>Copies</small><b>${p.copies.length}</b></span>
        <span><small>Status</small><b class="${state.tone}">${esc(state.says)}</b></span>
        <span><small>Size here</small><b>${p.mine?.bytes ? esc(size(p.mine.bytes)) : '\u2014'}</b></span>
        <span><small>Files here</small><b>${p.mine?.files ?? '\u2014'}</b></span>
        <span><small>Last sync</small><b>${p.syncedAt ? esc(ago(p.syncedAt)) : 'Not yet'}</b></span>
      </div>

      ${from ? `
        <div class="wsnews">
          <div class="grow">
            <b>${esc(from.person)} changed ${esc(p.name)}</b>
            <span>${what ? esc(what) : 'on their copy'} \u00b7 ${esc(ago(from.lastChanged))}
              \u00b7 on ${esc(from.device)}</span>
            ${from.which?.length ? `<span class="mono files">${from.which.map(esc).join('  ')}${
  (from.added ?? 0) + (from.modified ?? 0) > from.which.length ? '  \u2026' : ''}</span>` : ''}
          </div>
        </div>` : ''}

      <div class="label-tiny">Copies <span class="count">${p.copies.length}</span></div>
      <div class="wscopies">
        ${p.copies.map((c) => `
          <div class="row ${c.waiting ? 'waiting' : ''}">
            <span class="dot ${c.online ? 'live' : 'off'}"></span>
            <span class="grow">
              <b>${esc(c.you ? 'You' : c.person)}</b>
              <span class="where">${esc(c.device)}${c.files ? ` \u00b7 ${c.files} files` : ''}</span>
            </span>
            <span class="says">${c.waiting
    ? esc(changeInWords(c) ?? 'changed')
    : c.you ? 'Your copy' : c.lastChanged ? `Last changed ${esc(ago(c.lastChanged))}` : 'No changes seen'}</span>
            <span class="acts">${c.you ? ''
    : `<button class="small" data-diff="${esc(c.deviceId)}" data-offer="${esc(c.offer ?? '')}">What is different</button>`}</span>
          </div>`).join('')}
      </div>

      <div class="ws-project-actions">
        ${from ? `<button class="small" data-diff="${esc(from.deviceId)}" data-offer="${esc(from.offer ?? '')}">View changes (${(from.added ?? 0) + (from.modified ?? 0) + (from.gone ?? 0)})</button>
          ${p.mine ? `<button class="go small" data-diff="${esc(from.deviceId)}" data-offer="${esc(from.offer ?? '')}">Sync from ${esc(from.person)}</button>` : ''}` : ''}
        ${p.mine ? '<button class="quiet small" id="ws-open-secondary">Open project</button>' : ''}
        ${alone ? '' : '<button class="quiet small" id="ws-project-offer">Offer another folder\u2026</button>'}
      </div>

      ${alone ? `
        <div class="wsalone">
          <b>This project is only on this computer.</b>
          <span>Nobody else in this workspace has a copy of ${esc(p.name)} yet. Invite
            somebody, or turn on a computer of your own that is offering it, and it will
            appear here with a copy of its own.</span>
          <span class="acts">
            <button class="go small" id="ws-alone-invite">Invite somebody</button>
            <button class="quiet small" id="ws-alone-offer">Offer another folder\u2026</button>
          </span>
        </div>` : ''}

      ${!p.mine ? `<p class="sub">Nobody on this computer has a copy of this one.
        Press a computer that does to bring one over.</p>` : ''}

      <div id="job"></div>

      <div class="ws-project-lower">
        <section class="ws-change-summary">
          <div class="ws-subhead"><span class="eyebrow">Change summary</span><b>${from
    ? `${(from.added ?? 0) + (from.modified ?? 0) + (from.gone ?? 0)} files changed`
    : 'Nothing waiting'}</b></div>
          ${from ? `<div class="ws-change-counts">
            <span class="added">${from.added ?? 0} added</span>
            <span class="modified">${from.modified ?? 0} modified</span>
            <span class="gone">${from.gone ?? 0} removed</span>
          </div>
          <div class="ws-change-files">${(from.which ?? []).slice(0, 5).map((file) => `<span><span>${KIND_MARK.file}</span><b class="mono">${esc(file)}</b></span>`).join('')
            || '<span class="quiet">The changed file names are not available yet.</span>'}</div>`
    : '<p class="quiet">No reachable copy has changes waiting for this computer.</p>'}
        </section>
        <section class="ws-project-activity">
          <div class="ws-subhead"><span class="eyebrow">Project activity</span><b>${(p.lately ?? []).length} events</b></div>
          ${(p.lately ?? []).length ? `
          <ul class="wsevents">
          ${p.lately.slice(0, 5).map((one) => `
            <li class="${one.kind === 'sync.failed' ? 'bad' : ''}">
              <span class="mark">${one.kind === 'project.changed' ? '\u25cf' : one.kind === 'sync.failed' ? '\u25b3' : '\u2713'}</span>
              <span class="grow">${esc(one.you ? 'You' : one.who ?? 'Somebody')}
                ${one.kind === 'project.changed'
    ? `changed it${changeInWords(one) ? ` \u00b7 ${esc(changeInWords(one))}` : ''}`
                : one.kind === 'sync.failed' ? 'tried to bring changes over and could not'
      : 'brought changes over'}</span>
              <span class="when">${esc(ago(one.at))}</span>
            </li>`).join('')}
          </ul>` : '<p class="quiet">Nothing has happened to this project yet.</p>'}
        </section>
      </div>

    </div>`;
}

function wireProjectInWorkspace(p, t) {
  if (!p) return;

  $('#ws-alone-invite')?.addEventListener('click', inviteSomebody);
  $('#ws-alone-offer')?.addEventListener('click', offerSomething);
  $('#ws-project-offer')?.addEventListener('click', offerSomething);

  for (const open of [$('#ws-open'), $('#ws-open-secondary')]) open?.addEventListener('click', async () => {
    say(await post('/open', { path: p.mine.path }));
    await refreshMe();
    draw();
  });

  for (const b of document.querySelectorAll('[data-diff]')) {
    b.onclick = () => {
      const one = [...(t.mine ?? []), ...(t.team ?? [])].find((d) => d.deviceId === b.dataset.diff);
      whatIsDifferent(
        { id: b.dataset.diff, name: one?.displayName ?? 'that computer' },
        t,
        { project: p, offer: b.dataset.offer, mineAt: p.mine?.path },
      );
    };
  }
}

/**
 * Notes, kept small, and drawn from the one place they are actually written.
 *
 * **This read the older GitHub-backed workspace's own list**, which nothing has
 * put a note in since notes stopped travelling that way. A note from another
 * computer arrived, was accepted, was written down and was carried on the
 * stream — and this drew a different store, which was always empty. So notes
 * looked broken end to end while every part of the journey was working.
 */
async function drawWorkspaceNotes() {
  const box = $('#wsnotes');
  if (!box) return;

  const said = await get('/workspace/notes');
  if (!box.isConnected) return;

  for (const one of said.notes ?? []) heardAlready.add(one.id);
  const many = $('#general-count');
  if (many) many.textContent = String((said.notes ?? []).length);

  fill(box, `
    <div class="talk" id="talk">
      ${(said.notes ?? []).map(noteHtml).join('')
    || '<p class="quiet" style="margin:0">Nothing said yet. Everybody in this workspace sees what is said here.</p>'}
    </div>
    <div class="bar">
      <input id="w-say" placeholder="Say something to everybody here" style="flex:1">
      <button class="go" id="w-send">Send</button>
    </div>`);

  const talk = $('#talk');
  if (talk) talk.scrollTop = talk.scrollHeight;
  wireSaying();
}

/**
 * How far each of this computer's own notes actually got.
 *
 * Kept so the answer survives the box being drawn again. Without it, the mark
 * saying a note reached somebody lasted until the next look and was replaced by
 * the time of day — so the one thing somebody wanted to know disappeared a few
 * seconds after they were told it.
 */
const howFarItGot = new Map();

/** One note, in the shape both the first draw and an arriving one use. */
function noteHtml(one) {
  const got = howFarItGot.get(one.id);
  const said = got === undefined ? esc(ago(one.at))
    : got ? `Sent to ${got} ${got === 1 ? 'computer' : 'computers'}`
      : 'Here only \u2014 nobody else has it';

  return `
    <div class="bubble ${one.you ? 'mine' : ''} ${got === 0 ? 'alone' : ''}" data-note="${esc(one.id)}">
      <div class="who">${esc(one.you ? 'You' : one.fromName)} \u00b7 <span>${said}</span></div>
      ${esc(one.text)}
    </div>`;
}

/**
 * How many have arrived while nobody was looking.
 *
 * Notes are secondary and stay folded away, which would make one arriving
 * invisible — so the fold says how many. Pressed open, it is nought again.
 */
let unreadNotes = 0;

function markUnreadNotes(many) {
  unreadNotes = many;
}

/**
 * A note that has just arrived, put on the screen where it belongs.
 *
 * Appended rather than redrawn: a note is one element, and rebuilding a screen
 * to show one sentence is how somebody loses their place mid-sentence. If the
 * fold is shut there is nothing to append to, so the fold counts it instead.
 */
function noteArrived(one) {
  const box = $('#talk');
  if (!box || !box.isConnected) {
    if (at.tab === 'workspace') markUnreadNotes(unreadNotes + 1);
    return;
  }
  if (box.querySelector(`[data-note="${CSS.escape(one.id)}"]`)) return;

  const wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  const empty = box.querySelector('p.quiet');
  if (empty) empty.remove();

  box.insertAdjacentHTML('beforeend', noteHtml({
    id: one.id, at: one.at, text: one.text, fromName: one.fromName, you: false,
  }));
  if (wasAtBottom) box.scrollTop = box.scrollHeight;
}

/** A shared project, in the inspector: where its copies are and what to do. */
function inspectSharedProject(p) {
  if (!p) return inspect(null);

  const here = p.copies.filter((c) => c.online).length;
  const state = PROJECT_STATE[p.state] ?? PROJECT_STATE.ONLY_HERE;
  const waiting = p.waitingOn ?? null;
  const commonGitHub = p.github?.state === 'SHARED' ? p.github : null;
  const thisCopyUsesCommon = !!commonGitHub && p.mine?.github?.owner === commonGitHub.owner
    && p.mine?.github?.repo === commonGitHub.repo;

  inspect({
    name: p.name,
    kind: state.says,
    mark: KIND_MARK.project,
    body: `
      <div class="ws-inspector-tabs"><span class="on">Inspector</span><span>Details</span></div>
      <div class="ws-inspector-kicker">Project inspector</div>`,
    facts: [
      { label: 'State', value: state.says },
      { label: 'On this computer', value: p.mine ? p.mine.path : 'no copy here', mono: !!p.mine },
      { label: 'Also on', value: p.others.map((c) => `${c.person} · ${c.device}`).join(', ') || 'nobody else' },
      { label: 'Size here', value: p.mine?.files ? `${p.mine.files} files` : null },
      { label: 'Copies', value: p.copies.map((c) => `${c.you ? 'You' : c.person} · ${c.device}`).join(', ') },
      { label: 'Changes waiting', value: waiting
        ? `${waiting.person} · ${changeInWords(waiting) ?? 'changed their copy'} · ${ago(waiting.lastChanged)}`
        : 'None' },
      { label: 'Last successful sync', value: p.syncedAt ? ago(p.syncedAt) : 'Not yet' },
      { label: 'Shared GitHub project', value: p.github?.state === 'DIFFERENT'
        ? 'Copies use different GitHub projects'
        : commonGitHub ? `${commonGitHub.owner}/${commonGitHub.repo}` : 'Not connected' },
    ],
    countsAre: 'Copies',
    counts: [
      { many: p.copies.length, what: p.copies.length === 1 ? 'copy' : 'copies' },
      { many: here, what: 'reachable' },
      { many: p.others.length, what: 'elsewhere' },
    ],
    acts: p.mine ? [{ what: 'Open project', run: async () => {
      say(await post('/open', { path: p.mine.path }));
      await refreshMe();
      draw();
    } }, ...(commonGitHub && !thisCopyUsesCommon ? [{
      what: 'Use shared GitHub project',
      run: async () => { say(await post('/team/project/github', { project: p.name, action: 'connect' })); draw(); },
    }] : []), ...(thisCopyUsesCommon ? [{
      what: 'Get latest from GitHub',
      run: async () => { say(await post('/team/project/github', { project: p.name, action: 'latest' })); draw(); },
    }, {
      what: 'Send to GitHub',
      run: async () => { say(await post('/team/project/github', { project: p.name, action: 'send' })); draw(); },
    }, {
      what: 'Ask for review on GitHub',
      run: async () => { say(await post('/team/project/github', { project: p.name, action: 'review' })); draw(); },
    }] : [])] : [],
  });
}

/** Authentication and linked identities, composed as one person rather than two account lists. */
async function drawAccountCenter() {
  const box = $('#account-center');
  if (!box) return;
  const [github, google] = await Promise.all([get('/github'), get('/google')]);
  if (!box.isConnected) return;
  const googleAccounts = google.accounts ?? [];
  const githubAccounts = github.accounts ?? [];
  const primary = github.active ?? google.active ?? me.machineName ?? 'This person';

  box.innerHTML = `
    <section class="account-identity-panel">
      <div class="account-panel-heading"><span class="eyebrow">Your Viberant identity</span>
        <p>One person on this computer, with the services used by individual features linked underneath.</p></div>
      <div class="account-person-card">
        <span class="account-avatar">${esc(primary.slice(0, 1).toUpperCase())}</span>
        <div class="grow"><h2>${esc(primary)}</h2><p>${esc(me.machineName || 'This computer')}</p>
          <span class="chip ${github.active || google.active ? 'live' : ''}">${github.active || google.active ? 'Signed in' : 'Local only'}</span></div>
      </div>
      <div class="account-linked-title"><span class="eyebrow">Linked identities</span><span>${githubAccounts.length + googleAccounts.length}</span></div>
      <div class="account-linked-list">
        ${githubAccounts.map((one) => `
          <div class="account-linked-row"><span class="service-mark">${GITHUB_MARK}</span>
            <span class="grow"><b>GitHub</b><small>${esc(one.name)}</small></span>
            <span class="account-connected"><span class="dot live"></span>${one.active ? 'In use' : 'Connected'}</span>
            ${one.active ? '' : `<button class="quiet small" data-account-github="${esc(one.name)}">Use</button>`}
          </div>`).join('')}
        ${googleAccounts.map((one) => `
          <div class="account-linked-row"><span class="service-mark">${GOOGLE_MARK}</span>
            <span class="grow"><b>Google</b><small>${esc(one.name)}</small></span>
            <span class="account-connected"><span class="dot live"></span>${one.active ? 'In use' : 'Connected'}</span>
            ${one.active ? '' : `<button class="quiet small" data-account-google="${esc(one.name)}">Use</button>`}
          </div>`).join('')}
        ${!githubAccounts.length && !googleAccounts.length ? '<div class="account-empty">No external identity is linked. Local projects and tools still work.</div>' : ''}
      </div>
      <div class="account-security-note"><span>⌾</span><p><b>Tokens stay on this Windows account.</b> GitHub tokens are protected by Windows before being written. Viberant never asks for a password.</p></div>
    </section>

    <section class="account-access-panel">
      <div class="account-panel-heading"><span class="eyebrow">Sign in to Viberant</span><p>Choose the service needed for the feature you want to use.</p></div>
      <div class="account-methods">
        <button id="account-github-in">${GITHUB_MARK}<span><b>${github.active ? 'Connect another GitHub account' : 'Continue with GitHub'}</b><small>Browser device code · projects and collaboration</small></span></button>
        <button id="account-google-in">${GOOGLE_MARK}<span><b>${google.active ? 'Connect another Google account' : 'Continue with Google'}</b><small>Browser account chooser · identity</small></span></button>
      </div>

      <div class="account-readiness">
        <div class="account-readiness-head"><span class="eyebrow">GitHub browser sign-in</span>
          <span class="chip ${github.signInReady ? 'live' : 'attention'}">${github.signInReady ? 'Ready' : 'Publisher setup required'}</span></div>
        <p>${github.signInReady
    ? 'Viberant shows a device code, opens GitHub in the browser, and notices authorization automatically.'
    : 'The direct flow is implemented, but this build does not contain the public client ID for the Viberant OAuth application.'}</p>
        <div class="account-flow"><span class="${github.active ? 'done' : 'on'}">1 <b>Device code</b></span><i></i><span class="${github.active ? 'done' : ''}">2 <b>Browser authorization</b></span><i></i><span class="${github.active ? 'done' : ''}">3 <b>${github.active ? `Connected as ${esc(github.active)}` : 'Connected'}</b></span></div>
      </div>

      <div class="account-runtime">
        <div><span class="eyebrow">Project history</span><h3>${github.git?.available ? 'Ready' : 'Unavailable'}</h3></div>
        <span class="state ${github.git?.available ? 'good' : 'attention'}"><span class="pip"></span>${github.git?.bundled ? 'Bundled MinGit' : github.git?.available ? 'System fallback' : 'Repair needed'}</span>
        <p>${github.git?.available
    ? 'Viberant resolves its bundled runtime first and does not change the computer PATH.'
    : 'Clone, fetch, pull, and send are disabled until the packaged runtime is restored.'}</p>
      </div>

      <div class="account-secondary-actions">
        ${github.active
    // Offering to make an account to somebody who is signed in reads as though
    // the app cannot see them. What they might actually want here is a second
    // account, which is a different sentence and a different button.
    ? '<button id="account-github-add">Connect another account</button>'
    : '<button id="account-create-github">Create a GitHub account</button>'}
        ${github.active ? '<button class="danger" id="account-github-out">Disconnect GitHub</button>' : ''}
        ${google.active ? '<button class="danger" id="account-google-out">Disconnect Google</button>' : ''}
      </div>
    </section>`;

  $('#account-github-in').onclick = () => signInToGitHub();
  $('#account-google-in').onclick = () => signInToGoogle({});
  $('#account-create-github')?.addEventListener('click', () => post('/open/page', { at: 'https://github.com/signup' }));
  $('#account-github-add')?.addEventListener('click', () => signInToGitHub());
  $('#account-github-out')?.addEventListener('click', async () => {
    say(await post('/github/signout', { name: github.active }));
    await refreshMe(); draw();
  });
  $('#account-google-out')?.addEventListener('click', async () => {
    say(await post('/google/signout', { name: google.active }));
    await refreshMe(); draw();
  });
  for (const button of box.querySelectorAll('[data-account-github]')) {
    button.onclick = async () => { say(await post('/github/switch', { name: button.dataset.accountGithub })); await refreshMe(); draw(); };
  }
  for (const button of box.querySelectorAll('[data-account-google]')) {
    button.onclick = async () => { say(await post('/google/switch', { name: button.dataset.accountGoogle })); await refreshMe(); draw(); };
  }
}

SCREENS.settings = async () => {
  const [{ settings, parts, record }, { terminals }] = await Promise.all([post('/settings'), get('/terminals')]);

  /**
   * The parts of this page, in the order somebody would go looking.
   *
   * Two of them are not lists of settings at all — who you are signed in as,
   * and what is written down — so they are named here rather than derived from
   * the settings themselves. The rest come from the manager, which is the one
   * place that decides what belongs with what.
   */
  const places = [
    { id: 'accounts', name: 'Accounts', why: 'Who this computer acts as, on GitHub and on Google.' },
    { id: 'asking', name: 'AI', why: 'Which company answers questions about your projects, and the key that pays for it.' },
    ...parts.map((one) => ({ ...one, id: one.id === 'look' ? 'look' : one.id })),
    { id: 'updates', name: 'Updates', why: 'Whether there is a newer Viberant, and why it will not install itself.' },
    { id: 'advanced', name: 'Advanced', why: 'What is written down, and what to do when something is wrong.' },
  ];

  if (!places.some((one) => one.id === settingsPlace)) settingsPlace = places[0].id;
  const here = places.find((one) => one.id === settingsPlace);

  /** One part of the page, drawn from the settings that belong on it. */
  const rows = (id) => {
    const ours = settings.filter((one) => one.where === id);
    if (!ours.length) return '';
    return `
      <div class="card">
        ${ours.map((one) => `
          <div class="setting">
            <div class="about"><b>${esc(one.name)}</b><span>${esc(one.why)}</span></div>
            <div class="set">${control(one, terminals)}</div>
          </div>`).join('')}
      </div>`;
  };

  const accounts = '<div class="account-center" id="account-center"><div class="github-loading"><span class="spin"></span> Reading connected identities…</div></div>';

  const asking = `
    <div class="card">
      <div class="setting">
        <div class="about"><b>Which one answers, and which of its models</b>
          <span id="ai-here">Reading…</span></div>
        <div class="set"><button class="small" id="ai-setup-here">Set it up…</button></div>
      </div>
    </div>`;

  const updates = `
    <div class="card" id="newer-settings">
      <div class="setting"><div class="about"><b>Checking…</b>
        <span>Asking whether a newer Viberant has been released.</span></div><div class="set"></div></div>
    </div>`;

  const advanced = `
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
        <div class="about"><b>What is going on in here</b>
          <span>Which account, which computer, what failed recently. Useful to anybody
            helping you work out why something is not doing what it should. Keys and
            passwords are taken out of it before you get it.</span></div>
        <div class="set"><button class="small" id="diag">Copy it</button></div>
      </div>
      <div class="setting">
        <div class="about"><b>Put every setting back</b>
          <span>Only the settings above. Your projects, accounts and history are untouched.</span></div>
        <div class="set"><button class="small danger" id="reset">Put them back</button></div>
      </div>
    </div>`;

  const body = settingsPlace === 'accounts' ? accounts
    : settingsPlace === 'asking' ? asking
      : settingsPlace === 'updates' ? updates
        : settingsPlace === 'advanced' ? advanced
          : rows(settingsPlace);

  view.innerHTML = `
    <div class="pagehead command-head">
      <div class="grow">
        <span class="eyebrow">Preferences and connections</span>
        <h1>Settings</h1>
        <p class="sub">Control accounts, AI, appearance, computer behavior, and updates.</p>
      </div>
    </div>
    ${saidHtml()}

    <div class="preferences-shell-v2 settingsplaces">
      <nav class="preferences-nav-v2" aria-label="Parts of settings">
        ${places.map((one) => `
          <button class="${one.id === settingsPlace ? 'on' : ''}" data-place="${esc(one.id)}">${esc(one.name)}</button>`).join('')}
      </nav>
      <div class="preferences-canvas-v2 part">
        <header class="preferences-heading-v2"><span class="eyebrow">${esc(here.name)}</span><h2>${esc(here.name)}</h2>
          ${here.why ? `<p>${esc(here.why)}</p>` : ''}</header>
        <div class="preferences-body-v2">${body}</div>
      </div>
    </div>`;
  said = null;

  /*
   * The way between the parts is wired first, and on purpose.
   *
   * Everything below reaches for a control that only exists on one part, and
   * the first one that was not optional threw — which stopped every line
   * after it, including this loop. From the outside: a settings page whose own
   * navigation did nothing, on every part except the one that happened to have
   * that control. Wired first, so nothing further down can strand it.
   */
  for (const b of document.querySelectorAll('[data-place]')) {
    b.onclick = () => { settingsPlace = b.dataset.place; draw(); };
  }

  $('#diag')?.addEventListener('click', async () => {
    const d = await get('/diagnostics');
    await navigator.clipboard?.writeText(JSON.stringify(d, null, 2));
    $('#diag').textContent = 'Copied';
    say({
      ok: true,
      sentence: 'That is on your clipboard, ready to paste.',
      action: 'It says which account and what failed. It carries no keys or passwords.',
    });
    setTimeout(() => draw(), 1200);
  });

  /**
   * One place to set this up, and it is the one that checks the key.
   *
   * There used to be three boxes here \u2014 one per company \u2014 that took a key
   * and kept it without ever asking whether it worked, alongside a menu for
   * choosing between them. Two ways to do one thing, and the easier one was the
   * one that could not tell you it had failed. This is the same dialog somebody
   * gets when they try to ask a question with nothing set up.
   */
  $('#ai-setup-here')?.addEventListener('click', () => setUpAi());
  get('/ai').then((who) => {
    const line = $('#ai-here');
    if (!line) return;
    const ready = (who.models ?? []).filter((m) => m.ready);
    line.textContent = who.ok
      ? `${who.name} answers, using ${modelNamed(who, who.using)}.${
        ready.length > 1 ? ` ${ready.length} companies have a key here.` : ''} The key stays on this computer.`
      : 'No AI is connected yet, so questions about a project cannot be answered.';
  });

  // Only the part that is on the page is asked about. The three that reach the
  // network used to be asked on every draw, whichever part you were looking at.
  if (settingsPlace === 'accounts') drawAccountCenter();
  if (settingsPlace === 'updates') drawNewerSettings();
  if (me.settings?.appearance === 'yours') checkPictureReads();

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
  /**
   * A picture of your own, and the one honest thing that has to happen with it.
   *
   * Every other look here was made dark on purpose. A photograph somebody chose
   * was not, and a bright one puts text on top of a picture, which is the exact
   * thing the whole background layer is forbidden from doing. So it is measured
   * rather than hoped about: the picture is read, how light it is comes back as
   * a number, and if it is too light the app says so and offers the fix instead
   * of leaving somebody to work out why the words went hard to read.
   */
  for (const b of document.querySelectorAll('[data-picture]')) {
    b.onclick = async () => {
      const chosen = await post('/choose/file');
      if (chosen.cancelled) return;
      if (!chosen.ok) return say(chosen), draw();

      if (!/\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(chosen.path)) {
        say({
          ok: false,
          sentence: 'That file is not a picture this can show.',
          action: 'Choose a PNG, a JPEG, a WebP or a GIF.',
        });
        return draw();
      }

      await post('/settings', { id: b.dataset.picture, value: chosen.path });
      await post('/settings', { id: 'appearance', value: 'yours' });
      await refreshMe();
      wall.pictureChanged();
      draw();
      checkPictureReads({ fix: true });
    };
  }
  $('[data-picture-off]')?.addEventListener('click', async () => {
    await post('/settings', { id: 'wallPicture', value: '' });
    await post('/settings', { id: 'appearance', value: 'dark' });
    await refreshMe();
    wall.pictureChanged();
    draw();
  });

  for (const sel of document.querySelectorAll('select[data-choose]')) {
    sel.onchange = async () => {
      say(await post('/settings', { id: sel.dataset.choose, value: sel.value }));
      await refreshMe();
      draw();
    };
  }
  for (const r of document.querySelectorAll('[data-slide]')) {
    // The picture follows the slider as it moves, and the manager is told when
    // it stops — dragging one of these writes a settings file otherwise, forty
    // times a second.
    r.oninput = () => {
      $(`#slide-${r.dataset.slide}`).textContent = r.value;
      wallFromSettings({ ...me.settings, [r.dataset.slide]: Number(r.value) });
    };
    r.onchange = async () => {
      await post('/settings', { id: r.dataset.slide, value: Number(r.value) });
      await refreshMe();
    };
  }
  for (const b of document.querySelectorAll('button[data-choose]')) {
    b.onclick = async () => {
      // Applied to the page before the manager is even asked, so choosing a
      // look is instant and nothing flashes through the old one on the way.
      // If saving fails, the sentence says so and the next draw puts it back.
      const want = b.dataset.value;
      document.documentElement.dataset.theme = want === 'system' ? '' : want;
      for (const other of document.querySelectorAll('button[data-choose]')) {
        other.classList.toggle('on', other === b);
        other.setAttribute('aria-pressed', String(other === b));
      }
      const r = await post('/settings', { id: b.dataset.choose, value: want });
      if (!r.ok) say(r);
      await refreshMe();
      if (!r.ok) draw();
    };
  }

  $('#open-record')?.addEventListener('click', async () => { say(await post('/settings/openRecord')); draw(); });
  $('#reset')?.addEventListener('click', async () => {
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
  });
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
  /**
   * A look, shown rather than named.
   *
   * "Deep blue" in a dropdown tells you the word somebody chose for it, which
   * is not the question anybody is asking. Each of these is a small picture of
   * the actual shell — rail, bar, a row, an accent — drawn with that look's own
   * values, so choosing is looking rather than guessing and then undoing.
   */
  if (s.kind === 'appearance') {
    return `<div class="looks">${s.choices.map((c) => `
      <button class="look ${c.id === s.value ? 'on' : ''}" data-choose="${esc(s.id)}"
        data-value="${esc(c.id)}" aria-pressed="${c.id === s.value}">
        <span class="sample" data-theme="${c.id === 'system'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : esc(c.id)}">
          <span class="s-rail"><i></i><i></i><i></i></span>
          <span class="s-body"><span class="s-bar"></span><span class="s-row"></span>
            <span class="s-row short"></span><span class="s-go"></span></span>
        </span>
        <span class="what">${esc(c.name)}</span>
        <span class="why">${esc(c.why ?? '')}</span>
      </button>`).join('')}</div>`;
  }
  if (s.kind === 'slider') {
    return `<span class="slide">
      <input type="range" data-slide="${esc(s.id)}" min="${s.min}" max="${s.max}"
        value="${esc(String(s.value))}" aria-label="${esc(s.name)}">
      <span class="mono" id="slide-${esc(s.id)}">${esc(String(s.value))}</span>
    </span>`;
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
  if (s.kind === 'picture') {
    return `<button class="small" data-picture="${esc(s.id)}">${
  s.value ? esc(tail(s.value)) : 'Choose a picture\u2026'}</button>${
  s.value ? '<button class="quiet small" data-picture-off="1">Use none</button>' : ''}`;
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
    <div class="pagehead command-head">
      <div class="grow">
        <span class="eyebrow">Product feedback</span>
        <h1>Tell us what happened</h1>
        <p class="sub">Describe the moment while it is still fresh. Your report is kept on this computer first, then sent when a destination is available.</p>
      </div>
    </div>
    ${saidHtml()}

    <div class="feedback-studio-v2 feedback-layout">
      <nav class="feedback-mode-rail-v2 feedback-kinds" aria-label="Feedback kind">
        <span class="eyebrow">Kind of report</span>
          ${d.kinds.map((k, i) => `
            <button class="${i === 0 ? 'on' : ''}" data-kind="${esc(k.id)}">
              <span class="glyph">${['×', '?', '＋', '✓'][i] ?? '·'}</span>
              <span><b>${esc(k.name)}</b><small>${esc(k.blurb)}</small></span>
            </button>`).join('')}
      </nav>

      <section class="feedback-paper-v2 feedback-compose">
        <div class="panel-title"><b>New report</b><span>Kept locally first</span></div>
        <label class="field">What happened?</label>
        <textarea id="fb-what" rows="10" placeholder="I pressed Open on Antigravity and nothing appeared."></textarea>

        <div class="feedback-send">
          <button class="go" id="fb-send">Send feedback</button>
          <span>${d.home && me.github
    ? 'Only what you typed, this computer name, and the app version are sent.'
    : 'It will be written down here even if it cannot be sent yet.'}</span>
        </div>
      </section>

      <aside class="feedback-delivery-v2 feedback-side">
        <div class="feedback-context-v2 context-panel">
          <div class="panel-title"><b>What leaves this computer</b></div>
          <div class="context-item"><span>Your words</span><b>Included</b></div>
          <div class="context-item"><span>Computer and version</span><b>Included</b></div>
          <div class="context-item"><span>Project files and paths</span><b>Never included</b></div>
          <div class="delivery-state ${d.home && me.github ? 'ready' : ''}"><span class="dot ${d.home && me.github ? 'live' : 'attention'}"></span>
            ${d.home ? (me.github ? 'Ready to send' : 'Sign in to GitHub to send; local saving still works')
    : 'No sending destination is configured; local saving still works'}</div>
        </div>

        ${d.said.length ? `
          <div class="feedback-context-v2 feedback-history">
            <div class="panel-title"><b>Recent feedback</b><span>${d.said.length}</span></div>
            ${d.said.slice(0, 6).map((s) => `
              <div class="history-line">
                <span>${esc(d.kinds.find((k) => k.id === s.kind)?.name ?? s.kind)} · ${ago(s.at)}</span>
                <b>${esc(s.what)}</b>
              </div>`).join('')}
          </div>` : ''}
      </aside>
    </div>`;
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

/**
 * The news worth interrupting a page for.
 *
 * Not everything the other computers are doing. Something *you already have*
 * that has moved somewhere else is worth a strip at the top of whatever you are
 * looking at — you are working in it, and the two copies disagreeing is a fact
 * you need before you carry on.
 *
 * Something you simply do not have is not that. It is a thing that exists
 * elsewhere and might be nice to fetch, and it already has a home: the table on
 * the Workspace page that lists exactly that. Putting it in both places meant
 * the same offer appeared twice, with the second copy following you onto every
 * other screen in the app.
 */
const worthInterrupting = (n) => !((n.may ?? []).length === 1 && n.may[0] === 'bring');

function newsHtml() {
  const shown = liveNews.filter(worthInterrupting);
  if (!shown.length) return '';
  return `<div id="news">${liveNews.map((n, i) => (worthInterrupting(n) ? `
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
    </div>` : '')).join('')}</div>`;
}

/** Put the strip at the top of whatever is on screen, without redrawing it. */
function paintNews() {
  const hold = $('#view');
  if (!hold) return;
  const there = $('#news');
  if (!liveNews.some(worthInterrupting)) { there?.remove(); return; }

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

// One interval, armed once at startup, never from inside a render — which is
// the mistake D-99 was written about.
setInterval(() => { if (!document.hidden) checkMoving().catch(() => {}); }, 2000);

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
    return sheet({
      title: 'Sign in with GitHub',
      narrow: true,
      body: `<div class="said bad"><b>${esc(started.sentence)}</b><span>${esc(started.action ?? '')}</span></div>
        <p class="sub">This is a publisher setting for the packaged app. People using Viberant should never have to create their own OAuth application.</p>`,
      foot: '<button class="quiet" id="github-setup-close">Close</button>',
      onOpen: () => { $('#github-setup-close').onclick = closeLayer; },
    });
  }

  let watching = null;
  let polling = false;
  let currentCode = null;
  let openAt = 'https://github.com/login/device';
  let stopping = false;
  let detached = false;

  const stop = async ({ giveUp = false, backToWelcome = false } = {}) => {
    stopping = true;
    clearInterval(watching);
    if (giveUp) await post('/github/signin/stop');
    closeLayer();
    if (inGate && backToWelcome) showGate();
    else if (inGate) hideGate();
  };

  const paint = (code, where = 'https://github.com/login/device') => {
    currentCode = code;
    openAt = where || openAt;

    // The first render owns the polling cleanup. Updating the code in place is
    // essential: replacing the sheet runs that cleanup and used to stop the UI
    // watcher at the exact moment GitHub had started waiting for authorization.
    const existing = $('#github-device-code');
    if (existing) {
      $('#github-device-copy').hidden = !code;
      $('#github-device-wait').hidden = !code;
      $('#github-device-explain').textContent = code
        ? 'Your browser is opening at the page below. Put this code in and this page will notice by itself.'
        : 'Asking GitHub for a code.';
      existing.textContent = code || '';
      if (!code) existing.innerHTML = '<span class="spin"></span>';
      $('#github-device-host').textContent = String(openAt).replace(/^https:\/\//, '');
      return;
    }

    sheet({
      title: 'Signing in to GitHub',
      narrow: true,
      body: `
        <p class="sub" id="github-device-explain">${code
    ? 'Your browser is opening at the page below. Put this code in and this page will notice by itself.'
    : 'Asking GitHub for a code.'}</p>
        <div class="code" id="github-device-code">${code ? esc(code) : '<span class="spin"></span>'}</div>
          <div class="auth-code-actions" id="github-device-copy" ${code ? '' : 'hidden'}>
            <button class="go" id="in-copy">Copy code</button>
            <button id="in-again"><span class="glyph">${GITHUB_MARK}</span><span>Open in browser</span></button>
          </div><div class="auth-waiting" id="github-device-wait" ${code ? '' : 'hidden'}><span class="spin"></span><span><b>Waiting for authorization</b><small id="github-device-host">${esc(String(openAt).replace(/^https:\/\//, ''))}</small></span></div>`,
      foot: '<button class="quiet" id="in-cancel">Never mind</button>',
      onOpen: () => {
        // Closing the sheet is not cancelling the browser authorization. The
        // attempt belongs to the app, not to this particular rendering of the
        // sheet: GitHub may finish after somebody navigates elsewhere. Keep the
        // quiet watcher alive, update the account everywhere, and only stop the
        // server-side attempt when the explicit Never mind button is pressed.
        whenLayerCloses(() => {
          if (!stopping) detached = true;
        });
        $('#in-again')?.addEventListener('click', () => post('/open/page', { at: openAt }));
        $('#in-copy')?.addEventListener('click', async () => {
          await navigator.clipboard?.writeText(currentCode);
          $('#in-copy').textContent = 'Copied';
        });
        $('#in-cancel').onclick = async () => {
          await stop({ giveUp: true, backToWelcome: true });
          if (!inGate) draw();
        };
      },
    });
  };

  paint(null);

  watching = setInterval(async () => {
    if (polling) return;
    polling = true;
    const r = await get('/github/signin');

    if (r.signin?.code && $('#layer .code')?.textContent.trim() !== r.signin.code) {
      paint(r.signin.code, r.signin.at);
      post('/open/page', { at: r.signin.at });
    }

    // Done means the sign-in itself finished, or the account actually changed.
    // Not merely "somebody is signed in", which was true before we started.
    const finished = r.signin && !r.signin.running && r.signin.ok === true;
    const changed = r.github && r.github !== before;

    if (finished || changed) {
      clearInterval(watching);
      if (!detached) {
        stopping = true;
        closeLayer();
      }
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
      if (!detached) {
        stopping = true;
        closeLayer();
      }
      await refreshMe();
      if (inGate && !detached) return showGate({ trouble: r.signin });
      say(r.signin);
      draw();
      return;
    }
    polling = false;
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
        <div class="auth-blocked"><span class="service-mark">${GOOGLE_MARK}</span>
          <div><b>${esc(started.sentence)}</b><p>${esc(started.action)}</p></div></div>
        <p class="sub" style="margin-top:1rem">Normal users should never configure a Google developer application. This is a publisher step for the packaged build, so no setup console is opened from Viberant.</p>`,
      foot: '<button class="quiet" id="g-close">Close</button>',
      onOpen: () => {
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
  let polling = false;
  let currentCode = null;
  let openAt = null;
  let openedAt = null;
  let stopping = false;
  const stop = async ({ giveUp = false } = {}) => {
    stopping = true;
    clearInterval(watching);
    if (giveUp) await post('/google/signin/stop');
    closeLayer();
  };

  const paint = (code, where, browserReady = false) => {
    currentCode = code;
    openAt = where || openAt;

    // As with GitHub, keep the first sheet mounted so its close hook does not
    // mistake "the code arrived" for "the person cancelled" and stop polling.
    const existing = $('#google-device-code');
    if (existing) {
      $('#google-device-copy').hidden = !code;
      $('#google-device-wait').hidden = !code && !browserReady;
      $('#google-device-explain').textContent = browserReady
        ? 'Google is opening in your browser. Choose an account and approve Viberant; this page will notice by itself.'
        : code
        ? 'Your browser is opening at the page below. Put this code in and pick your account.'
        : 'Preparing Google\u2019s browser sign-in.';
      existing.textContent = code || (browserReady ? 'Waiting for browser…' : '');
      if (!code && !browserReady) existing.innerHTML = '<span class="spin"></span>';
      $('#google-device-host').textContent = browserReady
        ? 'accounts.google.com'
        : String(openAt ?? '').replace(/^https:\/\//, '');
      return;
    }

    sheet({
      title: 'Signing in to Google',
      narrow: true,
      body: `
      <p class="sub" id="google-device-explain">${browserReady
    ? 'Google is opening in your browser. Choose an account and approve Viberant; this page will notice by itself.'
    : code
    ? 'Your browser is opening at the page below. Put this code in and pick your account.'
    : 'Preparing Google\u2019s browser sign-in.'}</p>
      <div class="code" id="google-device-code">${code ? esc(code) : browserReady ? 'Waiting for browser…' : '<span class="spin"></span>'}</div>
        <div class="auth-code-actions" id="google-device-copy" ${code ? '' : 'hidden'}>
          <button class="go" id="g-copy">Copy code</button>
          <button id="g-again"><span class="glyph">${GOOGLE_MARK}</span><span>Open in browser</span></button>
        </div><div class="auth-waiting" id="google-device-wait" ${code || browserReady ? '' : 'hidden'}><span class="spin"></span><span><b>Waiting for authorization</b><small id="google-device-host">${browserReady ? 'accounts.google.com' : esc(String(openAt ?? '').replace(/^https:\/\//, ''))}</small></span></div>`,
      foot: '<button class="quiet" id="g-cancel">Never mind</button>',
      onOpen: () => {
        // The same rule as the other way in: closed is closed, however it closed.
        whenLayerCloses(() => {
          clearInterval(watching);
          if (!stopping) post('/google/signin/stop');
        });
        $('#g-again')?.addEventListener('click', () => post('/open/page', { at: openAt }));
        $('#g-copy')?.addEventListener('click', async () => {
          await navigator.clipboard?.writeText(currentCode);
          $('#g-copy').textContent = 'Copied';
        });
        $('#g-cancel').onclick = async () => { await stop({ giveUp: true }); backWhereYouWere(); };
      },
    });
  };

  paint(null, null);

  watching = setInterval(async () => {
    if (polling) return;
    polling = true;
    const r = await get('/google/signin');
    if (!r.signin) {
      polling = false;
      return;
    }

    const code = r.signin.code;
    if (r.signin.browser && r.signin.at && r.signin.at !== openedAt) {
      openedAt = r.signin.at;
      paint(null, r.signin.at, true);
      post('/open/page', { at: r.signin.at });
    } else if (code && $('#layer .code')?.textContent.trim() !== code) {
      paint(code, r.signin.at);
      post('/open/page', { at: r.signin.at });
    }

    // Done means this attempt finished, not merely that somebody is signed in —
    // which was already true if you came here to change accounts.
    if (r.signin.running) {
      polling = false;
      return;
    }

    await stop();
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

/**
 * Open somewhere in particular, wearing something in particular.
 *
 * Only for photographing the app. A camera cannot press a tab, so the place and
 * the look are askable in the address — which is how every picture in the
 * design work is taken of the real thing running rather than of a mock-up.
 *
 * It reads and never writes: nothing here is remembered, so a link cannot
 * change what somebody's app looks like the next time they open it.
 */
function asAsked() {
  const asked = new URLSearchParams(location.search);
  return {
    place: asked.get('at'),
    look: asked.get('look'),
    instant: asked.has('instant'),
  };
}

const start = async () => {
  const wanted = asAsked();
  await refreshMe();
  if (wanted.look) {
    document.documentElement.dataset.theme = wanted.look;
    // The look asked for in the address drives what is behind the app too,
    // otherwise a picture of the theme shows its colours and none of its scene.
    wallFromSettings({ ...me.settings, appearance: wanted.look });
  }
  const p = await get('/project');
  at.inside = !!p.open;
  if (wanted.place) { at.tab = wanted.place; at.inside = false; }
  drawNav();
  await draw();

  const skip = wanted.instant || me.settings?.opening === false
    || matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    $('#opening')?.classList.add('going');
    $('#frame').classList.add('up');
    setTimeout(() => $('#opening')?.remove(), skip ? 0 : 500);
    if (wanted.instant) { $('#opening')?.remove(); return; }
    // Asked once, on a computer that has never signed in to anything. After
    // that the corner is where you go, and nothing stands in front of the app
    // again.
    if (!signedInAs() && !me.settings?.welcomed) showGate();
    watchTheOthers();
  }, skip ? 120 : 1600);
};

start();
