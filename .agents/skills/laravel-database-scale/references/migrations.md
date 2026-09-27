# Safe migrations

A migration that locks a 50M-row table is an outage. Everything here is about changing
schema while the application keeps serving.

## The danger table

| Operation | MySQL 8 InnoDB | PostgreSQL | Safe on a large table? |
|---|---|---|---|
| Add nullable column, no default | Instant (metadata) | Instant | Yes |
| Add column with default | Instant (8.0.12+) | Instant (11+) | Yes |
| Add NOT NULL without default | Table rebuild | Table rewrite | **No** |
| Drop column | Instant (8.0.29+) | Instant | Usually |
| Rename column | Instant | Instant | Yes — but breaks running code |
| Change column type | Rebuild | Rewrite | **No** |
| Add index | Online (in-place) | Locks writes unless CONCURRENTLY | Use CONCURRENTLY on PG |
| Drop index | Instant | Instant | Yes |
| Add FK | Validates all rows | Validates all rows | **No** on big tables |
| `AFTER column` positioning | **Full rebuild** | n/a | **No** |

The `->after('column')` trap catches people constantly — it forces a full table copy on
MySQL even when adding the column alone would have been instant. Never use it on a large
table.

## Expand / contract

Never change a column's meaning in one release. Three releases:

**1. Expand** — add the new thing, write to both.

```php
// Migration
Schema::table('users', fn (Blueprint $t) => $t->string('full_name')->nullable());
```

```php
// Application: write both, read the old one
$user->name = $data->name;
$user->full_name = $data->name;
```

**2. Backfill** — in batches, out of the request path.

```php
final class BackfillFullName implements ShouldQueue
{
    public int $timeout = 3600;

    public function handle(): void
    {
        User::whereNull('full_name')->chunkById(1000, function (Collection $users): void {
            foreach ($users as $user) {
                $user->updateQuietly(['full_name' => trim("{$user->first_name} {$user->last_name}")]);
            }
            usleep(50_000);   // 50ms — let replicas keep up
        });
    }
}
```

`updateQuietly` skips model events — a backfill should not fire 5 million notifications.

**3. Contract** — switch reads, then drop the old column in a *later* release.

```php
Schema::table('users', fn (Blueprint $t) => $t->dropColumn(['first_name', 'last_name']));
```

The gap between releases matters: during a rolling deploy, old and new application code run
simultaneously. Both must work against the schema at every point.

## Adding a NOT NULL column safely

```php
// ✗ Locks and fails if any row would violate
$table->string('status')->default('pending');   // on a huge table, still risky pre-8.0.12

// ✓ Three steps
// 1
Schema::table('orders', fn (Blueprint $t) => $t->string('status', 32)->nullable());
// 2 — backfill in batches
Order::whereNull('status')->chunkById(5000, fn ($rows) => Order::whereIn('id', $rows->pluck('id'))->update(['status' => 'pending']));
// 3 — later release
DB::statement("ALTER TABLE orders MODIFY status VARCHAR(32) NOT NULL DEFAULT 'pending'");
```

## Adding an index without locking

```php
// PostgreSQL — CONCURRENTLY cannot run inside a transaction
final class AddOrdersTenantIndex extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        DB::statement('CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_tenant_created_idx ON orders (tenant_id, created_at)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX CONCURRENTLY IF EXISTS orders_tenant_created_idx');
    }
}
```

`CREATE INDEX CONCURRENTLY` can fail and leave an invalid index. Check afterwards:

```sql
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
```

MySQL 8 adds indexes online for most cases. For very large tables, or any operation the
table above marks unsafe, use external tooling:

```bash
# Percona
pt-online-schema-change \
  --alter "ADD INDEX orders_tenant_created_idx (tenant_id, created_at)" \
  --execute D=app,t=orders

# GitHub's gh-ost — triggerless, pauses under load
gh-ost --database=app --table=orders \
  --alter="ADD INDEX orders_tenant_created_idx (tenant_id, created_at)" \
  --max-load=Threads_running=25 \
  --execute
```

Both build a shadow table, copy rows in throttled batches, and swap atomically.

## Adding a foreign key on a populated table

```php
// ✗ Validates every existing row while holding a lock
$table->foreign('customer_id')->references('id')->on('customers');
```

```sql
-- ✓ Postgres: add unvalidated, validate without blocking writes
ALTER TABLE orders ADD CONSTRAINT orders_customer_fk
    FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;

ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_fk;
```

Clean orphans first, or the validation fails:

```sql
SELECT COUNT(*) FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id
WHERE o.customer_id IS NOT NULL AND c.id IS NULL;
```

## Data migrations belong in jobs, not migrations

```php
// ✗ A migration that touches millions of rows blocks the deploy and cannot be retried
public function up(): void
{
    Order::chunkById(1000, fn ($orders) => /* ... */);
}

// ✓ Schema in the migration; data in a queued, resumable job
public function up(): void
{
    Schema::table('orders', fn (Blueprint $t) => $t->string('normalised_ref', 64)->nullable()->index());
}
```

```bash
php artisan app:backfill-normalised-refs   # dispatched after deploy, monitorable, resumable
```

Migrations run in the deploy window with a lock held. Anything that takes minutes belongs
elsewhere.

## Every migration needs a working `down()`

```php
public function up(): void
{
    Schema::table('orders', function (Blueprint $table): void {
        $table->string('reference', 32)->nullable();
        $table->index(['tenant_id', 'reference'], 'orders_tenant_ref_idx');
    });
}

public function down(): void
{
    Schema::table('orders', function (Blueprint $table): void {
        $table->dropIndex('orders_tenant_ref_idx');   // index BEFORE column
        $table->dropColumn('reference');
    });
}
```

Order matters: drop indexes and foreign keys before the columns they reference.

Test it: `php artisan migrate:rollback` locally on every migration you write. A `down()`
that throws is discovered at the worst possible moment.

Note that `down()` for a destructive change cannot restore data. Say so in a comment rather
than pretending:

```php
public function down(): void
{
    // Data cannot be recovered. Restore from backup if this migration must be reversed.
    Schema::table('users', fn (Blueprint $t) => $t->string('legacy_field')->nullable());
}
```

## SQLite in tests, MySQL in production

`:memory:` SQLite makes tests fast but hides real problems: different type coercion, no
strict FK enforcement by default, missing `ALTER` support, different collation.

Run the test suite against the production engine at least in CI:

```yaml
# .github/workflows/tests.yml
services:
  mysql:
    image: mysql:8.4
```

If tests only ever run on SQLite, expect schema surprises in production.

## Deploy sequence

```bash
php artisan down --render="errors::503" --retry=60   # only if truly needed
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan optimize
php artisan queue:restart
php artisan up
```

Better: design migrations to be **backwards compatible** so no downtime window is needed at
all. Expand/contract exists precisely so `php artisan down` is unnecessary.

Full deploy pipeline: `laravel-devops-deployment`.

## Pre-flight checklist for any migration on a large table

- [ ] Row count checked (`SELECT COUNT(*)` or `information_schema`)
- [ ] Operation classified against the danger table above
- [ ] Tested against a **copy of production data**, and the duration measured
- [ ] Backwards compatible with the currently-deployed application code
- [ ] `down()` written and tested
- [ ] Data backfill in a job, not the migration
- [ ] Backup verified as restorable before running anything destructive
- [ ] Deploy window agreed if a lock is unavoidable
- [ ] Rollback plan written down
