# Rector

Rector performs mechanical refactors across a whole codebase. It is the fastest path
through a PHP or Laravel major upgrade, and the safest way to apply a code-quality rule
everywhere at once.

## Setup

```bash
composer require --dev rector/rector driftingly/rector-laravel
```

```php
<?php

declare(strict_types=1);

use Rector\Config\RectorConfig;
use Rector\Set\ValueObject\LevelSetList;
use RectorLaravel\Set\LaravelSetList;

return RectorConfig::configure()
    ->withPaths([
        __DIR__.'/app',
        __DIR__.'/database',
        __DIR__.'/routes',
        __DIR__.'/tests',
    ])
    ->withPhpSets(php84: true)
    ->withSets([
        LaravelSetList::LARAVEL_120,
        LaravelSetList::LARAVEL_CODE_QUALITY,
    ])
    ->withPreparedSets(
        deadCode: true,
        codeQuality: true,
        typeDeclarations: true,
        privatization: true,
        earlyReturn: true,
    )
    ->withSkip([
        __DIR__.'/app/Legacy',
        __DIR__.'/database/migrations/2019_*',

        // Skip a single rule everywhere
        \Rector\CodeQuality\Rector\If_\SimplifyIfReturnBoolRector::class,

        // Or a rule in specific paths
        \Rector\DeadCode\Rector\ClassMethod\RemoveUnusedPrivateMethodRector::class => [
            __DIR__.'/app/Support/Macros.php',
        ],
    ])
    ->withCache(__DIR__.'/.rector.cache')
    ->withParallel();
```

## The workflow — non-negotiable

```bash
# 1. Clean tree, green tests
git status                    # must be clean
php artisan test

# 2. ALWAYS dry-run first
vendor/bin/rector process --dry-run

# 3. Read the diff. Actually read it.

# 4. Apply
vendor/bin/rector process

# 5. Verify
php artisan test
vendor/bin/pint
vendor/bin/phpstan analyse

# 6. Commit ONE rule set
git commit -m "refactor: apply Rector dead-code set"
```

Rector rewrites your code. The dry run is not optional, and neither is reading the diff — it
is very good, not infallible, and a subtly wrong transformation in business logic is
expensive.

**One rule set per commit.** A PR mixing dead-code removal, type declarations, and a PHP
version upgrade is unreviewable, and when something breaks you cannot bisect which rule did
it.

## Rule sets

### `withPhpSets()` — language version upgrades

```php
->withPhpSets(php84: true)
```

Applies every syntax modernisation up to that version:

| From | Rector adds |
|---|---|
| 7.4 | Constructor promotion, match, named args, nullsafe (8.0) |
| 8.0 | Readonly properties, enums, `never` (8.1) |
| 8.1 | Readonly classes, `json_validate` (8.2/8.3) |
| 8.3 | Property hooks, asymmetric visibility (8.4) |

Run it **after** the runtime is actually on the new version, not before — Rector will
happily emit syntax the current PHP cannot parse.

### `LaravelSetList` — framework upgrades

```php
->withSets([LaravelSetList::LARAVEL_120])
```

