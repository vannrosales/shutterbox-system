# One file, from failing to clean

A real controller method taken through every tool. Each step shows what the tool caught and
why it matters.

## The starting point

```php
<?php

namespace App\Http\Controllers;

use App\Models\Order;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    public function index(Request $request)
    {
        $query = Order::query();

        if ($request->has('status') && $request->get('status') != '') {
            $query->where('status', '=', $request->get('status'));
        }

        if ($request->has('customer')) {
            if ($request->get('customer') != null) {
                if ($request->get('customer') != '') {
                    $query->where('customer_id', $request->get('customer'));
                }
            }
        }

        $sort = $request->get('sort');
        if ($sort == null) {
            $sort = 'created_at';
        }

        $orders = $query->orderByRaw($sort . ' desc')->paginate(20);

        $total = 0;
        foreach ($orders as $order) {
            $total = $total + $order->total;
        }

        return view('orders.index', [
            'orders' => $orders,
            'total' => $total,
            'customerName' => $orders->first() ? $orders->first()->customer->name : null,
        ]);
    }

    private function formatMoney($amount)
    {
        return '₱' . number_format($amount / 100, 2);
    }
}
```

It works. It also has a SQL injection, an N+1, and no types.

---

## Step 1 — Pint

```bash
vendor/bin/pint --test
```

```
✗ app/Http/Controllers/OrderController.php
  declare_strict_types, not_operator_with_successor_space, concat_space
```

```bash
vendor/bin/pint
```

Fixes: adds `declare(strict_types=1);`, normalises `$sort . ' desc'` to `$sort.' desc'`,
sorts imports, and applies spacing.

**Adding `declare(strict_types=1)` immediately matters here.** Without it,
`where('customer_id', 'abc')` silently coerces. With it, a type mismatch throws.

Pint fixed formatting. It did not fix anything that was wrong.

---

## Step 2 — PHPStan level 6

```bash
vendor/bin/phpstan analyse app/Http/Controllers/OrderController.php
```

```
 ------ ------------------------------------------------------------------
  Line   OrderController.php
 ------ ------------------------------------------------------------------
  11     Method index() has no return type specified.
  38     Method formatMoney() has parameter $amount with no type specified.
  38     Method formatMoney() has no return type specified.
  38     Method formatMoney() is unused.
  34     Cannot access property $name on App\Models\Customer|null.
  30     Binary operation "+" between int and mixed results in an error.
 ------ ------------------------------------------------------------------
```

Four real findings:

**`formatMoney()` is unused.** Dead code — delete it. (And it should not have existed:
`Number::currency()` handles this, locale-aware.)

**`$order->customer` may be null.** The `->first()` guard checks the *collection*, not the
relation. A soft-deleted customer produces a 500 in production.

**`$order->total` is `mixed`.** No cast on the model, so PHPStan cannot verify the
arithmetic. The fix is a cast, which also documents intent.

**No return types.** Level 6 requires them, and they are what make the next refactor safe.

---

## Step 3 — Rector

```bash
vendor/bin/rector process --dry-run
```

```diff
-        if ($request->has('status') && $request->get('status') != '') {
+        if ($request->filled('status')) {

-        if ($request->has('customer')) {
-            if ($request->get('customer') != null) {
-                if ($request->get('customer') != '') {
-                    $query->where('customer_id', $request->get('customer'));
-                }
-            }
-        }
+        if ($request->filled('customer')) {
+            $query->where('customer_id', $request->get('customer'));
+        }

-        $sort = $request->get('sort');
-        if ($sort == null) {
-            $sort = 'created_at';
-        }
+        $sort = $request->get('sort') ?? 'created_at';

-        $total = 0;
-        foreach ($orders as $order) {
-            $total = $total + $order->total;
-        }
+        $total = array_sum(array_map(fn ($order) => $order->total, $orders->items()));

-    private function formatMoney($amount)
-    ...
```

`LARAVEL_CODE_QUALITY` collapsed three levels of nesting into `filled()`. `deadCode`
removed the unused method. Twenty lines became six.

**Read the diff before applying.** Here every change is correct, but Rector cannot know
that `orderByRaw($sort)` is an injection — it only sees valid PHP.

---

## Step 4 — What no tool will catch

Two problems remain, and both are serious.

### SQL injection

```php
$query->orderByRaw($sort.' desc');
```

