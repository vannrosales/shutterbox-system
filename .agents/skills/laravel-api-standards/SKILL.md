---
name: laravel-api-standards
description: Use when building or reviewing HTTP APIs — routes, controllers, API Resources, request validation, authentication tokens, pagination, filtering, sorting, error responses, versioning, or OpenAPI documentation. Enforces REST conventions, consistent envelopes and error shapes, correct status codes, Sanctum/OAuth setup, rate limiting, and idempotency. Triggers on "API", "endpoint", "REST", "JSON", "Sanctum", "token", "webhook", "OpenAPI", "Swagger", "versioning", "pagination", or any route in routes/api.php.
---

# REST API Standards

An API is a contract. Once a client depends on it, every shape you chose is permanent until
you version it. Decide deliberately.

## Resource naming and methods

```
GET    /api/v1/invoices              list
POST   /api/v1/invoices              create
GET    /api/v1/invoices/{id}         read
PATCH  /api/v1/invoices/{id}         partial update       ← prefer over PUT
PUT    /api/v1/invoices/{id}         full replace
DELETE /api/v1/invoices/{id}         delete

GET    /api/v1/invoices/{id}/lines   sub-resource
POST   /api/v1/invoices/{id}/refund  action that is not CRUD
```

- **Plural nouns.** `/invoices`, not `/invoice` or `/getInvoices`.
- **Nesting one level deep, maximum.** `/invoices/{id}/lines` is fine;
  `/customers/{c}/invoices/{i}/lines/{l}` is not — use `/lines/{l}`.
- **Actions as sub-resources** when they are not CRUD: `POST /invoices/{id}/refund`.
  Do not invent verbs at the top level (`/refundInvoice`).
- `kebab-case` in paths, `snake_case` in JSON bodies (or `camelCase` — pick one
  project-wide and never mix).

## Status codes

| Code | Use |
|---|---|
| 200 | Success with a body |
| 201 | Created — include a `Location` header |
| 202 | Accepted — queued, not yet done |
| 204 | Success, no body (DELETE) |
| 400 | Malformed request (bad JSON, bad query syntax) |
| 401 | Not authenticated |
| 403 | Authenticated, not permitted |
| 404 | Not found — **also** for records the caller may not know exist |
| 409 | Conflict (duplicate, version mismatch) |
| 422 | Validation failed |
| 429 | Rate limited — include `Retry-After` |
| 500 | Unhandled server error — never leak details |
| 503 | Temporarily unavailable — include `Retry-After` |

**404 not 403 for another tenant's record.** A 403 confirms it exists. See
`laravel-security`.

## Response envelope — decide once

```json
{
  "data": { "id": 1, "reference": "INV-001" },
  "meta": { "request_id": "01J8X..." }
}
```

```json
{
  "data": [ ... ],
  "links": { "first": "...", "prev": null, "next": "...", "last": "..." },
  "meta": { "current_page": 1, "per_page": 20, "total": 143 }
}
```

Laravel's `JsonResource` gives you this. Keep the `data` wrapper — the alternative
(bare arrays) leaves no room to add `meta` later without a breaking change.

## Errors — one shape, always

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "email": ["The email field is required."],
    "items.0.quantity": ["The quantity must be at least 1."]
  },
  "error_code": "validation_failed",
  "request_id": "01J8XK3M7QRVWXYZ"
}
```

- `message` — human-readable, translated, safe to show a user
- `errors` — field-keyed, only on 422
- `error_code` — stable machine-readable string the client can branch on. **Never make
  clients parse `message`.**
- `request_id` — correlates with your logs; the single most useful support field

Register renderers centrally in `bootstrap/app.php` so every endpoint is consistent —
see `templates/api-exception-handler.php`.

## Resources — the N+1 trap

```php
final class InvoiceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'         => $this->id,
            'reference'  => $this->reference,
            'status'     => $this->status->value,
            'total'      => ['minor' => $this->total_minor, 'currency' => $this->currency],
            'issued_at'  => $this->issued_at?->toIso8601String(),

            // whenLoaded: the key is OMITTED when not loaded, so the caller controls cost
            'customer'   => CustomerResource::make($this->whenLoaded('customer')),
            'lines'      => LineResource::collection($this->whenLoaded('lines')),
            'lines_count'=> $this->whenCounted('lines'),

            'can' => [
                'update' => $request->user()?->can('update', $this->resource) ?? false,
            ],
        ];
    }
}
```

`whenLoaded()` is not optional. Without it, a 50-item list issues 50 extra queries — the
most common API performance bug there is.

Never `return $model` — it serialises every column, including ones you did not mean to
expose.

### Money, dates, enums

```php
'total'     => ['minor' => 149900, 'currency' => 'PHP'],   // integer minor units
'issued_at' => $this->issued_at?->toIso8601String(),        // ISO 8601, UTC
'status'    => $this->status->value,                        // the backed value
```

Never send a float for money. Never send a locale-formatted date. Never send a translated
enum label as the machine value — send `value`, and a separate `status_label` if the client
needs display text.

## Query interface

```
GET /api/v1/invoices?filter[status]=paid&filter[issued_after]=2026-01-01
                    &sort=-issued_at&include=customer&per_page=25&cursor=eyJ...
