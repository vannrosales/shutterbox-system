# Indexing

An index is a trade: faster reads, slower writes, more disk. Every index must be justified
by a query you can name.

## How to choose an index

1. Write down the actual query.
2. Identify the **equality** predicates, the **range** predicate, and the **sort**.
3. Build the index in that order: equality columns, then the range column, then the sort
   column.
4. `EXPLAIN` it. Confirm `key` is your index and `rows` is close to what you return.

```sql
SELECT id, total, status
FROM orders
WHERE tenant_id = 42
  AND status = 'paid'
  AND created_at >= '2026-01-01'
ORDER BY created_at DESC
LIMIT 20;
```

Equality: `tenant_id`, `status`. Range: `created_at`. Sort: `created_at`.

```php
$table->index(['tenant_id', 'status', 'created_at'], 'orders_tenant_status_created_idx');
```

`created_at` serves both the range and the sort because it comes last — that is why the
ordering rule works.

## The leftmost-prefix rule

An index on `(a, b, c)` can serve queries filtering on:

- `a`
- `a, b`
- `a, b, c`

It **cannot** serve `b`, `c`, or `b, c`. The leading column must be present.

Consequence: one well-ordered composite index replaces three single-column indexes. Do not
create both.

```php
// ✗ Redundant — the composite already covers tenant_id, and (tenant_id, status)
$table->index('tenant_id');
$table->index(['tenant_id', 'status']);
$table->index(['tenant_id', 'status', 'created_at']);

// ✓
$table->index(['tenant_id', 'status', 'created_at']);
```

## Cardinality

Put the **most selective** column first among the equality predicates — the one that
narrows the result set most.

```sql
-- 1M rows, 500 tenants, 4 statuses
WHERE tenant_id = ? AND status = ?
```

`tenant_id` narrows to ~2000 rows; `status` narrows to ~250,000. So `(tenant_id, status)`,
not `(status, tenant_id)`.

Exception: in a multi-tenant system, **always lead with `tenant_id`** regardless of
cardinality. It makes every index tenant-scoped, which matters for both performance and
for the safety property that a query without a tenant filter performs badly and gets
noticed.

Check real cardinality:

```sql
SELECT
    COUNT(DISTINCT tenant_id) AS tenants,
    COUNT(DISTINCT status)    AS statuses,
    COUNT(*)                  AS rows
FROM orders;
```

## Covering indexes

If every column the query touches is in the index, the database answers from the index
alone.

```sql
SELECT id, status FROM orders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20;
```

```php
$table->index(['tenant_id', 'created_at', 'status']);
```

`EXPLAIN` shows `Using index`. On a wide table this can be an order of magnitude faster
because the row itself is never read.

Do not chase covering indexes for every query — a covering index on a 12-column SELECT is
just a second copy of the table.

## Index types

```php
// B-tree — the default; equality, range, sort, prefix LIKE
$table->index('email');

// Unique — constraint plus index
$table->unique(['tenant_id', 'sku']);

// Composite unique for multi-tenant natural keys
$table->unique(['tenant_id', 'slug']);

// Full-text — MySQL 5.7+/8, Postgres via tsvector
$table->fullText(['title', 'body']);

// Spatial
$table->spatialIndex('location');

// Partial / filtered (Postgres, and MySQL 8 via functional workarounds)
// Only indexes the rows you actually query
DB::statement("CREATE INDEX orders_pending_idx ON orders (created_at) WHERE status = 'pending'");

// Functional (MySQL 8, Postgres)
DB::statement('CREATE INDEX users_lower_email_idx ON users ((LOWER(email)))');
```

Partial indexes are the highest-value under-used feature: if 98% of a table is `completed`
and you only ever query `pending`, a partial index is 2% of the size and stays in memory.

## What kills an index

```sql
-- Function on the column
WHERE LOWER(email) = 'a@b.com'          → functional index, or store email_normalised
WHERE YEAR(created_at) = 2026           → WHERE created_at >= '2026-01-01' AND < '2027-01-01'
WHERE DATE(created_at) = CURDATE()      → range on the raw column

-- Leading wildcard
WHERE name LIKE '%smith%'               → full-text, trigram index, or a search engine
WHERE name LIKE 'smith%'                → this one IS indexable

-- Type mismatch — implicit conversion disables the index
WHERE phone = 09171234567               -- phone is VARCHAR; pass '09171234567'

-- OR across different columns
WHERE email = ? OR phone = ?            → UNION of two indexed queries

-- Negation
WHERE status != 'draft'                 → WHERE status IN ('paid','shipped','cancelled')

-- Leading column missing
WHERE status = ?  (index is (tenant_id, status))
```

