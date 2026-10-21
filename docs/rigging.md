# Rigging in the app

How rig results (puppets, direction sheets, performance tracks, sets, shots) are opened in Flotsam, and how the project library and rig builder fit in. Status: **viewers done (M1), library done (M2)**; the builder (M3) follows. See `docs/roadmap/03-rigging-in-app.md` for the brief.

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

## Next

M3a rig builder flow in the app, M3b the Graydient packing workflow that turns four part-sheets into a puppet. Later: performance player (track + audio + puppet), set and shot players.
