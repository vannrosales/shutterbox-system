# Observability

You cannot operate what you cannot see. Three pillars: logs, metrics, traces — plus the
alerting that turns them into action.

## Logging

```php
// config/logging.php
'channels' => [
    'stack' => [
        'driver'            => 'stack',
        'channels'          => ['daily', 'sentry'],
        'ignore_exceptions' => false,
    ],

    'daily' => [
        'driver' => 'daily',
        'path'   => storage_path('logs/laravel.log'),
        'level'  => env('LOG_LEVEL', 'warning'),
        'days'   => 14,
        'replace_placeholders' => true,
    ],

    // Containers: log to stdout, let the platform collect it
    'stderr' => [
        'driver'    => 'monolog',
        'handler'   => StreamHandler::class,
        'formatter' => JsonFormatter::class,       // structured, machine-parseable
        'with'      => ['stream' => 'php://stderr'],
    ],

    'security'    => ['driver' => 'daily', 'path' => storage_path('logs/security.log'),    'days' => 90],
    'performance' => ['driver' => 'daily', 'path' => storage_path('logs/performance.log'), 'days' => 14],
],
```

`LOG_LEVEL=debug` in production fills the disk within days. `warning` is the right default;
raise it temporarily when investigating.

### Structured logs, correlated

```php
// Middleware — assign a request id early
Context::add([
    'request_id' => $request->header('X-Request-Id') ?: (string) Str::ulid(),
    'user_id'    => $request->user()?->id,
    'tenant_id'  => Context::get('tenant_id'),
]);
```

```php
Log::info('Invoice refunded', [
    'invoice_id'   => $invoice->id,
    'amount_minor' => $amount->minorUnits,
]);
```

Laravel's `Context` automatically merges into every log line **and propagates into queued
jobs** — so a job's logs carry the request id of the HTTP request that dispatched it. That
one feature turns "find everything related to this user's complaint" from an afternoon into
a single query.

### What to log

| Level | Use |
|---|---|
| `emergency` / `alert` | System unusable; wake someone |
| `critical` | Data loss risk, payment failure |
| `error` | Unhandled exception, failed job |
| `warning` | Slow query, rate limit hit, deprecated API use |
| `info` | Business events: order placed, refund issued |
| `debug` | Development only |

**Never log:** passwords (including failed attempts — a typo is often a real password for
another account), tokens, full card numbers, session ids, raw PII. See `laravel-security`.

```php
// bootstrap/app.php
$exceptions->dontFlash(['password', 'password_confirmation', 'current_password', 'token']);
```

Configure your error tracker to scrub too — Sentry and Bugsnag capture request bodies by
default.

## Metrics

### Laravel Pulse — the right default

```bash
composer require laravel/pulse
php artisan pulse:install && php artisan migrate
```

Gives, out of the box: slow queries, slow jobs, slow requests, slow outgoing requests,
exceptions, cache hit rate, queue throughput, and usage by user. Low overhead, first-party,
no external service.

```php
// AppServiceProvider — gate the dashboard
Gate::define('viewPulse', fn (User $user): bool => $user->isAdmin());
```

```php
Schedule::command('pulse:trim')->everyFifteenMinutes();
```

Without trimming, the Pulse tables grow without bound.

### Prometheus + Grafana

For infrastructure metrics alongside application ones.

```php
Route::get('/metrics', function (): Response {
    $lines = [
        '# TYPE laravel_queue_size gauge',
        'laravel_queue_size{queue="default"} '.Queue::size('default'),
        'laravel_queue_size{queue="high"} '.Queue::size('high'),
        '# TYPE laravel_failed_jobs gauge',
        'laravel_failed_jobs '.DB::table('failed_jobs')->count(),
    ];

    return response(implode("\n", $lines)."\n", 200, ['Content-Type' => 'text/plain']);
})->middleware('auth.metrics');           // never public
```

Node exporter for CPU/memory/disk, mysqld_exporter, redis_exporter, nginx_exporter.

### APM

| Tool | Notes |
|---|---|
| **Sentry** | Errors + performance; excellent Laravel integration; generous free tier |
| **New Relic** | Deep transaction traces; expensive |
| **Datadog** | Full-stack; expensive |
| **Bugsnag** | Errors; simpler than Sentry |
| **Pulse** | First-party, self-hosted, free |