The type-mismatch one is insidious in Laravel: passing an integer to a string column in a
`where()` produces a silently-unindexed query.

## Reading EXPLAIN

```php
Order::where('tenant_id', 1)->where('status', 'paid')->orderByDesc('created_at')->explain()->dd();
```

```sql
EXPLAIN ANALYZE SELECT ...;              -- MySQL 8.0.18+, Postgres
```

| Column / value | Meaning | Action |
|---|---|---|
| `type: const` / `eq_ref` | Primary/unique lookup | Ideal |
| `type: ref` | Index lookup | Good |
| `type: range` | Index range scan | Good |
| `type: index` | Full index scan | Suspicious |
| `type: ALL` | **Full table scan** | Fix it |
| `key: NULL` | No index used | Fix it |
| `rows` ≫ returned | Reading far too much | Better index |
| `Extra: Using index` | Covering index | Ideal |
| `Extra: Using filesort` | Sorting without an index | Add sort column to the index |
| `Extra: Using temporary` | Temp table (often GROUP BY) | Index the grouped columns |
| `Extra: Using where` | Filtering after fetch | Often fine; check `rows` |

## Finding missing indexes

```sql
-- MySQL: unindexed queries in the slow log
SET GLOBAL log_queries_not_using_indexes = 'ON';
```

```bash
pt-query-digest /var/log/mysql/slow.log
```

```sql
-- Postgres: sequential scans on large tables
SELECT relname, seq_scan, seq_tup_read, idx_scan,
       seq_tup_read / NULLIF(seq_scan, 0) AS avg_rows_per_scan
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 20;
```

High `seq_scan` with high `seq_tup_read` on a big table = a missing index.

## Finding unused indexes

Every index costs write throughput and disk. Remove the ones nothing uses.

```sql
-- MySQL 8 (sys schema)
SELECT object_schema, object_name, index_name
FROM sys.schema_unused_indexes
WHERE object_schema = DATABASE();

-- Redundant indexes (a prefix of another)
SELECT * FROM sys.schema_redundant_indexes;
```

```sql
-- Postgres
SELECT schemaname, relname, indexrelname, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

Check over a full business cycle before dropping — a month-end report may be the only
consumer of an index that shows zero scans on a Tuesday.

## Index size

```sql
-- MySQL
SELECT table_name,
       ROUND(data_length/1024/1024, 1) AS data_mb,
       ROUND(index_length/1024/1024, 1) AS index_mb,
       ROUND(index_length/NULLIF(data_length,0), 2) AS ratio
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY index_length DESC;
```

If index size approaches or exceeds data size, you probably have redundant indexes. The
working set should fit in the buffer pool (`innodb_buffer_pool_size`) — once indexes spill
to disk, performance falls off a cliff.

## Write cost

Each index must be updated on every INSERT/UPDATE/DELETE that touches its columns.

| Indexes on table | Rough insert cost |
|---|---|
| 1 (PK only) | baseline |
| 3 | ~1.5× |
| 6 | ~2.5× |
| 10 | ~4× |

On a high-write table (events, logs, telemetry), keep indexes to the minimum and do
reporting from a replica or a summary table.

## Laravel specifics

```php
// Named explicitly — auto-generated names hit the 64-char limit on long tables
$table->index(['tenant_id', 'status', 'created_at'], 'orders_tenant_status_created_idx');

// Dropping
$table->dropIndex('orders_tenant_status_created_idx');
$table->dropIndex(['tenant_id', 'status']);       // by columns
$table->dropUnique(['tenant_id', 'sku']);
$table->dropForeign(['user_id']);                  // drop FK before its index

// Postgres: build without locking writes. Cannot run inside a transaction,
// so the migration must disable them.
public $withinTransaction = false;

public function up(): void
{
    DB::statement('CREATE INDEX CONCURRENTLY orders_tenant_created_idx ON orders (tenant_id, created_at)');
}
```

On MySQL, adding an index to a large table with `ALTER TABLE` is online in InnoDB
(MySQL 5.6+) for most cases, but still copies data in some. For very large tables use
`pt-online-schema-change` or `gh-ost` — see `references/migrations.md`.
