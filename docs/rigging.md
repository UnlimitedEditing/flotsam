# Rigging in the app

How rig results (puppets, direction sheets, performance tracks, sets, shots) are opened in Flotsam, and how the project library and rig builder fit in. Status: **viewers (M1), library (M2) and the in-app builder (M3a) are done**; the Graydient packing workflow it needs (M3b) is the one remaining piece. See `docs/roadmap/03-rigging-in-app.md` for the brief.

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

### The packing workflow (M3b: not yet on Graydient)

`rig-puppet-pack` does not exist yet. It is the ported `analysis/puppet_rig.py` build (diff the sheets against the base, build one soft mask per region, split the brows, find eyes and pupils, pack the layers) as a ComfyUI node plus a `gen_rigstudio_puppet_pack.py` backup JSON, run through the project's `preflight-plan` first. Until it is restored on Graydient, the builder's last step cannot run against the live API (it is tested end to end against a mock).

## Next

M3b the Graydient packing workflow that turns four part-sheets into a puppet. Later: performance player (track + audio + puppet), set and shot players.
