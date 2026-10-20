# Graydient API notes (as used by Flotsam)

Source: ported from `D:\ForgeExpress\cli\src\client.ts`. Items marked **unconfirmed** need a live check.

- Base URL: `https://app.graydient.ai/api/v3/`
- Auth: `Authorization: Bearer <API key>`; headers `Content-Type`/`Accept: application/vnd.api+json`.

| Purpose | Call | Status |
|---|---|---|
| List workflows | `GET workflows/` (JSON:API, `data[].attributes`) | used in CLI; browser CORS **unconfirmed** |
| Submit render | `POST render/` `{prompt: "/workflow /run:<slug> ..."}`; response is an SSE stream with `render_hash` | CLI-confirmed |
| Render status/result | `GET render/<hash>/`; media in `images[].media[]` | CLI-confirmed; status field names **unconfirmed** |
| Live completion | WebSocket `wss://app.graydient.ai/render-events/<hash>?token=<key>`, event `done` | CLI uses as fallback |
| Cancel | `POST render/<hash>/cancel/` | CLI-confirmed |
| Concepts / skills | `GET concepts/`, `GET skills/` | CLI-confirmed |

Known behaviour
- One render per account at a time; submit sequentially.
- Video media rows can lag `rendering_done` by up to ~2 min; retry `GET render/<hash>/` with backoff.
- `callback_url` is a server-to-server webhook, unusable from a phone; use SSE/WS/polling.
- Image input needs a public URL; the CLI's old upload host is dead (open question).

## Open Phase 0 checks
- [x] **CORS: blocked (verified 2026-10-20).** `OPTIONS /api/v3/workflows/` with an Origin returns 404 and no `Access-Control-Allow-*` headers; the browser reports "Failed to fetch". Consequences:
  - Dev: Vite proxy `/gd` -> `app.graydient.ai/api/v3` (see `vite.config.ts`).
  - Android (Capacitor): use the native HTTP client (`CapacitorHttp`), which ignores CORS.
  - PWA (iOS + Android): needs a small CORS proxy we host (e.g. a Cloudflare Worker that forwards to the API and adds CORS headers; must pass through the SSE stream on `POST render/`). Never log or store the key in the proxy.
  - WebSocket `render-events` is not subject to CORS, so it can connect directly.
- [ ] Web Push / FCM support (assumed none: polling + local notifications).
- [ ] Upload host for image inputs.

## Dev gotcha: Node TLS
Node could not verify the `app.graydient.ai` certificate chain ("unable to verify the first certificate", the server likely omits its intermediate). `npm run dev` therefore starts Vite with `node --use-system-ca`, which uses the Windows certificate store. Without it the dev proxy returns 502.
