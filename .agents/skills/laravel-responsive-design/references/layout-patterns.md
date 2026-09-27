# Layout patterns

Intrinsic layouts first: patterns that adapt without media queries are fewer lines, fewer
bugs, and survive content changes.

---

## Wrapper (page shell)

```css
.wrapper {
    inline-size: min(100% - 2rem, var(--wrapper-max, 75rem));
    margin-inline: auto;
}
```

One line replaces `width: 100%; max-width: 1200px; padding: 0 1rem; margin: 0 auto` and
never double-counts padding against the max-width.

---

## Stack (vertical rhythm)

```css
.stack > * + * {
    margin-block-start: var(--stack-space, 1rem);
}

.stack--lg { --stack-space: 2rem; }

/* Exception for a specific gap */
.stack > .stack__break { --stack-space: 3rem; }
```

Owl selector: spacing between siblings, never before the first or after the last, so
containers never collapse oddly.

---

## Sidebar (collapses on its own)

```css
.with-sidebar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gutter, 1.5rem);
}

.with-sidebar > .sidebar {
    flex-basis: var(--sidebar-width, 18rem);
    flex-grow: 1;
}

.with-sidebar > .main {
    flex-basis: 0;
    flex-grow: 999;                 /* takes all remaining space when side by side */
    min-inline-size: var(--main-min, 60%);   /* forces the wrap below this */
}
```

When `.main` cannot keep 60% of the line, the flex container wraps and the sidebar goes
full width. No media query, and it responds to its *container*, not the viewport — so it
works inside a modal too.

---

## Switcher (N columns or 1, nothing between)

```css
.switcher {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
}

.switcher > * {
    flex-grow: 1;
    flex-basis: calc((var(--threshold, 30rem) - 100%) * 999);
}
```

Above the threshold, `flex-basis` computes negative → clamped to 0 → equal columns.
Below it, it computes to a huge number → each item takes a full row. Useful when a
half-and-half layout would be too cramped at any intermediate width.

---

## Card grid

```css
.grid-auto {
    display: grid;
    gap: 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
}
```

`min(18rem, 100%)` prevents overflow below 288px. `auto-fit` collapses empty tracks;
`auto-fill` keeps them — use `auto-fill` when you want a partially-filled last row to keep
its column widths.

---

## Cluster (tags, button rows, meta)

```css
.cluster {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
}
```

Button rows must use this. A row of buttons in a fixed flex with `nowrap` is the most
common 320px overflow.

---

## Cover (hero that fills without `100vh` bugs)

```css
.cover {
    display: flex;
    flex-direction: column;
    min-block-size: 100svh;          /* NOT 100vh */
    padding: 1rem;
}

.cover > * { margin-block: 1rem; }
.cover > .cover__centered { margin-block: auto; }

/* Landscape phone: do not eat the whole screen */
@media (max-height: 30rem) {
    .cover { min-block-size: auto; padding-block: 2rem; }
}
```

---

## Frame (fixed aspect ratio media)

```css
.frame {
    aspect-ratio: var(--ratio, 16 / 9);
    overflow: hidden;
}

.frame > img,
.frame > video,
.frame > iframe {
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
}
```

Prevents layout shift and keeps thumbnails uniform regardless of source dimensions.

---

## App shell (header / sidebar / content / footer)

```css
.app {
    display: grid;
    min-block-size: 100dvh;
    grid-template-areas:
        "header"
        "main"
        "footer";
    grid-template-rows: auto 1fr auto;
}

.app__header { grid-area: header; }
.app__main   { grid-area: main; min-inline-size: 0; }  /* min-inline-size: 0 is essential */
.app__footer { grid-area: footer; }

@media (min-width: 62rem) {
    .app {
        grid-template-areas:
            "header header"
            "nav    main"
            "footer footer";
        grid-template-columns: 16rem 1fr;
    }
    .app__nav { grid-area: nav; }
}
```

