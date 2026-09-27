# Versioning

## Strategy

| Approach | Example | Verdict |
|---|---|---|
| **URI path** | `/api/v1/invoices` | **Default.** Visible in logs, cacheable, curl-able |
| Header | `Accept: application/vnd.example.v2+json` | Purer REST; harder to test and debug |
| Query param | `/api/invoices?version=2` | Easy to omit accidentally; caching problems |
| No versioning | — | Only for a private API with one client you control |

Use the URI. The theoretical purity of header versioning is not worth losing "paste this
curl command into a ticket".

```php
// bootstrap/app.php
->withRouting(
    api: __DIR__.'/../routes/api.php',
    apiPrefix: 'api',
)
```

```php
// routes/api.php
Route::prefix('v1')->name('api.v1.')->group(base_path('routes/api/v1.php'));
Route::prefix('v2')->name('api.v2.')->group(base_path('routes/api/v2.php'));
```

Version the **whole API**, not per endpoint. Per-endpoint versions (`/v1/invoices` and
`/v3/customers`) become impossible to document or reason about.

## What is a breaking change

**Breaking — requires a new version:**

| Change | Why |
|---|---|
| Removing a field | Client reads it |
| Renaming a field | Same |
| Changing a field's type | `"total": 100` → `"total": "100.00"` breaks parsing |
| Changing a status code | Client branches on it |
| Adding a required request field | Existing requests now fail |
| Tightening validation | Previously-valid requests now fail |
| Changing default sort or page size | Silent behaviour change |
| Changing an error code string | Client branches on it |
| Making an optional field required in a response | Only if clients relied on absence |
| Changing pagination style | `page` → `cursor` breaks every client |

**Non-breaking — safe in the current version:**

| Change | Condition |
|---|---|
| Adding an optional response field | Clients must ignore unknown fields |
| Adding an optional request field | With a backwards-compatible default |
| Adding an endpoint | Always safe |
| Adding an enum value | **Only if** clients were documented to tolerate unknowns |
| Relaxing validation | Previously-invalid requests now succeed |
| Performance improvements | Provided ordering is unchanged |

Document the "tolerate unknown fields and enum values" expectation in your API docs from
day one. Without it, adding an enum value is a breaking change, and you will be adding
one.

## Structuring versioned code

**Preferred — share everything, version only the shape:**

```
app/Http/
├── Controllers/Api/
│   ├── V1/InvoiceController.php
│   └── V2/InvoiceController.php
├── Resources/
│   ├── V1/InvoiceResource.php
│   └── V2/InvoiceResource.php
└── Requests/
    ├── V1/StoreInvoiceRequest.php
    └── V2/StoreInvoiceRequest.php
```

Actions, models, and services are **not** versioned. Business logic has one implementation;
only the boundary shape differs.

```php
// V1 and V2 controllers call the same action
final class V2\CreateInvoiceController
{
    public function __invoke(V2\StoreInvoiceRequest $request, CreateInvoice $action): V2\InvoiceResource
    {
        return V2\InvoiceResource::make(
            $action->handle($request->user()->tenant, CreateInvoiceData::fromRequest($request))
        );
    }
}
```

**Extend rather than copy** where V2 is mostly V1:

```php
final class V2\InvoiceResource extends V1\InvoiceResource
{
    public function toArray(Request $request): array
    {
        return array_merge(parent::toArray($request), [
            'tax'      => ['minor' => $this->tax_minor, 'currency' => $this->currency],
            'customer' => V2\CustomerResource::make($this->whenLoaded('customer')),
        ]);
    }
}
```

Careful: inheritance couples the versions. If V2 diverges substantially, copy instead —
duplication is cheaper than a fragile base class that neither version can change.

## Deprecation

Give clients time and a clear signal.

