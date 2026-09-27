# Secrets and dependencies

## Secrets — the rules

1. **`.env` is never committed.** Verify history, not just the working tree.
2. **No `env()` outside `config/`.** It returns `null` once config is cached.
3. **Anything ever exposed is compromised.** Rotate it. Removing a commit does not un-leak
   a secret that was pushed.
4. **Different secrets per environment.** A shared `APP_KEY` between staging and production
   means a staging compromise decrypts production data.
5. **Production secrets belong in a manager**, not a file on the server.

### Checking history

```bash
git log --all --full-history --source -- .env
git log -p --all -S 'APP_KEY=' | head -50

# Better: a proper scanner
gitleaks detect --source . --verbose
trufflehog filesystem .
```

If anything is found: **rotate first**, then clean history. In that order. History rewriting
with `git filter-repo` or BFG does not help if the secret is already in someone's fork, a
CI log, or a mirror.

### `.gitignore`

```gitignore
.env
.env.*
!.env.example
*.pem
*.key
*.p12
auth.json
storage/*.key
.phpunit.result.cache
```

`.env.example` must contain **placeholder** values only:

```ini
APP_KEY=
DB_PASSWORD=
STRIPE_SECRET=sk_test_xxxxxxxx
```

Not a real test key. Test keys are still credentials.

### Configuration pattern

```php
// config/services.php
return [
    'stripe' => [
        'key'            => env('STRIPE_KEY'),
        'secret'         => env('STRIPE_SECRET'),
        'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
    ],
];
```

```php
// Application code — always config(), never env()
$secret = config('services.stripe.secret');
```

Fail fast if a required secret is missing:

```php
// AppServiceProvider::boot()
if ($this->app->isProduction()) {
    foreach (['services.stripe.secret', 'app.key'] as $key) {
        throw_if(blank(config($key)), RuntimeException::class, "Missing config: {$key}");
    }
}
```

A missing secret that surfaces as a null-pointer three layers deep is much harder to
diagnose than one that fails at boot.

### Secret managers

| Platform | Service |
|---|---|
| AWS | Secrets Manager / SSM Parameter Store |
| GCP | Secret Manager |
| Azure | Key Vault |
| Self-hosted | HashiCorp Vault |
| Platform-agnostic | Doppler, Infisical |
| Laravel Forge / Vapor / Cloud | Built-in environment management |

```php
// Loading at boot from a manager
$this->app->singleton('secrets', fn () => Cache::remember('secrets', 300, fn () =>
    (new SecretsManagerClient)->getSecretValue(['SecretId' => 'prod/app'])
));
```

Cache the fetch — hitting the secrets API on every request adds latency and cost.

### Rotation

Anything with a credential needs a rotation procedure written down:

| Secret | Rotation notes |
|---|---|
| `APP_KEY` | **Re-encrypts nothing automatically.** All `encrypted` casts become unreadable. Use `APP_PREVIOUS_KEYS` to decrypt old data while writing with the new key. |
| DB password | Update the manager, restart workers, then change on the DB |
| API keys | Create new → deploy → verify → revoke old |
| Webhook secrets | Most providers allow two active secrets during rotation |
| Sanctum tokens | Revoke on password change and device removal |

```ini
APP_KEY=base64:newkey...
APP_PREVIOUS_KEYS=base64:oldkey...
```

### Encrypted data at rest

```php
protected function casts(): array
{
    return [
        'tax_id'      => 'encrypted',
        'bank_details'=> 'encrypted:array',
    ];
}
```

Encrypted columns cannot be indexed, searched, or sorted. For lookup, store a blind index:

```php
$table->text('tax_id');                        // encrypted
$table->string('tax_id_hash', 64)->index();    // hash_hmac('sha256', normalise($value), $key)
```

```php
$user->tax_id      = $taxId;
$user->tax_id_hash = hash_hmac('sha256', Str::upper(trim($taxId)), config('app.blind_index_key'));

User::where('tax_id_hash', $hash)->first();
```

Use a **separate key** from `APP_KEY` for blind indexes, so rotating one does not force
re-encrypting the other.

## Dependencies

### Audit in CI, failing the build

```bash
composer audit --format=json
npm audit --audit-level=high
```

```yaml
- name: Composer audit
  run: composer audit --no-interaction

- name: npm audit
  run: npm audit --audit-level=high
```

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: composer
    directory: "/"
    schedule: { interval: weekly }
    open-pull-requests-limit: 10
  - package-ecosystem: npm
    directory: "/"
    schedule: { interval: weekly }
  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: monthly }
```

GitHub Actions are dependencies too — a compromised action has full access to your CI
secrets. Pin third-party actions to a commit SHA, not a tag:

```yaml
- uses: some/action@a1b2c3d4e5f6...    # not @v3
```

### Vetting a new package

| Question | Red flag |
|---|---|
| Last release? | Over 18 months with open issues |
| Framework support? | Does not list your Laravel version |
| Downloads / dependents? | Very low for a package claiming to be standard |
| Maintainers? | Single maintainer, no succession |
| Open advisories? | `composer audit` after adding it |
| Dependency weight? | 14 transitive deps to save 30 lines |
| Does the framework already do this? | Laravel ships HTTP, queue, cache, validation, mail |
| Licence? | GPL in a commercial product |

```bash
composer show vendor/package
composer why vendor/package
composer depends vendor/package --tree
```

### Supply chain

- **Commit lock files.** They are the reproducibility and integrity guarantee.
- `composer install`, never `composer update`, in CI and production.
- `--no-dev` in production: Telescope, Debugbar, and Ignition are development tools that
  expose internals.
- Beware typosquats: `larave/framework`, `guzzlehttp/guzz1e`. Check the vendor name.
- Consider a private Packagist mirror for regulated environments.

```bash
composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist
```

### Production build verification

```bash
# No dev packages present
composer show --installed | grep -iE 'telescope|debugbar|ignition|faker'

# Nothing sensitive reachable
curl -I https://example.com/.env
curl -I https://example.com/telescope
curl -I https://example.com/storage/logs/laravel.log
curl -I https://example.com/composer.json
```

All must be 403 or 404.

## Static analysis for security

```bash
# Taint analysis — tracks user input to dangerous sinks
composer require --dev vimeo/psalm psalm/plugin-laravel
vendor/bin/psalm --taint-analysis

# General static analysis at a high level catches many security-relevant bugs
vendor/bin/phpstan analyse --level=8
```

Psalm's taint analysis is the only widely-available PHP tool that will actually trace
`$request->input()` into `DB::raw()` and flag it. Worth running even if the project uses
PHPStan for everything else.

See `laravel-code-quality` for the general static-analysis setup.

## Secrets in logs and errors

```php
// config/logging.php — never log raw request bodies on auth routes
```

```php
// bootstrap/app.php
->withExceptions(function (Exceptions $exceptions): void {
    $exceptions->dontFlash(['current_password', 'password', 'password_confirmation', 'token']);
})
```

Check what your error tracker sends. Sentry, Bugsnag, and similar capture request data by
default — configure scrubbing:

```php
// Sentry
'before_send' => function (Event $event): ?Event {
    // strip authorization headers, cookies, password fields
    return $event;
},
```

A stack trace emailed to a developer with `password=hunter2` in the request body is a
breach, not a debugging aid.
