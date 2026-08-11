/**
 * A truthful Desktop/Web capability report for one project.
 *
 * This does not translate arbitrary native code. It identifies an existing
 * web surface, the native capabilities that need adapters, and whether there
 * is enough browser UI to make a companion meaningful. The deploy machinery
 * remains the only thing that publishes a site.
 */
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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

function companionClient(id) {
  return `const AGENT = 'http://127.0.0.1:7777';
const PROJECT = '${id}';
const KEY = 'viberant:companion:' + PROJECT;
const bytes = (size = 32) => { const value = new Uint8Array(size); crypto.getRandomValues(value); return btoa(String.fromCharCode(...value)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); };
const digest = async (value) => { const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return btoa(String.fromCharCode(...new Uint8Array(data))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); };

async function connect() {
  const verifier = bytes(48); const state = bytes(24); const challenge = await digest(verifier);
  sessionStorage.setItem(KEY + ':verifier', verifier); sessionStorage.setItem(KEY + ':state', state);
  const back = location.origin + location.pathname;
  const url = new URL(AGENT + '/web-companion/pair');
  url.search = new URLSearchParams({ project: PROJECT, origin: location.origin, return: back, challenge, state });
  const opened = window.open(url, 'viberant-companion', 'popup,width=620,height=680');
  if (!opened) location.href = url;
  return new Promise((resolve) => {
    const heard = (event) => { if (event.origin === location.origin && event.data?.type === 'viberant-companion') { window.removeEventListener('message', heard); resolve(event.data); } };
    window.addEventListener('message', heard);
  });
}

async function completePairing() {
  const at = new URL(location.href); const code = at.searchParams.get('viberant_code');
  if (!code) return null;
  const state = at.searchParams.get('viberant_state');
  if (state !== sessionStorage.getItem(KEY + ':state')) return null;
  const response = await fetch(AGENT + '/web-companion/token', { method: 'POST', mode: 'cors', targetAddressSpace: 'local', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, verifier: sessionStorage.getItem(KEY + ':verifier') }) });
  const result = await response.json();
  if (result.ok) localStorage.setItem(KEY, result.token);
  at.searchParams.delete('viberant_code'); at.searchParams.delete('viberant_state'); history.replaceState({}, '', at);
  window.opener?.postMessage({ type: 'viberant-companion', ...result }, location.origin);
  if (window.opener && result.ok) window.close();
  return result;
}

async function call(method, values = {}) {
  const token = localStorage.getItem(KEY);
  if (!token) return { ok: false, sentence: 'This web version is not connected to Viberant.', action: 'Connect the desktop companion first.' };
  try {
    const response = await fetch(AGENT + '/web-companion/call', { method: 'POST', mode: 'cors', targetAddressSpace: 'local', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ method, ...values }) });
    const result = await response.json(); if (!result.ok && /not connected/i.test(result.sentence || '')) localStorage.removeItem(KEY); return result;
  } catch { return { ok: false, sentence: 'The desktop companion could not be reached.', action: 'Open Viberant on the desktop computer and try again.' }; }
}

window.ViberantCompanion = { connect, call, connected: () => !!localStorage.getItem(KEY) };
completePairing();
`;
}

async function writeManifest(target, root, report, source = null) {
  const id = webcompanion.projectId(root);
  await writeFile(join(target, 'viberant-web-target.json'), JSON.stringify({
    version: 2, createdAt: new Date().toISOString(), source,
    desktopProject: '..', projectId: id,
    recommendation: report.blockers.length ? 'WEB_COMPANION' : 'STANDALONE_WEB',
    isolatedCapabilities: report.blockers.map((one) => one.id),
    companionAdapters: report.blockers.length ? ['project.status', 'files.list', 'files.read'] : [],
  }, null, 2), 'utf8');
  if (report.blockers.length) await writeFile(join(target, 'viberant-companion.js'), companionClient(id), 'utf8');
  return id;
}

async function makeReactTarget(root, target, entry, source, report) {
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
  const companion = report.blockers.length ? '  <script type="module" src="/viberant-companion.js"></script>\n' : '';
  await writeFile(join(target, 'index.html'), `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${basename(root).replace(/[<&]/g, '')}</title></head><body><div id="${mount}"></div>\n${companion}  <script type="module" src="/src/${entry.name}"></script>\n</body></html>\n`, 'utf8');
  await writeManifest(target, root, report, entry.name);
  return target;
}

