# Authentication

## Passwords

```php
// AppServiceProvider::boot()
Password::defaults(function (): Password {
    return Password::min(12)
        ->uncompromised()          // checks Have I Been Pwned via k-anonymity — no password leaves your server
        ->when(app()->isLocal(), fn (Password $rule) => $rule->min(8));
});
```

```php
'password' => ['required', 'confirmed', Password::defaults()],
```

What the evidence supports:
- **Length over composition.** 12+ characters, no forced symbol/number/case rules — those
  push users toward `Password1!` and reduce real entropy.
- **Breach checking** beats complexity rules. `uncompromised()` rejects passwords known to
  be in breach corpora.
- **No forced periodic rotation.** It causes incrementing (`Summer2026`, `Summer2027`).
  Rotate on evidence of compromise.
- **Allow paste** — password managers depend on it. Blocking paste also fails WCAG 3.3.8.

```php
// Hashing — Laravel's default is correct. Do not replace it.
Hash::make($password);
Hash::check($plain, $hashed);

// config/hashing.php — argon2id if available
'driver' => 'argon2id',
'argon' => ['memory' => 65536, 'threads' => 1, 'time' => 4],
```

Never `md5`, `sha1`, or `encrypt()` for passwords. `encrypt()` is reversible — that is the
opposite of what you want.

## Login

```php
RateLimiter::for('login', function (Request $request): array {
    return [
        // Per account+IP: stops brute force against one account
        Limit::perMinute(5)->by($request->input('email').'|'.$request->ip()),
        // Per IP: stops credential stuffing across many accounts
        Limit::perMinute(20)->by($request->ip()),
    ];
});
```

```php
public function store(LoginRequest $request): RedirectResponse
{
    $request->authenticate();          // throttles + attempts
    $request->session()->regenerate(); // session fixation defence

    return redirect()->intended(route('dashboard'));
}
```

```php
// Generic message — never distinguish "no such user" from "wrong password"
throw ValidationException::withMessages([
    'email' => __('auth.failed'),      // "These credentials do not match our records."
]);
```

Distinguishing the two turns your login form into a user-enumeration oracle. The same
applies to registration ("email already taken") and password reset — see below.

**Session fixation:** `session()->regenerate()` on login is mandatory. Without it, an
attacker who sets a victim's session id before login shares the authenticated session.

## Account enumeration in reset flows

```php
// ✓ Same response whether or not the address exists
public function store(Request $request): RedirectResponse
{
    $request->validate(['email' => ['required', 'email']]);

    Password::sendResetLink($request->only('email'));   // ignore the return status

    return back()->with('status', __(
        'If an account exists for that address, we have sent a password reset link.'
    ));
}
```

Same principle for registration: if "email already registered" must be shown (and it is
better UX), rate limit that endpoint hard and log the attempts.

## Multi-factor authentication

Required for admin and any privileged role. TOTP is the practical baseline; WebAuthn/passkeys
are stronger where the audience supports them.

```php
// TOTP with a maintained library (e.g. pragmarx/google2fa, or Fortify's built-in)
$user->forceFill([
    'two_factor_secret'         => encrypt($secret),
    'two_factor_recovery_codes' => encrypt(json_encode(
        Collection::times(8, fn () => Str::random(10).'-'.Str::random(10))->all()
    )),
    'two_factor_confirmed_at'   => now(),
])->save();
```

Requirements:
- Secret and recovery codes **encrypted at rest**
- Recovery codes: single-use, shown once, regenerable
- Confirm the first code before enabling — otherwise users lock themselves out
- Rate limit code verification (6 digits is 1,000,000 possibilities; without a limit that
  is minutes of brute force)
- Re-prompt for MFA on sensitive operations, not just at login
- Log enable/disable/recovery-code-use events

**SMS is a weak second factor** (SIM swap, SS7). Acceptable as a fallback where the
audience cannot use TOTP, but not as the only option for administrators.

## Sessions

```php
// config/session.php
'driver'          => env('SESSION_DRIVER', 'redis'),
'lifetime'        => 120,
'expire_on_close' => false,
'encrypt'         => true,
'http_only'       => true,
'same_site'       => 'lax',
'secure'          => env('SESSION_SECURE_COOKIE', true),
'partitioned'     => false,
```

