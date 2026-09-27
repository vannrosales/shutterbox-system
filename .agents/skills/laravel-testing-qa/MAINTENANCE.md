# Maintaining `laravel-testing-qa`

## Review triggers

| Trigger | Action |
|---|---|
| Pest or PHPUnit major release | Update syntax in `references/writing-tests.md` and the templates |
| Laravel release adding new fakes or assertions | Add them to `references/mocking.md` |
| A production bug that tests should have caught | Add the pattern to `checklists/test-review.md` |
| The suite gets slow enough that people skip it | Revisit the speed guidance; find what regressed |
| Flaky tests recur | Add the cause to the flake table in `references/setup.md` |
| Dusk / ChromeDriver behaviour changes | Update the browser-test guidance |

Scheduled: every 6 months.

## The parts most likely to go stale

**1. Pest syntax.** Pest 3 introduced changes to `pest()` configuration, mutation testing,
and architecture tests. Verify the `Pest.php` template against the installed version.

**2. `phpunit.xml` schema.** The `<source>` / `<coverage>` element split changed in PHPUnit
10. The template uses the 10+ form; a project on 9 needs the old one.

**3. The SQLite-vs-MySQL difference table** in `references/setup.md`. SQLite gains features
over time. Verify before relying on any specific limitation being current.

## What to update where

| Change | File |
|---|---|
| Suite config, database strategy, CI, parallelism | `references/setup.md` |
| Test structure, assertions, naming | `references/writing-tests.md` |
| Factories, seeders, faker | `references/test-data.md` + `templates/Factory.php.stub` |
| Fakes, mocks, time, isolation | `references/mocking.md` |
| Security/performance/a11y/browser tests | `references/specialist-tests.md` |
| Global helpers | `templates/Pest.php` |
| New blocking rule | `checklists/test-review.md` |

The helper functions (`assertQueryCountUnder`, `assertNoNPlusOne`, `assertMemoryUnder`)
appear in `templates/Pest.php`, `references/specialist-tests.md`, and
`laravel-performance/templates/query-count-helper.php`. Keep the three in sync, or a
project copying from one gets a different signature than the docs describe.

## Testing changes to this skill

1. Skill loads: `/laravel-testing-qa`
2. Prompt test — *"Add a test for the invoice refund endpoint"* — verify the output
   includes a cross-tenant 404 test and a boundary test, not just the happy path
3. Second prompt test — *"My test is flaky"* — verify `Http::preventStrayRequests`, time
   freezing, and random ordering are the first things suggested
4. Third prompt test — *"Add caching to this endpoint"* — verify it prompts for a
   query-count assertion
5. Templates parse:

```bash
php -l .claude/skills/laravel-testing-qa/templates/Pest.php
php -l .claude/skills/laravel-testing-qa/templates/TestCase.php.stub

# Factory.php.stub contains {{ Model }} / {{ Enum }} placeholders and is not
# valid PHP until substituted:
sed -E 's/\{\{ *[A-Za-z]+ *\}\}/Placeholder/g' templates/Factory.php.stub > /tmp/stub.php
php -l /tmp/stub.php
```

6. The helpers actually run — copy `templates/Pest.php` into a real project and execute a
   test using each function.

## Boundary discipline

Owns: test structure, factories, fakes and doubles, assertions, coverage policy, test-suite
configuration, flake elimination.

Hand off:
- **What the code should do** — skills 1–8 define the rules; this skill only says how to
  verify them
- Static analysis, Pint, PHPStan → `laravel-code-quality`
- CI infrastructure, runners, caching → `laravel-devops-deployment`
- Why an N+1 matters → `laravel-performance`
- Why a cross-tenant 403 is a vulnerability → `laravel-security`
- What WCAG requires → `laravel-ui-accessibility`

**Shared areas that must stay consistent:**

| Topic | This skill says | Other skill says |
|---|---|---|
| Query-count assertions | The helper and how to use it | Why N+1s happen and how to fix them (`laravel-performance`) |
| Cross-tenant 404 test | The test to write | Why 403 leaks existence (`laravel-security`) |
| axe zero-violation test | How to run it in Dusk | What the criteria mean and the manual passes (`laravel-ui-accessibility`) |
| Upload security test | The `createWithContent` trick | Why `mimetypes` beats `mimes` (`laravel-media-management`) |
| OpenAPI contract test | The assertion helper | Spec generation and publishing (`laravel-api-standards`) |

Each row is a verification technique here and a rule elsewhere. If the rule changes, the
test in the checklist changes with it.

## The principle this skill defends

**A suite that only proves the happy path works proves almost nothing.**

Every checklist, example, and reference here is weighted toward negative paths:
authorization denials, validation boundaries, business-rule edges, failure handling. That
weighting is deliberate. If a future edit rebalances toward happy-path coverage or toward
a coverage percentage as the goal, it is the wrong edit.

The second principle: **a flaky test is worse than no test**, because it trains the team to
re-run rather than investigate. The isolation checklist in `references/mocking.md` exists to
prevent flakes at the source rather than diagnose them later.

## Changelog

| Date | Change |
|---|---|
| 2026-07-31 | Initial version. Pest 3 / PHPUnit 11, parallel by default, N+1 and a11y regression helpers. |
