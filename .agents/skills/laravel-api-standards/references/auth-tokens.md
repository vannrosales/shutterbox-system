# API authentication

## Choosing a mechanism

| Client | Mechanism | Why |
|---|---|---|
| SPA, same top-level domain | **Sanctum cookie** | Real CSRF protection, `httpOnly`, no token storage in JS |
| Mobile app | **Sanctum token** | No cookie jar; store in the platform keychain |
| Server-to-server (your own) | **Sanctum token** | Simple, revocable, scoped |
| Third-party developers | **OAuth 2.0 (Passport)** | User consent, refresh tokens, no password sharing |
| Machine-to-machine, high scale | OAuth client credentials, or signed requests | Stateless verification |

**Do not put a bearer token in `localStorage` for a browser SPA.** Any XSS reads it. The
cookie flow is strictly better on the same domain — the token is `httpOnly` and
unreachable from JavaScript.

## Sanctum — SPA cookie flow

```php
// config/sanctum.php
'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', 'localhost,127.0.0.1,app.example.com')),
'guard'    => ['web'],
```

```js
// The client fetches the CSRF cookie once, then logs in normally
await axios.get('/sanctum/csrf-cookie');
await axios.post('/login', { email, password });
// Subsequent API calls carry the session cookie + X-XSRF-TOKEN automatically
```

```php
Route::middleware('auth:sanctum')->group(base_path('routes/api/v1.php'));
```

Requirements: same top-level domain (`app.example.com` and `api.example.com` are fine;
`example.com` and `otherdomain.com` are not), `SESSION_DOMAIN=.example.com`, and CORS
`supports_credentials: true` with explicit origins.

## Sanctum — token flow

```php
final class IssueTokenController
{
    public function __invoke(IssueTokenRequest $request): JsonResponse
    {
        $user = User::where('email', $request->string('email'))->first();

        if (! $user || ! Hash::check($request->string('password'), $user->password)) {
            // Generic message — never distinguish "no such user" from "wrong password"
            throw ValidationException::withMessages(['email' => __('auth.failed')]);
        }

        $token = $user->createToken(
            name: $request->string('device_name')->toString(),
            abilities: ['invoices:read', 'invoices:create'],
            expiresAt: now()->addDays(30),
        );

        return response()->json([
            'data' => [
                'token'      => $token->plainTextToken,   // shown ONCE, never retrievable
                'expires_at' => $token->accessToken->expires_at?->toIso8601String(),
                'abilities'  => $token->accessToken->abilities,
            ],
        ], 201);
    }
}
```

```php
Route::post('/tokens', IssueTokenController::class)->middleware('throttle:login');
```

Rate limit token issuance exactly like login — it *is* login.

### Abilities

```php
Route::middleware(['auth:sanctum', 'ability:invoices:create'])->post('/invoices', ...);
Route::middleware(['auth:sanctum', 'abilities:invoices:read,invoices:write'])->get(...);
```

```php
// In code
if ($request->user()->tokenCan('invoices:refund')) { ... }
```

Design abilities as `resource:action`. Grant the minimum. A mobile app that only displays
invoices gets `invoices:read` — then a stolen token cannot issue refunds.

**Abilities are not authorization.** A token with `invoices:read` still needs the policy
check for *which* invoices. Both, always.

### Expiry and cleanup

```php
// config/sanctum.php
'expiration' => 60 * 24 * 30,        // minutes. NEVER null in production.
```

```php
Schedule::command('sanctum:prune-expired --hours=24')->daily();
```

```php
// Revoke on logout, password change, device removal
$request->user()->currentAccessToken()->delete();
$request->user()->tokens()->delete();
$request->user()->tokens()->where('name', $device)->delete();
```

Show users their active tokens:

```php
'tokens' => $user->tokens->map(fn (PersonalAccessToken $t): array => [
    'id'           => $t->id,
    'name'         => $t->name,
    'abilities'    => $t->abilities,
    'last_used_at' => $t->last_used_at?->toIso8601String(),
    'expires_at'   => $t->expires_at?->toIso8601String(),
]),
```

`last_used_at` is what lets a user spot a token they do not recognise.

## OAuth 2.0 — third-party access

Use Passport when other people's applications act on behalf of your users.

```bash
composer require laravel/passport
php artisan passport:install
```

```php
// Authorization Code + PKCE — the correct flow for public clients (SPA, mobile)
Route::middleware(['auth:api', 'scope:invoices:read'])->get('/invoices', ...);
```

