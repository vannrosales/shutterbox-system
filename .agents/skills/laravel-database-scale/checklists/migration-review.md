# Migration review — pre-merge gate

## Every migration

- [ ] `up()` and `down()` both present
- [ ] `down()` tested with `php artisan migrate:rollback`
- [ ] Drop order in `down()` is correct: indexes and FKs before columns
- [ ] If `down()` cannot restore data, a comment says so plainly
- [ ] No `env()` usage inside the migration
- [ ] Runs on the production database engine, not just SQLite
- [ ] Indexes named explicitly

## Table size classification

- [ ] Current row count checked

```sql
SELECT table_name, table_rows FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'your_table';
```

If under ~100k rows, most of the section below does not apply. Say so and move on.

## Large-table safety (over ~1M rows)

- [ ] Operation classified against the danger table in `references/migrations.md`
- [ ] **No `->after('column')`** — forces a full table rebuild on MySQL
- [ ] No `NOT NULL` column added without a default in one step
- [ ] No column type change in place
- [ ] No FK added to a populated large table without the `NOT VALID` → `VALIDATE` split
      (Postgres) or verified orphan cleanup first
- [ ] Postgres index creation uses `CONCURRENTLY` with `public $withinTransaction = false`
- [ ] Large MySQL alters use `gh-ost` / `pt-online-schema-change`, not raw `ALTER TABLE`
- [ ] Duration measured against a copy of production data
- [ ] Lock impact understood and, if unavoidable, a deploy window agreed

## Backwards compatibility

During a rolling deploy, old and new application code run against the same schema.

- [ ] The currently-deployed code still works against the new schema
- [ ] Column removals and renames follow expand/contract across separate releases
- [ ] No column dropped in the same release that stops writing to it
- [ ] New non-nullable columns have defaults, or the code writes them before the constraint
      is added

## Data changes

- [ ] No bulk data manipulation inside the migration itself
- [ ] Backfills are queued jobs — resumable, monitorable, throttled
- [ ] Backfill uses `chunkById()`, not `chunk()`
- [ ] Backfill uses `updateQuietly()` where model events would be inappropriate
- [ ] Backfill is idempotent (safe to re-run)
- [ ] Throttle (`usleep`) between chunks to bound replication lag

## Schema quality

- [ ] Column types sized appropriately
- [ ] Money is not a float
- [ ] Every FK indexed
- [ ] Delete behaviour chosen per FK
- [ ] `tenant_id` leads composite indexes in a multi-tenant schema
- [ ] Unique constraints scoped by tenant
- [ ] No redundant indexes introduced
- [ ] Index count on write-heavy tables still reasonable
- [ ] `deleted_at` indexed if soft deletes were added

## Verification

- [ ] `php artisan migrate` runs clean on a fresh database
- [ ] `php artisan migrate:fresh --seed` works
- [ ] `php artisan migrate:rollback` works
- [ ] Test suite passes against the production engine in CI
- [ ] `EXPLAIN` run on the queries the new indexes are meant to serve — confirms they are
      used

```php
Model::where(...)->orderBy(...)->explain()->dd();
```

## Deployment

- [ ] Backup taken and **verified restorable** before any destructive change
- [ ] Migration is in the deploy script (`php artisan migrate --force`)
- [ ] Rollback plan written down — not just `migrate:rollback`, but what to do if the
      rollback also fails
- [ ] Someone is watching metrics during and after the migration
- [ ] For a long migration: the team knows it is running and what "stuck" looks like

## Post-deploy

- [ ] Row counts as expected
- [ ] New indexes present and valid

```sql
-- Postgres: a failed CONCURRENTLY leaves an invalid index behind
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
```

- [ ] Slow query log shows no new entries
- [ ] Backfill job completed, and its result verified (not just "the job finished")
- [ ] Application error rate unchanged
