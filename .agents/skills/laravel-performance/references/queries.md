# Query performance

## The N+1 catalogue

Six places N+1s hide. All six are invisible until you count queries.

### 1. The obvious loop

```php
// ✗ 1 + N
foreach (Post::all() as $post) {
    echo $post->author->name;
}

// ✓ 2
foreach (Post::with('author')->get() as $post) {
    echo $post->author->name;
}
```

### 2. Inside a Blade view

```blade
{{-- ✗ The controller looked clean; the view added the N+1 --}}
@foreach ($posts as $post)
    <span>{{ $post->category->name }}</span>
@endforeach
```

The controller passed `Post::paginate(20)`. The view added 20 queries. This is why
`preventLazyLoading` matters — it fires wherever the access happens.

### 3. Inside an API Resource

```php
// ✗ N+1 per resource, and the most common API performance bug
public function toArray(Request $request): array
{
    return [
        'id'     => $this->id,
        'author' => AuthorResource::make($this->author),          // lazy loads
        'tags'   => TagResource::collection($this->tags),          // lazy loads
    ];
}

// ✓
public function toArray(Request $request): array
{
    return [
        'id'     => $this->id,
        'author' => AuthorResource::make($this->whenLoaded('author')),
        'tags'   => TagResource::collection($this->whenLoaded('tags')),
    ];
}
```

`whenLoaded()` omits the key entirely when the relation is not loaded, so the caller
controls cost via `?include=author`. See `laravel-api-standards`.

### 4. Accessors that query

```php
// ✗ Every access to $user->unread_count is a query
protected function unreadCount(): Attribute
{
    return Attribute::get(fn () => $this->notifications()->unread()->count());
}

// ✓ Aggregate it in the query
User::withCount(['notifications as unread_count' => fn ($q) => $q->unread()])->get();
```

Accessors that touch the database are the hardest N+1 to spot, because the call site looks
like a property read. If an accessor must query, name it so the cost is visible
(`fetchUnreadCount()`), or cache it on the instance.

### 5. Authorization checks in a loop

```blade
{{-- ✗ Policy may query per row --}}
@foreach ($posts as $post)
    @can('update', $post) <a href="...">{{ __('Edit') }}</a> @endcan
@endforeach
```

If `PostPolicy::update` does `$user->roles()->where(...)->exists()`, that is one query per
row. Eager load what the policy needs, or cache permissions on the user for the request:

```php
$user->loadMissing('roles.permissions');
```

### 6. `count()` on a loaded relation

```php
// ✗ Loads every comment row into memory just to count them
$post->comments->count();

// ✓ COUNT query, no hydration
$post->comments()->count();

// ✓✓ Aggregated in the parent query — zero extra queries
Post::withCount('comments')->get();   // then $post->comments_count
```

Same trap: `$post->comments->isEmpty()` hydrates everything.
Use `$post->comments()->exists()` or `withExists('comments')`.

## Select only what you need

```php
// ✗ SELECT * — includes TEXT/JSON/BLOB columns you never render
$posts = Post::with('author')->get();

// ✓
$posts = Post::select(['id', 'title', 'slug', 'author_id', 'published_at'])
    ->with('author:id,name')
    ->get();
```

The FK (`author_id`) must be in the select list or the relation cannot be matched and
returns null. Same on the other side: `with('author:id,name')` — `id` is required.

For models with a large `content` or `payload` column, this is often a 10× reduction in
transferred bytes on a list page.

```php
// Exclude specific heavy columns instead of listing everything
protected $hidden = ['raw_payload'];   // hides from serialisation, still fetched

// To avoid fetching it at all, use an explicit select or a dedicated scope
public function scopeListing(Builder $q): void
{
    $q->select(['id', 'title', 'status', 'created_at']);
}
```

## Aggregates without extra queries

```php
Order::query()
    ->withCount('items')
    ->withSum('items', 'quantity')
    ->withAvg('reviews', 'rating')
    ->withMax('payments', 'paid_at')
    ->withExists('refunds')
    ->get();

// Custom aggregate via subquery — one query, no join fan-out
Order::query()
    ->addSelect(['latest_payment_at' => Payment::select('created_at')
        ->whereColumn('order_id', 'orders.id')
        ->latest()
        ->limit(1),
    ])
    ->get();
```

The subquery-select pattern is the right tool for "the most recent related row" — a JOIN
+ GROUP BY for the same result is slower and duplicates parent rows.

## Existence over loading

```php
// ✗
if ($user->orders()->get()->count() > 0)
if (count($user->orders) > 0)

// ✓
if ($user->orders()->exists())

// ✓ Aggregated for a collection
User::withExists('orders')->get();   // $user->orders_exists
```

## Bulk writes

