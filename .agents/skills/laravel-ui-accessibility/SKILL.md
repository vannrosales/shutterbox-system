---
name: laravel-ui-accessibility
description: Use when writing or reviewing any user interface — Blade views, Livewire/Inertia components, forms, modals, tables, navigation, dropdowns, pagination, alerts, toasts, charts, or email templates. Enforces WCAG 2.2 Level AA and Philippine DICT web accessibility expectations by default: semantic HTML, heading order, labelled inputs, keyboard operability, focus management, contrast, error association, and screen-reader compatibility. Triggers on "build a form", "add a modal", "accessibility", "a11y", "WCAG", "screen reader", "keyboard navigation", "aria", "contrast", or any new markup.
---

# UI, UX & Accessibility

Accessibility is a build-time property, not a post-launch audit. Markup that is wrong is
cheaper to fix in the same commit than in a remediation sprint. Target: **WCAG 2.2
Level AA**, plus Philippine government expectations where the project is public sector.

## The five rules that prevent most defects

1. **Use the real element.** `<button>`, `<a href>`, `<input>`, `<select>`, `<dialog>`,
   `<table>`. A `<div onclick>` is not a button — it has no role, no keyboard handler, no
   focus, and no announcement. Rebuilding those with ARIA is strictly worse.
2. **Every input has a programmatic label.** A `<label for>` pointing at the input's `id`.
   Placeholder text is not a label; it disappears on focus and fails contrast.
3. **Everything works from the keyboard, and you can see where you are.** Tab reaches it,
   Enter/Space activates it, Escape closes it, and a visible focus indicator shows where
   focus went.
4. **Never encode meaning in colour alone.** Red border = also an icon and a text message.
   A status dot = also a text label.
5. **ARIA is a last resort.** *No ARIA is better than bad ARIA.* Reach for it only when
   HTML genuinely has no element for the pattern, and then follow the APG pattern exactly.

## Non-negotiable page structure

```blade
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" dir="{{ ... }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    {{-- Unique, front-loaded, describes THIS page --}}
    <title>{{ $title }} — {{ config('app.name') }}</title>
</head>
<body>
    <a href="#main" class="skip-link">{{ __('Skip to main content') }}</a>

    <header><nav aria-label="{{ __('Primary') }}"> ... </nav></header>

    <main id="main" tabindex="-1">
        <h1>{{ $heading }}</h1>   {{-- exactly one h1, matching the title --}}
        ...
    </main>

    <footer> ... </footer>
</body>
</html>
```

- `lang` on `<html>` — screen readers pick the wrong voice without it. Set `dir="rtl"` for
  Arabic/Hebrew locales.
- **Skip link** must be the first focusable element, visually hidden until focused, then
  visible. See the `.skip-link` block in `templates/a11y-base.css`.
- `tabindex="-1"` on `<main>` so the skip link can actually move focus there.
- **Headings descend one level at a time.** `h1 → h2 → h3`. Never skip a level to get a
  smaller font — use a class.
- One `<h1>` per page. Landmarks: `header`, `nav`, `main`, `aside`, `footer`. Multiple
  `nav` elements each need a distinguishing `aria-label`.

## Forms — the highest-defect area

```blade
<div>
    <label for="email">
        {{ __('Email address') }}
        <span aria-hidden="true">*</span>
        <span class="sr-only">{{ __('(required)') }}</span>
    </label>

    <input
        type="email"
        id="email"
        name="email"
        value="{{ old('email') }}"
        required
        autocomplete="email"
        inputmode="email"
        aria-describedby="email-hint @error('email') email-error @enderror"
        @error('email') aria-invalid="true" @enderror
    >

    <p id="email-hint" class="hint">{{ __('We will only use this to contact you about your application.') }}</p>

    @error('email')
        <p id="email-error" class="error">
            <svg aria-hidden="true" focusable="false">...</svg>
            {{ $message }}
        </p>
    @enderror
</div>
```

Requirements:
- `id` ↔ `for` on every field. Radio/checkbox groups use `<fieldset>` + `<legend>`.
- `aria-describedby` links hint **and** error to the input; screen readers announce them.
- `aria-invalid="true"` only when actually invalid.
- `autocomplete` tokens on personal data fields — WCAG 2.2 SC 1.3.5, and it makes forms
  faster for everyone.
- Errors are **text**, not just a red border, and appear next to the field.
- On submit failure, render an error summary at the top, move focus to it, and link each
  entry to its field. See `templates/error-summary.blade.php`.
- Never disable the submit button as validation feedback — a disabled control gives the
  user no way to find out why.
- Never `autofocus` past the top of the page; it strands keyboard and screen-reader users.

WCAG 2.2 adds: **3.3.7 Redundant Entry** (don't re-ask for information already given in
the same process) and **3.3.8 Accessible Authentication** (allow paste into password
fields; no cognitive puzzle as the only auth path).

Full patterns: `references/forms.md`.

## Interactive components

Each of these has a correct implementation in `references/components.md` and copy-ready
Blade in `templates/`. The rules that are always true:

| Component | Must have |
|---|---|
| Modal / dialog | `<dialog>` or `role="dialog" aria-modal="true"`, labelled by its heading, focus moves in on open, trapped while open, **returns to the trigger on close**, Escape closes |
| Dropdown / menu | Real `<button aria-expanded>`; arrow-key navigation; Escape closes and restores focus |
| Custom select / combobox | Follow APG combobox exactly, or use a native `<select>` |
| Tabs | `role="tablist/tab/tabpanel"`, arrow keys move, only the active tab is in tab order |
| Accordion | `<button aria-expanded aria-controls>` inside a heading element |
| Data table | `<caption>`, `<th scope="col|row">`, no layout tables |
| Sortable table | Sort control is a `<button>` in the `<th>`, `aria-sort` on the header |
| Pagination | `<nav aria-label="Pagination">`, `aria-current="page"`, meaningful link text |
| Alert / toast | `role="alert"` (assertive) or `role="status"` (polite); never auto-dismiss critical content; dismissible without a mouse |
| Tooltip | Content also available without hover; dismissible with Escape (SC 1.4.13) |
| Icon-only button | `aria-label` or visually-hidden text; icon `aria-hidden="true"` |
| Loading state | `aria-busy` or a `role="status"` live region — a spinner alone is silent |
| Charts | Text or table alternative; not colour-alone series encoding |

