# Breakpoints and the device matrix

## Principle: content decides, devices verify

Do not pick breakpoints from a device list. Widen the browser until the layout looks
wrong, and put a breakpoint there. The device list below is what you **verify** against,
not what you design to — device widths change every year; content does not.

That said, a project needs a shared vocabulary. Use these:

```css
:root {
    /* Named for intent, not device */
    --bp-sm:  36rem;   /*  576px — large phone landscape */
    --bp-md:  48rem;   /*  768px — tablet portrait / foldable unfolded */
    --bp-lg:  62rem;   /*  992px — tablet landscape / small laptop */
    --bp-xl:  75rem;   /* 1200px — desktop */
    --bp-2xl: 87.5rem; /* 1400px — large desktop */
}
```

Breakpoints in `rem`, not `px`. A `px` breakpoint ignores the user's browser font size; a
`rem` breakpoint shifts with it, which is what a user who set 24px default text wants.

> Note: media query `rem` always resolves against the browser's root default (usually
> 16px), not against a `:root { font-size }` override — which is one more reason not to
> set `html { font-size: 62.5% }`.

## Full verification matrix

| Width | Device class | Specific devices | What breaks here |
|---|---|---|---|
| **280px** | Folded foldable | Galaxy Fold (outer, older) | Everything. Treat as best-effort, not a support target |
| **320px** | Support floor | iPhone SE 1st gen, WCAG reflow target | Horizontal scroll, tables, long strings, fixed widths |
| **360px** | Budget Android | Galaxy A-series, most PH mid-range | Nav wrapping, two-button rows |
| **375px** | Compact iPhone | iPhone SE 2/3, 13 mini | Form fields, card padding |
| **390px** | Standard iPhone | iPhone 14/15/16 | Safe areas, notch/Dynamic Island |
| **393px** | Standard Android | Pixel 7/8/9 | — |
| **414–430px** | Large phone | iPhone Plus/Pro Max | Layouts that jump too early to 2-col |
| **576px** | Phone landscape | — | Short viewport height; sticky chrome |
| **717–768px** | Foldable unfolded / tablet portrait | Galaxy Fold inner, iPad mini/Air portrait | The multi-column decision point; hinge |
| **820–834px** | Tablet portrait | iPad Air/Pro 11" | — |
| **992–1024px** | Tablet landscape / netbook | iPad landscape | Sidebar introduction; hover assumptions |
| **1200px** | Desktop | Common laptop | Max-width should engage |
| **1366px** | Laptop | Very common Windows laptop | — |
| **1400px** | Large desktop | — | Content must stop growing |
| **1600px** | Wide | — | Line length > 75ch |
| **1920px** | Full HD | Most common desktop monitor | Stretched layouts, giant whitespace gaps |
| **2560px+** | Ultra-wide / 4K | 3440×1440, 5120×1440 | Must cap and centre |

## Height matters too

Width-only testing misses a whole class of defects.

| Height | Scenario | Breaks |
|---|---|---|
| **375px** | Phone in landscape | Sticky header + footer leave ~200px; modals trap their own buttons |
| **667px** | Standard phone portrait | Above-fold content budget |
| **1024px+** | Desktop | Short pages with `100vh` sections leave dead space |

```css
/* Reduce sticky chrome when vertical space is scarce */
@media (max-height: 30rem) {
    .site-header { position: static; }
    .modal { max-block-size: 95dvh; }
}
```

## Orientation

Never lock orientation (WCAG 1.3.4). Handle both.

```css
@media (orientation: landscape) and (max-height: 30rem) {
    .hero { min-block-size: auto; padding-block: 2rem; }
}
```

The common bug: a hero sized `min-height: 100vh` is fine in portrait and consumes the
entire landscape screen, hiding that there is any content below it.

## Foldables

```css
/* Viewport Segments API — dual-screen and folded-flat devices */
@media (spanning: single-fold-vertical) {
    .layout {
        display: grid;
        grid-template-columns: env(viewport-segment-width 0 0) 1fr;
    }
}

@media (spanning: single-fold-horizontal) {
    .layout { grid-template-rows: env(viewport-segment-height 0 0) 1fr; }
}
```

Support is limited. The pragmatic requirement is simpler and always applies:

1. The layout must survive **280px** without breaking (folded outer screen).
2. The layout must reflow correctly when the device **unfolds** — a resize from 280px to
   717px mid-session. Test by resizing the window live, not by loading at each width.
   Layouts that read viewport size once in JS fail here.

## Ultra-wide and 4K

```css
.wrapper {
    inline-size: min(100% - 2rem, 75rem);   /* hard cap */
    margin-inline: auto;
}

.prose {
    max-inline-size: 70ch;                   /* readable line length */
}
```

At 3440px, a `width: 100%` text column is ~450 characters per line — unreadable. Cap
everything that contains prose. Dashboards may use the extra width for more columns, but
via `repeat(auto-fit, minmax(...))`, not by stretching existing ones.

```css
/* Use extra width for density, not for stretching */
@media (min-width: 100rem) {
    .dashboard { grid-template-columns: repeat(4, 1fr); }
}
```

## Browser support baseline

Support the current and previous two versions of Chrome, Edge, Firefox, Safari (desktop
and iOS), and Samsung Internet. That is roughly:

| Feature | Safe to use |
|---|---|
| Flexbox, Grid, custom properties | Yes |
| `clamp()`, `min()`, `max()` | Yes |
| Logical properties | Yes |
| `dvh`/`svh`/`lvh` | Yes |
| `gap` in flexbox | Yes |
| Container queries | Yes (2023+ across all majors) |
| `:has()` | Yes (2023+) |
| Subgrid | Yes (2023+), verify on your Safari floor |
| `@container style()` queries | Progressive enhancement only |
| Viewport segments (`spanning:`) | Progressive enhancement only |
| `text-wrap: balance` / `pretty` | Progressive enhancement — degrades cleanly |

Check the project's actual analytics before assuming. In markets where older Android
WebView is common, verify on Samsung Internet and Chrome for Android specifically.

## Tailwind alignment

If the project uses Tailwind, align its screens with the matrix rather than accepting
defaults blindly:

```js
screens: {
    'sm':  '36rem',    // 576
    'md':  '48rem',    // 768
    'lg':  '62rem',    // 992
    'xl':  '75rem',    // 1200
    '2xl': '87.5rem',  // 1400
}
```

Tailwind is mobile-first by default — `md:grid-cols-2` means "at md **and up**". Using
`max-md:` variants signals you are designing desktop-first; reconsider.

## The one breakpoint most projects get wrong

The jump from one column to two. Teams put it at 768px because that is "tablet". The right
place is wherever the content column would otherwise exceed ~75ch, which is often around
640–720px for prose and much wider for cards. Check the actual line length before choosing.
