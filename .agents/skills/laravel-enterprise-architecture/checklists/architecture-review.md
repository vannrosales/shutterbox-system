# Architecture review — pre-merge gate

Run before declaring an architectural change complete. Anything unchecked is either fixed
or called out explicitly in the PR description.

## Placement

- [ ] Every new class is in the folder its layer dictates (see `references/layering.md`)
- [ ] No new competing convention introduced — matches what the project already does
- [ ] Namespace matches directory (PSR-4); `composer dump-autoload` run if a root was added

## Entrypoints

- [ ] Controller methods under ~15 lines
- [ ] No business `if` on domain state in a controller
- [ ] No queries in controllers beyond route-model binding
- [ ] No `DB::transaction` in a controller
- [ ] Console commands and job handlers are equally thin
- [ ] Validation is in a Form Request, not inline `$request->validate()` for non-trivial rules
- [ ] Authorization is in a Policy/Gate, invoked from the Form Request or `authorize()`

## Application layer

- [ ] No `Illuminate\Http\Request` type hint below the controller
- [ ] Input arrives as a DTO or typed scalars, not `array $data`
- [ ] Transaction boundaries are here, and wrap all writes that must succeed together
- [ ] Throws domain exceptions, not `abort()` / `response()`
- [ ] No HTTP status codes, session, or flash messages in this layer
- [ ] Actions have exactly one public method; services have a coherent shared purpose
- [ ] No noun-named god class (`XService` with unrelated methods)

## Domain

- [ ] Models contain relationships/casts/scopes/predicates only
- [ ] No mail, notifications, HTTP, or cross-aggregate coordination in models
- [ ] `$fillable` used, never `$guarded = []`
- [ ] Fixed sets are string-backed enums, not magic strings
- [ ] Money is integer minor units or `decimal`, never `float`
- [ ] Value objects used where a scalar has rules; invalid state cannot be constructed
- [ ] No heavy `static::creating()` hooks hiding control flow

## Infrastructure

- [ ] Third-party SDKs are behind an interface owned by this codebase
- [ ] Interface bound in a service provider; a test fake exists
- [ ] No `env()` outside `config/` files
- [ ] Repositories only where a real second implementation exists; none return Builders

## Events, jobs, notifications

- [ ] Events are past-tense facts and immutable
- [ ] One listener per consequence
- [ ] Listeners queued unless they must run in-request
- [ ] The primary operation does not depend on an event firing
- [ ] Jobs are idempotent
- [ ] Jobs set `$tries`, `$timeout`, `$backoff`; `uniqueId()` where duplicates are possible
- [ ] Jobs carry IDs, not large hydrated objects
- [ ] Notification *decisions* live in listeners, not in notification classes

## Types and style

- [ ] `declare(strict_types=1)` in every new PHP file
- [ ] All params, returns, and properties typed
- [ ] `final` on actions, services, DTOs, jobs, listeners, policies
- [ ] Constructor property promotion used
- [ ] Collections/arrays annotated for static analysis (`@return Collection<int, Order>`)
- [ ] No syntax newer than the project's actual PHP version

## Cross-skill handoffs

- [ ] Query efficiency reviewed → `laravel-performance`
- [ ] Migration indexes deliberate → `laravel-database-scale`
- [ ] Authorization + input handling reviewed → `laravel-security`
- [ ] Any new endpoint follows the API contract → `laravel-api-standards`
- [ ] Any new UI meets a11y + responsive gates → skills 2 and 3
- [ ] Tests exist for the new paths, including negative ones → `laravel-testing-qa`
- [ ] `composer qa` passes → `laravel-code-quality`

## Reversibility

- [ ] Change is backwards compatible, or the break is documented with a migration path
- [ ] New rows have a retention/cleanup answer
- [ ] Feature can be disabled without a deploy if it is risky (flag/config)
