# wave3:mobile

## Files touched

- `D:\Programs\monstertime\src\index.css`
- `D:\Programs\monstertime\src\ui\Stage.tsx`
- `D:\Programs\monstertime\src\ui\App.tsx`
- `D:\Programs\monstertime\src\ui\Landing.tsx`

Not touched: `ActionBar.tsx`, `Crowd.tsx`, `Chronicle.tsx`, `useGroup.ts` (nothing in them needed changing; reasons below).

## Research read

`docs/RESEARCH-READING-LIST.md`, then on disk from `D:\Programs\GameTev\research`: `input-controls/touch-mobile-input` (full), `ux-accessibility/ui-scaling-visual-customization` §§3-5, `ux-accessibility/text-readability` §§2-3, `ux-accessibility/color-contrast-accessibility` §§1-4, `ux-accessibility/photosensitivity-motion` §§1-3, `ux-accessibility/low-vision-screen-reader-support` (guidance table), `ux-accessibility/reducing-physical-demand` (guidance table, §§1-3), `ux-accessibility/hud-interface-ux` §2, `visual/rendering-performance-optimization` (guidance table, §§2-4).

Two of the "must" reports (text-readability, photosensitivity-motion) deliberately publish **no numbers** and mark every size/ratio/threshold `verify_current`. I did not invent numbers to fill those gaps; see "flagged, not implemented".

## Requirement table

| Requirement (with its number where the report gives one) | Report id | Where implemented |
|---|---|---|
| Touch targets sized against a 8-14mm contact patch; platform floors ~7-10mm of glass, treated as a floor for the tap region, not a redraw size | `input-controls.touch-mobile-input` §2.4, §6.1 | `index.css` `--tap: 44px` and the `@media (pointer: coarse)` pad block |
| Forgiving hit-testing extending past the drawn boundary | `input-controls.touch-mobile-input` §7.2 | same block: invisible `::after` pad, chrome unchanged |
| Generous padding between adjacent targets | `input-controls.touch-mobile-input` §2.4, §3.2 | `.topbar-tools` gap 8px to 12px on coarse pointers |
| No hover-dependent affordance (touch has no hover; first contact is the commit) | `input-controls.touch-mobile-input` §2.3, §1 | `button.creature-name` hairline made permanent under `@media (hover: none)`; every `:hover` rule gated behind `@media (hover: hover)` |
| Every registered touch produces a visible state change (glass gives no click back) | `input-controls.touch-mobile-input` §6.4, §11.3 | `:active` states in the coarse block; `-webkit-tap-highlight-color: transparent` so the OS grey box does not fight them |
| Frequent controls in the bottom thumb arc; top reserved for rare deliberate taps | `input-controls.touch-mobile-input` §2.6 | already correct, verified and documented in `.actionbar` |
| Honour OS-owned screen regions (notch, home indicator, side cutout) | `input-controls.touch-mobile-input` §2.7; `ux-accessibility.ui-scaling-visual-customization` §5.2 | `--inset-t/r/b/l` tokens applied to `.topbar`, `.frame`, `.notice`, `.ticker`, `.actionbar`, `.sheet`, `.landing`, `.lost` |
| Safe bounds as runtime data, not constants repeated per widget | `ux-accessibility.ui-scaling-visual-customization` §5.1 | four `env()` tokens in `:root`, referenced everywhere |
| Containers reflow (wrap/scroll) rather than clip when space runs out | same, §3.3, §3.5 | `.kind { min-width: var(--tap) }` plus the `@media (max-width: 380px)` rule: gaps shrink, targets never do |
| No required meaning carried by hue alone; value is the channel that survives | `ux-accessibility.color-contrast-accessibility` §1.3, §4.2 | `.dot` is now a ring when not live, a filled disc when live |
| Figure-ground separation is a task requirement, not decoration | same, §1.2 | `--ink-3` raised (measurements below) |
| Mobile: tightest budget, thermally sustainable rather than peak | `visual.rendering-performance-optimization` guidance table | reported to orchestrator, cannot be done in my files |
| Respect OS/browser text scaling, do not override it | `ux-accessibility.text-readability` §3.4 (mobile row) | `text-size-adjust: 100%` declines Safari's landscape auto-inflation only; browser font scaling and pinch zoom untouched |
| One-handed play, generous targets, no chords or holds | `ux-accessibility.reducing-physical-demand` (mobile row) | already true: six single taps, no hold, no chord, no mash. Verified, no change |
| Custom canvas surfaces need deliberate semantics | `ux-accessibility.low-vision-screen-reader-support` (platform=mobile row) | `role="progressbar"` on the stage meter, `aria-hidden` on the duplicated ticker, `aria-label` on the rail, `<main>` on Landing and Lost |

