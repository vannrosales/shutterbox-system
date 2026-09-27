# Fakes, doubles, and isolation

## The hierarchy

1. **Real thing** — if it is fast and deterministic (the database, under `RefreshDatabase`)
2. **Laravel fake** — `Queue::fake()`, `Mail::fake()`, `Storage::fake()`, `Http::fake()`
3. **Your own fake** — a real class implementing your interface
4. **Mockery** — only when nothing above fits

Each step down couples the test more tightly to implementation. A test with five mock
expectations breaks on every refactor and proves nothing about behaviour.

## Laravel fakes

```php
Queue::fake();
Bus::fake();
Mail::fake();
Notification::fake();
Event::fake([InvoiceRefunded::class]);      // ALWAYS pass the list — see below
Storage::fake('private');
Http::fake();
Process::fake();
```

### Events — never fake everything

```php
// ✗ Fakes EVERY event, including ones the feature depends on.
//   The feature stops working; the test still passes.
Event::fake();

// ✓ Fake only what you assert on
Event::fake([InvoiceRefunded::class]);
```

This is the most common testing mistake in Laravel codebases. `Event::fake()` with no
arguments silences model observers, framework events, and every listener your feature needs
— so a broken feature passes its own test.

```php
Event::assertDispatched(InvoiceRefunded::class,
    fn (InvoiceRefunded $e): bool => $e->invoice->is($invoice) && $e->amount->minorUnits === 5000);

Event::assertDispatchedTimes(InvoiceRefunded::class, 1);
Event::assertNotDispatched(InvoiceCreated::class);
```

### Queue and Bus

```php
Queue::fake();

Queue::assertPushed(GenerateStatement::class);
Queue::assertPushedOn('reports', GenerateStatement::class);
Queue::assertPushed(GenerateStatement::class,
    fn (GenerateStatement $j): bool => $j->accountId === $account->id);
Queue::assertNotPushed(SendReminder::class);
Queue::assertNothingPushed();

// Let some jobs run while faking others
Queue::fake([GenerateStatement::class]);
```

```php
Bus::fake();

Bus::assertBatched(fn (PendingBatch $b): bool =>
    $b->name === 'Monthly statements' && $b->jobs->count() === 50);

Bus::assertChained([ImportRows::class, ValidateImport::class, NotifyComplete::class]);
```

**Important:** with `QUEUE_CONNECTION=sync` in `phpunit.xml`, jobs run inline unless faked.
That is usually what you want in a feature test — the whole flow executes. Fake only when
you are asserting *that* something was queued, not what it did.

### Mail and notifications

```php
Mail::fake();
Mail::assertSent(InvoiceIssued::class, fn (InvoiceIssued $m): bool => $m->hasTo($customer->email));
Mail::assertQueued(InvoiceIssued::class);          // for ShouldQueue mailables
Mail::assertNotSent(PaymentFailed::class);
Mail::assertNothingSent();

Notification::fake();
Notification::assertSentTo($user, RefundIssued::class,
    fn (RefundIssued $n, array $channels): bool =>
        $n->amount->minorUnits === 5000 && in_array('mail', $channels, true));

Notification::assertSentOnDemand(TeamInvitationSent::class);
Notification::assertCount(1);
```

A queued mailable needs `assertQueued`, not `assertSent`. Getting this wrong produces a
test that fails for reasons unrelated to the code.

### HTTP

```php
Http::fake([
    'api.stripe.com/v1/charges' => Http::response(['id' => 'ch_123', 'status' => 'succeeded'], 200),
    'api.stripe.com/*'          => Http::response([], 200),
    'slow.example.com/*'        => Http::response(null, 500),
    '*'                         => Http::response([], 404),      // catch-all last
]);

// Sequences — different response per call, for retry tests
Http::fake([
    'api.example.com/*' => Http::sequence()
        ->push(null, 500)
        ->push(null, 500)
        ->push(['ok' => true], 200),
]);

Http::assertSent(fn (Request $r): bool =>
    $r->url() === 'https://api.stripe.com/v1/charges'
    && $r->hasHeader('Idempotency-Key')
    && $r['amount'] === 5000);

Http::assertSentCount(1);
Http::assertNothingSent();
```

**The critical setting:**

```php
// TestCase::setUp()
Http::preventStrayRequests();
```

Without it, a test that forgets `Http::fake()` makes a **real network call** — slow, flaky,
dependent on someone else's uptime, and occasionally charging real money to a real card.
With it, the stray call throws immediately with the URL.

### Storage

```php
Storage::fake('private');

// ... upload happens ...

Storage::disk('private')->assertExists($media->path);
Storage::disk('private')->assertMissing('old/path.jpg');
Storage::disk('private')->assertDirectoryEmpty('tmp');

expect(Storage::disk('private')->get($path))->toBe($expectedContents);
```

`Storage::fake()` also clears the disk between tests, which prevents the cross-test
pollution that a real local disk causes.

### Process

