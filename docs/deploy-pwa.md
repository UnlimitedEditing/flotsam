# Deploying Flotsam as a PWA

Installing a PWA and running its service worker need **HTTPS** (localhost is the only exception). A phone cannot install from `http://192.168.x.x:5180`. Nothing below has been run by the build agent; it needs your Cloudflare account.

> Phase 3 (18+ gate, terms, privacy controls) is built, but the terms text is a **draft pending legal review**. Read `docs/privacy-and-terms.md` and complete its checklist before publishing publicly. Until then keep the origin private or unlisted.

## 1. Deploy the proxy Worker (`worker/`)

The PWA runs on its own origin, so it needs the CORS proxy (Graydient and Catbox send no CORS headers).

```bash
cd worker
npm install
npx wrangler login
```

Edit `worker/wrangler.toml` and set `ALLOWED_ORIGINS` to your PWA origin, comma-separated, e.g. `https://flotsam.pages.dev`. Never use `*` in production. Then:

```bash
npm run deploy
```

Note the Worker URL, e.g. `https://flotsam-proxy.<you>.workers.dev`. It forwards `GET/POST /api/v3/*` to Graydient and `POST /upload/catbox` to Catbox, stores nothing and logs nothing.

## 2. Build and host the app (Cloudflare Pages is free)

The build needs three values baked in:

| Variable               | Value                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| `VITE_API_BASE`        | `https://<worker-url>/api/v3/`                                   |
| `VITE_CATBOX_ENDPOINT` | `https://<worker-url>/upload/catbox`                             |
| `VITE_WS_BASE`         | leave unset (WebSockets go straight to `wss://app.graydient.ai`) |

Pages settings: build command `npm run build`, output directory `dist`, the variables above as build environment variables. (`npm test` builds first and also runs the service-worker safety guard.)

Routing is hash-based, so no redirect rules are needed.

## 3. Check it

- Chrome DevTools > Application: Manifest shows no errors and an installable app; Service Workers shows an activated worker; Cache Storage holds only `workbox-precache-*` (app shell: html, js, css, icons). If anything else appears there, stop: media or API data is being cached.
- Lighthouse (DevTools) > Progressive Web App / installability should pass.
- Android Chrome: open the site, use the in-app "Install app" button (Settings or the Chat empty state).
- iPhone Safari: Share > Add to Home Screen (the app shows a one-time hint).

## Notifications: what they can and cannot do

- The "Notify me when a render finishes" setting shows a system notification saying only **"Your render is ready"** (or "A render needs attention"), never the prompt, workflow name or any image.
- It fires only while Flotsam's page is still alive: open, or just moved to the background. iOS suspends backgrounded web apps within seconds; Android Chrome keeps them longer.
- Alerts with the app fully closed need a push service. Graydient offers none, so that is planned for the Android app (Phase 4: background checks) or a push backend later.

## Updates

A new deploy shows an "update is ready" banner. It cannot be applied while a render is running, so an update never interrupts one.

## Local production test

`.claude/launch.json` has a `flotsam-preview` entry (build with `VITE_API_BASE=/gd/` and `VITE_CATBOX_ENDPOINT=/catbox`, then `vite preview` with the same dev proxies). The built-in browser pane cannot run service workers; use a real Chrome.

`scripts/check-pwa.mjs` is the headless-Chrome check used to verify the service worker, cache contents and offline behaviour. It needs `puppeteer-core` (not a project dependency): copy it to a scratch folder with `npm i puppeteer-core`, run a preview, and run `node check-pwa.mjs`.
