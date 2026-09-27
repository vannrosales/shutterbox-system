# Test review — pre-merge gate

## Coverage of the change

- [ ] Happy path tested
- [ ] **Authorization denial tested** — including cross-tenant returning **404**, not 403
- [ ] Unauthenticated access returns 401
- [ ] Token/scope insufficiency returns 403 (separate from user permission)
- [ ] Every validation rule has a boundary test
- [ ] Every business rule (`if` in the action) has a test — including the exact boundary
- [ ] Failure paths tested (external service down, transaction rollback)
- [ ] Side effects asserted (events, jobs, notifications, derived columns)
- [ ] Idempotency tested if the operation creates or charges
- [ ] Rate limiting tested if a new limit was added
- [ ] A production bug being fixed has a test that fails without the fix

## Test quality

- [ ] Name states the behaviour, not the method
- [ ] Arrange / act / assert visible, with blank lines
- [ ] Asserts the outcome, not the implementation
- [ ] Does not assert on `updated_at` or other incidental columns
- [ ] Setup is minimal — only what the test needs
- [ ] No commented-out assertions
- [ ] At least one meaningful assertion (not just `assertOk()` on a write)

## Factories

- [ ] New models have a factory
- [ ] `definition()` produces a valid, minimal record in the **initial** state
- [ ] Nothing randomised that a test asserts on
- [ ] `fake()->unique()` on unique-constrained columns
- [ ] Domain states added (`->paid()`, `->overdue()`) rather than inline attribute arrays
- [ ] Multi-tenant factories default to a **new** tenant
- [ ] Only the records the test needs are created

## Isolation

- [ ] `Http::preventStrayRequests()` in place; no real network calls
- [ ] `Storage::fake()` for anything touching the filesystem
- [ ] `Mail::fake()` / `Notification::fake()` where relevant
- [ ] **`Event::fake()` passes an explicit list** — never bare `Event::fake()`
- [ ] Queued mailables asserted with `assertQueued`, not `assertSent`
- [ ] Time frozen or travelled deliberately — no `sleep()`, no unfrozen `now()` assertions
- [ ] No dependence on run order or another test's data
- [ ] `withoutMiddleware()` not used to bypass the authorization being tested

## Mocking discipline

- [ ] Laravel fakes preferred over Mockery
- [ ] Third-party SDKs faked behind your own interface, not mocked directly
- [ ] No mock with more than ~2 expectations (use a fake or test higher up)
- [ ] Spies preferred over mocks where you only need to assert afterwards

## Specialist tests where relevant

- [ ] **Query-count assertion** on any new list/index/export endpoint
- [ ] `assertNoNPlusOne` where the endpoint renders a collection
- [ ] Memory assertion on exports and imports
- [ ] Markup assertions (labels, heading order, alt) on new pages
- [ ] axe run with **zero** violations on new screens
- [ ] Contract test against the OpenAPI spec for new API endpoints
- [ ] `assertJsonMissingPath` for internal fields on new resources

## Reliability

- [ ] Passes with `--parallel`
- [ ] Passes with `--order-by=random`
- [ ] Passes ten times: `php artisan test --repeat=10 --filter=NewTest`
- [ ] No new test added to a `flaky` group

## Suite health

- [ ] Total runtime still acceptable (target: under 60s locally)
- [ ] No new test takes more than ~1s without being in `--group=slow`
- [ ] Coverage floor still met (`--min=80`)
- [ ] No `--filter` or `->only()` left in the committed code
- [ ] No `dd()`, `dump()`, or `ray()` left behind
- [ ] Browser tests use `waitFor`, never `pause()`
- [ ] Browser tests use `dusk` attributes, not CSS classes

## Things that should NOT be tested

Confirm the diff does not add tests for:

- [ ] Framework behaviour (`paginate()`, `Hash::make()`)
- [ ] Getters and setters with no logic
- [ ] Config values
- [ ] Third-party library internals
- [ ] Private methods directly
- [ ] Exact SQL strings

## CI

- [ ] Tests run against the production database engine, not only SQLite
- [ ] `failOnWarning`, `failOnRisky`, `failOnDeprecation` enabled
- [ ] Slow suites (browser, accessibility) run nightly, not on every PR
