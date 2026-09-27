---
name: laravel-database-scale
description: Use when creating or changing migrations, designing schema, choosing indexes, defining relationships, planning pagination, or working with tables that will grow large. Covers schema design for 1M / 10M / 100M / billion-row scale, index selection and composite column order, foreign keys, keyset pagination, partitioning, archival and retention, search strategy, and zero-downtime migrations. Triggers on "migration", "schema", "index", "foreign key", "database design", "slow query", "table is huge", "partition", "archive", or any new table or column.
---

# Large Scale Database Engineering

Design for the row count the table will reach, not the one it has today. Schema is the
hardest thing to change later — a missing index is a five-minute fix, a wrong primary key
is a migration project.

## Step 0 — size the table before designing it

Answer these before writing the migration:

| Question | Why it changes the design |
|---|---|
| Rows after 1 year? After 5? | Decides pagination, partitioning, ID type |
| Write rate (rows/sec at peak)? | Decides index count, PK choice, partition key |
| Read patterns — which columns filter, sort, join? | Decides every index |
| What is the largest single row? | TEXT/JSON/BLOB placement |
| Retention — what deletes these rows? | Decides partitioning and archive design |
| Multi-tenant? | `tenant_id` on every table, leading every composite index |

Rough scale bands and what changes at each:

| Scale | What must be true |
|---|---|
| **< 1M** | Correct indexes and FKs. `paginate()` fine. Anything works. |
| **1M – 10M** | Every WHERE/ORDER BY/JOIN column indexed. `COUNT(*)` starts to hurt — `simplePaginate`. Composite index order matters. |
| **10M – 100M** | Keyset pagination mandatory. Summary tables for reporting. Archive strategy live. Avoid `OFFSET`, avoid `LIKE '%x%'`. Consider partitioning. |
| **100M – 1B** | Partitioning by date or tenant. Dedicated search engine. Read replicas. Column types matter for storage. Online schema change tooling. |
| **> 1B** | Sharding or a purpose-built store. If you get here with a single table, re-examine whether all that data must be hot. |

## Indexes — the rules that matter

### Every foreign key gets an index

MySQL creates one automatically with `constrained()`; PostgreSQL **does not**. Add it
explicitly and you are correct on both.

```php
$table->foreignId('order_id')->constrained()->cascadeOnDelete();
$table->index('order_id');   // required on Postgres; harmless duplicate on MySQL
```

An unindexed FK makes every `DELETE` on the parent scan the child table.

### Composite index column order

**Equality → range → sort.** Left to right, and a query can only use a prefix.

```php
$table->index(['tenant_id', 'status', 'created_at']);
```

| Query | Uses the index? |
|---|---|
| `WHERE tenant_id=? AND status=? ORDER BY created_at DESC` | Fully |
| `WHERE tenant_id=? AND status=?` | Fully (first two columns) |
| `WHERE tenant_id=?` | Partially (first column) |
| `WHERE status=?` | **No** — the leading column is missing |
| `WHERE tenant_id=? ORDER BY created_at` | Partially — must sort after filtering |

One composite index on `(a, b, c)` serves `(a)`, `(a,b)`, and `(a,b,c)`. Do not also create
single-column indexes on `a` or `(a,b)` — they are redundant, and every index slows writes.

### Covering indexes

If the index contains every column the query needs, the database never touches the table.

```php
// Serves: SELECT id, status FROM orders WHERE tenant_id=? ORDER BY created_at DESC
$table->index(['tenant_id', 'created_at', 'status']);
```

`EXPLAIN` shows `Using index` — that is the goal for hot list queries.

### When *not* to index

- Low cardinality alone (a `boolean`, a 3-value status) — useless as a leading column, but
  fine as the second column in a composite
- Columns never used in WHERE/ORDER BY/JOIN
- A table with heavy writes and rare reads
- More than ~5–6 indexes on a hot write table — each insert updates every index

### What no index can serve

```sql
WHERE LOWER(email) = ?              -- function on the column kills the index
WHERE name LIKE '%smith%'           -- leading wildcard
WHERE YEAR(created_at) = 2026       -- function on the column
WHERE status != 'draft'             -- negation, usually a scan
```

Fixes: store a normalised column, use a functional index (MySQL 8 / Postgres),
`WHERE created_at BETWEEN ? AND ?`, or full-text/a search engine.

## Column types — they matter at 100M rows

```php
$table->id();                                   // BIGINT UNSIGNED — correct default
$table->unsignedTinyInteger('priority');        // 1 byte, 0-255
$table->unsignedSmallInteger('quantity');       // 2 bytes, 0-65535
$table->unsignedInteger('view_count');          // 4 bytes
$table->string('status', 32);                   // not the default 255
$table->char('country_code', 2);                // fixed width
$table->decimal('rate', 8, 4);                  // exact — never float for money
$table->unsignedBigInteger('amount_minor');     // money as integer minor units
$table->timestamp('created_at')->nullable();    // 4 bytes vs DATETIME 8
$table->json('metadata');                       // queryable, but see below
$table->text('body');                           // stored off-page; excluded from SELECT *
```

At 100M rows, `string('status')` (VARCHAR 255) versus `string('status', 32)` is a
meaningful difference in index size and buffer-pool efficiency.

**Never `float`/`double` for money.** Use integer minor units, or `decimal`.

## Primary keys

