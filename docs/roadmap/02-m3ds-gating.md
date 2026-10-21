# 02: M3DS viewer only where a result is barcoded

## Problem

Every finished render shows an "Open as M3DS" button, even ordinary image results. It should appear only for workflows that actually return an M3DS ("barcoded") image.

## Why it happens

`src/components/JobCard.tsx` computes `canTry = status === 'done' && !declared && hasPixelMedia(job)`: any workflow **not declared** as a carrier gets the "try it by hand" button. `declared` comes from `outputSpec(w, overrides)` in `src/m3ds/registry.ts`, which only knows two things: the user's per-workflow override, and "the API says this workflow outputs a mesh". Anything else is `null`, so the fallback button appears on everything else.

## Workflows that should be declared (Jacob's list)

| Workflow                  | Declare as         | Note                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `music-yue2`              | `m3ds` / `score`   | song score JSON in a PNG (v16 unifies text/cover/score; confirm what each variant returns)                                                                                                                                                                                                                                                                                |
| `music-yue2-instrumental` | `m3ds` / `score`   | same, instrumental                                                                                                                                                                                                                                                                                                                                                        |
| `trellis2-native`         | `m3ds` / `model3d` | returns a mesh barcode; the API capability flags probably do not say "mesh", which is why it is not auto-detected                                                                                                                                                                                                                                                         |
| all the **RIG** workflows | `m3ds` / `rig2d`   | known live slugs from Rig Studio notes: `rig-direct` (direction sheet), `rig-perform` (track), `rig-track`, `rig-intent`, `rigstudio-a2f-probe`; the puppet/set/segmentation ones (`gen_rigstudio_puppet*.py`, `gen_rigstudio_set_layers.py`, `gen_character_body_segment.py`) need their slugs read from the live list. Not every rig output is an M3DS PNG (check each) |

Open question for the session: confirm each slug against the live API and against what the job returns (run one cheap job per workflow, or read the `gen_*.py` outputs), because a wrong declaration shows a viewer on a plain image.

## Proposed approach

1. Add a **built-in default table** in `registry.ts` (`DEFAULT_SPECS: Record<slug, OutputSpec>`), consulted by `outputSpec` after the user override and before the capability-flag rule. Keep the existing override UI in `screens/Workflows.tsx` so Jacob can mark any new workflow himself.
2. **Remove the automatic "Open as M3DS" button** from `JobCard.tsx`. If a manual escape hatch is still wanted (new workflow, not yet in the table), put it behind the Workflows screen override or a small "More" menu on the result, not on every card.
3. Show the "View result" button (already built for declared jobs) for the declared set; plain results show only the media grid.
4. Tests: `registry.test.ts` for the table and precedence (override beats table beats flags beats none); a `JobCard` render test that an undeclared image job has no M3DS button; keep `m3ds/codec.test.ts` untouched.
5. Docs: one line in `docs/api-notes.md` about how declarations work and how to add one.

## Definition of done

Normal image/video/audio results never show M3DS controls. The four workflow families above open the right viewer straight from "View result". A user override still works. Tests green; `scripts/e2e-pwa.mjs` still passes.

## Risks

Wrong slug lists are the main risk (see the open question). `rig2d` has **no viewer yet** (`mismatchNote` returns null for it), so for rig workflows "View result" needs brief 03 or a placeholder that at least decodes and offers Save.
