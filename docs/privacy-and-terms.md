# Privacy, terms and the age gate (Phase 3)

Flotsam is an independent client for a service that can produce adult content. This page records what the app does about that, what it does **not** do, and what still needs a human decision before a public release.

## What the gate does

- **One exception, Android only:** if the build has an update URL set, the app asks the update host for `version.json` (once a day) even before the gate, because a forced update must never depend on consent. That request carries nothing but the device's IP address and the request itself. See `docs/updates.md`.
- First run shows only the gate: the Terms and Content Policy (`src/legal/terms.ts`) and two required confirmations (18+, accepted terms). Nothing else renders and no network request is made before it is passed.
- Enforced in three places, so no single bug can bypass it:
  1. `App.tsx` renders only the gate until consent is valid.
  2. `api/client.ts` refuses every request (and the render WebSocket) with `GateError` unless the consent check passes. The module is **deny by default**: if nothing wires the check, nothing is sent. `src/api/gate.test.ts` proves this.
  3. The job engine will not send a queued job until the gate is open.
- Consent is stored locally with the terms version (`state/consent.ts`). Changing `TERMS_VERSION` asks everyone again.

## What it does not do

- **It is a declaration, not age verification.** A checkbox proves nothing about age. Whether that is enough for your markets is a legal question.
- **Consent is not stored server-side.** Graydient exposes no endpoint for it that we know of. Worth asking them.
- The PIN lock is **casual-access protection**. It runs in the browser and guards data in the same browser profile. Biometric lock needs the Android app (Phase 4).
- Discreet mode on the web version changes only what the page and its notifications say. The installed icon and name cannot be changed from a web page; that swap (activity-alias) is part of the Android app.
- The privacy cover (blank screen when the app is backgrounded) is best effort: some phones snapshot the screen before a page can react.

## Controls, defaults and where data lives

| Control                    | Default | Notes                                                                                                                                                               |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blur media until tapped    | **on**  | Per session; a reload blurs everything again. Adult-workflow output is always blurred.                                                                              |
| Show adult workflows       | **off** | Hides `is_nsfw` workflows everywhere.                                                                                                                               |
| Cover screen in background | on      |                                                                                                                                                                     |
| Discreet mode              | off     | Title/UI "Notes"; notifications say "Reminder / Ready".                                                                                                             |
| App lock (PIN)             | off     | PBKDF2-SHA256, random salt, 310k iterations; escalating lockout after 4 wrong tries (30 s, doubling to 15 min) that survives reloads; auto-lock timeout selectable. |
| Notifications              | off     | Generic text only; never prompt, workflow name or image.                                                                                                            |
| Image host                 | none    | Photos go to the host the user picks, not to Flotsam.                                                                                                               |

All data stays on the device: API key (`localStorage`), history, preferences, consent and PIN hash (IndexedDB). The service worker caches only the app shell (guarded by `src/pwa/sw-guard.test.ts`). "Clear all data" wipes localStorage, sessionStorage and IndexedDB and returns to the gate. A forgotten PIN has no recovery; clearing all data is the only way back in.

## Legal review checklist (needs a human)

- [ ] Read and approve (or replace) the Terms and Content Policy text. It is a draft written by the build agent.
- [ ] Decide whether a self-declared 18+ confirmation is sufficient, or whether stronger age assurance is needed for target countries.
- [ ] Confirm the stance on adult content per distribution channel (the sideloaded APK, the website, any app store).
- [ ] Check Graydient's API terms for third-party clients and for their requirements on adult content.
- [ ] Confirm Catbox's and Cloudflare's rules for the traffic that passes through them (uploads, the relay Worker).
- [ ] Decide whether to ask Graydient for a server-side consent/age flag.

## Handed to Phase 4 (Android)

Biometric unlock, discreet icon and name swap, encrypted token storage, share-sheet input, background render checks.
