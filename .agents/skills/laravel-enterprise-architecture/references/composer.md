# Composer and dependency policy

## Before adding any package

Answer all five. If any answer is bad, do not add it.

1. **Does the framework already do this?** Laravel ships HTTP client, queues, cache,
   filesystem abstraction, validation, mail, notifications, scheduling, rate limiting,
   pagination, and encryption. A package that duplicates one of these needs a strong reason.
2. **Is it maintained?** Last release under 12 months, open issues triaged, supports the
   framework version you are on. `composer show <pkg>` and the repo.
3. **How much surface does it add?** A package pulling 14 transitive dependencies to save
   30 lines is a bad trade.
4. **What happens when it dies?** Can you replace it behind an interface you own?
5. **Licence compatible?** Check for GPL contamination in commercial projects.

Packages that reliably earn their place: `spatie/laravel-permission`,
`spatie/laravel-medialibrary`, `spatie/laravel-backup`, `laravel/horizon`,
`laravel/scout`, `barryvdh/laravel-debugbar` (dev), `larastan/larastan` (dev),
`rector/rector` (dev), `pestphp/pest` (dev).

## composer.json hygiene

```json
{
    "require": {
        "php": "^8.4",
        "laravel/framework": "^12.0"
    },
    "require-dev": {
        "larastan/larastan": "^3.0",
        "laravel/pint": "^1.18",
        "pestphp/pest": "^3.0",
        "rector/rector": "^2.0"
    },
    "autoload": {
        "psr-4": {
            "App\\": "app/",
            "Database\\Factories\\": "database/factories/",
            "Database\\Seeders\\": "database/seeders/"
        }
    },
    "config": {
        "optimize-autoloader": true,
        "sort-packages": true,
        "allow-plugins": {
            "pestphp/pest-plugin": true
        }
    },
    "scripts": {
        "lint":    "pint --test",
        "fix":     "pint",
        "stan":    "phpstan analyse --memory-limit=1G",
        "test":    "pest --parallel",
        "rector":  "rector process --dry-run",
        "qa":      ["@lint", "@stan", "@test"]
    }
}
```

- Caret constraints (`^12.0`) for libraries; never `*`, never `dev-master` in production.
- **Commit `composer.lock`.** It is the reproducibility guarantee.
- Dev-only tooling goes in `require-dev` — it must not ship to production.
- `"scripts"` entries give the team and CI one vocabulary: `composer qa`.

## Install commands by environment

```bash
# Local
composer install

# Production build
composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist

# CI
composer install --no-interaction --prefer-dist --no-progress
```

`--no-dev` in production is not optional: dev packages (Debugbar, Telescope, Ignition)
can expose internals. See `laravel-security`.

## Security and updates

```bash
composer audit                 # known advisories in the lock file — run in CI
composer outdated --direct     # what has moved, direct deps only
composer why-not laravel/framework 12.0   # what blocks an upgrade
```

Policy:
- `composer audit` runs on every CI build and fails the build on high/critical.
- Patch and minor updates reviewed monthly.
- Major upgrades are their own PR with their own test run — never inside a feature PR.
- Renovate/Dependabot configured for automated PRs, with CI as the gate.

## Adding a namespace

New top-level namespace (e.g. a `Domain/` root):

```json
"autoload": {
    "psr-4": {
        "App\\": "app/",
        "Domain\\": "src/Domain/"
    }
}
```

Then `composer dump-autoload`. Forgetting this produces a "class not found" that looks
like a typo.

Only introduce a second root namespace if the project is genuinely moving to a
modular/DDD layout — otherwise `App\` with subdirectories is simpler and idiomatic.

## Private packages

Extracting shared code into a private package is right when three or more projects use it
and it has its own release cycle. Below that bar, duplication is cheaper than the
versioning overhead.

```json
"repositories": [
    { "type": "vcs", "url": "git@github.com:org/laravel-shared.git" }
]
```

Pin private packages to tags, not branches.