## Colour, contrast, motion

- Body text **4.5:1**, large text (18.66px bold / 24px) **3:1**, UI components and
  meaningful graphics **3:1** (SC 1.4.11).
- Focus indicator: **3:1** against adjacent colours, and at least a 2px perimeter
  (SC 2.4.11 Focus Appearance, and 2.4.13 in 2.2). Never `outline: none` without a
  stronger replacement.
- Text resizes to 200% and reflows at 320px CSS width without horizontal scroll (SC 1.4.10)
  — coordinate with `laravel-responsive-design`.
- Respect `prefers-reduced-motion`; disable parallax/auto-animation there.
- Anything that moves/auto-updates for more than 5s needs pause/stop/hide.
- Nothing flashes more than 3× per second.

## Targets and pointers (WCAG 2.2)

- **2.5.8 Target Size (Minimum)** — 24×24 CSS px minimum, with spacing exceptions.
  Practical target: **44×44** for anything primary on touch.
- **2.5.7 Dragging Movements** — every drag interaction needs a single-pointer alternative
  (reorder buttons alongside drag-and-drop).
- **2.4.11 Focus Not Obscured** — sticky headers/footers must not cover the focused
  element. Use `scroll-margin-top` equal to the sticky header height.

## Philippine DICT / government context

For Philippine public sector work, accessibility is a legal expectation, not a nicety:

- **RA 7277** (Magna Carta for Persons with Disabilities), as amended by **RA 9442**, and
  **BP 344** (Accessibility Law) establish the obligation to make government services
  accessible, including online services.
- **DICT** issues web accessibility guidance for government websites, aligned to WCAG, and
  the Philippine government web standards cover a common look-and-feel, mandatory pages
  (Transparency Seal, Citizen's Charter, Privacy Notice, Freedom of Information), and
  contact/feedback channels.
- **RA 10173** (Data Privacy Act) drives privacy notices and consent UI — coordinate with
  `laravel-security`.

Verify the current circular number and required page list against the DICT site for the
specific agency before treating this as a compliance sign-off — the circulars are updated
periodically and this skill is not a legal authority. What is stable and safe to build to:
**WCAG 2.2 AA satisfies or exceeds the technical bar in every version of this guidance**,
plus Filipino/English language support and low-bandwidth resilience.

Details and the mandatory-pages checklist: `references/dict-philippines.md`.

## Blade and framework specifics

- Blade `{{ }}` escapes; `{!! !!}` does not. Unescaped output is both an XSS hole and an
  accessibility hazard (broken markup). If you must render HTML, sanitise it first —
  see `laravel-security`.
- Wrap every user-visible string in `__()`. Untranslated strings block localisation and
  break screen readers in non-English locales.
- Livewire: `wire:loading` regions need `role="status"`; after a `wire:navigate` page
  change, move focus to `<main>` and announce the change, or the user is never told.
- Inertia: same — SPA navigation does not reset focus or announce a new page; do it
  manually in a route-change hook.
- Alpine: `x-show` hides visually but leaves the element in the accessibility tree unless
  it also sets `display:none` or `hidden`. Prefer `x-cloak` + real `hidden`.

## Verification before you claim it works

Automated tools catch roughly a third of issues. All three steps are required:

```bash
# 1. Automated
npx @axe-core/cli http://localhost:8000/page --exit
npx pa11y-ci --sitemap http://localhost:8000/sitemap.xml
npx lighthouse http://localhost:8000 --only-categories=accessibility

# 2. Keyboard — no mouse at all
#    Tab through the whole page. Can you reach everything? Is focus always visible?
#    Can you escape every component you enter? Does the order match the visual order?

# 3. Screen reader — NVDA (Windows, free), VoiceOver (macOS), or Orca (Linux)
#    Navigate by heading (H), by landmark (D), by form field (F).
```

Then run `checklists/wcag-2.2-aa.md`.

## Scope boundaries

Owns semantics, ARIA, contrast, keyboard, focus, screen-reader behaviour.
Does not own: breakpoints and layout (`laravel-responsive-design`), XSS and sanitisation
(`laravel-security`), asset weight (`laravel-performance`), chart design
(use the `dataviz` skill for visual encoding; this skill still governs the text alternative).

## Bundled resources

- `references/wcag-2.2-aa.md` — every AA criterion with a Laravel-specific "how"
- `references/forms.md` — labels, errors, summaries, multi-step, file upload
- `references/components.md` — modal, dropdown, tabs, table, toast, pagination, combobox
- `references/dict-philippines.md` — Philippine government context and mandatory pages
- `references/testing-a11y.md` — automated, keyboard, and screen-reader procedures
- `templates/` — Blade components, `sr-only`/skip-link CSS, focus-trap JS, axe CI workflow
- `examples/inaccessible-vs-accessible.md` — side-by-side rewrites of six common patterns
- `checklists/wcag-2.2-aa.md` — pre-merge gate
- `checklists/component-review.md` — per-component gate

---
Last reviewed: 2026-07-31 · Targets WCAG 2.2 AA · See MAINTENANCE.md