```php
Process::fake([
    'convert *' => Process::result(output: '', exitCode: 0),
    'ffmpeg *'  => Process::result(exitCode: 1, errorOutput: 'codec not found'),
]);

Process::assertRan(fn (PendingProcess $p): bool => str_contains($p->command, '-resize'));
```

## Your own fakes

For your own interfaces, a real implementation beats a mock.

```php
final class FakePaymentGateway implements PaymentGateway
{
    /** @var list<array{amount: Money, key: ?string}> */
    public array $charges = [];

    public bool $shouldFail = false;

    public function charge(Money $amount, string $token, ?string $idempotencyKey = null): ChargeResult
    {
        if ($this->shouldFail) {
            throw new PaymentDeclined('Card declined');
        }

        // Real idempotency behaviour, so the test exercises the real code path
        foreach ($this->charges as $charge) {
            if ($idempotencyKey !== null && $charge['key'] === $idempotencyKey) {
                return new ChargeResult($charge['reference'], replayed: true);
            }
        }

        $reference = 'ch_'.count($this->charges);
        $this->charges[] = ['amount' => $amount, 'key' => $idempotencyKey, 'reference' => $reference];

        return new ChargeResult($reference);
    }
}
```

```php
beforeEach(function (): void {
    $this->gateway = new FakePaymentGateway();
    $this->app->instance(PaymentGateway::class, $this->gateway);
});

it('does not double-charge on retry', function (): void {
    $action = app(ChargeInvoice::class);

    $action->handle($this->invoice);
    $action->handle($this->invoice->fresh());

    expect($this->gateway->charges)->toHaveCount(1);
});
```

Why this beats a mock:
- It encodes the real contract, including idempotency
- One fake serves every test that touches payments
- It survives refactors of the calling code
- Assertions read as behaviour, not as "method was called with"

Keep fakes in `tests/Support/Fakes/`.

## Mockery — when you must

```php
$gateway = Mockery::mock(PaymentGateway::class);

$gateway->shouldReceive('refund')
    ->once()
    ->with(Mockery::type(Money::class), 'ch_123')
    ->andReturn(new Refund('re_456'));

$this->app->instance(PaymentGateway::class, $gateway);
```

```php
// Partial mock — real object, one method replaced
$action = Mockery::mock(RefundInvoice::class)->makePartial();
$action->shouldReceive('notifyCustomer')->andReturnNull();
```

```php
// Spy — assert after the fact, no expectations up front
$gateway = Mockery::spy(PaymentGateway::class);
$this->app->instance(PaymentGateway::class, $gateway);

// ... act ...

$gateway->shouldHaveReceived('refund')->once();
```

Spies are usually better than mocks: they assert on what happened rather than dictating
what must happen, so they do not break on unrelated changes.

**Never mock what you do not own.** Mocking `Illuminate\Http\Client` or an SDK class means
your test passes while the real integration is broken. Wrap third-party SDKs behind your
own interface (`laravel-enterprise-architecture`) and fake that.

## Time

```php
$this->freezeTime();                       // now() stops
$this->travelTo(now()->addDays(8));
$this->travel(5)->days();
$this->travelBack();

// Scoped
$this->travelTo(now()->addYear(), function (): void {
    expect($subscription->fresh()->isExpired())->toBeTrue();
});
```

Never `sleep()`. Never assert on an unfrozen `now()`.

```php
// ✗ Fails when the test crosses a second boundary
expect($invoice->created_at->toDateTimeString())->toBe(now()->toDateTimeString());

// ✓
$this->freezeTime();
$invoice = Invoice::factory()->create();
expect($invoice->created_at)->toEqual(now());
```

## Randomness

```php
fake()->seed(1234);          // TestCase::setUp()

// For code using Str::random / random_int, assert on properties not values
expect($token)->toHaveLength(64);
expect($ulid)->toMatch('/^[0-9A-HJKMNP-TV-Z]{26}$/');
```

## Authentication

```php
actingAs($user);
actingAs($user, 'api');

Sanctum::actingAs($user, ['invoices:read']);     // token abilities
Sanctum::actingAs($user, ['*']);                  // all abilities

$this->withoutMiddleware(EnsureTenantAccess::class);   // use sparingly
```

**Avoid `withoutMiddleware()` for authorization.** Disabling the middleware you are meant to
be verifying produces a test that passes while the endpoint is wide open. If a test needs
it, the test is asking the wrong question.

## Isolation checklist

Before committing a test, confirm:

- [ ] No real HTTP calls (`Http::preventStrayRequests()` is on)
- [ ] No real filesystem writes outside `Storage::fake()`
- [ ] No real mail, SMS, or push
- [ ] No dependence on wall-clock time
- [ ] No dependence on random values that are asserted on
- [ ] No dependence on another test having run first
- [ ] Passes with `--parallel`
- [ ] Passes with `--order-by=random`
- [ ] Passes ten times in a row (`--repeat=10`)
