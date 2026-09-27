---
name: laravel-security
description: Use when handling user input, authentication, authorization, file uploads, sessions, cookies, secrets, external requests, raw SQL, or any code touching money, PII, or admin capability. Enforces defence against SQL injection, XSS, CSRF, IDOR, mass assignment, broken authz, session attacks, path traversal, SSRF, insecure deserialization, and dependency vulnerabilities. Covers security headers, CSP, rate limiting, audit logging, secrets management, and layered resilience against abusive traffic. Triggers on "security", "auth", "permission", "vulnerability", "XSS", "injection", "CSRF", "upload", "token", "password", "encrypt", "admin", or any input-handling code.
---

# Enterprise Security

Security is applied at the point code is written, not in a pre-launch audit. Every item
below maps to a specific attack that has taken down real Laravel applications.

## The seven rules

1. **Never trust input.** Validate on the server, always, even when the client validates
   too. Whitelist what is allowed; do not blacklist what is not.
2. **Authorize every object access.** Being logged in is not permission to see record 42.
3. **Escape on output, in the right context.** HTML, attribute, JavaScript, URL, and SQL
   each escape differently.
4. **Fail closed.** An error, a missing policy, an unknown state → deny.
5. **Least privilege.** Database users, API tokens, file permissions, storage disks, IAM
   roles.
6. **Defence in depth.** Assume any single control fails.
7. **Log security events.** You cannot investigate what you did not record.

## Input — validation is the first control

```php
// ✓ Every field explicitly typed and bounded
public function rules(): array
{
    return [
        'email'    => ['required', 'email:rfc,dns', 'max:255'],
        'age'      => ['required', 'integer', 'between:13,120'],
        'role'     => ['required', Rule::enum(Role::class)->except(Role::SuperAdmin)],
        'tags'     => ['array', 'max:20'],
        'tags.*'   => ['string', 'max:50', Rule::exists('tags', 'name')],
        'per_page' => ['integer', 'min:1', 'max:100'],
    ];
}
```

Rules:
- Never `$request->all()` into a model. Use `$request->validated()`, or a DTO.
- Every array input needs a `max:` — otherwise one request can allocate unbounded memory.
- Every string needs a `max:`.
- Fixed sets use `Rule::enum()` or `Rule::in()`, never free text.
- `Rule::enum(Role::class)->except(Role::SuperAdmin)` — privilege escalation is a
  validation problem before it is an authorization problem.

**Mass assignment:**

```php
// ✗ Every column is now settable from a request, including is_admin
protected $guarded = [];

// ✓ Explicit allow-list
protected $fillable = ['name', 'email', 'bio'];
```

`$guarded = []` combined with `Model::create($request->all())` is how ordinary users become
administrators. Enable `Model::preventSilentlyDiscardingAttributes()` so unexpected keys
throw in development.

## Authorization — the IDOR defence

```php
// ✗ Any authenticated user can read any invoice
public function show(int $id)
{
    return InvoiceResource::make(Invoice::findOrFail($id));
}

// ✓ Route-model binding + policy + tenant scope
public function show(Invoice $invoice)
{
    $this->authorize('view', $invoice);

    return InvoiceResource::make($invoice);
}
```

```php
final class InvoicePolicy
{
    public function view(User $user, Invoice $invoice): Response
    {
        return $user->tenant_id === $invoice->tenant_id
            ? Response::allow()
            : Response::denyAsNotFound();   // 404, not 403
    }
}
```

`denyAsNotFound()` matters: a 403 on another tenant's record **confirms it exists**. That is
an enumeration oracle. Return 404.

Nested resources need scoped bindings, or the child is reachable through any parent:

```php
Route::get('/teams/{team}/invoices/{invoice}', ...)->scopeBindings();
```

For multi-tenant apps, a global scope makes forgetting the filter impossible — but the
policy check is still required, because the scope does not protect against a user querying
their *own* tenant's records they should not see.

## Output — escaping by context

