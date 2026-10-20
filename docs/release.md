# Releasing Flotsam (Android) on GitHub

Releases are built by GitHub Actions from a git tag, signed with the permanent release key, and created as a **draft** on GitHub Releases. The app's self-updater reads `version.json` from the latest **published** release.

## The signing key: the one thing you must not lose

- It lives **outside the repo** at `D:\flotsam-release\` (`flotsam-release.p12` + `keystore.properties`). See `D:\flotsam-release\README.txt`.
- Every installed copy only accepts updates signed with this exact key. **If it is lost or replaced, nobody can update**: they must uninstall and reinstall. It cannot be recovered or rotated.
- **Back it up now**: both files in a password manager (as attachments) plus an offline copy on a different device. Never commit it, email it or paste the passwords anywhere.
- Public certificate fingerprint (SHA-256), safe to share so anyone can check they have the genuine app:
  `64:8A:7C:2C:58:A7:20:D1:44:5A:21:EA:1D:69:3D:1B:F9:3F:A9:53:02:DD:60:7D:4C:96:75:68:C1:A2:50:D4`
  The same digest (lowercase, no colons) is committed in `release/signing-fingerprint.txt`; CI refuses to publish an APK signed with anything else.
- Check an APK yourself: `apksigner verify --print-certs flotsam-X.Y.Z.apk` (in the Android SDK `build-tools`), and compare "certificate SHA-256 digest".

## GitHub Actions secrets (Settings > Secrets and variables > Actions)

| Secret                      | What                            |
| --------------------------- | ------------------------------- |
| `FLOTSAM_KEYSTORE_B64`      | the `.p12` file, base64 encoded |
| `FLOTSAM_KEYSTORE_PASSWORD` | store password                  |
| `FLOTSAM_KEY_ALIAS`         | `flotsam`                       |
| `FLOTSAM_KEY_PASSWORD`      | key password                    |

Only the release job can read them, only on a tag push. Forks and pull requests never get them.

## Cutting a release

1. Make sure `main` is green (CI workflow) and `android/min-supported-version-code.txt` is what you intend (see below).
2. Tag it, strictly `vMAJOR.MINOR.PATCH`:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. The **Release** workflow: tests, builds the web layer, runs the Kotlin tests, builds the signed APK, checks its certificate against `release/signing-fingerprint.txt`, writes `version.json` (hash, size, notes, minimum version) and `SHA256SUMS`, then creates a **draft** release with `flotsam-X.Y.Z.apk` first and `version.json` second.
4. Review the draft (download the APK, run `apksigner verify`, install it on a phone).
5. **Publish** it from the Releases page, only after the legal checklist in `docs/privacy-and-terms.md` is done. Until then it is invisible to everyone, including the app's updater (`releases/latest/download/version.json` only sees published releases).

Version numbers: `versionName` is the tag; `versionCode = MAJOR*1,000,000 + MINOR*1,000 + PATCH`, so it always increases with the version (up to 999 per part). Tags with a suffix (`-rc1`) or the wrong shape are rejected before anything is built.

## Forcing an update

`android/min-supported-version-code.txt` holds the lowest `versionCode` still allowed. Every installed version below it shows the "Update required" screen. Change it only in a reviewed commit, and only to a code that has already been **published** (otherwise users are blocked with nothing to update to). Default `1` = never force.

## Rolling back

`versionCode` can never go down. To withdraw a bad release: publish a new, higher version containing the last good code. Do not delete a published release that devices may already have fetched without publishing a replacement first.

## If something leaks

- A GitHub token or repo access leak: revoke it, rotate repository secrets (this does **not** change the signing key), review recent releases and workflow runs.
- The **keystore or its passwords** leak: treat as serious (someone could sign apps your users' phones accept as updates). There is no safe rotation for installed copies: ship a notice, publish a new app under a new package name, and migrate users.
- Keep the repository's Actions permissions at "read" by default (the workflows already declare their own).

## Local signed build (to test)

```bash
cd android
gradlew.bat assembleRelease -Pflotsam.keystoreProperties=D:/flotsam-release/keystore.properties \
  -Pflotsam.versionCode=1000 -Pflotsam.versionName=0.1.0
```

Without signing configured, a release build **fails with a clear message**; it never falls back to the debug key.

## First release checklist

- [ ] Key backed up in two places.
- [ ] Repository secrets set (four listed above).
- [ ] Terms/Content Policy reviewed (legal), age-assurance decision made, adult-content stance per channel confirmed.
- [ ] A LICENSE chosen (none is included by default, which means all rights reserved).
- [ ] Draft release downloaded, signature verified, installed on a phone, in-app update tested against a higher published version.
- [ ] Then, and only then, publish.
