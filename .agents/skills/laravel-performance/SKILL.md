---
name: laravel-performance
description: Use when writing or reviewing any code that queries the database, renders a list, loops over models, caches data, dispatches jobs, or builds frontend assets. Prevents N+1 queries, enforces eager loading, chunking, cursors, lazy collections, pagination, Redis/route/config/view caching, queue offloading, and asset optimisation. Triggers on "slow", "N+1", "optimize", "performance", "cache", "timeout", "memory limit", "too many queries", loops over relations, or any list/report/export feature.
---

# Performance Engineering

Performance is a design decision made when the code is written. Retrofitting it means
rewriting the query, the view, and usually the schema.

## The one rule that matters most

**Query count must not grow with row count.** A page showing 10 items and a page showing
100 items should issue the same number of queries. If it does not, you have an N+1.

```php
// ✗ 1 + N queries — one per post
$posts = Post::all();
foreach ($posts as $post) {
    echo $post->author->name;          // query per iteration
    echo $post->comments->count();     // another query per iteration
}

// ✓ 3 queries regardless of row count
$posts = Post::with('author:id,name')->withCount('comments')->paginate(20);
```

Catch it automatically — put this in `AppServiceProvider::boot()` on day one:

```php
Model::preventLazyLoading(! $this->app->isProduction());

Model::handleLazyLoadingViolationUsing(function (Model $model, string $relation): void {
    $message = "Lazy loaded [{$relation}] on [".$model::class.']';

    if (app()->isProduction()) {
        Log::warning($message);         // log, don't break production
        return;
    }

    throw new LazyLoadingViolationException($model, $relation);
});
```

Locally it throws the moment you write an N+1. In production it logs. This single setting
prevents more performance incidents than every other item in this file.

## Eager loading — the full toolkit

```php
// Select only the columns you need. ALWAYS include the FK, or the relation silently
// returns null.
Post::with('author:id,name,avatar_path')->get();

// Nested
Post::with(['comments.author:id,name'])->get();

// Constrained
Post::with(['comments' => fn ($q) => $q->latest()->limit(3)])->get();

// Counts and aggregates — no hydration of the related rows
Post::withCount(['comments', 'comments as approved_count' => fn ($q) => $q->approved()])
    ->withSum('orders', 'total')
    ->withExists('flags')
    ->get();

// Polymorphic
Activity::with(['subject' => fn (MorphTo $m) => $m->morphWith([
    Post::class    => ['author'],
    Comment::class => ['post.author'],
])])->get();

// Load later, only if missing
$post->loadMissing('comments');

// Default eager loads for a model that is useless without them
protected $with = ['author'];   // use sparingly — it applies to EVERY query
```

Two traps:

1. **`with('author:id,name')` without the FK on the parent** returns null relations.
   `Post::select('id','title')->with('author')` fails because `author_id` was not selected.
2. **`$post->comments->count()`** loads every comment to count them. Use
   `$post->comments_count` from `withCount`, or `$post->comments()->count()` for a
   COUNT query.

## Never load everything

| Rows | Use |
|---|---|
| Bounded, small (< 1000) | `get()` |
| Displayed to a user | `paginate()` / `simplePaginate()` / `cursorPaginate()` |
| Processing in a job | `chunkById()` or `lazyById()` |
| Streaming an export | `cursor()` or `lazy()` |

```php
// ✓ Constant memory, safe against rows shifting mid-run
User::where('active', true)->chunkById(500, function (Collection $users): void {
    foreach ($users as $user) { /* ... */ }
});

// ✓ Same guarantees, generator syntax
foreach (User::where('active', true)->lazyById(500) as $user) { /* ... */ }

// ✓ One query, one row in memory at a time — for streaming out
foreach (Order::where('year', 2026)->cursor() as $order) {
    fputcsv($handle, $order->toArray());
}
```

**`chunk()` vs `chunkById()`**: `chunk()` uses OFFSET, so if the loop modifies rows in a
way that changes the result set, records get skipped. `chunkById()` uses a keyset and is
safe. Default to `chunkById()`.

`cursor()` uses one DB cursor and little PHP memory, but the **driver may still buffer the
whole result set**. For genuinely huge exports, combine chunking with streaming — see
`references/large-datasets.md`.

## Pagination at scale

```php
// Small tables: fine
$posts = Post::paginate(20);           // runs a COUNT(*) — expensive on big tables

// Large tables: no COUNT
$posts = Post::simplePaginate(20);     // "next/prev" only

// Very large tables: no COUNT, no OFFSET — constant time at any page depth
$posts = Post::orderBy('id')->cursorPaginate(20);
```

`OFFSET 1000000` makes the database walk a million rows before discarding them. Keyset
(`cursorPaginate`) is O(1) at any depth. Schema and index requirements:
`laravel-database-scale`.

## Caching — decide the layer

