# Rigging in the app

How rig results (puppets, direction sheets, performance tracks, sets, shots) are opened in Flotsam, and how the project library and rig builder fit in. Status: **viewers (M1), library (M2), the in-app builder (M3a) and the Graydient packing workflow (M3b) are done and confirmed live.** Known quality issue: eyebrows can be baked into the eye layers (see below). See `docs/roadmap/03-rigging-in-app.md` for the brief.

## Result viewers

A result from a workflow that returns a file packed into images (we call the container M3DS internally; users never see that word) opens in a **viewer chosen from the data itself**, not from the workflow's name:

| Payload (`format` field)          | Button                 | Viewer                                                                                                                                                     |
| --------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| glTF / GLB model                  | View 3D model          | 3D viewer (three.js, orbit)                                                                                                                                |
| `rigstudio.puppet` v2             | Open puppet            | **Puppet viewer**: live puppet with idle blinking and gaze; hold a mouth shape (rest, A-H, idle set), eyes, brows, where it looks; talk demo; show regions |
| `rigstudio.direction` v1          | Open direction sheet   | **Direction viewer**: every line with its delivery, intensity and lock; counts per delivery; the director's brief                                          |
| `rigstudio.expression_track`      | Open performance track | text viewer (a player needs a puppet and audio: next slice)                                                                                                |
| `rigstudio.set`, `rigstudio.shot` | View set / Play shot   | file info and Save (players come later)                                                                                                                    |
| YuE2 score                        | Open score             | text viewer                                                                                                                                                |
| anything else                     | Open result            | file info and Save                                                                                                                                         |

`identifyPayload()` in `src/m3ds/registry.ts` reads the `format` field from the first 4 KB (never parsing the whole file), then glTF magic, then the file name, then what the workflow declared. The button label before opening comes from the workflow (`viewLabelFor`): `rig-direct` Open direction sheet, `rig-puppet*` Open puppet, `rig-perform`/`rig-track` Open performance track, `rig-set*` View set, `music-yue2*` Open score, `trellis2-native` View 3D model.

Which workflows get a viewer button at all is `docs/api-notes.md` (declared table, name patterns, override, advanced switch).

## Where the code is

- `src/results/ResultPanel.tsx`: downloads the result images, decodes them (`src/m3ds/codec.ts`), picks the viewer; viewers are in `src/results/viewers/` and load on demand.
- `src/rig/puppet.ts`: validation of a puppet bundle (size, file count, PNG-only layers, safe names, boxes inside the canvas, references that exist). Bundles come from the network, so nothing is drawn before this passes.
- `src/rig/rigcore.ts`: the renderer, a TypeScript port of Rig Studio's `player/lib/rigcore.js` (`RigActor`). Differences from the original are deliberate and small: built from a validated bundle, and `draw(..., manual)` lets a viewer hold poses. The idle logic (blink timing, gaze wander, brow and lid ladders) is unchanged, so a puppet looks the same here as in the Rig Studio player.
- `src/rig/direction.ts`: reads a direction sheet defensively (caps, types).

## Testing

`src/rig/puppet.test.ts`, `src/m3ds/registry.test.ts` (payload identification including hostile input, labels). `scripts/e2e-pwa.mjs` opens a real puppet (`D:\rig-studio\samples\puppet\bluebob2\bluebob2.rig.png`, override with `RIG_SAMPLE_PUPPET`) and a real direction sheet (`D:\rig-studio\bench\real1.sheet.png`, `RIG_SAMPLE_SHEET`) from a mock render, checks the button names, that the puppet draws, and that the mouth and brow controls change the picture. Without the sample files those checks report "skipped".

## Library (Gallery > Library)

