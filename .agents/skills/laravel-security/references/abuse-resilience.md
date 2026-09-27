# Abuse resilience

## What application code can and cannot do

Be precise about this, because overclaiming leads to unprotected systems.

| Attack | Application rate limiting helps? |
|---|---|
| Credential stuffing | **Yes** — this is exactly what it is for |
| Scraping / enumeration | **Yes** |
| Expensive-query abuse (`?per_page=999999`) | **Yes** |
| Business-logic abuse (coupon farming, mass signup) | **Yes** |
| Layer-7 HTTP flood | Partially — the request still reaches PHP |
| Volumetric (L3/L4) flood | **No** — the traffic never reaches your application |
| Amplification/reflection | **No** |

`throttle:60,1` does not provide DDoS protection. It provides abuse control. Saying so
plainly is the difference between a system that survives and one whose owners believed it
was protected.

## The layered model

```
                    ┌─────────────────────────────────┐
   Volumetric  ───▶ │ 1. Anycast CDN / scrubbing      │  absorbs before your network
                    ├─────────────────────────────────┤
   Exploits    ───▶ │ 2. WAF                          │  known patterns, bot scoring
                    ├─────────────────────────────────┤
   Floods      ───▶ │ 3. Reverse proxy limits (Nginx) │  cheap, before PHP boots
                    ├─────────────────────────────────┤
   Abuse       ───▶ │ 4. Application rate limiting    │  business-aware
                    ├─────────────────────────────────┤
   Load        ───▶ │ 5. Caching                      │  reduces cost of what gets through
                    ├─────────────────────────────────┤
   Bursts      ───▶ │ 6. Autoscaling + queue          │  absorb, degrade gracefully
                    ├─────────────────────────────────┤
   Everything  ───▶ │ 7. Monitoring + runbook         │  detect and respond
                    └─────────────────────────────────┘
```

Each layer handles what the layers above cannot. Skipping layer 1 means layers 3–6 are
fighting traffic that should never have arrived.

## Layer 1 — edge

Cloudflare, Fastly, AWS Shield/CloudFront, Azure Front Door. What you get:

- Volumetric absorption across a large anycast network
- Bot management and challenge pages
- Caching of static and cacheable responses at the edge
- Origin IP concealment

**Critical:** lock the origin down so it only accepts traffic from the edge. Otherwise an
attacker who discovers the origin IP bypasses every protection you paid for.

```nginx
# Only accept traffic from the CDN
allow 173.245.48.0/20;
# ... full published range ...
deny all;

# And restore the real client IP, or every request looks like it came from the CDN
set_real_ip_from 173.245.48.0/20;
real_ip_header CF-Connecting-IP;
```

Without `set_real_ip_from`, your application-level rate limiting sees one IP for all
traffic and either blocks everyone or nobody.

## Layer 2 — WAF

Blocks known exploit patterns before they reach the application. Useful, but:

- It is a **supplement**, never a substitute for fixing the vulnerability
- False positives will block legitimate users — tune in log-only mode first
- Attackers who know a WAF is present will encode around generic rules

Run in detection mode, review what it would have blocked, then enforce.

## Layer 3 — reverse proxy

Cheap because it rejects before PHP-FPM is involved.

```nginx
# Zones: 10MB holds ~160k IPs
limit_req_zone  $binary_remote_addr zone=general:10m rate=30r/s;
limit_req_zone  $binary_remote_addr zone=login:10m   rate=2r/m;
limit_conn_zone $binary_remote_addr zone=conns:10m;

server {
    limit_req  zone=general burst=50 nodelay;
    limit_conn conns 20;

    location = /login {
        limit_req zone=login burst=3 nodelay;
        # ... fastcgi_pass ...
    }

    # Bound request size and slow-client exposure
    client_max_body_size    10m;
    client_body_timeout     10s;
    client_header_timeout   10s;
    send_timeout            10s;
    keepalive_timeout       30s;

    limit_req_status 429;
}
```

`client_body_timeout` and `client_header_timeout` are the Slowloris defence — without them
a handful of connections can exhaust worker slots.

Full server configuration: `laravel-devops-deployment`.

## Layer 4 — application rate limiting

This is where business logic lives, and where the edge cannot help.

```php
// AppServiceProvider::boot()

// Per-user where authenticated, per-IP otherwise
RateLimiter::for('api', fn (Request $r) =>
    Limit::perMinute(60)->by($r->user()?->id ?: $r->ip())
);

// Login: two limits, because they defend different attacks
RateLimiter::for('login', fn (Request $r) => [
    Limit::perMinute(5)->by($r->input('email').'|'.$r->ip()),   // brute force one account
    Limit::perMinute(20)->by($r->ip()),                          // stuffing many accounts
]);

// Expensive operations get their own, much lower, limit
RateLimiter::for('export', fn (Request $r) =>
    Limit::perHour(5)->by($r->user()->id)
        ->response(fn () => response()->json([
            'message' => __('Export limit reached. Try again in an hour.'),
        ], 429))
);

RateLimiter::for('search', fn (Request $r) => Limit::perMinute(30)->by($r->user()?->id ?: $r->ip()));

// Tiered by plan
RateLimiter::for('api-tiered', function (Request $r): Limit {
    return match ($r->user()?->plan) {
        'enterprise' => Limit::perMinute(1000),
        'pro'        => Limit::perMinute(300),
        default      => Limit::perMinute(60),
    };
});
```

