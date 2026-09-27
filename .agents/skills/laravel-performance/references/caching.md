# Caching

Caching is the fastest way to make something fast and the fastest way to serve wrong data.
Every cache needs an answer to: *what invalidates this?*

## Layers, in order of cheapness

| Layer | What it caches | Invalidated by |
|---|---|---|
| OPcache | Compiled PHP bytecode | Deploy (`opcache_reset` / new container) |
| `config:cache` | Merged config array | Deploy |
| `route:cache` | Compiled route table | Deploy |
| `view:cache` | Compiled Blade | Deploy |
| `event:cache` | Event→listener map | Deploy |
| Application cache | Computed values, query results | Explicit / TTL |
| HTTP cache | Full responses | TTL / purge |
| CDN | Static assets, cacheable responses | Hashed filenames / purge |

Deploy sequence: `laravel-devops-deployment`.

```bash
php artisan optimize          # config + route + view + event
php artisan optimize:clear    # undo all of it
```

**Critical consequence of `config:cache`:** `env()` returns `null` everywhere except
`config/*.php`. Any `env()` call in application code silently becomes null in production.
This is one of the top three production incidents in Laravel apps.

```php
// ✗ Returns null once config is cached
$key = env('STRIPE_SECRET');

// ✓
$key = config('services.stripe.secret');   // config/services.php reads env()
```

## Application cache patterns

```php
// Remember — the default
$value = Cache::remember($key, now()->addMinutes(15), fn () => $this->expensive());

// Forever, with explicit invalidation
Cache::forever($key, $value);
Cache::forget($key);

// Only if absent
Cache::add($key, $value, $ttl);

// Stale-while-revalidate: serve stale for up to 3600s while one process rebuilds
Cache::flexible($key, [300, 3600], fn () => $this->expensive());
```

`Cache::flexible()` is the right default for anything expensive and frequently read — it
eliminates the thundering herd at expiry without a lock.

### Locks for expensive rebuilds

```php
Cache::lock("report:{$id}", 120)->block(10, function () use ($id) {
    return Cache::remember("report:{$id}", 3600, fn () => $this->build($id));
});
```

Without a lock, an expired key under load means every concurrent request rebuilds
simultaneously — the cache stampede that takes the database down.

### Tags (Redis / Memcached only)

```php
Cache::tags(["tenant:{$id}", 'reports'])->remember($key, $ttl, $fn);

Cache::tags(['reports'])->flush();          // invalidate a whole category
```

Tags are convenient but add a level of indirection and memory overhead. For a small number
of well-known keys, an explicit key list is simpler and faster.

## Key design

A cache key must include **every input that changes the result**.

```php
// ✗ Leaks data across tenants — a security bug, not a perf bug
Cache::remember('dashboard_stats', $ttl, fn () => $this->stats());

// ✓
$key = sprintf(
    'stats:v2:tenant:%d:user:%d:locale:%s:range:%s',
    $tenant->id,
    $user->id,
    app()->getLocale(),
    $range->cacheKey(),
);
```

Include, where relevant:
- Tenant / organisation id
- User id, **if the result depends on permissions**
- Locale
- Filters, sort, page
- A version prefix (`v2:`) so a shape change invalidates everything at once

For long or variable inputs, hash the tail — but keep the prefix readable so you can
inspect Redis:

```php
$key = "search:{$tenant->id}:" . hash('xxh128', json_encode($filters));
```

### Model cache keys

```php
$key = "post:{$post->id}:rendered:{$post->updated_at->timestamp}";
```

Embedding `updated_at` makes the key self-invalidating — a save produces a new key, and the
old one expires naturally. No invalidation logic to get wrong.

## Invalidation

Three strategies, in order of preference:

**1. TTL** — simplest. Correct when staleness for N minutes is acceptable. Most dashboards
and aggregates qualify.

**2. Self-invalidating keys** — embed `updated_at` or a version. No explicit invalidation
at all.

**3. Explicit invalidation** — necessary when staleness is unacceptable.

```php
final class ForgetCachedPost
{
    public function handle(PostUpdated $event): void
    {
        Cache::forget("post:{$event->post->id}");
        Cache::tags(['post-lists'])->flush();
    }
}
```

