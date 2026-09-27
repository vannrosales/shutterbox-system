# Test suite setup

## Pest

```bash
composer require --dev pestphp/pest pestphp/pest-plugin-laravel
php artisan pest:install
```

```php
// tests/Pest.php
pest()->extend(Tests\TestCase::class)
    ->use(Illuminate\Foundation\Testing\RefreshDatabase::class)
    ->in('Feature', 'Unit');

pest()->extend(Tests\DuskTestCase::class)
    ->use(Laravel\Dusk\Concerns\ProvidesBrowser::class)
    ->in('Browser');
```

## `phpunit.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true"
         failOnWarning="true"
         failOnRisky="true"
         failOnDeprecation="true"
         beStrictAboutOutputDuringTests="true">
    <testsuites>
        <testsuite name="Unit">    <directory>tests/Unit</directory></testsuite>
        <testsuite name="Feature"> <directory>tests/Feature</directory></testsuite>
    </testsuites>

    <source>
        <include><directory>app</directory></include>
        <exclude>
            <directory>app/Providers</directory>
            <file>app/Http/Middleware/TrustProxies.php</file>
        </exclude>
    </source>

    <php>
        <env name="APP_ENV" value="testing"/>
        <env name="APP_MAINTENANCE_DRIVER" value="file"/>
        <env name="BCRYPT_ROUNDS" value="4"/>
        <env name="CACHE_STORE" value="array"/>
        <env name="DB_CONNECTION" value="sqlite"/>
        <env name="DB_DATABASE" value=":memory:"/>
        <env name="MAIL_MAILER" value="array"/>
        <env name="QUEUE_CONNECTION" value="sync"/>
        <env name="SESSION_DRIVER" value="array"/>
        <env name="TELESCOPE_ENABLED" value="false"/>
        <env name="SCOUT_DRIVER" value="null"/>
        <env name="PULSE_ENABLED" value="false"/>
    </php>
</phpunit>
```

`failOnWarning`, `failOnRisky`, and `failOnDeprecation` are the settings people skip. They
turn "the suite passes but prints 400 lines of noise" into an actionable failure, and they
catch deprecations before the framework upgrade forces you to.

`beStrictAboutOutputDuringTests` catches stray `dd()` and `var_dump()` before review does.

## Database strategy

| Trait | Speed | Isolation | Use |
|---|---|---|---|
| `RefreshDatabase` | Fast (transaction rollback) | Per test | **Default** |
| `DatabaseTransactions` | Fast | Per test | When migrations are slow and the schema is stable |
| `DatabaseMigrations` | Slow (re-migrates each test) | Total | Rarely — only when a test alters schema |
| `DatabaseTruncation` | Medium | Per test | Browser tests, where transactions cannot span processes |

```php
uses(RefreshDatabase::class);
```

`RefreshDatabase` migrates once, then wraps each test in a transaction it rolls back. It is
the right default and it is fast.

### SQLite vs the real engine

In-memory SQLite makes the suite quick but hides real problems:

| Difference | Consequence |
|---|---|
| Lax type coercion | A string written to an integer column passes locally, fails in production |
| Foreign keys off by default | Broken FK constraints never surface |
| No `ALTER` for many operations | Migrations that work locally fail on deploy |
| Different collation and case sensitivity | `where('email', 'A@B.com')` matches locally, not in MySQL |
| No full-text index | `whereFullText` tests must be skipped or faked |
| Different date function behaviour | `whereDate` edge cases diverge |

**Run against the production engine in CI.** Locally SQLite is fine; a pipeline that only
ever ran SQLite will ship a broken migration.

```php
// Turn on FK enforcement so SQLite at least catches integrity errors
// AppServiceProvider::boot()
if (DB::connection() instanceof SQLiteConnection) {
    DB::statement('PRAGMA foreign_keys = ON');
}
```

```yaml
# CI runs both
strategy:
  matrix:
    db: [sqlite, mysql]
```

## Base TestCase

```php
abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // A stray real HTTP call is the #1 cause of flaky, slow tests.
        // This turns it into a clear failure instead.
        Http::preventStrayRequests();

        // Catch N+1s in tests, not in production.
        Model::preventLazyLoading();

        // Deterministic randomness — a test that fails one run in fifty is worse
        // than no test.
        fake()->seed(1234);
    }
}
```

`Http::preventStrayRequests()` is the highest-value line in the file. Without it, a test
that forgets `Http::fake()` makes a real network call: slow, flaky, and occasionally
charges money.

## Parallel testing

```bash
composer require --dev brianium/paratest
php artisan test --parallel --processes=8
```

Each process gets its own database (`testing_1`, `testing_2`, …). Typical speedup on an
8-core machine: 4–6×.

Things that break under parallelism:

```php
// ✗ Shared filesystem paths collide between processes
Storage::disk('local')->put('report.pdf', $content);