| Layer | Command | Invalidate when |
|---|---|---|
| Config | `php artisan config:cache` | Deploy |
| Routes | `php artisan route:cache` | Deploy |
| Views | `php artisan view:cache` | Deploy |
| Events | `php artisan event:cache` | Deploy |
| Application data | `Cache::remember()` | The underlying data changes |
| Query results | `Cache::remember()` | Ditto |
| HTTP | Cache-Control / CDN | TTL or purge |
| OPcache | php.ini | Deploy |

```php
// Standard pattern
$stats = Cache::remember("tenant:{$tenant->id}:stats", now()->addMinutes(15), fn () =>
    $this->computeStats($tenant)
);

// Tagged (Redis/Memcached only) — lets you invalidate a whole group
Cache::tags(["tenant:{$tenant->id}", 'stats'])->remember($key, $ttl, $callback);
Cache::tags(['stats'])->flush();

// Stampede protection: one process rebuilds, others serve stale
Cache::flexible($key, [300, 3600], fn () => $this->expensive());

// Lock to prevent concurrent rebuilds of something very expensive
Cache::lock("rebuild:{$id}", 60)->block(5, fn () => $this->rebuild($id));
```

Rules:
- **Never cache without a TTL** unless you have an explicit invalidation path.
- Cache keys must include every input that changes the result — tenant, locale, user
  permissions, filters. A key missing the tenant id is a data-leak bug, not a perf bug.
- Cache the *computed result*, not the raw rows, when the computation is the cost.
- `config:cache` makes `env()` return **null** outside config files. Never call `env()`
  in application code.

Details, including what not to cache: `references/caching.md`.

## Move work out of the request

```php
// In the request: dispatch and return
GenerateReport::dispatch($report->id)->onQueue('reports');

// After the response, for work too small for a queue
defer(fn () => Analytics::record($event));
```

Queue anything that: calls a third party, sends mail, processes an image, generates a PDF,
or takes more than ~200ms. Use Horizon for Redis queues, with separate queues by priority
so a 10-minute report cannot block a password-reset email.

`laravel-devops-deployment` owns worker configuration and supervision.

## Frontend

```blade
@vite(['resources/css/app.css', 'resources/js/app.js'])
```

Vite gives hashed filenames (cache-bust on deploy, `Cache-Control: immutable` otherwise),
code splitting, and tree shaking. Budgets to hold:

| Metric | Budget |
|---|---|
| LCP | < 2.5s (p75) |
| INP | < 200ms (p75) |
| CLS | < 0.1 |
| TTFB | < 600ms |
| JS transferred | < 200KB gzipped |
| CSS transferred | < 60KB gzipped |
| Total page weight | < 1MB (public pages) |

- Defer non-critical JS; never `<script>` in `<head>` without `defer`/`async`.
- Self-host fonts, subset them, `font-display: swap`, preload the one above-the-fold face.
- Images: `loading="lazy"` below the fold, `fetchpriority="high"` on the LCP image, explicit
  `width`/`height` to prevent CLS. Formats and derivatives: `laravel-media-management`.
- Enable compression at the web server (Brotli, gzip fallback).

## Measure before optimising

```bash
composer require --dev barryvdh/laravel-debugbar   # query count + timings per page
composer require --dev laravel/telescope           # requests, queries, jobs, cache

php artisan db:monitor                             # connection count
```

```php
// Log every slow query in any environment
DB::whenQueryingForLongerThan(500, function (Connection $c, QueryExecuted $q): void {
    Log::warning('Slow query', ['sql' => $q->sql, 'time' => $q->time, 'bindings' => $q->bindings]);
});

// Assert query counts in tests — the only way this stays fixed
DB::enableQueryLog();
$this->get('/invoices');
expect(count(DB::getQueryLog()))->toBeLessThan(10);
```

Profile with a real dataset. A query that is fine against 50 seeded rows can be a table
scan against 5 million. Seed realistically before drawing conclusions.

## Scope boundaries

Owns: query efficiency, caching strategy, queue offloading, memory, asset delivery,
runtime budgets.

Does not own: schema, index selection, partitioning (`laravel-database-scale`); image
derivative generation (`laravel-media-management`); worker/server configuration
(`laravel-devops-deployment`); where code lives (`laravel-enterprise-architecture`).

## Bundled resources

- `references/queries.md` — N+1 catalogue, aggregates, subqueries, chunking, raw SQL
- `references/caching.md` — every layer, key design, invalidation, stampede, anti-patterns
- `references/queues.md` — what to queue, batching, Horizon, backpressure
- `references/frontend.md` — Vite, Core Web Vitals, fonts, critical CSS, compression
- `references/large-datasets.md` — exports, imports, reports, streaming at millions of rows
- `references/profiling.md` — Debugbar, Telescope, Clockwork, Xdebug, Blackfire, k6
- `templates/` — `PerformanceServiceProvider`, query-count test helper, k6 load test
- `examples/n1-fixes.md` — six real N+1s and their fixes with query counts
- `checklists/performance-review.md` — pre-merge gate
- `checklists/pre-launch.md` — production readiness

---
Last reviewed: 2026-07-31 · See MAINTENANCE.md