```php
final class DeprecateVersion
{
    public function handle(Request $request, Closure $next, string $sunset): Response
    {
        $response = $next($request);

        $response->headers->add([
            'Deprecation' => 'true',
            'Sunset'      => Carbon::parse($sunset)->toRfc7231String(),
            'Link'        => '<https://docs.example.com/api/v2/migration>; rel="deprecation"',
        ]);

        Log::channel('api')->info('Deprecated API version used', [
            'version' => 'v1',
            'route'   => $request->route()?->getName(),
            'client'  => $request->user()?->currentAccessToken()?->name,
            'user'    => $request->user()?->id,
        ]);

        return $response;
    }
}
```

```php
Route::prefix('v1')->middleware('deprecated:2027-01-31')->group(...);
```

The logging is the important half. It tells you **who** is still on v1, so you can contact
them rather than guessing whether it is safe to remove.

### Timeline

| Phase | Duration | Action |
|---|---|---|
| Announce | — | Docs, changelog, email to token owners |
| Deprecated | 6–12 months | Headers on every response; usage logged |
| Warning | Final 30 days | Direct contact with remaining users |
| Sunset | — | 410 Gone with a migration link |

```php
Route::prefix('v1')->group(function (): void {
    Route::any('{any}', fn () => response()->json([
        'message'    => __('API v1 was retired on 31 January 2027. Please migrate to v2.'),
        'error_code' => 'version_retired',
        'docs'       => 'https://docs.example.com/api/v2/migration',
    ], 410))->where('any', '.*');
});
```

410 Gone, not 404 — it tells the client the resource existed and is permanently removed,
which is a far more actionable error.

## Migration guides

For every version bump, publish a table:

```markdown
## v1 → v2

### Breaking

| v1 | v2 | Action |
|---|---|---|
| `total` (float) | `total.minor` (int) + `total.currency` | Divide by 100 for display |
| `created` | `created_at` | Rename |
| `?page=2` | `?cursor=...` | Use `links.next` instead of constructing URLs |
| 200 on create | 201 on create | Accept both, or update the check |

### New

- `filter[issued_after]`
- `include=lines.product`

### Removed

- `GET /invoices/search` — use `GET /invoices?filter[search]=`
```

Make it copy-pasteable. A migration guide that says "the response shape has changed" is
not a migration guide.

## Avoiding versions

The best version bump is the one you did not need. Techniques:

**1. Additive-only changes.** Add `total_minor` alongside `total`; deprecate `total` in
docs; remove it in the next major.

**2. Feature flags per client.**

```php
if ($request->user()->currentAccessToken()?->can('beta:new-invoice-shape')) {
    return NewInvoiceResource::make($invoice);
}
```

**3. Tolerant clients.** Document from day one that clients must ignore unknown fields and
unknown enum values. This single sentence in your docs eliminates most breaking changes.

**4. Get it right the first time.** Money as minor units, dates as ISO 8601, enums as
strings, `data` wrapper, cursor pagination. These are the four shapes people get wrong and
then have to version.

## Testing across versions

```php
it('keeps the v1 contract intact', function (): void {
    $invoice = Invoice::factory()->for($user->tenant)->create(['total_minor' => 149900]);

    $this->actingAs($user)
        ->getJson("/api/v1/invoices/{$invoice->id}")
        ->assertOk()
        ->assertJsonPath('data.total', 1499.00)          // v1 sent a float
        ->assertJsonStructure(['data' => ['id', 'reference', 'total', 'created']]);
});

it('uses the v2 money shape', function (): void {
    $this->actingAs($user)
        ->getJson("/api/v2/invoices/{$invoice->id}")
        ->assertJsonPath('data.total.minor', 149900)
        ->assertJsonPath('data.total.currency', 'PHP');
});

it('marks v1 as deprecated', function (): void {
    $this->actingAs($user)
        ->getJson('/api/v1/invoices')
        ->assertHeader('Deprecation', 'true')
        ->assertHeader('Sunset');
});
```

Keep the v1 tests passing until v1 is actually removed. They are the contract, and they are
the only thing that stops a shared refactor from silently breaking an old client.
