<?php

declare(strict_types=1);

/*
 * Rate limiter definitions.
 *
 * Put these in AppServiceProvider::boot(), or a dedicated RateLimitServiceProvider.
 *
 * Remember what this layer does and does not do:
 *   ✓ credential stuffing, scraping, enumeration, expensive-query abuse, business-logic abuse
 *   ✗ volumetric DDoS — that traffic reaches your server regardless
 * See references/abuse-resilience.md for the layered model.
 */

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;

// ── General API ─────────────────────────────────────────────────────────────
// Key by user id when authenticated so one user behind a shared NAT/office IP
// cannot exhaust the limit for everyone else.
RateLimiter::for('api', fn (Request $request): Limit =>
    Limit::perMinute(60)->by($request->user()?->id ?: $request->ip())
);

// ── Tiered by plan ──────────────────────────────────────────────────────────
RateLimiter::for('api-tiered', function (Request $request): Limit {
    // A match expression cannot be method-chained directly — wrap it in parentheses.
    return (match ($request->user()?->plan) {
        'enterprise' => Limit::perMinute(1000),
        'pro'        => Limit::perMinute(300),
        'starter'    => Limit::perMinute(120),
        default      => Limit::perMinute(60),
    })->by($request->user()?->id ?: $request->ip());
});

// ── Authentication ──────────────────────────────────────────────────────────
// TWO limits, because they defend different attacks:
//   - email+IP  : brute force against ONE account
//   - IP alone  : credential stuffing across MANY accounts
RateLimiter::for('login', fn (Request $request): array => [
    Limit::perMinute(5)->by(mb_strtolower((string) $request->input('email')).'|'.$request->ip()),
    Limit::perMinute(20)->by($request->ip()),
]);

RateLimiter::for('register', fn (Request $request): Limit =>
    Limit::perHour(5)->by($request->ip())
);

RateLimiter::for('password-reset', fn (Request $request): array => [
    Limit::perHour(3)->by(mb_strtolower((string) $request->input('email'))),
    Limit::perHour(10)->by($request->ip()),
]);

// 6 digits = 1,000,000 possibilities. Without a limit that is minutes of brute force.
RateLimiter::for('two-factor', fn (Request $request): Limit =>
    Limit::perMinute(5)->by($request->session()->get('login.id') ?: $request->ip())
);

// ── Expensive operations ────────────────────────────────────────────────────
RateLimiter::for('export', fn (Request $request): Limit =>
    Limit::perHour(5)
        ->by($request->user()->id)
        ->response(fn () => response()->json([
            'message' => __('You have reached the export limit. Please try again in an hour.'),
        ], 429))
);

RateLimiter::for('search', fn (Request $request): Limit =>
    Limit::perMinute(30)->by($request->user()?->id ?: $request->ip())
);

RateLimiter::for('upload', fn (Request $request): Limit =>
    Limit::perHour(50)->by($request->user()->id)
);

// ── Cost-based: not every request costs the same ────────────────────────────
RateLimiter::for('reports', function (Request $request): Limit {
    $from = $request->date('from') ?? now()->subMonth();
    $to   = $request->date('to') ?? now();

    // A 12-month report costs ~12 units; a 1-month report costs 1.
    $cost = max(1, (int) ceil($from->diffInDays($to) / 30));

    return Limit::perHour(50)->by($request->user()->id.':cost:'.$cost);
});

// ── Outbound-cost operations (you pay per message) ──────────────────────────
RateLimiter::for('sms', fn (Request $request): Limit =>
    Limit::perDay(20)->by($request->user()->id)
);

RateLimiter::for('email-invite', fn (Request $request): Limit =>
    Limit::perHour(20)->by($request->user()->id)
);

// ── Webhooks: generous, but bounded ─────────────────────────────────────────
RateLimiter::for('webhook', fn (Request $request): Limit =>
    Limit::perMinute(300)->by($request->ip())
);

// ── Unauthenticated public endpoints ────────────────────────────────────────
RateLimiter::for('public', fn (Request $request): Limit =>
    Limit::perMinute(30)->by($request->ip())
);

// ── Log every limit hit: a spike is the earliest attack signal ───────────────
RateLimiter::for('api-logged', fn (Request $request): Limit =>
    Limit::perMinute(60)
        ->by($request->user()?->id ?: $request->ip())
        ->response(function () use ($request) {
            Log::channel('security')->warning('Rate limit exceeded', [
                'user'  => $request->user()?->id,
                'ip'    => $request->ip(),
                'route' => $request->route()?->getName(),
                'agent' => $request->userAgent(),
            ]);

            return response()->json(['message' => __('Too many requests.')], 429);
        })
);

/*
 * ── Route usage ─────────────────────────────────────────────────────────────
 *
 * Route::middleware('throttle:api')->group(base_path('routes/api.php'));
 * Route::post('/login', ...)->middleware('throttle:login');
 * Route::get('/exports/{export}', ...)->middleware(['auth', 'throttle:export']);
 *
 * ── Business-action limits — the ones route throttles miss ───────────────────
 *
 * Route-level limits count REQUESTS. The abuse that matters usually counts ACTIONS.
 *
 * $key = "refund:{$user->id}";
 *
 * if (RateLimiter::tooManyAttempts($key, maxAttempts: 3)) {
 *     $seconds = RateLimiter::availableIn($key);
 *
 *     throw ValidationException::withMessages([
 *         'amount' => __('Refund limit reached. Try again in :minutes minutes.', [
 *             'minutes' => ceil($seconds / 60),
 *         ]),
 *     ]);
 * }
 *
 * RateLimiter::hit($key, decaySeconds: 86400);
 *
 * Apply to: password resets, MFA attempts, invitations, refunds, coupon redemption,
 * account creation, message sending, report generation, API key creation.
 *
 * ── Testing ─────────────────────────────────────────────────────────────────
 *
 * it('rate limits login attempts', function (): void {
 *     $user = User::factory()->create();
 *
 *     foreach (range(1, 5) as $_) {
 *         post(route('login'), ['email' => $user->email, 'password' => 'wrong']);
 *     }
 *
 *     post(route('login'), ['email' => $user->email, 'password' => 'wrong'])
 *         ->assertStatus(429);
 * });
 */
