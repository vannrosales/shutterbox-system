# Resources and serialisation

The API Resource is the only place a model becomes JSON. It is the contract boundary.

## Never return a model

```php
// ✗ Serialises every column. Add a column, and it silently appears in the API.
return $invoice;
return response()->json($invoice);

// ✓ Explicit contract
return InvoiceResource::make($invoice);
```

`$hidden` is a blocklist — the wrong default. A new `internal_notes` column is exposed
until someone remembers to hide it. A Resource is an allow-list: a new column is invisible
until someone adds it deliberately.

## The complete resource

```php
final class InvoiceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'         => $this->id,
            'reference'  => $this->reference,
            'status'     => $this->status->value,

            // Money: integer minor units + currency. Never a float.
            'total'      => [
                'minor'    => $this->total_minor,
                'currency' => $this->currency,
                'formatted'=> Number::currency($this->total_minor / 100, $this->currency),
            ],

            // Dates: ISO 8601 in UTC. Never a locale-formatted string.
            'issued_at'  => $this->issued_at?->toIso8601String(),
            'due_on'     => $this->due_on?->toDateString(),
            'created_at' => $this->created_at->toIso8601String(),

            // Relations: whenLoaded, ALWAYS
            'customer'   => CustomerResource::make($this->whenLoaded('customer')),
            'lines'      => LineResource::collection($this->whenLoaded('lines')),
            'lines_count'=> $this->whenCounted('lines'),

            // Conditional fields
            'internal_notes' => $this->when(
                $request->user()?->can('viewInternal', $this->resource),
                fn () => $this->internal_notes,
            ),

            // What the caller may do — removes duplicated rules from every client
            'can' => [
                'update' => $request->user()?->can('update', $this->resource) ?? false,
                'refund' => $request->user()?->can('refund', $this->resource) ?? false,
            ],
        ];
    }

    /** Top-level additions for a single resource response. */
    public function with(Request $request): array
    {
        return ['meta' => ['request_id' => Context::get('request_id')]];
    }
}
```

## `whenLoaded` — the N+1 defence

```php
// ✗ Lazy loads per item. 50 invoices → 50 extra queries.
'customer' => CustomerResource::make($this->customer),

// ✓ Key omitted entirely when not loaded
'customer' => CustomerResource::make($this->whenLoaded('customer')),
```

This is the single most common API performance bug. Enable
`Model::preventLazyLoading()` in development and it becomes impossible to ship —
see `laravel-performance`.

The omission is deliberate: an absent key tells the client "not requested", which is
different from `null` meaning "no customer".

Related helpers:

```php
'lines_count'  => $this->whenCounted('lines'),           // needs withCount()
'total_paid'   => $this->whenAggregated('payments', 'amount', 'sum'),
'pivot_role'   => $this->whenPivotLoaded('team_user', fn () => $this->pivot->role),
'flag'         => $this->whenNotNull($this->flag),
```

## Conditional fields

```php
// By permission
'cost_price' => $this->when($request->user()->can('viewCosts'), $this->cost_price),

// Use a closure when the value itself is expensive — `when` evaluates the
// second argument eagerly unless it is a closure.
'stats' => $this->when($detailed, fn () => $this->computeStats()),

// Merge a group of fields
$this->mergeWhen($request->user()->isAdmin(), [
    'created_by'  => $this->created_by,
    'ip_address'  => $this->ip_address,
]),
```

Conditional fields make responses harder to document and test. Prefer a separate resource
class when the difference is large:

```php
InvoiceResource::class          // public shape
InvoiceAdminResource::class     // adds internal fields
```

## Sparse fieldsets

```
GET /api/v1/invoices?fields[invoices]=id,reference,total
```

```php
public function toArray(Request $request): array
{
    $fields = $this->requestedFields($request, 'invoices');

    return $this->filterFields([
        'id'        => $this->id,
        'reference' => $this->reference,
        'status'    => $this->status->value,
        'total'     => ['minor' => $this->total_minor, 'currency' => $this->currency],
    ], $fields);
}
```

Worth it for mobile clients on metered connections. Whitelist the field names — an
unvalidated `fields` parameter that reaches a `select()` is injection.

## Includes — client-controlled, server-bounded

```
GET /api/v1/invoices?include=customer,lines
```

