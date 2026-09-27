---
name: laravel-responsive-design
description: Use when building or reviewing layouts, CSS, Blade views, or any UI that must work across screen sizes — page layout, grids, navigation, tables, forms, modals, charts, images, or typography. Enforces mobile-first CSS, a verified breakpoint matrix from 320px to 1920px+, foldable and ultra-wide handling, portrait/landscape, touch targets, and overflow detection. Triggers on "responsive", "mobile", "breakpoint", "media query", "layout", "grid", "doesn't fit on mobile", "horizontal scroll", "tablet", "viewport", or any new page layout.
---

# Responsive Design

Mobile-first, always. Write the small-screen layout as the base, then add complexity
upward with `min-width` queries. The reverse — desktop-first with `max-width` overrides —
produces override chains that nobody can safely change.

## The base rule

```css
/* Base: works at 320px. No media query. */
.card-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr;
}

/* Enhance upward only */
@media (min-width: 48rem) {
    .card-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (min-width: 75rem) {
    .card-grid { grid-template-columns: repeat(3, 1fr); }
}
```

Better still, remove the breakpoints entirely where the content allows:

```css
.card-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
}
```

`min(18rem, 100%)` is the part people forget — without it, `minmax(18rem, 1fr)` overflows
below 288px + gutters. This single pattern replaces most card-grid media queries.

## Breakpoint matrix — verify at every one of these

| Width | Represents | Watch for |
|---|---|---|
| **320px** | Smallest supported; WCAG 1.4.10 reflow target | Horizontal scroll, clipped text, tables |
| **360px** | Common budget Android | Nav collapse, button wrapping |
| **375px** | iPhone SE / mini | Form field widths |
| **390px** | iPhone 14/15/16 | Safe-area insets, notch |
| **414px** | iPhone Plus/Max class | — |
| **576px** | Large phone landscape | Layout should still be single-column-ish |
| **768px** | Tablet portrait, foldable unfolded | First multi-column; nav decision point |
| **992px** | Tablet landscape, small laptop | Sidebar appears |
| **1200px** | Desktop | Max content width kicks in |
| **1400px** | Large desktop | Content should stop growing |
| **1600px** | Wide desktop | Line length must not exceed ~75ch |
| **1920px** | Full HD, and beyond | Centred, capped, not stretched |

Beyond 1920 the layout must **cap and centre**, never continue stretching. A 3440px
ultra-wide showing 300-character lines is a defect.

Additional required checks:
- **Landscape phone** — 812×375. Short viewport: sticky headers eat the screen, modals
  must scroll internally.
- **Foldables** — 280px folded (Galaxy Fold outer) and ~717–768px unfolded. Also test the
  hinge: `@media (spanning: single-fold-vertical)`.
- **200% and 400% browser zoom** — 400% zoom at 1280px ≡ 320px CSS width.

## Units

| Use | For |
|---|---|
| `rem` | Font sizes, spacing, breakpoints — scales with user preference |
| `ch` | Max line length (`max-inline-size: 70ch`) |
| `%` / `fr` | Fluid widths inside a grid or flex container |
| `clamp()` | Fluid type and spacing |
| `svh` / `lvh` / `dvh` | Viewport height on mobile — **never plain `vh`** |
| `px` | Borders, hairlines, and nothing else |

`100vh` on mobile includes the browser chrome that disappears on scroll, so a `100vh` hero
is taller than the screen and pushes content out of view. Use `100dvh` (dynamic),
`100svh` (small, safest for "fits without scrolling"), or `100lvh`.

### Fluid type without breakpoints

```css
:root {
    --step-0: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);      /* body */
    --step-1: clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem);      /* h3 */
    --step-2: clamp(1.5rem, 1.3rem + 1vw, 2rem);            /* h2 */
    --step-3: clamp(1.875rem, 1.5rem + 1.875vw, 3rem);      /* h1 */
}
```

Rule: the minimum in `clamp()` must be readable at 320px, and the whole expression must
still scale under browser zoom — always include a `rem` term, never `clamp(1rem, 2vw, 2rem)`
with a pure-`vw` middle (it breaks zoom, failing WCAG 1.4.4).

## Container queries — prefer these for components

A component should respond to **its container**, not the viewport. A card in a sidebar and
the same card in a full-width grid need different layouts at the same viewport width.

```css
.card-container { container-type: inline-size; container-name: card; }

.card { display: grid; gap: 1rem; }

@container card (min-width: 30rem) {
    .card { grid-template-columns: 12rem 1fr; }
}
```

Use viewport media queries for **page layout**; container queries for **components**.

## Layout primitives

```css
/* Page shell with gutters that never cause overflow */
.wrapper {
    inline-size: min(100% - 2rem, var(--max-width, 75rem));
    margin-inline: auto;
}

/* Sidebar that collapses on its own, no media query */
.with-sidebar {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
}
.with-sidebar > .sidebar { flex-basis: 18rem; flex-grow: 1; }
.with-sidebar > .content { flex-basis: 0; flex-grow: 999; min-inline-size: 60%; }

/* Anything that can overflow */
.scroll-x {
    overflow-x: auto;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
}
```

