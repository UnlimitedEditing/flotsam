# 01: UI redesign and motion

## Problem

Jacob's verdict: the app "looks like a vibe-coded app". Screens change by static shift: no easing, no transitions, no tactile feedback, little visual identity. The current UI is `src/App.css` + `src/index.css` plain CSS with flat panels and default controls.

## Goal

A coherent visual language with purposeful motion, so it feels like a finished app, not a form. Not a rewrite of behaviour: all existing flows, tests and privacy rules stay.

## What exists (inventory for the session)

Screens: Gate, Login, Chat (compose + live job cards), Workflows (picker), Queue, Gallery, Settings, Share, LockScreen, UpdateRequired, plus Lightbox, MediaThumb, JobCard, Banners, InstallCard, PrivacyCover, HeatPanel. Routing is `HashRouter` in `src/App.tsx`. Theme is dark with a green accent (`#22cc99`) and a light scheme via `prefers-color-scheme`. A `Flotsam dev` tag is visible in the footer of Settings.

## Proposed approach

1. **Audit pass first** (read-only): screenshot every screen at 360, 390 and 820 px in dark and light via `scripts/e2e-pwa.mjs` patterns; list what reads as default. Agree a short design direction with Jacob **before** restyling (one question set: mood, density, icon style, do we want a signature motif for "flotsam"/drifting objects).
2. **Design tokens**: spacing, radii, elevation, type scale, colour roles, motion tokens (durations 120/200/320 ms, easings `cubic-bezier(.2,0,0,1)` enter, `(.4,0,1,1)` exit, a spring for press/drag), all as CSS variables so themes and the discreet mode can re-skin.
3. **Motion that carries meaning** (each tied to a state change, not decoration):
   - Route transitions: shared-axis slide/fade between tabs, back-stack push/pop on detail views (CSS View Transitions API where available, fallback to a small wrapper; WebView 133 supports it, old WebViews degrade to none).
   - Lists: enter/exit and reorder animation for job cards (FLIP), skeleton placeholders while loading, progress that actually moves (indeterminate shimmer then determinate where the estimate exists).
   - Media: blur-to-reveal that eases the blur radius, thumbnail to lightbox shared-element zoom, pinch/drag-to-dismiss with spring.
   - Feedback: press states with scale, ripple or highlight on buttons, toggle thumb easing, success/failure micro-states on Send, haptics on Android through the native plugin (`FlotsamNative`) for send/finish/error.
   - Sheets and dialogs: bottom-sheet pattern for options/clear-data with backdrop fade, replacing inline expanders.
   - Always respect `prefers-reduced-motion` (swap to opacity-only) and keep every animation interruptible.
4. **Component pass**: one set of primitives (Button, IconButton, Chip, Card, Sheet, Toggle, Field, Toast, Skeleton), then migrate screens. Replace unicode glyph icons with one small inline-SVG icon set (no network fonts or icon CDNs; the CSP and no-third-party rule stay).
5. **Empty/first-run states** with personality: the Chat empty state, no workflows, offline, queue empty.
6. **Performance guardrails**: animate only `transform`/`opacity`; keep the precache size sensible (currently ~1.2 MB, 26 entries); no animation library unless it pays for itself (candidates: none, or `motion` mini if springs are needed); check low-end Android (emulator throttle) at 60 fps.

## Definition of done

Every screen restyled on the shared tokens; the motion list above implemented with reduced-motion handling; no behavioural regressions (159+ unit tests, `scripts/e2e-pwa.mjs` all green, emulator script green); screenshots before/after saved under `docs/`; a short `docs/design.md` describing tokens and motion rules so later features (03-05) look native.

## Risks

Scope creep (it is easy to redesign forever: timebox the audit and agree direction first). Motion must not break the privacy cover or the lock screen (they must still hide content instantly, with no easing that leaves content visible). The service-worker guard test must still pass if new assets are added.
