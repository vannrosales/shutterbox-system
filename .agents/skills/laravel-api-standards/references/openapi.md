# OpenAPI documentation

Hand-written API docs diverge from the implementation within a sprint. Generate from code.

## Tooling

| Tool | Approach | Best for |
|---|---|---|
| **Scramble** (`dedoc/scramble`) | Infers from Form Requests, Resources, and types | Zero-annotation start; the pragmatic default |
| **Scribe** (`knuckleswtf/scribe`) | Annotations + response capture from tests | Rich docs with real examples |
| **L5-Swagger** | Full manual annotations | Maximum control, maximum maintenance |
| Hand-written spec | — | Only when the API is designed before it is built |

### Scramble

```bash
composer require --dev dedoc/scramble
```

```php
// config/scramble.php
return [
    'api_path'   => 'api/v1',
    'api_domain' => null,
    'info' => [
        'version'     => '1.0.0',
        'description' => 'Invoicing API',
    ],
    'servers' => [
        'Production' => 'https://api.example.com/v1',
        'Staging'    => 'https://api.staging.example.com/v1',
    ],
];
```

```php
// AppServiceProvider — the docs route must not be public in production
Gate::define('viewApiDocs', fn (?User $user) => ! app()->isProduction() || $user?->isAdmin());
```

Scramble reads:
- Route definitions and middleware for auth requirements
- Form Request `rules()` for the request schema
- API Resource `toArray()` return types for the response schema
- PHPDoc for descriptions

Which means: **the better your types, the better your docs**. Investment in
`laravel-code-quality` pays here.

```php
/**
 * List invoices.
 *
 * Returns the authenticated user's invoices, newest first.
 *
 * @response 200 InvoiceResource
 */
final class ListInvoicesController
{
    public function __invoke(ListInvoicesRequest $request): AnonymousResourceCollection
    {
        // ...
    }
}
```

## Documenting things generators cannot infer

```php
final class ListInvoicesRequest extends FormRequest
{
    /**
     * @bodyParam filter.status string Filter by status. Example: paid
     * @bodyParam filter.search string Full-text search over reference and notes. Example: acme
     * @bodyParam sort string Sort field; prefix with '-' for descending. Example: -issued_at
     * @bodyParam per_page integer Results per page, 1-100. Example: 25
     */
    public function rules(): array { /* ... */ }
}
```

Add `attributes()` and `messages()` in the Form Request — good generators surface them as
field descriptions, so accessibility-quality error messages become documentation for free.

## What a generator will not produce

Write these by hand, and keep them next to the generated spec:

1. **Getting started** — obtain a token, make a first call, in curl
2. **Authentication** — the flow, in full, with a working example
3. **Errors** — the envelope, and a table of every `error_code`
4. **Rate limits** — the numbers, the headers, and the expected backoff behaviour
5. **Pagination** — cursor semantics, and why there is no total
6. **Webhooks** — payload shape, signature verification code, retry schedule
7. **Idempotency** — when it is required, how keys are scoped
8. **Versioning and deprecation policy** — including "clients must tolerate unknown fields"
9. **Changelog**
10. **Migration guides** per version

Point 8 is the one that saves you the most future work — see `references/versioning.md`.

## The error code table

Clients branch on `error_code`, so it is part of the contract.

```markdown
| Code | HTTP | Meaning | Client action |
|---|---|---|---|
| `unauthenticated` | 401 | No or invalid credentials | Re-authenticate |
| `insufficient_scope` | 403 | Token lacks the ability | Request a token with the scope |
| `forbidden` | 403 | User lacks the permission | Show an error; do not retry |
| `not_found` | 404 | No such resource, or not visible to you | Do not retry |
| `validation_failed` | 422 | See `errors` | Fix the input |
| `idempotency_key_reuse` | 422 | Same key, different body | Client bug — use a new key |
| `idempotency_in_progress` | 409 | First request still running | Retry after `Retry-After` |
| `stale_resource` | 412 | `If-Match` did not match | Reload and retry |
| `rate_limited` | 429 | Too many requests | Back off per `Retry-After` |
| `version_retired` | 410 | API version removed | Migrate |
| `service_unavailable` | 503 | Temporary | Retry after `Retry-After` |
```

