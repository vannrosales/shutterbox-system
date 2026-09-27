# WCAG 2.2 AA — pre-merge gate

Run for any change that touches markup, CSS, or client-side behaviour.
★ = new or changed in WCAG 2.2.

## Document

- [ ] `<html lang>` set and correct for the locale; `dir` set for RTL locales
- [ ] `<title>` is unique, page-specific, and front-loads the page name (2.4.2)
- [ ] Exactly one `<h1>`, and it matches the page purpose
- [ ] Heading levels descend one at a time — no skips (1.3.1)
- [ ] Landmarks present: `header`, `nav`, `main`, `footer`; multiple `nav`s are labelled
- [ ] Skip link is the first focusable element and becomes visible on focus (2.4.1)
- [ ] `<main>` has `tabindex="-1"` so the skip link works
- [ ] Viewport meta has no `user-scalable=no` / `maximum-scale` (1.4.4)

## Content

- [ ] Every informative image has meaningful `alt`; decorative images have `alt=""` (1.1.1)
- [ ] Icons inside labelled controls are `aria-hidden="true" focusable="false"`
- [ ] Charts/complex images have a text or table alternative
- [ ] Link text makes sense out of context (2.4.4)
- [ ] Instructions don't rely on shape, size, or position ("the button on the right") (1.3.3)
- [ ] Foreign-language phrases marked with `lang` (3.1.2)
- [ ] All user-visible strings pass through `__()`
- [ ] Video has captions; audio has a transcript (1.2.2, 1.2.5)

## Colour and visual

- [ ] Text contrast ≥ 4.5:1 (≥ 3:1 for large text) (1.4.3)
- [ ] UI borders, icons, focus rings, chart lines ≥ 3:1 (1.4.11)
- [ ] No meaning conveyed by colour alone — icon or text accompanies it (1.4.1)
- [ ] Grayscale check performed: nothing becomes ambiguous
- [ ] Layout survives 200% zoom with no loss (1.4.4)
- [ ] No horizontal scroll at 320px CSS width, except tables/maps/code (1.4.10)
- [ ] Text-spacing bookmarklet applied: no clipping or overlap (1.4.12)
- [ ] `prefers-reduced-motion` respected
- [ ] Nothing flashes more than 3×/second (2.3.1)
- [ ] Auto-updating content over 5s has pause/stop/hide (2.2.2)
- [ ] Forced-colors mode: focus and borders still visible

## Keyboard

- [ ] Every function reachable and operable by keyboard (2.1.1)
- [ ] No keyboard trap; Escape exits every component (2.1.2)
- [ ] Focus indicator always visible, ≥ 3:1, ≥ 2px (2.4.7)
- [ ] Tab order matches visual/reading order; no positive `tabindex` (2.4.3)
- [ ] ★ Focused element never hidden behind sticky headers/footers (2.4.11)
- [ ] Focus returns to the trigger after closing a modal or menu
- [ ] Single-character shortcuts are disableable or scoped (2.1.4)
- [ ] Focus alone never triggers navigation or submission (3.2.1)
- [ ] Changing a control alone never causes an unexpected context change (3.2.2)

## Pointer and targets

- [ ] ★ Interactive targets ≥ 24×24 CSS px (aim 44×44 on touch) (2.5.8)
- [ ] ★ Every drag interaction has a single-pointer alternative (2.5.7)
- [ ] Accessible name contains the visible label text (2.5.3)
- [ ] Motion-actuated features have a UI equivalent (2.5.4)
- [ ] Tooltips/popovers are dismissible, hoverable, persistent (1.4.13)

## Forms

- [ ] Every input has `<label for>` matching its `id` (1.3.1, 3.3.2)
- [ ] Grouped controls wrapped in `<fieldset>` + `<legend>`
- [ ] Placeholder is never the only label
- [ ] `autocomplete` set on personal-data fields (1.3.5)
- [ ] `inputmode` set where the keyboard type matters
- [ ] Required fields marked in text, not colour/asterisk alone
- [ ] Errors are text, linked via `aria-describedby`, with `aria-invalid="true"` (3.3.1)
- [ ] Error messages say how to fix the problem (3.3.3)
- [ ] Error summary rendered at the top, focus moved to it, entries link to fields
- [ ] Submit button never disabled as validation feedback
- [ ] Destructive/financial/legal actions are reversible, checked, or confirmed (3.3.4)
- [ ] ★ No information requested twice in the same process (3.3.7)
- [ ] ★ Password fields accept paste; `autocomplete` set; no cognitive-only auth (3.3.8)
- [ ] Session timeout warns ≥ 20s ahead and can be extended (2.2.1)

## Components

- [ ] Native elements used wherever one exists
- [ ] Custom controls expose name, role, and state (4.1.2)
- [ ] Modals: labelled, focus moved in, trapped, Escape closes, focus returns
- [ ] Disclosure triggers are `<button>` with accurate `aria-expanded`
- [ ] Tabs implement roving tabindex and arrow keys
- [ ] Tables have `<caption>` and `<th scope>`; no layout tables
- [ ] Sortable headers use `aria-sort` and a real `<button>`/link
- [ ] Pagination in `<nav aria-label>` with `aria-current="page"`
- [ ] Dynamic status announced via `role="status"` / `role="alert"` (4.1.3)
- [ ] Live regions exist in the DOM before content is inserted
- [ ] Loading states have a text alternative, not a bare spinner
- [ ] SPA navigation moves focus to `<main>` and announces the new page

## ARIA discipline

- [ ] No ARIA where a native element would do
- [ ] No `role` that contradicts the element (`<button role="link">`)
- [ ] `aria-label` never overrides visible text that says something different (2.5.3)
- [ ] `aria-hidden="true"` never on a focusable element or its ancestor
- [ ] No `aria-live` on something already announced by a focus change
- [ ] Every `aria-labelledby` / `aria-describedby` / `aria-controls` id actually exists

## Verification performed

- [ ] axe / pa11y run — zero violations for WCAG 2.2 AA rule sets
- [ ] Full keyboard-only pass completed
- [ ] Screen-reader pass with NVDA (or VoiceOver) on the changed screens
- [ ] 320px and 200%-zoom checks done
- [ ] Results recorded in the release accessibility record

## If something cannot be fixed now

- [ ] Recorded in the accessibility statement's "known limitations"
- [ ] Has an owner and a target date
- [ ] An alternative route to the same outcome exists and is documented
