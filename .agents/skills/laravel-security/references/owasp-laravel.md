# OWASP Top 10, in Laravel terms

Each item: what it looks like in a Laravel codebase, and the concrete defence.

---

## A01 — Broken Access Control

The most common serious vulnerability in Laravel applications, because the framework makes
authentication easy and leaves authorization to you.

### IDOR

```php
// ✗ Authenticated ≠ authorized
public function show($id)
{
    return view('invoices.show', ['invoice' => Invoice::findOrFail($id)]);
}
```

Any logged-in user changes the URL and reads any invoice.

```php
// ✓
public function show(Invoice $invoice)
{
    $this->authorize('view', $invoice);
    return view('invoices.show', compact('invoice'));
}
```

### Enumeration through status codes

```php
// ✗ 403 confirms the record exists
return Response::deny();

// ✓ 404 reveals nothing
return Response::denyAsNotFound();
```

### Unscoped nested resources

```php
// ✗ /teams/1/invoices/999 — invoice 999 may belong to team 2
Route::get('/teams/{team}/invoices/{invoice}', ...);

// ✓ Laravel verifies the child belongs to the parent
Route::get('/teams/{team}/invoices/{invoice}', ...)->scopeBindings();
```

### Missing tenant scope

```php
// ✓ Global scope — makes forgetting impossible
final class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if ($tenantId = Context::get('tenant_id')) {
            $builder->where($model->qualifyColumn('tenant_id'), $tenantId);
        }
    }
}
```

The scope is a safety net, not a substitute for the policy check.

### Forced browsing to admin routes

```php
Route::middleware(['auth', 'verified', 'can:access-admin'])
    ->prefix('admin')
    ->group(base_path('routes/admin.php'));
```

Audit it:

```bash
php artisan route:list --except-vendor
```

Every route must have a deliberate middleware stack. A route with no `auth` should be
public **on purpose**.

---

## A02 — Cryptographic Failures

```php
// ✓ Encrypted at rest, transparently
protected function casts(): array
{
    return [
        'tax_id'      => 'encrypted',
        'notes'       => 'encrypted',
        'preferences' => 'encrypted:array',
    ];
}
```

Encrypted columns cannot be indexed or searched. For a searchable encrypted field, store a
blind index (HMAC of the normalised value) alongside:

```php
$table->text('tax_id');                          // encrypted
$table->string('tax_id_hash', 64)->index();      // hash_hmac('sha256', $normalised, $key)
```

Rules:
- `APP_KEY` set, 32 bytes, **different per environment**, never in the repo
- Rotating `APP_KEY` makes all encrypted data unreadable — plan the re-encryption
- Passwords: `Hash::make()` (bcrypt/Argon2id), never `md5`, `sha1`, or `encrypt()`
- Tokens: `Str::random(64)` or `random_bytes()` — never `rand()`, `uniqid()`, or `mt_rand()`
- Compare secrets with `hash_equals()`, not `===` (timing attack)
- TLS everywhere; HSTS with preload
- Never log or return a decrypted secret

---

## A03 — Injection

### SQL

Eloquent parameterises `where()`. These do not:

```php
// ✗
DB::select("SELECT * FROM users WHERE email = '{$email}'");
User::whereRaw("name LIKE '%{$term}%'");
User::orderByRaw($request->input('sort'));
User::havingRaw("COUNT(*) > {$min}");

// ✓
DB::select('SELECT * FROM users WHERE email = ?', [$email]);
User::whereRaw('name LIKE ?', ["%{$term}%"]);
```

Column names and sort direction **cannot** be parameterised — whitelist:

```php
$sortable = ['created_at', 'name', 'total'];
$column   = in_array($request->input('sort'), $sortable, true) ? $request->input('sort') : 'created_at';
```

### Command injection

```php
// ✗
exec("convert {$path} -resize 100x100 {$out}");
shell_exec("ffmpeg -i {$userFile} out.mp4");

// ✓ Array form — no shell, no interpolation
Process::run(['convert', $path, '-resize', '100x100', $out]);

// If a string is unavoidable
escapeshellarg($path);
```

Best answer: use a library (Intervention Image, FFMpeg PHP bindings) rather than shelling
out at all.

### Remote code execution

```php
// ✗ Never with user input
eval($code);
unserialize($input);                       // object injection → RCE
call_user_func($request->input('fn'));
new $request->input('class');
include $request->input('page').'.php';
```

`unserialize()` on untrusted data is the classic PHP RCE. Use `json_decode()`. If you must
unserialize, pass `['allowed_classes' => false]`.

### SSRF — the injection people forget

```php
// ✗ A user-supplied URL can reach your cloud metadata endpoint
Http::get($request->input('webhook_url'));
```

```php
// ✓ Validate scheme, resolve the host, reject private ranges
$url = $request->input('webhook_url');
$parts = parse_url($url);

abort_unless(in_array($parts['scheme'] ?? '', ['http', 'https'], true), 422);

$ip = gethostbyname($parts['host']);
abort_if(
    ! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE),
    422,
    __('That URL is not allowed.')
);

Http::withOptions(['allow_redirects' => false])->timeout(5)->get($url);
```