Put explicit invalidation in a **listener**, not scattered through the actions that write.
Otherwise the fifth write path forgets, and you have a stale-data bug that reproduces once
a week.

Model observers work too, but they fire on every save including seeders and imports —
consider the volume.

## What not to cache

- **Anything you cannot invalidate correctly.** A wrong balance is worse than a slow one.
- **Cheap queries.** A 2ms indexed primary-key lookup is faster than a Redis round trip
  plus serialisation. Measure before caching.
- **Per-request values.** Use a local variable or the container, not the cache:

```php
// ✗ Redis round trip for something that lives 50ms
$user = Cache::remember("user:{$id}", 60, fn () => User::find($id));

// ✓ In-request memoisation
$this->users[$id] ??= User::find($id);
```

- **Data with per-user authorization**, unless the key includes the permission set.
  Caching an authorized result under a shared key leaks data.
- **Rapidly changing counters.** Use Redis `INCR` directly, not read-modify-write cache.

## Cache stores

| Store | Use for |
|---|---|
| `redis` | Production default. Tags, locks, atomic ops, shared across servers |
| `memcached` | Alternative; no persistence, simpler |
| `database` | Small apps, or where Redis is unavailable. Slower; needs a prune schedule |
| `file` | Local dev only. Not shared across servers — breaks behind a load balancer |
| `array` | Tests |
| `octane` | In-memory per worker, with Octane. Fastest, not shared |

```php
// config/cache.php — separate Redis databases so cache flush ≠ queue flush
'redis' => [
    'client' => 'phpredis',
    'default' => ['database' => env('REDIS_DB', 0)],
    'cache'   => ['database' => env('REDIS_CACHE_DB', 1)],
],
```

Use different Redis databases (or prefixes) for cache, queue, and session. Flushing the
cache should not drop queued jobs.

### Eviction policy

```
# redis.conf
maxmemory 512mb
maxmemory-policy allkeys-lru
```

`allkeys-lru` for a pure cache instance. If the *same* Redis holds queues or sessions, use
`volatile-lru` so keys without a TTL (queue data) are never evicted — otherwise Redis will
silently delete queued jobs under memory pressure.

## HTTP caching

```php
return response($content)
    ->header('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400')
    ->setEtag(md5($content));

// Static assets built by Vite carry a content hash — cache forever
// Cache-Control: public, max-age=31536000, immutable
```

Middleware for conditional requests:

```php
final class SetCacheHeaders
{
    public function handle(Request $request, Closure $next, string $maxAge = '300'): Response
    {
        $response = $next($request);

        if ($request->isMethod('GET') && $response->isSuccessful() && ! auth()->check()) {
            $response->setPublic()->setMaxAge((int) $maxAge)->setEtag(md5($response->getContent()));
            $response->isNotModified($request);   // returns 304 when unchanged
        }

        return $response;
    }
}
```

Never send `public` cache headers on an authenticated response — a shared proxy will serve
one user's page to another.

## Response caching

For genuinely public pages, cache the whole response:

```php
Route::middleware('cache.headers:public;max_age=300')->group(function (): void {
    Route::get('/', HomeController::class);
});
```

Full page caching via a package or a reverse proxy (Nginx `fastcgi_cache`, Varnish, a CDN)
is the biggest single win for high-traffic public content. Configuration lives in
`laravel-devops-deployment`.

## Monitoring

```bash
redis-cli info stats | grep keyspace
# keyspace_hits / (keyspace_hits + keyspace_misses) = hit rate

redis-cli --bigkeys
redis-cli info memory | grep used_memory_human
```

Target hit rate above ~80% for application caches. Below that, the TTL is too short, the
key is too specific, or the data was never cacheable.

## Anti-patterns

| Anti-pattern | Consequence |
|---|---|
| `Cache::forever()` with no invalidation path | Permanently stale data |
| Key missing the tenant/user id | Cross-tenant data leak |
| `env()` in application code | Null in production once config is cached |
| Caching a 2ms query | Slower than not caching |
| `Cache::flush()` on deploy | Stampede on every release |
| Caching authorization results under a shared key | Privilege escalation |
| Cache as the source of truth | Data loss on eviction |
| No TTL on Redis keys with `allkeys-lru` and queues in the same DB | Queue jobs evicted |
| Invalidation scattered across write paths | One path forgets; intermittent staleness |
