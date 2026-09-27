# Test data

Factories are the vocabulary of your test suite. Design them like domain code.

## Factory basics

```php
final class InvoiceFactory extends Factory
{
    protected $model = Invoice::class;

    public function definition(): array
    {
        return [
            'tenant_id'   => Tenant::factory(),
            'customer_id' => Customer::factory(),
            'reference'   => 'INV-'.fake()->unique()->numerify('######'),
            'status'      => InvoiceStatus::Draft,
            'total_minor' => fake()->numberBetween(10_000, 1_000_000),
            'currency'    => 'PHP',
            'issued_at'   => null,
            'due_on'      => null,
        ];
    }
}
```

Rules for `definition()`:

- Produce a **valid, minimal, boring** record. Every test starts from it.
- Default to the *initial* state (`Draft`, not a random status) — a random status makes
  tests fail unpredictably.
- Use `Model::factory()` for relations, so the graph builds itself.
- `fake()->unique()` on anything with a unique constraint.

## States name domain concepts

```php
public function paid(): static
{
    return $this->state(fn (array $attributes): array => [
        'status'    => InvoiceStatus::Paid,
        'issued_at' => now()->subDays(7),
        'paid_at'   => now()->subDays(2),
    ]);
}

public function overdue(): static
{
    return $this->state([
        'status' => InvoiceStatus::Issued,
        'due_on' => now()->subWeek(),
    ]);
}

public function forTenant(Tenant $tenant): static
{
    return $this->state(['tenant_id' => $tenant->id]);
}
```

```php
// ✓ Reads as the scenario
Invoice::factory()->overdue()->create();

// ✗ Reads as implementation, and breaks when the rule changes
Invoice::factory()->create(['status' => 'issued', 'due_on' => now()->subWeek()]);
```

When "overdue" gains a third condition, you change one factory method instead of forty
tests. This is the single highest-value factory practice.

## Relationships

```php
// Parent → children
Invoice::factory()->has(Line::factory()->count(3))->create();
Invoice::factory()->hasLines(3)->create();                       // magic method
Invoice::factory()->hasLines(3, ['quantity' => 5])->create();

// Child → parent
Line::factory()->for(Invoice::factory()->paid())->create();
Line::factory()->for($existingInvoice)->create();

// Named relation
Invoice::factory()->for(User::factory(), 'creator')->create();

// Many-to-many with pivot data
User::factory()->hasAttached(Role::factory()->count(2), ['assigned_at' => now()])->create();

// Deep graph
Tenant::factory()
    ->has(User::factory()->count(3))
    ->has(Invoice::factory()->count(5)->hasLines(2))
    ->create();
```

Careful with deep graphs: the last example creates 1 + 3 + 5 + 10 = 19 records. In a test
that only needs one invoice, that is 18 wasted inserts per test. Build only what the test
asserts on.

## Sequences

```php
// Alternating states
Invoice::factory()
    ->count(6)
    ->sequence(
        ['status' => InvoiceStatus::Draft],
        ['status' => InvoiceStatus::Paid],
        ['status' => InvoiceStatus::Void],
    )
    ->create();

// Index-aware
Invoice::factory()
    ->count(5)
    ->sequence(fn (Sequence $s) => ['reference' => 'INV-'.str_pad((string) $s->index, 4, '0', STR_PAD_LEFT)])
    ->create();

// Deterministic dates for ordering tests
Invoice::factory()
    ->count(3)
    ->sequence(fn (Sequence $s) => ['created_at' => now()->subDays(3 - $s->index)])
    ->create();
```

The last pattern matters for pagination and sort tests — random timestamps make ordering
assertions flaky.

## Callbacks

```php
public function configure(): static
{
    return $this->afterCreating(function (Invoice $invoice): void {
        $invoice->update(['total_minor' => $invoice->lines()->sum(
            DB::raw('quantity * unit_price_minor')
        )]);
    });
}
```

Use `afterCreating` for derived values that depend on children. Use `afterMaking` for
attribute adjustments that do not need persistence.

Keep callbacks cheap — they run for every record created, everywhere.

## Faker discipline

```php
// ✓ Deterministic enough, realistic enough
'reference' => 'INV-'.fake()->unique()->numerify('######'),
'name'      => fake()->company(),
'email'     => fake()->unique()->safeEmail(),

// ✗ Random values that can hit a boundary and fail one run in fifty
'total_minor' => fake()->numberBetween(0, 1_000_000),      // 0 may be invalid
'status'      => fake()->randomElement(InvoiceStatus::cases()),
'due_on'      => fake()->dateTimeBetween('-1 year', '+1 year'),   // overdue or not?
```

Rules:
- **Never randomise anything a test asserts on.** If the test cares about the status, the
  factory must not randomise it.
