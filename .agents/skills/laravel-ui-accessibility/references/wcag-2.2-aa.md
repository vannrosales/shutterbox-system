# WCAG 2.2 Level AA — criterion by criterion

Every A and AA criterion, with what it means in a Laravel/Blade codebase. Criteria marked
**★** are new or changed in WCAG 2.2.

---

## 1. Perceivable

### 1.1.1 Non-text Content (A)
Every image, icon, and chart needs a text alternative.

```blade
{{-- Informative --}}
<img src="{{ $post->cover_url }}" alt="{{ $post->cover_alt }}" width="1200" height="630">

{{-- Decorative — empty alt, NOT a missing alt --}}
<img src="/img/flourish.svg" alt="">

{{-- Icon inside a labelled button --}}
<button type="button" aria-label="{{ __('Delete invoice') }}">
    <svg aria-hidden="true" focusable="false">...</svg>
</button>

{{-- Complex image --}}
<figure>
    <img src="/charts/revenue.png" alt="{{ __('Monthly revenue, January to December 2026') }}">
    <figcaption>{{ __('Revenue rose from ₱1.2M in January to ₱4.8M in December.') }}</figcaption>
</figure>
```

Make `alt` a required, validated field wherever users upload images. An `alt` column that
is nullable will be null.

### 1.2.x Time-based Media (A/AA)
Captions for prerecorded video (1.2.2), audio description (1.2.5), transcript for audio.
If the project hosts video, captions are a content-pipeline requirement — surface it early
because it is the most commonly missed deliverable.

### 1.3.1 Info and Relationships (A)
Structure must be programmatic, not visual.

- Headings are `<h1>`–`<h6>`, not styled `<div>`s
- Lists are `<ul>`/`<ol>`/`<dl>`
- Tabular data is `<table>` with `<th scope>`
- Related form controls are in `<fieldset><legend>`
- Emphasis is `<strong>`/`<em>`, not `<b>` styling alone

### 1.3.2 Meaningful Sequence (A)
DOM order matches reading order. Do not use CSS `order`, `flex-direction: row-reverse`, or
absolute positioning to reorder content — the keyboard and screen reader follow the DOM.

### 1.3.3 Sensory Characteristics (A)
Not "click the button on the right" or "the round icon". Name the control.

### 1.3.4 Orientation (AA)
Never lock to portrait or landscape. No `orientation` lock in CSS or the manifest.

### 1.3.5 Identify Input Purpose (AA)
`autocomplete` on personal-data fields:

```blade
<input id="name"    name="name"    autocomplete="name">
<input id="email"   name="email"   autocomplete="email"      inputmode="email">
<input id="tel"     name="tel"     autocomplete="tel"        inputmode="tel">
<input id="street"  name="street"  autocomplete="street-address">
<input id="postal"  name="postal"  autocomplete="postal-code" inputmode="numeric">
<input id="cc-num"  name="cc_num"  autocomplete="cc-number"   inputmode="numeric">
<input id="current" name="password" autocomplete="current-password">
<input id="new"     name="password" autocomplete="new-password">
```

### 1.4.1 Use of Color (A)
Colour is never the only signal.

```blade
{{-- ✗ colour only --}}
<span class="text-red-600">{{ $order->status }}</span>

{{-- ✓ colour + icon + text --}}
<span class="badge badge--{{ $order->status->color() }}">
    <svg aria-hidden="true" focusable="false">{!! $order->status->icon() !!}</svg>
    {{ $order->status->label() }}
</span>
```

Required-field asterisks, chart series, form errors, and link-vs-text distinction all fall
under this. Links inside body text need an underline or a 3:1 contrast difference *plus* a
non-colour cue on hover/focus.

### 1.4.3 Contrast (Minimum) (AA)
4.5:1 normal text · 3:1 large text (≥24px, or ≥18.66px bold) · logotypes exempt.
Disabled controls are exempt but should still be legible.

### 1.4.4 Resize Text (AA)
200% zoom without loss of content or function. Use `rem`, never fix container heights that
clip text, never `user-scalable=no` or `maximum-scale=1`.

### 1.4.5 Images of Text (AA)
Use real text. Exceptions: logos, and text that is genuinely part of a photograph.

