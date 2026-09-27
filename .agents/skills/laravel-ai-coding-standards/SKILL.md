---
name: laravel-ai-coding-standards
description: Load this FIRST for any code change in a Laravel project. The meta-skill for the Laravel Enterprise Skill Library — defines how to analyse a project before generating code, which of the other eleven skills to pull in for a given task, and the output contract (reuse existing patterns, avoid duplicate logic, preserve backwards compatibility, explain trade-offs, ship production-ready code). Triggers on any Laravel work: "add a feature", "fix", "refactor", "implement", "build", or the start of any coding session in a Laravel repository.
---

# AI Coding Standards

This is the routing skill. Load it first; it tells you which of the other eleven to pull in
and what the output must satisfy.

## The order of operations

```
1. Understand the ask        → what business operation, for whom, under what rules
2. Analyse the project       → versions, structure, conventions, closest existing feature
3. Route to the skills       → the table below
4. State assumptions         → before generating, not after
5. Generate                  → matching the project's patterns, not this library's defaults
6. Verify                    → the relevant checklists
7. Report honestly           → what was done, what was skipped, what is uncertain
```

Steps 2 and 4 are the ones that get skipped, and skipping them is what produces code that
is technically correct and unusable.

## Step 2 — analyse before generating

```bash
php -v && composer show laravel/framework | head -3
ls app/                                    # which layers exist
cat composer.json                           # tooling, autoload roots
cat CLAUDE.md 2>/dev/null                   # project rules override this library
ls .claude/skills/ 2>/dev/null
```

Then find the **closest existing feature** and read it end to end: route → form request →
controller → action → model → resource → test. Mirror its structure.

**Consistency with the project beats correctness by this library's standards.** If the
project puts business logic in services, do not introduce actions alongside them. A
mediocre-but-uniform pattern applied everywhere is worth more than a better pattern applied
to 5% of the codebase.

Full procedure: `laravel-enterprise-architecture/references/existing-project-audit.md`.

## Step 3 — routing table

| The task involves | Load |
|---|---|
| Any new class — where does it go? | `laravel-enterprise-architecture` |
| A migration, schema, index, or a table that will grow | `laravel-database-scale` |
| A query, list page, report, export, or anything slow | `laravel-performance` |
| User input, auth, authorization, money, PII, admin capability | `laravel-security` |
| Any markup, form, component, or email template | `laravel-ui-accessibility` |
| Any layout, CSS, or breakpoint | `laravel-responsive-design` |
| A file upload, image, or attachment | `laravel-media-management` |
| A route in `routes/api.php` | `laravel-api-standards` |
| Any change at all (tests are not optional) | `laravel-testing-qa` |
| Deployment, Docker, CI, servers, backups | `laravel-devops-deployment` |
| Before declaring anything done | `laravel-code-quality` |

Most non-trivial features load four to six. A new API endpoint that stores an uploaded file
touches architecture, database, security, media, API standards, testing, and quality.

Load what applies. Do not load all eleven for a typo fix.

## Step 4 — state assumptions before generating

Say what you found and what you are about to do:

> This project is Laravel 11.9 / PHP 8.3, Livewire 3, `app/Actions` with invokable
> single-method classes, `$fillable` on models, Pest, spatie/laravel-permission, and
> multi-tenancy via a `tenant_id` global scope. I will follow those conventions.
>
> Assumptions: refunds are admin-only; the 90-day window is a business rule, not a legal
> one. Say if either is wrong.
>
> Noted but out of scope: `OrderController` has no tenant scope on its index query — that
> looks like a data leak. Separate fix?

A wrong assumption is cheap to correct here and expensive after nine files exist.

## The output contract

Every generated change must satisfy all of these.

**Reuse before creating.** Search for existing helpers, traits, scopes, and rules before
writing a new one. A second `formatCurrency()` is a bug waiting to diverge.

**Match the project's style.** Its naming, its folder layout, its test framework, its
comment density. Not this library's defaults where they conflict.

**No duplicate logic.** If the same business rule exists in two places, they will diverge.
Extract when the copies must change together — not merely because they look alike
(`laravel-code-quality/references/complexity.md`).

**Backwards compatible by default.** Additive changes over breaking ones. If a break is
unavoidable, say so explicitly, name what breaks, and propose the migration path.

**Production-ready, not proof-of-concept.** Validation, authorization, error handling,
types, and tests. Not `// TODO: add validation`.

**Explain significant trade-offs.** When you choose between two reasonable approaches, say
which and why in one or two sentences. Not a survey of every option.

**Prefer maintainability over cleverness.** The reader is someone six months from now with
less context than you have.

**Keep it simple unless complexity is justified.** Nine files for a core business operation
is right. Nine files for an admin script touched once a year is not.

## Honest reporting

State plainly:
- What you did
- What you did **not** do, and why
- What you assumed
- What you are unsure about
- Anything you noticed that is broken but out of scope

Never report "done" when a step was skipped. If tests fail, say so with the output. If you
could not verify something, say that rather than implying you did.

If you disagree with the request, say so in a sentence or two, then **build what was
asked** under stated assumptions. The scope is the user's call.

## Before finishing

Run the checklists for whichever skills you loaded. At minimum:

```bash
composer qa          # lint, static analysis, tests
```

- `laravel-code-quality/checklists/quality-review.md` — always
- `laravel-security/checklists/security-review.md` — mandatory for money, PII, auth, uploads
- Plus the checklist of any other skill you loaded

## Scope boundaries

Owns: the analyse-first workflow, the routing table, the output contract, and honest
reporting.

Owns nothing technical. Every rule about *what the code should be* lives in skills 1–11.
This skill only decides which of them applies and how to approach the work.

## Bundled resources

- `references/analyse-first.md` — the full pre-generation procedure with commands
- `references/routing.md` — detailed routing, including multi-skill tasks and conflicts
- `references/output-contract.md` — each contract item with good/bad examples
- `references/working-with-humans.md` — assumptions, questions, disagreement, scope
- `templates/CLAUDE.md.stub` — project instructions file that wires in this library
- `examples/end-to-end-task.md` — one request handled from analysis to sign-off
- `checklists/pre-generation.md` — before writing code
- `checklists/pre-completion.md` — before saying it is done

---
Last reviewed: 2026-07-31 · See MAINTENANCE.md
