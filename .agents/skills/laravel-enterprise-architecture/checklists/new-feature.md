# New feature — planning gate

Answer these before writing the first line. Most rework traces to skipping one of them.

## 1. Understand the ask

- [ ] What is the business operation, stated as a single verb phrase? (`RefundOrder`)
- [ ] Who is allowed to perform it? Under what conditions?
- [ ] What must be true before it runs (invariants)?
- [ ] What must be true after (postconditions)?
- [ ] What are the consequences (mail, webhooks, cache, audit)?
- [ ] What is the failure behaviour — retry, roll back, alert, or a user-facing error?

## 2. Audit the project

- [ ] Ran the audit in `references/existing-project-audit.md`
- [ ] Found and read the closest existing feature end to end
- [ ] Identified the project's conventions (actions vs services, DTO style, authz package)
- [ ] Checked `CLAUDE.md` / `CONTRIBUTING.md` for explicit rules that override defaults

## 3. Data

- [ ] What tables/columns are needed? Any existing table already close?
- [ ] Expected row count at 1 year and 5 years → sizes the index and pagination strategy
- [ ] Which columns are queried, filtered, sorted? → indexes (`laravel-database-scale`)
- [ ] Foreign keys and delete behaviour decided (`cascade` / `restrict` / `nullOnDelete`)
- [ ] Soft deletes genuinely needed, or is deletion final?
- [ ] Retention: what removes these rows eventually?
- [ ] Multi-tenant? Then every table gets `tenant_id` and every query is scoped

## 4. Design the slice

- [ ] Entry points: HTTP? API? Command? Queue? All of the above later?
- [ ] Action or service (see the table in `SKILL.md`)
- [ ] DTO shape defined
- [ ] Any scalar with rules → value object
- [ ] Any fixed set → enum
- [ ] Consequences listed as separate listeners
- [ ] Anything slow or external → queued job
- [ ] Domain exceptions named, and their HTTP rendering decided

## 5. Contracts

- [ ] Route names follow project convention
- [ ] Response shape decided (`laravel-api-standards` if API)
- [ ] Validation rules enumerated, including the boundaries (max lengths, array sizes)
- [ ] Authorization rules enumerated, including cross-tenant denial behaviour

## 6. Risk

- [ ] Does this touch money, PII, auth, or file uploads? → mandatory `laravel-security` review
- [ ] Is it a breaking change to an existing contract? → versioning plan
- [ ] Can it be rolled back safely? Are migrations reversible?
- [ ] Does it need a feature flag?

## 7. Verification plan

- [ ] Happy path test
- [ ] Authorization denial test (including cross-tenant → 404 not 403)
- [ ] Validation boundary tests
- [ ] Idempotency test if it is queued
- [ ] Query-count assertion if it renders a list

## 8. Say the plan out loud

Before generating, state: the layers you will create, the conventions you are following,
the assumptions you are making, and anything you found that looks wrong but is out of
scope. A wrong assumption is cheap to correct here and expensive to correct after nine
files exist.