### 1.4.10 Reflow (AA)
No horizontal scroll at 320 CSS px (i.e. 1280px at 400% zoom). Exception: data tables,
maps, and code, which may scroll in their own container. Owned jointly with
`laravel-responsive-design`.

### 1.4.11 Non-text Contrast (AA)
3:1 for input borders, focus indicators, toggle states, icon buttons, chart lines, and any
graphic needed to understand content. A 1px `#e5e7eb` border on white is 1.2:1 — it fails.

### 1.4.12 Text Spacing (AA)
Content must survive: line-height 1.5×, paragraph spacing 2×, letter-spacing 0.12em,
word-spacing 0.16em. Avoid fixed-height text containers and `overflow: hidden` on text.

### 1.4.13 Content on Hover or Focus (AA)
Tooltips/popovers must be **dismissible** (Escape without moving the pointer), **hoverable**
(the pointer can move onto them), and **persistent** (they don't vanish on a timer).

---

## 2. Operable

### 2.1.1 Keyboard (A)
Every function is keyboard-reachable. The test: unplug the mouse and complete the task.

### 2.1.2 No Keyboard Trap (A)
You can always tab out. The one legitimate trap is an open modal — which must be escapable
with Escape.

### 2.1.4 Character Key Shortcuts (A)
Single-character shortcuts (`/` to search) must be disableable, remappable, or only active
when a specific component has focus. Otherwise they fire while a speech-input user is
dictating.

### 2.2.1 Timing Adjustable (A)
Session timeouts must be turn-off-able, adjustable, or extendable with a warning at least
20 seconds ahead.

```blade
<div role="alertdialog" aria-labelledby="to-title" aria-describedby="to-desc">
    <h2 id="to-title">{{ __('Your session is about to expire') }}</h2>
    <p id="to-desc">{{ __('You will be signed out in 2 minutes.') }}</p>
    <button type="button" wire:click="extendSession">{{ __('Stay signed in') }}</button>
</div>
```

### 2.2.2 Pause, Stop, Hide (A)
Anything auto-moving/blinking/scrolling for >5s needs a control. Carousels: pause button,
and do not auto-advance by default.

### 2.3.1 Three Flashes (A)
Nothing flashes more than three times per second.

### 2.4.1 Bypass Blocks (A)
Skip link + landmarks. Both.

### 2.4.2 Page Titled (A)
Unique, descriptive, page-specific text first:
`{{ $post->title }} — {{ config('app.name') }}`.

### 2.4.3 Focus Order (A)
Tab order follows meaning. Never use positive `tabindex`. `tabindex="0"` adds a custom
control to the order; `tabindex="-1"` makes an element programmatically focusable only.

### 2.4.4 Link Purpose (A)
Link text makes sense alone. "Read more" ×12 on a page is a failure. If the design demands
it, add visually-hidden context:

```blade
<a href="{{ route('posts.show', $post) }}">
    {{ __('Read more') }}<span class="sr-only"> {{ __('about :title', ['title' => $post->title]) }}</span>
</a>
```

Links that open a new tab must say so, and are best avoided entirely.

### 2.4.5 Multiple Ways (AA)
At least two ways to reach any page: navigation, search, sitemap, or breadcrumbs.

### 2.4.6 Headings and Labels (AA)
Descriptive. "Information" is not a heading; "Shipping address" is.

### 2.4.7 Focus Visible (AA)

```css
:focus-visible {
    outline: 3px solid var(--focus-color, #1d4ed8);
    outline-offset: 2px;
    border-radius: 2px;
}
/* Never do this without an equal-or-better replacement */
/* *:focus { outline: none; } */
```

### ★ 2.4.11 Focus Not Obscured (Minimum) (AA)
A sticky header must not cover the focused element.

```css
:target, [id] { scroll-margin-top: var(--sticky-header-height, 5rem); }
```

Test by tabbing down a long page with the header stuck.

### ★ 2.5.7 Dragging Movements (AA)
Every drag has a non-drag alternative — move-up/move-down buttons next to a sortable list,
a numeric input next to a slider.

### ★ 2.5.8 Target Size (Minimum) (AA)
24×24 CSS px, or 24px of spacing around a smaller target. Inline links in a sentence are
exempt. Aim for 44×44 on touch-primary UI.

```css
.icon-button { min-inline-size: 2.75rem; min-block-size: 2.75rem; }
```

### 2.5.3 Label in Name (A)
The accessible name must contain the visible text — otherwise voice control ("click Save")
fails.

```blade
{{-- ✗ visible text "Save" is not in the accessible name --}}
<button aria-label="{{ __('Submit form') }}">{{ __('Save') }}</button>

{{-- ✓ --}}
<button>{{ __('Save') }}</button>
```

### 2.5.4 Motion Actuation (A)
Shake-to-undo needs a button too.

---

## 3. Understandable

### 3.1.1 Language of Page (A) / 3.1.2 Language of Parts (AA)

```blade
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<p>{{ __('The office is closed for') }} <span lang="fil">Araw ng Kagitingan</span>.</p>
```

### 3.2.1 On Focus (A) / 3.2.2 On Input (A)
Focus never triggers navigation. Changing a `<select>` never auto-submits unless the user
was told; provide a Go button.

### 3.2.3 Consistent Navigation (AA) / 3.2.4 Consistent Identification (AA)
Same nav order across pages; the same icon means the same thing everywhere.

### ★ 3.2.6 Consistent Help (A)
If help (contact link, chat, help page) appears on multiple pages, it appears in the same
relative order. Put it in the layout, not per-page.

### 3.3.1 Error Identification (A)
Errors described in text and programmatically associated (`aria-describedby`, `aria-invalid`).

### 3.3.2 Labels or Instructions (A)
Every input labelled; format requirements stated *before* submission, not after.

### 3.3.3 Error Suggestion (AA)
Say how to fix it: not "Invalid date" but "Enter the date as DD/MM/YYYY, for example 25/12/2026".

### 3.3.4 Error Prevention (Legal, Financial, Data) (AA)
Reversible, checked, or confirmed. Any destructive or financial action gets a confirmation
step showing exactly what will happen.

### ★ 3.3.7 Redundant Entry (A)
Do not ask for the same information twice in one process. Auto-populate, or offer a
"same as billing address" checkbox. Multi-step forms must retain prior answers.

### ★ 3.3.8 Accessible Authentication (Minimum) (AA)
No cognitive function test as the only path to authenticate.

- **Password fields must accept paste** — never `onpaste="return false"`.
- `autocomplete="current-password"` / `"new-password"` so managers work.
- If a puzzle CAPTCHA is used, offer an alternative (email link, audio, or a
  non-cognitive check).
- Object-recognition CAPTCHAs are permitted; text-transcription puzzles are not, unless an
  alternative exists.

---

## 4. Robust

### 4.1.2 Name, Role, Value (A)
Every custom control exposes a name, a role, and its state. If you cannot state all three
for a component you built, it is not accessible.

### 4.1.3 Status Messages (AA)
Status that appears without a focus change must be announced.

```blade
{{-- Polite: results counts, save confirmations --}}
<div role="status" aria-live="polite" aria-atomic="true">
    {{ trans_choice(':count result found|:count results found', $count, ['count' => $count]) }}
</div>

{{-- Assertive: errors that need immediate attention --}}
<div role="alert">{{ $error }}</div>
```

The live region must exist in the DOM **before** the content is injected — a region added
at the same time as its content is not announced.

Note: WCAG 2.2 removed 4.1.1 Parsing (it is obsolete in modern browsers), but valid markup
is still required for the criteria above to work.

---

## Quick criterion index

| Area | Criteria to re-read |
|---|---|
| New form | 1.3.1, 1.3.5, 2.4.6, 3.3.1–3.3.4, 3.3.7, 3.3.8, 4.1.3 |
| New modal | 2.1.2, 2.4.3, 2.4.7, 4.1.2 |
| New table | 1.3.1, 1.4.10 |
| New nav | 2.4.1, 2.4.5, 3.2.3, 3.2.6 |
| Colour/theme change | 1.4.1, 1.4.3, 1.4.11, 2.4.7, 2.4.11 |
| Touch/mobile UI | 1.3.4, 2.5.7, 2.5.8 |
| Login/auth | 3.3.8, 2.2.1 |