// ✓ Use the fake, or a per-process path
Storage::fake('local');
```

```php
// ✗ Hardcoded ports, shared cache keys, global state
// ✓ ParallelTesting hooks for per-process setup
ParallelTesting::setUpTestDatabase(function (string $database, int $token): void {
    Artisan::call('db:seed', ['--class' => ReferenceDataSeeder::class]);
});
```

Run `--parallel` in CI from day one. Retrofitting it into a suite full of shared state is
painful.

## Selective runs

```bash
php artisan test --dirty                       # only tests for changed files (git)
php artisan test --filter=refund
php artisan test tests/Feature/Invoices
php artisan test --group=slow
php artisan test --stop-on-failure
php artisan test --retry                       # re-run only the previous failures
```

```php
// Tag slow tests so they can be excluded locally
it('processes a large import', function (): void {
    // ...
})->group('slow');
```

```bash
php artisan test --exclude-group=slow          # fast local loop
php artisan test                                # everything, in CI
```

## Coverage

```bash
# Xdebug: accurate, slow
XDEBUG_MODE=coverage php artisan test --coverage --min=80

# PCOV: much faster, sufficient for line coverage
php artisan test --coverage --min=80
```

PCOV is roughly 5× faster than Xdebug for coverage. Install both: Xdebug for debugging,
PCOV for coverage.

```xml
<source>
    <include><directory>app</directory></include>
    <exclude>
        <directory>app/Providers</directory>
        <directory>app/Console/Commands/Development</directory>
    </exclude>
</source>
```

Exclude what genuinely cannot be tested meaningfully. Do not exclude code because it is
untested — that is the code you need to know about.

## Composer scripts

```json
{
    "scripts": {
        "test":          "pest --parallel",
        "test:fast":     "pest --parallel --exclude-group=slow",
        "test:coverage": "pest --coverage --min=80",
        "test:dirty":    "pest --dirty",
        "qa":            ["@lint", "@stan", "@test"]
    }
}
```

One vocabulary for developers and CI: `composer qa`.

## CI

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        php: ['8.4']
        db: [sqlite, mysql]

    services:
      mysql:
        image: mysql:8.4
        env:
          MYSQL_DATABASE: testing
          MYSQL_ALLOW_EMPTY_PASSWORD: 'yes'
        ports: ['3306:3306']
        options: >-
          --health-cmd="mysqladmin ping" --health-interval=10s
          --health-timeout=5s --health-retries=5

    steps:
      - uses: actions/checkout@v4

      - uses: shivammathur/setup-php@v2
        with:
          php-version: ${{ matrix.php }}
          extensions: mbstring, pdo_mysql, intl, gd, redis
          coverage: pcov

      - name: Cache Composer
        uses: actions/cache@v4
        with:
          path: ~/.composer/cache
          key: composer-${{ hashFiles('composer.lock') }}

      - run: composer install --no-interaction --prefer-dist --no-progress
      - run: cp .env.example .env && php artisan key:generate

      - name: Run tests
        run: php artisan test --parallel --coverage --min=80
        env:
          DB_CONNECTION: ${{ matrix.db }}
          DB_HOST: 127.0.0.1
          DB_DATABASE: ${{ matrix.db == 'sqlite' && ':memory:' || 'testing' }}
          DB_USERNAME: root
          DB_PASSWORD: ''
```

## Flaky tests

A flaky test is worse than no test — it trains the team to re-run rather than investigate.

Causes, in order of frequency:

| Cause | Fix |
|---|---|
| Real HTTP calls | `Http::preventStrayRequests()` + `Http::fake()` |
| Time dependence | `travelTo()`, `freezeTime()` |
| Random data hitting a boundary | `fake()->seed()`, or use explicit values |
| Order dependence (shared state) | `RefreshDatabase`, no static state |
| Parallel collisions | Fake the filesystem, scope cache keys |
| Async assumptions in browser tests | `waitFor`, never `pause` |
| Auto-increment ID assumptions | Assert on relationships, not literal ids |

```bash
php artisan test --repeat=10 --filter=SuspectTest    # reproduce
php artisan test --order-by=random                    # find order dependence
```

Policy: **quarantine or fix within one sprint.** A test in `--group=flaky` that nobody
fixes should be deleted — it is providing negative value.
