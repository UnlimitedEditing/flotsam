# 03: Rigging in the app

## Goal

Make the "rigging conveniences" a first-class, in-app feature: take rendered art, turn it into a puppet (cut-out body parts, mouth shapes, blinks), see it, pose and perform it, and keep it as a reusable asset. Today this lives in separate tools; the app only lets you run the underlying workflows and read their output as text. This brief is also the foundation for brief 04 (game characters) and brief 05 (companion avatar).

## What already exists (outside this repo; read before designing)

- **Rig Studio** (`D:\rig-studio`, local git, no remote): web players `player/puppet.html`, `rig.html`, `set.html`, `stage.html`, `capture.html`; formats `docs/shot-format.md` (`rigstudio.shot` v1: puppets, props, fx, camera, lamp on a timeline) and `rigstudio.puppet` v2; expression-track spec `docs/expression-track.md`; Sheet Studio `studio/index.html`; roadmap `docs/animation-suite-roadmap.md` (shadows, SFX, music, VFX, director mode, bodies, media, text, compile).
- **Graydient workflows (live):** `rig-direct`, `rig-perform`, `rig-track`, `rig-intent`, `rigstudio-a2f-probe`; puppet/part/set workflows built as `gen_rigstudio_puppet*.py`, `gen_rigstudio_set_layers.py`; SAM3 body-part cutouts `gen_character_body_segment.py`. Node repo `UnlimitedEditing/ComfyUI-RigStudio`.
- **M3DS carriers** already carry direction sheets and tracks; this repo's M3DS codec (`src/m3ds/`) decodes them, and `rig2d` is a declared-but-viewerless result type (`src/m3ds/registry.ts`).
- **Rigger & Flotsam** (`D:\rigger-and-flotsam`, a separate MIT Graydient studio project) has overlapping ideas (library, graph); decide up front whether to reuse its pieces or stay independent.

## Open questions (discovery pass first)

1. What is a "rig" for the user in v1? Proposal: **Tier 1 puppet** = layered cut-out parts + 9 mouth shapes + blink frames, driven by audio visemes and an expression track. Higher tiers (bodies, 3D) later.
2. Where does the rig runtime live? Proposal: embed the existing Rig Studio players as a **WebView component** (they are already HTML/Three.js), loaded from the app bundle, fed puppet data from the app's project store. Needs a license/ownership check (Rig Studio is Jacob's own code).
3. Which steps run on Graydient vs on the phone? Proposal: segmentation, mouth-set inpainting, A2F tracks and direction run on Graydient (queued, one at a time); playback, posing, expression layers and capture run on the phone.
4. Storage: a puppet is many images plus JSON. See "Projects" below.

## Proposed approach

1. **Project store** (shared with 04 and 05): an explicit, user-visible library in IndexedDB (web) / app-private files (Android) holding puppets, sets, sheets and tracks, separate from the job history. Every item has a source job, a thumbnail, a size, and Delete; "Clear all data" wipes it. Nothing enters it without the user choosing "Add to library". This keeps the no-silent-media-caching rule intact.
2. **Rig Builder flow** (guided, one screen per step, using the motion system from 01): pick or render a character image -> segment parts (`gen_character_body_segment`) -> review/fix parts -> generate mouth shapes + blinks -> preview the puppet talking to a sample line -> save to library.
3. **Puppet viewer/performer**: embed `puppet.html` (or a trimmed build) in a sandboxed WebView/iframe with a small message API (`load(puppet)`, `play(audio, track)`, `setExpression(channel, value)`, `trigger(clip)`, `snapshot()`). That API is the contract brief 05 will use.
4. **Result viewers**: add a `rig2d` viewer so "View result" on rig workflows (brief 02) opens the puppet/sheet/track, with Save.
5. **Convenience actions** on any image result: "Make a puppet from this", "Use as a sprite", "Cut out the character".
6. Tests: schema validation for `rigstudio.puppet` v2 on load (reject malformed/oversize), store tests, WebView message-API tests (headless Chrome), emulator check. Document in `docs/rigging.md`.

## Definition of done

From a rendered character image a user can build, preview, save and re-open a puppet entirely in the app (web + Android), see it perform a line of audio, and the message API is documented for 04 and 05.

## Risks

Workflow run time and the one-render-at-a-time queue make the builder slow: design for long waits (progress, notifications, resumable steps). Part-segmentation quality varies; the review step is essential. Rig Studio's formats are still evolving, so pin versions. Adult characters: blur and gate rules apply to every preview frame.
