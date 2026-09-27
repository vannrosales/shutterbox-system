# Idempotency and webhooks

## Why idempotency

A client POSTs a payment. The response times out. The client does not know whether the
charge happened. It retries. Without an idempotency key, that is a double charge.

This is not an edge case — mobile clients on flaky connections retry constantly.

## Inbound idempotency

Every endpoint that creates or charges must accept `Idempotency-Key`.

```php
Schema::create('idempotency_records', function (Blueprint $table): void {
    $table->id();
    $table->string('key', 128);
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->string('endpoint', 191);
    $table->string('request_hash', 64);      // detects key reuse with a different body
    $table->unsignedSmallInteger('status')->nullable();
    $table->json('response')->nullable();
    $table->timestamp('locked_at')->nullable();
    $table->timestamps();

    $table->unique(['user_id', 'key']);      // keys are scoped per user
    $table->index('created_at');             // for pruning
});
```

```php
final class EnsureIdempotency
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->isMethod('POST')) {
            return $next($request);
        }

        $key = $request->header('Idempotency-Key');

        if ($key === null) {
            return $next($request);          // or abort(400) if you require it
        }

        $hash = hash('sha256', $request->getContent());

        $record = IdempotencyRecord::firstOrCreate(
            ['user_id' => $request->user()->id, 'key' => $key],
            ['endpoint' => $request->path(), 'request_hash' => $hash, 'locked_at' => now()],
        );

        // Same key, different body — the client has a bug. Tell them.
        if ($record->request_hash !== $hash) {
            return response()->json([
                'message'    => __('This idempotency key was used with a different request body.'),
                'error_code' => 'idempotency_key_reuse',
            ], 422);
        }

        // Completed: replay the stored response
        if ($record->status !== null) {
            return response()->json($record->response, $record->status)
                ->header('Idempotent-Replay', 'true');
        }

        // In flight: the first request is still running
        if ($record->wasRecentlyCreated === false && $record->locked_at?->isAfter(now()->subMinute())) {
            return response()->json([
                'message'    => __('A request with this key is already in progress.'),
                'error_code' => 'idempotency_in_progress',
            ], 409, ['Retry-After' => '5']);
        }

        $response = $next($request);

        // Only cache successful outcomes — a 500 should be retryable
        if ($response->getStatusCode() < 500) {
            $record->update([
                'status'   => $response->getStatusCode(),
                'response' => json_decode($response->getContent(), true),
            ]);
        }

        return $response;
    }
}
```

```php
Route::post('/payments', ...)->middleware(['auth:sanctum', 'idempotent']);
```

```php
Schedule::call(fn () => IdempotencyRecord::where('created_at', '<', now()->subDays(7))->delete())
    ->daily();
```

Design notes:
- **Scope keys per user.** A global key namespace lets one client collide with another's
  key and read their response.
- **Hash the body.** Same key + different body is a client bug; returning the first
  response silently would be worse than an error.
- **Do not cache 5xx.** The client should be able to retry a genuine server failure.
- **24-hour to 7-day retention** is typical. Document your window.

### Provider idempotency keys

When you call a payment provider, pass one through:

```php
$this->gateway->charge($amount, idempotencyKey: "order:{$order->id}:charge:{$attempt}");
```

Derive it from your own data so a retry produces the same key. A random key per attempt
defeats the purpose.

## Outbound webhooks

### Delivery

```php
final class DeliverWebhook implements ShouldQueue
{
    use Queueable;

    public int $tries = 8;

    /** Exponential backoff: 10s, 30s, 2m, 5m, 15m, 1h, 3h, 6h */
    public array $backoff = [10, 30, 120, 300, 900, 3600, 10800, 21600];

    public function __construct(public readonly int $deliveryId) {}

    public function handle(): void
    {
        $delivery = WebhookDelivery::findOrFail($this->deliveryId);
        $payload = json_encode($delivery->payload);
        $timestamp = now()->timestamp;

        // Sign timestamp + body so the signature cannot be replayed
        $signature = hash_hmac('sha256', "{$timestamp}.{$payload}", $delivery->endpoint->secret);

        $response = Http::withHeaders([
                'Content-Type'         => 'application/json',
                'X-Webhook-Id'         => $delivery->ulid,
                'X-Webhook-Timestamp'  => $timestamp,
                'X-Webhook-Signature'  => "sha256={$signature}",
                'X-Webhook-Event'      => $delivery->event,
                'User-Agent'           => config('app.name').'-Webhooks/1.0',
            ])
            ->timeout(10)
            ->connectTimeout(5)
            ->withOptions(['allow_redirects' => false])   // SSRF: do not follow
            ->post($delivery->endpoint->url, $delivery->payload);

        $delivery->update([
            'status_code'   => $response->status(),
            'response_body' => Str::limit($response->body(), 2000),
            'delivered_at'  => $response->successful() ? now() : null,
            'attempts'      => $delivery->attempts + 1,
        ]);

        if (! $response->successful()) {
            throw new WebhookDeliveryFailed($delivery, $response->status());
        }
    }

    public function failed(?Throwable $e): void
    {
        $delivery = WebhookDelivery::find($this->deliveryId);
        $delivery?->update(['failed_at' => now()]);

        // Disable an endpoint that has been failing for days, and tell its owner
        $endpoint = $delivery?->endpoint;

        if ($endpoint && $endpoint->consecutiveFailures() >= 20) {
            $endpoint->update(['disabled_at' => now()]);
            $endpoint->owner->notify(new WebhookEndpointDisabled($endpoint));
        }
    }
}
```

