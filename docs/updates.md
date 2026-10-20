# Self-updates for the Android app (Phase 5)

The sideloaded app can update itself without an app store. It checks a small `version.json`, downloads the new APK, **verifies it**, and hands it to Android's installer. Android shows its own confirmation screen every time (normal for sideloaded apps).

## How it is kept safe

1. `version.json` and the APK are fetched over **HTTPS only**, and the APK must be on the **same host** as `version.json`.
2. The download must match the manifest's **SHA-256** (and size, if given), or it is deleted.
3. The file's own package name and `versionCode` are checked: it must be this app, the version in the notice, and **newer** than what is installed (no downgrades, no other app).
4. **Android itself refuses an update signed with a different key.** Only builds from the same keystore can ever replace the app.
5. The Graydient API key is never sent to the update host. The update host sees the device's IP address and the request, nothing else.

## `version.json`

```json
{
  "versionCode": 12,
  "versionName": "1.3.0",
  "minSupportedVersionCode": 9,
  "apkUrl": "https://updates.example.com/app/flotsam-1.3.0.apk",
  "sha256": "<64 hex characters>",
  "size": 21988187,
  "notes": "Faster gallery, share-to-Flotsam"
}
```

- `versionCode` must go up with every release (it is an integer Android compares). `versionName` is for people.
- `minSupportedVersionCode`: any installed version **below** this is blocked by an "Update required" screen (shown before the age gate and the lock, and cached, so it blocks even offline). Set it to 1 to never force.
- `size` and `notes` are optional. Unknown fields are ignored. Anything invalid makes the whole manifest rejected (never guessed at).

## Turning it on

The manifest URL is a **build-time setting**; empty (the default) means the updater is hidden and does nothing.

```bash
./gradlew assembleRelease \
  -Pflotsam.versionCode=12 -Pflotsam.versionName=1.3.0 \
  -Pflotsam.updateManifestUrl=https://updates.example.com/app/version.json
```

(Phase 6 will pass these from a git tag automatically.) Host `version.json` and the APK on the same HTTPS origin: GitHub Releases/Pages or Cloudflare Pages are free. Not graydient.ai (it is not yours to use, and the name concern applies).

## Publishing a release

```bash
npm run build:android
cd android && ./gradlew assembleRelease -P... (as above) && cd ..
node scripts/make-version-json.mjs <apk> https://updates.example.com/app/flotsam-1.3.0.apk \
     --notes "What changed" --min 9 --out version.json
```

The script reads the version from the APK (`aapt2`), computes the SHA-256 and size, and writes `version.json`. Upload the APK and `version.json` to the same host. **Upload the APK first**, then `version.json`, so no one is ever told about a file that is not there yet.

## The keystore (important)

Every installed copy only accepts updates signed with the **same key**. Create the release keystore once (Phase 6), back it up (password manager plus an offline copy), and never change it. If it is lost or changed, installed users cannot update: they must uninstall and reinstall. A debug-signed APK cannot be updated by a release-signed one for the same reason.

## Rolling back

`versionCode` can never go down. To undo a bad release, publish the previous code's content as a **new, higher** `versionCode`. To pull a release quickly, point `version.json` back at the last good (lower) APK only if every installed device is still on a lower code; otherwise publish a fixed higher one.

## Testing before you have hosting

`cloudflared` is installed on this PC. Put `version.json` and the APK in a folder, serve it (`python -m http.server 8080` inside it), run `cloudflared tunnel --url http://localhost:8080`, and use the HTTPS URL it prints as `flotsam.updateManifestUrl` for a v1 build. Build a v2 (higher `versionCode`), generate its `version.json` with the tunnel URL for `apkUrl`, copy both into the folder. Debug builds from this PC share one debug key, so v1 -> v2 upgrades work before a release keystore exists.

## On-device checklist (the install flow cannot be tested without a phone)

- [ ] v1 installed with the manifest URL set; Settings > App updates shows "Installed version 1.0.0 (1)".
- [ ] With v2 published, "Check for updates" shows version 1.1.0, its notes and size; a banner also appears at launch (once a day).
- [ ] "Update now": progress is shown, then "Checking the download…", then Android asks to allow installs from Flotsam (first time), then its install confirmation.
- [ ] After confirming, the app restarts on 1.1.0 and Settings says "You have the latest version".
- [ ] Corrupt the APK on the host (or change `sha256`): the app reports the integrity-check failure and discards the file.
- [ ] Set `minSupportedVersionCode` above the installed code: the "Update required" screen appears before the age gate, also with airplane mode on.
- [ ] Install a v2 signed with a different key: Android's refusal is shown in plain words.

## Privacy

An update check sends the device's IP address (and the request itself) to the update host, once a day plus manual checks, only in the Android app, and **before** the age gate (updating must never depend on it). No account data, key or history is sent. See `docs/privacy-and-terms.md`.
