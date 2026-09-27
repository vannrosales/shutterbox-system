# Profiling and measurement

Optimise what you measured, not what you guessed. The bottleneck is rarely where it feels
like it is.

## Query-level

### Debugbar (development)

```bash
composer require --dev barryvdh/laravel-debugbar
```

Shows per-request: query count, each query's time and bindings, duplicated queries, models
hydrated, memory, and timeline. **The duplicate-query panel is the fastest N+1 detector
that exists.**

### Telescope (development / staging)

```bash
composer require --dev laravel/telescope
php artisan telescope:install && php artisan migrate
```

Records requests, queries, jobs, cache hits/misses, mail, notifications, exceptions,
scheduled tasks. Better than Debugbar for queue and scheduled work.

**Never run Telescope in production without gating access** — it stores request payloads
including credentials. Restrict via the `viewTelescope` gate and prune aggressively:

```php
Schedule::command('telescope:prune --hours=48')->daily();
```

### Slow query logging (all environments)

```php
// AppServiceProvider::boot()
DB::whenQueryingForLongerThan(500, function (Connection $connection, QueryExecuted $event): void {
    Log::channel('performance')->warning('Slow query', [
        'sql'      => $event->sql,
        'bindings' => $event->bindings,
        'time_ms'  => $event->time,
        'url'      => request()?->fullUrl(),
    ]);
});

// Whole-request budget
DB::listen(function (QueryExecuted $q): void {
    // count in a static, log if the request exceeded N queries
});
```

MySQL side:

```sql
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 0.5;
SET GLOBAL log_queries_not_using_indexes = 'ON';
```

```bash
mysqldumpslow -s t -t 20 /var/log/mysql/slow.log       # slowest 20
pt-query-digest /var/log/mysql/slow.log                # aggregate by fingerprint
```

`pt-query-digest` groups by query shape, so you see "this query pattern costs 40% of total
DB time" rather than a list of individual slow runs. That is the number to act on.

### EXPLAIN

```php
Order::where('tenant_id', 1)->where('status', 'paid')->orderByDesc('created_at')->explain()->dd();
```

```sql
EXPLAIN ANALYZE SELECT ...;
```

Red flags:

| Sign | Meaning |
|---|---|
| `type: ALL` | Full table scan |
| `key: NULL` | No index used |
| `Using filesort` | Sorting without an index |
| `Using temporary` | Temp table — often GROUP BY without an index |
| `rows` ≫ rows returned | Scanning far more than needed |
| `Using index` | Covering index — good |

## Request-level

```php
// Poor man's profiler, always available
$start = hrtime(true);
$result = $this->expensive();
Log::info('timing', ['op' => 'expensive', 'ms' => (hrtime(true) - $start) / 1e6]);
```

### Clockwork

```bash
composer require --dev itsgoingd/clockwork
```

Browser-extension profiler with better timeline granularity than Debugbar, and it works for
API/JSON responses where Debugbar cannot inject its panel.

### Xdebug profiler

```ini
xdebug.mode=profile
xdebug.output_dir=/tmp/profiles
xdebug.start_with_request=trigger
```

Trigger with `?XDEBUG_TRIGGER=1`. Read the cachegrind output with QCacheGrind/KCacheGrind.

Xdebug's profiler is **very slow** — use it to find a hot function in a single request, not
to measure realistic timings.

### Blackfire / SPX

For production-safe profiling with low overhead. Blackfire is commercial; `php-spx` is a
free alternative that gives flame graphs:

```bash
# php-spx
SPX_ENABLED=1 SPX_UI_URI=/spx php artisan serve
```

## Load testing

Do this before launch, not after the incident.

### k6

```js
// k6/browse.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '2m', target: 50 },    // ramp
        { duration: '5m', target: 50 },    // sustain
        { duration: '2m', target: 200 },   // spike
        { duration: '3m', target: 200 },
        { duration: '2m', target: 0 },     // ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<500', 'p(99)<1500'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    const res = http.get(`${__ENV.BASE_URL}/invoices`);
    check(res, {
        'status 200': (r) => r.status === 200,
        'under 500ms': (r) => r.timings.duration < 500,
    });
    sleep(1);
}
```

```bash
k6 run -e BASE_URL=https://staging.example.com k6/browse.js
```

Test against **production-like data volumes**. A load test against 100 seeded rows tells
you about PHP, not about your indexes.

### Quick smoke tests

```bash
ab -n 1000 -c 50 https://example.com/
hey -n 1000 -c 50 https://example.com/
wrk -t4 -c100 -d30s https://example.com/
```

Useful for a fast sanity check. k6 is what you use for anything you will act on.

## Production monitoring

You cannot profile what you do not observe.

| Signal | Watch for |
|---|---|
| Response time p50 / p95 / p99 | p99 is where users notice |
| Error rate | Spikes correlate with deploys |
| Queries per request | Regression indicates a new N+1 |
| Slow query count | Trending up = data outgrew an index |
| Queue depth / oldest job age | Backpressure |
| Job failure rate | External dependency trouble |
| Cache hit rate | < 80% means the strategy is wrong |
| Memory / CPU per worker | Leaks, sizing |
| DB connections | Approaching `max_connections` |
| Core Web Vitals (field) | Real user experience |

Tooling: Laravel Pulse (first-party, lightweight), Sentry, New Relic, Datadog, or
Prometheus + Grafana. Configuration: `laravel-devops-deployment`.

```bash
composer require laravel/pulse
php artisan pulse:install && php artisan migrate
```

Pulse gives slow queries, slow jobs, slow requests, exceptions, and usage by user out of
the box, with low overhead. It is the right default for a Laravel app that does not already
have an APM.

## Assert performance in tests

The only way an optimisation stays fixed.

```php
it('renders the invoice list with a bounded number of queries', function (): void {
    Invoice::factory()->count(50)->for(Customer::factory())->create();

    DB::enableQueryLog();

    $this->actingAs($user)->get('/invoices')->assertOk();

    // A list page must not scale queries with row count
    expect(DB::getQueryLog())->toHaveCount(lessThan(12));
});
```

```php
// tests/Pest.php helper
function assertQueryCountUnder(int $max, Closure $callback): void
{
    DB::flushQueryLog();
    DB::enableQueryLog();

    $callback();

    $count = count(DB::getQueryLog());
    DB::disableQueryLog();

    expect($count)->toBeLessThan(
        $max,
        "Expected fewer than {$max} queries, got {$count}."
    );
}
```

Add this assertion to every list, index, and export endpoint. It catches the N+1 that a
future refactor reintroduces.

## The measurement discipline

1. **Reproduce** with realistic data volume
2. **Measure** — get a number before you change anything
3. **Find the actual bottleneck** — it is usually one query, not "the framework"
4. **Change one thing**
5. **Measure again** — confirm the improvement is real
6. **Add a test** that fails if it regresses

Skipping step 1 is the most common error: optimising against a 100-row seed produces
changes that do nothing, or make things worse, at a million rows.
