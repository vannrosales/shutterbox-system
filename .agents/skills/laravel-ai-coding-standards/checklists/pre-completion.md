# Before saying it is done

## Automated gates

- [ ] `composer qa` passes — Pint, PHPStan, tests
- [ ] Tests were **actually run**, and the output seen
- [ ] No new PHPStan baseline entries
- [ ] No `dd()`, `dump()`, `ray()`, `var_dump()` left behind
- [ ] No commented-out code
- [ ] No `// TODO` standing in for work that was requested

```bash
composer qa
```

## Skill checklists

Run the checklist for each skill you loaded. At minimum:

- [ ] `laravel-code-quality/checklists/quality-review.md` — always
- [ ] `laravel-security/checklists/security-review.md` — **mandatory** for money, PII, auth,
      uploads, admin capability
- [ ] `laravel-testing-qa/checklists/test-review.md` — if you wrote tests (you did)
- [ ] Plus the checklist of every other skill you loaded

## The contract

- [ ] **Reused** rather than duplicated — checked for an existing helper first
- [ ] **Matches the project's style**, not this library's defaults where they differ
- [ ] **No duplicated business logic** — the rule lives in one place
- [ ] **Backwards compatible**, or the break is stated with a migration path
- [ ] **Production-ready** — validated, authorized, typed, error-handled, tested
- [ ] **Trade-offs explained** in a sentence or two where a real choice was made
- [ ] **Maintainable over clever**
- [ ] **Proportionate** — the structure matches what this code's life requires

## Scope

- [ ] Built what was asked — not narrowed, not widened, not transformed
- [ ] No unrelated bugs fixed silently inside this change
- [ ] No unrequested features added
- [ ] Anything blocked was finished elsewhere in full, and named explicitly

## The security floor

Regardless of which skills were loaded, if the change touches any of these, confirm:

- [ ] Every input validated with an explicit rule; arrays and strings have `max:`
- [ ] `$request->validated()` or a DTO — never `$request->all()`
- [ ] Authorization checked on **object** access, not just authentication
- [ ] Cross-tenant access returns **404**, not 403
- [ ] No user input in `orderByRaw` / `whereRaw` / `selectRaw` without a whitelist
- [ ] No `{!! !!}` on user content without sanitisation
- [ ] Uploads use `mimetypes:`, a generated filename, and a private disk
- [ ] Nothing sensitive logged
- [ ] No `env()` outside `config/`

## The performance floor

- [ ] Query count does not grow with row count
- [ ] Every relation used in a view, resource, or policy is eager loaded
- [ ] Lists paginate, with a capped page size
- [ ] Bulk processing uses `chunkById` / `lazyById`, not `chunk` or `get`
- [ ] A query-count assertion exists for any new list endpoint

## Verification you actually performed

Be precise about this. Do not imply checks you did not run.

- [ ] Tests run — result: __________
- [ ] Static analysis run — result: __________
- [ ] Manually exercised in the app? Y/N
- [ ] Checked against realistic data volume? Y/N
- [ ] Accessibility pass (keyboard + screen reader) if UI changed? Y/N
- [ ] Responsive check at 320px if layout changed? Y/N

Anything unchecked goes in the report as "not verified", not omitted.

## The report

State all of these:

- [ ] **What you did** — files, and the shape of the solution
- [ ] **What you did not do**, and why
- [ ] **What you assumed**
- [ ] **What you could not verify**
- [ ] **What you noticed that is broken but out of scope**
- [ ] **Where the design will stop working** — the scaling limit, the edge case

```
Done. [What was built, briefly.]

Design: [The one decision worth explaining, and why.]

Assumed: [Anything a different reading would change.]

Not done: [What was skipped, and why. "Couldn't run the browser test — no Chromedriver
here. The Dusk test is written but unverified."]

Noticed but out of scope: [The unrelated problem. "Separate fix?"]
```

## Never

- [ ] Report "done" when a step was skipped
- [ ] Say tests pass without running them
- [ ] Imply verification you did not perform
- [ ] Hide an assumption because it seemed obvious
- [ ] Leave a `TODO` where the user expects finished work
- [ ] Fix an unrelated thing silently
- [ ] Narrow the scope without saying so

The last three are the ones that erode trust fastest, because the user only finds out
later.

## If it is not finished

Say so plainly, name what remains, and stop.

> Partial. The action, policy, and tests are in place and passing. The Blade view is not
> done — the existing table component does not support the grouped layout this needs, and
> extending it is a bigger change than I want to make without checking. Want me to extend
> the component, or build a one-off view for this page?

A clear partial is far more useful than a confident-sounding whole that does not work.
