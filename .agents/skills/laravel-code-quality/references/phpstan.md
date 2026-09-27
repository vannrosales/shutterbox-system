# PHPStan and Larastan

Static analysis catches a class of bug that tests miss: the path nobody exercised.

## Setup

```bash
composer require --dev larastan/larastan
```

```neon
# phpstan.neon
includes:
    - vendor/larastan/larastan/extension.neon

parameters:
    level: 6

    paths:
        - app
        - config
        - database
        - routes
        - tests

    excludePaths:
        - app/Legacy/*
        - database/migrations/2019_*

    # Larastan understands Eloquent magic properties from your migrations
    checkModelProperties: true
    checkOctaneCompatibility: false

    ignoreErrors:
        # Always explain WHY. An unexplained ignore becomes permanent.
        -
            message: '#Call to an undefined method .*::macroMethod\(\)#'
            path: app/Support/Macros.php
            # Registered at runtime in AppServiceProvider; PHPStan cannot see it.
```

Larastan is what makes PHPStan usable on Laravel — without it, every `Model::where()`,
facade call, and container resolution is an error.

## Level policy

| Level | Adds | Verdict |
|---|---|---|
| 0 | Unknown classes, unknown methods, wrong argument counts | Start here on legacy code |
| 1 | Undefined variables, unknown magic methods | |
| 2 | Unknown methods on all expressions | |
| 3 | Return types, property assignment types | |
| 4 | Dead code, always-true conditions | Genuinely finds bugs |
| 5 | Argument types | **Minimum for an existing project** |
| **6** | Missing type hints | **Target for new code** |
| 7 | Partially wrong union types | |
| 8 | Calling methods on nullable | Mature, well-typed codebase |
| 9 | Strict `mixed` | |
| 10 | Everything | Rarely worth it in a framework app |

Level 6 is the sweet spot: it forces types everywhere, which pays off in refactoring safety
and in generated OpenAPI docs, without the nullable-handling churn of level 8.

### Adopting incrementally

```bash
# 1. Find the level that currently passes
vendor/bin/phpstan analyse --level=0    # then 1, 2, ...

# 2. Set the target one above it, and baseline the existing errors
vendor/bin/phpstan analyse --generate-baseline
```

```neon
includes:
    - phpstan-baseline.neon
```

**A baseline is a debt register, not an exemption.** Track its size in CI:

```bash
grep -c "message:" phpstan-baseline.neon
```

If it only ever grows, the gate is not working. Reduce it deliberately — a few entries per
sprint, or as a rule when touching a file.

New code should be written at the target level from the start. The baseline covers the
past, not the present.

## Errors you will meet, and the right fix

### Missing iterable value type

```
Method App\Actions\ListOrders::handle() return type has no value type specified in iterable type array.
```

```php
// ✗
public function handle(): array

// ✓ — a shaped array
/** @return array{total: int, currency: string} */
public function handle(): array

// ✓ — a list
/** @return list<Order> */
public function handle(): array

// ✓✓ — better still, a typed object
public function handle(): OrderSummary
```

The docblock is a stopgap. If the shape matters, make it a DTO
(`laravel-enterprise-architecture`).

### Collection generics

```php
/** @return Collection<int, Order> */
public function overdue(): Collection
{
    return Order::overdue()->get();
}

/** @param Collection<int, Order> $orders */
public function total(Collection $orders): Money
```

Larastan infers most of these from Eloquent, but explicit annotations survive refactors and
document intent.

### Relationship return types

```php
/** @return HasMany<OrderLine, $this> */
public function lines(): HasMany
{
    return $this->hasMany(OrderLine::class);
}
```

Laravel 11+ relationship generics take the related model **and** the parent. Getting this
right makes `$order->lines` correctly typed everywhere downstream.

### Possibly null

```
Cannot call method save() on App\Models\Order|null.
```

```php
// ✗ Silences without fixing
$order?->save();

// ✓ Fail loudly at the boundary
$order = Order::findOrFail($id);
$order->save();

// ✓ Or handle the null case deliberately
if ($order === null) {
    throw new OrderNotFound($id);
}
```

`?->` on something that must exist converts a loud failure into a silent no-op. That is
usually worse.

### Model property unknown

```
Access to an undefined property App\Models\Order::$total_minor.
```

Larastan reads your migrations, so this usually means the migration and the model have
drifted. Real fixes:

```php
// Add the cast so the type is known
protected function casts(): array
{
    return ['total_minor' => 'integer'];
}
```

```php
/**
 * @property int $total_minor
 * @property-read Money $total
 */
final class Order extends Model
```

Generate them:

```bash
composer require --dev barryvdh/laravel-ide-helper
php artisan ide-helper:models --write
```

This helps PHPStan and the IDE at once.

### Unsafe usage of `new static`

```php
// ✗
public static function make(): static
{
    return new static();
}

// ✓ Mark the class final, or the constructor as safe
final class Money { /* ... */ }
```

## Baselines vs ignores vs fixes

| Situation | Do |
|---|---|
| Real bug | **Fix it** |
| Legacy code you are not touching | Baseline |
| Framework magic PHPStan cannot see | `ignoreErrors` with an explanatory comment |
| Third-party stub gap | `ignoreErrors` scoped to the path |
| "It's fine, trust me" | Fix it, or write down why in the comment |

```php
// Inline ignore — scoped to one line, with a reason
/** @phpstan-ignore-next-line Macro registered in AppServiceProvider at runtime */
$response->customMacro();
```

An ignore without a reason becomes permanent, because the next person cannot tell whether
it is still needed.

## Useful extensions

```bash
composer require --dev \
    phpstan/phpstan-deprecation-rules \
    phpstan/phpstan-strict-rules \
    ergebnis/phpstan-rules
```

```neon
includes:
    - vendor/phpstan/phpstan-deprecation-rules/rules.neon
    - vendor/phpstan/phpstan-strict-rules/rules.neon
```

Deprecation rules are the highest-value addition: they surface framework deprecations
before an upgrade forces you to deal with all of them at once.

Strict rules add: no loose comparison, no dynamic method calls, boolean expressions must
actually be boolean. Worth it on a new project; disruptive on an old one.

## Security taint analysis

PHPStan cannot trace user input to a dangerous sink. Psalm can:

```bash
composer require --dev vimeo/psalm psalm/plugin-laravel
vendor/bin/psalm --taint-analysis
```

This is the only widely-available PHP tool that will flag `$request->input()` reaching
`DB::raw()`. Worth running periodically even if PHPStan is your primary analyser. See
`laravel-security`.

## Performance

```bash
vendor/bin/phpstan analyse --memory-limit=1G
vendor/bin/phpstan clear-result-cache
```

PHPStan caches results, so subsequent runs are fast. In CI, cache
`.phpstan.cache` between builds:

```yaml
- uses: actions/cache@v4
  with:
    path: .phpstan.cache
    key: phpstan-${{ github.sha }}
    restore-keys: phpstan-
```

```neon
parameters:
    tmpDir: .phpstan.cache
    parallel:
        maximumNumberOfProcesses: 4
```

## In CI

```yaml
- name: PHPStan
  run: vendor/bin/phpstan analyse --error-format=github --no-progress --memory-limit=1G
```

`--error-format=github` annotates the PR diff directly, which gets errors fixed rather than
scrolled past.

**Fail the build.** A static analysis job that warns is a job that is ignored.

## What PHPStan will not catch

- Wrong business logic that is correctly typed
- Missing authorization
- N+1 queries
- Race conditions
- Bad UX

It is one gate among several. `laravel-testing-qa` covers behaviour; `laravel-security`
covers authorization; `laravel-performance` covers query counts.