### Signing — the contract you publish

```php
// What the receiver must do
$expected = hash_hmac('sha256', "{$timestamp}.{$rawBody}", $secret);

// Constant-time comparison
if (! hash_equals($expected, $providedSignature)) {
    abort(401);
}

// Reject old timestamps to prevent replay
if (abs(time() - (int) $timestamp) > 300) {
    abort(401, 'Timestamp outside tolerance');
}
```

Publish this in your docs as copy-pasteable code in the languages your users write.
A signature scheme nobody implements correctly protects nothing.

Signing **timestamp + body**, not just body, is what makes replay detection possible.

### Receiving webhooks

```php
Route::post('/webhooks/stripe', HandleStripeWebhook::class)
    ->withoutMiddleware([VerifyCsrfToken::class])       // signature replaces CSRF
    ->middleware('throttle:webhook');
```

```php
final class HandleStripeWebhook
{
    public function __invoke(Request $request): Response
    {
        // 1. Verify BEFORE parsing. Parsing untrusted JSON is attack surface.
        $expected = hash_hmac('sha256', $request->getContent(), config('services.stripe.webhook_secret'));

        abort_unless(hash_equals($expected, (string) $request->header('Stripe-Signature')), 401);

        // 2. Deduplicate — providers send duplicates, by design
        $eventId = $request->json('id');

        if (ProcessedWebhook::where('event_id', $eventId)->exists()) {
            return response()->noContent();          // already handled
        }

        ProcessedWebhook::create(['event_id' => $eventId, 'provider' => 'stripe']);

        // 3. Queue the work and return immediately. Providers time out at a few seconds
        //    and will retry — turning a slow handler into duplicate processing.
        ProcessStripeEvent::dispatch($request->json()->all());

        return response()->noContent();
    }
}
```

The three rules: **verify first, deduplicate, respond fast**. Every webhook bug traces to
skipping one of them.

CSRF exemption is justified here *because* the signature is a stronger check — record that
reasoning next to the exemption in `bootstrap/app.php`.

### Endpoint registration — SSRF

A user-supplied webhook URL is an SSRF vector.

```php
final class ValidWebhookUrl implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $parts = parse_url($value);

        if (($parts['scheme'] ?? '') !== 'https') {
            $fail(__('Webhook URLs must use HTTPS.'));
            return;
        }

        $ip = gethostbyname($parts['host'] ?? '');

        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            $fail(__('That host is not allowed.'));
        }
    }
}
```

Plus `allow_redirects => false` at delivery time — otherwise a permitted URL redirects to
`169.254.169.254` and hands over your cloud credentials. See `laravel-security`.

### Delivery visibility

Give endpoint owners:

```php
'deliveries' => WebhookDeliveryResource::collection($endpoint->deliveries()->latest()->paginate(20)),
```

Each showing: event, timestamp, status code, attempt count, response snippet, and a
**manual retry** button. Without this, every failure becomes a support ticket.

```php
Route::post('/webhooks/deliveries/{delivery}/retry', function (WebhookDelivery $delivery) {
    Gate::authorize('retry', $delivery);

    DeliverWebhook::dispatch($delivery->id);

    return response()->json(['message' => __('Retry queued.')], 202);
});
```

### Payload design

```json
{
  "id": "01J8XK3M7QRVWXYZ",
  "type": "invoice.paid",
  "created_at": "2026-07-31T14:30:00+00:00",
  "api_version": "v1",
  "data": {
    "object": { "id": 123, "reference": "INV-001", "status": "paid" }
  }
}
```

- `id` — for deduplication on the receiver's side
- `type` — `resource.event`, past tense
- `api_version` — so the payload shape can be versioned with your API
- `data.object` — the full resource, so receivers do not need a follow-up call

Include enough that a receiver rarely has to call back. But **never assume ordering** —
`invoice.paid` can arrive before `invoice.created`. Document that receivers must handle
out-of-order delivery, and include enough state in each event to make that possible.

## Retention

```php
Schedule::call(fn () => WebhookDelivery::where('created_at', '<', now()->subDays(30))->delete())->daily();
Schedule::call(fn () => ProcessedWebhook::where('created_at', '<', now()->subDays(30))->delete())->daily();
Schedule::call(fn () => IdempotencyRecord::where('created_at', '<', now()->subDays(7))->delete())->daily();
```

All three tables grow with traffic and have no natural limit. See
`laravel-database-scale`.
