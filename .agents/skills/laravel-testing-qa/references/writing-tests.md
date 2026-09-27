# Writing tests

## Structure

Arrange, act, assert. Visible in every test, with blank lines between.

```php
it('marks the invoice as refunded and restores stock', function (): void {
    // Arrange
    $invoice = Invoice::factory()->paid()->for($this->tenant)->hasLines(2)->create();
    $product = $invoice->lines->first()->product;
    $stockBefore = $product->stock;

    // Act
    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $invoice), ['amount_minor' => 5000])
        ->assertOk();

    // Assert
    expect($invoice->fresh()->status)->toBe(InvoiceStatus::Refunded)
        ->and($product->fresh()->stock)->toBe($stockBefore + $invoice->lines->first()->quantity);
});
```

## Naming

The name states the behaviour, not the method.

```php
// ✗ Describes implementation
it('tests refund');
it('refund method works');
public function test_refund_controller_store()

// ✓ Describes behaviour and condition
it('refunds a paid invoice within the 90-day window');
it('rejects a refund for an invoice older than 90 days');
it('returns 404 when refunding another tenant\'s invoice');
```

When a test fails in CI, the name should tell you what broke without opening the file.

## Feature tests — the default

```php
it('creates an invoice', function (): void {
    Sanctum::actingAs($this->user, ['invoices:create']);

    $response = $this->postJson('/api/v1/invoices', [
        'reference'   => 'INV-0001',
        'total_minor' => 149900,
        'currency'    => 'PHP',
        'lines'       => [['description' => 'Consulting', 'quantity' => 1, 'unit_price_minor' => 149900]],
    ]);

    $response->assertCreated()
        ->assertJsonPath('data.reference', 'INV-0001')
        ->assertJsonPath('data.total.minor', 149900);

    $this->assertDatabaseHas('invoices', [
        'reference' => 'INV-0001',
        'tenant_id' => $this->user->tenant_id,
    ]);
});
```

One feature test covers routing, middleware, validation, authorization, the action,
persistence, and serialisation. That breadth is why it is the default in Laravel.

### The four tests every endpoint needs

```php
// 1. Happy path
it('creates an invoice', ...);

// 2. Unauthenticated
it('requires authentication', function (): void {
    $this->postJson('/api/v1/invoices', [])->assertUnauthorized();
});

// 3. Unauthorized — and cross-tenant returns 404, not 403
it('returns 404 for another tenant\'s invoice', function (): void {
    Sanctum::actingAs($this->user, ['invoices:read']);

    $this->getJson('/api/v1/invoices/'.Invoice::factory()->create()->id)
        ->assertNotFound();
});

// 4. Validation boundaries
it('rejects an invoice with no lines', function (): void {
    Sanctum::actingAs($this->user, ['invoices:create']);

    $this->postJson('/api/v1/invoices', ['lines' => []])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('lines');
});
```

Number 3 is the one most often missing, and the one that matters most.

## Unit tests — for logic that stands alone

```php
it('rejects a negative amount', function (): void {
    expect(fn () => Money::fromMinor(-1, 'PHP'))
        ->toThrow(InvalidArgumentException::class);
});

it('adds two amounts in the same currency', function (): void {
    $sum = Money::fromMinor(1000, 'PHP')->plus(Money::fromMinor(500, 'PHP'));

    expect($sum->minorUnits)->toBe(1500);
});

it('refuses to add different currencies', function (): void {
    expect(fn () => Money::fromMinor(1000, 'PHP')->plus(Money::fromMinor(500, 'USD')))
        ->toThrow(CurrencyMismatch::class);
});
```

Good unit-test candidates: value objects, enums with behaviour, DTO transformations, pure
calculators, custom validation rules, formatters.

**Not** good candidates: controllers, Eloquent models, anything that needs the container.
Testing those in isolation means mocking the framework, which tests the mocks.

## Integration tests — actions with a real database

```php
it('does not restore stock twice when refunded twice', function (): void {
    $invoice = Invoice::factory()->paid()->hasLines(1)->create();
    $product = $invoice->lines->first()->product;
    $before  = $product->stock;

    $action = app(RefundInvoice::class);
    $data   = new RefundInvoiceData(Money::fromMinor(5000, 'PHP'), $this->admin->id);

    $action->handle($invoice, $data);

    expect(fn () => $action->handle($invoice->fresh(), $data))
        ->toThrow(InvoiceNotRefundable::class);

    expect($product->fresh()->stock)->toBe($before + $invoice->lines->first()->quantity);
});
```

Test the action directly when the interesting behaviour is below HTTP: transactions,
idempotency, event dispatch, race conditions.

## Assertions

### Response

```php
$response
    ->assertOk()                       // 200
    ->assertCreated()                  // 201
    ->assertNoContent()                // 204
    ->assertUnauthorized()             // 401
    ->assertForbidden()                // 403
    ->assertNotFound()                 // 404
    ->assertUnprocessable()            // 422
    ->assertStatus(429);

$response
    ->assertJsonPath('data.status', 'paid')
    ->assertJsonStructure(['data' => ['id', 'total' => ['minor', 'currency']]])
    ->assertJsonCount(3, 'data')
    ->assertJsonValidationErrors(['email', 'lines.0.quantity'])
    ->assertJsonMissingPath('data.internal_notes')
    ->assertHeader('Location')
    ->assertRedirect(route('invoices.index'));
```

