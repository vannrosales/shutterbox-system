# API review — pre-merge gate

## URI and method

- [ ] Plural noun resources, no verbs in the path
- [ ] `kebab-case` paths; one casing convention for JSON bodies, applied everywhere
- [ ] Nesting one level deep at most; nested routes use `->scopeBindings()`
- [ ] Non-CRUD actions modelled as sub-resources (`POST /invoices/{id}/refund`)
- [ ] Correct method: GET never changes state; PATCH for partial, PUT only for full replace
- [ ] Under the current version prefix

## Status codes

- [ ] 201 on create, with a `Location` header
- [ ] 202 for queued work, with a poll URL
- [ ] 204 on delete
- [ ] 422 for validation, 400 only for malformed syntax
- [ ] **404, not 403, for records the caller may not know exist**
- [ ] 409 for conflicts; 412 for stale-resource writes
- [ ] 429 with `Retry-After`
- [ ] 500 never leaks exception details in production

## Response shape

- [ ] `data` wrapper preserved
- [ ] Every response goes through an API Resource — no `return $model`
- [ ] `whenLoaded()` on **every** relation
- [ ] `whenCounted()` used with a matching `withCount()`
- [ ] Money as integer minor units + currency; never a float
- [ ] Dates as ISO 8601 UTC; date-only fields stay date-only
- [ ] Enums send the backed value; a separate label field if display text is needed
- [ ] Booleans are `true`/`false`, not `1`/`"yes"`
- [ ] Integers that can exceed 2^53 sent as strings
- [ ] No internal fields exposed (tenant ids, hashes, internal notes, cost prices)

## Errors

- [ ] Single envelope: `message`, `errors`, `error_code`, `request_id`
- [ ] `error_code` is stable and documented in the error-code table
- [ ] Clients never need to parse `message`
- [ ] Rendered centrally in `bootstrap/app.php`, not per controller
- [ ] Domain exceptions map to a code and status
- [ ] `ForceJsonResponse` applied so a missing `Accept` header does not return HTML

## Query interface

- [ ] `sort` whitelisted — no user input reaches `orderByRaw`
- [ ] Deterministic tiebreaker on the sort (usually `id`)
- [ ] Every sortable column indexed
- [ ] Filter keys whitelisted; **unknown keys rejected**, not ignored
- [ ] `include` whitelisted, count capped, depth capped
- [ ] `per_page` validated **and** clamped (≤ 100)
- [ ] `cursorPaginate()` used, unless the table is small and the total is needed
- [ ] `->withQueryString()` so pagination links keep the filters
- [ ] Date-range filters bounded
- [ ] Search uses full-text or a search engine, not `LIKE '%term%'`
- [ ] Tenant scope applied **before** any filter

## Authentication and authorization

- [ ] Route is authenticated unless deliberately public
- [ ] Token ability required (`ability:` middleware)
- [ ] Policy check in addition to the ability — a valid token is not blanket authorization
- [ ] Cross-tenant access returns 404, verified by a test
- [ ] Token expiry configured; `sanctum:prune-expired` scheduled
- [ ] SPA on the same domain uses the cookie flow, not a token in `localStorage`

## Rate limiting and idempotency

- [ ] `throttle` middleware present
- [ ] Expensive endpoints have a lower dedicated limit
- [ ] Limits keyed by token id where a user may have several clients
- [ ] `X-RateLimit-*` and `Retry-After` headers returned
- [ ] Create/charge endpoints accept `Idempotency-Key`
- [ ] Idempotency keys scoped per user; body hash checked; 5xx not cached

## Versioning

- [ ] No breaking change to an existing version (see the table in `references/versioning.md`)
- [ ] If breaking: new version created, migration guide written
- [ ] Deprecated versions send `Deprecation` and `Sunset` headers
- [ ] Deprecated-version usage is logged so you know who is still on it
- [ ] Business logic shared across versions; only the boundary shape differs

## Webhooks (if applicable)

- [ ] Outbound: signed with timestamp + body, retried with exponential backoff
- [ ] Outbound: `allow_redirects => false`, timeout set
- [ ] Endpoint URLs validated against private IP ranges (SSRF)
- [ ] Inbound: signature verified **before** parsing the body, with `hash_equals`
- [ ] Inbound: deduplicated by event id
- [ ] Inbound: work queued, response returned immediately
- [ ] CSRF exemption justified by the signature check, and noted
- [ ] Delivery log visible to endpoint owners, with manual retry

## Performance

- [ ] Query count does not grow with result count
- [ ] Query-count assertion added for the list endpoint
- [ ] Relations the policy needs are eager loaded
- [ ] No `COUNT(*)` on a large table per request

## Documentation

- [ ] OpenAPI spec regenerated and committed
- [ ] New `error_code` values added to the error table
- [ ] Units documented (minor units, seconds, etc.)
- [ ] Nullability documented per field
- [ ] Enum values listed, with the "tolerate unknown values" note
- [ ] A working curl example for the endpoint

## Tests

- [ ] Happy path
- [ ] Unauthenticated → 401
- [ ] Wrong ability → 403
- [ ] Cross-tenant → 404
- [ ] Validation failures, including boundaries
- [ ] Unknown sort/filter rejected
- [ ] `per_page` cap enforced
- [ ] Idempotency replay returns the same response and creates one record
- [ ] Response matches the OpenAPI spec
- [ ] No internal fields in the response
