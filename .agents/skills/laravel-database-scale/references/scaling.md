# Scaling path: 1M → 1B rows

Apply the cheapest technique that solves the actual problem. Most teams reach for sharding
when they need an index.

## The ladder

| Step | Technique | Buys you | Cost |
|---|---|---|---|
| 1 | Correct indexes | 10–1000× on the affected query | Write throughput, disk |
| 2 | Query rewrite | Often as much as an index | Developer time |
| 3 | Keyset pagination | Constant-time deep pages | Cannot jump to page N |
| 4 | Summary / rollup tables | Reports go from minutes to milliseconds | Staleness, a job to maintain |
| 5 | Caching | Repeat reads free | Invalidation complexity |
| 6 | Read replicas | Read scale | Replication lag |
| 7 | Archival / retention | Keeps the hot table small | Two places to look |
| 8 | Partitioning | Cheap deletes, partition pruning | Constraints on keys and FKs |
| 9 | Dedicated search engine | Real search, relevance | Another system to run and sync |
| 10 | Sharding | Write scale | Very high complexity |

Do not skip steps. Sharding a database that has no index on its hottest query solves
nothing.

## Read replicas

```php
// config/database.php
'mysql' => [
    'read' => [
        'host' => [env('DB_READ_HOST_1'), env('DB_READ_HOST_2')],
    ],
    'write' => [
        'host' => [env('DB_HOST')],
    ],
    'sticky' => true,
    // ... driver, database, username, password
],
```

`sticky => true` routes reads to the writer for the remainder of a request that has
written. Without it, a read-after-write in the same request can miss due to replication lag
— the classic "I saved it but it's not there" bug.

```php
// Force the writer for a read that must be current
DB::connection('mysql')->getPdo();          // writer PDO
$order = Order::onWriteConnection()->find($id);
```

Replicas scale reads, not writes. If the bottleneck is write throughput, replicas make it
slightly worse (replication overhead).

## Partitioning

Splits one table into physical pieces by a key. The wins:

- **Partition pruning** — a query filtered by the partition key only scans relevant
  partitions
- **Instant deletion** — `DROP PARTITION` removes a month of data in milliseconds instead
  of a multi-hour `DELETE`

Best fit: time-series data with a retention policy (events, logs, telemetry, audit trails).

```sql
-- MySQL 8: range partitioning by month
CREATE TABLE events (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id   BIGINT UNSIGNED NOT NULL,
    type        VARCHAR(64) NOT NULL,
    payload     JSON,
    created_at  DATETIME NOT NULL,
    PRIMARY KEY (id, created_at),        -- partition key MUST be in every unique key
    KEY events_tenant_created_idx (tenant_id, created_at)
) ENGINE=InnoDB
PARTITION BY RANGE (TO_DAYS(created_at)) (
    PARTITION p2026_06 VALUES LESS THAN (TO_DAYS('2026-07-01')),
    PARTITION p2026_07 VALUES LESS THAN (TO_DAYS('2026-08-01')),
    PARTITION p2026_08 VALUES LESS THAN (TO_DAYS('2026-09-01')),
    PARTITION pmax     VALUES LESS THAN MAXVALUE
);
```

```sql
-- Drop a month: instant
ALTER TABLE events DROP PARTITION p2026_06;

-- Add next month ahead of time (automate this)
ALTER TABLE events REORGANIZE PARTITION pmax INTO (
    PARTITION p2026_09 VALUES LESS THAN (TO_DAYS('2026-10-01')),
    PARTITION pmax     VALUES LESS THAN MAXVALUE
);
```

### The constraints you must accept

- **Every unique key (including the PK) must contain the partition column.** This is why
  the PK above is `(id, created_at)`.
- **MySQL partitioned tables cannot have foreign keys** — in or out.
- A query that does not filter on the partition key scans **every** partition — worse than
  an unpartitioned table.
- Partition maintenance must be automated, or you wake up to writes failing against
  `pmax`.

PostgreSQL declarative partitioning is more capable (supports FKs referencing the
partitioned table in recent versions, and `ATTACH`/`DETACH PARTITION`), and generally the
better choice if you have it.

```sql
-- Postgres
CREATE TABLE events (
    id BIGSERIAL,
    tenant_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2026_07 PARTITION OF events
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
```

Automate partition creation:

```php
// routes/console.php
Schedule::job(new EnsureFuturePartitions)->monthlyOn(1, '00:30');
```

