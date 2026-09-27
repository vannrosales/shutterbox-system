# Responsive review — pre-merge gate

For any change touching layout, CSS, or Blade markup.

## Approach

- [ ] CSS is mobile-first — base styles work at 320px, `min-width` queries add complexity
- [ ] No `max-width` media queries used as the primary mechanism
- [ ] Breakpoints declared in `rem`, not `px`
- [ ] Container queries used for components; viewport queries for page layout
- [ ] Logical properties used (`inline-size`, `margin-inline`, `inset-block-start`)

## Overflow — the blocking check

- [ ] No page-level horizontal scroll at **any** width from 320px to 1920px
- [ ] Console overflow scan run at 320, 375, 768, 1200 — zero results
- [ ] `min-inline-size: 0` set on every flex/grid child that can contain wide content
- [ ] `minmax(min(Xrem, 100%), 1fr)` used in every auto-fit grid
- [ ] Long strings (emails, URLs, tokens, reference numbers) have `overflow-wrap`
- [ ] No fixed `px` widths in content areas
- [ ] `overflow: hidden` not used to mask an overflow you did not diagnose

## Units

- [ ] No `100vh` — `100dvh` / `100svh` / `100lvh` used instead
- [ ] `clamp()` expressions include a `rem` term (pure `vw` breaks browser zoom)
- [ ] Font sizes and spacing in `rem`, not `px`
- [ ] `px` used only for borders and hairlines
- [ ] Prose capped at ~70ch

## Every breakpoint verified

- [ ] 320px — WCAG reflow floor
- [ ] 360px
- [ ] 375px
- [ ] 390px
- [ ] 414px
- [ ] 576px
- [ ] 768px
- [ ] 992px
- [ ] 1200px
- [ ] 1400px
- [ ] 1600px
- [ ] 1920px
- [ ] Beyond 1920px — content caps and centres, does not stretch

## Orientation and viewport height

- [ ] Landscape phone (812×375) — sticky chrome does not consume the screen
- [ ] Modals scroll internally; action buttons always reachable
- [ ] No orientation lock (WCAG 1.3.4)
- [ ] Short-viewport handling (`@media (max-height: 30rem)`) where sticky elements exist

## Zoom

- [ ] 200% browser zoom — no content or functionality lost (WCAG 1.4.4)
- [ ] 400% browser zoom — single column, no horizontal scroll (WCAG 1.4.10)

## Foldables

- [ ] Survives 280px (folded outer screen) without breaking
- [ ] Reflows correctly when resized **live** from 280 → 717px
- [ ] No JS that samples `window.innerWidth` once at startup — uses `ResizeObserver`

## Touch and pointer

- [ ] Interactive targets ≥ 24×24 CSS px; ≥ 44×44 for primary touch actions
- [ ] ≥ 8px gap between adjacent targets
- [ ] Form inputs ≥ 16px font-size (prevents iOS zoom-on-focus)
- [ ] Form controls ≥ 44px tall
- [ ] Hover-only affordances guarded by `@media (hover: hover)`
- [ ] `touch-action: manipulation` on tappable controls
- [ ] Safe-area insets handled where fixed/bottom UI exists, with `viewport-fit=cover`

## Components

- [ ] **Tables** — scroll container is focusable with a name, or card-stack with `data-label`
- [ ] **Navigation** — collapses to a disclosure below ~768px; still keyboard operable
- [ ] **Forms** — single column below 768px; max two columns above
- [ ] **Modals** — `inline-size: min(100% - 2rem, Xrem)`, `max-block-size` set, body scrolls
- [ ] **Images** — `max-inline-size: 100%`, `block-size: auto`, `width`/`height` attributes set
- [ ] **Charts** — resize via `ResizeObserver`; readable at 320px or offered as a table
- [ ] **Button rows** — `flex-wrap: wrap` with `gap`
- [ ] **Sticky headers** — `scroll-margin-top` set on anchors (WCAG 2.4.11)

## Content quality at each size

- [ ] Text never clipped without an expanded view
- [ ] No overlapping elements
- [ ] Line length ≤ 75ch at wide widths
- [ ] No enormous dead whitespace at 1920px+
- [ ] Images keep their aspect ratio
- [ ] Layout does not shift as assets load (`width`/`height` on images, `aspect-ratio` on frames)

## Automation

- [ ] `node templates/responsive-check.js <url> <paths>` passes
- [ ] Overflow assertion added to the e2e suite for new pages
- [ ] CI runs the scanner

## Real devices

- [ ] Tested on at least one real iOS device (Safari)
- [ ] Tested on at least one real Android device (Chrome)
- [ ] Tested with CPU throttling (4–6×) and a slow network profile

## Handoffs

- [ ] Semantics/ARIA/focus reviewed → `laravel-ui-accessibility`
- [ ] `srcset`/`sizes`/formats reviewed → `laravel-media-management`
- [ ] CSS bundle size within budget → `laravel-performance`