- Bound random numbers away from validation boundaries.
- `safeEmail()` and `safeDomain()` — Faker's plain `email()` can generate real domains, and
  a test that accidentally sends mail to a real address is a bad day.
- Seed for reproducibility:

```php
// TestCase::setUp()
fake()->seed(1234);
```

A test that fails one run in fifty is worse than no test, and randomised factory data is
the usual cause.

### Locale

```php
// config/app.php or the factory
fake('fil_PH')->name();
fake('fil_PH')->address();
```

For Philippine applications, realistic local data catches formatting bugs that
`fake()->address()` (US format) does not — postal codes, mobile-number prefixes, and name
lengths all differ.

## Seeders vs factories

| | Factories | Seeders |
|---|---|---|
| Purpose | Test data, per test | Reference data, or a demo dataset |
| Scope | One test | The whole database |
| In tests | Always | Only for reference data |

```php
// ✗ Never run the full seeder in a test — slow, and hides the test's real preconditions
$this->seed();

// ✓ Only genuinely-required reference data
$this->seed(CountrySeeder::class);
```

```php
// Or once per parallel database
ParallelTesting::setUpTestDatabase(function (): void {
    Artisan::call('db:seed', ['--class' => ReferenceDataSeeder::class]);
});
```

A test that depends on `DatabaseSeeder` breaks whenever someone adds demo data, and its
preconditions are invisible at the call site.

## Building the right amount

```php
// ✗ 50 records to test that the endpoint returns a list
Invoice::factory()->count(50)->create();

// ✓ 2 records prove ordering and filtering
Invoice::factory()->paid()->create(['reference' => 'A']);
Invoice::factory()->draft()->create(['reference' => 'B']);
```

Exceptions — cases where volume *is* the thing under test:

```php
// N+1 detection needs enough rows for the pattern to show
it('lists invoices without an N+1', function (): void {
    Invoice::factory()->count(50)->for($this->tenant)->hasLines(3)->create();

    assertQueryCountUnder(10, fn () => $this->getJson('/api/v1/invoices')->assertOk());
});

// Pagination boundaries
it('paginates at 20 per page', function (): void {
    Invoice::factory()->count(25)->for($this->tenant)->create();

    $this->getJson('/api/v1/invoices')->assertJsonCount(20, 'data');
});
```

## Multi-tenant factories

```php
public function definition(): array
{
    return [
        'tenant_id' => Tenant::factory(),      // creates a NEW tenant by default
        // ...
    ];
}
```

That default is deliberate: `Invoice::factory()->create()` produces an invoice belonging to
**someone else**, which is exactly what a cross-tenant test needs.

```php
it('returns 404 for another tenant\'s invoice', function (): void {
    $theirs = Invoice::factory()->create();       // different tenant, by default

    actingAs($this->user)
        ->getJson(route('api.v1.invoices.show', $theirs))
        ->assertNotFound();
});

it('lists only my tenant\'s invoices', function (): void {
    Invoice::factory()->count(3)->for($this->tenant)->create();
    Invoice::factory()->count(5)->create();       // other tenants

    actingAs($this->user)->getJson('/api/v1/invoices')->assertJsonCount(3, 'data');
});
```

If the factory defaulted to the *current* tenant, both tests would silently pass while the
application leaked data.

## Factories for value objects and DTOs

```php
// tests/Support/Factories/RefundInvoiceDataFactory.php
final class RefundInvoiceDataFactory
{
    public static function make(array $overrides = []): RefundInvoiceData
    {
        return new RefundInvoiceData(
            amount:  $overrides['amount'] ?? Money::fromMinor(5000, 'PHP'),
            actorId: $overrides['actorId'] ?? User::factory()->create()->id,
            reason:  $overrides['reason'] ?? null,
        );
    }
}
```

A plain static factory is enough. Every test that constructs the DTO by hand breaks when it
gains a parameter.

## Media and files

```php
Storage::fake('private');

$file = UploadedFile::fake()->image('photo.jpg', 1200, 800);
$pdf  = UploadedFile::fake()->create('document.pdf', 500, 'application/pdf');

// For a security test, real content matters
$malicious = UploadedFile::fake()->createWithContent('shell.jpg', '<?php system($_GET["c"]); ?>');
```

`createWithContent` is what lets you prove `mimetypes:` validation actually sniffs content.
See `laravel-media-management`.

## Keeping factories honest

```php
it('every factory produces a valid model', function (string $factory): void {
    $model = $factory::new()->create();

    expect($model->exists)->toBeTrue();
})->with(function (): array {
    return collect(File::files(database_path('factories')))
        ->map(fn (SplFileInfo $f): string => 'Database\\Factories\\'.$f->getFilenameWithoutExtension())
        ->filter(fn (string $c): bool => class_exists($c))
        ->all();
});
```

One test that instantiates every factory catches the broken one before forty other tests
fail with a confusing error.