Always keep at least **two** future partitions so a failed job does not cause an outage.

## Search

`LIKE '%term%'` cannot use a B-tree index. At scale it is a full scan on every keystroke.

| Rows | Approach |
|---|---|
| < 100k | `LIKE 'term%'` on an indexed column, or database full-text |
| 100k – 5M | MySQL `FULLTEXT` / Postgres `tsvector` + GIN |
| > 5M, or relevance/typo tolerance matters | Meilisearch, Typesense, Elasticsearch |

```php
// Database full-text
Schema::table('posts', fn (Blueprint $t) => $t->fullText(['title', 'body']));

Post::whereFullText(['title', 'body'], $term)
    ->where('tenant_id', $tenantId)
    ->paginate(20);
```

```sql
-- Postgres, with a stored tsvector for index-only search
ALTER TABLE posts ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) STORED;

CREATE INDEX posts_search_idx ON posts USING gin (search_vector);
```

```php
// Laravel Scout + Meilisearch
class Post extends Model
{
    use Searchable;

    public function toSearchableArray(): array
    {
        return [
            'id'        => (string) $this->id,
            'tenant_id' => $this->tenant_id,   // MUST be filterable — see below
            'title'     => $this->title,
            'body'      => strip_tags($this->body),
        ];
    }
}
```

```php
Post::search($term)
    ->where('tenant_id', $tenantId)     // never omit this in a multi-tenant app
    ->paginate(20);
```

**A search index is a second copy of your data with its own access control.** Forgetting
the tenant filter in the search path is a common and serious data leak — the database
global scope does not apply to Meilisearch.

Bulk imports must suppress per-row indexing:

```php
Post::withoutSyncingToSearch(function (): void {
    // bulk import
});

Artisan::call('scout:import', ['model' => Post::class]);
```

## Sharding — last resort

Split data across multiple databases by a shard key (usually `tenant_id`).

```php
// config/database.php
'shard_1' => [/* ... */],
'shard_2' => [/* ... */],
```

```php
final class ShardResolver
{
    public function for(int $tenantId): string
    {
        return 'shard_'.(($tenantId % config('database.shard_count')) + 1);
    }
}

Order::on($resolver->for($tenantId))->where('tenant_id', $tenantId)->get();
```

What you give up:
- Cross-shard JOINs and transactions
- Global uniqueness (use ULIDs)
- Simple aggregate reporting (must fan out and merge)
- Straightforward migrations (run on every shard)
- Rebalancing is a project

Consider the alternatives first: a bigger machine (vertical scaling goes further than
people assume), read replicas, archiving cold data, or moving one hot table to its own
database.

## Vertical scaling — the underrated option

Before any of the above:

```ini
# MySQL — the single most important setting
innodb_buffer_pool_size = 70% of RAM     # working set should fit here
innodb_log_file_size = 1G
innodb_flush_log_at_trx_commit = 1       # 2 is faster, risks 1s of transactions
innodb_flush_method = O_DIRECT
max_connections = 500
```

A database whose working set fits in the buffer pool is doing memory access. One that does
not is doing disk I/O — often 100× slower. Moving from 8GB to 64GB RAM frequently beats
weeks of query optimisation, and costs less.

Check your hit rate:

```sql
SHOW ENGINE INNODB STATUS\G
-- Buffer pool hit rate should be > 99%
```

## Connection limits

```
Total connections = (web workers × 1) + (queue workers × 1) + headroom
```

PHP-FPM with 50 children and 20 queue workers needs 70+ connections, plus room for
migrations and monitoring. If `max_connections` is exceeded, the app returns 500s.

Consider a connection pooler (PgBouncer for Postgres, ProxySQL for MySQL) when worker
counts get high.

```bash
php artisan db:monitor --max=100     # alert before you hit the wall
```

## Decision guide

| Symptom | First thing to try |
|---|---|
| One query is slow | `EXPLAIN` → add or fix the index |
| Every query is slow | Buffer pool too small, or connection saturation |
| Slow only on later pages | Keyset pagination |
| Reports time out | Summary tables |
| Reads saturate the primary | Read replicas |
| Writes saturate the primary | Reduce indexes, batch writes, then consider sharding |
| Table too big to delete from | Partitioning |
| Search is slow | Full-text, then a search engine |
| Disk filling up | Retention and archival |
