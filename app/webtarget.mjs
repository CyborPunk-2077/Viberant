/**
 * A truthful Desktop/Web capability report for one project.
 *
 * This does not translate arbitrary native code. It identifies an existing
 * web surface, the native capabilities that need adapters, and whether there
 * is enough browser UI to make a companion meaningful. The deploy machinery
 * remains the only thing that publishes a site.
 */
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import * as providers from './providers.mjs';

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

  if (web.ok) {
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
    recommendation: desktopOnly ? null : (blockers.length ? 'WEB_COMPANION' : 'STANDALONE_WEB'),
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
  if (report.web.category === 'DESKTOP_ONLY') {
    return {
      ok: false,
      report,
      sentence: 'This project has no browser surface that can become a useful web version automatically.',
      action: 'Add a browser interface first, then run the analysis again.',
    };
  }
  return {
    ok: false,
    report,
    sentence: 'The web version needs adapters before Viberant can create it safely.',
    action: report.recommendation === 'WEB_COMPANION'
      ? 'Isolate the listed computer-only capabilities behind a secure desktop companion, then run the analysis again.'
      : 'Replace the listed computer-only capabilities with browser-safe services, then run the analysis again.',
  };
}
