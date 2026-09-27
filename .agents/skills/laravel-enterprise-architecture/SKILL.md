---
name: laravel-enterprise-architecture
description: Use when writing, reviewing, or restructuring Laravel application code — controllers, models, services, actions, DTOs, jobs, events, policies, form requests, API resources, or when deciding where a piece of logic belongs. Enforces Laravel 12 / PHP 8.4 conventions, SOLID, clean layering, and the pattern set (service layer, action classes, DTOs, value objects, repositories only when justified). Triggers on "where should this live", "refactor this controller", "add a feature", "service vs action", "should I use a repository", fat controllers, fat models, or any new Laravel class.
---

# Laravel Enterprise Architecture

Laravel 12 / PHP 8.4. Structure code so a stranger can find any behaviour in under a
minute and change it without touching three other layers.

## Step 0 — read the project before writing anything

Never generate a class before answering these. They take one pass and prevent the most
common failure: introducing a second way to do something the project already does.

```bash
composer show laravel/framework | head -3      # exact framework version
php -v                                          # PHP version actually running
ls app/                                         # which layers already exist
ls app/Actions app/Services app/DTOs 2>/dev/null
cat composer.json                               # autoload map, PSR-4 roots, dev tooling
```

Then: find the closest existing feature and mirror it. If the project puts business
logic in services, do not introduce actions alongside them. Consistency with a
mediocre-but-uniform pattern beats a better pattern applied to 5% of the codebase.
`references/existing-project-audit.md` has the full audit procedure.

## The layering rule

Request flows one direction. Each layer may call the layer below it, never above.

```
HTTP / Console / Queue entrypoint
        ↓  (Form Request validates, Policy authorizes)
Controller / Command / Job handler        ← thin: translate, delegate, respond
        ↓  (passes a DTO, never the Request object)
Action or Service                          ← all business logic lives here
        ↓
Model / Query Builder / Repository         ← persistence
        ↓
Database
```

Hard rules:

- **Controllers** never contain business logic, `if` chains on domain state, or queries
  beyond a trivial `findOrFail`. Target: under 15 lines per method.
- **Request objects stop at the controller.** Pass a DTO downward. A service that
  type-hints `Illuminate\Http\Request` cannot be called from a queue, a command, or a test.
- **Models** hold relationships, casts, scopes, and accessors. Not orchestration, not
  mail sending, not HTTP calls.
- **No layer skipping upward.** A model never dispatches a notification about a business
  decision it did not make; raise an event and let a listener decide.
- **Eloquent is allowed in services.** A repository interface is not required to be
  "clean"; see the decision rule below.

## Choosing the unit of business logic

| Situation | Use | Why |
|---|---|---|
| One verb, one use case (`PublishPost`, `RefundOrder`) | **Action class**, single `handle()` | Testable in isolation, obvious name, no god-class drift |
| Several closely-related operations over one aggregate | **Service class** | Shared private helpers, one injection point |
| Pure calculation, no I/O | **Value object** or plain method | No container, no mocking needed |
| Cross-cutting reaction to something that happened | **Event + Listener** | Decouples the cause from its consequences |
| Slow, retryable, or external-dependent work | **Job** (queued) | Keeps request latency bounded |

Default to **actions**. Promote to a service only when three or more actions share
meaningful private state or helpers. Never create `UserService` as a dumping ground —
a class named after a noun with 14 unrelated methods is the fat controller you moved.

## Repository pattern — the honest rule

Do **not** add repositories by default. Eloquent is already a data-access abstraction,
and a repository that wraps `Model::find()` adds a file, an interface, a binding, and
zero value.

Add one only when at least one is true:
- You must swap the persistence backend (Eloquent → external API → search index).
- The same non-trivial query is assembled in 3+ places and must not drift.
- A domain boundary genuinely must not know Eloquent exists (rare; usually only in
  DDD-styled bounded contexts).

If you add one, it returns **domain types or collections of them**, never query
builders — leaking a builder defeats the abstraction. Full argument and a worked
example: `references/patterns.md`.

## The pattern set — what each is for

