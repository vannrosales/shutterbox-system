# Maintaining `laravel-responsive-design`

## Review triggers

| Trigger | Action |
|---|---|
| New device class reaches meaningful market share | Add a row to the matrix in `references/breakpoints.md` and `checklists/device-matrix.md` |
| A CSS feature crosses the support baseline | Promote it from "progressive enhancement" to "safe to use" |
| Project analytics show a viewport size not covered | Add it to the matrix |
| A responsive bug reaches production | Add the specific check to `checklists/responsive-review.md` |
| Tailwind major version | Update `templates/tailwind.config.js` (v4 moved theme config into CSS) |
| Design system change | Re-verify the fluid type scale and layout primitives |

Scheduled: every 6 months. Device widths drift slowly; support baselines drift faster.

## Keeping the matrix honest

The matrix in `references/breakpoints.md` is the core asset. It goes stale in a specific
way: device widths cluster around whatever phones shipped three years ago.

Check it against **the project's own analytics**, not a generic device list:

```sql
-- If you record viewport width on first page view
SELECT
    CASE
        WHEN viewport_width < 360 THEN '<360'
        WHEN viewport_width < 400 THEN '360-399'
        WHEN viewport_width < 768 THEN '400-767'
        WHEN viewport_width < 1200 THEN '768-1199'
        ELSE '1200+'
    END AS bucket,
    COUNT(*) AS sessions
FROM page_views
WHERE created_at > NOW() - INTERVAL 30 DAY
GROUP BY bucket
ORDER BY sessions DESC;
```

If a bucket has real traffic and is not in the matrix, add it. If a listed width has
effectively zero traffic across every project using this library, it can go — but keep
**320px** regardless, because it is a WCAG requirement, not a device.

## Support baseline

`references/breakpoints.md` lists which CSS features are safe. Re-check against
caniuse/Baseline at each review. Features currently on the watch list to promote:

- `@container style()` queries
- Viewport segments (`spanning:`, `env(viewport-segment-*)`)
- `text-wrap: balance` / `pretty` (already safe to use as enhancement)
- Anchor positioning

Never promote a feature on the strength of Chrome support alone. The floor is Safari.

## What to update where

| Change | File |
|---|---|
| Breakpoint values or device list | `references/breakpoints.md`, `templates/tailwind.config.js`, `templates/responsive-base.css` |
| New layout primitive | `references/layout-patterns.md` + `templates/responsive-base.css` |
| Table strategy | `references/tables.md` |
| Tooling | `references/testing-responsive.md` + `templates/responsive-check.js` |
| New blocking rule | `checklists/responsive-review.md` |

Breakpoint values appear in three files. Change all three together, or they drift.

## Testing changes to this skill

1. Skill loads: `/laravel-responsive-design`
2. Prompt test — *"Add a data table of transactions to the dashboard"* — verify the output
   uses a focusable scroll container or card stack without being asked
3. Second prompt test — *"Make this hero fill the screen"* — verify it produces `100svh`,
   not `100vh`
4. Templates parse:

```bash
node --check .claude/skills/laravel-responsive-design/templates/responsive-check.js
node --check .claude/skills/laravel-responsive-design/templates/tailwind.config.js
npx stylelint .claude/skills/laravel-responsive-design/templates/responsive-base.css
```

5. The scanner actually runs against a live app:

```bash
node templates/responsive-check.js http://localhost:8000 /
```

## Boundary discipline

Owns: layout, breakpoints, units, overflow, device coverage, touch sizing, orientation.

Hand off:
- Semantics, ARIA, focus order, contrast → `laravel-ui-accessibility`
- `srcset`, image formats, thumbnails → `laravel-media-management`
- CSS/JS bundle size and delivery → `laravel-performance`

**The shared boundary to watch:** WCAG 1.4.10 Reflow and 1.4.4 Resize Text appear in both
this skill and `laravel-ui-accessibility`. The agreed split is:

- `laravel-ui-accessibility` states the **criterion** (no horizontal scroll at 320px;
  200% zoom loses nothing) and includes it in the WCAG checklist
- `laravel-responsive-design` supplies the **technique** (units, `min()`, breakpoints,
  `min-inline-size: 0`) and the verification tooling

If you change one, check the other still agrees. Contradictory guidance across two skills
is worse than a gap in one.

## Changelog

| Date | Change |
|---|---|
| 2026-07-31 | Initial version. Matrix 320–1920px+, foldables, dvh/svh, container queries. |