```php
final class ListInvoicesController
{
    private const ALLOWED_INCLUDES = ['customer', 'lines', 'lines.product'];
    private const MAX_INCLUDES = 3;

    public function __invoke(ListInvoicesRequest $request): AnonymousResourceCollection
    {
        $includes = collect(explode(',', (string) $request->query('include')))
            ->filter()
            ->intersect(self::ALLOWED_INCLUDES)   // whitelist
            ->take(self::MAX_INCLUDES)             // bound the cost
            ->all();

        return InvoiceResource::collection(
            Invoice::query()
                ->visibleTo($request->user())
                ->with($includes)
                ->withCount('lines')
                ->cursorPaginate($request->integer('per_page', 20))
        );
    }
}
```

Both the whitelist and the count limit are required. Without the whitelist,
`?include=customer.orders.lines.product.category` generates an arbitrary query graph —
a denial-of-service from a single GET.

Cap the **depth** as well as the count if you allow dotted includes.

## Collections

```php
// Simple — Laravel wraps and paginates
return InvoiceResource::collection($invoices);
```

```php
// Custom collection when you need extra meta
final class InvoiceCollection extends ResourceCollection
{
    public $collects = InvoiceResource::class;

    public function toArray(Request $request): array
    {
        return [
            'data' => $this->collection,
            'meta' => [
                'total_outstanding' => $this->collection->sum('total_minor'),
                'currency'          => 'PHP',
            ],
        ];
    }
}
```

Careful: aggregates computed over `$this->collection` only cover the **current page**.
Compute totals in the query if they should cover the whole result set.

## Types — get them right at the boundary

| Value | Send as | Never |
|---|---|---|
| Money | `{ "minor": 149900, "currency": "PHP" }` | `1499.00` (float) |
| Date + time | `"2026-07-31T14:30:00+00:00"` (ISO 8601, UTC) | `"31/07/2026 2:30 PM"` |
| Date only | `"2026-07-31"` | A datetime with a fake time |
| Enum | `"paid"` (the backed value) | `1`, or a translated label |
| Boolean | `true` / `false` | `1`, `"1"`, `"yes"` |
| Big integer | String, if it can exceed 2^53 | A JSON number (JS loses precision) |
| Null | `null` | `""`, `0`, `"null"` |
| Duration | Seconds as an integer, or ISO 8601 | `"2 hours"` |

```php
// Casts make this automatic and consistent
protected function casts(): array
{
    return [
        'status'    => InvoiceStatus::class,
        'issued_at' => 'immutable_datetime',
        'due_on'    => 'immutable_date',
        'metadata'  => 'array',
    ];
}
```

Send both machine value and display label when the client needs to render:

```php
'status'       => $this->status->value,      // 'paid' — what the client branches on
'status_label' => $this->status->label(),    // 'Paid' — translated, for display
```

Never make the client map machine values to labels; never make it parse the label.

## Nulls and absent keys

```php
// null  = the value is known to be empty
// absent = not requested / not applicable
```

Be consistent. Laravel's `whenLoaded` omits; `?->` produces null. Document which is which,
because a client that treats absent as null will break when you start including a field.

To force presence:

```php
'customer' => $this->relationLoaded('customer')
    ? CustomerResource::make($this->customer)
    : null,
```

## Performance

```php
// Every relation the resource touches must be eager loaded
Invoice::with(['customer:id,name', 'lines'])
    ->withCount('lines')
    ->cursorPaginate(20);
```

```php
// Policy checks in a resource N+1 too — load what the policy needs, once
$request->user()->loadMissing('roles.permissions');
```

Assert it:

```php
it('lists invoices with a bounded query count', function (): void {
    Invoice::factory()->count(50)->hasLines(3)->create();

    assertQueryCountUnder(10, fn () =>
        $this->actingAs($user)->getJson('/api/v1/invoices?include=customer,lines')->assertOk()
    );
});
```

## Testing the contract

```php
it('returns the documented invoice shape', function (): void {
    $invoice = Invoice::factory()->for($user->tenant)->create();

    $this->actingAs($user)
        ->getJson("/api/v1/invoices/{$invoice->id}")
        ->assertOk()
        ->assertJsonStructure([
            'data' => ['id', 'reference', 'status', 'total' => ['minor', 'currency'], 'issued_at', 'can'],
            'meta' => ['request_id'],
        ]);
});

it('omits relations that were not requested', function (): void {
    $this->actingAs($user)
        ->getJson("/api/v1/invoices/{$invoice->id}")
        ->assertJsonMissingPath('data.customer');
});

it('never exposes internal fields to a non-privileged user', function (): void {
    $this->actingAs($viewer)
        ->getJson("/api/v1/invoices/{$invoice->id}")
        ->assertJsonMissingPath('data.internal_notes')
        ->assertJsonMissingPath('data.cost_price');
});
```

The last test is the important one: it fails the moment someone adds a sensitive field to
the resource without thinking. Write one per resource.
