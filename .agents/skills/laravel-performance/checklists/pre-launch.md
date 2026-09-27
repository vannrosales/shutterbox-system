# Pre-launch performance readiness

Complete before the first production release, and re-run before any launch expected to
multiply traffic.

## 1. Realistic data

- [ ] Staging seeded to **projected 12-month volume**, not a demo dataset
- [ ] Largest tables identified and their expected growth rate documented
- [ ] Row counts recorded so future comparisons are meaningful

```bash
php artisan db:show --counts
```

Every check below is meaningless against a 100-row database.

## 2. Framework caches

- [ ] `php artisan config:cache` in the deploy script
- [ ] `php artisan route:cache`
- [ ] `php artisan view:cache`
- [ ] `php artisan event:cache`
- [ ] Verified no `env()` calls exist outside `config/`

```bash
grep -rn "env(" app/ routes/ database/ --include="*.php" | grep -v "config/"
```

Must return nothing.

## 3. OPcache

- [ ] Enabled with production settings
- [ ] `opcache.validate_timestamps=0` (reset on deploy instead)
- [ ] `opcache.memory_consumption` ≥ 256MB
- [ ] `opcache.max_accelerated_files` above the project's file count
- [ ] JIT considered (usually marginal for web workloads; measure)

```bash
php -i | grep -E "opcache.(enable|memory|max_acc|validate)"
```

## 4. Database

- [ ] Every foreign key has an index
- [ ] Every column used in WHERE / ORDER BY / JOIN on a large table is indexed
- [ ] Composite index column order verified against real queries
- [ ] Slow query log enabled with `long_query_time = 0.5`
- [ ] `EXPLAIN` run on the ten most frequent queries
- [ ] Connection pool sized: `max_connections` ≥ (workers + web processes) × margin
- [ ] Read replica configured if read-heavy

Full schema review: `laravel-database-scale/checklists/`.

## 5. Cache and Redis

- [ ] Cache driver is `redis` (not `file` — `file` breaks behind a load balancer)
- [ ] Session driver is `redis` or `database`
- [ ] `maxmemory` and `maxmemory-policy` set
- [ ] Queue data is **not** in a database subject to `allkeys-lru` eviction
- [ ] Cache hit rate measured under load

## 6. Queues

- [ ] Workers supervised (Supervisor/systemd/Horizon) and restart on failure
- [ ] Queues separated by priority
- [ ] Worker count sized against expected job volume
- [ ] `queue:restart` in the deploy script
- [ ] Failed-job pruning scheduled
- [ ] Alerting on queue depth and oldest-job age

## 7. Load test

- [ ] k6 (or equivalent) run at expected peak and 3× peak
- [ ] p95 < 500ms, p99 < 1500ms at expected peak
- [ ] Error rate < 1%
- [ ] Identified the first bottleneck to appear under 3× load
- [ ] Database connection count stays within limits under load
- [ ] Memory stable — no leak over a sustained run

## 8. Frontend

- [ ] `npm run build` — production assets, no sourcemaps
- [ ] Bundle sizes within budget
- [ ] Lighthouse ≥ 90 performance on key pages
- [ ] Core Web Vitals within targets on a throttled mid-range mobile profile
- [ ] Brotli/gzip enabled
- [ ] Static assets on a CDN, or at least served with long cache headers
- [ ] No sourcemaps or `.env` reachable from the web root

```bash
curl -I https://example.com/.env          # must be 403/404
curl -I https://example.com/build/assets/app-*.js | grep -i cache-control
```

## 9. Monitoring in place before launch

- [ ] APM or Pulse installed and reporting
- [ ] Slow query logging routed somewhere someone will look
- [ ] Error tracking (Sentry or equivalent)
- [ ] Uptime monitoring on `/up`
- [ ] Alert thresholds defined for: p95 response time, error rate, queue depth, disk,
      memory, DB connections
- [ ] Someone is on the receiving end of those alerts

## 10. Capacity and limits

- [ ] `per_page` capped
- [ ] Upload size limits set in PHP, the web server, **and** validation
- [ ] Rate limits on authentication, search, exports, and write endpoints
- [ ] Timeouts set: PHP `max_execution_time`, FPM `request_terminate_timeout`,
      Nginx `proxy_read_timeout`, HTTP client timeouts
- [ ] Graceful behaviour when the queue backs up (shed load with a clear message)

## 11. Baselines recorded

Record these so a future regression is provable:

| Metric | Value at launch |
|---|---|
| Home page — queries / TTFB | |
| Main list page — queries / TTFB | |
| Heaviest report — duration | |
| p95 response time under expected load | |
| JS / CSS bundle size | |
| Lighthouse performance score | |
| Largest table row count | |

## Sign-off

- [ ] All blocking items resolved
- [ ] Known limitations documented with owners
- [ ] Rollback plan tested (`laravel-devops-deployment`)

Signed: _______________  Date: _______________