Flow selection:

| Flow | Use |
|---|---|
| Authorization Code + PKCE | Public clients (SPA, mobile). **The default.** |
| Authorization Code | Confidential clients (a server that can keep a secret) |
| Client Credentials | Machine-to-machine, no user context |
| Password Grant | **Deprecated.** Do not use for new integrations. |
| Implicit | **Deprecated.** Do not use. |

Non-negotiables:
- Validate the `state` parameter — it is the CSRF defence for the OAuth flow
- PKCE for every public client
- Short-lived access tokens (15–60 min), longer refresh tokens with rotation
- Explicit consent screen listing the scopes
- Users can revoke per-application access

```php
Passport::tokensExpireIn(now()->addMinutes(60));
Passport::refreshTokensExpireIn(now()->addDays(30));
Passport::personalAccessTokensExpireIn(now()->addMonths(6));
```

## Static API keys

Sometimes unavoidable (a webhook receiver, a legacy partner). If you must:

```php
final class VerifyApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $presented = (string) $request->header('X-Api-Key');
        $hash = hash('sha256', $presented);

        $key = ApiKey::where('key_hash', $hash)->where('revoked_at', null)->first();

        abort_if($key === null, 401, __('Invalid API key.'));
        abort_if($key->expires_at?->isPast(), 401, __('API key expired.'));

        $key->forceFill(['last_used_at' => now()])->saveQuietly();

        Context::add('api_key_id', $key->id);

        return $next($request);
    }
}
```

- **Store a hash**, never the key itself
- Look up by hash so the comparison is a single indexed query — and where you must compare
  strings directly, use `hash_equals()`
- Expiry, revocation, and `last_used_at` are all required
- Never accept a key in a query string (it lands in access logs, browser history, and
  referrer headers). Header only.
- Scope keys to specific abilities and IP ranges where feasible

## Rate limiting by identity

```php
RateLimiter::for('api', function (Request $request): Limit {
    $token = $request->user()?->currentAccessToken();

    return Limit::perMinute(match (true) {
        $token?->can('tier:enterprise') => 1000,
        $token?->can('tier:pro')        => 300,
        $request->user() !== null       => 60,
        default                         => 20,
    })->by($token?->id ?: ($request->user()?->id ?: $request->ip()));
});
```

Key by **token id**, not user id, when a user may have several clients — otherwise one
badly-behaved integration throttles the user's other apps.

Return the headers:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
Retry-After: 42
```

## Errors

```php
// 401 — no credentials, or invalid ones
{ "message": "Unauthenticated.", "error_code": "unauthenticated" }

// 403 — authenticated, insufficient ability or permission
{ "message": "This token cannot create invoices.", "error_code": "insufficient_scope" }

// 419 — CSRF token mismatch (cookie flow)
{ "message": "CSRF token mismatch.", "error_code": "csrf_mismatch" }
```

Distinguish "token lacks the ability" from "user lacks the permission" in `error_code` —
they need different fixes and the client should be able to tell them apart.

## Logging and monitoring

```php
Context::add([
    'user_id'  => $request->user()?->id,
    'token_id' => $request->user()?->currentAccessToken()?->id,
]);
```

Log and alert on:
- Repeated 401s from one IP (credential stuffing against the token endpoint)
- A token used from a new country or ASN
- Token creation spikes
- 403s on high-value scopes

Audit every token issuance and revocation — `laravel-security`.

## Testing

```php
it('rejects a request with no token', function (): void {
    $this->getJson('/api/v1/invoices')->assertUnauthorized();
});

it('rejects a token without the required ability', function (): void {
    Sanctum::actingAs(User::factory()->create(), ['invoices:read']);

    $this->postJson('/api/v1/invoices', [])->assertForbidden();
});

it('rejects an expired token', function (): void {
    $user = User::factory()->create();
    $token = $user->createToken('t', ['*'], now()->subDay());

    $this->withHeader('Authorization', "Bearer {$token->plainTextToken}")
        ->getJson('/api/v1/invoices')
        ->assertUnauthorized();
});

it('does not return another tenant\'s data even with a valid token', function (): void {
    Sanctum::actingAs($user, ['invoices:read']);
    $other = Invoice::factory()->create();          // different tenant

    $this->getJson("/api/v1/invoices/{$other->id}")->assertNotFound();
});
```

The last test is the one that catches the mistake people actually make: a valid token
treated as blanket authorization.
