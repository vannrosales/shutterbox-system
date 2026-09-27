# Code quality review — pre-merge gate

## Automated gates (must pass)

- [ ] `vendor/bin/pint --test` — clean
- [ ] `vendor/bin/phpstan analyse` — clean at the project's target level
- [ ] `php artisan test` — green
- [ ] `vendor/bin/rector process --dry-run` — reviewed (advisory, not blocking)
- [ ] PHPStan baseline did **not** grow

```bash
composer qa
grep -c "message:" phpstan-baseline.neon      # compare with main
```

## Types

- [ ] `declare(strict_types=1);` in every new PHP file
- [ ] Every parameter, return, and property typed
- [ ] Iterables annotated (`@return Collection<int, Order>`, `@param list<int> $ids`)
- [ ] Relationship generics correct (`@return HasMany<Line, $this>`)
- [ ] Array shapes documented, or replaced with a DTO
- [ ] No new `mixed` without a reason
- [ ] Model `casts()` cover new columns
- [ ] No `@phpstan-ignore` without an explanatory comment

## Style

- [ ] Formatting applied by Pint, not by hand
- [ ] No formatting-only changes mixed into a feature PR
- [ ] Imports used and ordered
- [ ] No commented-out code (git remembers it)
- [ ] No `dd()`, `dump()`, `ray()`, `var_dump()`, `print_r()`

## Complexity

- [ ] No method over ~30 lines without a reason
- [ ] Cyclomatic complexity ≤ 10 (a `match` on an enum is a fair exception)
- [ ] Nesting depth ≤ 3 — guard clauses instead
- [ ] ≤ 5 parameters; more means a DTO
- [ ] No class over ~300 lines
- [ ] Public method count suggests one responsibility, not several

## Duplication

- [ ] New duplication is deliberate, not accidental
- [ ] Code copied twice that **must change together** has been extracted
- [ ] Code that merely *looks* alike but changes for different reasons is left alone
- [ ] No abstraction introduced for a single caller

## Dead code

- [ ] Unused methods, properties, parameters removed
- [ ] Before deleting: grepped the whole repository including Blade, config, routes, tests

```bash
grep -rn "methodName" app/ resources/ routes/ config/ tests/
```

- [ ] Unused routes removed (an unused route is attack surface)
- [ ] Feature flags for shipped features cleaned up

## Naming

- [ ] Names say what, not how
- [ ] No abbreviations that need explaining
- [ ] One name per concept across the codebase
- [ ] Booleans read as a question (`isRefundable`, `hasVerifiedEmail`)
- [ ] Actions are `VerbNoun` (`RefundOrder`, not `OrderRefunder`)
- [ ] No name that requires a comment to be understood

## Comments and docs

- [ ] Comments explain **why**, never **what**
- [ ] No docblock that restates the signature
- [ ] Non-obvious decisions have a one-line reason
- [ ] `TODO`s carry an owner and a date
- [ ] Class docblock states the single responsibility, where useful
- [ ] `README` still accurate if setup changed
- [ ] `CHANGELOG` updated for user-visible changes
- [ ] `CLAUDE.md` updated if a convention changed
- [ ] An ADR written if the decision is expensive to reverse

## Upgrades and Rector

- [ ] Rector run as its own commit, one rule set at a time
- [ ] Diff read, not just applied
- [ ] Tests green after the run
- [ ] Migrations excluded from Rector
- [ ] `withPhpSets` only run after the runtime was actually upgraded

## Dependencies

- [ ] New dependency justified (maintained, supported version, earns its weight)
- [ ] `composer.lock` committed
- [ ] Dev tooling in `require-dev`
- [ ] `composer audit` clean

## Handoffs

The tools in this skill do **not** catch these. Confirm the relevant review happened:

- [ ] Injection, authorization, tenancy → `laravel-security`
- [ ] N+1, query counts, caching → `laravel-performance`
- [ ] Index and schema safety → `laravel-database-scale`
- [ ] Test coverage of negative paths → `laravel-testing-qa`
- [ ] Layer placement and pattern choice → `laravel-enterprise-architecture`

## The judgement questions

Metrics do not capture these. Ask them in review:

- [ ] Does this class have **one** reason to change?
- [ ] How much setup does one test need? (Large setup = the unit is too large.)
- [ ] Can this be tested without booting the framework?
- [ ] How many things break if this changes?
- [ ] Would a new developer guess correctly what this file contains?
- [ ] Are the failure paths as clear as the success path?
- [ ] Is this the simplest thing that works, or the cleverest?

The setup-size question is the most reliable signal in the list.