```

**Everything whitelisted.** An unvalidated `sort` parameter reaching `orderByRaw` is SQL
injection; an unvalidated `include` is a denial-of-service.

```php
'filter'    => ['array'],
'filter.*'  => ['string', 'max:100'],
'sort'      => ['string', Rule::in(['issued_at', '-issued_at', 'total', '-total'])],
'include'   => ['string'],                       // parsed against an allow-list
'per_page'  => ['integer', 'min:1', 'max:100'],  // cap it, always
```

Pagination: `cursorPaginate()` for large tables (no `COUNT`, no `OFFSET`),
`paginate()` only where the total genuinely matters and the table is small. See
`laravel-database-scale`.

## Versioning

```php
Route::prefix('v1')->group(base_path('routes/api/v1.php'));
Route::prefix('v2')->group(base_path('routes/api/v2.php'));
```

URI versioning is the pragmatic default: visible in logs, cacheable, testable with curl.

**What breaks a contract** (needs a new version): removing or renaming a field, changing a
type, changing a status code, adding a required request field, tightening validation,
changing default sort or page size.

**What does not**: adding an optional response field, adding an optional request field,
adding an endpoint, adding an enum value *if clients were told to tolerate unknowns*.

Support the previous version for a stated window, announce deprecation in headers, and
publish a sunset date:

```
Deprecation: true
Sunset: Sat, 31 Jan 2027 23:59:59 GMT
Link: <https://docs.example.com/api/v2/migration>; rel="deprecation"
```

## Authentication

```php
// Sanctum tokens — least privilege, always expiring
$token = $user->createToken('mobile', ['invoices:read', 'invoices:create'], now()->addDays(30));
```

```php
Route::middleware(['auth:sanctum', 'ability:invoices:create'])->post('/invoices', ...);
```

- Token abilities scoped to the minimum
- `expiration` set in `config/sanctum.php` — never null in production
- `sanctum:prune-expired` scheduled
- SPA on the same domain: use the cookie flow, which keeps CSRF protection
- Third-party access: OAuth 2.0 via Passport, not shared API keys

## Rate limiting and idempotency

```php
RateLimiter::for('api', fn (Request $r) =>
    Limit::perMinute(60)->by($r->user()?->id ?: $r->ip())
);
```

Always return the headers so clients can back off:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
Retry-After: 30
```

Any endpoint that creates or charges must accept an idempotency key:

```php
$key = $request->header('Idempotency-Key');

if ($cached = IdempotencyRecord::find($key)) {
    return response()->json($cached->response, $cached->status);
}
```

Without it, a client retry after a timeout double-charges. See
`references/idempotency-webhooks.md`.

## Documentation

Generate from code, not by hand — hand-written docs diverge within a sprint.

```bash
composer require --dev dedoc/scramble       # infers OpenAPI from resources and requests
# or
composer require --dev knuckleswtf/scribe   # annotation-driven, richer output
```

Publish the spec at `/docs/api` and validate responses against it in CI.

## Scope boundaries

Owns: URI design, status codes, envelope and error shape, resources, filtering/sorting,
versioning, token shape and scopes, OpenAPI, idempotency, webhook contracts.

Does not own: authorization rules and OWASP defence (`laravel-security`); query efficiency
(`laravel-performance`); where controllers and actions live
(`laravel-enterprise-architecture`); pagination strategy at scale
(`laravel-database-scale`).

## Bundled resources

- `references/rest-design.md` — URIs, methods, status codes, envelope, HATEOAS, content negotiation
- `references/resources-serialisation.md` — resources, conditional fields, includes, types
- `references/querying.md` — filtering, sorting, searching, pagination, sparse fieldsets
- `references/versioning.md` — strategies, breaking changes, deprecation, migration
- `references/auth-tokens.md` — Sanctum, Passport, scopes, SPA vs mobile vs third-party
- `references/idempotency-webhooks.md` — idempotency keys, outbound webhooks, retries, signatures
- `references/openapi.md` — generation, publishing, contract testing
- `templates/` — exception handler, base resource, API Form Request, OpenAPI config, Postman
- `examples/complete-api-resource.md` — one resource, every layer
- `checklists/api-review.md` — pre-merge gate

---
Last reviewed: 2026-07-31 · See MAINTENANCE.md