`?sort=(SELECT CASE WHEN (SELECT SUBSTRING(password,1,1) FROM users WHERE id=1)='a'
THEN SLEEP(5) ELSE 0 END)` — a blind time-based extraction of the admin password hash.

Pint formatted it. PHPStan typed it. Rector simplified around it. None of them can tell
that `$sort` came from the request.

Only Psalm's taint analysis finds this automatically:

```bash
vendor/bin/psalm --taint-analysis
```

```
ERROR: TaintedSql - $sort from $_GET reaches orderByRaw()
```

Column names **cannot** be parameterised, so the fix is a whitelist
(`laravel-security`).

### N+1

```php
$orders->first()->customer->name
```

One query per access. `Model::preventLazyLoading()` catches it in tests, not in static
analysis (`laravel-performance`).

---

## The result

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\ListOrdersRequest;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Builder;

final class OrderController extends Controller
{
    public function index(ListOrdersRequest $request): View
    {
        [$column, $direction] = $request->sortColumn();

        $orders = Order::query()
            ->visibleTo($request->user())                    // tenant scope FIRST
            ->with('customer:id,name')                        // no N+1
            ->when($request->filled('status'),
                fn (Builder $q): Builder => $q->where('status', $request->string('status')))
            ->when($request->filled('customer'),
                fn (Builder $q): Builder => $q->where('customer_id', $request->integer('customer')))
            ->orderBy($column, $direction)                    // whitelisted — no injection
            ->orderBy('id', $direction)
            ->paginate($request->perPage())
            ->withQueryString();

        return view('orders.index', [
            'orders'     => $orders,
            'pageTotal'  => $this->pageTotal($orders),
        ]);
    }

    private function pageTotal(LengthAwarePaginator $orders): Money
    {
        return $orders->getCollection()->reduce(
            fn (Money $carry, Order $order): Money => $carry->plus($order->total),
            Money::zero('PHP'),
        );
    }
}
```

```php
final class ListOrdersRequest extends FormRequest
{
    public const SORTABLE = ['created_at', 'total_minor', 'reference'];

    public function rules(): array
    {
        return [
            'status'   => ['sometimes', Rule::enum(OrderStatus::class)],
            'customer' => ['sometimes', 'integer'],
            'sort'     => ['sometimes', Rule::in(self::SORTABLE)],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }

    /** @return array{0: string, 1: string} */
    public function sortColumn(): array
    {
        return [$this->string('sort', 'created_at')->toString(), 'desc'];
    }

    public function perPage(): int
    {
        return min($this->integer('per_page', 20), 100);
    }
}
```

```php
// Model — the cast PHPStan needed, and a scope the controller cannot forget
protected function casts(): array
{
    return ['total' => MoneyCast::class, 'status' => OrderStatus::class];
}

public function scopeVisibleTo(Builder $query, User $user): void
{
    $query->where('tenant_id', $user->tenant_id);
}
```

---

## What each tool contributed

| Tool | Found | Severity |
|---|---|---|
| **Pint** | Formatting, missing `strict_types` | Low, but `strict_types` prevents coercion bugs |
| **PHPStan** | Dead method, nullable relation, `mixed` arithmetic, no return types | Medium — one was a production 500 |
| **Rector** | Triple nesting, verbose null checks, dead code | Low, but 20 lines → 6 |
| **Psalm taint** | SQL injection | **Critical** |
| **`preventLazyLoading`** | N+1 | High |
| **Human review** | Missing tenant scope, no `per_page` cap | **Critical** |

The last row is the point. Three of the four most serious problems — injection, missing
tenant scope, and the uncapped page size — were **not** found by the formatter, the type
checker, or the refactoring tool.

Automated quality tooling settles the arguments nobody should be having, and clears the
noise so that review attention lands on the things that actually matter. It does not
replace the review.

---

## The order to run them

```bash
composer fix                          # 1. Pint — formatting out of the way first
vendor/bin/rector process --dry-run   # 2. Rector — read the diff, then apply
vendor/bin/phpstan analyse            # 3. PHPStan — types, after the shape settles
php artisan test                       # 4. Behaviour
vendor/bin/psalm --taint-analysis      # 5. Security, periodically
# 6. Human review — security, tenancy, business rules
```

Formatting first, so later diffs are readable. Rector before PHPStan, because
`typeDeclarations` resolves many level-6 errors automatically. Tests after every step.
Human review last, on clean code.
