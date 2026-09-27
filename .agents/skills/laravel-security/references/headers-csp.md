# Security headers and CSP

## The header set

| Header | Value | Protects against |
|---|---|---|
| `Content-Security-Policy` | see below | XSS, injection, data exfiltration |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Protocol downgrade, SSL stripping |
| `X-Content-Type-Options` | `nosniff` | MIME confusion attacks |
| `X-Frame-Options` | `DENY` (or CSP `frame-ancestors`) | Clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | URL leakage to third parties |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | Unwanted feature access |
| `Cross-Origin-Opener-Policy` | `same-origin` | Cross-window attacks |
| `Cross-Origin-Resource-Policy` | `same-origin` | Cross-origin resource reads |

Verify what you actually ship:

```bash
curl -sI https://example.com | grep -iE 'content-security|strict-transport|x-frame|x-content|referrer|permissions'
```

Or use an external scanner (securityheaders.com, Mozilla Observatory).

## Content Security Policy

CSP without `unsafe-inline` is the strongest XSS mitigation available — even if an attacker
injects a `<script>` tag, the browser refuses to run it.

### Nonce-based policy

```php
final class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        // One nonce per request. Must be unpredictable.
        $nonce = base64_encode(random_bytes(16));
        $request->attributes->set('csp_nonce', $nonce);
        View::share('cspNonce', $nonce);

        $response = $next($request);

        $response->headers->set('Content-Security-Policy', $this->policy($nonce));

        return $response;
    }

    private function policy(string $nonce): string
    {
        return collect([
            "default-src 'self'",
            "script-src 'self' 'nonce-{$nonce}' 'strict-dynamic'",
            "style-src 'self' 'nonce-{$nonce}'",
            "img-src 'self' data: https://cdn.example.com",
            "font-src 'self'",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "upgrade-insecure-requests",
        ])->implode('; ');
    }
}
```

```blade
<script nonce="{{ $cspNonce }}">
    // inline script the CSP will allow
</script>
```

Key directives:
- `'strict-dynamic'` — scripts loaded by a nonce-approved script are also trusted. This is
  what makes bundlers work without listing every CDN.
- `object-src 'none'` — kills Flash/plugin-based bypasses.
- `base-uri 'self'` — prevents `<base>` injection redirecting relative URLs.
- `form-action 'self'` — prevents injected forms posting credentials elsewhere.
- `frame-ancestors 'none'` — the modern replacement for `X-Frame-Options`; keep both for
  older browsers.

### Rolling it out without breaking the site

Start in report-only mode and collect violations:

```php
$response->headers->set('Content-Security-Policy-Report-Only', $this->policy($nonce).'; report-uri /csp-report');
```

```php
Route::post('/csp-report', function (Request $request): Response {
    Log::channel('security')->info('CSP violation', $request->json()->all());
    return response()->noContent();
})->withoutMiddleware([VerifyCsrfToken::class]);
```

Run report-only for a week, fix what legitimately breaks, then enforce. Rate-limit the
report endpoint — it is unauthenticated and can be flooded.

### Vite and CSP

```php
// AppServiceProvider::boot()
Vite::useCspNonce();     // Laravel injects the nonce into @vite tags
```

In development, Vite's HMR client needs `connect-src` to include the dev server:

```php
if (app()->isLocal()) {
    $directives[] = "connect-src 'self' ws://localhost:5173 http://localhost:5173";
}
```

### The `unsafe-inline` trap

A CSP containing `script-src 'unsafe-inline'` provides essentially no XSS protection. If
the codebase has many inline handlers (`onclick=`), the CSP work is a refactor, not a
header change. Do the refactor — it also improves the code.

Note: when both a nonce and `'unsafe-inline'` are present, browsers ignore
`'unsafe-inline'`. That is a useful transition strategy: add nonces first, keep
`'unsafe-inline'` for older browsers, and modern browsers get the strict policy.

## HSTS

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

- Only send over HTTPS.
- `includeSubDomains` applies to **every** subdomain — confirm they all have valid TLS
  before adding it.
- `preload` submits to the browser preload list. It is very hard to reverse — do not add it
  until HTTPS is stable and permanent.
