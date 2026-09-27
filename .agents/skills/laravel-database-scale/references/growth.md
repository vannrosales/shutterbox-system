# Growth, retention, and archival

Every table that accepts writes needs a documented answer to: **what removes these rows?**

"Nothing" is a valid answer for a customers table. It is not a valid answer for events,
logs, notifications, sessions, or audit trails — those grow without bound and eventually
become the reason the database is slow.

## Classify every table

| Class | Examples | Strategy |
|---|---|---|
| **Reference** | Countries, plans, roles | Never grows. Nothing to do. |
| **Core entity** | Users, orders, invoices | Grows with the business. Archive very old records. |
| **Transactional history** | Payments, ledger entries | Legally retained. Archive, never delete. |
| **Operational** | Sessions, tokens, cache, failed jobs | Prune aggressively on a TTL. |
| **Telemetry** | Events, logs, activity, metrics | Partition + drop. Highest volume by far. |
| **Derived** | Summary tables, search index | Rebuildable. Truncate and regenerate freely. |

Write the class into the migration comment. It is the fastest way for the next person to
know what is safe.

## Pruning with `MassPrunable`

```php
use Illuminate\Database\Eloquent\MassPrunable;

final class ActivityLog extends Model
{
    use MassPrunable;

    public function prunable(): Builder
    {
        return static::where('created_at', '<', now()->subMonths(6));
    }
}
```

```php
// routes/console.php
Schedule::command('model:prune')->daily()->at('03:00');
```

`MassPrunable` issues a single `DELETE` — fast, but fires no model events. Use `Prunable`
(not `Mass`) only when you need per-row cleanup, such as deleting associated files:

```php
use Illuminate\Database\Eloquent\Prunable;

final class Upload extends Model
{
    use Prunable;

    public function prunable(): Builder
    {
        return static::where('expires_at', '<', now());
    }

    protected function pruning(): void
    {
        Storage::disk($this->disk)->delete($this->path);   // clean up the file too
    }
}
```

Orphaned files are the most common form of unbounded growth that nobody notices until the
disk fills. See `laravel-media-management`.

### Built-in prunes to schedule

```php
Schedule::command('model:prune')->daily();
Schedule::command('queue:prune-failed --hours=168')->daily();
Schedule::command('queue:prune-batches --hours=48')->daily();
Schedule::command('telescope:prune --hours=48')->daily();
Schedule::command('auth:clear-resets')->daily();
Schedule::command('sanctum:prune-expired --hours=24')->daily();
Schedule::command('pulse:trim')->everyFifteenMinutes();
```

Every one of these tables grows forever if left alone.

## Deleting at scale

```php
// ✗ Locks the table, bloats the transaction log, may time out
ActivityLog::where('created_at', '<', now()->subYear())->delete();

// ✓ Chunked and throttled
do {
    $deleted = ActivityLog::where('created_at', '<', now()->subYear())
        ->limit(2000)
        ->delete();

    usleep(100_000);   // 100ms — let replicas catch up
} while ($deleted > 0);
```

The throttle matters on a replicated setup: an unthrottled bulk delete generates
replication lag measured in minutes, during which reads from replicas are stale.

For very large purges, partitioning turns this into a metadata operation:

```sql
ALTER TABLE events DROP PARTITION p2025_06;   -- milliseconds
```

See `references/scaling.md`.

## Archival

When data must be kept but is rarely read, move it out of the hot table.

```php
Schema::create('orders_archive', function (Blueprint $table): void {
    // Same shape as orders, minus indexes you do not need for cold reads
    $table->unsignedBigInteger('id')->primary();
    $table->foreignId('tenant_id');
    $table->string('reference', 32);
    $table->unsignedBigInteger('total_minor');
    $table->timestamp('placed_at');
    $table->timestamps();

    $table->index(['tenant_id', 'placed_at']);
});
```

```php
final class ArchiveOldOrders implements ShouldQueue
{
    public int $timeout = 3600;

    public function handle(): void
    {
        $cutoff = now()->subYears(3);

        Order::where('placed_at', '<', $cutoff)
            ->chunkById(1000, function (Collection $orders) use ($cutoff): void {
                DB::transaction(function () use ($orders): void {
                    DB::table('orders_archive')->insertOrIgnore(
                        $orders->map(fn (Order $o) => Arr::only($o->getAttributes(), [
                            'id', 'tenant_id', 'reference', 'total_minor', 'placed_at',
                            'created_at', 'updated_at',
                        ]))->all()
                    );

                    Order::whereIn('id', $orders->pluck('id'))->delete();
                });

                usleep(100_000);
            });
    }
}
```

Points that matter:
- **Copy first, delete second, inside one transaction per chunk.** Never delete before
  confirming the insert.
- `insertOrIgnore` makes a re-run safe if the job is retried mid-way.
- Fewer indexes on the archive table — it is written once and read rarely.
- The archive can live on cheaper storage, a different database, or object storage as
  Parquet/CSV if it is genuinely cold.

Give users a way to reach archived data:

