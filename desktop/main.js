/**
 * Viberant as a window of its own.
 *
 * This file is a shell and nothing else. It starts the same server that
 * `node app/server.mjs` starts, waits until it is answering, and points a
 * window at it. It holds no truth, decides nothing, and knows nothing about
 * projects or accounts — everything that matters is behind the server, exactly
 * where it is when you run this from a terminal.
 *
 * The one thing it adds: Electron carries its own copy of Node, so the person
 * running this does not need Node installed.
 */

const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const http = require('node:http');

const PORT = Number(process.env.PORT || 7777);
const ADDRESS = `http://127.0.0.1:${PORT}`;

let server = null;
let win = null;

/**
 * Is the manager answering yet?
 *
 * Ask for the page itself, which is one file read, rather than for anything
 * that has to go and look at your projects — looking at projects means running
 * git once per project, and on a cold machine that is slower than any sensible
 * patience for "are you there". Asking the expensive question here is how this
 * window came to say the manager had not started while it was in fact running
 * and answering perfectly well.
 */
function answering() {
  return new Promise((resolve) => {
    const req = http.get(ADDRESS, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for it to come up. Ten seconds is long enough for a cold, busy machine. */
async function waitUntilAnswering() {
  for (let i = 0; i < 100; i++) {
    if (await answering()) return true;
    await wait(100);
  }
  return false;
}

/**
 * Start the server, unless one is already running.
 *
 * Someone may already have it open in a browser tab. Starting a second one
 * would take the port and fail, so we simply use the one that is there.
 */
async function startServer() {
  if (await answering()) return;

  server = spawn(process.execPath, [join(app.getAppPath(), 'app', 'server.mjs')], {
    // ELECTRON_RUN_AS_NODE turns this same binary into plain Node, which is how
    // the server runs without Node being installed on the machine.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(PORT) },
    stdio: 'ignore',
  });
  server.on('error', () => { server = null; });
}

async function open() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    title: 'Viberant',
    autoHideMenuBar: true,
    backgroundColor: '#111111',
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  // Anything that wants a new window is a link to the wider web. Those belong
  // in the browser, not in here.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await startServer();
  const up = await waitUntilAnswering();

  if (up) {
    await win.loadURL(ADDRESS);
  } else {
    // One plain sentence about what is true, and one thing to do about it.
    await win.loadFile(join(__dirname, 'trouble.html'));
  }
  win.show();
}

app.whenReady().then(open);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) open();
});

app.on('window-all-closed', () => app.quit());

// Closing the window stops the server too. Leaving one running invisibly, with
// no window to close, would be a thing that comes at you.
app.on('before-quit', () => {
  if (server) { server.kill(); server = null; }
});
