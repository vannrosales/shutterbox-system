# Existing project audit

Run before generating code in an unfamiliar repo. Ten minutes here prevents a PR that
introduces a second competing convention.

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

## 2. Structure

```bash
ls app/
find app -maxdepth 1 -type d
```

Which layers exist? Presence of `app/Actions`, `app/Services`, `app/DTOs` (or `app/Data`),
`app/ValueObjects`, `app/Repositories`, `app/Support`, `app/Enums` tells you the project's
chosen pattern set. **Adopt it.** Do not add `app/Actions` to a project that has used
`app/Services` for two years.

If the project has *both* Actions and Services, read three of each and work out the
implicit rule (often: services coordinate, actions are single steps). Follow it.

## 3. The closest existing feature

Find the feature most similar to what you are about to build and read it end to end:

```bash
# e.g. building "invoices", and "orders" already exists
find app -ipath '*rder*'
grep -rn "orders" routes/
```

Read: route → form request → controller → action/service → model → resource → tests.
This is the single highest-value step. Mirror its structure exactly.

## 4. Conventions to extract

| Question | How to check |
|---|---|
| Controllers: invokable or resourceful? | `grep -rl "__invoke" app/Http/Controllers \| wc -l` vs total |
| Are models `$fillable` or `$guarded`? | `grep -rn 'protected \$\(fillable\|guarded\)' app/Models \| head` |
| Route naming style | `php artisan route:list --json \| head -50` |
| Are DTOs hand-rolled or spatie/laravel-data? | `grep -rn "Spatie\\\\LaravelData" app \| head` |
| Authorization: policies, gates, or a permission package? | `ls app/Policies; grep -rn "spatie/laravel-permission" composer.json` |
| Test style: Pest or PHPUnit classes? | `head -20 tests/Feature/*.php \| head -40` |
| Multi-tenant? | `grep -rn "tenant_id" database/migrations \| head` |
| Soft deletes in use? | `grep -rln "SoftDeletes" app/Models` |
| Translation usage | `grep -rn "__(" resources/views \| wc -l` |

## 5. Global behaviour already configured

```bash
cat bootstrap/app.php
cat app/Providers/AppServiceProvider.php
ls app/Providers/
```

Look for: `Model::shouldBeStrict`, `Model::unguard`, custom exception renderers, macro
registrations, global middleware, rate limiter definitions, morph map. Anything here
changes the rules for the code you are about to write.

`Relation::enforceMorphMap([...])` in particular — if present, any new morphable model
must be registered there or polymorphic relations break.

## 6. Data model reality

```bash
ls database/migrations | tail -30
php artisan db:show
php artisan model:show Order
```

Check for: naming (`snake_case` plural tables?), UUID vs auto-increment IDs, timestamps
convention, existing indexes, foreign key style. `php artisan model:show` gives you
attributes, relations, and observers in one view.

## 7. Documentation and rules already in the repo

```bash
cat CLAUDE.md README.md CONTRIBUTING.md docs/*.md 2>/dev/null
ls .claude/
```

Explicit project rules always outrank this skill's defaults. If `CLAUDE.md` says
"no service classes, use actions only", that is the rule.

## 8. Write down what you found

Before generating, state the constraints you are working under:

> This project is Laravel 11.9 / PHP 8.3, Livewire 3, uses `app/Actions` with invokable
> single-method classes, `$fillable` on models, Pest tests, spatie/laravel-permission for
> authz, and multi-tenancy via a `tenant_id` global scope. I will follow those. Note:
> `Model::shouldBeStrict()` is not enabled — I will not rely on lazy-load exceptions.

This makes the assumptions reviewable and catches a wrong read early.

## Red flags to report (do not silently fix)

Report these; fixing them is a separate, scoped change:

- `protected $guarded = []` on models (mass assignment exposure → `laravel-security`)
- `DB::raw` with interpolated variables (SQL injection → `laravel-security`)
- Business logic in Blade templates
- Controllers over ~200 lines
- No tests around the area you are changing
- `.env` committed to the repository
- Dependencies with known advisories (`composer audit`)
