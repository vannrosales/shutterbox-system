# One resource, every layer

A complete `invoices` API: routes, auth, validation, controller, resource, errors, docs,
tests.

## Routes

```php
// routes/api.php
Route::prefix('v1')->name('api.v1.')->middleware(['throttle:api'])->group(function (): void {
    Route::post('/tokens', IssueTokenController::class)
        ->middleware('throttle:login')
        ->name('tokens.store');

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('/invoices',            ListInvoicesController::class)->name('invoices.index');
        Route::post('/invoices',           CreateInvoiceController::class)
            ->middleware(['ability:invoices:create', 'idempotent'])->name('invoices.store');
        Route::get('/invoices/{invoice}',  ShowInvoiceController::class)->name('invoices.show');
        Route::patch('/invoices/{invoice}', UpdateInvoiceController::class)
            ->middleware('ability:invoices:update')->name('invoices.update');
        Route::delete('/invoices/{invoice}', DeleteInvoiceController::class)
            ->middleware('ability:invoices:delete')->name('invoices.destroy');

        // Not CRUD → a sub-resource, not a top-level verb
        Route::post('/invoices/{invoice}/refund', RefundInvoiceController::class)
            ->middleware(['ability:invoices:refund', 'idempotent', 'throttle:refunds'])
            ->name('invoices.refund');
    });
});
```

Every route: authenticated, ability-scoped, rate limited. Write operations that create or
charge are idempotent.

## Global middleware

```php
// bootstrap/app.php
->withMiddleware(function (Middleware $middleware): void {
    $middleware->api(prepend: [
        AssignRequestId::class,      // X-Request-Id → Context → logs → queued jobs
        ForceJsonResponse::class,    // or a client without Accept gets an HTML redirect
    ]);

    $middleware->alias([
        'idempotent' => EnsureIdempotency::class,
    ]);
})
->withExceptions(require base_path('bootstrap/api-exceptions.php'))
```

## List endpoint

```php
final class ListInvoicesController
{
    public function __invoke(ListInvoicesRequest $request): AnonymousResourceCollection
    {
        [$column, $direction] = $request->sortColumn();
        $filters = $request->collect('filter');

        $invoices = Invoice::query()
            ->visibleTo($request->user())                        // tenant scope FIRST
            ->when($filters->get('status'),
                fn (Builder $q, string $s) => $q->where('status', $s))
            ->when($filters->get('customer_id'),
                fn (Builder $q, int $id) => $q->where('customer_id', $id))
            ->when($filters->get('created_after'),
                fn (Builder $q, string $d) => $q->where('created_at', '>=', $d))
            ->when($filters->get('search'),
                fn (Builder $q, string $t) => $q->whereFullText(['reference', 'notes'], $t))
            ->with($request->includes())                          // whitelisted
            ->withCount('lines')
            ->orderBy($column, $direction)
            ->orderBy('id', $direction)                           // cursor tiebreaker
            ->cursorPaginate($request->perPage())
            ->withQueryString();                                  // keep filters in links

        return InvoiceResource::collection($invoices);
    }
}
```

```http
GET /api/v1/invoices?filter[status]=paid&sort=-issued_at&include=customer&per_page=25
Authorization: Bearer 1|abc...
Accept: application/json
```

```json
{
  "data": [
    {
      "id": 142,
      "reference": "INV-2026-0142",
      "status": "paid",
      "status_label": "Paid",
      "total": { "minor": 1499000, "currency": "PHP", "formatted": "₱14,990.00" },
      "issued_at": "2026-07-15T02:00:00+00:00",
      "due_on": "2026-08-14",
      "lines_count": 3,
      "customer": { "id": 7, "name": "Acme Corporation" },
      "can": { "update": false, "delete": false, "refund": true }
    }
  ],
  "links": { "first": null, "last": null, "prev": null,
             "next": "https://api.example.com/v1/invoices?filter%5Bstatus%5D=paid&cursor=eyJpZCI6MTQyfQ" },
  "meta": { "path": "https://api.example.com/v1/invoices", "per_page": 25,
            "next_cursor": "eyJpZCI6MTQyfQ", "prev_cursor": null }
}
```