**`min-inline-size: 0`** on the content area is the fix for the single most common grid
bug: a grid/flex item defaults to `min-width: auto`, so a wide child (a table, a long
string, a `<pre>`) forces the whole track wider and the page scrolls horizontally. Set it
on every grid/flex child that can contain wide content.

---

## Forms

```css
.form-grid {
    display: grid;
    gap: 1rem 1.5rem;
    grid-template-columns: 1fr;
}

@media (min-width: 48rem) {
    .form-grid { grid-template-columns: repeat(2, 1fr); }
    .form-grid > .field--full { grid-column: 1 / -1; }
}

/* Inputs: full width, ≥16px font (prevents iOS zoom-on-focus), ≥44px tall */
.form-grid input,
.form-grid select,
.form-grid textarea {
    inline-size: 100%;
    font-size: max(1rem, 16px);
    min-block-size: 2.75rem;
}
```

Never place more than two fields side by side below 992px. Date day/month/year triples are
the exception — keep them inline but sized in `ch`.

---

## Sticky elements

```css
.site-header {
    position: sticky;
    inset-block-start: 0;
    z-index: 10;
}

:root { --sticky-header-height: 4rem; }

/* WCAG 2.4.11 — focused/anchored content must clear the sticky header */
[id] { scroll-margin-top: calc(var(--sticky-header-height) + 1rem); }

/* Short viewports: sticky chrome costs too much */
@media (max-height: 30rem) {
    .site-header { position: static; }
}
```

Sticky table headers need the scroll container, not the page, to be the scroller:

```css
.scroll-x { overflow: auto; max-block-size: 70dvh; }
.scroll-x thead th { position: sticky; inset-block-start: 0; background: canvas; z-index: 1; }
```

The `background` is required — a transparent sticky header shows rows scrolling under it.

---

## Safe areas (notches, home indicators)

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

```css
.site-header { padding-block-start: max(1rem, env(safe-area-inset-top)); }
.bottom-nav  { padding-block-end:  max(0.75rem, env(safe-area-inset-bottom)); }
.wrapper     { padding-inline: max(1rem, env(safe-area-inset-left), env(safe-area-inset-right)); }
```

`max()` guarantees a sensible fallback where `env()` is 0 or unsupported.

---

## Logical properties reference

Use these throughout — RTL support becomes free.

| Physical | Logical |
|---|---|
| `width` / `height` | `inline-size` / `block-size` |
| `min-width` / `max-width` | `min-inline-size` / `max-inline-size` |
| `margin-left/right` | `margin-inline-start/end`, `margin-inline` |
| `padding-top/bottom` | `padding-block-start/end`, `padding-block` |
| `top` / `left` | `inset-block-start` / `inset-inline-start` |
| `text-align: left` | `text-align: start` |
| `border-left` | `border-inline-start` |
| `float: left` | `float: inline-start` |

---

## Anti-patterns

| Anti-pattern | Why it breaks | Instead |
|---|---|---|
| `width: 600px` in content | Overflows below 600px | `inline-size: min(100%, 37.5rem)` |
| `height: 100vh` | Mobile browser chrome makes it too tall | `100dvh` / `100svh` |
| `position: absolute` for layout | Removed from flow; overlaps at other sizes | Grid or flex |
| Negative margins to escape a container | Fragile and overflows | Restructure or `margin-inline: calc(...)` with a wrapper |
| `overflow: hidden` to "fix" overflow | Hides the content instead of fixing it | Find the wide child |
| JS reading `window.innerWidth` for layout | Wrong after rotation/fold/resize | CSS, or `ResizeObserver` |
| `max-width` media queries as the base | Override chains, desktop-first | `min-width`, mobile-first |
| `!important` to win a breakpoint fight | Compounds | Fix specificity or ordering |
| Missing `min-width: 0` on flex/grid children | Wide children force page scroll | Add it |
