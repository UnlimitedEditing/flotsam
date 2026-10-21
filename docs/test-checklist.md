# Test checklist (Phase 8)

Status key: **pass (auto)** = proven by a command that can be re-run; **needs phone** = only a person with the device can confirm; **blocked** = cannot be tested until a decision is made.
Date of the automated run: 2026-10-21 (v0.1.0 candidate).

## How to re-run the automated parts

```bash
npm test                         # vite build + 159 app tests (vitest)
npm run lint
(cd worker && npx vitest run)    # proxy tests
(cd android && ./gradlew.bat testDebugUnitTest)   # Android logic tests (JDK 21; see docs/android.md)
```

Browser end-to-end check against a **local mock** of the Graydient API (no real key or account involved).
It needs `puppeteer-core` (not a project dependency) and Chrome; copy the script to a scratch folder as `docs/deploy-pwa.md` describes for `check-pwa.mjs`:

```bash
VITE_API_BASE=http://localhost:8095/api/v3/ VITE_CATBOX_ENDPOINT=http://localhost:8095/upload/catbox \
  node --use-system-ca node_modules/vite/bin/vite.js build --outDir dist-e2e
node e2e-pwa.mjs <path to dist-e2e>      # SHOTS=<dir> saves screenshots; exit code 1 if any check fails
```

## The ten checks

| #   | Check                                                                            | Status                                                                                                                                                                                                                                                                                                                                        | Evidence / what is left                                                                                                               |
| --- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fresh install, gate, login, run a workflow, result (APK, Android PWA, iOS PWA)   | PWA flow **pass (auto)** with a mock API: gate blocks all API traffic, Continue needs both boxes, login, bearer header on requests, render arrives. APK on an Android 16 emulator **pass (auto)**: gate, login, key held natively. Real render on Android APK, Android PWA and iPhone **needs phone**                                         | `scripts/e2e-pwa.mjs`: `fresh_shows_gate_only`, `gate_*`, `no_api_calls_before_key`, `requests_carry_bearer`, `render_result_arrives` |
| 2   | Share-in from gallery, camera capture                                            | **needs phone** (emulator camera is synthetic; share-in is testable on an emulator, see below). Logic: `shareTargets.test.ts`, `images/resolve.test.ts`                                                                                                                                                                                       | Steps in the phone list below                                                                                                         |
| 3   | Notification with app backgrounded and fully closed                              | **needs phone** (background timing, doze and OEM battery limits cannot be emulated faithfully). WorkManager logic: `NativeLogicTest.kt`, `resume.test.ts`                                                                                                                                                                                     | Phone list                                                                                                                            |
| 4   | Notification payloads contain no content                                         | **pass (auto)** at the text-builder level on both paths: PWA `pwa.test.ts` and native `NotificationText.kt` / `NativeLogicTest.kt` only ever produce "Your render is ready" / "A render needs attention"                                                                                                                                      | Also confirm once on a phone that nothing else is shown on the lock screen                                                            |
| 5   | Blur default on; reveal per image; toggle off                                    | **pass (auto)** in real Chrome                                                                                                                                                                                                                                                                                                                | `blur_default_on`, `reveal_per_image`, `reload_blurs_again`, `blur_toggle_off_shows_media`                                            |
| 6   | Generated media not in the service-worker cache or shared storage after browsing | **pass (auto)**: after a render and browsing, Cache Storage holds only `workbox-precache-*` shell entries (20), nothing from the API or image host; localStorage holds only `flotsam.apiKey`. Shared storage (Android MediaStore) only gets a file when you tap Save: **needs phone** to confirm                                              | `sw_cache_has_no_media_or_api`, `_storageKeys`; `sw-guard.test.ts`                                                                    |
| 7   | Self-update happy path; bad-hash rejection; forced update below min version      | Rejection and forced-update **logic pass (auto)**: `UpdateLogicTest.kt`, `updateState.test.ts`, `version-json.test.ts`. The real install flow **needs phone**. Happy path against a real release is **blocked** until you publish a higher version; use a local manifest per `docs/updates.md` ("Testing before you have hosting")            | Phone list                                                                                                                            |
| 8   | Token survives restart; sign-out and clear-data wipe it                          | **pass (auto)** for the PWA (restart = new tab in the same profile; sign-out removes the key; "Clear all data" returns to the gate with localStorage empty). Android: sign-out, restart persistence and clear-data **pass (auto)** on the Android 16 emulator (`scripts/e2e-emulator.mjs`); real Keystore/biometric hardware: **needs phone** | `token_survives_restart`, `sign_out_removes_token`, `clear_data_wipes_and_returns_to_gate`; `privacy.test.ts`, `security.test.ts`     |
| 9   | Android 10 to latest; small screen and tablet                                    | Small screen (320 px) and tablet (820 px) **pass (auto)** in Chrome: no horizontal scroll on any screen. Android 16 emulator **pass (auto)**; Android 10 **not verified** (see emulator section)                                                                                                                                              | `no_horizontal_scroll_320px`, `no_horizontal_scroll_tablet`                                                                           |
| 10  | Offline launch shows the offline screen                                          | **pass (auto)** for the PWA: shell loads offline, banner "You're offline...", Send disabled. Android APK: see emulator section                                                                                                                                                                                                                | `offline_launch_shows_offline_state`                                                                                                  |

