# Performance review — pre-merge gate

## Queries — the blocking checks

- [ ] Query count does **not** grow with row count (no N+1)
- [ ] `Model::preventLazyLoading()` enabled in dev and the change produces no violations
- [ ] Every relation used in a view, resource, or policy is eager loaded
- [ ] `with('rel:id,col')` includes the FK on both sides
- [ ] `withCount` / `withSum` / `withExists` used instead of counting loaded collections
- [ ] No `$model->relation->count()` — uses `relation_count` or `->relation()->count()`
- [ ] No accessor that queries the database
- [ ] Polymorphic relations use `morphWith()` where the subject's relations are accessed
- [ ] `select()` limits columns on list queries; heavy TEXT/JSON columns excluded
- [ ] No filtering, sorting, or aggregating in PHP that SQL could do
- [ ] `EXPLAIN` checked for any new non-trivial query — no `type: ALL`, no filesort on a
      large table

## Result-set size

- [ ] No `Model::all()` on a table that grows
- [ ] Every list endpoint paginates
- [ ] `per_page` has a validated maximum (≤ 100)
- [ ] Array inputs have a `max:` rule
- [ ] Large processing uses `chunkById()` / `lazyById()`, not `chunk()`
- [ ] Exports stream; over ~100k rows they are queued and delivered by signed link
- [ ] Deep pagination uses `cursorPaginate()` or `simplePaginate()`, not `paginate()`

## Writes

- [ ] Bulk inserts use `insert()` / `upsert()`, not a loop of `create()`
- [ ] Counters use `increment()` / `decrement()`, not read-modify-write
- [ ] Mass updates use a single `update()` where model events are not needed
- [ ] Transactions are short and contain no HTTP calls
- [ ] Deletion at scale is chunked and throttled

## Caching

- [ ] Anything cached has an explicit TTL or an invalidation path
- [ ] Cache keys include tenant, user (if permission-dependent), locale, filters, version
- [ ] No caching of a query that is already sub-5ms
- [ ] Expensive shared values use `Cache::flexible()` or a lock (stampede protection)
- [ ] Invalidation lives in a listener, not scattered across write paths
- [ ] No `env()` calls outside `config/`
- [ ] Cache, queue, and session use separate Redis databases or prefixes

## Background work

- [ ] Third-party calls, mail, image processing, PDFs, exports are queued
- [ ] Jobs are idempotent
- [ ] `$tries`, `$timeout`, `$backoff` set explicitly
- [ ] `retry_after` exceeds the longest job timeout on that connection
- [ ] Jobs carry IDs, not large payloads
- [ ] Long jobs are on a separate queue from latency-sensitive ones
- [ ] `WithoutOverlapping` / `ShouldBeUnique` where duplicates are possible
- [ ] Rate-limited external calls use `RateLimited` middleware

## Frontend

- [ ] JS ≤ 200KB gzipped, CSS ≤ 60KB gzipped
- [ ] Heavy dependencies dynamically imported, not in the main bundle
- [ ] No render-blocking scripts
- [ ] Fonts self-hosted, subset, `font-display: swap`
- [ ] Every `<img>` has `width` and `height` (CLS)
- [ ] `loading="lazy"` below the fold; **not** on the LCP image
- [ ] `fetchpriority="high"` on the LCP image
- [ ] Compression (Brotli/gzip) enabled at the server
- [ ] Assets served with `immutable` cache headers (Vite hashes filenames)
- [ ] Livewire: `wire:key` in loops; `.live` debounced or deferred

## Verification

- [ ] Measured before and after — actual numbers, not assumptions
- [ ] Tested against realistic data volume, not a 50-row seed
- [ ] Query-count assertion added for any new list/index endpoint
- [ ] Slow-query logging in place and no new entries from this change
- [ ] Lighthouse run if the change touches frontend assets

## Handoffs

- [ ] Index requirements confirmed → `laravel-database-scale`
- [ ] Image derivatives and formats → `laravel-media-management`
- [ ] Worker counts, server tuning → `laravel-devops-deployment`
- [ ] Input limits also reviewed as abuse controls → `laravel-security`