| Type | Use when | Cost |
|---|---|---|
| `bigIncrements` (`id()`) | Default. Almost always right. | Sequential — reveals volume; not safe to expose externally |
| UUIDv4 | Client-generated IDs, merge across systems | Random inserts fragment the B-tree badly at scale |
| **UUIDv7 / ULID** | Need a non-sequential public ID | Time-ordered, so insert locality is preserved |
| Composite | Pure join tables | Awkward with Eloquent |

```php
// Best of both: internal auto-increment PK, external opaque identifier
$table->id();
$table->ulid('public_id')->unique();
```

```php
// Route binding uses the public id; joins and FKs use the fast integer
public function getRouteKeyName(): string
{
    return 'public_id';
}
```

If you must have a UUID primary key, use **ULID or UUIDv7** — random UUIDv4 as a clustered
primary key causes page splits on every insert and is a measurable throughput problem past
a few million rows.

## Pagination at scale

```php
// < 1M rows: fine
Order::paginate(20);          // runs COUNT(*) — full scan on a big table

// Large: no COUNT
Order::simplePaginate(20);    // still uses OFFSET

// Very large: no COUNT, no OFFSET. O(1) at any depth.
Order::orderBy('id')->cursorPaginate(20);
```

`OFFSET 1000000` makes the database produce and discard a million rows. Keyset pagination
requires a **deterministic, indexed sort** — always include the primary key as the final
tiebreaker:

```php
Order::orderBy('created_at', 'desc')->orderBy('id', 'desc')->cursorPaginate(20);
```

Without the `id` tiebreaker, rows sharing a `created_at` can be skipped or repeated.

## Foreign keys and delete behaviour

```php
$table->foreignId('user_id')->constrained()->cascadeOnDelete();     // child dies with parent
$table->foreignId('team_id')->constrained()->restrictOnDelete();    // block deletion
$table->foreignId('editor_id')->nullable()->constrained('users')->nullOnDelete();
```

Choose deliberately:
- `cascadeOnDelete` — the child is meaningless without the parent (order lines)
- `restrictOnDelete` — deleting the parent would destroy history (a customer with invoices)
- `nullOnDelete` — the reference is informational (who last edited)

Keep FK constraints on. "We enforce it in the application" fails the moment a job, an
import, or a console command writes directly.

## Soft deletes — use with intent

```php
$table->softDeletes()->index();      // the index is required
```

Soft deletes add `WHERE deleted_at IS NULL` to **every** query. Without an index that
includes it, that is a scan. Composite indexes on a soft-deleted table should usually lead
with the tenant and include `deleted_at`.

Use soft deletes when there is a real recovery or audit requirement. Do not use them by
default — they make unique constraints awkward (a "deleted" row still occupies the unique
slot) and grow the table forever.

```php
// Unique constraint that ignores soft-deleted rows (Postgres partial index)
DB::statement('CREATE UNIQUE INDEX users_email_unique ON users (email) WHERE deleted_at IS NULL');
```

## Growth management

Every table that grows needs a documented answer to "what removes these rows?"

| Strategy | When |
|---|---|
| TTL prune | Logs, sessions, tokens, notifications, failed jobs |
| Archive to a cold table | Records needed rarely but not deletable |
| Partition + drop partition | Time-series at 100M+ — instant, no row-by-row delete |
| Summary tables | Reporting over history you no longer need at row level |

```php
// routes/console.php
Schedule::command('model:prune')->daily();
Schedule::command('queue:prune-failed --hours=168')->daily();
Schedule::command('telescope:prune --hours=48')->daily();
```

Details: `references/growth.md`.

## Migrations must be safe to run on a live table

```php
// ✗ On a 50M-row MySQL table this locks writes for minutes
$table->string('new_column')->after('id');

// ✓ Nullable, no default, no reorder — fast metadata-only change on MySQL 8
$table->string('new_column')->nullable();
```

Rules:
- Add columns nullable, backfill in batches, then add the constraint
- Never rename or drop a column in the same release that stops using it (expand/contract)
- Create indexes concurrently on Postgres (`CREATE INDEX CONCURRENTLY`)
- Use `pt-online-schema-change` or `gh-ost` for large MySQL alters
- Every migration has a working `down()`

Full procedure: `references/migrations.md`.

## Scope boundaries

Owns schema, indexes, keys, constraints, partitioning, retention, migration safety,
search-strategy selection.

Does not own: eager loading and query shape (`laravel-performance`); caching
(`laravel-performance`); backups, replication setup, server tuning
(`laravel-devops-deployment`); SQL injection (`laravel-security`).

## Bundled resources

- `references/indexing.md` — selection, composite order, covering, cardinality, EXPLAIN
- `references/schema-design.md` — types, keys, relationships, normalisation, JSON, tenancy
- `references/scaling.md` — partitioning, replicas, sharding, search engines, the 1M→1B path
- `references/migrations.md` — zero-downtime patterns, expand/contract, online DDL
- `references/growth.md` — retention, archival, pruning, summary tables
- `templates/` — migration stubs, partitioned table, archive job, index audit script
- `examples/schema-at-scale.md` — one schema designed at 1M and at 100M, compared
- `checklists/migration-review.md` — pre-merge gate
- `checklists/schema-design.md` — new-table gate

---
Last reviewed: 2026-07-31 · Targets MySQL 8.x / PostgreSQL 15+ · See MAINTENANCE.md
