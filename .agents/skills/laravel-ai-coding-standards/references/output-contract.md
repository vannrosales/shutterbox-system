# The output contract

Each item with what it looks like when honoured and when it is not.

---

## 1. Reuse before creating

Search before writing. A second implementation of the same thing is a bug waiting to
diverge.

```bash
grep -rn "formatCurrency\|money_format" app/ resources/
grep -rn "function.*Slug" app/
ls app/Rules/ app/Support/ app/Casts/
```

```php
// ✗ A second money formatter
private function formatMoney(int $minor): string
{
    return '₱'.number_format($minor / 100, 2);
}

// ✓ The one that already exists — and is locale-aware
Number::currency($minor / 100, $order->currency);
```

Check for: helpers, traits, scopes, custom rules, casts, macros, Blade components, and
framework built-ins. Laravel ships far more than most people use — `Number`, `Str`,
`Context`, `defer()`, `Cache::flexible()`.

---

## 2. Match the project's style

```php
// The project writes this
final class CreateOrderAction
{
    public function __invoke(CreateOrderData $data): Order { }
}

// ✗ Do not introduce a different shape alongside it
final class CreateOrder
{
    public function handle(CreateOrderData $data): Order { }
}
```

Match: naming, folder layout, invokable vs named methods, test framework, comment density,
how errors are surfaced, whether strings go through `__()`.

**Consistency beats correctness by this library's standards.** A uniform mediocre pattern
is worth more than a better pattern applied to 5% of the code.

---

## 3. No duplicate logic

```php
// ✗ The refund window now exists in three places and will diverge
// Controller
if ($order->paid_at->diffInDays(now()) <= 90) { }
// Policy
if ($order->paid_at->diffInDays(now()) <= 90) { }
// Blade
@if ($order->paid_at->diffInDays(now()) <= 90)

// ✓ One place
public function isRefundable(): bool
{
    return $this->status === OrderStatus::Paid
        && $this->paid_at->diffInDays(now()) <= self::REFUND_WINDOW_DAYS;
}
```

The rule: **extract when the copies must change together.** Two blocks that merely look
alike but change for different reasons should stay separate — coupling them creates a class
serving two masters. See `laravel-code-quality/references/complexity.md`.

---

## 4. Backwards compatible by default

```php
// ✗ Breaks every caller
public function handle(Order $order, Money $amount, string $reason): Refund

// ✓ Additive
public function handle(Order $order, Money $amount, ?string $reason = null): Refund
```

```php
// ✗ Breaks every API client
'total' => $this->total_minor / 100,        // was a float, now… still a float but different

// ✓ Add alongside, deprecate in docs, remove in the next major
'total'       => $this->total_minor / 100,   // deprecated
'total_minor' => $this->total_minor,
'currency'    => $this->currency,
```

If a break is unavoidable, say so **before** generating:

> Changing `total` from a float to minor units is a breaking API change. Options: (a) add
> `total_minor` alongside and deprecate `total`, (b) ship it in `/api/v2`. I recommend (a)
> — smaller blast radius, and v1 clients keep working. Which?

What counts as breaking: `laravel-api-standards/references/versioning.md`.

---

## 5. Production-ready, not proof-of-concept

```php
// ✗ Proof of concept
public function store(Request $request)
{
    // TODO: add validation
    $order = Order::create($request->all());

    return $order;
}
```

Four problems: no validation, no authorization, mass assignment, and a model returned
directly.

```php
// ✓
public function __invoke(StoreOrderRequest $request, CreateOrder $action): JsonResponse
{
    $order = $action->handle($request->user()->tenant, CreateOrderData::fromRequest($request));

    return OrderResource::make($order)
        ->response()
        ->setStatusCode(201)
        ->header('Location', route('api.v1.orders.show', $order));
}
```

Production-ready means: validated, authorized, typed, error-handled, tested, and it does
not leak columns.

If you genuinely cannot finish part of it, say so explicitly rather than leaving a `TODO`
that looks like an oversight.

---

## 6. Explain significant trade-offs

```
// ✗ No explanation
[nine files appear]

// ✗ A survey of every option
"There are several approaches. We could use a repository pattern, or a service layer,
or actions, or put it in the model. Repositories give abstraction but add files.
Services are common but can become god classes. Actions are..."

// ✓ The decision and the reason
"Used `cursorPaginate()` rather than `paginate()`: the orders table will pass a million
rows within a year, and `paginate()` runs a `COUNT(*)` on every request. The trade-off is
no total count and no page-number jumping — the UI uses infinite scroll, so neither is
needed."
```

One or two sentences. Give a recommendation, not a menu.

Worth explaining: pattern choice when two were reasonable, a performance decision with a
usability cost, anything that constrains a future change, anything you did differently from
how the project usually does it.

Not worth explaining: routine choices with an obvious default.

---

## 7. Maintainability over cleverness

```php
// ✗ Clever
$grouped = collect($orders)->groupBy(fn ($o) => $o->created_at->format('Y-m'))
    ->map->groupBy(fn ($o) => $o->status->value)
    ->map->map->sum('total_minor');

// ✓ Readable
$grouped = [];

foreach ($orders as $order) {
    $month  = $order->created_at->format('Y-m');
    $status = $order->status->value;

    $grouped[$month][$status] ??= 0;
    $grouped[$month][$status] += $order->total_minor;
}
```

The reader is someone in six months with less context than you have — often the same person
who wrote it.

Clever is justified when the simple version is genuinely too slow, and then it gets a
comment explaining why.

---

## 8. Simple unless complexity is justified

```php
// A core business operation — nine files is right
app/Actions/Orders/RefundOrder.php
app/DataTransferObjects/RefundOrderData.php
app/Http/Requests/RefundOrderRequest.php
app/Policies/OrderPolicy.php
app/Events/OrderRefunded.php
app/Listeners/NotifyCustomerOfRefund.php
app/Exceptions/Orders/OrderNotRefundable.php
tests/Feature/Orders/RefundOrderTest.php
tests/Unit/OrderTest.php
```

```php
// An admin script run once a year — one file is right
Artisan::command('reports:annual {year}', function (int $year): void {
    // 30 lines, directly
});
```

The question is not "what is the best architecture" but "what does this code's actual life
require". A one-off script does not need a DTO.

When in doubt on something core, prefer the fuller structure — it pays off at the second
caller or the first test, which for core operations arrives almost immediately.

---

## Anti-patterns this contract exists to prevent

| Anti-pattern | What it looks like |
|---|---|
| Cargo-culting the library | Nine files for a config change |
| Ignoring the project | Actions introduced into a services codebase |
| Silent breaking changes | A response field renamed without mention |
| Half-finished work | `// TODO: add validation` in a merged PR |
| Unexplained complexity | A clever one-liner with no comment |
| Scope creep | A performance fix that also refactors three classes |
| Silent fixes | An unrelated bug fixed inside a feature PR |
| Overclaiming | "Done" when the tests were not run |

The last one is the most damaging. Everything else is recoverable in review.
