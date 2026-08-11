/**
 * Publisher-owned Internet Workspace endpoints.
 *
 * A person may still override these in Settings. Packaged defaults live in
 * services.json and deployment environments may replace them without editing
 * source. No secret belongs in this file: the control plane authenticates
 * signed device messages and the relay only forwards encrypted bytes.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG = join(dirname(fileURLToPath(import.meta.url)), 'services.json');
let held = null;

async function configuration() {
  if (held) return held;
  try { held = JSON.parse(await readFile(CONFIG, 'utf8')); } catch { held = {}; }
  return held;
}

const value = async (environment, field) => String(
  process.env[environment] || (await configuration())?.[field] || '',
).trim();

export const workspaceService = () => value('VIBERANT_WORKSPACE_SERVICE', 'workspaceService');
export const relayService = () => value('VIBERANT_RELAY_SERVICE', 'relayService');
export const directService = () => value('VIBERANT_DIRECT_ADDRESS', 'directAddress');

/** Parse host[:port], including bracketed IPv6, without accepting a URL path. */
export function hostAndPort(said, fallbackPort) {
  const text = String(said ?? '').trim();
  if (!text) return null;
  try {
    const url = new URL(text.includes('://') ? text : `tcp://${text}`);
    if (!url.hostname || (url.pathname && url.pathname !== '/')) return null;
    const port = Number(url.port) || fallbackPort;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { host: url.hostname, port };
  } catch { return null; }
}

/**
 * A relay may be the original raw TCP service or the publisher's secure
 * WebSocket endpoint. Keeping both shapes here lets self-hosted installations
 * continue unchanged while the packaged app can use Cloudflare's WSS edge.
 */
export function relayEndpoint(said, fallbackPort) {
  const text = String(said ?? '').trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
    if (url.protocol === 'wss:' || (url.protocol === 'ws:' && local)) {
      url.hash = '';
      return { kind: 'websocket', url: url.toString().replace(/\/$/, '') };
    }
  } catch { /* the raw TCP form is handled below */ }
  const raw = hostAndPort(text, fallbackPort);
  return raw ? { kind: 'tcp', ...raw } : null;
}

export function resetForTests() { held = null; }