Handles renamed methods, moved classes, changed signatures. It does **not** handle the
skeleton restructure (Laravel 11's move from `Kernel.php` to `bootstrap/app.php`) — that
needs the official upgrade guide plus manual work.

Rector is a large part of a major upgrade, not all of it. Budget accordingly.

### `LARAVEL_CODE_QUALITY` — idiom improvements

```php
// Before
if ($request->has('name') && $request->get('name')) { }
$user = User::where('id', $id)->first();
if (is_null($value)) { }

// After
if ($request->filled('name')) { }
$user = User::find($id);
if ($value === null) { }
```

Genuinely useful, and it teaches the framework's idioms to a team that came from elsewhere.

### `withPreparedSets()`

| Set | Does |
|---|---|
| `deadCode` | Removes unused private methods, properties, parameters, unreachable code |
| `codeQuality` | Simplifies conditions, merges nested ifs, removes redundancy |
| `typeDeclarations` | Infers and adds param/return/property types |
| `privatization` | Narrows visibility where nothing external uses it |
| `earlyReturn` | Converts nested ifs to guard clauses |
| `naming` | Renames variables to match their type — **noisy; adopt with care** |
| `instanceOf` | Simplifies `instanceof` chains |
| `strictBooleans` | Requires actual booleans in conditions |

`typeDeclarations` is the one that pays off most: it does most of the work of moving from
PHPStan level 5 to level 6.

`naming` produces enormous diffs and renames things you may have named deliberately. Try it
on one directory before committing to it.

## Safety

### What Rector can get wrong

```php
// Rector may remove a private method it cannot see being called
private function handleWebhook(): void { }     // called via a string in a route
```

```php
// Dynamic calls are invisible to static analysis
$method = 'process'.$type;
$this->$method();
```

Guard these:

```php
->withSkip([
    \Rector\DeadCode\Rector\ClassMethod\RemoveUnusedPrivateMethodRector::class => [
        __DIR__.'/app/Http/Controllers/WebhookController.php',
    ],
])
```

### Migrations

```php
->withSkip([__DIR__.'/database/migrations'])
```

Old migrations have already run. "Improving" them changes nothing in production and risks
breaking `migrate:fresh` for a new developer. Leave them alone.

### Tests

Include `tests/` in the paths — test code benefits from the same modernisation, and
type declarations there catch real mistakes. But run the suite *before* and *after*, and be
suspicious if Rector changes an assertion.

## Custom rules

For a project-specific convention:

```php
final class ActionsMustBeFinalRector extends AbstractRector
{
    public function getNodeTypes(): array
    {
        return [Class_::class];
    }

    public function refactor(Node $node): ?Node
    {
        if (! str_contains($this->file->getFilePath(), '/app/Actions/')) {
            return null;
        }

        if ($node->isFinal() || $node->isAbstract()) {
            return null;
        }

        $node->flags |= Class_::MODIFIER_FINAL;

        return $node;
    }

    public function getRuleDefinition(): RuleDefinition
    {
        return new RuleDefinition('Action classes must be final', [
            new CodeSample('class CreateOrder {}', 'final class CreateOrder {}'),
        ]);
    }
}
```

Worth it when a convention appears in code review repeatedly. Not worth it for a rule you
apply twice a year.

## CI

```yaml
- name: Rector (dry run)
  run: vendor/bin/rector process --dry-run
```

Dry-run only in CI. Never let CI rewrite code automatically — an unreviewed Rector commit
on `main` is exactly the situation the dry-run discipline exists to prevent.

Treating it as a **warning** rather than a hard failure is reasonable: it surfaces drift
without blocking a PR on a stylistic suggestion.

## Performance

```bash
vendor/bin/rector process --dry-run --clear-cache
```

```php
->withCache(__DIR__.'/.rector.cache')
->withParallel()
```

Add `.rector.cache` to `.gitignore`. First run on a large codebase can take minutes;
subsequent runs are fast.

## Upgrade playbook

Moving a project from PHP 8.1 / Laravel 10 to PHP 8.4 / Laravel 12:

```bash
# 1. Green baseline
php artisan test && vendor/bin/phpstan analyse

# 2. Framework first, one major at a time
composer require laravel/framework:^11.0 -W
vendor/bin/rector process --dry-run     # with LARAVEL_110
# review, apply, test, commit

# 3. Then Laravel 12
composer require laravel/framework:^12.0 -W
# LARAVEL_120 set, same cycle

# 4. THEN the PHP version — after the runtime is actually upgraded
->withPhpSets(php84: true)
# review, apply, test, commit

# 5. Quality sets last, one per commit
->withPreparedSets(deadCode: true)
->withPreparedSets(typeDeclarations: true)

# 6. Raise the PHPStan level now that types exist
```

Order matters. Upgrading PHP syntax before the runtime supports it produces a codebase that
will not parse. Applying quality sets during a framework upgrade makes the diff impossible
to review.

## What Rector will not do

- Fix business logic
- Restructure architecture (that is a human decision)
- Write tests
- Understand your domain

It is a very good mechanical assistant. The judgement stays with you — which is why the
dry-run step exists.
