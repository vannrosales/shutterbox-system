# Maintaining `laravel-api-standards`

## Review triggers

| Trigger | Action |
|---|---|
| Laravel or Sanctum major release | Verify the auth guidance and middleware syntax |
| Passport major release | Re-check the OAuth flow recommendations |
| OAuth 2.1 finalisation | Update flow guidance — implicit and password grants are already out |
| The project ships a new API version | Add its migration guide pattern to `references/versioning.md` |
| A client integration breaks | Work out which contract rule was missing and add it to the checklist |
| OpenAPI generator changes | Update `references/openapi.md` |

Scheduled: every 6 months.

## The parts most likely to go stale

**1. Tooling recommendations.** Scramble, Scribe, and the OpenAPI generators move quickly.
Verify the config examples still match the current versions before trusting them.

**2. OAuth flow guidance.** Password and implicit grants are deprecated; OAuth 2.1
consolidates this. If a future edit reintroduces either as acceptable, it is wrong.

**3. Sanctum config keys.** `expiration`, `stateful`, and `guard` have been stable, but
check against the shipped `config/sanctum.php` when the framework majors.

## What to update where

| Change | File |
|---|---|
| URI, methods, status codes, envelope | `references/rest-design.md` |
| Resource shape, types, includes | `references/resources-serialisation.md` + `templates/ApiResource.php.stub` |
| Filtering, sorting, pagination | `references/querying.md` + `templates/ApiFormRequest.php.stub` |
| Version strategy, deprecation | `references/versioning.md` |
| Tokens, scopes, OAuth | `references/auth-tokens.md` |
| Idempotency, webhooks | `references/idempotency-webhooks.md` |
| Documentation generation | `references/openapi.md` |
| Error envelope | `templates/api-exception-handler.php` + `references/rest-design.md` |

The error envelope appears in `SKILL.md`, `rest-design.md`, the exception handler template,
and both request/resource stubs. Change all of them together, or the library starts
recommending two shapes.

## Testing changes to this skill

1. Skill loads: `/laravel-api-standards`
2. Prompt test — *"Add an endpoint to list a user's orders"* — verify the output includes
   `whenLoaded`, a whitelisted sort, a capped `per_page`, and `cursorPaginate` without
   being asked
3. Second prompt test — *"The mobile app sometimes creates duplicate payments"* — verify
   idempotency keys are the answer, not "add a unique constraint"
4. Third prompt test — *"We need to change `total` from a float to minor units"* — verify
   it identifies this as breaking and proposes a version
5. Templates parse:

```bash
php -l .claude/skills/laravel-api-standards/templates/api-exception-handler.php

# The .stub files contain {{ Placeholder }} tokens and are NOT valid PHP by
# design. Substitute before linting:
for f in templates/*.stub; do
    sed -E 's/\{\{ *[A-Za-z]+ *\}\}/Placeholder/g' "$f" > /tmp/stub.php && php -l /tmp/stub.php
done
```

Note: `ApiFormRequest.php.stub` declares two classes in one file for readability. That is
deliberate for a stub — split them when copying into a project.

## Boundary discipline

Owns: URI design, HTTP semantics, envelope and error shape, resources, filtering and
pagination *interface*, versioning, token shape and scopes, OpenAPI, idempotency, webhook
contracts.

Hand off:
- Authorization rules, IDOR, SSRF, injection defence → `laravel-security`
- Eager loading, query counts, caching → `laravel-performance`
- Pagination *strategy* at scale, indexes for sortable columns → `laravel-database-scale`
- Controller/action placement, DTOs, domain exceptions → `laravel-enterprise-architecture`
- Test structure and helpers → `laravel-testing-qa`

**Shared areas that must stay consistent:**

| Topic | This skill says | Other skill says |
|---|---|---|
| 404-not-403 cross-tenant | The status code and error shape | Why it is an enumeration oracle (`laravel-security`) |
| Whitelisted sort | The validation rule | Why unvalidated sort is SQL injection (`laravel-security`) |
| `per_page` cap | The API contract limit | The same cap as an abuse control (`laravel-security`) and a perf control (`laravel-performance`) |
| `whenLoaded` | The contract benefit (client controls cost) | The N+1 cost (`laravel-performance`) |
| `cursorPaginate` | The client-facing semantics | Why `OFFSET` degrades (`laravel-database-scale`) |
| Webhook SSRF | The validation rule at registration | The general SSRF defence (`laravel-security`) |

Each row is the same rule from two angles. That duplication is deliberate — an engineer
reading only one skill still gets it right. If you change the guidance, change both.

## The four shapes this skill exists to get right first time

Most API version bumps trace to one of these:

1. **Money as a float** instead of integer minor units
2. **Dates as locale strings** instead of ISO 8601 UTC
3. **No `data` wrapper**, so `meta` cannot be added later
4. **Offset pagination**, which cannot be changed to cursor without breaking clients

If a future edit makes any of the four easier to get wrong, it is the wrong edit.

## Changelog

| Date | Change |
|---|---|
| 2026-07-31 | Initial version. Sanctum 4 / Passport 12 era, cursor pagination default, Scramble-based docs. |
