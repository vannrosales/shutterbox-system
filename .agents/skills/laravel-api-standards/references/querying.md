# Filtering, sorting, searching, pagination

Every parameter here is user input that reaches a query. Whitelist all of it.

## The interface

```
GET /api/v1/invoices
    ?filter[status]=paid
    &filter[issued_after]=2026-01-01
    &filter[search]=acme
    &sort=-issued_at
    &include=customer
    &per_page=25
    &cursor=eyJpZCI6MTIzfQ
```

## Validation first

```php
final class ListInvoicesRequest extends FormRequest
{
    public const SORTABLE = ['issued_at', 'due_on', 'total_minor', 'reference'];
    public const FILTERABLE = ['status', 'customer_id', 'issued_after', 'issued_before', 'search'];
    public const INCLUDABLE = ['customer', 'lines'];

    public function rules(): array
    {
        return [
            'filter'                 => ['array'],
            'filter.status'          => ['sometimes', Rule::enum(InvoiceStatus::class)],
            'filter.customer_id'     => ['sometimes', 'integer'],
            'filter.issued_after'    => ['sometimes', 'date'],
            'filter.issued_before'   => ['sometimes', 'date', 'after_or_equal:filter.issued_after'],
            'filter.search'          => ['sometimes', 'string', 'min:2', 'max:100'],

            // Whitelist including the leading '-' for descending
            'sort'     => ['sometimes', 'string', Rule::in($this->sortOptions())],
            'include'  => ['sometimes', 'string'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'cursor'   => ['sometimes', 'string'],
        ];
    }

    private function sortOptions(): array
    {
        return collect(self::SORTABLE)
            ->flatMap(fn (string $c): array => [$c, "-{$c}"])
            ->all();
    }

    protected function prepareForValidation(): void
    {
        // Reject unknown filter keys outright rather than ignoring them silently —
        // a typo'd filter that returns everything is a data-exposure bug.
        $unknown = array_diff(array_keys($this->input('filter', [])), self::FILTERABLE);

        abort_if($unknown !== [], 422, __('Unknown filter: :keys', ['keys' => implode(', ', $unknown)]));
    }
}
```

Rejecting unknown filters matters. `?filter[stat]=paid` silently returning every invoice
looks like a bug to the client and is a data leak in a multi-tenant system.

## Applying filters

```php
final class ListInvoicesController
{
    public function __invoke(ListInvoicesRequest $request): AnonymousResourceCollection
    {
        $filters = $request->collect('filter');

        $invoices = Invoice::query()
            ->visibleTo($request->user())          // tenant scope FIRST, always
            ->when($filters->get('status'),
                fn (Builder $q, string $s) => $q->where('status', $s))
            ->when($filters->get('customer_id'),
                fn (Builder $q, int $id) => $q->where('customer_id', $id))
            ->when($filters->get('issued_after'),
                fn (Builder $q, string $d) => $q->where('issued_at', '>=', $d))
            ->when($filters->get('issued_before'),
                fn (Builder $q, string $d) => $q->where('issued_at', '<=', $d))
            ->when($filters->get('search'),
                fn (Builder $q, string $t) => $q->whereFullText(['reference', 'notes'], $t))
            ->with($this->includes($request))
            ->withCount('lines')
            ->orderBy(...$this->sort($request))
            ->cursorPaginate($request->integer('per_page', 20))
            ->withQueryString();                    // keeps filters in the pagination links

        return InvoiceResource::collection($invoices);
    }

    private function sort(ListInvoicesRequest $request): array
    {
        $sort = $request->string('sort', '-issued_at')->toString();

        return str_starts_with($sort, '-')
            ? [substr($sort, 1), 'desc']
            : [$sort, 'asc'];
    }
}
```

`->withQueryString()` is easy to forget and produces pagination links that drop every
filter — the client's "next page" returns unfiltered results.

## Sorting — the injection point

```php
// ✗ SQL injection. Column names cannot be parameterised.
$query->orderByRaw($request->input('sort'));

// ✓ Whitelist
$sort = in_array($request->input('sort'), self::SORTABLE, true)
    ? $request->input('sort')
    : 'issued_at';

$direction = $request->input('direction') === 'asc' ? 'asc' : 'desc';

$query->orderBy($sort, $direction);
```

Always add a deterministic tiebreaker, or pagination skips and repeats rows:

```php
$query->orderBy($sort, $direction)->orderBy('id', $direction);
```

Every sortable column needs an index, or sorting a large table is a filesort. See
`laravel-database-scale`.

Multi-column sort:

```
?sort=-status,issued_at
```

```php
foreach (explode(',', $request->string('sort')) as $field) {
    $desc = str_starts_with($field, '-');
    $column = ltrim($field, '-');

    abort_unless(in_array($column, self::SORTABLE, true), 422);

    $query->orderBy($column, $desc ? 'desc' : 'asc');
}
```

Cap the number of sort fields (3 is plenty) — each one adds work.

## Search

| Rows | Approach |
|---|---|
| < 100k | `LIKE 'term%'` on an indexed column |
| 100k–5M | Database full-text index |
| > 5M, or relevance matters | Meilisearch / Typesense / Elasticsearch |