Use **logical properties** (`inline-size`, `margin-inline`, `padding-block`,
`inset-inline-start`) throughout — they make RTL support free.

## The five things that break

### 1. Tables

Never let a table cause page-level horizontal scroll. Two valid strategies:

**Scroll container** (preserves the table, best for data):

```blade
<div class="scroll-x" tabindex="0" role="region" aria-labelledby="tbl-caption">
    <table>
        <caption id="tbl-caption">{{ __('Invoices') }}</caption>
        ...
    </table>
</div>
```

`tabindex="0"` + `role="region"` + a name are required so keyboard users can scroll it —
this is the WCAG 1.4.10 exception, and it only applies if the container is operable.

**Card stack** (best for a few columns, action-oriented rows) — see
`references/tables.md` for the full `data-label` pattern.

### 2. Long unbreakable strings

Email addresses, URLs, tokens, and reference numbers blow out layouts at 320px.

```css
.break-safe {
    overflow-wrap: anywhere;
    hyphens: auto;
}
```

### 3. Fixed widths

`width: 600px` anywhere in a content area is a 320px defect. Use
`inline-size: min(100%, 37.5rem)`.

### 4. Images and embeds

```css
img, video, svg, iframe, canvas { max-inline-size: 100%; block-size: auto; }
```

Always set `width` and `height` attributes on `<img>` so the browser reserves space —
otherwise layout shifts on load (CLS). `laravel-media-management` owns `srcset`/`sizes`.

### 5. Modals on short screens

```css
.modal {
    max-block-size: min(90dvh, 48rem);
    overflow-y: auto;
    inline-size: min(100% - 2rem, 32rem);
}
```

On a landscape phone (375px tall) a fixed-height modal traps its own buttons off-screen.

## Navigation

Below ~768px, a horizontal nav with more than 4 items needs a disclosure pattern. It must
be a real `<button aria-expanded>` with Escape handling and focus return —
`laravel-ui-accessibility` owns those semantics; this skill owns *when* to switch.

Bottom navigation on mobile is legitimate for app-like UIs; respect safe areas:

```css
.bottom-nav {
    padding-block-end: max(0.75rem, env(safe-area-inset-bottom));
}
```

Add `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
for `env()` to have values.

## Touch

- Minimum target **24×24 CSS px** (WCAG 2.5.8); practical target **44×44** on touch.
- 8px minimum gap between adjacent targets.
- `min-block-size: 2.75rem` on form controls — also prevents iOS Safari's zoom-on-focus,
  which additionally requires **font-size ≥ 16px** on inputs.
- Never rely on hover. `@media (hover: hover)` guards hover-only affordances.

```css
@media (hover: hover) and (pointer: fine) {
    .card:hover { transform: translateY(-2px); }
}
```

## Verification — before claiming responsive

```bash
# 1. DevTools device toolbar at every width in the matrix above
# 2. Automated overflow detection at each width (see templates/responsive-check.js)
node templates/responsive-check.js http://localhost:8000

# 3. Real device or emulator: at minimum one Android and one iOS
# 4. Landscape phone, 200% zoom, 400% zoom
```

Paste this in the console at each width — it finds every overflowing element:

```js
document.querySelectorAll('*').forEach(el => {
  if (el.scrollWidth > document.documentElement.clientWidth) {
    console.warn('Overflow:', el, el.scrollWidth);
  }
});
```

Then run `checklists/responsive-review.md`.

## Scope boundaries

Owns layout, breakpoints, units, overflow, device/orientation coverage, touch sizing.
Does not own: semantics, ARIA, contrast, focus order (`laravel-ui-accessibility`);
image formats and `srcset` generation (`laravel-media-management`); CSS bundle size
(`laravel-performance`).

Shared with `laravel-ui-accessibility`: WCAG **1.4.10 Reflow** and **1.4.4 Resize Text**.
That skill states the criterion; this skill supplies the technique.

## Bundled resources

- `references/breakpoints.md` — the full matrix, device notes, foldables, ultra-wide
- `references/layout-patterns.md` — intrinsic layouts, grid recipes, sidebar, stack, cluster
- `references/tables.md` — every responsive table strategy with trade-offs
- `references/testing-responsive.md` — manual and automated procedures
- `templates/responsive-base.css` — resets, primitives, fluid scale, safe areas
- `templates/tailwind.config.js` — breakpoints aligned to the matrix
- `templates/responsive-check.js` — Playwright overflow/layout scanner
- `examples/responsive-fixes.md` — six real breakages and their fixes
- `checklists/responsive-review.md` — pre-merge gate
- `checklists/device-matrix.md` — the sign-off grid

---
Last reviewed: 2026-07-31 · See MAINTENANCE.md