- Start with `max-age=300` to verify nothing breaks, then raise it.

Force HTTPS in the application too:

```php
// AppServiceProvider::boot()
if ($this->app->isProduction()) {
    URL::forceScheme('https');
}
```

Behind a load balancer, trust the proxy or every generated URL will be `http`:

```php
// bootstrap/app.php
->withMiddleware(function (Middleware $middleware): void {
    $middleware->trustProxies(at: '*', headers:
        Request::HEADER_X_FORWARDED_FOR |
        Request::HEADER_X_FORWARDED_HOST |
        Request::HEADER_X_FORWARDED_PORT |
        Request::HEADER_X_FORWARDED_PROTO
    );
})
```

`at: '*'` is acceptable only when your load balancer is the sole ingress. If requests can
reach the app directly, specify the proxy IP ranges — otherwise a client can spoof
`X-Forwarded-For` and defeat IP-based rate limiting.

## CORS

```php
// config/cors.php
return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],

    // ✗ NEVER with supports_credentials
    // 'allowed_origins' => ['*'],

    'allowed_origins' => [
        env('FRONTEND_URL', 'https://app.example.com'),
    ],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['Content-Type', 'X-Requested-With', 'Authorization', 'X-XSRF-TOKEN'],
    'exposed_headers' => [],
    'max_age' => 3600,
    'supports_credentials' => true,
];
```

`allowed_origins: ['*']` with `supports_credentials: true` is rejected by browsers, but the
combination signals a misunderstanding — with credentials, the origin must be explicit.

CORS is **not** an access control. It restricts what browsers allow a page to read; it does
nothing against a direct request from curl or a server. Authorization still applies.

## CSRF

Laravel handles this by default. What to check:

```php
// bootstrap/app.php — exclusions must be justified
$middleware->validateCsrfTokens(except: [
    'webhooks/stripe',      // verified by signature instead
    'webhooks/paymongo',
]);
```

Every exclusion needs an alternative verification — for webhooks, a signature check:

```php
$expected = hash_hmac('sha256', $request->getContent(), config('services.stripe.webhook_secret'));
abort_unless(hash_equals($expected, $request->header('Stripe-Signature', '')), 401);
```

Rules:
- `@csrf` in every form
- `X-CSRF-TOKEN` header for AJAX (Laravel's Axios setup does this)
- **Never use GET for state changes.** A logout link over GET is CSRF-able.
- SPA + Sanctum: use the cookie-based flow (`/sanctum/csrf-cookie`), which keeps CSRF
  protection intact

## Clickjacking

```php
'X-Frame-Options' => 'DENY'
```

plus CSP `frame-ancestors 'none'`. If the app must be embeddable:

```
Content-Security-Policy: frame-ancestors 'self' https://partner.example.com
```

Never `ALLOW-FROM` — it is deprecated and unsupported in modern browsers.

## Cookies

```php
Cookie::make('preference', $value, 60, secure: true, httpOnly: true, sameSite: 'lax');
```

- `secure` — HTTPS only
- `httpOnly` — for anything the client does not need to read
- `sameSite` — `lax` default, `strict` for admin, `none` only with `secure`
- Laravel encrypts cookies by default; exclusions go in `EncryptCookies::$except` and need
  a reason
- Prefix sensitive cookies with `__Host-` where the constraints allow it (requires
  `secure`, no `domain`, path `/`)

## Testing headers

```php
it('sends the expected security headers', function (): void {
    $response = $this->get('/');

    $response->assertHeader('X-Content-Type-Options', 'nosniff');
    $response->assertHeader('X-Frame-Options', 'DENY');
    $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    expect($response->headers->get('Content-Security-Policy'))
        ->toContain("default-src 'self'")
        ->not->toContain("'unsafe-inline'")
        ->not->toContain("'unsafe-eval'");
});

it('sets a unique CSP nonce per request', function (): void {
    $a = $this->get('/')->headers->get('Content-Security-Policy');
    $b = $this->get('/')->headers->get('Content-Security-Policy');

    expect($a)->not->toBe($b);
});
```

A predictable or reused nonce defeats the entire policy — test for it.
