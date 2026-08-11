# Free Cloudflare Internet Workspace

This is the publisher deployment for Viberant's Internet Workspace. It uses
one Worker and two SQLite-backed Durable Object classes, which are available on
Cloudflare's Workers Free plan.

- `WorkspacePlane` stores hashed workspace capabilities, short-lived presence,
  invitation fingerprints and one-use relay tickets.
- `RelayPair` pairs two secure WebSocket connections and forwards only the
  existing end-to-end encrypted byte stream. It uses WebSocket hibernation.

It never stores projects, filenames, chat text, changes, builds, credentials or
private keys. LAN and a direct Internet connection are still tried before WSS.

## Deploy

From the repository root:

```powershell
npx wrangler login
npm run workspace:cloudflare:deploy
```

Wrangler prints a URL such as:

```text
https://viberant-workspace.<your-subdomain>.workers.dev
```

Check it:

```powershell
Invoke-RestMethod https://viberant-workspace.<your-subdomain>.workers.dev/health
```

The result must say `ok: true` and `storage: durable-objects`.

No Cloudflare secret, paid plan, database, bucket, TCP proxy or separate relay
host is required. Cloudflare supplies TLS for both HTTPS and WSS. The Worker
configuration uses `new_sqlite_classes`, which is required for free Durable
Objects.

## Put the endpoints in the Windows package

Use the same Worker for coordination and relay fallback:

```powershell
$env:VIBERANT_WORKSPACE_SERVICE = 'https://viberant-workspace.<your-subdomain>.workers.dev'
$env:VIBERANT_RELAY_SERVICE = 'wss://viberant-workspace.<your-subdomain>.workers.dev/relay'
npm run build
```

`build/require-oauth.mjs` validates and writes these public addresses into
`app/services.json` before packaging. They are not credentials. A local
Settings override still wins.

For a custom domain, attach it to the Worker and use its HTTPS/WSS names in the
same commands. Do not put Cloudflare Access login in front of this Worker: the
desktop protocol authenticates every control request with its Ed25519 device
key and a workspace capability, while invitation and relay tickets expire and
work once.

## Local Cloudflare test

```powershell
npm run workspace:cloudflare:dev
```

For a local package or two local server instances, use the HTTPS/WSS addresses
Wrangler prints. Production packages refuse unencrypted public endpoints.

## Free-plan operating facts

The relay sends each existing Viberant stream chunk as one binary WebSocket
message, below Cloudflare's 32 MiB limit. Durable Object hibernation means an
idle relay pair does not keep consuming duration. Extremely large or highly
active teams can exhaust Cloudflare's daily free quotas; the app then reports
the service as unreachable and continues to use LAN/direct paths where they
are available. No project data is retained for retry—the existing resumable
peer transfer restarts from its locally recorded position after connectivity
returns.