## Emulator results

Run on 2026-10-21 with `scripts/e2e-emulator.mjs` (debug build of the current code, driven over WebView DevTools, fake API key, no network to Graydient):

- **Android 16 (API 36, Pixel 7 profile, WebView 133): all 11 checks pass.** Fresh start shows the gate; gate then login; the key is **not** in WebView localStorage (it is held natively); the key survives a full restart; no horizontal scroll at 412 px; the Back button leaves the app from the home screen; with airplane mode on, launch shows the offline state; Sign out returns to the login screen and stays signed out after restart; Clear all data returns to the gate.
- **Android 10 (API 29): not verified.** The only emulator image available (no Play Store) ships WebView 74 from 2019; the app rendered a blank page there, and I could not tell whether that is the old WebView or slow start-up before I removed the image to free disk space. Real Android 10 phones update WebView through Google Play, so this is probably an emulator artefact, but it is **unconfirmed**: test on a real Android 10 device if you have one, and treat "needs a reasonably current Android System WebView" as a known requirement until then.
- **Tablet:** emulated in Chrome only (820 px, no horizontal scroll); no tablet emulator was run.
- **Screenshot block:** a `adb screencap` of the signed release build came back solid black, which is consistent with the screen cover being on; confirm by hand on a phone.
- The release APK (signed) installs and launches on API 29 and API 36; the DevTools-driven checks need the debug build because release builds do not expose the WebView.

## On your phone (ordered)

Do these in this order; each takes a minute or two. Use a throwaway test render (small image) so little quota is spent.

**Android APK (`flotsam-0.1.0.apk`, installed as in `docs/testing-on-a-phone.md`)**

1. Open it: age gate, accept, paste your API key. Close the app fully and reopen: you are still signed in (check 8).
2. Choose a small image workflow, send. Live status appears while it runs (check 1).
3. Send another, then switch to a different app: a "Your render is ready" notification arrives (up to ~15 minutes); it shows no prompt or image; tapping it opens the Queue on that job (checks 3, 4).
4. Send another, swipe the app away from recents, wait, reopen: the render is finished or still tracked, not "failed" (check 3).
5. Results are blurred; tap one to reveal it; Save puts it in the gallery under Flotsam; that is the only place a file lands (checks 5, 6).
6. Photo button: camera and gallery both work and upload via your image host (check 2). In Photos, Share an image to Flotsam: the Shared image screen opens (check 2).
7. Settings: set a PIN, enable fingerprint, lock, unlock both ways. Take a screenshot: it is blocked; the recent-apps thumbnail is blank.
8. Settings > Discreet mode: launcher entry becomes "Notes".
9. Turn airplane mode on and open the app: the offline state shows (check 10).
10. Sign out: the key is gone. Sign in again, then Clear all data: back at the age gate (check 8).

**Android PWA (Chrome on the phone, `https://flotsam.pages.dev/`)**: steps 1, 2, 5 (no Save to gallery), 9, 10; install via the in-app Install button.

**iPhone (Safari > Share > Add to Home Screen)**: steps 1, 2, 5, 9, 10. Notifications only fire while the app is open or just closed.

**Updates (do after the checks above pass)**: follow `docs/updates.md`: happy path needs a higher published version (blocked until you decide to publish); bad hash, wrong signer and forced update can be tried with a local manifest (check 7).

## Visual and motion checks (UI redesign, 2026-10-21)

