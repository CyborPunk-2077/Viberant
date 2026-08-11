# Self-hosted Internet Workspace deployment

For the free publisher deployment using Cloudflare Workers, Durable Objects
and secure WebSockets, use `docs/CLOUDFLARE_WORKSPACE_DEPLOYMENT.md`. The raw
TCP deployment below remains supported for private/self-hosted installations.

Viberant’s Internet Workspace uses two small public services:

- the introduction service: signed presence, expiring invitation marks and one-use relay tickets;
- the relay: a bounded TCP byte pipe between two holders of the same one-use ticket.

Neither service stores project files, chat, changes, credentials, or encryption keys. Project traffic is encrypted end to end by the two device keys before the relay receives it.

## Run the repo-side services

The example deployment is in `deploy/internet-workspace/compose.example.yaml`.

```powershell
docker compose -f deploy/internet-workspace/compose.example.yaml up -d --build
```

The introduction service listens on HTTP port `47781` inside the host and persists capability hashes and unexpired invitation records in the `workspace-plane` volume. The relay listens on public TCP port `47780`; its tickets and counters are intentionally memory-only.

## Public endpoints

1. Put an HTTPS reverse proxy or load balancer in front of `127.0.0.1:47781`. Forward every path and POST body unchanged, replace (do not append to) `X-Forwarded-For` with the connecting address, and keep `VIBERANT_TRUST_PROXY=1` only while the service is reachable exclusively through that trusted proxy. `GET /health` must answer with `{"ok":true}`.
2. Publish TCP port `47780` directly, or use a layer-4 TCP load balancer with idle timeouts longer than 90 seconds. Do not put the relay behind an HTTP proxy.
3. Give both services stable DNS names. The relay may share a machine with the introduction service, but it needs its own public TCP port.
4. Keep the introduction-service volume durable and backed up. Set restrictive host permissions; only hashed workspace capabilities are stored, but workspace/device relationship metadata is still private operational data.
5. Restrict inbound traffic to HTTPS for the introduction service and TCP `47780` for the relay. Do not expose the plane’s plain HTTP port publicly.

## Embed publisher defaults in the Windows package

Set these when building the installer:

```powershell
$env:VIBERANT_WORKSPACE_SERVICE = 'https://workspace.example.com'
$env:VIBERANT_RELAY_SERVICE = 'relay.example.com:47780'
npm run build
```

The build writes the public endpoints into `app/services.json`. They are not secrets. A local Settings value still overrides the publisher default.

For a host with a forwarded public direct-connection port, optionally set:

```powershell
$env:VIBERANT_DIRECT_ADDRESS = 'public-device.example.com:47779'
```

Ordinary installations should leave this unset. Viberant tries LAN first, then a STUN-discovered or explicitly configured direct address, then the encrypted relay.

## Production security checklist

- HTTPS certificate valid for the introduction-service hostname.
- Persistent plane state mounted at `VIBERANT_PLANE_STATE`.
- Relay TCP idle timeout at least 90 seconds and no payload inspection requirement.
- Host/container clocks synchronized; signed plane requests reject timestamps older than two minutes.
- Reverse-proxy request-body limit at or below 256 KiB and rate limiting retained in front of the service if available.
- GitHub OAuth device flow enabled for the publisher OAuth application.
- Google OAuth client type set to Desktop app, with its consent screen published for the intended users.

No cloud project-file bucket, database, GitHub command-line helper, or Google client secret is required.
