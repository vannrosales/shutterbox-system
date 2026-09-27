---
name: laravel-code-quality
description: Use when setting up or running code quality tooling, fixing style violations, resolving static analysis errors, upgrading PHP or Laravel with Rector, finding dead or duplicated code, or writing documentation and comments. Covers PSR-12, Laravel Pint, PHPStan/Larastan levels, Rector rule sets, complexity and maintainability review, and CI enforcement. Triggers on "Pint", "PHPStan", "Larastan", "Rector", "static analysis", "code style", "PSR-12", "refactor", "dead code", "lint", "type error", or any pre-merge quality question.
---

# Code Quality

Automated tooling settles every argument that a human should not be having. Style, type
safety, and mechanical refactors are machine work; review time belongs to design and
correctness.

## The four tools

| Tool | Fixes | Run |
|---|---|---|
| **Pint** | Formatting (PSR-12 + Laravel preset) | Pre-commit, CI |
| **PHPStan + Larastan** | Type errors, impossible conditions, dead code | Pre-commit, CI |
| **Rector** | Mechanical refactors, version upgrades | On demand, CI dry-run |
| **PHPUnit/Pest** | Behaviour (`laravel-testing-qa`) | Pre-commit, CI |

```json
{
    "scripts": {
        "lint":   "pint --test",
        "fix":    "pint",
        "stan":   "phpstan analyse --memory-limit=1G",
        "rector": "rector process --dry-run",
        "qa":     ["@lint", "@stan", "@test"]
    }
}
```

One vocabulary for developers and CI: `composer qa`.

## Pint — never discuss formatting again

```json
{
    "preset": "laravel",
    "rules": {
        "declare_strict_types": true,
        "final_class": false,
        "global_namespace_import": { "import_classes": true, "import_functions": false },
        "ordered_imports": { "sort_algorithm": "alpha" },
        "no_unused_imports": true,
        "trailing_comma_in_multiline": { "elements": ["arrays", "arguments", "parameters"] }
    }
}
```

```bash
vendor/bin/pint            # fix
vendor/bin/pint --test     # check only — this is the CI gate
vendor/bin/pint --dirty    # only changed files
```

Run `pint` once across the whole codebase in **its own commit**, before enabling the CI
gate. Mixing a formatting sweep into a feature PR makes the diff unreviewable.

## PHPStan — the level policy

```neon
# phpstan.neon
includes:
    - vendor/larastan/larastan/extension.neon

parameters:
    level: 6
    paths: [app, config, database, routes, tests]
    checkModelProperties: true
    checkOctaneCompatibility: false
```

| Level | Catches | Realistic for |
|---|---|---|
| 0–2 | Unknown classes and methods, wrong argument counts | Any legacy codebase, day one |
| **5** | Argument type mismatches | Existing project, achievable |
| **6** | Missing type hints | **Target for new code** |
| 8 | Nullable handling | Mature, well-typed codebase |
| 9–10 | `mixed` strictness | Rarely worth the cost in a framework app |

**Adopt levels incrementally.** Generate a baseline, hold the line, and reduce it
deliberately:

```bash
vendor/bin/phpstan analyse --generate-baseline
```

A baseline is a debt register, not a permanent exemption. Track its size; a baseline that
only grows means the gate is not working.

Never silence a real error with `@phpstan-ignore` without a comment explaining why.

## Rector — mechanical refactors and upgrades

```php
// rector.php
return RectorConfig::configure()
    ->withPaths([__DIR__.'/app', __DIR__.'/database', __DIR__.'/routes', __DIR__.'/tests'])
    ->withPhpSets(php84: true)
    ->withSets([LaravelSetList::LARAVEL_120])
    ->withPreparedSets(deadCode: true, codeQuality: true, typeDeclarations: true)
    ->withSkip([__DIR__.'/app/Legacy']);
```

```bash
vendor/bin/rector process --dry-run     # always first
vendor/bin/rector process
```

Rules:
- **Dry-run first, always.** Rector rewrites code; review the diff before applying.
- **One rule set per commit.** A PR mixing dead-code removal with a PHP upgrade is
  unreviewable.
- **Tests must pass after every run.** Rector is safe, not infallible.
- It is the fastest path through a PHP or Laravel major upgrade — see
  `references/rector.md`.

## Complexity and duplication

```bash
composer require --dev phpmd/phpmd sebastian/phpcpd
vendor/bin/phpmd app text cleancode,codesize,unusedcode
vendor/bin/phpcpd app --min-lines=8
```

Thresholds worth enforcing:

| Metric | Limit | Why |
|---|---|---|
| Cyclomatic complexity per method | 10 | Above this, nobody holds it in their head |
| Method length | 30 lines | A method doing two things |
| Class length | 300 lines | Probably several classes |
| Parameters | 5 | Pass a DTO |
| Nesting depth | 3 | Early returns |

These are prompts to look, not automatic failures. A 40-line `match` on an enum is fine.

Duplication is a signal, not a verdict. Three copies of the same three lines are usually
fine; two copies of a 30-line business rule are a bug waiting to diverge.

## Documentation

Comments explain **why**, never **what**.

```php
// ✗ Restates the code
// Increment the stock by the quantity
$product->increment('stock', $item->quantity);

// ✓ Explains a decision the reader cannot infer
// increment() compiles to SET stock = stock + ?, so concurrent refunds cannot
// lose an update — unlike a read-modify-write.
$product->increment('stock', $item->quantity);
```

- Docblocks only where they add information the signature cannot: generics
  (`@return Collection<int, Order>`), thrown exceptions, array shapes.
- No `@param string $name` next to `string $name`. It is noise that goes stale.
- A class-level docblock stating the class's single responsibility earns its place.
- `CHANGELOG.md`, `README.md`, and `CLAUDE.md` are documentation too, and go stale fastest.

## Pre-commit

```bash
#!/usr/bin/env bash
set -e

vendor/bin/pint --dirty --test || { echo "Run: composer fix"; exit 1; }
vendor/bin/phpstan analyse --no-progress --memory-limit=1G
php artisan test --dirty --parallel
```

Keep it under ~10 seconds or people will use `--no-verify`. Full runs belong in CI.

## Scope boundaries

Owns: formatting, static analysis, mechanical refactoring, complexity and duplication
detection, documentation standards, and the CI gates for all of them.

Does not own: what the code should do (skills 1–10); test content (`laravel-testing-qa`);
CI infrastructure (`laravel-devops-deployment`).

## Bundled resources

- `references/pint.md` — preset, rules, adoption in an existing codebase
- `references/phpstan.md` — levels, baselines, Larastan, common errors and fixes
- `references/rector.md` — rule sets, upgrade workflow, safety
- `references/complexity.md` — metrics, duplication, dead code, maintainability review
- `references/documentation.md` — comments, docblocks, README, CHANGELOG, ADRs
- `templates/` — `pint.json`, `phpstan.neon`, `rector.php`, pre-commit hook, CI workflow
- `examples/quality-refactor.md` — a real file taken from failing to clean
- `checklists/quality-review.md` — pre-merge gate

---
Last reviewed: 2026-07-31 · Targets PHP 8.4 / Laravel 12 · See MAINTENANCE.md