| Setting | Why |
|---|---|
| `redis` driver | `file` breaks behind a load balancer; each server has its own sessions |
| `encrypt` | Session payload unreadable if the store is compromised |
| `http_only` | JavaScript cannot read the cookie — limits XSS impact |
| `secure` | Cookie never sent over plaintext HTTP |
| `same_site: lax` | CSRF defence. `strict` for admin panels; `none` requires `secure` |

```php
// On password change — invalidate every other session
Auth::logoutOtherDevices($request->validated('current_password'));

// Show active sessions to the user
DB::table('sessions')->where('user_id', $user->id)->get();
```

## Remember-me

Laravel's remember token is a long-lived credential. Treat it accordingly:
- Rotate on password change (Laravel does this via `setRememberToken`)
- Do not allow sensitive operations on a remember-me session without re-authentication

```php
// Require a fresh password before a sensitive action
Route::middleware(['auth', 'password.confirm'])->group(function (): void {
    Route::delete('/account', DeleteAccountController::class);
    Route::post('/two-factor/disable', DisableTwoFactorController::class);
});
```

## API tokens (Sanctum)

```php
// Least privilege — name the abilities
$token = $user->createToken('mobile-app', ['invoices:read', 'invoices:create'], now()->addDays(30));

return ['token' => $token->plainTextToken];   // shown once, never retrievable again
```

```php
Route::middleware(['auth:sanctum', 'ability:invoices:create'])->post('/invoices', ...);
```

```php
// config/sanctum.php
'expiration' => 60 * 24 * 30,      // minutes — never null in production
```

```php
Schedule::command('sanctum:prune-expired --hours=24')->daily();
```

- Tokens are hashed in the database — the plaintext exists only in the creation response
- Always set an expiry
- Scope abilities to the minimum
- Revoke on logout, password change, and device removal
- Show the user their active tokens with last-used timestamps

Token shape, scopes, and API auth flow details: `laravel-api-standards`.

## OAuth / social login

- Validate the `state` parameter — it is the CSRF defence for the OAuth flow
- Use PKCE for public clients
- Verify the ID token signature and `aud`/`iss` claims; do not trust the userinfo endpoint
  alone
- Do not auto-link accounts by email alone — an attacker who registers with a victim's
  address at an unverified provider takes over the account. Require verification, or an
  explicit link action while authenticated.

## Email verification

```php
Route::middleware(['auth', 'verified'])->group(/* ... */);
```

Verification links are signed and expiring. Do not allow the account to perform meaningful
actions before verification if the address matters (billing, notifications, recovery).

## Logging authentication events

```php
Event::listen(Login::class,          fn ($e) => $this->log('auth.login', $e->user));
Event::listen(Failed::class,         fn ($e) => $this->log('auth.failed', null, ['email' => $e->credentials['email'] ?? null]));
Event::listen(Lockout::class,        fn ($e) => $this->log('auth.lockout'));
Event::listen(PasswordReset::class,  fn ($e) => $this->log('auth.password_reset', $e->user));
Event::listen(Logout::class,         fn ($e) => $this->log('auth.logout', $e->user));
```

Record: timestamp, actor, IP, user agent, outcome. **Never** record the password — including
on a failed attempt, where a typo often *is* the real password for another account.

Alert on: lockout spikes, logins from new countries, many failures across many accounts
(credential stuffing), successful login immediately after many failures.

## Timing attacks

```php
// ✗ Short-circuits on the first differing byte
if ($token === $storedToken)

// ✓ Constant time
if (hash_equals($storedToken, $token))
```

Use `hash_equals` for every secret comparison: API keys, webhook signatures, reset tokens,
MFA codes.

## Testing

```php
it('rate limits login attempts', function (): void {
    $user = User::factory()->create();

    foreach (range(1, 5) as $_) {
        post(route('login'), ['email' => $user->email, 'password' => 'wrong']);
    }

    post(route('login'), ['email' => $user->email, 'password' => 'wrong'])
        ->assertStatus(429);
});

it('does not reveal whether an email is registered', function (): void {
    $a = post(route('password.email'), ['email' => 'exists@example.com']);
    $b = post(route('password.email'), ['email' => 'nope@example.com']);

    expect($a->getContent())->toBe($b->getContent());
});

it('regenerates the session on login', function (): void {
    $before = session()->getId();
    actingAs(User::factory()->create());
    expect(session()->getId())->not->toBe($before);
});
```