Pulse + Sentry covers most projects. Add a full APM when the questions you cannot answer
justify the cost.

```php
// config/sentry.php
'traces_sample_rate' => env('SENTRY_TRACES_SAMPLE_RATE', 0.1),   // 10% of transactions
'send_default_pii'   => false,                                     // scrub by default

'before_send' => function (Event $event): ?Event {
    // Strip authorization headers, cookies, password fields
    return $event;
},
```

## Alerting

| Signal | Threshold | Severity |
|---|---|---|
| `/up` failing | 2 consecutive checks | Critical |
| Error rate | > 2× baseline for 5 min | High |
| p95 response time | > 1s for 10 min | Medium |
| Queue depth | > 10,000 | High |
| Oldest job age | > 15 min | High |
| Failed jobs | Any increase | Medium |
| Disk usage | > 80% | High |
| Memory | > 85% sustained | Medium |
| DB connections | > 80% of `max_connections` | High |
| Certificate expiry | < 14 days | High |
| Backup age | > 26 hours | Critical |
| Failed logins | Spike over baseline | Security |
| 429 rate | Sudden increase | Security |

```php
Schedule::call(function (): void {
    if (Queue::size('default') > 10_000) {
        Notification::route('slack', config('services.slack.ops'))
            ->notify(new QueueBackedUp(Queue::size('default')));
    }
})->everyFiveMinutes();
```

**Alert fatigue is the failure mode.** Every alert must be actionable and must have a
runbook entry. An alert that fires daily and is always ignored is worse than no alert — it
trains people to ignore the channel.

Review alerts quarterly: delete the ones nobody acts on, add the ones an incident revealed
were missing.

## Uptime monitoring

External, so it still reports when your infrastructure is down: Better Stack, Pingdom,
UptimeRobot, or Healthchecks.io.

- Hit `/up`, not the home page (the home page might be cached at the CDN)
- Check from at least two regions
- Alert after two consecutive failures, not one — a single blip is noise
- Also monitor: certificate expiry, DNS resolution, and a critical user journey

### Scheduled-job monitoring

```php
Schedule::command('backup:run')
    ->dailyAt('01:00')
    ->thenPing('https://hc-ping.com/your-uuid');
```

Dead-man's-switch monitoring: the monitor alerts when the ping **stops arriving**. A cron
that silently stopped running is invisible to every other kind of monitoring.

Apply it to: backups, billing runs, report generation, data syncs — anything whose absence
is not immediately obvious.

## Tracing

```php
// Sentry performance
\Sentry\startTransaction(...);
```

Distributed tracing (OpenTelemetry) is worth it when a request crosses several services.
For a monolith, Pulse's slow-request and slow-query views usually answer the same questions
at a fraction of the setup cost.

## Log aggregation

For more than one server, centralise:

| Stack | Notes |
|---|---|
| Grafana Loki + Promtail | Lightweight, pairs with Grafana |
| ELK (Elasticsearch/Logstash/Kibana) | Powerful, resource-hungry |
| Better Stack / Papertrail | Managed, quick to start |
| CloudWatch / Stackdriver | If already on that cloud |

```php
// JSON logs are essential for aggregation — grep does not scale
'formatter' => Monolog\Formatter\JsonFormatter::class,
```

Ship stdout in containers; ship files with Promtail/Filebeat on a VPS.

## Dashboards worth building

**Operational** (checked daily):
- Request rate, error rate, p50/p95/p99 latency
- Queue depth and oldest job age
- Failed jobs
- CPU, memory, disk per host

**Business** (checked weekly):
- Signups, active users
- Orders, revenue
- Conversion through the critical funnel

**Incident** (opened during an outage):
- Error rate by endpoint
- Slow queries, right now
- Recent deploys overlaid on the error timeline

That last overlay answers "did we cause this?" in seconds, which is usually the first
question.

## Debugging production safely

```bash
php artisan pulse:check          # Pulse dashboard
tail -f storage/logs/laravel.log | jq .
php artisan queue:failed
php artisan horizon:status
mysql -e "SHOW PROCESSLIST"
redis-cli --stat
```

**Never** enable `APP_DEBUG=true` in production to investigate. It exposes environment
variables, database credentials, and full stack traces to anyone who triggers an error.
Raise `LOG_LEVEL` temporarily instead, or reproduce in staging.