Automated (`scripts/e2e-pwa.mjs`, `scripts/check-contrast.mjs`, `src/styles/guard.test.ts`, `src/lib/*.test.ts`): colour contrast AA in both themes; lightbox opens, covers the tab bar, short drag springs back, long drag dismisses; sheet opens with focus inside, Escape closes and returns focus; reduced motion collapses animation; privacy cover has no animation or transition; no horizontal scroll at 320 px and tablet width.

**Android after the redesign: partly verified.** The Android unit tests (including the new haptics mapping) pass and the debug APK builds. On the Android 16 emulator the redesigned build passed the first checks of `scripts/e2e-emulator.mjs` (gate, login, key held natively, survives restart, no horizontal scroll). One run then reported `back_leaves_app` as failed (cause not found: it passed on the pre-redesign build, so please confirm Back from the Chat tab leaves the app on your phone), and the emulator's WebView connection kept stalling on later steps (offline launch, sign-out, clear-data), so those were **not re-run on the new build**. They passed on the pre-redesign build (see "Emulator results" above) and passed on the new build in headless Chrome.

**Needs your phone (feel cannot be judged by a script):**

- [ ] Back from the Chat tab leaves the app (Android; see note above).
- [ ] Switching tabs feels smooth: content slides the right way, the indicator springs, nothing stutters.
- [ ] A running job shows its progress bar; when it finishes the card glows once and you feel a buzz (Android app; some browsers vibrate too).
- [ ] Tapping a blurred image eases the blur away; opening it grows out of the thumbnail; dragging it down dismisses it and the backdrop fades as you drag.
- [ ] Settings > Clear all data opens a bottom sheet you can also dismiss by dragging the handle.
- [ ] With Android's "Remove animations" (or the browser's reduced-motion setting) on, screens change without sliding or bouncing.
- [ ] On an older or slower phone, if scrolling feels heavy, Settings > Appearance > Reduce visual effects makes it smoother.

## Result viewers (rigging M1, 2026-10-21)

Automated in `scripts/e2e-pwa.mjs` with real Rig Studio files: the viewer button is named for the result ("Open direction sheet", "Open puppet"); the direction sheet opens as 34 readable lines; the puppet opens, draws, and its mouth and brow controls change the picture; the regions overlay draws. Unit tests cover payload identification (including hostile input) and bundle validation.

**Needs your phone:**

- [ ] A real puppet result from your account opens with "Open puppet" and blinks and looks around by itself; the mouth, eyes and brow chips change it; it does not stutter on an older phone.
- [ ] A real direction sheet opens with "Open direction sheet" and reads correctly.
- [ ] Nothing in the app calls these results "M3DS" except the advanced switch in Settings.

## Library (rigging M2, 2026-10-21)

Automated: store behaviour and limits, serialised writes, wipe rules (`src/library/store.test.ts`); in headless Chrome: a puppet added from its viewer, an image saved from the lightbox, both listed with names and thumbnails, a puppet reopened from storage, rename, delete, survival across a reload, items present in IndexedDB and absent from Cache Storage, usage shown in Settings, and "Clear all data" leaving no library keys.

**Needs your phone:**

- [ ] Add a real puppet to the library, close the app completely, reopen: it is still there and opens.
- [ ] Library thumbnails are blurred until tapped; Settings shows the item count and size; Delete everything empties it.
- [ ] After "Clear all data" and signing in again the library is empty; the terms screen asks you to confirm again (the terms text changed).

## Rig builder (rigging M3a, 2026-10-21)

Automated: controller logic with a fake job engine (order of the four sheet renders, waiting for all sheets, packing with the four URLs as placeholders, failure cancels the rest, retry, restart from saved state, wipe, input validation); in headless Chrome against the mock: choose a head, start, five steps shown, reload mid-build, it finishes, the commands sent are four `rig-puppet-parts` renders in order then `rig-puppet-pack` with `/image1..4`, the result opens as a puppet and is saved to the library under its name.

**Needs your phone and a live account:**

- [ ] With `rig-puppet-parts` on your account (and `rig-puppet-pack` once it is restored), Make a puppet runs all five renders; closing the app mid-build and reopening carries on.
- [ ] A real build's puppet opens and looks like the one the Python packer makes from the same sheets.
- [ ] Without the workflows the screen explains what is missing and does not start.

## Known gaps

- The mock API proves Flotsam's behaviour, not Graydient's: a real render on each platform is on the phone list.
- The download page (`site-dist`) and GitHub Pages are separate from this list; see `docs/download-page.md`.