`assertJsonPath` over `assertJson`: it asserts an exact value at an exact location, so it
fails when the shape changes rather than passing on a partial match.

`assertJsonMissingPath` is the security assertion — it fails the moment someone adds a
sensitive field to a Resource.

### Database

```php
$this->assertDatabaseHas('invoices', ['reference' => 'INV-0001', 'status' => 'paid']);
$this->assertDatabaseMissing('invoices', ['reference' => 'INV-0002']);
$this->assertDatabaseCount('invoices', 3);
$this->assertSoftDeleted($invoice);
$this->assertModelExists($invoice);
$this->assertModelMissing($invoice);
```

Assert on **business-meaningful columns**, not on every column — a test that asserts
`updated_at` breaks for no reason.

### Pest expectations

```php
expect($invoice->status)->toBe(InvoiceStatus::Refunded);
expect($invoice->total)->toEqual($expected);          // loose, for value objects
expect($collection)->toHaveCount(3);
expect($result)->toBeInstanceOf(Refund::class);
expect($value)->toBeNull();
expect($items)->toContain('a')->not->toContain('b');
expect($n)->toBeGreaterThan(5)->toBeLessThan(10);
expect(fn () => $action->handle())->toThrow(DomainException::class, 'expected message');

// Chaining with ->and() keeps related assertions in one statement
expect($invoice->fresh())
    ->status->toBe(InvoiceStatus::Refunded)
    ->and($invoice->refunds)->toHaveCount(1);
```

### Events, jobs, notifications

```php
Event::fake([InvoiceRefunded::class]);        // fake ONLY what you assert on
// ...
Event::assertDispatched(InvoiceRefunded::class, fn ($e) => $e->invoice->is($invoice));
Event::assertNotDispatched(InvoiceCreated::class);

Queue::fake();
Queue::assertPushed(GenerateStatement::class);
Queue::assertPushedOn('reports', GenerateStatement::class);
Queue::assertNothingPushed();

Notification::fake();
Notification::assertSentTo($user, RefundIssued::class,
    fn (RefundIssued $n) => $n->amount->minorUnits === 5000);
Notification::assertNothingSent();
```

`Event::fake()` with no arguments fakes **everything**, including the events your feature
depends on — so the feature stops working and the test still passes. Always pass the list.

## Datasets — one behaviour, many inputs

```php
it('rejects invalid amounts', function (int $amount): void {
    Sanctum::actingAs($this->user, ['invoices:refund']);

    $this->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => $amount])
        ->assertUnprocessable();
})->with([
    'zero'      => 0,
    'negative'  => -100,
    'too large' => 100_000_000,
]);
```

Named keys, so a failure says `rejects invalid amounts with dataset "negative"`.

Use datasets for **the same behaviour with different inputs**. If the assertions differ per
case, write separate tests.

## Setup

```php
beforeEach(function (): void {
    $this->tenant = Tenant::factory()->create();
    $this->admin  = User::factory()->for($this->tenant)->admin()->create();
});
```

```php
// Or a shared helper for a group of files
function actingAsAdmin(): TestCase
{
    return test()->actingAs(User::factory()->admin()->create());
}
```

Keep `beforeEach` small. A large shared setup makes each test's actual preconditions
invisible, and couples unrelated tests together.

## Time

```php
it('marks an invoice overdue after the due date', function (): void {
    $invoice = Invoice::factory()->issued()->create(['due_on' => now()->addDays(7)]);

    expect($invoice->isOverdue())->toBeFalse();

    $this->travelTo(now()->addDays(8));

    expect($invoice->fresh()->isOverdue())->toBeTrue();
});

it('records an exact timestamp', function (): void {
    $this->freezeTime();

    $invoice = Invoice::factory()->create();

    expect($invoice->created_at)->toEqual(now());
});
```

Never `sleep()`. Never assert on `now()` without freezing — a test that compares timestamps
across a millisecond boundary fails at random.

## What not to test

| Do not test | Why |
|---|---|
| Framework behaviour | Laravel tests `paginate()` already |
| Getters and setters | No logic |
| Config values | Test what depends on them |
| Third-party libraries | Test your integration, not their code |
| Private methods | Test through the public API; if it needs its own test, extract a class |
| Exact SQL strings | Brittle; assert on results |
| `updated_at` | Changes for reasons unrelated to the test |

## Test smells

| Smell | Problem | Fix |
|---|---|---|
| No assertions | Proves nothing | Assert the outcome |
| Asserts everything | Fails on unrelated changes | Assert what the test is about |
| Fails intermittently | Trains people to re-run | Fix or delete |
| 100 lines of setup | The unit under test is too large | Extract classes |
| Copies the implementation | Passes when the implementation is wrong | Assert the outcome |
| Mocks five collaborators | Tests the mocks | Use a fake, or test at a higher level |
| Name says "works" | Says nothing | Name the behaviour |
| Depends on run order | Hidden shared state | `RefreshDatabase`, no statics |
| Comments explaining the setup | The factory should say it | Named factory states |