```php
Route::middleware('throttle:api')->group(/* ... */);
```

### Business-action limits

Route-level limits miss the abuse that matters most.

```php
// Not "60 requests/min" but "3 password resets per account per hour"
if (RateLimiter::tooManyAttempts("password-reset:{$user->id}", 3)) {
    throw ValidationException::withMessages([
        'email' => __('Too many reset requests. Try again later.'),
    ]);
}

RateLimiter::hit("password-reset:{$user->id}", 3600);
```

Apply to: password resets, MFA attempts, invitations, refunds, coupon redemptions, account
creation per IP, message sending, report generation.

### Cost-based limiting

Not every request costs the same.

```php
RateLimiter::for('reports', function (Request $request): Limit {
    $days = $request->date('to')->diffInDays($request->date('from'));
    $cost = max(1, (int) ceil($days / 30));      // a 12-month report costs 12 units

    return Limit::perHour(50)->by($request->user()->id.':'.$cost);
});
```

## Layer 5 — caching

Every cached response is a request that costs nothing.

```php
Route::middleware('cache.headers:public;max_age=300')->group(/* public pages */);
```

Full-page caching at the CDN or in Nginx (`fastcgi_cache`) means a flood of anonymous
traffic never reaches PHP at all. This is often the single most effective L7 mitigation
available. See `laravel-performance` and `laravel-devops-deployment`.

## Layer 6 — graceful degradation

When the system is under strain, shed load deliberately rather than falling over.

```php
final class ShedLoadWhenSaturated
{
    public function handle(Request $request, Closure $next): Response
    {
        if (Queue::size('default') > 50_000) {
            return response()->json([
                'message' => __('We are experiencing heavy load. Please try again shortly.'),
            ], 503, ['Retry-After' => 120]);
        }

        return $next($request);
    }
}
```

Also:
- Feature flags to disable expensive features under load
- A read-only mode that keeps the site browsable when writes must stop
- A static maintenance page served by the CDN, not the application

```php
php artisan down --render="errors::503" --retry=60 --secret="known-token"
```

## Layer 7 — detection and response

You cannot respond to what you do not see.

```php
// Log rate-limit hits — a spike is the earliest signal of an attack
Event::listen(function (RateLimited $event): void {
    Log::channel('security')->warning('Rate limit hit', [
        'key' => $event->key,
        'ip'  => request()->ip(),
    ]);
});
```

Alert on:

| Signal | Threshold |
|---|---|
| 429 rate | Sudden increase over baseline |
| 4xx rate | Sudden increase (probing) |
| Failed logins | Spike, or many accounts from one IP |
| Authorization denials | Spike from one actor |
| p95 response time | Above target |
| Queue depth | Above capacity |
| PHP-FPM active children | Approaching `pm.max_children` |
| DB connections | Approaching `max_connections` |
| Bandwidth | Sudden multiple of baseline |

### Runbook — write it before you need it

1. **Confirm** — attack, traffic spike, or a bug? Check error rate vs request rate.
2. **Identify** — source IPs/ASNs, targeted paths, request signature.
3. **Mitigate at the highest layer available** — CDN "under attack" mode, WAF rule, then
   proxy/application limits.
4. **Preserve service** — enable caching aggressively, disable expensive features, scale
   out.
5. **Communicate** — status page, support team.
6. **Record** — what happened, what worked, what was missing.
7. **Harden** — turn the finding into a permanent control.

Keep it in the repository. A runbook nobody can find at 3am is not a runbook.

## Input caps — the cheapest control

Most application-level resource exhaustion is a missing `max:` rule.

```php
'per_page'   => ['integer', 'min:1', 'max:100'],
'ids'        => ['array', 'max:100'],
'ids.*'      => ['integer'],
'query'      => ['string', 'max:100'],
'date_from'  => ['date', 'after:'.now()->subYears(2)->toDateString()],
'file'       => ['file', 'max:10240'],
'items'      => ['array', 'max:500'],
'depth'      => ['integer', 'max:3'],           // nested include depth
```

Also cap at the infrastructure level so a bug cannot bypass validation:

```ini
; php.ini
post_max_size = 12M
upload_max_filesize = 10M
max_input_vars = 1000
max_execution_time = 30
memory_limit = 256M
```

`max_input_vars` in particular: without it, a POST with 500,000 fields is a cheap
denial-of-service.

## GraphQL / deep-include caution

If the API supports client-specified includes or nesting, cap the depth and complexity.
`?include=a.b.c.d.e.f` can generate an exponential query load from a single request. See
`laravel-api-standards`.
