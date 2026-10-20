# flotsam-proxy

CORS proxy so the PWA can call `app.graydient.ai` (which sends no CORS headers). Android (Capacitor) doesn't need it.

- Forwards only `GET`/`POST` under `/api/v3/` to `https://app.graydient.ai`; requires an `Authorization` header.
- Stores nothing and logs nothing (requests carry users' API keys). Request/response bodies are streamed, so the SSE stream on `POST render/` passes through.
- Allowed browser origins: `ALLOWED_ORIGINS` in `wrangler.toml` (comma-separated). Set your real PWA origin before deploying; never `*` in production.
- Does not proxy the `render-events` WebSocket; clients connect to Graydient for that directly.

## Use
    cd worker && npm install      # installs wrangler
    npm run dev                   # local, free (wrangler dev)
    npm run deploy                # needs a Cloudflare account; deliberately not run by the agent

Point the app at it with `VITE_API_BASE=https://<worker-url>/api/v3/`.

Tests live in `src/index.test.ts` and run with the root `npm test`.
