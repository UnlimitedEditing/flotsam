# Flotsam

An independent mobile client for your own Graydient account: run workflows from your phone, see results, and view the 3D and data files some workflows return.

**Flotsam is not made, endorsed or supported by Graydient.** It has no accounts and no analytics; your API key and history stay on your device.

> **Status: pre-release.** The Terms and Content Policy text is a draft and has not been through legal review. Do not distribute builds publicly until `docs/privacy-and-terms.md` is complete. The app can show adult content: it needs an 18+ confirmation, blurs media by default and hides adult workflows until you turn them on.

## What is here

- `src/`: the web app (React + TypeScript, installable as a PWA).
- `android/`: the Android shell (Capacitor + a Kotlin plugin: native networking, encrypted key storage, biometric unlock, share-in, background render checks, self-update).
- `worker/`: a small Cloudflare Worker that proxies the web version (Graydient and Catbox send no CORS headers).
- `scripts/`, `.github/workflows/`: release tooling and CI.
- `docs/`: `android.md`, `updates.md`, `release.md`, `deploy-pwa.md`, `privacy-and-terms.md`, `api-notes.md`, `download-page.md`, `testing-on-a-phone.md`, `test-checklist.md`, `design.md`, `rigging.md`, `roadmap/` (next features).

## Develop

```bash
npm install
npm run dev          # web app with the dev proxies
npm test             # builds, then web tests + the service-worker guard
```

Android: see `docs/android.md`. Releases: see `docs/release.md`.

## Releases

Signed APKs are built by GitHub Actions from version tags and published on the Releases page. Check any APK with `apksigner verify --print-certs`; the certificate SHA-256 should be
`648a7c2c58a720d1445a21ea1d693d1bf93fa95302dd607d4c967568c1a250d4`.

## License

No license has been chosen yet. Until one is added, all rights are reserved.