```php
// ✗ Cannot use an index. Full scan on every keystroke.
$query->where('reference', 'like', "%{$term}%");

// ✓ Full-text
$query->whereFullText(['reference', 'notes'], $term);

// ✓ Scout
Invoice::search($term)
    ->where('tenant_id', $request->user()->tenant_id)     // never omit in multi-tenant
    ->paginate(20);
```

The tenant filter in the Scout query is essential — the database global scope does not
apply to the search engine. See `laravel-security`.

Rate limit search separately; it is the most abusable endpoint on most APIs.

## Pagination

| Method | Query cost | Can jump to page N | Use |
|---|---|---|---|
| `paginate()` | `COUNT(*)` + `OFFSET` | yes | Small tables where the total matters |
| `simplePaginate()` | `OFFSET` only | no | Medium tables |
| `cursorPaginate()` | Neither | no | **Default for APIs** |

```php
// Cursor — constant time at any depth
$invoices = Invoice::orderByDesc('issued_at')->orderByDesc('id')->cursorPaginate(20);
```

```json
{
  "data": [...],
  "links": {
    "first": null,
    "last": null,
    "prev": null,
    "next": "https://api.example.com/v1/invoices?cursor=eyJpZCI6MTIzfQ"
  },
  "meta": { "path": "...", "per_page": 20, "next_cursor": "eyJpZCI6MTIzfQ", "prev_cursor": null }
}
```

Cursor pagination requires a **deterministic, indexed sort with a unique tiebreaker**.
Without the tiebreaker, rows sharing a sort value are skipped or duplicated.

Trade-offs to tell clients about: no total count, no arbitrary page jumps, and the cursor
is opaque (do not let clients construct one).

If the client genuinely needs a total:

```php
'meta' => ['total' => Cache::remember("invoices:count:{$tenantId}", 300, fn () => $query->count())],
```

Cache it. Running `COUNT(*)` on every page of a 10M-row table is the query that eventually
takes the database down.

## Per-page cap

```php
'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
```

Not optional. `?per_page=1000000` without a cap is a one-request denial of service, and it
is the first thing an attacker tries.

```php
$perPage = min($request->integer('per_page', 20), 100);
```

Belt and braces: validate **and** clamp.

## Reusable filter objects

For an API with many filterable resources, a package or a small abstraction beats repeating
the `when()` chain.

```php
composer require spatie/laravel-query-builder
```

```php
$invoices = QueryBuilder::for(Invoice::class)
    ->allowedFilters([
        AllowedFilter::exact('status'),
        AllowedFilter::exact('customer_id'),
        AllowedFilter::scope('issued_between'),
        AllowedFilter::callback('search', fn ($q, $v) => $q->whereFullText(['reference'], $v)),
    ])
    ->allowedSorts(['issued_at', 'total_minor'])
    ->allowedIncludes(['customer', 'lines'])
    ->defaultSort('-issued_at')
    ->cursorPaginate(20);
```

The package whitelists by construction, which is the main win. It throws on unknown
parameters — configure whether that is a 400 or a silent ignore, and prefer throwing.

Still apply the tenant scope yourself:

```php
QueryBuilder::for(Invoice::query()->visibleTo($request->user()))
```

## Date ranges

```php
'filter.issued_after'  => ['sometimes', 'date', 'after:'.now()->subYears(5)->toDateString()],
'filter.issued_before' => ['sometimes', 'date', 'after_or_equal:filter.issued_after'],
```

Cap the range width for expensive queries:

```php
final class MaxRangeDays implements ValidationRule
{
    public function __construct(private readonly int $maxDays, private readonly string $fromField) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $from = request()->date($this->fromField);

        if ($from && $from->diffInDays($value) > $this->maxDays) {
            $fail(__('The date range cannot exceed :days days.', ['days' => $this->maxDays]));
        }
    }
}
```

A report endpoint with an unbounded date range is a slow-query generator.

## Testing

```php
it('rejects an unknown sort column', function (): void {
    $this->actingAs($user)
        ->getJson('/api/v1/invoices?sort=password')
        ->assertUnprocessable();
});

it('rejects an unknown filter key', function (): void {
    $this->actingAs($user)
        ->getJson('/api/v1/invoices?filter[secret]=1')
        ->assertUnprocessable();
});

it('caps per_page', function (): void {
    Invoice::factory()->count(150)->for($user->tenant)->create();

    $this->actingAs($user)
        ->getJson('/api/v1/invoices?per_page=1000')
        ->assertUnprocessable();
});

it('keeps filters in pagination links', function (): void {
    $this->actingAs($user)
        ->getJson('/api/v1/invoices?filter[status]=paid')
        ->assertJsonPath('links.next', fn (?string $url) =>
            $url === null || str_contains($url, 'filter%5Bstatus%5D=paid')
        );
});

it('never returns another tenant\'s invoices', function (): void {
    Invoice::factory()->count(5)->create();          // other tenants

    $this->actingAs($user)
        ->getJson('/api/v1/invoices')
        ->assertJsonCount(0, 'data');
});
```

The last one is the test that matters most. Write it for every list endpoint.
