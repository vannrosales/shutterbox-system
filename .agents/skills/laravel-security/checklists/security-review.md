# Security review — pre-merge gate

Mandatory (not advisory) for any change touching money, PII, authentication,
authorization, file uploads, or admin capability.

## Input

- [ ] Every request field validated with an explicit rule
- [ ] `$request->validated()` or a DTO used — never `$request->all()`
- [ ] Every string has `max:`; every array has `max:`
- [ ] Fixed sets use `Rule::enum()` / `Rule::in()`, never free text
- [ ] Privileged values excluded from enum rules (`->except(Role::SuperAdmin)`)
- [ ] `per_page` and pagination inputs capped (≤ 100)
- [ ] File uploads use `mimetypes:` (content sniffing), not `mimes:` (extension)
- [ ] Client-supplied prices, totals, roles, and IDs are **not** trusted — server computes
- [ ] Models use `$fillable`, never `$guarded = []`

## Authorization

- [ ] Every object access has a policy check
- [ ] Cross-tenant access returns **404**, not 403 (`denyAsNotFound()`)
- [ ] Nested routes use `->scopeBindings()`
- [ ] List queries are filtered by tenant/owner in the query, not just per-record
- [ ] Blade `@can` is UI only — the route and controller are independently protected
- [ ] No `before()` super-admin bypass that skips tenant scoping without audit
- [ ] Privilege-granting endpoints check the actor's own level
- [ ] `php artisan route:list --except-vendor` reviewed — every route's middleware is
      deliberate

## Output

- [ ] No `{!! !!}` on user-controlled content without server-side sanitisation
- [ ] Attribute interpolation is quoted
- [ ] URLs from user input validated against `http`/`https` before rendering in `href`
- [ ] Data passed to JavaScript uses `@json()`, not string interpolation
- [ ] API resources do not leak internal fields (tokens, hashes, other tenants' ids)

## SQL

- [ ] No PHP variable interpolated into `whereRaw` / `selectRaw` / `orderByRaw` / `havingRaw`
- [ ] Bindings used for all values
- [ ] Column names and sort directions whitelisted
- [ ] No `DB::statement` with user input

## Authentication (if touched)

- [ ] Rate limited by email+IP **and** by IP
- [ ] Generic failure messages — no user enumeration
- [ ] Session regenerated on login
- [ ] `Password::min(12)->uncompromised()`
- [ ] Password fields accept paste; `autocomplete` set
- [ ] MFA required for privileged roles
- [ ] Secrets compared with `hash_equals()`, never `===`
- [ ] Password reset does not disclose whether the address exists
- [ ] Other sessions invalidated on password change

## Files

- [ ] Stored outside the web root (`private` disk or object storage)
- [ ] Filename generated, never taken from the client
- [ ] Served via an authorizing controller or a short-lived signed URL
- [ ] Size limits set in validation **and** PHP **and** the web server
- [ ] EXIF stripped from images
- [ ] Upload directory cannot execute scripts

## Outbound requests

- [ ] User-supplied URLs validated: scheme whitelist + private-range rejection (SSRF)
- [ ] `allow_redirects => false` on requests to user-supplied URLs
- [ ] Timeouts set on every HTTP client call
- [ ] Webhook signatures verified with `hash_equals` **before** parsing the body

## Redirects and deserialisation

- [ ] Redirect targets are relative-only, or from an allow-list (check for `//`)
- [ ] No `unserialize()` on untrusted input
- [ ] No `eval`, `shell_exec`, `passthru`, or dynamic class instantiation from input
- [ ] Shell commands use the array form (`Process::run([...])`), not string interpolation

## Secrets

- [ ] No secrets in the diff
- [ ] No `env()` outside `config/`
- [ ] `.env` not committed (working tree **and** history)
- [ ] New config keys documented in `.env.example` with placeholder values

## Rate limiting

- [ ] New endpoints have a `throttle` middleware
- [ ] Expensive operations have their own lower limit
- [ ] Business-action limits applied where request limits are insufficient (resets,
      refunds, invitations)

## Logging

- [ ] Security-relevant events audited (actor, action, target, IP, timestamp)
- [ ] Nothing sensitive logged — passwords, tokens, card numbers, session ids, raw PII
- [ ] Error tracker configured to scrub request data

## Privacy (if personal data is involved)

- [ ] Fields classified; sensitive fields encrypted at rest and in `$hidden`
- [ ] Retention period set, with a prune path
- [ ] Anonymisation path covers the search index, cache, and third parties
- [ ] Lawful basis recorded; consent captured with purpose and version if applicable

## Tests

- [ ] Authorization denial test — including cross-tenant → 404
- [ ] Validation boundary tests
- [ ] Rate limit test for new limited endpoints
- [ ] The specific vulnerability class this change could introduce is covered by a test

## Automated

- [ ] `composer audit` clean
- [ ] `npm audit --audit-level=high` clean
- [ ] PHPStan passes
- [ ] Secret scan clean
- [ ] Security CI workflow green
