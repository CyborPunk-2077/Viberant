/**
 * A truthful Desktop/Web capability report for one project.
 *
 * This does not translate arbitrary native code. It identifies an existing
 * web surface, the native capabilities that need adapters, and whether there
 * is enough browser UI to make a companion meaningful. The deploy machinery
 * remains the only thing that publishes a site.
 */
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, posix, relative, resolve } from 'node:path';
import * as providers from './providers.mjs';
import * as webcompanion from './webcompanion.mjs';

const IGNORE = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.next', '.cache', 'coverage']);
const SOURCE = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.html', '.css', '.rs', '.py']);
const MOST_FILES = 700;
const MOST_BYTES = 2_000_000;

const CAPABILITIES = [
  { id: 'files', says: 'File system access', test: /(?:node:)?fs(?:\/promises)?|showOpenFilePicker|showDirectoryPicker/g },
  { id: 'processes', says: 'Starting local processes', test: /(?:node:)?child_process|\bspawn\s*\(|\bexecFile\s*\(/g },
  { id: 'desktop-shell', says: 'Desktop window and system integration', test: /from\s+['"]electron['"]|require\(['"]electron['"]\)|@tauri-apps/g },
  { id: 'local-network', says: 'Direct device or local-network connections', test: /(?:node:)?(?:net|dgram)|WebSocketServer|createServer\s*\(/g },
  { id: 'native-addons', says: 'Native add-ons or device drivers', test: /\.node['"]|serialport|usb-detection|ffi-napi|node-gyp/g },
  { id: 'secure-storage', says: 'Computer credential or key storage', test: /keytar|CryptProtectData|security\s+add-generic-password/g },
];

async function sources(root) {
  const files = [];
  const queue = [root];
  let bytes = 0;
  while (queue.length && files.length < MOST_FILES && bytes < MOST_BYTES) {
    const dir = queue.shift();
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const one of entries) {
      if (one.name.startsWith('.') && one.name !== '.env.example') continue;
      const at = join(dir, one.name);
      if (one.isDirectory()) {
        if (!IGNORE.has(one.name)) queue.push(at);
        continue;
      }
      if (!SOURCE.has(extname(one.name).toLowerCase())) continue;
      try {
        const text = (await readFile(at, 'utf8')).slice(0, 120_000);
        bytes += Buffer.byteLength(text);
        files.push({ name: relative(root, at).replaceAll('\\', '/'), text });
      } catch { /* an unreadable source file is simply not evidence */ }
      if (files.length >= MOST_FILES || bytes >= MOST_BYTES) break;
    }
  }
  return { files, clipped: queue.length > 0 || files.length >= MOST_FILES || bytes >= MOST_BYTES };
}

function matches(files) {
  return CAPABILITIES.map((capability) => {
    const found = files.filter((one) => {
      capability.test.lastIndex = 0;
      return capability.test.test(one.text);
    }).map((one) => one.name);
    return found.length ? { id: capability.id, says: capability.says, files: found.slice(0, 6), count: found.length } : null;
  }).filter(Boolean);
}

async function packageAt(root) {
  try { return JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); } catch { return null; }
}

function importNames(text) {
  const out = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\(|\bimport\s+|\brequire\s*\()\s*['"]([^'"]+)['"]/g;
  for (const found of String(text).matchAll(pattern)) out.push(found[1]);
  return out;
}

function sourceClosure(entry, files) {
  const byName = new Map(files.map((one) => [one.name, one]));
  const chosen = new Map();
  const assets = new Set();
  const queue = [entry.name];
  const extensions = ['', '.js', '.mjs', '.ts', '.tsx', '.jsx', '.css', '/index.js', '/index.ts', '/index.tsx', '/index.jsx'];
  while (queue.length) {
    const name = queue.shift();
    if (chosen.has(name)) continue;
    const one = byName.get(name);
    if (!one) continue;
    chosen.set(name, one);
    for (const asked of importNames(one.text)) {
      if (!asked.startsWith('.')) continue;
      const base = posix.normalize(posix.join(posix.dirname(name), asked));
      const found = extensions.map((suffix) => `${base}${suffix}`).find((candidate) => byName.has(candidate));
      if (found) queue.push(found); else assets.add(base);
    }
  }
  return { files: [...chosen.values()], assets: [...assets] };
}

function packageName(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * Which build of the companion client a page is actually running.
 *
 * Bumped by hand when this file changes what the handshake does. It exists so
 * "the deployed page is running the code I just wrote" can be *checked* rather
 * than assumed from a file date — a hosted target keeps whatever client it was
 * generated with, and that copy goes stale silently.
 */
const COMPANION_RUNTIME = 'r3';

function companionClient(id) {
  return `const AGENT = 'http://127.0.0.1:7777';
const PROJECT = '${id}';
const RUNTIME = '${COMPANION_RUNTIME}';
const MADE = '${new Date().toISOString()}';
const KEY = 'viberant:companion:' + PROJECT;
const RESULT = KEY + ':result';
const LOG = KEY + ':log';

/*
 * What happened, in order, without anything secret in it.
 *
 * The handshake finishes in a different window from the one that started it,
 * so when it goes wrong there is nobody watching the part that failed. Each
 * step writes one line here, both windows share it, and ?companion_debug=1
 * puts it on screen — which is the difference between "not connected" and
 * knowing which of eight things did not happen.
 */
function note(step, detail) {
  try {
    const all = JSON.parse(localStorage.getItem(LOG) || '[]');
    all.push({ at: new Date().toISOString(), where: location.origin === AGENT ? 'approval' : 'page', step: step, detail: detail == null ? null : String(detail).slice(0, 200) });
    localStorage.setItem(LOG, JSON.stringify(all.slice(-40)));
  } catch (e) { void e; }
  if (/[?&]companion_debug=1/.test(location.search)) console.log('[viberant-companion]', step, detail ?? '');
}

const channel = (() => { try { return new BroadcastChannel('viberant-companion:' + PROJECT); } catch (e) { void e; return null; } })();

function announce(result) {
  try { localStorage.setItem(RESULT, JSON.stringify({ ...result, at: Date.now() })); } catch (e) { void e; }
  try { channel && channel.postMessage({ type: 'viberant-companion', ...result }); } catch (e) { void e; }
  try { window.opener && window.opener.postMessage({ type: 'viberant-companion', ...result }, location.origin); } catch (e) { void e; }
  note('announced', result.ok ? 'ok' : result.reason);
}
const bytes = (size = 32) => { const value = new Uint8Array(size); crypto.getRandomValues(value); return btoa(String.fromCharCode(...value)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); };
const digest = async (value) => { const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return btoa(String.fromCharCode(...new Uint8Array(data))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); };

// What this half of the handshake has to remember while the other half happens
// somewhere else. Deliberately not sessionStorage: the approval comes back in
// the window Viberant opened, and sessionStorage belongs to one window only —
// so the window holding the answer could never read what the question was, and
// every pairing stopped there, with one page saying "waiting for approval" and
// the other saying "not connected". Same origin, cleared the moment it is used.
const HALF = KEY + ':pending';

async function connect() {
  const verifier = bytes(48); const state = bytes(24); const challenge = await digest(verifier);
  const attempt = bytes(8);
  try { localStorage.removeItem(RESULT); localStorage.setItem(LOG, '[]'); } catch (e) { void e; }
  note('connect.begin', 'runtime ' + RUNTIME + ' attempt ' + attempt);
  try { localStorage.setItem(HALF, JSON.stringify({ verifier, state, attempt, at: Date.now() })); } catch (e) { note('connect.storeFailed', e); }
  const back = location.origin + location.pathname;
  const url = new URL(AGENT + '/web-companion/pair');
  url.search = new URLSearchParams({ project: PROJECT, origin: location.origin, return: back, challenge, state });

  const opened = window.open(url, 'viberant-companion', 'popup,width=620,height=680');
  note('connect.opened', opened ? 'popup' : 'blocked, using this tab');
  if (!opened) { location.href = url; return new Promise(() => {}); }

  return new Promise((resolve) => {
    const stop = (result) => {
      clearInterval(tick);
      window.removeEventListener('message', heard);
      window.removeEventListener('storage', changed);
      try { channel && channel.removeEventListener('message', broadcast); } catch (e) { void e; }
      note('connect.settled', result.ok ? 'connected' : (result.reason || result.sentence));
      resolve(result);
    };
    /*
     * The approval finishes somewhere else, and any one way of hearing about it
     * can be taken away: an opener is severed by a cross-origin hop, a popup is
     * closed by hand, a message arrives before anyone is listening. So it is
     * heard four ways and the first to arrive wins — and a *failure* is heard
     * too, which is what stopped this waiting forever with nothing on screen.
     */
    const heard = (event) => { if (event.origin === location.origin && event.data && event.data.type === 'viberant-companion') stop(event.data); };
    const broadcast = (event) => { if (event.data && event.data.type === 'viberant-companion') stop(event.data); };
    const changed = (event) => {
      if (event.key === KEY && event.newValue) stop({ ok: true });
      if (event.key === RESULT && event.newValue) { try { stop(JSON.parse(event.newValue)); } catch (e) { void e; } }
    };
    window.addEventListener('message', heard);
    window.addEventListener('storage', changed);
    try { channel && channel.addEventListener('message', broadcast); } catch (e) { void e; }

    let closedFor = 0;
    const tick = setInterval(() => {
      if (localStorage.getItem(KEY)) return stop({ ok: true });
      let said = null;
      try { said = JSON.parse(localStorage.getItem(RESULT) || 'null'); } catch (e) { void e; }
      if (said) return stop(said);
      // A closed window is only bad news once it has had a moment to say so.
      if (opened.closed && (closedFor += 400) > 1600) {
        return stop({ ok: false, reason: 'approval-window-closed', sentence: 'The approval window closed before it finished.', action: 'Press Connect to try again.' });
      }
    }, 400);
  });
}

async function completePairing() {
  const at = new URL(location.href); const code = at.searchParams.get('viberant_code');
  if (!code) return null;
  const clean = () => { at.searchParams.delete('viberant_code'); at.searchParams.delete('viberant_state'); history.replaceState({}, '', at); };

  let half = null;
  try { half = JSON.parse(localStorage.getItem(HALF) || 'null'); } catch (e) { note('callback.halfUnreadable', e); }
  const state = at.searchParams.get('viberant_state');
  note('callback.arrived', 'opener ' + (window.opener ? 'present' : 'severed') + ', half ' + (half ? 'found' : 'missing'));

  if (!half) { clean(); const out = { ok: false, reason: 'pkce-half-missing', sentence: 'This page could not find the request it started.', action: 'Press Connect and approve it again.' }; announce(out); return out; }
  if (state !== half.state) { clean(); const out = { ok: false, reason: 'state-mismatch', sentence: 'That approval did not match this page.', action: 'Press Connect and approve it again.' }; announce(out); return out; }

  /*
   * The one request that crosses from a page on the internet to this computer.
   *
   * It can be refused by the browser rather than by Viberant — a page served
   * over https asking something of a local address is exactly the shape modern
   * browsers ask about, and when they refuse it this throws. Unhandled, that
   * ended the handshake in silence: the window that had the answer stopped
   * without telling anyone, and the window waiting for it waited forever. So
   * the reason is caught, kept, and said out loud to both.
   */
  /*
   * The exchange, asked for in the plainest way a browser offers.
   *
   * It used to carry targetAddressSpace 'local' — a setting from a proposal
   * for reaching this computer that browsers have since changed their minds
   * about twice. A browser that still enforces the old meaning refuses the
   * whole request before sending it, and what a page is told when that happens
   * is "Failed to fetch" and nothing else. So the ordinary request is tried
   * first, the older shape only if that fails, and which one worked is written
   * down — because the difference is the answer.
   */
  const shapes = [
    ['plain', { method: 'POST', mode: 'cors', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, verifier: half.verifier }) }],
    ['address-space', { method: 'POST', mode: 'cors', targetAddressSpace: 'local', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, verifier: half.verifier }) }],
  ];

  let result; let response = null; let lastError = null;
  try {
    for (const [name, options] of shapes) {
      try {
        response = await fetch(AGENT + '/web-companion/token', options);
        note('callback.exchange', name + ' → HTTP ' + response.status);
        break;
      } catch (e) {
        lastError = e; response = null;
        note('callback.exchangeRefused', name + ' → ' + String(e && e.message ? e.message : e).slice(0, 90));
      }
    }
    if (!response) throw lastError ?? new Error('no answer');
    if (!response.ok) {
      clean();
      const out = { ok: false, reason: 'exchange-http-' + response.status, sentence: 'Viberant did not accept the approval.', action: 'Press Connect and approve it again.' };
      announce(out); return out;
    }
    result = await response.json();
  } catch (e) {
    clean();
    // Did anything of ours reach the computer at all? That single fact splits
    // "the browser never sent it" from "Viberant answered and the browser threw
    // the answer away", which the page is otherwise never told.
    let arrived = 'unknown';
    try {
      const seen = await (await fetch(AGENT + '/web-companion/trace')).json();
      arrived = (seen.seen || []).some((one) => one.route === '/web-companion/token') ? 'yes' : 'no';
      note('callback.bridgeSaw', 'token request arrived: ' + arrived + ', bridge ' + seen.bridgeRuntime);
    } catch (e2) { note('callback.traceFailed', String(e2 && e2.message).slice(0, 80)); }

    const out = {
      ok: false, reason: 'bridge-unreachable',
      sentence: 'This page could not reach Viberant on your computer.',
      action: arrived === 'yes'
        ? 'Viberant received it but your browser would not hand the answer back. The debug panel has the detail.'
        : 'Check Viberant is open on this computer, then press Connect again.',
      detail: String(e && e.message ? e.message : e).slice(0, 140) + ' (bridge saw it: ' + arrived + ')',
    };
    note('callback.exchangeThrew', out.detail);
    announce(out); return out;
  }

  if (result && result.ok && result.token) {
    localStorage.setItem(KEY, result.token);
    try { localStorage.removeItem(HALF); } catch (e) { void e; }
    note('callback.stored', 'session kept');
  } else {
    note('callback.refused', result && result.sentence);
  }
  clean();
  announce(result && result.ok ? { ok: true } : { ok: false, reason: 'refused', sentence: (result && result.sentence) || 'The approval was not accepted.', action: (result && result.action) || 'Press Connect and approve it again.' });

  // Terminal either way, so nobody is left looking at two pages that disagree.
  if (result && result.ok) {
    try { document.body && (document.body.dataset.viberantPaired = '1'); } catch (e) { void e; }
    if (window.opener) setTimeout(() => { try { window.close(); } catch (e) { void e; } }, 400);
  }
  return result;
}

/** Everything worth knowing about this page's handshake, with nothing secret in it. */
function diagnostics() {
  let log = []; let result = null;
  try { log = JSON.parse(localStorage.getItem(LOG) || '[]'); } catch (e) { void e; }
  try { result = JSON.parse(localStorage.getItem(RESULT) || 'null'); } catch (e) { void e; }
  return {
    runtime: RUNTIME, made: MADE, project: PROJECT, origin: location.origin, agent: AGENT,
    session: localStorage.getItem(KEY) ? 'present' : 'missing',
    half: localStorage.getItem(HALF) ? 'present' : 'missing',
    broadcast: channel ? 'available' : 'unavailable',
    opener: window.opener ? 'present' : 'severed',
    lastResult: result, steps: log,
  };
}

async function call(method, values = {}) {
  const token = localStorage.getItem(KEY);
  if (!token) return { ok: false, sentence: 'This web version is not connected to Viberant.', action: 'Connect the desktop companion first.' };
  try {
    const response = await fetch(AGENT + '/web-companion/call', { method: 'POST', mode: 'cors', targetAddressSpace: 'local', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ method, ...values }) });
    const result = await response.json(); if (!result.ok && /not connected/i.test(result.sentence || '')) localStorage.removeItem(KEY); return result;
  } catch { return { ok: false, sentence: 'The desktop companion could not be reached.', action: 'Open Viberant on the desktop computer and try again.' }; }
}

/** What the computer says it saw, asked for directly. Non-secret, loopback only. */
async function bridge() {
  try {
    const r = await fetch(AGENT + '/web-companion/trace');
    if (!r.ok) return { reachable: false, why: 'HTTP ' + r.status };
    const seen = await r.json();
    return { reachable: true, runtime: seen.bridgeRuntime, startedAt: seen.startedAt, seen: seen.seen || [] };
  } catch (e) { return { reachable: false, why: String(e && e.message ? e.message : e).slice(0, 90) }; }
}

window.ViberantCompanion = { connect, call, connected: () => !!localStorage.getItem(KEY), diagnostics, bridge, runtime: RUNTIME };
completePairing().catch((e) => note('callback.crashed', e && e.message));
`;
}

async function writeManifest(target, root, report, source = null, architecture = null) {
  const id = webcompanion.projectId(root);
  const wants = architecture ?? (report.blockers.length ? 'WEB_COMPANION' : 'STANDALONE_WEB');
  await writeFile(join(target, 'viberant-web-target.json'), JSON.stringify({
    version: 2, createdAt: new Date().toISOString(), source,
    desktopProject: '..', projectId: id,
    recommendation: wants,
    isolatedCapabilities: report.blockers.map((one) => one.id),
    companionAdapters: wants === 'WEB_COMPANION' ? ['project.status', 'files.list', 'files.read'] : [],
  }, null, 2), 'utf8');
  if (wants === 'WEB_COMPANION') await writeFile(join(target, 'viberant-companion.js'), companionClient(id), 'utf8');
  return id;
}

async function makeReactTarget(root, target, entry, source, report, architecture = null) {
  const closure = sourceClosure(entry, source.files);
  if (matches(closure.files).length) return null;
  const pkg = await packageAt(root);
  const available = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  if (!available.react || !available['react-dom']) return null;

  for (const one of closure.files) {
    const to = join(target, 'src', ...one.name.split('/'));
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(root, ...one.name.split('/')), to);
  }
  for (const asset of closure.assets) {
    const from = join(root, ...asset.split('/'));
    if (!existsSync(from)) continue;
    const to = join(target, 'src', ...asset.split('/'));
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  }

  const used = new Set(closure.files.flatMap((one) => importNames(one.text).map(packageName)).filter(Boolean));
  used.add('react'); used.add('react-dom');
  const dependencies = Object.fromEntries([...used].filter((name) => available[name]).map((name) => [name, available[name]]));
  const devDependencies = { vite: available.vite || 'latest' };
  if (/\.tsx?$/.test(entry.name)) devDependencies.typescript = available.typescript || 'latest';
  for (const name of ['@types/react', '@types/react-dom']) if (available[name]) devDependencies[name] = available[name];
  await writeFile(join(target, 'package.json'), `${JSON.stringify({
    name: `${basename(root).toLowerCase().replace(/[^a-z0-9-]/g, '-')}-web`, private: true, type: 'module',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' }, dependencies, devDependencies,
  }, null, 2)}\n`, 'utf8');
  const mount = entry.text.match(/getElementById\(['"]([^'"]+)/)?.[1] || 'root';
  const wantsCompanion = architecture === 'WEB_COMPANION' || (!architecture && report.blockers.length);
  const companion = wantsCompanion
    ? `  <script type="module" src="/viberant-companion.js"></script>\n${companionPill()}`
    : '';
  await writeFile(join(target, 'index.html'), `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${basename(root).replace(/[<&]/g, '')}</title></head><body><div id="${mount}"></div>\n  <script type="module" src="/src/${entry.name}"></script>\n${companion}</body></html>\n`, 'utf8');
  await writeManifest(target, root, report, entry.name, architecture);
  return target;
}

/** What an existing target says it is, read from its own manifest. */
async function recordedArchitecture(targetRoot) {
  try {
    const manifest = JSON.parse(await readFile(join(targetRoot, 'viberant-web-target.json'), 'utf8'));
    return manifest?.recommendation === 'WEB_COMPANION' || manifest?.recommendation === 'STANDALONE_WEB'
      ? manifest.recommendation : null;
  } catch { return null; }
}

/** Inspect one project without writing to it or starting anything. */
export async function analyze(dir) {
  const root = resolve(dir);
  const [web, deployed, source] = await Promise.all([
    providers.webPartOf(root),
    providers.bindingFor(root),
    sources(root),
  ]);
  const blockers = matches(source.files);
  const browserFiles = source.files.filter((one) => /\.html$|\.(?:jsx|tsx)$/.test(one.name)
    || /document\.|window\.|createRoot\(|ReactDOM|customElements/.test(one.text));

  const packageFile = await packageAt(root);
  const allDependencies = { ...(packageFile?.dependencies ?? {}), ...(packageFile?.devDependencies ?? {}) };
  const desktopRoot = web.ok && web.root === root && blockers.length > 0
    && (allDependencies.electron || allDependencies['@tauri-apps/api']
      || Object.values(packageFile?.scripts ?? {}).some((line) => /\belectron\b|\btauri\b/.test(String(line))));

  if (web.ok && !desktopRoot) {
    return {
      ok: true,
      project: basename(root),
      desktop: { status: 'READY', says: 'The original project stays unchanged.' },
      web: {
        status: deployed?.url ? 'LIVE' : 'READY',
        category: 'WEB_SAFE',
        root: web.root,
        inside: web.inside ?? null,
        at: deployed?.url ?? null,
        architecture: await recordedArchitecture(web.root),
        says: web.inside
          ? `A web target already exists in ${web.inside}.`
          : 'This project already has a browser-safe target.',
      },
      recommendation: 'STANDALONE_WEB',
      blockers,
      scanned: source.files.length,
      clipped: source.clipped,
    };
  }

  const hasBrowserSurface = browserFiles.length > 0;
  const desktopOnly = !hasBrowserSurface && blockers.length > 0;
  return {
    ok: true,
    project: basename(root),
    desktop: { status: 'READY', says: 'The desktop project stays unchanged.' },
    web: {
      status: desktopOnly ? 'BLOCKED' : 'NEEDS_ADAPTATION',
      category: desktopOnly ? 'DESKTOP_ONLY' : 'ADAPTER_REQUIRED',
      root: null,
      at: null,
      says: desktopOnly
        ? 'No meaningful browser surface was found, and native capabilities cannot run in a website.'
        : 'A browser surface exists, but native capabilities need explicit adapters before it can be deployed.',
    },
    recommendation: blockers.length ? 'WEB_COMPANION' : 'STANDALONE_WEB',
    blockers,
    browserFiles: browserFiles.slice(0, 10).map((one) => one.name),
    scanned: source.files.length,
    clipped: source.clipped,
  };
}

/**
 * Confirm the safe part of "Create Web Version".
 *
 * Existing browser targets need no generated files. Native projects stop with
 * the exact adapter work still required; producing a decorative page and
 * calling it a version would be a false success.
 *
 * `architecture` is the person's explicit choice between the two shapes a web
 * version can take, and it is honoured or refused with the reason — never
 * quietly replaced with the other one.
 */
export async function create(dir, { architecture = null } = {}) {
  const choice = architecture === 'WEB_COMPANION' || architecture === 'STANDALONE_WEB' ? architecture : null;
  const report = await analyze(dir);
  if (report.web.category === 'WEB_SAFE') {
    return {
      ok: true,
      report,
      root: report.web.root,
      sentence: 'The existing browser target is ready to preview or deploy.',
      action: report.web.at ? 'Open the live site, or deploy an update.' : 'Use Deploy to preview the target and put it online.',
    };
  }
  /*
   * A browser entry that is already isolated from native code can become a
   * useful target without translating the desktop application. This is the
   * safe, common adapter-required case: the project has a renderer/UI file and
   * the native work lives elsewhere. We copy only that browser entry and CSS
   * beside it; computer-only modules remain in the desktop project.
   */
  const root = resolve(dir);
  const source = await sources(root);

  const reactEntries = source.files.filter((one) => /\.(?:jsx|tsx)$/i.test(one.name)
    && /createRoot\s*\(|ReactDOM\.(?:render|createRoot)\s*\(/.test(one.text))
    .sort((a, b) => a.name.localeCompare(b.name));

  const candidates = source.files.filter((one) => /\.(?:m?js)$/i.test(one.name)
    && /document\.|window\.|customElements/.test(one.text)
    && !/^\s*(?:import|export)\s/m.test(one.text)
    && !/\brequire\s*\(/.test(one.text)
    && matches([one]).length === 0)
    .sort((a, b) => {
      const rank = (name) => /(?:^|\/)(?:renderer|ui|client|app)(?:\.|\/)/i.test(name) ? 0 : 1;
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
    });

  // A choice that cannot work is refused before anything is written, with the
  // reason, so nothing half-made is left behind to block the next attempt.
  if (choice === 'STANDALONE_WEB' && report.web.category === 'DESKTOP_ONLY') {
    return {
      ok: false, report,
      sentence: 'No browser surface was found here, so a standalone web version has nothing to show.',
      action: 'Add browser interface files first, or choose the Web Companion instead.',
    };
  }
  if (choice === 'STANDALONE_WEB' && !reactEntries[0] && !candidates[0]) {
    return {
      ok: false, report,
      sentence: 'No part of this project can stand alone in a browser yet — every browser-facing file still reaches computer-only capabilities.',
      action: 'Separate the browser interface from the native work, or choose the Web Companion instead.',
    };
  }

  const target = join(root, 'web');
  if (existsSync(target)) {
    return {
      ok: false,
      report,
      sentence: 'A web folder already exists but is not a usable target yet.',
      action: 'Finish or rename that folder, then run Create Web Version again.',
    };
  }
  await mkdir(target, { recursive: false });

  /*
   * Both shapes make the project's own web version. That is the whole of what
   * this button says it does.
   *
   * Choosing Web Companion used to stop here and write a card that said the
   * project relies on desktop capabilities — and that card *became* the site.
   * Whatever the project actually was never got carried across, so pressing
   * Deploy put a connection dialog online instead of the product. The companion
   * is plumbing: it belongs inside the real web version, next to it, not
   * instead of it. So the same target is built either way, and the difference
   * is only whether the runtime that talks to this computer goes in with it.
   */
  const react = reactEntries[0]
    ? await makeReactTarget(root, target, reactEntries[0], source, report, choice)
    : null;
  if (react) {
    return {
      ok: true, report: await analyze(root), root: target,
      sentence: 'A React web version was created from the browser-safe project surface.',
      action: report.blockers.length && choice !== 'STANDALONE_WEB'
        ? 'Install its existing web dependencies, preview it, and connect the desktop companion for approved native adapters.'
        : 'Install its existing web dependencies, preview it, then use Deploy when it looks right.',
    };
  }

  const entry = candidates[0] ?? null;
  if (entry) {
    await copyFile(join(root, ...entry.name.split('/')), join(target, 'app.js'));

    const entryDir = entry.name.includes('/') ? entry.name.slice(0, entry.name.lastIndexOf('/')) : '';
    const css = source.files.filter((one) => /\.css$/i.test(one.name)
      && (entryDir ? one.name.startsWith(`${entryDir}/`) : !one.name.includes('/')))
      .slice(0, 6);
    for (let i = 0; i < css.length; i += 1) {
      await copyFile(join(root, ...css[i].name.split('/')), join(target, `style${i || ''}.css`));
    }

    const styles = css.map((_one, i) => `<link rel="stylesheet" href="./style${i || ''}.css">`).join('\n  ');
    const wantsCompanion = choice === 'WEB_COMPANION' || (!choice && report.blockers.length);
    const companion = wantsCompanion
      ? `  <script type="module" src="./viberant-companion.js"></script>\n${companionPill()}`
      : '';
    await writeFile(join(target, 'index.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${basename(root).replace(/[<&]/g, '')}</title>
  ${styles}
</head>
<body>
  <main id="app" aria-live="polite"></main>
  <script src="./app.js"></script>
${companion}
</body>
</html>\n`, 'utf8');
    await writeManifest(target, root, report, entry.name, choice);

    const ready = await analyze(root);
    return {
      ok: true,
      report: ready,
      root: target,
      sentence: 'A browser-safe web version was created in the web folder.',
      action: 'Preview it, then use Deploy when it looks right.',
    };
  }

  /*
   * Nothing here could become a web version, and saying so is the only honest
   * answer left.
   *
   * What used to happen instead was a card explaining that the project needs a
   * desktop computer — written into an empty folder, previewed as though it
   * were the project, and put online by Deploy as though the project were now
   * live. It was not. A connection dialog with somebody's project name on it
   * is not that project, and calling it one is the kind of false success this
   * app is not allowed to hand anybody. So the empty folder goes, and what is
   * missing is named.
   */
  await rmdir(target).catch(() => null);
  const missing = report.blockers.slice(0, 3).map((one) => one.says);
  return {
    ok: false,
    report,
    needsWork: true,
    sentence: 'This project has no browser interface that can be put online yet.',
    action: (report.browserFiles ?? []).length
      ? `Its browser-facing files still reach ${missing.join(', ') || 'this computer'}. Separate that part, then create the web version again.`
      : 'Add the part people would see in a browser — a page and the code behind it — then create the web version again.',
  };
}

/**
 * Where a web version says whether the desktop is there, kept small on purpose.
 *
 * The companion is something the application uses, not something it is. So this
 * is a corner of the page rather than the page: the project renders as itself,
 * and whatever needs this computer says so quietly beside it.
 */
function companionPill() {
  return `  <div id="viberant-companion-state" hidden></div>
  <style>#viberant-companion-state{position:fixed;right:12px;bottom:12px;z-index:2147483000;display:flex;align-items:center;gap:8px;padding:7px 11px;border:1px solid #2c3450;border-radius:999px;background:rgba(12,16,28,.92);color:#cbd3e6;font:500 12px/1 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.28)}#viberant-companion-state[hidden]{display:none}#viberant-companion-state .dot{width:7px;height:7px;border-radius:50%;background:#59d98c}#viberant-companion-state.off .dot{background:#8b93a8}#viberant-companion-state button{padding:5px 10px;border:0;border-radius:999px;background:#6f52ff;color:#fff;font:inherit;cursor:pointer}</style>
  <script type="module">
    const box = document.querySelector('#viberant-companion-state');
    const paint = () => {
      if (!window.ViberantCompanion) return;
      const on = window.ViberantCompanion.connected();
      box.hidden = false;
      box.className = on ? '' : 'off';
      box.innerHTML = on
        ? '<span class="dot"></span><span>Desktop connected</span>'
        : '<span class="dot"></span><span>Desktop not connected</span><button type="button">Connect</button>';
      const press = box.querySelector('button');
      if (press) press.onclick = async () => { press.disabled = true; await window.ViberantCompanion.connect(); paint(); };
    };
    paint();
    setInterval(paint, 1500);
  </script>
`;
}
