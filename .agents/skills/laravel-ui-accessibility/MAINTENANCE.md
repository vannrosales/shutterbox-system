# Maintaining `laravel-ui-accessibility`

## Review triggers

| Trigger | Action |
|---|---|
| New WCAG version or errata (W3C) | Update `references/wcag-2.2-aa.md`, the checklist, and the version in `SKILL.md` |
| DICT or Philippine government web standards revised | Update `references/dict-philippines.md`; re-verify circular numbers and mandatory pages |
| New component added to the design system | Add its pattern to `references/components.md` + a template |
| An accessibility bug reaches production | Add the specific check to `checklists/component-review.md` — every escaped defect becomes a permanent gate |
| Browser/AT support shifts (e.g. `<dialog>`, `inert`, `popover`) | Revisit the "prefer native" recommendations |
| Design system or CSS framework changes | Re-verify contrast tokens and focus styles in `templates/a11y-base.css` |

Scheduled: every 6 months, plus within one month of any WCAG or DICT publication.

## Deliberately unverified claims

`references/dict-philippines.md` carries a scope note stating it is not a legal authority.
**Keep that note.** Circular numbers and required-page lists change; an out-of-date claim
presented with confidence is worse than a pointer to the source. When updating that file,
either cite a checked source with a date or keep the hedge.

The stable technical claim — that WCAG 2.2 AA meets or exceeds the DICT technical bar — is
the one to build on.

## What to update where

| Change | File |
|---|---|
| Criterion interpretation | `references/wcag-2.2-aa.md` |
| Form pattern | `references/forms.md` + `templates/` |
| Component pattern | `references/components.md` + `templates/` |
| PH regulatory context | `references/dict-philippines.md` |
| Tooling / commands | `references/testing-a11y.md` + `templates/a11y-workflow.yml` |
| New blocking rule | `checklists/wcag-2.2-aa.md` |

## Testing changes to this skill

1. Confirm the skill loads: `/laravel-ui-accessibility`
2. Prompt test — *"Add a filter dropdown to the invoices table"* — verify the output
   produces a real `<button aria-expanded>`, Escape handling, and focus return without
   being asked
3. Second prompt test — *"Show the order status as a coloured dot"* — verify it pushes
   back on colour-only encoding
4. Validate the templates actually work:

```bash
# Blade template parses
php artisan view:cache 2>&1 | grep -i error

# CSS parses
npx stylelint .claude/skills/laravel-ui-accessibility/templates/a11y-base.css

# JS parses
node --check .claude/skills/laravel-ui-accessibility/templates/focus-trap.js
```

5. Verify referenced paths exist:

```powershell
Select-String -Path .\SKILL.md -Pattern '`([a-z]+/[a-z0-9\-\.]+)`' -AllMatches |
    ForEach-Object { $_.Matches.Groups[1].Value } | Sort-Object -Unique |
    Where-Object { -not (Test-Path $_) }
```

## Boundary discipline

Owns: semantics, ARIA, keyboard, focus, contrast, screen-reader behaviour, and the
regulatory context for accessibility.

Hand off, do not absorb:
- Breakpoints, layout, device matrix → `laravel-responsive-design`
- XSS, sanitisation, CSP → `laravel-security`
- Asset weight, image formats → `laravel-performance`, `laravel-media-management`
- Chart colour encoding → the `dataviz` skill (this skill still owns the text alternative)

The overlap most likely to cause contradictions is **1.4.10 Reflow** and **1.4.4 Resize**,
which touch both this skill and responsive design. The split: this skill states the
*criterion* (no horizontal scroll at 320px, 200% zoom works); responsive design states the
*technique* (breakpoints, container queries, fluid type).

## Keeping SKILL.md short

It is read on every activation. Target under 250 lines. When adding guidance, ask whether
it changes what someone types — if it is background, it belongs in `references/`.

## Changelog

| Date | Change |
|---|---|
| 2026-07-31 | Initial version. WCAG 2.2 AA baseline; PH context documented with a verification hedge. |
