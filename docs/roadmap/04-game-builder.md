# 04: Mobile game builder

## Vision (Jacob: "would be PEAK")

A small game builder inside the app: describe a game, pull its art, sprites, tiles, music, sound and 3D models from Graydient renders, arrange them, tweak the rules, and play it on the phone straight away. The renders are the raw material; the builder is the glue that turns a folder of results into a playable thing.

## What we already have to build on

- **Asset-producing workflows** (from `D:\tripostl\GRAYDIENT-COMPLETE-REFERENCE.md` and memory notes): pixel sprite sheets and 8-direction turnarounds (`ComfyUI-SpriteSheetPack`, Qwen Image 2.1 turnaround workflows), pose-conditioned animation sheets, top-down map builder prototype (layout to class map to GLB + walkable grid + viewer), music (`music-yue2`, score PNGs), foley/SFX via LTX-2.5, TTS (Higgs), 3D meshes (`trellis2-native`, Hunyuan3D modular pipeline), rigged 2D puppets (brief 03).
- **M3DS** can already carry bundles (3D models, scenes, 2D rig content, video projects, text). A **game project** is a natural new `Expect` type.
- Rig Studio's shot/stage formats and players (`D:\rig-studio`) as a reference for a data-driven scene description.
- The app's job engine, library idea (brief 03 "project store") and blur/privacy rules.

## Key design tensions (decide in the first session)

1. **Runtime.** Run games in the existing WebView. Candidate engines: Phaser, Kaplay, Excalibur (2D, bundle size and licence differ; check), Three.js for 3D (already used by the model viewer). Choose by bundle size, touch input, audio on mobile, and how well a _data-driven_ game description maps onto it. Do not write an engine from scratch.
2. **No arbitrary code.** Games are **data + a fixed library of behaviours** (templates and rule blocks), not user-written JavaScript. That keeps shared games safe to run, makes LLM generation reliable (it fills a schema), and avoids store-policy and security problems.
3. **Storage vs the privacy rule.** The app deliberately keeps no media after browsing. A game project needs its assets kept. Reconcile with an explicit project store (see brief 03): assets enter only via "Add to project", live in app-private storage, and are covered by Clear all data.
4. **Export.** Phones cannot build APKs. Options in rising effort: (a) play inside Flotsam; (b) export a single self-contained HTML file or `.flotsamgame` bundle (share, play in any browser, add to home screen); (c) later, a cloud/GitHub Actions build that wraps a bundle in a Capacitor shell. Start with (a) and (b).
5. **Adult content.** Games built from adult renders: blur and gating in the editor, a clear flag in the bundle, and the exported game must not strip it. Decide whether exports of adult content are allowed at all (legal review item, alongside the terms).
6. **Licence of generated assets.** Flotsam must not claim anything about ownership; document that users are responsible, point at Graydient's terms and each model's licence.

## Proposed phasing (each a separate session)

- **4.0 Spike (1 session):** pick the runtime; prove one hard-coded game (a top-down walker over a generated map with a sprite-sheet character and a music loop) loads from a JSON description in a WebView on web and the Android emulator; measure size and frame rate. Output: a decision memo plus the schema draft.
- **4.1 Asset shelf:** project store, "Add to project" from any result, tagging by role (character, tile, background, sfx, music, UI), sprite-sheet slicer/preview, audio trimming, tile-size picker.
- **4.2 Genre templates:** start with 3 that suit phones and generated art: **endless runner**, **top-down adventure/collect**, **dialogue/visual novel** (the easiest to make look good). Later: platformer, match-3, simple 3D.
- **4.3 Editor:** scene editor (place, scale, layer), rule blocks (on touch / on collide / on timer to spawn / score / change scene), per-template parameters, instant Play button with hot reload.
- **4.4 AI assist:** a "describe your game" flow that asks an LLM (Graydient persona or skill, see the Skills note in memory) to emit the game JSON against the schema, and a "generate missing assets" step that queues the needed renders as one batch with progress. Validate the LLM output strictly; never execute it.
- **4.5 Export and share:** single-file HTML, `.flotsamgame` M3DS bundle, optional cloud APK build.
- **4.6 Polish:** touch controls overlay, haptics, pause/settings, game library with thumbnails.

## Definition of done (whole feature)

A user with an API key can, on a phone, produce a small playable game in one of the templates from their own renders in under an hour, play it in the app, and export a single-file version that runs in a mobile browser.

## Risks

Very large scope: ruthless template-first approach and the data-only rule are the defences. The render queue (one at a time) makes asset generation slow: batch and resume. WebView audio autoplay and memory limits on low-end phones. Legal: adult content in exports, and third-party model licences.