The one place a copy of generated media is kept on the device, and only because the user asked: **Add to library** in a result viewer (puppets, direction sheets, models, scores), and **Save to library** in the image lightbox. Items have a name, kind, size and a small preview (a puppet's preview is its base image); previews are blurred until tapped like result thumbnails. Rename and delete per item (confirmation sheets), usage in Settings > Data on this device with "Delete everything in the library", and "Clear all data" empties it. Opening an item uses the same viewers as a fresh result.

Rules, enforced in `src/library/store.ts` and tested: IndexedDB only (never Cache Storage), 40 MB per item and 400 MB total, writes serialised, a wipe empties the in-memory copies too and nothing can be saved afterwards until reload, puppet bundles are validated before they are kept. The terms text says all this (`TERMS_VERSION` 2026-10-21.1).

## Rig builder (Gallery > Library > Make a puppet, or "Make a puppet" in the image lightbox)

Turns one head picture into a puppet by chaining five Graydient renders. Choose a head (from your results, an upload through your image host, or a pasted address), name it, and start. The app then runs, one at a time:

1. `rig-puppet-parts` four times, once per part family (`/slot1:mouth`, `idle`, `eyes`, `brows`, same `/seed:`), each returning a 3x3 sheet;
2. `rig-puppet-pack` once, given the four sheets as `/image1:URL1` ... `/image4:URL4`, returning the finished puppet.

You can leave the screen: the build is driven by a controller (`src/rig/builder.ts`), not the page, its state is saved (`rigbuild.v1`), and it is started at launch, so a closed app carries on. Failed steps can be retried individually (finished sheets are kept); Cancel stops what has not run; the five jobs also appear in the Queue. When it is done, "Open puppet" shows it in the puppet viewer with "Add to library" (named as you called it). Without the two workflows on your account the screen says so and does not start; their names can be changed in Settings > Rig builder.

Part sheets are ordinary pictures (`rig-puppet-parts` is declared as such so it gets no viewer button); `rig-puppet-pack` is declared as barcoded rig content.

### The packing workflow (M3b: live on Graydient as rig-puppet-pack, confirmed 2026-10-21)

`rig-puppet-pack` is Rig Studio's own packer (`puppet_rig.py`, copied byte-identical and run unchanged) wrapped as the node `RigStudioPuppetPack` in `UnlimitedEditing/ComfyUI-RigStudio` (`nodes_puppet.py`, `rigstudio/puppet_job.py`), plus the workflow backup `D:	ripostl\gen_rigstudio_puppet_pack.py` -> `GraydientWorkflow-rigstudio-puppet-pack-v1.json`.

- **Inputs:** Graydient's `image1` to `image4`, positional (mouth, idle, eyes, brows: the order the builder runs the part renders), plus `prompt_positive` as the puppet's name. The platform stages each image first, so the node accepts a staged filename, a URL or a Telegram reference.
- **Output:** the puppet as a data-image PNG written by the node itself, plus a preview card through a stock SaveImage.
- **No model files and no pip entries:** numpy, scipy and Pillow ship in the ComfyUI base image (catalog KI-007 section 1; extra pip entries can crash ComfyUI with a numpy/scipy mismatch).
- **Verified locally:** with your `bluebob2` sheets it reproduces the PC-built puppet exactly (identical bundle, 49 layers) in about 12 s on CPU under numpy 2.4 and scipy 1.17; 8 tests (validation messages for missing, non-PNG, wrong-size, mismatched and no-change sheets); the node entry point was run against a stand-in for ComfyUI's file helpers. The workflow JSON lints clean.
- **Confirmed live (2026-10-21):** pushed (`b7f7ea5`), restored as `WFXxkD17` (private), and run on Graydient after four real `rig-puppet-parts` renders of your `bluebob2` head: render `D8gveG` succeeded, node time 5 s (156 s elapsed on its first run), returning the puppet (2.5 MB) and a preview card. All 49 layers were pixel-identical to a local pack of the same four sheets, and the app's end-to-end suite (55 checks) passes with this Graydient-made puppet as the result. The mouth sheet from Graydient was byte-identical to your September original; idle, eyes and brows differ slightly (the parts workflow is not byte-deterministic).

## Known issue: eyebrows baked into the eye layers

Found 2026-10-21 on the `bluebob2` puppet: the eye layers `lid25`, `lid50`, `lid75`, `narrow` and `shut` each contain a brow stroke at the top, so with the brow track animating, a second brow shows. Cause: the packer cuts the eyes from a band whose top edge (y 274) lies above the bottom of the brow region (y 290), and every eye-edit frame re-draws the brows inside that band. Fix plan: erase brow ink (dark strokes above the eye whites, not touching the lids or lashes) from every eye frame and let the brow layers cover that area; add a test that fails today on these sheets.

## Next

M3b the Graydient packing workflow that turns four part-sheets into a puppet. Later: performance player (track + audio + puppet), set and shot players.
