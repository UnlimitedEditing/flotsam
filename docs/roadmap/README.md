# Roadmap after Phase 8

Written 2026-10-21 from Jacob's feedback after the first look at the built app. Nothing here is built yet. Each brief is written so a fresh session can pick it up cold: goal, what exists, what is unknown, a proposed approach, risks, and what "done" means.

| #   | Brief                                                                                     | Size          | Depends on                                     |
| --- | ----------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------- |
| 02  | [M3DS viewer only where a result is barcoded](02-m3ds-gating.md) (**done 2026-10-21**)    | small (a day) | nothing                                        |
| 01  | [UI redesign and motion](01-ui-and-motion.md) (**done 2026-10-21**, see `docs/design.md`) | medium        | nothing (do before 03-05)                      |
| 03  | [Rigging in the app](03-rigging-in-app.md) (**done 2026-10-21**, see `docs/rigging.md`)   | large         | 01, 02                                         |
| 04  | [Mobile game builder](04-game-builder.md)                                                 | very large    | 01, 03 helps                                   |
| 05  | [Virtual companion (persona + animated avatar)](05-virtual-companion.md)                  | very large    | 01, 03                                         |
| 06  | [Async world: an almost-live MMO where an AI plays your character](06-async-world.md)     | very large    | 03, 04, 05 help; needs a legal/moderation plan |
| 07  | [Mobile staging utility (shots, sets, performances)](07-staging-utility.md)               | very large    | 03; the viewer registry and frame mode (done)  |

Suggested order: 02, 01, 03, then 05, 04, 06 or 07 (04 starts with a spike; 05 starts with a discovery pass on Graydient's chat API; 06 starts with a design doc and a cost simulator, and its social layer waits on a legal/moderation plan).

## Things that apply to every brief

- **Independent client.** The app is never branded as Graydient and never implies endorsement (see `README.md`). Keep new screens consistent with that.
- **Privacy stance already in the app:** no analytics; the API key is held natively on Android; generated media is never cached by the service worker and nothing is written to shared storage unless the user taps Save. Features that need to keep media (a game project, an avatar) must do it as an **explicit, user-visible "project" store**, not by quietly widening caches. See `src/pwa/sw-guard.test.ts` and `src/security/wipe.ts`; "Clear all data" must wipe any new store.
- **Adult content.** Blur-by-default, the 18+ gate, and the adult-workflow toggle apply to anything these features create or display (game assets, avatar frames).
- **Graydient limits that shape designs:** one render at a time per account (jobs queue); the render API has no CORS (we go through the Worker proxy on the web and native HTTP on Android); no upload endpoint (images need a host); a workflow's first run can take far longer than later ones; personal API keys are for personal use, so features must not look like a reseller service.
- **Process:** each brief starts with plan mode and ends with tests, a verification pass (headless Chrome + Android emulator scripts in `scripts/e2e-*.mjs`), updated docs, and a commit. `docs/test-checklist.md` gets new rows for anything user-visible.