## Measurements

**Contrast, computed against the actual palette (WCAG relative luminance).** `--ink-3` was `#676e6b`: **3.75** on `--ground`, **3.57** on `--ground-2`, **3.32** on `--ground-3`. It carries real prose, not decoration: `.empty` ("Nothing yet. The first thing anybody does to it turns up here, and stays.", 13.5px), `.hint`, `.door p`, `.entry-meta`, `.count`, `.entry-time`, every `.label`. All three fail 4.5:1. Lifted along the same hue to `#7c8481`: **5.11 / 4.87 / 4.52**. `--ink-2` (7.06 on ground-2) and `--ink` (15.52) are unchanged, so the three-step ramp keeps its order. Checked and left alone: `--ember` on ground-2 is 7.22, `--on-ember` on ember is 7.57, the focus ring is 7.22 (needs 3), `--ember-deep` on `--line-soft` (the cooldown bar) is 3.16 and is non-text with a redundant text channel in `.settle`.

**Target sizes, before and after, on coarse pointers.** `.btn` 32px tall to a 44px tap region. `.icon-btn` 32x32 to 44x44. `.btn-text` ~21px to 44px. `button.creature-name` ~25px to 44px. `.btn-primary` 42px to 54px. Already compliant and untouched: `.kind` 62x57px (54px wide below 560px), `.variant` ~59px tall full-row.

**Narrow-phone fit.** Six `.kind` buttons at 54px with 6px gaps need 354px; a 390px phone offers 358px after the bar's padding, a 375px one offers 343px, a 320px one offers 288px. Flex would have shrunk them under 44px below 326px viewport width. With `min-width: 44px` plus the 380px rule (padding 16 to 8, gap 6 to 4) the requirement drops to 284px against 304px available at 320px, and 344 against 344 at 360px. Targets now never shrink below the floor on any phone width in the field.

**Viewport units.** Audited every one. `100dvh` was already correct on `.app`, `.landing`, `.lost`, `.sheet` (82dvh). The one remaining `vh` was `.variants { max-height: min(46vh, 320px) }`, which sized the action tray against the tall viewport and so overhung the visible screen; now `46dvh`. All remaining `vw`/`vh` uses are widths, which have no address-bar trap.

## Verified already correct, deliberately not changed

- `index.html` already ships `viewport-fit=cover`, so the `env()` insets resolve to real numbers rather than 0. (I do not own that file; nothing needed.)
- `src/forge/view.ts` already caps `setPixelRatio` at `Math.min(devicePixelRatio, 2)` and re-applies it on every resize.
- `prefers-reduced-motion` **is** already honoured in the 3D scene, with numbers: idle amplitude scaled to `motion = 0.25`, the animation clock to `motionRate = 0.55`, the reaction envelope shortened from 1.25s to 0.75s, and a `change` listener so toggling the OS setting takes effect live. The CSS block damps DOM animation and transitions. I added nothing here; duplicating it would have been noise.
- Orientation change and address-bar movement are handled by `CreatureView`'s own `ResizeObserver` on the canvas.
- Both text inputs are already 16px or larger (`.text-input` 16px, `.name-input` 22px), so iOS does not zoom the page on focus. This is why they must not be shrunk later.
- Focus rings are already keyboard-only (`:focus-visible`) and absent from text inputs, which use a border-colour change instead. Creator rule already satisfied; untouched.
- `.link-box`'s `title` attribute is not a sole channel: the link text is visible and the Copy button carries the full string.
- Top-right placement of Share and the group button: the touch report's own three-tier reach map (§2.6) puts "rare, deliberate taps, a pause button, a map toggle" in the stretch/top zone by design. Both qualify. Moving them would have been a redesign to satisfy a requirement the research does not actually make.

## Everything visible that changed