```blade
{{ $userInput }}                              {{-- ✓ HTML-escaped --}}
{!! $userInput !!}                            {{-- ✗ raw — XSS unless sanitised --}}

<div title="{{ $userInput }}">                {{-- ✓ attribute, quoted --}}
<div title={{ $userInput }}>                  {{-- ✗ unquoted attribute --}}

<a href="{{ $url }}">                         {{-- ✗ javascript: URLs still execute --}}
<a href="{{ Str::startsWith($url, ['http://','https://']) ? $url : '#' }}">   {{-- ✓ --}}

<script>const d = @json($data);</script>      {{-- ✓ JSON-encoded for JS context --}}
<script>const d = "{{ $data }}";</script>     {{-- ✗ wrong escaping for this context --}}
```

If you must render user HTML (a rich-text field), sanitise it server-side with an
allow-list library (`mews/purifier`, `symfony/html-sanitizer`) before storage or on output.
Blade's escaping is not a sanitiser.

## SQL — the two injection points that survive Eloquent

Eloquent parameterises `where()`. These do not:

```php
// ✗ Injection
DB::select("SELECT * FROM orders WHERE tenant_id = {$id}");
Order::orderByRaw($request->input('sort'));
Order::whereRaw("status = '{$status}'");

// ✓ Bindings
DB::select('SELECT * FROM orders WHERE tenant_id = ?', [$id]);
Order::whereRaw('status = ?', [$status]);

// ✓ Column and direction cannot be parameterised — whitelist them
$column = in_array($request->input('sort'), ['created_at', 'total', 'status'], true)
    ? $request->input('sort') : 'created_at';
$direction = $request->input('direction') === 'asc' ? 'asc' : 'desc';

Order::orderBy($column, $direction);
```

`orderByRaw` and `selectRaw` with request input are the most common real injections in
otherwise-safe Laravel codebases.

## Authentication

```php
// config/auth.php + AppServiceProvider
Password::defaults(fn () => Password::min(12)->uncompromised());
```