```php
// ✗ N queries
foreach ($rows as $row) {
    Product::create($row);
}

// ✓ 1 query per chunk. Note: skips model events, casts, and timestamps.
foreach (array_chunk($rows, 1000) as $chunk) {
    Product::insert($chunk);          // add created_at/updated_at manually
}

// ✓ Upsert — insert or update on conflict, one query
Product::upsert(
    $rows,
    uniqueBy: ['sku'],
    update: ['price', 'stock', 'updated_at'],
);

// ✓ Mass update, one query
Order::whereIn('id', $ids)->update(['status' => OrderStatus::Shipped]);
```

`insert()` and `update()` on a query builder **bypass model events**. If an observer or
listener must run, you need the slower path — or dispatch the consequence explicitly.

### Atomic increments

```php
// ✗ Read-modify-write — loses updates under concurrency
$product->stock = $product->stock + $qty;
$product->save();

// ✓ Atomic: SET stock = stock + ?
Product::whereKey($id)->increment('stock', $qty);
```

This is a correctness fix as much as a performance one.

## Indexes make or break every query above

```php
// Composite index column order: equality first, then range, then sort
$table->index(['tenant_id', 'status', 'created_at']);

// Serves:
//   WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC   ✓ fully
//   WHERE tenant_id = ? ORDER BY created_at DESC                  ✗ skips status
//   WHERE status = ?                                              ✗ no leading column
```

Index design, cardinality, covering indexes, and partitioning are owned by
`laravel-database-scale`. What belongs here: **check the plan**.

```php
// Laravel 12
Post::where('status', 'published')->orderByDesc('created_at')->explain()->dd();
```

```sql
EXPLAIN ANALYZE SELECT ... ;
```

Look for `type: ALL` (full scan), `Using filesort`, `Using temporary`, and a `rows`
estimate far above what you return.

## Raw SQL — when and how

Use raw SQL for window functions, CTEs, and complex aggregations that Eloquent cannot
express cleanly. Always parameterise.

```php
// ✓ Bindings
DB::select('SELECT * FROM orders WHERE tenant_id = ? AND total > ?', [$tenantId, $min]);

DB::table('orders')
    ->selectRaw('DATE(created_at) as day, COUNT(*) as total, SUM(amount) as revenue')
    ->whereBetween('created_at', [$from, $to])
    ->groupBy('day')
    ->get();

// ✗ NEVER — SQL injection
DB::select("SELECT * FROM orders WHERE tenant_id = {$tenantId}");
```

`orderByRaw` and `selectRaw` with user input are the two most common injection points in
otherwise-safe Laravel apps. Whitelist:

```php
$allowed = ['created_at', 'total', 'status'];
$column  = in_array($request->input('sort'), $allowed, true)
    ? $request->input('sort')
    : 'created_at';

$direction = $request->input('direction') === 'asc' ? 'asc' : 'desc';

Order::orderBy($column, $direction);   // safe: both values are from a whitelist
```

See `laravel-security`.

## Query-builder vs Eloquent

For read-only reporting over large row counts, the query builder avoids model hydration
entirely:

```php
// Eloquent: hydrates 100k model objects — slow and memory-hungry
$rows = Order::where('year', 2026)->get();

// Query builder: stdClass rows, ~10x less memory
$rows = DB::table('orders')->where('year', 2026)->get();
```

Use Eloquent where you need casts, relations, accessors, or events. Use the query builder
for reports and exports where you need none of them.

## Transactions

```php
// Keep them short. A transaction held open across an HTTP call holds locks.
DB::transaction(function (): void {
    $order->markPaid();
    $ledger->record($order);
}, attempts: 3);          // retries on deadlock

// ✗ Never do this — the lock is held for the duration of the API call
DB::transaction(function () use ($order) {
    $order->markPaid();
    Http::post('https://slow-partner.example/notify', [...]);   // move to a listener
});
```

## Common mistakes

| Mistake | Cost | Fix |
|---|---|---|
| `Model::all()` on a growing table | Unbounded memory | `paginate` / `chunkById` |
| `$collection->count()` on a relation | Hydrates everything | `withCount` |
| Missing FK in a `select` | Silent null relations | Include the FK |
| `whereHas` on a large table | Correlated subquery per row | Join, or denormalise a flag |
| `orderBy` on an unindexed column | Filesort | Add the index |
| `LIKE '%term%'` | No index can serve it | Full-text index or a search engine |
| `chunk()` while modifying rows | Skipped records | `chunkById()` |
| Sorting in PHP after `get()` | Loads everything | `orderBy` in SQL |
| Filtering in PHP after `get()` | Loads everything | `where` in SQL |
| `count()` on a paginator for a huge table | Expensive `COUNT(*)` | `simplePaginate` / `cursorPaginate` |
| Transaction wrapping an HTTP call | Lock contention | Dispatch after commit |
