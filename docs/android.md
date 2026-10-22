# Flotsam for Android (Phase 4)

The Android app is the same web app wrapped with Capacitor, plus a Kotlin plugin (`FlotsamNative`) for what a web page cannot do. Package name: **`app.flotsam.client`** (permanent once registered with Google). Min Android 10 (API 29).

> This phase produces a **debug-signed** APK for testing on your own phone. It cannot be upgraded to the later release-signed app (Phase 6 creates that keystore); uninstall the debug build before installing a release.

## What the native layer adds

| Feature                                    | How                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Networking with no CORS and real streaming | `Http`/plugin `request` + `stream` (OkHttp). The SSE render stream arrives line by line; `render_hash` is saved natively the moment it appears. The web client sees an ordinary `Response` (`src/native/transport.ts`), so the same code runs on web and Android. Calls are locked to `app.graydient.ai`, `catbox.moe`, `modeltrends.ai`; the API key is only ever sent to Graydient; redirects are not followed.                                 |
| API key storage                            | Android Keystore-backed `EncryptedSharedPreferences` (`SecureStore`). The web layer keeps only an in-memory copy. `allowBackup=false` and backup/transfer rules exclude everything, so Google backup never copies it.                                                                                                                                                                                                                             |
| Background render check                    | WorkManager, about every 15 minutes (the platform minimum), only while a render is being watched. Asks "has media appeared?", then posts a **generic** notification ("Your render is ready", or "Reminder / Ready" in discreet mode). Never runs before the age gate is accepted, never includes content, skips when the app is on screen. **Not instant**: Android may delay it (Doze, battery savers, some manufacturers kill background work). |
| Resume after restart                       | A render that was running when the app closed is picked up again by its render hash instead of being marked failed.                                                                                                                                                                                                                                                                                                                               |
| Fingerprint / face unlock                  | `BiometricPrompt`; the PIN always remains available. Toggle in Settings > App lock.                                                                                                                                                                                                                                                                                                                                                               |
| Screenshot block                           | `FLAG_SECURE` follows the "Cover the screen when the app is in the background" setting: blocks screenshots, screen recording and the app-switcher thumbnail.                                                                                                                                                                                                                                                                                      |
| Save to gallery                            | MediaStore (scoped storage, **no storage permission**). Only on an explicit Save tap. Images go to Pictures/Flotsam, video to Movies/Flotsam, other files to Downloads/Flotsam.                                                                                                                                                                                                                                                                   |
| Camera / gallery picker                    | `@capacitor/camera`, feeding the normal resize and image-host path.                                                                                                                                                                                                                                                                                                                                                                               |
| Share to Flotsam                           | Intent filter for `image/*` (`SEND` and `SEND_MULTIPLE`). The image is downscaled into the app's private cache the moment it arrives, uploaded to your chosen image host from the `/share` screen, then you pick a workflow. If the app is locked or at the age gate, the share waits until you are through.                                                                                                                                      |
| Notification deep link                     | `flotsam://job/<id>` opens the Queue on that job.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Discreet launcher                          | Two launcher aliases of the same activity: "Flotsam" (normal icon) and "Notes" (a plain notepad icon). The discreet toggle swaps them; the launcher may take a moment to refresh.                                                                                                                                                                                                                                                                 |
| Back button, status bar                    | Back pops the route and minimises at the root; status bar colours follow the theme.                                                                                                                                                                                                                                                                                                                                                               |

## Building

One-time machine setup (already done on this PC): JDK 21 (Capacitor 8 requires Java 21), Android SDK platform 36 + build-tools, set `JAVA_HOME` and `ANDROID_HOME`. On a network with TLS interception, Java also needs `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT` (Gradle downloads fail otherwise).

```bash
npm run build:android          # web layer (android mode, no service worker) + cap sync
cd android
./gradlew testDebugUnitTest    # Kotlin logic tests (JUnit)
./gradlew assembleDebug        # android/app/build/outputs/apk/debug/app-debug.apk
./gradlew lintDebug
```

On Windows use `gradlew.bat`. Notes: `networkTimeout` in `gradle-wrapper.properties` is raised to 3 minutes (the default 10 s times out on slow links); gradle's user home was moved to `D:\gradle-home` to spare the nearly full C: drive.

## Installing the debug APK on your phone

1. Copy `app-debug.apk` to the phone (or `adb install -r app-debug.apk` with USB debugging).
2. Allow "Install unknown apps" for the app you opened it from when asked.
3. Open Flotsam. It starts at the age gate, as on the web.

## On-device checklist (not testable without a phone; none of this was run on a device)

- [ ] First run: age gate, then key entry; the key survives closing and reopening the app (stored in the Keystore).
- [ ] Run a workflow: live status appears while it streams (not only at the end).
- [ ] Start a render, switch to another app: a "Your render is ready" notification arrives (allow up to ~15 minutes) and tapping it opens the Queue on that job.
- [ ] Start a render, swipe the app away, reopen: the render is still tracked or finished (not "failed").
- [ ] Settings > App lock: set a PIN, enable fingerprint; lock the app; fingerprint unlocks; PIN works as a fallback.
- [ ] A screenshot of the app shows a black/blocked image while "Cover the screen" is on; the recent-apps thumbnail is blank.
- [ ] Photo button offers camera and gallery; the photo uploads via your image host (Settings > Image host).
- [ ] In Photos, share an image to Flotsam: the Shared image screen opens; after upload you can pick a workflow.
- [ ] Open a result and tap Save: it appears in the gallery app under Flotsam.
- [ ] Settings > Discreet mode: the launcher entry becomes "Notes" with a notepad icon (may need a launcher refresh).
- [ ] Back button: goes back through screens, then leaves the app.
- [ ] Clear all data: returns to the age gate; the key is gone.

## Known limits

- The song-score player (`public/viewers/groovebox/`, about 0.6 MB) is part of the APK's web layer and runs in a same-origin iframe in the WebView; its audio preview downloads instrument sounds only after the user allows it (docs/viewers.md). Real audio on a phone is still to be confirmed.
- Background checks are best effort (see above) and need the notification permission (Android 13+ asks on first enable).
- Biometric unlock is a convenience on top of the PIN, not a cryptographic binding.
- The Android app calls Graydient directly; it does not use the Cloudflare Worker (that is only for the web/PWA version).
- Self-update is built (see `docs/updates.md`); the release keystore, CI signing and the download page are Phases 6-7.