async function makeCompanionShell(root, target, report) {
  const id = await writeManifest(target, root, report, null);
  await writeFile(join(target, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${basename(root).replace(/[<&]/g, '')} Web Companion</title><style>body{font:16px system-ui;background:#090c14;color:#eef0ff;margin:0;min-height:100vh;display:grid;place-items:center}main{width:min(42rem,calc(100% - 3rem));padding:2rem;border:1px solid #30364b;border-radius:16px;background:#111522}button{padding:.7rem 1rem;border:0;border-radius:8px;background:#7048e8;color:white}pre{white-space:pre-wrap;color:#b8c0d2}</style><main><small>WEB COMPANION</small><h1>${basename(root).replace(/[<&]/g, '')}</h1><p>This project relies on desktop capabilities. Its web version connects to Viberant for the explicitly approved adapters and leaves native work on your computer.</p><button id="connect">Connect to Viberant</button><button id="inspect">Check connection</button><pre id="status">Not connected.</pre></main><script type="module" src="./viberant-companion.js"></script><script type="module" src="./app.js"></script>`, 'utf8');
  await writeFile(join(target, 'app.js'), `const status = document.querySelector('#status'); document.querySelector('#connect').onclick = async () => { status.textContent = 'Waiting for approval…'; const out = await ViberantCompanion.connect(); status.textContent = out?.ok ? 'Connected.' : (out?.sentence || 'Connection was not completed.'); }; document.querySelector('#inspect').onclick = async () => { const out = await ViberantCompanion.call('project.status'); status.textContent = out.ok ? JSON.stringify(out, null, 2) : out.sentence; };\n`, 'utf8');
  return { target, id };
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
 */
export async function create(dir) {
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

  const reactEntries = source.files.filter((one) => /\.(?:jsx|tsx)$/i.test(one.name)
    && /createRoot\s*\(|ReactDOM\.(?:render|createRoot)\s*\(/.test(one.text))
    .sort((a, b) => a.name.localeCompare(b.name));
  const react = reactEntries[0]
    ? await makeReactTarget(root, target, reactEntries[0], source, report)
    : null;
  if (react) {
    return {
      ok: true, report: await analyze(root), root: target,
      sentence: 'A React web version was created from the browser-safe project surface.',
      action: report.blockers.length
        ? 'Install its existing web dependencies, preview it, and connect the desktop companion for approved native adapters.'
        : 'Install its existing web dependencies, preview it, then use Deploy when it looks right.',
    };
  }

  if (report.web.category === 'DESKTOP_ONLY') {
    await makeCompanionShell(root, target, report);
    return {
      ok: true, report: await analyze(root), root: target,
      sentence: 'A truthful Web Companion target was created for this desktop-only project.',
      action: 'Preview it and approve the connection to Viberant. Native-only capabilities remain on the desktop computer.',
    };
  }

  const candidates = source.files.filter((one) => /\.(?:m?js)$/i.test(one.name)
    && /document\.|window\.|customElements/.test(one.text)
    && !/^\s*(?:import|export)\s/m.test(one.text)
    && !/\brequire\s*\(/.test(one.text)
    && matches([one]).length === 0)
    .sort((a, b) => {
      const rank = (name) => /(?:^|\/)(?:renderer|ui|client|app)(?:\.|\/)/i.test(name) ? 0 : 1;
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
    });

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
    const companion = report.blockers.length ? '  <script type="module" src="./viberant-companion.js"></script>\n' : '';
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
${companion}
  <script src="./app.js"></script>
</body>
</html>\n`, 'utf8');
    await writeManifest(target, root, report, entry.name);

    const ready = await analyze(root);
    return {
      ok: true,
      report: ready,
      root: target,
      sentence: 'A browser-safe web version was created in the web folder.',
      action: 'Preview it, then use Deploy when it looks right.',
    };
  }

  await makeCompanionShell(root, target, report);
  return {
    ok: true, report: await analyze(root), root: target,
    sentence: 'A Web Companion target was created for the compatible part of this desktop project.',
    action: 'Preview it and connect Viberant for the approved desktop adapters. Add browser UI to expand the web experience.',
  };
}
