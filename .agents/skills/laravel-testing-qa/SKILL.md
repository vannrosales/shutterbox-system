---
name: laravel-testing-qa
description: Use when writing or reviewing tests, adding a feature that needs test coverage, setting up Pest or PHPUnit, creating factories or seeders, mocking external services, or deciding what to test. Covers feature/unit/API/browser tests, test data design, fakes vs mocks, coverage policy, and regression tests for accessibility, security, and performance. Triggers on "test", "Pest", "PHPUnit", "factory", "seeder", "mock", "coverage", "CI", "flaky", "assert", or any new feature that ships without tests.
---

# Testing & Quality Assurance

A test exists to make a specific failure impossible to ship twice. If you cannot name the
failure it prevents, do not write it.

## What to test, in priority order

1. **The negative paths.** Authorization denials, validation boundaries, cross-tenant
   access. These are where bugs cost the most and where coverage is usually thinnest.
2. **Business rules.** The `if` statements in your actions.
3. **The happy path.** One per endpoint, proving the wiring works.
4. **Regressions.** Every production bug gets a test before the fix.
5. **Contracts.** API response shapes, event payloads, job signatures.

A suite that only proves the happy path works proves almost nothing.

## The test pyramid, applied

| Layer | Count | Speed | Tests |
|---|---|---|---|
| **Feature** | Most | ~50ms | HTTP request → response, through the real stack |
| **Unit** | Many | <5ms | Pure logic: value objects, calculators, DTOs, enums |
| **Integration** | Some | ~100ms | Actions with a real database, jobs, listeners |
| **Browser** | Few | ~2s | Journeys that only exist in the browser: JS, focus, drag |

Laravel inverts the classic pyramid: **feature tests are the default**. They exercise
routing, middleware, validation, authorization, the action, and serialisation in one pass,
at a cost that is still measured in milliseconds.

Reach for a unit test when the logic is genuinely independent of the framework.

## Pest — the default

```php
it('refunds a paid invoice', function (): void {
    $invoice = Invoice::factory()->paid()->for($this->tenant)->create();

    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $invoice), ['amount_minor' => 5000])
        ->assertOk();

    expect($invoice->fresh()->status)->toBe(InvoiceStatus::Refunded);
});

it('forbids refunding another tenant\'s invoice', function (): void {
    $invoice = Invoice::factory()->paid()->create();      // different tenant

    actingAs($this->admin)
        ->postJson(route('api.v1.invoices.refund', $invoice), ['amount_minor' => 5000])
        ->assertNotFound();                                // 404, not 403
});
```

PHPUnit classes are equally valid. **Match the project** — a codebase with both styles is
worse than either alone.

## Factories carry the domain

```php
final class InvoiceFactory extends Factory
{
    public function definition(): array
    {
        return [
            'tenant_id'   => Tenant::factory(),
            'customer_id' => Customer::factory(),
            'reference'   => 'INV-'.fake()->unique()->numerify('####'),
            'status'      => InvoiceStatus::Draft,
            'total_minor' => fake()->numberBetween(10_000, 1_000_000),
            'currency'    => 'PHP',
            'issued_at'   => null,
        ];
    }

    public function paid(): static
    {
        return $this->state(['status' => InvoiceStatus::Paid, 'issued_at' => now()->subDays(7)]);
    }

    public function overdue(): static
    {
        return $this->state(['status' => InvoiceStatus::Issued, 'due_on' => now()->subWeek()]);
    }
}
```

States name domain concepts. `Invoice::factory()->overdue()` reads as the scenario;
`Invoice::factory()->create(['due_on' => now()->subWeek(), 'status' => 'issued'])` does not,
and it breaks when the rule changes.

Never seed the database in a test with production seeders — build exactly the state the
test needs and nothing more.

## Fakes over mocks

```php
Queue::fake();       Bus::fake();
Mail::fake();        Notification::fake();
Event::fake();       Storage::fake('private');
Http::fake(['api.stripe.com/*' => Http::response(['id' => 'ch_123'], 200)]);
```

