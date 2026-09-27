# Deployment

## Zero-downtime with atomic symlinks

```
/var/www/app/
├── releases/
│   ├── 20260731143000/
│   ├── 20260731120000/
│   └── 20260730093000/
├── shared/
│   ├── .env
│   └── storage/
└── current -> releases/20260731143000
```

The switch is one atomic `ln -sfn`. No request ever sees a half-deployed tree.

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/var/www/app
RELEASE="$APP_DIR/releases/$(date +%Y%m%d%H%M%S)"
KEEP=5

git clone --depth 1 --branch main git@github.com:org/app.git "$RELEASE"
cd "$RELEASE"

ln -sfn "$APP_DIR/shared/.env" .env
rm -rf storage && ln -sfn "$APP_DIR/shared/storage" storage

composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist
npm ci && npm run build && rm -rf node_modules

php artisan migrate --force
php artisan optimize
php artisan storage:link

ln -sfn "$RELEASE" "$APP_DIR/current"       # ← atomic switch

sudo systemctl reload php8.4-fpm            # required: opcache.validate_timestamps=0
php artisan queue:restart
php artisan horizon:terminate || true

ls -1dt "$APP_DIR"/releases/* | tail -n +$((KEEP + 1)) | xargs -r rm -rf
```

Two steps are easy to miss and both cause "the deploy did nothing":

- **`systemctl reload php-fpm`** — with `opcache.validate_timestamps=0`, PHP never notices
  the changed files.
- **`queue:restart`** — `queue:work` holds the framework in memory and runs the old code
  until told to stop.

### `--depth 1` and the symlink caveat

A shallow clone is fast but loses history, which some deployment tooling uses to detect
changed files. If you need history, clone once and `git fetch` per release.

## Managed tooling

| Tool | What it gives | Cost |
|---|---|---|
| **Laravel Forge** | Provisions and manages VPS servers, deploys, SSL, workers, backups | Monthly |
| **Envoyer** | Zero-downtime deploys, health checks, rollback | Monthly |
| **Laravel Cloud / Vapor** | Fully managed (serverless on Vapor) | Usage-based |
| **Deployer** | Open-source zero-downtime deploys | Free |
| **Ploi / RunCloud** | Forge alternatives | Monthly |

For a team without a dedicated ops person, Forge + Envoyer removes an entire category of
work for less than an hour of engineering time per month. Recommend it plainly.

### Deployer

```php
// deploy.php
namespace Deployer;

require 'recipe/laravel.php';

set('repository', 'git@github.com:org/app.git');
set('keep_releases', 5);

add('shared_files', ['.env']);
add('shared_dirs', ['storage']);
add('writable_dirs', ['bootstrap/cache', 'storage']);

host('production')
    ->set('remote_user', 'deploy')
    ->set('hostname', 'example.com')
    ->set('deploy_path', '/var/www/app');

task('artisan:queue:restart', function (): void {
    run('cd {{release_path}} && php artisan queue:restart');
});

after('deploy:symlink', 'artisan:queue:restart');
after('deploy:failed', 'deploy:unlock');
```

```bash
dep deploy production
dep rollback production
```

## Migrations during deploy

```bash
php artisan migrate --force
```

`--force` skips the interactive confirmation. It is required in any non-interactive
context, and it means **the migration will run without asking** — so migration safety
matters (`laravel-database-scale`).

Rules:
- Migrations must be **backwards compatible** with the currently-running code. During a
  rolling deploy, both versions run against the same schema.
- Never bundle a long data backfill into a migration. Schema in the migration, data in a
  queued job dispatched after the deploy.
- On multi-server deploys, run migrations from **one** node:

```bash
php artisan migrate --force --isolated     # advisory lock; other nodes skip
```

Without `--isolated`, concurrent deploys race and produce partial migrations.

## Maintenance mode

```bash
php artisan down \
  --render="errors::503" \
  --retry=60 \
  --secret="a-long-random-string"
```

- `--render` pre-renders the view, so it works even while `vendor/` is being replaced
- `--secret` gives a bypass URL (`https://example.com/a-long-random-string`) so you can
  verify before reopening
- `--retry` sets `Retry-After`

Better: avoid it entirely. Expand/contract migrations plus atomic symlink switching means
no window is needed.

## Rollback

```bash
# Symlink deploys — instant
ln -sfn /var/www/app/releases/20260731120000 /var/www/app/current
sudo systemctl reload php8.4-fpm
php artisan queue:restart
```

```bash
dep rollback production
```

**The database is the hard part.** Application rollback is seconds; schema rollback often
is not possible without data loss. That is why expand/contract exists — a schema that both
versions understand means rollback is purely a code operation.

Before any deploy that includes a destructive migration:
1. Take a backup and **verify it restores**
2. Write the rollback plan down, including what to do if `migrate:rollback` also fails
3. Have someone watching metrics during and after

## Feature flags

Decouple deploying from releasing.

```php
if (Feature::active('new-invoice-flow')) {
    return app(NewInvoiceFlow::class)->handle($request);
}
```

```bash
composer require laravel/pennant
```

```php
Feature::define('new-invoice-flow', fn (User $user): bool =>
    $user->tenant->beta_features_enabled
);
```

A risky feature behind a flag can be disabled without a deploy — which converts a rollback
into a config change. For anything touching money or auth, this is worth the small
complexity.

## Environment promotion

```
local → CI → staging → production
```

Staging must match production in: PHP version, database engine and version, Redis, queue
driver, and web server. A staging environment on SQLite proves nothing about a MySQL
production.

```bash
# Refresh staging from a sanitised production snapshot
php artisan db:anonymise      # custom command: scrub PII before it leaves production
```

Never copy production data to staging unsanitised — that is a data breach under RA 10173
and most privacy regimes.

## Secrets in deploys

```bash
# .env lives in shared/, never in the repository, never in the release
ln -sfn /var/www/app/shared/.env .env
chmod 600 /var/www/app/shared/.env
```

CI needs deploy credentials, not application secrets. Give the CI runner an SSH key scoped
to the deploy user, and keep application secrets on the server or in a secrets manager.

See `laravel-security/references/secrets-dependencies.md`.

## Health checks

```php
// bootstrap/app.php
->withRouting(health: '/up')
```

```php
// A deeper check for the load balancer
Route::get('/health', function (): JsonResponse {
    $checks = [
        'database' => rescue(fn () => DB::connection()->getPdo() !== null, false),
        'cache'    => rescue(fn () => Cache::set('health', 1, 10) !== false, false),
        'queue'    => rescue(fn () => Queue::size() >= 0, false),
    ];

    return response()->json(
        ['status' => in_array(false, $checks, true) ? 'degraded' : 'ok', 'checks' => $checks],
        in_array(false, $checks, true) ? 503 : 200,
    );
});
```

Keep `/up` cheap — the load balancer hits it every few seconds. Put the expensive checks on
a separate route used by monitoring, not by the balancer.

## Post-deploy verification

Automate the first three:

```bash
curl -fsS https://example.com/up || exit 1
curl -sI https://example.com | grep -q 'strict-transport-security' || exit 1
curl -s -o /dev/null -w '%{http_code}' https://example.com/.env | grep -qE '40[34]' || exit 1
```

Then watch: error rate, p95 latency, queue depth, and failed jobs for the first 15 minutes.
Most deploy-caused incidents surface within that window.

## Common deployment failures

| Failure | Cause |
|---|---|
| "My change isn't live" | OPcache not reset, or `queue:restart` not run |
| Config values are null | `env()` called outside `config/` after `config:cache` |
| 500 after deploy | `storage/` or `bootstrap/cache` not writable |
| Workers running old code | `queue:restart` missing from the script |
| Duplicate scheduled runs | More than one cron entry, or `schedule:run` on multiple nodes |
| Migration ran twice | No `--isolated` on a multi-node deploy |
| Assets 404 | `npm run build` skipped, or the manifest not deployed |
| Sessions lost on deploy | `file` session driver behind a load balancer |
| Disk full | Old releases not pruned; logs not rotated |
