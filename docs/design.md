# Design system and motion

How Flotsam looks and moves, and how to add a screen that matches. Decisions (2026-10-21, with Jacob): dark, glassy, cinematic; a sea-themed palette; polished but quick motion; a drifting-wreckage motif for the name.

Before and after screenshots (every screen, three widths, dark and light) are in `docs/design/before/` and `docs/design/after/`; regenerate with `scripts/shots.mjs`.

## Tokens (`src/styles/tokens.css`)

Everything visual comes from CSS variables; nothing in `index.css` should hard-code a colour, radius or duration.

| Group                   | Tokens                                                                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour roles            | `--abyss` (page), `--deep`, `--surface` / `--surface-2` (translucent glass), `--surface-solid`, `--line`, `--fg`, `--muted`, `--accent`, `--accent-2`, `--on-accent`, `--warm` (coral highlight), `--err`, `--scrim`, `--glow`, `--bg-image` (the sea gradient) |
| Legacy aliases          | `--bg`, `--panel` (point at the roles above)                                                                                                                                                                                                                    |
| Space / radius / shadow | `--s-1..6`, `--r-1..3`, `--r-pill`, `--shadow-1/2`, `--blur`                                                                                                                                                                                                    |
| Type                    | `--font`, `--fs-0..4`                                                                                                                                                                                                                                           |
| Motion                  | `--dur-1/2/3` = 120 / 200 / 320 ms, `--ease-out`, `--ease-in`, `--ease-spring`                                                                                                                                                                                  |

The light theme (`:root[data-theme='light']`) maps the same roles to foam and sand. `node scripts/check-contrast.mjs` verifies every text/background pair meets WCAG AA in both themes (it runs against the token file, so change a colour and re-run it).

### Glass

`.glass` is a translucent surface with backdrop blur. It falls back to a solid colour where `backdrop-filter` is missing, and when the user turns on **Settings > Appearance > Reduce visual effects** (`data-effects="reduced"` on `<html>`).

## Motion rules

1. **Motion explains a state change.** Entering a screen, a card arriving, a result finishing, a sheet opening. No decoration that does not mean something (the one exception is the quiet drifting motif in empty states).
2. **Only `transform` and `opacity`** are animated (plus `filter` for the blur reveal). Layout properties never animate.
3. **Quick.** 120 ms for presses, 200 ms for small state changes, 320 ms for entrances; springs only for things you touch (tab indicator, toggles, sheets, lightbox).
4. **Interruptible.** Everything is CSS transitions or Web Animations that can be cut short by the next interaction.
5. **Reduced motion.** `prefers-reduced-motion: reduce` collapses all durations to 1 ms and stops looping animations (`tokens.css`); the end states still apply. Checked by `src/styles/guard.test.ts` and by `scripts/e2e-pwa.mjs` (`reduced_motion_collapses_animation`).
6. **Privacy surfaces never animate in.** `.privacy-cover` has `animation: none; transition: none` (guard test), and neither it nor the lock screen is inside the animated route wrapper.
7. **Use `animation-fill-mode: backwards`, not `both`.** A fill that keeps the final transform or opacity makes the element a stacking context and traps `position: fixed` overlays (the lightbox, sheets) under the tab bar. `scripts/e2e-pwa.mjs` checks that the lightbox covers the tab bar.

### What moves

- **Routes:** each route change fades and slides in (`.view-page`); moves between tabs slide in the direction the tab bar moved (`useDirection` in `src/lib/motion.ts`).
- **Tab bar:** icons, an indicator that springs between tabs, a pop on the running-jobs badge.
- **Job cards:** enter, status pill colour transitions, a progress bar (shimmer while waiting; fills over the estimated render time when there is one, with no timers), and a short glow when a job finishes while you are looking.
- **Media:** the blur eases away when you reveal an image; the lightbox grows out of the thumbnail, follows your finger when dragged and dismisses past 110 px (springs back otherwise).
- **Sheets:** slide up, backdrop fades, drag the handle down to close; Escape closes; focus is trapped and restored.
- **Feedback:** every button presses; haptics (`src/lib/haptics.ts`): success or error when a render finishes or fails. On Android they use the system haptic constants through the native plugin (`Haptics.kt`); on the web `navigator.vibrate` where it exists.

## Components (`src/components/ui/`)

`Icon` (one inline-SVG stroke set; add a path to `PATHS`), `Logo` (the wave and plank mark; `animated` bobs it), `Sheet`, `Skeleton`, `EmptyState` (with the `Drift` shapes). Layout classes in `index.css`: `.page`, `.card`, `.row`, `.pill`, `.glass`, `.toggle` (renders a real switch), `.empty-state`.

## Adding a screen

1. Wrap content in `<main className="page">`; group related controls in `<section className="card">`.
2. Use the existing buttons (`button`, `button.ghost`, `button.small`); they already press and focus correctly.
3. Add the route inside `AnimatedView` in `src/App.tsx`; if it is a tab, add it to `TABS` (order = slide direction).
4. Give empty lists an `EmptyState`, long loads a `Skeleton`, confirmations a `Sheet`.
5. Use tokens, not literals; run `scripts/check-contrast.mjs` if you add a colour.

## Not done / later

- A transient toast component (the lightbox has its own glass toast).
- A user-chosen accent colour (the token structure supports it; discreet mode could use it too).
- Judging motion _feel_: that is on the phone checklist in `docs/test-checklist.md`; headless Chrome and the emulator verify behaviour, not smoothness.
