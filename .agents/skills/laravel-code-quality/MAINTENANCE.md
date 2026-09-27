# Maintaining `laravel-code-quality`

## Review triggers

| Trigger | Action |
|---|---|
| PHP minor/major release | Update `withPhpSets` in `rector.php`, check new Pint rules |
| Laravel major release | Add the new `LaravelSetList` set, verify Larastan compatibility |
| Larastan major release | Level semantics and model-property inference can shift — re-verify the level table |
| PHPStan major release | Levels 9/10 changed meaning in the past; re-check the table |
| Pint adds a preset or rule | Evaluate against `templates/pint.json` |
| A quality gate is routinely bypassed | The gate is wrong — fix or demote it |

Scheduled: every 6 months, plus on any PHP or Laravel major.

## The parts most likely to go stale

**1. Tool version specifics.** `LaravelSetList::LARAVEL_120`, `php84: true`, Larastan's
`extension.neon` path — all change with major versions. Search across the skill when
upgrading:

```powershell
Select-String -Path .\**\* -Pattern 'LARAVEL_1|php8[0-9]|8\.4' | Select-Object Path,Line
```

**2. The PHPStan level table.** Level meanings have shifted between major PHPStan versions.
Verify against the current documentation rather than trusting the table.

**3. Pint rule names.** These come from PHP-CS-Fixer and are occasionally renamed or
deprecated. `vendor/bin/pint -v` shows which rules actually fired — if a configured rule
never appears, it may no longer exist.

## What to update where

| Change | File |
|---|---|
| Formatting rules, adoption process | `references/pint.md` + `templates/pint.json` |
| Levels, baselines, error fixes | `references/phpstan.md` + `templates/phpstan.neon` |
| Rule sets, upgrade playbook | `references/rector.md` + `templates/rector.php` |
| Metrics, duplication, dead code | `references/complexity.md` |
| Comments, README, CHANGELOG, ADRs | `references/documentation.md` |
| CI gates | `templates/quality-workflow.yml` |
| New blocking rule | `checklists/quality-review.md` |

The `composer scripts` block appears in `SKILL.md`, `templates/quality-workflow.yml`, and
`laravel-enterprise-architecture/references/composer.md`. Keep the three consistent.

## Testing changes to this skill

1. Skill loads: `/laravel-code-quality`
2. Prompt test — *"PHPStan is failing with 200 errors"* — verify the answer is
   generate-a-baseline-and-reduce-it, not lower-the-level
3. Second prompt test — *"Upgrade this project from Laravel 10 to 12"* — verify the
   ordering (framework first, one major at a time, PHP last, quality sets last)
4. Third prompt test — *"Should I extract this duplicated code?"* — verify the answer is
   "extract when the copies must change together", not "always"
5. Configs are valid:

```bash
php -l .claude/skills/laravel-code-quality/templates/rector.php
python -c "import json; json.load(open('.claude/skills/laravel-code-quality/templates/pint.json'))"
bash -n .claude/skills/laravel-code-quality/templates/pre-commit
```

6. Copy the configs into a real project and run each tool once. A config that references a
   rule that no longer exists fails at runtime, not at parse time.

## Boundary discipline

Owns: formatting, static analysis configuration and adoption, mechanical refactoring,
complexity and duplication metrics, documentation standards, and the CI gates for all of
them.

Hand off:
- **What the code should do** — skills 1–10 define the rules
- Test content and coverage policy → `laravel-testing-qa`
- CI runners, caching, deployment → `laravel-devops-deployment`
- Injection and taint analysis findings → `laravel-security`
- N+1 and query efficiency → `laravel-performance`
- Layer placement and pattern choice → `laravel-enterprise-architecture`

**Shared areas that must stay consistent:**

| Topic | This skill owns | Other skill owns |
|---|---|---|
| `declare(strict_types=1)` | The Pint rule that adds it | Why it matters (`laravel-enterprise-architecture`) |
| `final` on classes | Deliberately **not** automated (`final_class: false`) | Which classes should be final (`laravel-enterprise-architecture`) |
| Psalm taint analysis | The command and when to run it | What the findings mean (`laravel-security`) |
| Rector upgrade sets | The mechanics and ordering | Framework version targets (`laravel-enterprise-architecture`) |
| Pre-commit hook | Its contents and the 10-second budget | The tests it runs (`laravel-testing-qa`) |
| Composer scripts | `lint`, `stan`, `qa` | Dependency policy (`laravel-enterprise-architecture`) |

## The three positions this skill takes deliberately

**1. Not every gate should block.** Pint, PHPStan, and tests have objective right answers
and block the build. Complexity, duplication, and Rector are advisory. A gate that fails on
a legitimate `match` statement teaches the team to bypass gates, which costs more than the
gate saves.

**2. Duplication is a signal, not a verdict.** `references/complexity.md` explicitly says to
leave code that merely looks alike but changes for different reasons. Premature abstraction
is harder to remove than duplication is to fix. If an edit turns this into "always
extract", it is wrong.

**3. The tools do not replace review.** `examples/quality-refactor.md` ends by showing that
the SQL injection, the missing tenant scope, and the uncapped page size were all invisible
to every tool. That example exists to prevent "CI is green" being mistaken for "this is
safe". Keep it.

## Effort allocation

`references/complexity.md` includes a table saying domain logic deserves the highest
standard and one-off scripts deserve almost none. That is deliberate and worth defending —
a uniform standard across all code wastes attention on code that does not need it, and
rations it away from the code that does.

## Changelog

| Date | Change |
|---|---|
| 2026-07-31 | Initial version. Pint (Laravel preset), PHPStan 2 + Larastan level 6, Rector with Laravel 12 sets. |
