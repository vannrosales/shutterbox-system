# One feature, fully tested

Feature: *an admin refunds a paid invoice.* Every test, and why it exists.

## The feature

- Admins and owners may refund; members may not
- Only `paid` invoices, within 90 days
- The refund amount cannot exceed the invoice total
- Refunding restores stock and notifies the customer
- The operation is idempotent — a retry must not double-refund

## Setup

```php
beforeEach(function (): void {
    $this->tenant  = Tenant::factory()->create();
    $this->admin   = User::factory()->for($this->tenant)->admin()->create();
    $this->member  = User::factory()->for($this->tenant)->create();
    $this->invoice = Invoice::factory()->for($this->tenant)->paid()->hasLines(2)->create();

    $this->gateway = new FakePaymentGateway();
    $this->app->instance(PaymentGateway::class, $this->gateway);
});
```

Small and explicit. Every test's preconditions are visible from here.

## 1. Happy path — one test

```php
it('refunds a paid invoice', function (): void {
    Notification::fake();

    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => 5000])
        ->assertOk()
        ->assertJsonPath('data.status', 'refunded');

    expect($this->invoice->fresh()->status)->toBe(InvoiceStatus::Refunded)
        ->and($this->gateway->charges)->toHaveCount(0)
        ->and($this->gateway->refunds)->toHaveCount(1);

    $this->assertDatabaseHas('refunds', [
        'invoice_id'   => $this->invoice->id,
        'amount_minor' => 5000,
        'requested_by' => $this->admin->id,
    ]);

    Notification::assertSentTo($this->invoice->customer, RefundIssued::class);
});
```

One happy-path test proves the wiring: route, middleware, validation, policy, action,
persistence, gateway call, notification, serialisation.

## 2. Authorization — four tests

```php
it('requires authentication', function (): void {
    $this->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => 5000])
        ->assertUnauthorized();
});

it('forbids members from refunding', function (): void {
    actingAs($this->member)
        ->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => 5000])
        ->assertForbidden()
        ->assertJsonPath('error_code', 'forbidden');
});

it('returns 404 for another tenant\'s invoice', function (): void {
    $theirs = Invoice::factory()->paid()->create();      // factory defaults to a NEW tenant

    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $theirs), ['amount_minor' => 5000])
        ->assertNotFound();                               // 404, NOT 403
});

it('rejects a token without the refund ability', function (): void {
    Sanctum::actingAs($this->admin, ['invoices:read']);

    $this->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => 5000])
        ->assertForbidden();
});
```

The third is the most valuable test in this file. A 403 there would confirm the invoice
exists, turning sequential IDs into an enumeration of another tenant's data.

The fourth catches the mistake people actually make: treating a valid token as blanket
authorization.

## 3. Validation boundaries — one dataset, three explicit tests

```php
it('rejects invalid amounts', function (int $amount): void {
    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => $amount])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('amount_minor');
})->with([
    'zero'     => 0,
    'negative' => -100,
]);

it('rejects a refund larger than the invoice total', function (): void {
    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $this->invoice), [
            'amount_minor' => $this->invoice->total_minor + 1,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('amount_minor');
});

it('requires an amount', function (): void {
    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $this->invoice), [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('amount_minor');
});
```

Named dataset keys mean a failure reads `rejects invalid amounts with dataset "negative"`.

## 4. Business rules — the `if` statements

```php
it('refuses to refund a draft invoice', function (): void {
    $draft = Invoice::factory()->for($this->tenant)->draft()->create();

    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $draft), ['amount_minor' => 5000])
        ->assertStatus(409)
        ->assertJsonPath('error_code', 'invoice_not_refundable');
});

it('refuses to refund outside the 90-day window', function (): void {
    $old = Invoice::factory()->for($this->tenant)->paid()->create([
        'paid_at' => now()->subDays(91),
    ]);

    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $old), ['amount_minor' => 5000])
        ->assertStatus(409);
});

it('allows a refund on the 90th day', function (): void {
    $edge = Invoice::factory()->for($this->tenant)->paid()->create([
        'paid_at' => now()->subDays(90),
    ]);

    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $edge), ['amount_minor' => 5000])
        ->assertOk();
});
```

The third test is the one people skip. Off-by-one at a boundary is the most common
business-rule bug, and only a test at the exact boundary catches it.

## 5. Side effects

```php
it('restores stock for every line', function (): void {
    $line    = $this->invoice->lines->first();
    $product = $line->product;
    $before  = $product->stock;

    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => 5000]);

    expect($product->fresh()->stock)->toBe($before + $line->quantity);
});

it('dispatches InvoiceRefunded', function (): void {
    Event::fake([InvoiceRefunded::class]);        // ONLY this event — see below

    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => 5000]);

    Event::assertDispatched(InvoiceRefunded::class,
        fn (InvoiceRefunded $e): bool => $e->invoice->is($this->invoice) && $e->amount->minorUnits === 5000);
});

it('queues the customer notification rather than sending inline', function (): void {
    Notification::fake();

    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => 5000]);

    Notification::assertSentTo($this->invoice->customer, RefundIssued::class,
        fn (RefundIssued $n, array $channels): bool => in_array('mail', $channels, true));
});
```

