# Component review gate

For any new or modified interactive component. If you cannot answer the first three
questions out loud, the component is not finished.

## The three questions (SC 4.1.2)

1. **Name** — what does a screen reader announce this as? Where does that name come from
   (visible text, `<label>`, `aria-label`, `aria-labelledby`)?
2. **Role** — what kind of thing is it? Is that role native, or asserted with ARIA? If
   asserted, does the keyboard behaviour match what the role promises?
3. **State** — expanded/collapsed, selected, checked, invalid, busy, current. Is each
   state exposed programmatically and updated when it changes?

## Keyboard model

- [ ] `Tab` reaches it
- [ ] `Enter` activates (buttons and links)
- [ ] `Space` activates (buttons, checkboxes)
- [ ] `Escape` closes/cancels anything that opened
- [ ] Arrow keys where the APG pattern requires them (tabs, menus, listbox, radio, grid)
- [ ] `Home` / `End` where a list is navigable
- [ ] Roving tabindex used for composite widgets — exactly one stop in the tab order
- [ ] No keyboard trap
- [ ] Focus is visible at every step

## Focus management

- [ ] Opening moves focus deliberately (to the container or its first control)
- [ ] Closing returns focus to the trigger
- [ ] Removing the focused element moves focus somewhere sensible, not to `<body>`
- [ ] Content appearing above the fold does not scroll focus out of view
- [ ] Focus is never placed on a non-interactive element without `tabindex="-1"`

## Screen-reader behaviour

- [ ] Announced correctly in NVDA + Firefox
- [ ] Announced correctly in NVDA + Chrome
- [ ] State changes are announced when they happen
- [ ] Nothing announced twice (a common `aria-label` + visible text mistake)
- [ ] Nothing important is silent
- [ ] Hidden content is genuinely hidden (`hidden` / `display:none`, not just opacity)

## Visual

- [ ] Contrast: text 4.5:1, borders/icons/focus 3:1
- [ ] Every state (hover, focus, active, disabled, selected, error) is visually distinct
      by more than colour
- [ ] Target ≥ 24×24 CSS px (44×44 on touch)
- [ ] Works at 200% zoom
- [ ] Works at 320px width
- [ ] Works in forced-colors mode
- [ ] Respects `prefers-reduced-motion`

## Content

- [ ] All strings via `__()`
- [ ] Accessible name contains the visible label
- [ ] Icons are `aria-hidden="true" focusable="false"`
- [ ] Empty state is real text, not a blank region

## Framework-specific

**Livewire**
- [ ] `wire:loading` regions have `role="status"` and text
- [ ] Focus preserved or deliberately moved after a re-render (`wire:key` on list items)
- [ ] Validation errors re-announced after each round trip
- [ ] `wire:navigate` moves focus to `<main>` and announces the new page

**Alpine**
- [ ] `x-cloak` present and `[x-cloak]{display:none}` in CSS
- [ ] `x-show` paired with real hiding, not opacity alone
- [ ] Escape handler restores focus to the trigger

**Inertia**
- [ ] Route change moves focus and announces the page title
- [ ] Server-side validation errors mapped to `aria-describedby`/`aria-invalid`

## Tests to add

- [ ] Markup assertion: labels present, ids unique, heading order sane
- [ ] axe run on a page containing the component — zero violations
- [ ] Browser test for the keyboard path (open → operate → Escape → focus returned)

## Sign-off

- [ ] Manual keyboard pass done by a human
- [ ] Manual screen-reader pass done by a human
- [ ] Reviewer named and date recorded