Never add a code without adding a row.

## Publishing

```php
Route::get('/docs/api', fn () => view('scramble::docs'))->middleware('can:viewApiDocs');
Route::get('/docs/api.json', fn () => Scramble::export())->middleware('can:viewApiDocs');
```

Commit the generated spec so its diff is reviewable:

```bash
php artisan scramble:export --path=docs/openapi.json
```

```yaml
# CI: fail if the committed spec is out of date
- name: Check OpenAPI spec is current
  run: |
    php artisan scramble:export --path=/tmp/openapi.json
    diff <(jq -S . docs/openapi.json) <(jq -S . /tmp/openapi.json) \
      || { echo "::error::OpenAPI spec is stale. Run: php artisan scramble:export"; exit 1; }
```

A spec in git makes "did this PR change the API contract?" answerable in code review.

## Contract testing

Generating a spec proves nothing about what the API actually returns. Validate responses
against it.

```bash
composer require --dev league/openapi-psr7-validator
```

```php
// tests/Pest.php
function assertMatchesOpenApi(TestResponse $response, string $method, string $path): void
{
    static $validator;

    $validator ??= (new ValidatorBuilder)
        ->fromJsonFile(base_path('docs/openapi.json'))
        ->getResponseValidator();

    $validator->validate(
        new OperationAddress($path, $method),
        $response->baseResponse->prepare(request()),
    );
}
```

```php
it('matches the documented shape', function (): void {
    $response = $this->actingAs($user)->getJson('/api/v1/invoices');

    $response->assertOk();
    assertMatchesOpenApi($response, 'get', '/invoices');
});
```

This catches the case that matters: someone adds a field to a Resource, the spec is
regenerated, but the field is undocumented or typed wrong.

## Client SDKs

```bash
npx @openapitools/openapi-generator-cli generate \
  -i docs/openapi.json -g typescript-axios -o clients/typescript

npx @openapitools/openapi-generator-cli generate \
  -i docs/openapi.json -g php -o clients/php
```

A generated SDK is only as good as the spec, which is another reason to validate it.

Generate on release, publish to npm/Packagist, and version it in lockstep with the API.

## Postman / Insomnia

```bash
# Postman imports OpenAPI directly
# Or generate a collection
php artisan scribe:generate     # Scribe emits a Postman collection
```

Ship an importable collection with a working environment (base URL, token variable). It is
the fastest path from "read the docs" to "made a call", and it materially reduces support
load.

## Documentation quality

The generated reference is necessary, not sufficient. What makes docs actually usable:

- **A working curl for every endpoint**, copy-pasteable
- **Realistic examples** — `INV-2026-0042`, not `string`
- **Error examples**, not only success
- **Every field described**, including units (`total.minor` is centavos, not pesos)
- **Nullability stated** for every field
- **Enum values enumerated**, with the note that clients must tolerate new ones

The unit ambiguity is worth a specific mention: an undocumented `total` field costs more
support time than everything else combined. State the unit, always.

## Keeping it honest

```yaml
- name: Fail on undocumented routes
  run: |
    php artisan route:list --json --path=api/v1 | jq -r '.[].uri' | sort > /tmp/routes.txt
    jq -r '.paths | keys[]' docs/openapi.json | sed 's|^/|api/v1/|' | sort > /tmp/documented.txt
    comm -23 /tmp/routes.txt /tmp/documented.txt > /tmp/missing.txt
    if [ -s /tmp/missing.txt ]; then
      echo "::error::Undocumented API routes:"; cat /tmp/missing.txt; exit 1
    fi
```

An undocumented endpoint is an endpoint someone will discover and depend on anyway.
