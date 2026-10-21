# Download page

A single static page (`site/` + `scripts/build-site.mjs`) that gets people installed: Android gets the APK and
three install steps, iPhone gets add-to-home-screen steps for the web app, desktop gets a QR code for the page.
It shows the version, size, SHA-256 of the APK and the signing certificate fingerprint, and always carries the
18+ notice, "not affiliated with Graydient", the draft-terms notice and "no accounts, no analytics".

## How it works

GitHub release files send no CORS headers, so a browser cannot read `version.json` at load time. The page is
therefore generated when a release is **published**:

- `release: published` -> `pages.yml` downloads that release's `version.json`, builds the page, deploys it.
- Manual run -> deploys the "No release has been published yet" page.
- Draft releases never trigger it, so nothing downloadable appears before you publish.

The APK link has no `href` until the visitor ticks "I am 18 or older" (with JavaScript off, a plain link plus the
notice is shown). This is a declaration, not age verification. The page has a strict CSP, no third-party scripts,
fonts or analytics, and `modelFromVersionJson` refuses any APK link outside this repository's release.

## Configuration: `site/config.json`

- `repo`: GitHub repository (`owner/name`).
- `siteUrl`: where the page lives; used for the QR code.
- `pwaUrl`: address of the deployed web app (see `docs/deploy-pwa.md`). Empty means the iPhone section says
  "not available yet".

The signing fingerprint comes from `release/signing-fingerprint.txt`.

## Build locally

```bash
node scripts/build-site.mjs                                   # "no release yet" page
node scripts/build-site.mjs --version-json version.json --tag v0.1.0   # page for a release
```

Output is `site-dist/` (ignored by git). Serve it with any static server.

## Enabling GitHub Pages (a deliberate step)

1. Repository Settings > Pages > Source: **GitHub Actions**.
2. Actions > "Download page" > Run workflow, to deploy the no-release page and check it.
3. Publishing a release then updates the page automatically.
