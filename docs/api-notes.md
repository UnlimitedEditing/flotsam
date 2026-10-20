# Graydient API notes (as used by Flotsam)

Source: ported from `D:\ForgeExpress\cli\src\client.ts`. Items marked **unconfirmed** need a live check.

- Base URL: `https://app.graydient.ai/api/v3/`
- Auth: `Authorization: Bearer <API key>`; headers `Content-Type`/`Accept: application/vnd.api+json`.

| Purpose              | Call                                                                                                 | Status                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| List workflows       | `GET workflows/` (JSON:API, `data[].attributes`)                                                     | used in CLI; browser CORS **unconfirmed**         |
| Submit render        | `POST render/` `{prompt: "/workflow /run:<slug> ..."}`; response is an SSE stream with `render_hash` | CLI-confirmed                                     |
| Render status/result | `GET render/<hash>/`; media in `images[].media[]`                                                    | CLI-confirmed; status field names **unconfirmed** |
| Live completion      | WebSocket `wss://app.graydient.ai/render-events/<hash>?token=<key>`, event `done`                    | CLI uses as fallback                              |
| Cancel               | `POST render/<hash>/cancel/`                                                                         | CLI-confirmed                                     |
| Concepts / skills    | `GET concepts/`, `GET skills/`                                                                       | CLI-confirmed                                     |

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

## Phase 1 notes

- Command format sent to `POST render/`: `/workflow /run:<slug> /<field>:<value> ... <prompt> [<negative>]` (see `src/lib/command.ts`).
- Pagination: `fetchWorkflows` follows `links.next`. The real response shape is **unconfirmed**; the first page returned exactly 500, so run Settings > "Probe workflows API shape" (dev only) and record the output here.
- Job history, favorites, recents and prefs are stored in IndexedDB (URLs/metadata only, never media bytes).
- Images: Graydient only accepts URLs. Local photos need an ImageHost (none configured), so the Chat "Photo" button explains this; pasted URLs and previous results work.
- Gallery "Remove" deletes from this device only (no known server-side delete).

## Phase 1.5 findings (2026-10-20)

- **Pagination confirmed**: 658 workflows; `links.next` is `/api/v3/workflows?page=2&per_page=500` (no trailing slash). `?page=2` works; `page[number]`, `offset`, `page[offset]` are ignored.
- **No type/tag attribute.** Output type is derived from `supports_*` (also present: txt2mesh, img2mesh, mesh2img, mesh2vid, vid2img, vid2wav, wav2txt). `is_nsfw` exists and drives the adult toggle. `extra_data` and `external_provider` contents are unknown.
- **Field names** (count): seed 632, prompt_positive 501, width 422, height 419, steps 359, slot1 314, num_images 249, guidance 226, slot2 193, prompt_negative 190 (negative_prompt only 14), length 160, init_image_filename 140, slot3 133, fps 118, image1 87, init_image_url 83, ... `slot9` appears in 6 workflows although slots are documented as 1-8.
- **Command syntax (verified by the CLI notes)**: size is `/size:WxH` (the server rejects `/width:`/`/height:`); extra reference images are `/image1:URL1` plus `placeholders: {URL1: <url>}` (the key must look like `URL<n>`). `num_images` maps to `/images:N`. Untested keys: scheduler, scale, controlguidance, model.
- **S3 CORS**: `piratediffusion1.s3.amazonaws.com` sends `Access-Control-Allow-Origin: *` for GET/HEAD, so the browser can read result PNGs directly (needed for M3DS). Verified with a preflight; not yet with a real result.
- **Catbox**: alive, but its preflight returns 412 with no CORS headers. Dev uses the Vite `/catbox` proxy; the PWA needs the Worker route `POST /upload/catbox` (requires a valid Graydient key, 10 MB cap, forwards only the multipart body).
- **M3DS**: workflow backup JSONs carry no slug, so the registry cannot be seeded from local files. Default = workflows whose `supports_*` includes txt2mesh/img2mesh decode as M3DS `model3d`; everything else is a per-workflow override (Workflows > detail > Result type) or the manual "Open as M3DS" button on a result. A second carrier, the LLM/whisper family's "pixel-data image", is recognised in the registry but not decoded (its pixel layout is undocumented).
- **ModelTrends**: search is client-side rendered and there is no lookup endpoint, so ids are pasted per workflow (the 8-hex suffix of the model page URL). Fetched only while a workflow's detail is open, cached 24 h (404s too), link back always shown. Adult models 404.
