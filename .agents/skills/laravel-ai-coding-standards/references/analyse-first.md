# Analyse before generating

Ten minutes here prevents a pull request that introduces a second competing convention.

## 1. Versions and tooling

```bash
php -v
composer show laravel/framework | head -3
cat composer.json
cat package.json 2>/dev/null
ls -a | grep -E 'pint|phpstan|rector|phpunit|pest|editorconfig'
```

Record: PHP version, Laravel version, frontend stack (Blade / Livewire / Inertia+Vue /
Inertia+React / API-only), CSS framework, test framework, static analysis level.

**Do not generate syntax the runtime cannot parse.** PHP 8.4 property hooks in an 8.2
project fail at parse time. Laravel 12's `casts()` method form needs 11+.

## 2. Explicit project rules — these outrank everything

```bash
cat CLAUDE.md 2>/dev/null
cat CONTRIBUTING.md README.md 2>/dev/null
ls .claude/skills/ 2>/dev/null
ls docs/ 2>/dev/null
```

If `CLAUDE.md` says "no service classes, actions only", that is the rule. This library's
defaults yield to it without argument.

## 3. Structure

```bash
ls app/
find app -maxdepth 1 -type d
```

Presence of `app/Actions`, `app/Services`, `app/DTOs` (or `app/Data`), `app/ValueObjects`,
`app/Repositories`, `app/Enums`, `app/Support` tells you the chosen pattern set. **Adopt
it.**

If both `Actions/` and `Services/` exist, read three of each and work out the implicit rule
— usually services coordinate and actions are single steps. Follow whatever you find.

## 4. The closest existing feature

The highest-value step in this file.

```bash
# Building "invoices", and "orders" already exists
find app -ipath '*rder*'
grep -rn "orders" routes/
```

Read it end to end: route → form request → controller → action/service → model → resource →
test. Mirror the structure exactly, including things you would do differently.

## 5. Extract the conventions

| Question | Command |
|---|---|
| Controllers invokable or resourceful? | `grep -rl "__invoke" app/Http/Controllers \| wc -l` |
| `$fillable` or `$guarded`? | `grep -rn 'protected \$\(fillable\|guarded\)' app/Models \| head` |
| DTOs hand-rolled or spatie/laravel-data? | `grep -rn "Spatie\\\\LaravelData" app \| head` |
| Authz: policies, gates, or a package? | `ls app/Policies; grep -n "laravel-permission" composer.json` |
| Pest or PHPUnit classes? | `head -20 tests/Feature/*.php \| head -40` |
| Multi-tenant? | `grep -rn "tenant_id" database/migrations \| head` |
| Soft deletes? | `grep -rln "SoftDeletes" app/Models` |
| Translations used? | `grep -rn "__(" resources/views \| wc -l` |
| Route naming style | `php artisan route:list --json \| head -50` |

## 6. Global behaviour already configured

```bash
cat bootstrap/app.php
cat app/Providers/AppServiceProvider.php
ls app/Providers/
```

Look for anything that changes the rules for the code you are about to write:

- `Model::shouldBeStrict()` / `preventLazyLoading()` — if absent, do not rely on lazy-load
  exceptions to catch N+1s
- `Model::unguard()` — mass assignment is wide open
- `Relation::enforceMorphMap([...])` — **any new morphable model must be registered there**
  or polymorphic relations break
- Custom exception renderers
- Registered macros
- Global middleware
- Rate limiter definitions

## 7. Data model reality

```bash
ls database/migrations | tail -30
php artisan db:show
php artisan model:show Order
```

`php artisan model:show` gives attributes, casts, relations, and observers in one view —
the fastest way to understand a model you did not write.

Check: table naming, UUID vs auto-increment, timestamp conventions, existing indexes,
foreign key style, whether money is stored as integer minor units or (badly) as a float.

## 8. Say what you found

Before generating, state the constraints out loud:

> Laravel 11.9 / PHP 8.3. Livewire 3, Tailwind 3. `app/Actions` with invokable
> single-method classes. `$fillable` on models. Pest tests.
> spatie/laravel-permission for authz. Multi-tenant via a `tenant_id` global scope.
> `Model::shouldBeStrict()` is **not** enabled — I will not rely on lazy-load exceptions.
>
> I will follow those conventions rather than this library's defaults where they differ.

This makes your reading reviewable, and catches a wrong assumption before nine files exist.

## Red flags — report, do not silently fix

These are real problems, and fixing them is a **separate, scoped change**. Mention them;
do not bundle them into a feature PR.

| Finding | Why it matters |
|---|---|
| `protected $guarded = []` | Mass assignment → privilege escalation |
| `orderByRaw($request->input(...))` | SQL injection |
| No tenant scope on a list query | Cross-tenant data leak |
| 403 (not 404) for another tenant's record | Enumeration oracle |
| `env()` outside `config/` | Returns null once config is cached |
| Business logic in Blade | Untestable, unreusable |
| Controller over ~200 lines | Fat controller |
| `.env` committed | Every secret in it is compromised |
| No tests around the area you are changing | You cannot verify your change |
| `composer audit` findings | Known advisories |
| Money as `float` | Rounding errors on real money |

Frame it as: *"Noticed but out of scope: X. Separate fix?"*

## When the project has no conventions yet

A greenfield project, or one with no discernible pattern. Then this library's defaults
apply — but say so explicitly:

> This project has no established pattern for business logic yet. I am using the library's
> default: action classes in `app/Actions`, one public `handle()` each. If you prefer
> services, say so now — it is much cheaper to change before there are twenty of them.

Establishing a convention is a decision the user should get to make knowingly.

## Time budget

| Task size | Analysis time |
|---|---|
| Typo, one-line fix | Skip most of this; check the file's own style |
| Small change to existing code | Steps 1, 2, 4 |
| New feature | All of it |
| New subsystem | All of it, plus reading two comparable features |

Analysis is proportional to what you are about to commit, not a ritual.