Read `references/patterns.md` for full treatments. Summary contract:

- **Form Request** — validation + authorization for one endpoint. Put `authorize()`
  delegation to a Policy here, not inline `Gate::allows` in the controller.
- **DTO** — `readonly` class, named constructor from request/array, no behaviour beyond
  simple derivation. PHP 8.4: use property hooks for derived reads, asymmetric
  visibility instead of hand-written getters.
- **Value Object** — self-validating, immutable, equality by value (`Money`, `EmailAddress`,
  `Slug`). Invalid state is impossible to construct.
- **API Resource / Collection** — the only place a model becomes JSON. Never `return $model`.
- **Policy** — per-model authorization. **Gate** — everything not tied to a model.
- **Middleware** — cross-cutting request concerns only. Not business rules.
- **Event / Listener** — past-tense event names (`OrderShipped`), listeners queued by
  default unless they must run in-request.
- **Job** — idempotent, small payload (IDs not models where the model is large), explicit
  `$tries`/`$backoff`/`$timeout`, `uniqueId()` when duplicates are possible.
- **Notification / Mailable** — delivery only; decide *whether* to notify in a listener.

## PHP 8.4 and Laravel 12 defaults

```php
final class CreateInvoice
{
    public function __construct(
        private readonly InvoiceNumberGenerator $numbers,   // constructor promotion
    ) {}

    public function handle(CreateInvoiceData $data): Invoice { /* ... */ }
}
```

- `declare(strict_types=1);` in every PHP file.
- Type everything: params, returns, properties. No bare `array` where a shaped DTO,
  `list<Foo>` docblock, or generic collection annotation would do.
- `final` by default on actions, services, DTOs, jobs, listeners. Open for extension
  only where extension is designed for.
- Constructor property promotion, `readonly`, enums for fixed sets (`OrderStatus`),
  `never`/`true`/`false` return types where accurate.
- PHP 8.4: property hooks, asymmetric visibility (`private(set)`), `new` in initializers,
  `array_find`/`array_any`/`array_all`.
- Laravel 12: slim skeleton — bootstrap wiring in `bootstrap/app.php`, no `Kernel.php`;
  middleware, exceptions, and routing registered there.
- Dependency injection through the constructor. `app()`/facades only in glue code and
  never inside a domain class you want to unit test.

Details and migration notes: `references/php84-laravel12.md`.

## Composer and PSR

- PSR-4 autoloading, PSR-12 formatting (enforced by `laravel-code-quality`).
- Pin production deps to caret ranges; commit `composer.lock`; `--no-dev` in production
  builds.
- New top-level namespace? Register it in `composer.json` `autoload.psr-4` and run
  `composer dump-autoload`.
- Before adding a package: is it maintained, does it support the framework version, and
  does it earn its dependency weight? `references/composer.md`.

## Scope boundaries

This skill owns **structure and placement**. It does not own:
- query efficiency or caching → `laravel-performance`
- schema and index design → `laravel-database-scale`
- authorization *rules* content and OWASP defence → `laravel-security`
- REST response shape and versioning → `laravel-api-standards`
- test structure → `laravel-testing-qa`

## Before you finish

Run the gate: `checklists/architecture-review.md`.

## Bundled resources

- `references/layering.md` — full layer contracts, request lifecycle walkthrough
- `references/patterns.md` — every pattern with when-to-use and worked example
- `references/php84-laravel12.md` — version-specific syntax and skeleton changes
- `references/existing-project-audit.md` — the Step 0 procedure in detail
- `references/composer.md` — dependency policy
- `templates/` — stubs for Action, Service, DTO, Value Object, Policy, Job, Event,
  Listener, Form Request, API Resource, Repository
- `examples/refactor-fat-controller.md` — 120-line controller → action + DTO + policy
- `examples/feature-slice.md` — one complete feature across every layer
- `checklists/architecture-review.md` — pre-merge gate
- `checklists/new-feature.md` — planning gate

---
Last reviewed: 2026-07-31 · Targets Laravel 12 / PHP 8.4 · See MAINTENANCE.md
