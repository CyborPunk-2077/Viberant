import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'app', 'oauth.json');
const servicesPath = join(root, 'app', 'services.json');

let config = {};
try { config = JSON.parse(await readFile(configPath, 'utf8')); } catch { /* reported below */ }
let services = {};
try { services = JSON.parse(await readFile(servicesPath, 'utf8')); } catch { /* optional below */ }

const clientId = String(process.env.VIBERANT_GITHUB_CLIENT_ID || config.githubClientId || '').trim();
const secret = String(process.env.VIBERANT_GITHUB_CLIENT_SECRET || config.githubClientSecret || '').trim();
const googleClientId = String(process.env.VIBERANT_GOOGLE_CLIENT_ID || config.googleClientId || '').trim();
const googleSecret = String(process.env.VIBERANT_GOOGLE_CLIENT_SECRET || config.googleClientSecret || '').trim();
const workspaceService = String(process.env.VIBERANT_WORKSPACE_SERVICE || services.workspaceService || '').trim();
const relayService = String(process.env.VIBERANT_RELAY_SERVICE || services.relayService || '').trim();
const directAddress = String(process.env.VIBERANT_DIRECT_ADDRESS || services.directAddress || '').trim();

if (secret) {
  throw new Error(
    'Production packaging stopped: a GitHub client secret was supplied. '
    + 'Viberant uses GitHub device authorization and must package only the public client ID.',
  );
}

if (!/^[A-Za-z0-9._-]{16,80}$/.test(clientId)) {
  throw new Error(
    'Production packaging stopped: VIBERANT_GITHUB_CLIENT_ID is missing or invalid. '
    + 'Set it to the public client ID of the publisher-owned GitHub OAuth app, then run npm run build again.',
  );
}

if (googleSecret) {
  throw new Error(
    'Production packaging stopped: a Google client secret was supplied. '
    + 'Viberant uses the Desktop OAuth authorization-code flow with PKCE and packages only the public client ID.',
  );
}

if (!/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClientId)) {
  throw new Error(
    'Production packaging stopped: VIBERANT_GOOGLE_CLIENT_ID is missing or invalid. '
    + 'Set it to the public client ID of the publisher-owned Google Desktop OAuth application, then run npm run build again.',
  );
}

if (config.githubClientId !== clientId || config.googleClientId !== googleClientId || config.googleClientSecret) {
  await writeFile(configPath, `${JSON.stringify({
    ...config,
    githubClientId: clientId,
    googleClientId,
    googleClientSecret: '',
  }, null, 2)}\n`, 'utf8');
}

if (workspaceService && !/^https:\/\/[^/\s]+(?:\/[^\s]*)?$/.test(workspaceService)) {
  throw new Error('Production packaging stopped: VIBERANT_WORKSPACE_SERVICE must be a public HTTPS address.');
}
if (relayService
  && !/^wss:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(relayService)
  && !/^(?:\[[0-9a-f:]+\]|[^:\s/]+):[0-9]{1,5}$/i.test(relayService)) {
  throw new Error('Production packaging stopped: VIBERANT_RELAY_SERVICE must be a secure WebSocket address or host:port.');
}
if (directAddress && !/^(?:\[[0-9a-f:]+\]|[^:\s/]+)(?::[0-9]{1,5})?$/i.test(directAddress)) {
  throw new Error('Production packaging stopped: VIBERANT_DIRECT_ADDRESS must be host or host:port.');
}
if (services.workspaceService !== workspaceService
  || services.relayService !== relayService
  || services.directAddress !== directAddress) {
  await writeFile(servicesPath, `${JSON.stringify({
    workspaceService, relayService, directAddress,
  }, null, 2)}\n`, 'utf8');
}

console.log('GitHub device authorization is configured for this production package.');
console.log('Google Desktop OAuth with PKCE is configured for this production package.');
console.log(workspaceService && relayService
  ? 'Internet Workspace endpoints are configured for this production package.'
  : 'Internet Workspace endpoints are not embedded; LAN Workspace remains available.');
