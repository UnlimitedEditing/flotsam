# Testing on a phone

## 1. Without a phone

`npm test` covers the page generator. To look at the page as a phone would:

```bash
node scripts/build-site.mjs
npx vite preview --outDir site-dist
```

Then open it in a browser and use the device toolbar (or an Android/iPhone user agent) at 320-390 px wide.
Check that the right section opens, the 18+ box enables the button, and nothing scrolls sideways.

## 2. Open the page on your phone

- **Temporary link:** run a Cloudflare quick tunnel to the local server
  (`cloudflared tunnel --url http://localhost:4173`) and open the printed `trycloudflare.com` address on the
  phone. It is public to anyone with the link while it runs; stop it when done.
- **Real hosting:** enable GitHub Pages (`docs/download-page.md`), run the workflow by hand, open
  `https://unlimitedediting.github.io/flotsam/`.

## 3. Install the app

1. Get the signed `flotsam-<version>.apk` onto the phone (download the draft release asset on a PC and send it
   across, USB, or a file transfer). No published release is needed for the first install.
2. Tap the file. When Android asks, allow "Install unknown apps" for the app you opened it from (Settings >
   Apps > Special access > Install unknown apps; on Samsung it is a prompt in the same place).
3. Tap Install. Play Protect may warn about an unknown developer; that is expected for a sideloaded app.
   Compare the signing certificate with the fingerprint on the download page if you want to be sure.
4. Open Flotsam, pass the age gate, and walk through the checklist in `docs/android.md`.
5. To test updates, publish a higher version later and use Settings > App updates (`docs/updates.md`).
   Until a release is published the updater finds nothing, which is correct.