- Bcrypt or Argon2id (Laravel's default hashing is correct — do not replace it)
- Minimum 12 characters; check against breach corpora with `uncompromised()`
- **No composition rules** (forced symbols/numbers) — they reduce entropy in practice
- Rate limit login by **email + IP**, not IP alone
- Generic failure message — never "no such user" vs "wrong password"
- MFA for admin and any privileged role
- Regenerate the session on login (Laravel does this; do not bypass it)
- Invalidate other sessions on password change
- Password reset tokens: single-use, short-lived, and the reset must not reveal whether the
  address exists

```php
// AppServiceProvider::boot()
RateLimiter::for('login', fn (Request $r) => [
    Limit::perMinute(5)->by($r->input('email').'|'.$r->ip()),
    Limit::perMinute(20)->by($r->ip()),
]);
```

## Sessions and cookies

```php
// config/session.php
'driver'         => 'redis',        // not 'file' behind a load balancer
'lifetime'       => 120,
'expire_on_close'=> false,
'encrypt'        => true,
'secure'         => true,           // HTTPS only
'http_only'      => true,           // no JS access
'same_site'      => 'lax',          // 'strict' for admin panels
```

`SESSION_SECURE_COOKIE=true` in production is not optional — without it the session cookie
travels over plaintext on any HTTP request.

## File uploads

```php
'document' => [
    'required',
    'file',
    'max:10240',                                       // KB — and set PHP/Nginx limits too
    'mimetypes:application/pdf,image/jpeg,image/png',  // sniffs content, not the extension
    'extensions:pdf,jpg,jpeg,png',
],
```

- `mimetypes` (content sniffing), **not** `mimes` (extension only)
- Never use the client-supplied filename — generate one:
  `Str::ulid().'.'.$file->extension()`
- Store **outside** the web root: `storage/app/private`, or object storage
- Serve through a controller that authorizes, or via a short-lived signed URL
- Strip EXIF from images (GPS coordinates are PII)
- Never `move_uploaded_file` into a public directory with a user-controlled name

Full pipeline: `laravel-media-management`.

## Security headers and CSP

```php
final class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->add([
            'X-Content-Type-Options'    => 'nosniff',
            'X-Frame-Options'           => 'DENY',
            'Referrer-Policy'           => 'strict-origin-when-cross-origin',
            'Permissions-Policy'        => 'geolocation=(), microphone=(), camera=()',
            'Strict-Transport-Security' => 'max-age=31536000; includeSubDomains; preload',
            'Content-Security-Policy'   => $this->csp($request),
        ]);

        return $response;
    }
}
```

A CSP without `unsafe-inline` is the strongest single XSS mitigation available. It requires
nonces on inline scripts — the full implementation is in
`templates/SecurityHeaders.php.stub`.

## Rate limiting and abuse resilience

```php
RateLimiter::for('api',    fn (Request $r) => Limit::perMinute(60)->by($r->user()?->id ?: $r->ip()));
RateLimiter::for('search', fn (Request $r) => Limit::perMinute(30)->by($r->user()?->id ?: $r->ip()));
RateLimiter::for('export', fn (Request $r) => Limit::perHour(5)->by($r->user()->id));
```

**On DDoS, stated honestly:** application-level rate limiting cannot stop a volumetric
attack — the traffic still reaches your server. Real resilience is layered:

| Layer | Handles |
|---|---|
| CDN / anycast edge (Cloudflare, Fastly) | Volumetric floods, absorbs before origin |
| WAF | Known exploit patterns, bot signatures |
| Reverse proxy limits (Nginx `limit_req`) | Per-IP flooding at the edge of your infra |
| Application rate limiting | Business-logic abuse, credential stuffing, scraping |
| Caching | Reduces the cost of what does get through |
| Autoscaling | Absorbs bursts |
| Monitoring + runbook | Detection and response |

Claiming "DDoS protection" from `throttle:60,1` alone is wrong. Layer it, and say what each
layer does.

## Secrets

- `.env` is **never** committed. Verify: `git log --all --full-history -- .env`
- No `env()` outside `config/` — it returns null once config is cached
- Rotate anything that has ever been in a repo, a log, or a screenshot
- Production secrets in a manager (AWS Secrets Manager, Vault, Doppler), not in a file
- `APP_DEBUG=false` in production — debug mode exposes environment variables in the error
  page
- `composer install --no-dev` — Telescope, Debugbar, and Ignition must not ship

```bash
composer audit          # in CI, failing the build on high/critical
npm audit --audit-level=high
```

## Audit logging

Log every security-relevant event with actor, action, target, IP, and timestamp:

```php
AuditLog::record(
    action: 'invoice.refunded',
    subject: $invoice,
    causer: $user,
    context: ['amount' => $amount->minorUnits],
);
```

Log: authentication (success and failure), authorization denials, privilege changes, data
export, deletion, admin actions, payment operations, MFA changes.

**Never log:** passwords, tokens, full card numbers, session ids, or raw PII. Redact before
writing.

## Verification

```bash
composer audit
php artisan route:list --except-vendor    # every route accounted for and protected?
```

Then run `checklists/security-review.md`. For anything touching money, PII, auth, or file
uploads, that checklist is mandatory, not advisory.

## Scope boundaries

Owns: input handling, authz enforcement, output escaping, headers, secrets, session/cookie
config, abuse resistance, audit logging, dependency scanning.

Does not own: upload pipeline mechanics (`laravel-media-management`), API token/scope shape
(`laravel-api-standards`), server hardening and TLS (`laravel-devops-deployment`), schema
tenancy columns (`laravel-database-scale`).

## Bundled resources

- `references/owasp-laravel.md` — every OWASP Top 10 item mapped to Laravel specifics
- `references/authentication.md` — passwords, MFA, sessions, tokens, reset flows
- `references/authorization.md` — policies, gates, tenancy, IDOR, privilege escalation
- `references/headers-csp.md` — full CSP with nonces, HSTS, CORS
- `references/secrets-dependencies.md` — secrets management, scanning, supply chain
- `references/abuse-resilience.md` — the layered model, WAF, rate limits, load shedding
- `references/data-privacy-ph.md` — RA 10173 obligations in application terms
- `templates/` — `SecurityHeaders` middleware, rate limiters, audit log, CI security workflow
- `examples/vulnerable-vs-secure.md` — eight real vulnerabilities and their fixes
- `checklists/security-review.md` — pre-merge gate
- `checklists/pre-launch-security.md` — production readiness

---
Last reviewed: 2026-07-31 · See MAINTENANCE.md