```php
public function scopeIncludingArchived(Builder $query): Builder
{
    return $query->unionAll(DB::table('orders_archive')->select(/* matching columns */));
}
```

Or, more simply, a separate "search historical records" path with an explicit warning that
it is slower.

## Summary tables

Reporting over raw rows stops working somewhere around 10M rows. Precompute.

```php
Schema::create('daily_order_stats', function (Blueprint $table): void {
    $table->id();
    $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
    $table->date('day');
    $table->unsignedInteger('order_count')->default(0);
    $table->unsignedBigInteger('revenue_minor')->default(0);
    $table->unsignedInteger('unique_customers')->default(0);
    $table->timestamps();

    $table->unique(['tenant_id', 'day']);
    $table->index(['day']);                        // cross-tenant reporting
});
```

```php
final class RollUpDailyOrderStats implements ShouldQueue
{
    public function __construct(private readonly ?CarbonImmutable $day = null) {}

    public function handle(): void
    {
        $day = $this->day ?? today()->subDay();

        $rows = DB::table('orders')
            ->selectRaw('
                tenant_id,
                DATE(placed_at) as day,
                COUNT(*) as order_count,
                SUM(total_minor) as revenue_minor,
                COUNT(DISTINCT customer_id) as unique_customers
            ')
            ->whereBetween('placed_at', [$day->startOfDay(), $day->endOfDay()])
            ->groupBy('tenant_id', 'day')
            ->get()
            ->map(fn (object $r) => (array) $r + ['created_at' => now(), 'updated_at' => now()])
            ->all();

        if ($rows === []) {
            return;
        }

        DB::table('daily_order_stats')->upsert(
            $rows,
            uniqueBy: ['tenant_id', 'day'],
            update: ['order_count', 'revenue_minor', 'unique_customers', 'updated_at'],
        );
    }
}
```

```php
Schedule::job(new RollUpDailyOrderStats)->dailyAt('01:00');
```

Design notes:
- **Idempotent** via `upsert` on `(tenant_id, day)` — safe to re-run for backfill or after
  a failure.
- Accepts a specific day so you can recompute history:
  `RollUpDailyOrderStats::dispatch($day)`.
- Roll daily into monthly, monthly into yearly, if the daily table itself gets large.

A dashboard reading 365 summary rows instead of scanning 50M order rows is typically a
1000× improvement. This is the single highest-value technique for reporting at scale.

## Storage monitoring

```sql
-- MySQL: largest tables
SELECT table_name,
       ROUND(data_length/1024/1024, 1) AS data_mb,
       ROUND(index_length/1024/1024, 1) AS index_mb,
       ROUND((data_length + index_length)/1024/1024, 1) AS total_mb,
       table_rows
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY (data_length + index_length) DESC
LIMIT 20;
```

```sql
-- Postgres
SELECT relname,
       pg_size_pretty(pg_total_relation_size(relid)) AS total,
       pg_size_pretty(pg_relation_size(relid))       AS data,
       n_live_tup
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
```

Track growth **rate**, not just size. A table adding 2GB/month tells you when the disk
fills; a table that is currently 2GB tells you nothing.

```php
// Weekly snapshot for trending
Schedule::job(new RecordTableSizes)->weekly();
```

Alert at 70% disk, act at 80%. Running out of disk on a database server is a hard outage
and often corrupts in-flight writes.

## Legal retention

Retention is not only a technical decision.

| Data | Typical driver |
|---|---|
| Financial records | Tax law — commonly several years; confirm per jurisdiction |
| Personal data | Data-protection law — **minimise**; delete when the purpose ends |
| Audit / security logs | Security policy and incident-investigation needs |
| Health records | Sector-specific regulation |

For Philippine applications, **RA 10173 (Data Privacy Act)** requires that personal data is
kept only as long as necessary for the declared purpose, and that data subjects can request
erasure. That means:

- A documented retention period per data category
- A working deletion path, including from backups and search indexes
- Deletion that does not break referential integrity (anonymise rather than delete, where
  records must persist)

```php
final class AnonymiseUser
{
    public function handle(User $user): void
    {
        // Preserve the row for referential integrity; remove the personal data.
        $user->forceFill([
            'name'              => 'Deleted user',
            'email'             => "deleted-{$user->id}@invalid.local",
            'phone'             => null,
            'address'           => null,
            'email_verified_at' => null,
            'anonymised_at'     => now(),
        ])->save();

        $user->tokens()->delete();
        $user->searchable();          // reindex so the search engine drops the old data
    }
}
```

Do not forget the search index and the cache — both hold copies of data the database no
longer has. Coordinate with `laravel-security`.

## Growth review — quarterly

- [ ] Top 20 tables by size listed, with growth rate since last review
- [ ] Every growing table has a documented retention class
- [ ] Prune jobs are scheduled **and verified running** (check `last_run` not just the
      schedule)
- [ ] Archive job keeping up with its cutoff
- [ ] Disk headroom > 30%
- [ ] Index-to-data ratio sane (unused indexes dropped)
- [ ] Summary tables covering the reports that need them
- [ ] Retention periods still match legal requirements