`Event::fake([InvoiceRefunded::class])` — never bare `Event::fake()`. Faking everything
silences the listeners the feature depends on, so a broken feature passes its own test.

## 6. Idempotency

```php
it('does not double-refund on retry', function (): void {
    Sanctum::actingAs($this->admin, ['invoices:refund']);

    $first = $this->withHeader('Idempotency-Key', 'key-1')
        ->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => 5000]);

    $second = $this->withHeader('Idempotency-Key', 'key-1')
        ->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => 5000]);

    $first->assertOk();
    $second->assertOk()->assertHeader('Idempotent-Replay', 'true');

    expect(Refund::count())->toBe(1)
        ->and($this->gateway->refunds)->toHaveCount(1);
});

it('refuses a second refund without an idempotency key', function (): void {
    actingAs($this->admin);

    $this->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => 5000])
        ->assertOk();

    $this->postJson(route('api.v1.invoices.refund', $this->invoice->fresh()), ['amount_minor' => 5000])
        ->assertStatus(409);                       // already refunded
});
```

Two different protections: the idempotency key handles a network retry; the state check
handles a genuine second attempt. Both need a test.

## 7. Failure handling

```php
it('does not mark the invoice refunded when the gateway fails', function (): void {
    $this->gateway->shouldFail = true;

    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => 5000])
        ->assertStatus(502);

    expect($this->invoice->fresh()->status)->toBe(InvoiceStatus::Paid);

    $this->assertDatabaseCount('refunds', 0);
});
```

This proves the transaction rolls back. Without it, a gateway failure leaves the invoice
marked refunded with no money returned — the worst possible outcome.

## 8. Rate limiting

```php
it('rate limits refunds', function (): void {
    actingAs($this->admin);

    foreach (range(1, 3) as $_) {
        $invoice = Invoice::factory()->for($this->tenant)->paid()->create();
        $this->postJson(route('api.v1.invoices.refund', $invoice), ['amount_minor' => 1000]);
    }

    $extra = Invoice::factory()->for($this->tenant)->paid()->create();

    $this->postJson(route('api.v1.invoices.refund', $extra), ['amount_minor' => 1000])
        ->assertStatus(429)
        ->assertHeader('Retry-After');
});
```

## 9. Contract

```php
it('does not expose internal fields', function (): void {
    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $this->invoice), ['amount_minor' => 5000])
        ->assertJsonMissingPath('data.internal_notes')
        ->assertJsonMissingPath('data.tenant_id');
});
```

## 10. Unit tests for the logic underneath

```php
// tests/Unit/InvoiceTest.php
it('is refundable when paid within 90 days', function (): void {
    $invoice = new Invoice(['status' => InvoiceStatus::Paid, 'paid_at' => now()->subDays(89)]);

    expect($invoice->isRefundable())->toBeTrue();
});

it('is not refundable after 90 days', function (): void {
    $invoice = new Invoice(['status' => InvoiceStatus::Paid, 'paid_at' => now()->subDays(91)]);

    expect($invoice->isRefundable())->toBeFalse();
});

// tests/Unit/MoneyTest.php
it('refuses to add different currencies', function (): void {
    expect(fn () => Money::fromMinor(1000, 'PHP')->plus(Money::fromMinor(500, 'USD')))
        ->toThrow(CurrencyMismatch::class);
});
```

Fast, no database, and they document the rule precisely.

## What the suite covers

| Category | Tests | Prevents |
|---|---|---|
| Happy path | 1 | Broken wiring |
| Authorization | 4 | Privilege escalation, cross-tenant data leak |
| Validation | 4 | Bad data, negative refunds |
| Business rules | 3 | Refunding drafts, off-by-one at the window boundary |
| Side effects | 3 | Lost stock, missing notifications |
| Idempotency | 2 | Double refunds |
| Failure | 1 | Money not returned but marked refunded |
| Rate limiting | 1 | Refund abuse |
| Contract | 1 | Data exposure |
| Unit | 3 | Rule regressions |

**23 tests, roughly 2 seconds.** Sixteen of them test something going wrong — which is
where the expensive bugs live.

## The tests that are not here, and why

- **A test that the controller calls the action.** That is implementation detail; the
  happy-path test already proves the outcome.
- **A test for every getter.** No logic.
- **A browser test.** Nothing about this flow requires JavaScript.
- **A test that `paginate()` works.** Laravel tests that.

## The ordering that matters

If you only have time for five tests on a feature like this:

1. Cross-tenant → 404
2. Insufficient role → 403
3. The business-rule boundary (day 90 vs day 91)
4. Idempotency
5. Happy path

The happy path is last deliberately. It is the one a developer notices is broken within
minutes; the other four fail silently in production for months.
