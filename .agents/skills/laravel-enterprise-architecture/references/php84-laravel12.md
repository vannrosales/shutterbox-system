# PHP 8.4 and Laravel 12 specifics

Verify the actual versions first — `php -v` and `composer show laravel/framework`. Do not
apply 8.4 syntax to an 8.2 runtime.

## PHP 8.4 features worth using

### Property hooks

Replaces accessor boilerplate. Ideal in DTOs and value objects.

```php
final class Temperature
{
    public function __construct(public float $celsius) {}

    public float $fahrenheit {
        get => $this->celsius * 9 / 5 + 32;
        set (float $f) => $this->celsius = ($f - 32) * 5 / 9;
    }
}
```

Do not use hooks to hide a database query. A property that reads as free but issues SQL
is the N+1 trap in a new costume.

### Asymmetric visibility

```php
final class Order
{
    public function __construct(
        public private(set) OrderStatus $status,
    ) {}

    public function markPaid(): void
    {
        $this->status = OrderStatus::Paid;   // only the class may write
    }
}
```

Public read, private write — removes a whole category of getter methods.

### `new` in initializers

```php
final class ReportBuilder
{
    public function __construct(
        private readonly Formatter $formatter = new CsvFormatter(),
    ) {}
}
```

Useful for genuinely defaultable collaborators. Not a replacement for container binding.

### Array functions

```php
$firstOverdue = array_find($invoices, fn (Invoice $i) => $i->isOverdue());
$anyOverdue   = array_any($invoices, fn (Invoice $i) => $i->isOverdue());
$allPaid      = array_all($invoices, fn (Invoice $i) => $i->isPaid());
```

Inside Laravel, prefer Collection methods (`first`, `contains`, `every`) for consistency;
use the array functions in framework-free code.

### Deprecations to avoid

- Implicitly nullable parameters (`function f(string $s = null)`) are deprecated. Write
  `?string $s = null`.
- `E_STRICT` constant removed.
- `mysqli`/`pdo` driver-specific quirks — do not rely on implicit numeric string coercion.

## Language defaults for this library

```php
<?php

declare(strict_types=1);

namespace App\Actions\Orders;

use App\Models\Order;

final class RefundOrder
{
    // ...
}
```

- `declare(strict_types=1)` first line after `<?php` in every file.
- One class per file, `final` unless designed for extension.
- Enums for fixed sets, backed by string for storage stability:

```php
enum OrderStatus: string
{
    case Pending  = 'pending';
    case Paid     = 'paid';
    case Refunded = 'refunded';

    public function isTerminal(): bool
    {
        return in_array($this, [self::Refunded], strict: true);
    }

    public function label(): string
    {
        return match ($this) {
            self::Pending  => __('Pending'),
            self::Paid     => __('Paid'),
            self::Refunded => __('Refunded'),
        };
    }
}
```

Backed by string, not int — an integer-backed enum makes the database column unreadable
and reordering cases catastrophic.

- Generics via docblocks so PHPStan can check them:

```php
/** @return Collection<int, Order> */
public function overdue(): Collection { /* ... */ }
```

## Laravel 12 skeleton

The slim structure introduced in 11 and continued in 12. `app/Http/Kernel.php` and
`app/Console/Kernel.php` no longer exist.

```php
// bootstrap/app.php
return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web:      __DIR__.'/../routes/web.php',
        api:      __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health:   '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [SetLocale::class]);
        $middleware->api(prepend: [EnsureApiVersion::class]);
        $middleware->alias([
            'tenant' => EnsureTenantAccess::class,
        ]);
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (OrderNotRefundable $e, Request $request) {
            return $request->expectsJson()
                ? response()->json(['message' => $e->getMessage()], 422)
                : back()->withErrors(['order' => $e->getMessage()]);
        });
        $exceptions->dontReport(OrderNotRefundable::class);
    })
    ->create();
```

Domain exceptions render here. That is how an action stays free of HTTP concerns while
still producing a correct status code.

### Scheduling

`routes/console.php`, not a Kernel:

```php
Schedule::command('statements:generate')->monthlyOn(1, '02:00')->withoutOverlapping();
Schedule::job(new PruneExpiredTokens)->hourly();
```

### Model casts

Method form, not property:

```php
protected function casts(): array
{
    return [
        'settings'  => AsArrayObject::class,
        'status'    => OrderStatus::class,
        'total'     => MoneyCast::class,
        'placed_at' => 'immutable_datetime',
    ];
}
```

### Strict model behaviour

In `AppServiceProvider::boot()` — catches N+1 and typos during development:

```php
Model::shouldBeStrict(! $this->app->isProduction());
```

This enables `preventLazyLoading`, `preventSilentlyDiscardingAttributes`, and
`preventAccessingMissingAttributes`. In production, log rather than throw:

```php
Model::handleLazyLoadingViolationUsing(function (Model $model, string $relation): void {
    if (app()->isProduction()) {
        Log::warning('Lazy load', ['model' => $model::class, 'relation' => $relation]);
        return;
    }
    throw new LazyLoadingViolationException($model, $relation);
});
```

### Other Laravel 12 conventions

- `Route::scopeBindings()` on nested resources — child must belong to parent. Security
  relevant; see `laravel-security`.
- `Str`/`Stringable` fluent helpers: `$request->string('name')->trim()->title()`.
- `Context::add()` for request-scoped logging context that survives into queued jobs.
- `defer()` for after-response work too small to warrant a queue.
- `Number::currency()`, `Number::fileSize()` for locale-aware formatting instead of hand
  rolled helpers.

## Upgrade posture

When the project is on an older Laravel:
- Do not introduce Laravel 12 idioms that will not run (`casts()` method needs 11+;
  `bootstrap/app.php` wiring needs 11+).
- Note the gap and offer an upgrade path as a separate change, never bundled into a
  feature PR.
- `laravel-code-quality` covers Rector rule sets for automating framework and PHP
  version upgrades.