Laravel's fakes assert on real behaviour. Reserve `Mockery` for your own interfaces where
no fake exists, and prefer a hand-written test double over a mock with five expectations —
a mock that asserts implementation detail breaks on every refactor.

```php
// Better than mocking: a real fake you control
$this->app->bind(PaymentGateway::class, FakePaymentGateway::class);
```

**Never let a test hit the network.** `Http::preventStrayRequests()` in `TestCase::setUp()`
turns an accidental real call into a clear failure instead of a flaky test.

## Beyond correctness

These are cheap and catch what code review does not:

```php
// Query count — the only thing that keeps an N+1 fix fixed
it('lists invoices without an N+1', function (): void {
    Invoice::factory()->count(50)->for($this->tenant)->create();

    assertQueryCountUnder(10, fn () =>
        actingAs($this->user)->get('/invoices')->assertOk()
    );
});

// Authorization — write one per tenant-scoped resource
it('returns 404 for another tenant\'s record', function (): void { /* ... */ });

// Accessibility — zero violations, not "logs violations"
it('has no accessibility violations on checkout', function (): void { /* axe */ });

// Response contract
it('never exposes internal fields', function (): void {
    actingAs($this->viewer)->getJson("/api/v1/invoices/{$invoice->id}")
        ->assertJsonMissingPath('data.internal_notes');
});
```

## Coverage — a signal, not a target

Chasing a percentage produces tests that assert nothing. What matters:

| Code | Expectation |
|---|---|
| Actions, services, policies | Near-total. This is the business logic. |
| Form Requests | Every rule boundary |
| API Resources | Shape, and absence of internal fields |
| Jobs, listeners | Behaviour and idempotency |
| Models | Scopes and predicates only |
| Controllers | Covered incidentally by feature tests |
| Config, migrations | Not directly |

Use coverage to find **untested branches**, then judge whether each one matters.

```bash
php artisan test --coverage --min=80
```

Set a floor to stop erosion; do not treat the number as the goal.

## Speed

```bash
php artisan test --parallel          # 4-8x on multi-core
php artisan test --dirty             # only tests for changed files
```

```xml
<!-- phpunit.xml -->
<env name="DB_CONNECTION" value="sqlite"/>
<env name="DB_DATABASE" value=":memory:"/>
<env name="CACHE_STORE" value="array"/>
<env name="QUEUE_CONNECTION" value="sync"/>
<env name="MAIL_MAILER" value="array"/>
<env name="BCRYPT_ROUNDS" value="4"/>
```

`BCRYPT_ROUNDS=4` alone often halves suite time.

**But**: SQLite hides real schema problems (different type coercion, lax FK enforcement).
Run against the production engine in CI at least once per pipeline. See
`references/setup.md`.

A slow suite is a suite that stops being run. Target: under 60 seconds locally.

## Scope boundaries

Owns: test structure, factories, fakes, assertions, coverage policy, CI test configuration,
flake elimination.

Does not own: what the code should do (skills 1–8 define the rules; this skill verifies
them), static analysis (`laravel-code-quality`), CI infrastructure
(`laravel-devops-deployment`).

## Bundled resources

- `references/setup.md` — Pest/PHPUnit config, database strategy, parallelism, CI
- `references/writing-tests.md` — feature, unit, integration; structure, naming, assertions
- `references/test-data.md` — factories, states, relationships, seeders, faker discipline
- `references/mocking.md` — fakes, doubles, time, HTTP, filesystem, external services
- `references/specialist-tests.md` — accessibility, security, performance, browser
- `templates/` — `Pest.php`, `TestCase`, factory stub, helpers, CI workflow
- `examples/feature-test-suite.md` — one feature, fully tested, with the reasoning
- `checklists/test-review.md` — pre-merge gate

---
Last reviewed: 2026-07-31 · See MAINTENANCE.md