`allow_redirects => false` matters — otherwise a permitted URL can redirect to
`169.254.169.254`.

---

## A04 — Insecure Design

- Rate limit **by business action**, not just by route: 5 password resets per hour per
  account, 3 refunds per day per user.
- Confirmation steps for destructive and financial operations (also WCAG 3.3.4).
- Idempotency keys on payment endpoints.
- Server-side authoritative state — never trust a price, total, or role sent by the client.

```php
// ✗ Client sends the price
$order->total = $request->input('total');

// ✓ Server computes it
$order->total = $this->pricing->calculate($items, $customer);
```

---

## A05 — Security Misconfiguration

```bash
APP_DEBUG=false            # true leaks env vars, stack traces, and DB credentials
APP_ENV=production
SESSION_SECURE_COOKIE=true
```

```bash
composer install --no-dev --optimize-autoloader
```

- Debug tooling (Telescope, Debugbar, Ignition) must not ship
- Web root is `public/`, never the project root — verify `.env` is not fetchable
- Directory listing off
- Default credentials changed
- Unused routes and packages removed
- Error pages generic; the stack trace goes to the log, not the browser

```bash
curl -I https://example.com/.env             # must be 403/404
curl -I https://example.com/storage/logs/laravel.log
curl -I https://example.com/telescope
```

---

## A06 — Vulnerable and Outdated Components

```bash
composer audit                     # fail CI on high/critical
npm audit --audit-level=high
composer outdated --direct
```

- Renovate or Dependabot for automated PRs, with CI as the gate
- Patch/minor reviewed monthly; majors as their own PR
- Vet new packages: maintained, supported framework version, sane dependency weight
- Pin versions; commit lock files

---

## A07 — Identification and Authentication Failures

```php
RateLimiter::for('login', fn (Request $r) => [
    Limit::perMinute(5)->by($r->input('email').'|'.$r->ip()),
    Limit::perMinute(20)->by($r->ip()),
]);
```

- Generic failure messages
- Session regenerated on login and privilege change
- MFA for privileged roles
- `Password::min(12)->uncompromised()`
- Reset tokens: single-use, short TTL, no account enumeration in the response
- Log out other sessions on password change:

```php
Auth::logoutOtherDevices($request->input('password'));
```

---

## A08 — Software and Data Integrity Failures

- Never `unserialize()` untrusted input
- Verify webhook signatures **before** parsing the body:

```php
$signature = $request->header('X-Signature');
$expected  = hash_hmac('sha256', $request->getContent(), config('services.provider.secret'));

abort_unless(hash_equals($expected, (string) $signature), 401);
```

`hash_equals`, not `===` — constant-time comparison.

- SRI on any third-party script you cannot self-host
- Signed URLs for anything sensitive reachable without a session:

```php
URL::temporarySignedRoute('exports.download', now()->addHour(), ['export' => $id]);
```

A signed URL proves the link was not tampered with. It does **not** prove who is clicking
it — forwarded emails are normal. Check identity too where it matters.

---

## A09 — Security Logging and Monitoring Failures

```php
Event::listen(Failed::class,    fn ($e) => Log::channel('security')->warning('Login failed', [...]));
Event::listen(Lockout::class,   fn ($e) => Log::channel('security')->warning('Lockout', [...]));
Event::listen(PasswordReset::class, fn ($e) => Log::channel('security')->info('Password reset', [...]));
```

Log with: actor id, action, target, IP, user agent, timestamp, outcome.

**Redact before logging.** Passwords, tokens, card numbers, session ids, and raw PII must
never reach a log file.

```php
// config/logging.php
'security' => [
    'driver' => 'daily',
    'path'   => storage_path('logs/security.log'),
    'days'   => 90,
],
```

Alert on: repeated authorization denials, lockout spikes, admin actions outside business
hours, bulk exports, new admin creation.

---

## A10 — Server-Side Request Forgery

Covered under A03 above. The additional Laravel-specific angles:

- Image fetch-by-URL features
- Webhook registration
- PDF generators that render remote HTML
- Import-from-URL features
- Any `Http::get($userControlledUrl)`

Defence: scheme whitelist, DNS resolution check against private ranges, redirects disabled,
short timeout, and — where possible — an allow-list of permitted hosts rather than a
blocklist of forbidden ones.

---

## Two more that are not in the Top 10 but bite Laravel apps

### Open redirect

```php
// ✗
return redirect($request->input('next'));

// ✓ Only relative paths, or an allow-list
$next = $request->input('next', '/');
return redirect(Str::startsWith($next, '/') && ! Str::startsWith($next, '//') ? $next : '/');
```

`//evil.com` is a protocol-relative URL — the `//` check is required.

### Mass assignment

```php
// ✗
protected $guarded = [];
User::create($request->all());     // is_admin => true

// ✓
protected $fillable = ['name', 'email', 'bio'];
User::create($request->validated());
```

```php
// AppServiceProvider — throws on unexpected attributes in development
Model::preventSilentlyDiscardingAttributes(! app()->isProduction());
```
