# REST design

## URI structure

```
https://api.example.com/v1/invoices/01J8XK/lines
└─ host ────────────────┘└v┘└ collection ┘└ id ┘└ sub ┘
```

Rules:

| Rule | Good | Bad |
|---|---|---|
| Plural nouns | `/invoices` | `/invoice`, `/getInvoices` |
| No verbs in the path | `POST /invoices` | `POST /createInvoice` |
| kebab-case | `/purchase-orders` | `/purchaseOrders`, `/purchase_orders` |
| One level of nesting | `/invoices/{id}/lines` | `/customers/{c}/invoices/{i}/lines/{l}` |
| No file extensions | `/invoices` + `Accept` header | `/invoices.json` |
| No trailing slash | `/invoices` | `/invoices/` |

### Deep nesting

```
# ✗ Fragile, long, and forces the client to know the whole hierarchy
GET /customers/5/invoices/12/lines/3

# ✓ Address the resource directly; filter for the relationship
GET /lines/3
GET /lines?filter[invoice_id]=12
GET /invoices/12/lines          ← one level is fine and reads well
```

When you do nest, scope the binding or the child is reachable through any parent:

```php
Route::get('/invoices/{invoice}/lines/{line}', ...)->scopeBindings();
```

### Actions that are not CRUD

```
POST /invoices/{id}/refund
POST /invoices/{id}/send
POST /users/{id}/deactivate
POST /exports                      ← a job IS a resource
GET  /exports/{id}                 ← poll it
```

Model the *result* as a resource where you can. "Generate a report" becomes
`POST /reports` returning `202 Accepted` with a `Location` pointing at the report resource.

## HTTP methods

| Method | Idempotent | Safe | Body | Use |
|---|---|---|---|---|
| GET | yes | yes | no | Read |
| POST | **no** | no | yes | Create, or a non-idempotent action |
| PUT | yes | no | yes | Full replace |
| PATCH | no* | no | yes | Partial update |
| DELETE | yes | no | no | Remove |

\* PATCH is idempotent if the patch is absolute rather than relative.

**Prefer PATCH over PUT.** PUT means "replace the whole resource" — omitted fields should
be nulled. Almost every client sending PUT actually means PATCH, so accepting PUT with
partial-update semantics is a trap that eventually deletes someone's data.

```php
// PATCH — only what was sent
$invoice->update($request->validated());

// PUT — everything, with omitted fields reset
$invoice->update($request->validated() + array_fill_keys(self::NULLABLE_FIELDS, null));
```

GET must never change state. A `GET /invoices/{id}/send` is both a REST violation and
CSRF-able.

## Status codes in practice

```php
// 201 with a Location header
return InvoiceResource::make($invoice)
    ->response()
    ->setStatusCode(201)
    ->header('Location', route('api.v1.invoices.show', $invoice));

// 202 for queued work — tell the client where to look
return response()->json([
    'data' => ['id' => $export->id, 'status' => 'queued'],
    'meta' => ['poll_url' => route('api.v1.exports.show', $export)],
], 202);

// 204 for delete
return response()->noContent();

// 409 for a conflict
return response()->json([
    'message'    => __('This invoice has already been paid.'),
    'error_code' => 'invoice_already_paid',
], 409);
```

### The 403-vs-404 decision

```php
// The caller has no business knowing this record exists
return Response::denyAsNotFound();       // → 404

// The caller knows the record; they lack the permission
return Response::deny(__('You cannot refund invoices.'));   // → 403
```

Getting this wrong turns sequential IDs into an enumeration oracle for another tenant's
data. See `laravel-security`.

### 422 vs 400

- **400** — the request is malformed: invalid JSON, a query parameter that cannot be parsed
- **422** — the request parsed fine but the values fail business validation

Laravel returns 422 from `ValidationException` automatically. Return 400 only for genuine
syntax problems.

## Envelope

```json
{
  "data": { "id": 1, "reference": "INV-001" },
  "meta": { "request_id": "01J8XK3M7QRVWXYZ" }
}
```

The `data` wrapper is worth keeping. Without it, adding `meta` later is a breaking change,
and a top-level JSON array has historical security concerns with older clients.

Collections get `links` and `meta` automatically from Laravel's paginator:

```json
{
  "data": [ ... ],
  "links": {
    "first": "https://api.example.com/v1/invoices?page=1",
    "last":  "https://api.example.com/v1/invoices?page=8",
    "prev":  null,
    "next":  "https://api.example.com/v1/invoices?page=2"
  },
  "meta": { "current_page": 1, "from": 1, "last_page": 8, "per_page": 20, "to": 20, "total": 143 }
}
```

Set the wrapper explicitly so it cannot drift:

```php
// AppServiceProvider::boot()
JsonResource::withoutWrapping();     // ✗ don't — you lose the meta slot
// Leave the default 'data' wrapping in place.
```

## Content negotiation

```php
// Force JSON on the API, regardless of what the client sends
Route::middleware([ForceJsonResponse::class])->prefix('api')->group(...);
```

```php
final class ForceJsonResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        $request->headers->set('Accept', 'application/json');

        return $next($request);
    }
}
```

Without this, a validation failure from a client that forgot the `Accept` header returns an
HTML redirect instead of a 422 JSON body — a confusing failure that surfaces as "the API
returns HTML".

Respond with `Content-Type: application/json`. If you need a media-type version, use a
vendor type (`application/vnd.example.v2+json`) — but URI versioning is simpler and shows
up in logs.

## Headers worth sending

| Header | Why |
|---|---|
| `X-Request-Id` | Correlates the client's report with your logs |
| `X-RateLimit-Limit` / `-Remaining` | Lets clients self-throttle |
| `Retry-After` | On 429 and 503 |
| `Location` | On 201 |
| `ETag` / `Last-Modified` | Conditional GET support |
| `Cache-Control` | `no-store, private` on authenticated responses |
| `Deprecation` / `Sunset` | On deprecated versions |

```php
// Request id — generate it or accept the client's
final class AssignRequestId
{
    public function handle(Request $request, Closure $next): Response
    {
        $id = $request->header('X-Request-Id') ?: (string) Str::ulid();

        Context::add('request_id', $id);    // flows into logs and queued jobs

        return tap($next($request), fn (Response $r) => $r->headers->set('X-Request-Id', $id));
    }
}
```

## Conditional requests

```php
return InvoiceResource::make($invoice)
    ->response()
    ->setEtag(md5($invoice->updated_at.$invoice->id))
    ->setLastModified($invoice->updated_at);
```

A client sending `If-None-Match` gets a 304 with no body. On a mobile client over a metered
connection, that is a real saving.

For writes, use it as optimistic locking:

```php
if ($request->header('If-Match') && $request->header('If-Match') !== $invoice->etag()) {
    return response()->json([
        'message'    => __('This invoice was modified by someone else. Reload and try again.'),
        'error_code' => 'stale_resource',
    ], 412);
}
```

## HATEOAS — pragmatically

Full hypermedia is rarely worth the cost. What *is* worth it:

```json
{
  "data": {
    "id": 1,
    "status": "issued",
    "can": { "refund": true, "void": false, "send": true }
  }
}
```

Telling the client which actions are *currently permitted* removes duplicated business
rules from every client. Computing this per record can N+1 the policy — eager load what the
policy needs (`laravel-performance`).

## Bulk operations

```
POST /invoices/bulk
{ "operations": [ { "op": "update", "id": 1, "data": {...} } ] }
```

Return per-item results with `207 Multi-Status`, or a 200 with an outcome array:

```json
{
  "data": [
    { "id": 1, "status": "ok" },
    { "id": 2, "status": "error", "error_code": "not_found" }
  ],
  "meta": { "succeeded": 1, "failed": 1 }
}
```

Cap the batch size (`operations` → `max:100`). An unbounded bulk endpoint is a
denial-of-service vector.

## Common mistakes

| Mistake | Consequence |
|---|---|
| Verbs in URIs | Not REST; grows into an RPC surface nobody can navigate |
| 200 for every response | Clients cannot branch on outcome |
| Different error shapes per endpoint | Every client writes bespoke handling |
| `message` as the machine-readable signal | Translating a message breaks clients |
| No `data` wrapper | Cannot add `meta` without a breaking change |
| Returning the model directly | Leaks columns; couples the API to the schema |
| Unbounded `per_page` | One request takes the site down |
| No version prefix | Every change is a breaking change |
| PUT with partial semantics | Data loss when a client omits a field |
| GET that changes state | CSRF, and broken by any prefetcher |