Note: `lines` is absent because it was not in `include`. `customer` is present because it
was. The client controls the cost.

## Create endpoint

```php
final class CreateInvoiceController
{
    public function __invoke(StoreInvoiceRequest $request, CreateInvoice $action): JsonResponse
    {
        $invoice = $action->handle(
            $request->user()->tenant,
            CreateInvoiceData::fromRequest($request),
        );

        return InvoiceResource::make($invoice->load('lines'))
            ->response()
            ->setStatusCode(201)
            ->header('Location', route('api.v1.invoices.show', $invoice));
    }
}
```

```http
POST /api/v1/invoices
Authorization: Bearer 1|abc...
Idempotency-Key: 01J8XK3M7QRVWXYZ
Content-Type: application/json

{
  "reference": "INV-2026-0143",
  "status": "draft",
  "total_minor": 1499000,
  "currency": "PHP",
  "issued_at": "2026-07-31T02:00:00+00:00",
  "due_on": "2026-08-30",
  "lines": [
    { "description": "Consulting", "quantity": 10, "unit_price_minor": 149900 }
  ]
}
```

```http
HTTP/1.1 201 Created
Location: https://api.example.com/v1/invoices/143
X-Request-Id: 01J8XK4N2PQRSTUV
```

A retry with the same `Idempotency-Key` returns the identical 201 body with
`Idempotent-Replay: true` — no second invoice.

## Action — HTTP-free

```php
final class CreateInvoice
{
    public function handle(Tenant $tenant, CreateInvoiceData $data): Invoice
    {
        if ($tenant->hasReachedInvoiceLimit()) {
            throw new InvoiceLimitReached($tenant);      // domain exception, not abort()
        }

        return DB::transaction(function () use ($tenant, $data): Invoice {
            $invoice = $tenant->invoices()->create([...]);

            $invoice->lines()->createMany($data->lines);

            InvoiceCreated::dispatch($invoice);           // consequences live in listeners

            return $invoice;
        });
    }
}
```

The action knows nothing about HTTP. The same code runs from a queued job, an Artisan
command, and a test. See `laravel-enterprise-architecture`.

## Domain exception → status code

```php
final class InvoiceLimitReached extends DomainException
{
    public function __construct(public readonly Tenant $tenant)
    {
        parent::__construct(__('You have reached your plan\'s invoice limit.'));
    }

    public function errorCode(): string { return 'invoice_limit_reached'; }
    public function status(): int       { return 409; }
}
```

```json
{
  "message": "You have reached your plan's invoice limit.",
  "error_code": "invoice_limit_reached",
  "request_id": "01J8XK4N2PQRSTUV"
}
```

The client branches on `error_code`. Translating `message` breaks nothing.

## Error responses

```http
HTTP/1.1 422 Unprocessable Content
```
```json
{
  "message": "The given data was invalid.",
  "errors": {
    "reference": ["The reference has already been taken."],
    "lines.0.quantity": ["The quantity must be at least 1."]
  },
  "error_code": "validation_failed",
  "request_id": "01J8XK5..."
}
```

```http
HTTP/1.1 404 Not Found
```
```json
{ "message": "Resource not found.", "error_code": "not_found", "request_id": "01J8XK6..." }
```

That 404 is returned for **another tenant's** invoice. A 403 would confirm it exists.

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42
```
```json
{ "message": "Too many requests. Please slow down.", "error_code": "rate_limited", "request_id": "..." }
```

## Documentation

```markdown
### GET /v1/invoices

Lists invoices visible to the authenticated user, newest first.

**Scope:** `invoices:read`
**Rate limit:** 60/min

| Parameter | Type | Description |
|---|---|---|
| `filter[status]` | string | `draft`, `issued`, `paid`, `void`. Tolerate new values. |
| `filter[search]` | string | Full-text over reference and notes. 2–100 chars. |
| `sort` | string | `issued_at`, `total_minor`, `reference`. Prefix `-` for descending. Default `-issued_at`. |
| `include` | string | Comma-separated: `customer`, `lines`. Max 3. |
| `per_page` | integer | 1–100. Default 20. |
| `cursor` | string | Opaque. Use `links.next`; do not construct it. |

