# Before writing code

Proportional to the change. A typo fix skips most of this; a new subsystem does all of it.

## 1. Understand the ask

- [ ] What business operation, stated as a single verb phrase?
- [ ] Who is allowed to do it, under what conditions?
- [ ] What must be true before it runs?
- [ ] What must be true after?
- [ ] What are the consequences (mail, webhooks, cache, audit)?
- [ ] What should happen when it fails?
- [ ] Is anything ambiguous enough that two readings produce different features?

## 2. Analyse the project

- [ ] PHP and Laravel versions checked — **do not generate syntax the runtime cannot parse**
- [ ] `CLAUDE.md` / `CONTRIBUTING.md` read — these override this library
- [ ] `ls app/` — which layers exist
- [ ] The **closest existing feature** found and read end to end
- [ ] Conventions extracted: controller style, `$fillable`/`$guarded`, DTO style, authz
      package, test framework, tenancy
- [ ] `bootstrap/app.php` and `AppServiceProvider` checked for global behaviour
      (`shouldBeStrict`, `enforceMorphMap`, macros, rate limiters, exception renderers)
- [ ] Relevant table row counts checked if the change touches queries

```bash
php -v && composer show laravel/framework | head -3
cat CLAUDE.md 2>/dev/null
ls app/
php artisan db:show --counts
```

## 3. Route to skills

- [ ] Routing table consulted (`references/routing.md`)
- [ ] `laravel-testing-qa` loaded — always
- [ ] `laravel-security` loaded if input, auth, money, PII, uploads, or admin capability
- [ ] `laravel-database-scale` loaded if there is a migration or an index decision
- [ ] Not over-loaded — a typo fix does not need eleven skills

## 4. Check what already exists

Before creating anything:

- [ ] Searched for an existing helper, trait, scope, rule, cast, or component
- [ ] Checked whether the framework already provides it (`Number`, `Str`, `Context`,
      `defer`, `Cache::flexible`)
- [ ] Checked whether the index you are about to add already exists
- [ ] Checked whether the rate limiter you are about to define already exists

```bash
grep -rn "conceptName" app/ resources/ routes/ config/
php artisan db:show <table>
php artisan route:list --except-vendor | grep <resource>
```

## 5. Data

If the change touches the database:

- [ ] Expected rows at 1 year and 5 years
- [ ] Which columns will be filtered, sorted, joined
- [ ] Foreign keys and delete behaviour decided
- [ ] Retention: what removes these rows eventually?
- [ ] Multi-tenant? Then `tenant_id`, leading every composite index
- [ ] Migration safe to run on a populated table?

## 6. Risk

- [ ] Does this touch money, PII, auth, or file uploads? → security review is **mandatory**
- [ ] Is it a breaking change to an existing contract? → versioning plan
- [ ] Is it reversible? Are the migrations reversible?
- [ ] Does it need a feature flag?
- [ ] Could it fail in a way that loses data?

## 7. Plan the verification

- [ ] Happy path test
- [ ] Authorization denial test — cross-tenant returns **404**
- [ ] Validation boundary tests
- [ ] Query-count assertion if it renders a list
- [ ] Idempotency test if it creates or charges

## 8. State it out loud

Before generating, say:

- [ ] The versions and conventions you found, and that you will follow them
- [ ] Every assumption you are making
- [ ] Anything ambiguous, and which reading you chose
- [ ] Anything you noticed that is broken but out of scope
- [ ] The approach, if two reasonable ones existed, and why this one

> This project is Laravel 11.9 / PHP 8.3, actions in `app/Actions`, Pest, multi-tenant via
> a global scope. I will follow those.
>
> Assuming refunds are admin-only and the 90-day window is a business rule rather than a
> legal one. Both are one-line changes if wrong.
>
> Noted but out of scope: `OrderController::index` has no tenant scope. Separate fix?

A wrong assumption costs one message to correct here, and nine files to correct later.

## Stop and ask only if

- [ ] Proceeding under any assumption could delete production data
- [ ] Two readings produce completely different features
- [ ] Money movement is involved and the rule is genuinely unclear
- [ ] You need access or a credential you do not have

Otherwise: assume the safer option, say so, and build it.
