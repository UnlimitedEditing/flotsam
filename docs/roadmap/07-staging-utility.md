# 07: Mobile staging utility (shots, sets and performances)

## Goal

Let a person **place content in a scene and manipulate it over time, on a phone**: put puppets and props in a built room, give them positions and moves along a timeline, make them speak recorded lines, move the camera and the light, add effects and sound, play it back, and export it. This is the staging half of Rig Studio. The app's result viewers can only **summarise** a shot, a set and a performance track today (see `docs/viewers.md`); this brief is the real player and editor.

It is deliberately its own task. A touch timeline editor is a product in itself; it was split out of the viewer work on 2026-10-22 (Jacob: "probably a tricky job and should become its own task").

## What already exists (outside this repo; read before designing)

- **The stage** (`D:\rig-studio\player\stage.html`, 633 lines, desktop-first): evaluation of a shot, an editor (select an actor, set keys, drag), a timeline with rows per actor/line/sfx/music/marker, play/scrub, and **Record .webm** (canvas capture plus the mixed audio through a limiter). Cores it uses: `player/lib/setcore.js` (builds a room as a Three.js box from a set, props as cards with normal and depth maps, soft area-light shadows, camera and lamp) and `player/lib/rigcore.js` (the part-based puppet renderer; the app already has a TypeScript port, `src/rig/rigcore.ts`).
- **Formats:** `docs/shot-format.md` in Rig Studio defines `rigstudio.shot` v1 (camera, lamp, actors of kind puppet, prop, fx; sfx, music with ducking, markers; stage units are fractions of the set box, so blocking survives a rebuilt set) and `rigstudio.set` (a built room as an M3DS file). Performance tracks (`rigstudio.expression_track`) and direction sheets are covered by `docs/expression-track.md` and the app's existing viewers.
- **In this app:** `src/results/registry.ts` (viewers are registered per kind; shot, set and track currently get read-only summaries), `src/rig/` (puppet loading, validation, the TS renderer), the project library (`src/library/`, where puppets/sets/shots/tracks are kept), and the **frame mode** for embedding a self-contained web tool (`docs/viewers.md`).
- **Graydient side:** set building (`rig-set-layers`), performance (`rig-perform`, `rig-track`), direction (`rig-direct`) and the puppet chain already run; a "shot" is authored in the stage and is plain JSON.
- A music tool is already embedded the same way: the song-score player (Groove Box Score Studio), as the template for how to bring an existing web tool in.

## Open questions (discovery pass first)

1. **Scope of v1.** Proposal: **play** any shot (view-only, with sound), then **edit** the common things (move an actor, change a key time, move the camera/light, trim a line), not the whole stage. Authoring from scratch (a director tool that emits shots) stays in Rig Studio / an LLM step.
2. **Where it runs.** Option A: embed the existing stage in a sandboxed same-origin frame (the proven route for the score player), with a thin bridge for loading assets from the library and saving the shot back. Option B: port `setcore.js` + the stage logic to TypeScript inside the app (like `rigcore.ts`), with a touch-first UI. Recommend a **spike on A first** to learn what the stage needs on a phone, then decide whether B is worth it.
3. **Assets and URLs.** A shot references its set, puppets, track and audio by URL. In the app those are library items and result files. Needs a resolver: library id or local file to a blob URL, with the shot rewritten on save, or a production bundle (a single file that inlines everything: Rig Studio's roadmap has this as "Bundle").
4. **Touch interaction.** Place by dragging in the room with a ground-plane constraint; timeline with pinch zoom, snapping to markers and line starts; keys edited with a two-finger scrub. Decide what a phone needs that a desktop stage does not (undo, big handles, one-handed use).
5. **Audio.** Mixing lines, sfx and music with ducking is already in the stage; on Android WebView the autoplay and AudioContext rules need checking, and the master limiter must survive.
6. **Export.** `.webm` recording works in desktop Chrome; check MediaRecorder + captureStream on Android WebView and iOS Safari. A render on Graydient (deterministic, frame by frame) is an open question in the Rig Studio roadmap.
7. **Interplay with the other briefs.** The companion (05) wants a puppet that performs a line; the game builder (04) and async world (06) want placed content. Design the shot/stage message API so they can reuse it.

## Proposed approach

1. **Spike (a few days):** the stage in a sandboxed frame inside a result panel, loading a library shot over the frame bridge (`src/results/frame/bridge.ts`), on a phone and the Android emulator. Learn: load time, WebGL budget, audio, touch gestures that already work, what breaks.
2. **Player v1 (view only):** registered as the viewer for kind `shot` (replacing the summary), with play/pause/scrub, mute, fullscreen, "Save recording" if capture works. Sets and tracks open as part of a shot; a lone set gets an orbit-free preview of the room, a lone track a viewer with the expression curves.
3. **Editor v1:** select, drag to place, key a position at the playhead, delete a key, move the camera and lamp, trim a line; undo/redo; autosave into the project library as a new version of the shot.
4. **Asset flow:** pick puppets, sets and sfx from the library when adding an actor; produce a bundle for export.
5. **Decision point:** port to TypeScript (B) only if the frame route cannot reach acceptable phone performance or feel.
6. Tests: shot validation on load (reject malformed/oversize, unknown fields pass through untouched), the resolver, bridge messages, a headless-Chrome check that a sample shot plays, then emulator and real-device passes. Document in `docs/staging.md`, update `docs/viewers.md` and `docs/rigging.md`.

## Definition of done

On a phone, a user can open a shot made in Rig Studio (or by the director step), watch it with sound, change where an actor stands and when a key lands, move the camera, save it back to the library, and export a video file, with the project kept in the explicit library store (never in the service-worker cache).

## Risks

Phone GPU and memory (the room is Three.js with per-prop normal/depth maps and several shadow-casting lights); audio autoplay and the master limiter on WebView; a timeline UI that is usable with a thumb; the size of sets (about 4 MB each); keeping the shot format backwards compatible with Rig Studio's stage (unknown fields must survive a round trip). Scope creep is the main risk: ship playback first.