**`total.minor` is in centavos**, not pesos. Divide by 100 for display.

Cursor pagination: no total count, no page jumping. Follow `links.next` until null.
```

The unit note is not optional. An undocumented `total` costs more support time than
everything else combined.

## Tests

```php
it('lists only the authenticated tenant\'s invoices', function (): void {
    $mine = Invoice::factory()->count(3)->for($user->tenant)->create();
    Invoice::factory()->count(5)->create();                       // other tenants

    Sanctum::actingAs($user, ['invoices:read']);

    $this->getJson('/api/v1/invoices')
        ->assertOk()
        ->assertJsonCount(3, 'data');
});

it('returns 404 for another tenant\'s invoice', function (): void {
    Sanctum::actingAs($user, ['invoices:read']);

    $this->getJson('/api/v1/invoices/'.Invoice::factory()->create()->id)
        ->assertNotFound()
        ->assertJsonPath('error_code', 'not_found');
});

it('rejects a token without the create ability', function (): void {
    Sanctum::actingAs($user, ['invoices:read']);

    $this->postJson('/api/v1/invoices', [])->assertForbidden();
});

it('is idempotent on create', function (): void {
    Sanctum::actingAs($user, ['invoices:create']);
    $payload = Invoice::factory()->raw();

    $first  = $this->withHeader('Idempotency-Key', 'abc')->postJson('/api/v1/invoices', $payload);
    $second = $this->withHeader('Idempotency-Key', 'abc')->postJson('/api/v1/invoices', $payload);

    $first->assertCreated();
    $second->assertCreated()->assertHeader('Idempotent-Replay', 'true');

    expect(Invoice::count())->toBe(1);
});

it('rejects an unknown sort column', function (): void {
    Sanctum::actingAs($user, ['invoices:read']);

    $this->getJson('/api/v1/invoices?sort=password')->assertUnprocessable();
});

it('never exposes internal fields', function (): void {
    Sanctum::actingAs($viewer, ['invoices:read']);

    $this->getJson("/api/v1/invoices/{$invoice->id}")
        ->assertJsonMissingPath('data.internal_notes')
        ->assertJsonMissingPath('data.tenant_id');
});

it('lists with a bounded query count', function (): void {
    Invoice::factory()->count(50)->for($user->tenant)->hasLines(3)->create();
    Sanctum::actingAs($user, ['invoices:read']);

    assertQueryCountUnder(10, fn () =>
        $this->getJson('/api/v1/invoices?include=customer,lines')->assertOk()
    );
});

it('matches the published OpenAPI spec', function (): void {
    Sanctum::actingAs($user, ['invoices:read']);

    $response = $this->getJson('/api/v1/invoices')->assertOk();

    assertMatchesOpenApi($response, 'get', '/invoices');
});
```

## Every decision, and why

| Decision | Reason |
|---|---|
| `/v1/` in the path | Visible in logs, curl-able, cacheable |
| `data` wrapper | Room to add `meta` without a breaking change |
| `error_code` field | Clients never parse `message`; translation is free |
| `request_id` everywhere | One field turns a support ticket into a log query |
| 404 for cross-tenant | A 403 confirms existence |
| `whenLoaded` on every relation | Otherwise 50 rows = 50 extra queries |
| `cursorPaginate` | No `COUNT`, no `OFFSET`; constant time at any depth |
| `orderBy('id')` tiebreaker | Without it, cursor pagination skips and repeats rows |
| `withQueryString()` | Otherwise "next page" silently drops the filters |
| Whitelisted sort | Unvalidated sort into `orderByRaw` is SQL injection |
| Whitelisted, capped includes | `?include=a.b.c.d.e` is a DoS from one GET |
| `per_page` capped at 100 | An uncapped page size is a one-request outage |
| Token abilities | A stolen read token cannot issue refunds |
| Idempotency on create/refund | A timeout retry would otherwise double-charge |
| Money as integer minor units | Floats lose money; JSON numbers lose precision |
| ISO 8601 UTC | The client owns presentation |
| Enum value + label | Client branches on the value, renders the label |
| Domain exception → status | The action stays free of HTTP concerns |
| Contract test vs OpenAPI | The spec stays true, not aspirational |
