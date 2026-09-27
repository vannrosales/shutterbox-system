# Six real breakages and their fixes

---

## 1. The grid that overflows at 320px

```css
/* ✗ Below 288px + gutters, the track minimum forces the page wider */
.cards {
    display: grid;
    gap: 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
}
```

At 320px the browser cannot fit an 18rem (288px) track plus padding, so the grid overflows
and the whole page scrolls sideways.

```css
/* ✓ */
.cards {
    display: grid;
    gap: 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
}
```

`min(18rem, 100%)` means "18rem, or the full container width if that is smaller". This one
change fixes the most common responsive grid bug in existence.

---

## 2. The invisible wide child

Symptom: the page scrolls horizontally at 375px, but every element you inspect looks fine.

```html
<div class="app">
    <main class="app__main">
        <table>...</table>   <!-- 900px wide -->
    </main>
</div>
```

```css
/* ✗ */
.app { display: grid; grid-template-columns: 16rem 1fr; }
```

The cause: grid and flex children default to `min-width: auto`, meaning "at least as wide
as my content". The 900px table forces the `1fr` track to 900px, which forces the grid, the
page, and everything else wider.

```css
/* ✓ */
.app__main { min-inline-size: 0; }

/* and give the table its own scroller */
.table-scroll { overflow-x: auto; }
```

Apply `min-inline-size: 0` to every grid/flex child that can contain wide content. This is
the fix for the majority of "mysterious horizontal scroll" bugs.

---

## 3. The `100vh` hero that hides its own content

```css
/* ✗ */
.hero { height: 100vh; display: grid; place-items: center; }
```

On mobile, `100vh` is the viewport height *with the browser chrome hidden*. With the
address bar visible — which it is on load — the hero is taller than the visible area, so
the "scroll down" cue and any content below it are pushed off-screen. In landscape it
consumes the entire screen.

```css
/* ✓ */
.hero {
    min-block-size: 100svh;      /* small viewport height: the safe "fits" value */
    display: grid;
    place-items: center;
    padding-block: 2rem;
}

@media (max-height: 30rem) {
    .hero { min-block-size: auto; }   /* landscape phone */
}
```

`min-block-size` rather than `block-size` so the hero can grow if its content needs more
room — a fixed height clips content at 200% zoom, failing WCAG 1.4.4.

---

## 4. The button row that wraps into nonsense

```blade
{{-- ✗ --}}
<div class="flex justify-between items-center">
    <h2>{{ __('Invoices') }}</h2>
    <div class="flex gap-2">
        <button>{{ __('Export CSV') }}</button>
        <button>{{ __('Export PDF') }}</button>
        <button>{{ __('New invoice') }}</button>
    </div>
</div>
```

At 360px, `justify-between` with no wrapping squashes the buttons until the labels are
unreadable, or overflows.

```blade
{{-- ✓ --}}
<div class="cluster" style="justify-content: space-between">
    <h2>{{ __('Invoices') }}</h2>
    <div class="cluster">
        <button class="btn">{{ __('Export CSV') }}</button>
        <button class="btn">{{ __('Export PDF') }}</button>
        <a href="{{ route('invoices.create') }}" class="btn btn--primary">
            {{ __('New invoice') }}
        </a>
    </div>
</div>
```

```css
.cluster {
    display: flex;
    flex-wrap: wrap;         /* the fix */
    gap: 0.75rem;
    align-items: center;
}
.btn { min-block-size: 2.75rem; white-space: nowrap; }
```

`flex-wrap: wrap` plus `gap` means the row reflows to two lines instead of squashing.
`white-space: nowrap` on the button keeps its own label on one line.

Also note: "New invoice" navigates, so it is an `<a>` styled as a button, not a `<button>`.

---

## 5. The modal that traps its own buttons

```css
/* ✗ */
.modal {
    position: fixed;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: 500px;
    padding: 2rem;
}
```

Three failures: fixed 500px width overflows below 500px; no max-height means a long form
extends past the viewport with the submit button unreachable; on a landscape phone
(375px tall) almost nothing is visible.

```css
/* ✓ */
.modal {
    position: fixed;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    translate: -50% -50%;

    inline-size: min(100% - 2rem, 32rem);
    max-block-size: min(90dvh, 48rem);
    display: flex;
    flex-direction: column;
}

.modal__body   { overflow-y: auto; flex: 1; }   /* body scrolls */
.modal__footer { flex-shrink: 0; }               /* actions stay visible */
```

The structural fix is making the modal a flex column so the **body** scrolls while the
footer stays pinned — the buttons are always reachable.

---

## 6. The dashboard that stretches to 3440px

```css
/* ✗ */
.dashboard { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; }
```

On an ultra-wide monitor each card becomes ~1100px wide, text runs to 200+ characters per
line, and the layout reads as three enormous empty boxes.

```css
/* ✓ — cap the container, use extra width for density not stretching */
.dashboard-wrapper {
    inline-size: min(100% - 2rem, 90rem);
    margin-inline: auto;
}

.dashboard {
    display: grid;
    gap: 2rem;
    grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr));
}

.dashboard .card__text { max-inline-size: 70ch; }

@media (min-width: 100rem) {
    .dashboard { grid-template-columns: repeat(4, 1fr); }
}
```

The rule for wide screens: **more columns, not wider columns**, and prose always capped at
a readable measure.

---

## The recurring causes

Five of the six trace to two root causes:

1. **A fixed dimension where a constraint belonged** — `width: 500px` instead of
   `min(100%, 32rem)`, `height: 100vh` instead of `min-block-size: 100svh`.
2. **A missing minimum-size reset** — `min-inline-size: 0` on flex/grid children, and
   `min()` inside `minmax()`.

When a layout breaks and the cause is not obvious, check those two before anything else.
