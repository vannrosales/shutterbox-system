# Routing to the right skills

## The full table

| Trigger in the task | Skill | What it decides |
|---|---|---|
| Any new class | `laravel-enterprise-architecture` | Where it goes, which pattern |
| Migration, schema, index, growing table | `laravel-database-scale` | Column types, keys, indexes, retention |
| Query, list, report, export, "slow" | `laravel-performance` | N+1, eager loading, caching, chunking |
| Input, auth, money, PII, uploads, admin | `laravel-security` | Validation, authz, escaping, headers |
| Markup, form, component, email template | `laravel-ui-accessibility` | Semantics, ARIA, keyboard, contrast |
| Layout, CSS, breakpoints | `laravel-responsive-design` | Units, breakpoints, overflow, touch |
| File upload, image, attachment | `laravel-media-management` | Validation, storage, derivatives, CDN |
| `routes/api.php` | `laravel-api-standards` | URIs, status codes, envelope, versioning |
| **Any change** | `laravel-testing-qa` | What to test, factories, fakes |
| Deploy, Docker, CI, server, backup | `laravel-devops-deployment` | Infrastructure |
| **Before declaring done** | `laravel-code-quality` | Style, static analysis, complexity |

## Worked routing

### "Add an endpoint that lets users upload a profile photo"

| Skill | Why |
|---|---|
| `laravel-enterprise-architecture` | Controller thin, action for the operation, DTO for input |
| `laravel-security` | `mimetypes:` not `mimes:`, private disk, authorization on retrieval |
| `laravel-media-management` | Storage layout, ULID filename, queued derivatives, EXIF |
| `laravel-api-standards` | 201 + `Location`, error envelope, rate limit |
| `laravel-database-scale` | The `media` table's indexes and retention |
| `laravel-ui-accessibility` | `alt` as a required validated field |
| `laravel-testing-qa` | The disguised-PHP test, cross-user 404 test |
| `laravel-code-quality` | `composer qa` before finishing |

Eight skills for what sounds like one endpoint. That is normal — an upload touches
security, storage, performance, and accessibility simultaneously.

### "The invoices page is slow"

| Skill | Why |
|---|---|
| `laravel-performance` | Diagnose first: query count, EXPLAIN, profiling |
| `laravel-database-scale` | If the fix is an index or pagination strategy |
| `laravel-testing-qa` | Add the query-count assertion so it stays fixed |

Not architecture, not security. Do not expand the scope of a performance fix.

### "Fix the typo in the welcome email"

| Skill | Why |
|---|---|
| `laravel-ui-accessibility` | Email is UI — if the text changes, check it is via `__()` |

That is all. Loading eleven skills for a one-word change wastes attention and buries the
change in ceremony.

### "Refactor the OrderController"

| Skill | Why |
|---|---|
| `laravel-enterprise-architecture` | The layering rules and the fat-controller example |
| `laravel-security` | A refactor is when authz gaps become visible |
| `laravel-performance` | And when N+1s become visible |
| `laravel-testing-qa` | Tests must exist **before** refactoring, or you cannot verify |
| `laravel-code-quality` | Rector for the mechanical parts |

Note the ordering: if there are no tests around the code, write them first. A refactor
without tests is a rewrite with extra steps.

## When two skills seem to conflict

They should not — the ownership table in `.claude/skills/README.md` is the authority. If
you find a genuine contradiction, that is a library bug: follow the more specific skill and
report the conflict.

Known shared areas and the agreed split:

| Topic | Skill A says | Skill B says |
|---|---|---|
| WCAG 1.4.10 reflow | `laravel-ui-accessibility`: the criterion | `laravel-responsive-design`: the technique |
| Indexes | `laravel-performance`: check the plan, add what the query needs | `laravel-database-scale`: how to *choose* one |
| Multi-tenancy | `laravel-database-scale`: schema shape | `laravel-security`: enforcement |
| `per_page` cap | `laravel-performance`: a perf control | `laravel-security`: an abuse control |
| Upload validation | `laravel-media-management`: the rules | `laravel-security`: why they matter |
| `alt` text | `laravel-media-management`: make it required | `laravel-ui-accessibility`: what good alt says |
| Rate limiting | `laravel-security`: the definitions | `laravel-devops-deployment`: Nginx and CDN |
| Query counts | `laravel-performance`: why | `laravel-testing-qa`: the assertion |

In every row both skills agree; they address different halves. Reading either alone gets
you to the right answer.

## When the project overrides the library

`CLAUDE.md` and explicit user instruction outrank every skill here.

```
Priority, highest first:

1. The user's explicit instruction in this conversation
2. The project's CLAUDE.md / CONTRIBUTING.md
3. The project's existing patterns (observed in code)
4. This library's skills
5. General Laravel convention
```

If the project does something this library calls wrong — repositories wrapping Eloquent,
say — follow the project, and mention the disagreement once:

> This project wraps Eloquent in repositories. I have followed that for consistency. Worth
> noting the library considers it unnecessary overhead unless a second implementation
> exists — but changing it is a separate decision, not something to do inside this feature.

Say it once. Do not relitigate it in every subsequent change.

## Loading discipline

**Load what applies.** Do not load all eleven reflexively — each one consumes attention
that should go to the actual problem.

**But do not under-load.** The commonly-missed ones:

| Often skipped | Why it matters |
|---|---|
| `laravel-testing-qa` | Tests are part of the change, not an optional extra |
| `laravel-security` | Any input, any authorization, any money |
| `laravel-database-scale` | Every migration, every index decision |
| `laravel-ui-accessibility` | Email templates are UI too |
| `laravel-code-quality` | Before saying it is done |

The pattern in escaped defects is almost always a skipped security or testing pass, not a
skipped architecture pass.

## Reading depth

Each skill's `SKILL.md` is short by design — read it fully. The `references/` files are
loaded on demand:

- Read the reference when you need the detail (which index, which CSP directive, which
  Rector set)
- Skim the checklist before finishing
- The examples are worth reading once per skill, not per task

Do not paste whole reference files into your reasoning. Pull the specific rule you need.
