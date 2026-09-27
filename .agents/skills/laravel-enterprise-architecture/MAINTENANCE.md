# Maintaining `laravel-enterprise-architecture`

## Review triggers

Review this skill when any of these happen:

| Trigger | What to check |
|---|---|
| New Laravel major release | Skeleton changes, deprecated APIs, new first-party patterns |
| New PHP minor/major | `references/php84-laravel12.md` — new syntax worth adopting, new deprecations |
| A convention in the library conflicts with a real project 3+ times | The convention is probably wrong; change it here |
| A pattern in `patterns.md` is consistently ignored by the team | Either enforce it or remove it — dead guidance erodes trust in the rest |
| A postmortem traces to a placement mistake | Add the rule to `checklists/architecture-review.md` |

Scheduled: review every 6 months minimum, and within one month of a Laravel major release.

## What to update where

| Change | File |
|---|---|
| New/changed layer rule | `references/layering.md` + the layering diagram in `SKILL.md` |
| New pattern adopted | `references/patterns.md` + a stub in `templates/` |
| Framework/language syntax | `references/php84-laravel12.md` |
| New dependency policy | `references/composer.md` |
| New review gate | `checklists/architecture-review.md` |
| Version targets | `SKILL.md` frontmatter description + the footer line |

Keep `SKILL.md` under ~250 lines. When it grows, move detail into `references/` and leave
a one-line pointer. The whole file is read on every activation; the references are not.

## Version compatibility

Current targets: **Laravel 12, PHP 8.4**.

When the library must support multiple framework versions, do not fork the skill. Add a
short "If the project is on Laravel 10/11" note next to the affected rule. Forked skills
drift within one release cycle.

## Testing changes to this skill

After editing:

1. Restart Claude Code and confirm the skill still loads (`/laravel-enterprise-architecture`).
2. Frontmatter check — `name` kebab-case and matches the folder; `description` still
   contains the trigger phrases you expect ("where should this live", "refactor this
   controller", "service vs action").
3. Run a real prompt against it: *"Add an endpoint that lets an admin suspend a user
   account."* Verify the output follows the layering and produces a DTO, action, policy,
   and form request without being asked.
4. Verify every path referenced in `SKILL.md` exists:

```powershell
Select-String -Path .\SKILL.md -Pattern '`([a-z]+/[a-z0-9\-\.]+)`' -AllMatches |
    ForEach-Object { $_.Matches.Groups[1].Value } |
    Sort-Object -Unique |
    Where-Object { -not (Test-Path $_) }
```

Empty output means every referenced file exists.

## Boundary discipline

This skill must not grow into a general Laravel manual. If you are about to add guidance
about caching, indexes, ARIA, or CI, it belongs in another skill — add a one-line handoff
instead. Overlapping skills produce contradictory advice, which is worse than a gap.

Check the ownership table in `../README.md` when in doubt.

## Deprecating guidance

When a rule stops being right, delete it. Do not leave it with a "deprecated" note —
`SKILL.md` is read in full every time, and stale rules cost attention on every activation.
Record the removal in the changelog below so the reasoning is not lost.

## Changelog

| Date | Change |
|---|---|
| 2026-07-31 | Initial version. Targets Laravel 12 / PHP 8.4. |