1. **`--ink-3` lightened** `#676e6b` to `#7c8481`. Every quiet-tier string gets slightly brighter. Reason: measured 3.32-3.75:1, under the 4.5 body prose needs (`color-contrast-accessibility`).
2. **The status dot is now a hollow ring when not connected**; the live dot is unchanged (filled ember, breathing). Reason: below 560px the words go screen-reader-only, so on a phone the dot alone carries connected-or-not, and under reduced motion the breathing that backed the colour up is gone. Shape survives greyscale and stillness (`color-contrast-accessibility` §1.3).
3. **Touch devices only: the creature name keeps its hairline underline permanently** instead of only on hover. Reason: it was the only affordance saying the name is editable, and touch has no hover (`touch-mobile-input` §2.3).
4. **Touch devices only: the top-bar tool gap goes 8px to 12px.** Reason: the 44px pads are 6px per side, and at an 8px gap two neighbours overlap by 4px, so a tap 2px right of Share would open the group sheet (`touch-mobile-input` §2.4).
5. **Touch devices only: controls now visibly respond to a press** (the same treatment their hover state used). Reason: glass gives no click back, and with hover correctly gated off there was previously nothing at all between tap and result (§6.4).
6. **Touch devices only: the iOS grey tap-flash is gone**, replaced by item 5.
7. **Phones 380px and narrower: the action bar's side padding goes 16px to 8px and the verb-row gap 6px to 4px.** Reason: keeps all six targets at 44px on a 320-360px phone.
8. **Notched devices: content moves inward from the edges the OS owns** (top bar, specimen frame, notice, ticker, action bar, sheet, landing, lost screen). Previously only the action bar's bottom inset existed.
9. **The action tray is slightly shorter on a phone** (46vh to 46dvh), because it now measures against the screen you can actually see.

Invisible: hover gating (this removes the stuck-hover-after-tap bug), `touch-action: manipulation`, `text-size-adjust`, `overscroll-behavior: contain` on the crowd, chronicle and tray scrollers, `.kind` min-width, the four ARIA changes, and the duplicate `ResizeObserver` removal in `Stage.tsx`.

## Flagged, could not implement in my files

1. **devicePixelRatio for phone GPUs.** `src/forge/view.ts:180` and `:263` cap at 2. A 390x844 phone at DPR 2 is 780x1688 = **1.317 Mpx per frame** with MSAA and a PCF-soft shadow pass; at 1.5 it is 585x1266 = **0.741 Mpx**, a 44% cut in fragment work. `visual.rendering-performance-optimization` (mobile row) asks for a thermally sustainable target, not peak. Exact text for whoever owns `view.ts`, in both places:
   ```ts
   // A phone is fill-rate bound before it is anything else, and it throttles
   // when it gets warm. 1.5 is 44% fewer fragments than 2 at the same size.
   const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
   r.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2))
   ```
2. **MSAA on mobile.** `antialias: true` (`view.ts:168`) is a second per-fragment multiplier on the same budget. Worth measuring against `false` at DPR 1.5 before deciding; I have not measured it and am not asserting the outcome.
3. **The render loop keeps running at full rate under the mobile sheet**, which covers 82dvh of the screen. `CreatureView` has no pause API, so `Stage.tsx` cannot stop it. Would need a `setPaused(boolean)` on the class.
4. **No haptic pulse on a confirmed action** (`touch-mobile-input` §6.4 wants visual plus haptic). `navigator.vibrate` does not exist on iOS Safari, which is half the target, so this would be a one-platform behaviour change rather than a fix. Not done.
5. **Minimum text size is unvalidated.** `.label` at 10.5px carries the six verb names, which are high-consequence strings in the smallest style tier, exactly the pattern `text-readability` §2.2 names as the commonest shipped readability failure. But that report refuses to publish a number (`verify_current`) and its method requires reading the real build on real hardware at the real distance. I will not guess a size and call it a requirement. This needs one on-device check.
6. **No user-facing accessibility control exists at all** (no reduced-motion, contrast or text-scale setting). `ux-accessibility.ui-scaling-visual-customization` §2.5 wants a first-run visual setup, and `photosensitivity-motion` §1.4 wants granular comfort controls. Both need a settings surface the app does not have; building one is a feature, not a fix.
7. **Tablet layout is a hole in the library, not a hole in the work.** The reading list's own selector recorded it as gap 6: "nothing addresses the phone-to-tablet responsive reflow of a 3D scene plus chrome." The one tablet claim that does exist (`touch-mobile-input` §2.6: two-handed tablet thumbs anchor at the side edges, so a bottom-centre row lands in a dead zone) does not force a change here, because the same section rates the stretch zone acceptable for "occasional, non-twitch actions" and every verb in this app is gated behind a 45s cooldown. I did not re-anchor the action bar on a guess. Portrait tablets up to 900px get the phone layout with the sheet; 1024px and up get the two-column rail; both were checked and hold.

## Deviations

None from the brief. No git, no build, no tsc, no vite (the CSS was instead validated by parsing it with the repo's own `postcss` and `lightningcss`: 152 rules, 17 at-rules, no errors, no warnings). Files outside my list untouched. No em or en dashes, no emoji, no non-ASCII anywhere in the four files (checked programmatically).

## Changes needed in `package.json` or `types.ts`

None.
