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
- [ ] Does `app.graydient.ai` send CORS headers for a browser origin? (run `npm run dev`, enter key, press "List workflows"; a "Network/CORS error" means no.) If blocked: Capacitor native HTTP on Android, and a small proxy for the PWA.
- [ ] Web Push / FCM support (assumed none: polling + local notifications).
- [ ] Upload host for image inputs.
