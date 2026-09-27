# Maintaining `laravel-ai-coding-standards`

This is the meta-skill. It owns no technical rules — only the workflow, the routing, and
the output contract. Keep it that way.

## Review triggers

| Trigger | Action |
|---|---|
| A skill is added, removed, or renamed | **Update the routing table** in `SKILL.md` and `references/routing.md` |
| Two skills give contradictory advice | Add the split to the shared-areas table in `references/routing.md`, and fix the source skills |
| A generated change repeatedly misses something | Add it to `checklists/pre-completion.md` |
| Users repeatedly correct the same behaviour | Add it to `references/working-with-humans.md` |
| The analyse-first step is being skipped | Make it shorter, not longer — a step nobody runs is worse than a shorter one everybody does |

Scheduled: whenever the library's skill set changes, plus every 6 months.

## The dependency this skill has on all others

The routing table names all eleven other skills by their exact `name:` frontmatter value.
If any skill is renamed, this file breaks silently — the routing still *reads* correctly
but points at nothing.

Verify after any library change:

```powershell
# Every skill named in the routing table must exist
Select-String -Path .\SKILL.md,.\references\routing.md -Pattern '`(laravel-[a-z\-]+)`' -AllMatches |
    ForEach-Object { $_.Matches.Groups[1].Value } |
    Sort-Object -Unique |
    Where-Object { -not (Test-Path "..\$_\SKILL.md") }
```

Empty output means every referenced skill exists.

## What to update where

| Change | File |
|---|---|
| A new skill in the library | Routing table in `SKILL.md` **and** `references/routing.md` |
| A cross-skill boundary dispute | Shared-areas table in `references/routing.md` |
| The pre-generation procedure | `references/analyse-first.md` + `checklists/pre-generation.md` |
| A contract item | `references/output-contract.md` + `SKILL.md` |
| How to handle assumptions, disagreement, scope | `references/working-with-humans.md` |
| A new completion requirement | `checklists/pre-completion.md` |
| The project instructions template | `templates/CLAUDE.md.stub` |

The routing table appears in two files by design — `SKILL.md` has the short version that is
read every activation, `references/routing.md` has the worked examples. Keep them
consistent.

## Testing changes to this skill

1. Skill loads: `/laravel-ai-coding-standards`
2. **The analysis test** — in a project with an unusual convention (services, not actions),
   ask for a new feature. Verify the output uses services, not actions.
3. **The routing test** — *"Let users upload a profile photo"* — verify architecture,
   security, media, testing, and accessibility all get pulled in, not just architecture.
4. **The proportionality test** — *"Fix the typo in the welcome email"* — verify it does
   **not** load eleven skills and produce a nine-file change.
5. **The assumption test** — an ambiguous request. Verify the output states an assumption
   and proceeds, rather than blocking with a question.
6. **The honesty test** — a task where something cannot be verified. Verify the report says
   so rather than implying it was checked.
7. **The scope test** — a feature request in a file that also contains an unrelated bug.
   Verify the bug is reported, not silently fixed.

Tests 4, 5, and 7 are the ones that catch regressions in this skill. Tests 1–3 rarely fail.

## Boundary discipline

**This skill owns no technical rules.** Not one. If an edit adds a rule about indexes,
ARIA, CSP, or eager loading, it belongs in the skill that owns that topic, and this file
should only route to it.

The temptation is real — it feels helpful to put "always eager load relations" in the
routing skill. Resist it. Two copies of a rule drift, and then the library contradicts
itself, which is worse than a gap.

The one exception: `checklists/pre-completion.md` restates a short **security floor** and
**performance floor**. That duplication is deliberate — those are the checks that must
happen even when the relevant skill was not loaded. Keep both lists short and identical to
their source; if they grow, the boundary has eroded.

## The positions this skill takes deliberately

**1. Project conventions beat library defaults.** `references/analyse-first.md` says a
uniform mediocre pattern is worth more than a better pattern applied to 5% of the codebase.
That is the single most important sentence in this skill. If an edit softens it, the
library starts producing code that is technically correct and unusable.

**2. Assume and proceed, do not block.** `references/working-with-humans.md` reserves
blocking questions for cases where guessing wrong wastes the work entirely. A skill that
encourages asking about every ambiguity produces a frustrating experience and no more
correctness.

**3. Report honestly, including what was not done.**
`checklists/pre-completion.md` ends with the "never" list. Overclaiming is the failure mode
that erodes trust fastest, because the user finds out later.

**4. Proportionality.** `references/routing.md` explicitly shows a one-skill routing for a
typo fix. Without that, the library encourages ceremony on trivial changes, and people stop
using it.

## Priority order — do not change without thought

```
1. The user's explicit instruction in this conversation
2. The project's CLAUDE.md / CONTRIBUTING.md
3. The project's existing patterns (observed in code)
4. This library's skills
5. General Laravel convention
```

This ordering appears in `references/routing.md`. It is what makes the library usable in
codebases that predate it.

## Keeping SKILL.md short

It is read on every activation, and it is the entry point for every other skill. Target:
under 150 lines. It currently holds: the order of operations, the analyse step, the routing
table, the assumption step, the contract, and the reporting rule. That is the complete set
— everything else is a reference.

If it grows past ~180 lines, something has moved in that should be one hop away.

## Changelog

| Date | Change |
|---|---|
| 2026-07-31 | Initial version. Routes to the eleven technical skills; defines the analyse-first workflow and output contract. |
