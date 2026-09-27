# Working with large datasets

The rules change once a table has millions of rows. Anything that loads a whole result set
into PHP will hit `memory_limit`; anything that uses OFFSET will get slower every page.

## Memory-safe iteration

| Method | Queries | Memory | Safe while modifying? |
|---|---|---|---|
| `get()` | 1 | All rows | n/a |
| `chunk(n)` | ceil(N/n) | n rows | **No** — OFFSET skips rows |
| `chunkById(n)` | ceil(N/n) | n rows | Yes — keyset |
| `lazy(n)` | ceil(N/n) | n rows | No |
| `lazyById(n)` | ceil(N/n) | n rows | Yes |
| `cursor()` | 1 | 1 row (PHP side) | n/a |

```php
// Default for processing
Order::where('status', 'pending')->chunkById(1000, function (Collection $orders): void {
    foreach ($orders as $order) {
        ProcessOrder::dispatch($order->id);
    }
});

// Generator syntax, same guarantees
foreach (Order::where('status', 'pending')->lazyById(1000) as $order) {
    // ...
}
```

**Why `chunkById` over `chunk`:** `chunk` pages with `LIMIT n OFFSET m`. If the loop
changes rows so they no longer match the `WHERE`, the result set shrinks and OFFSET skips
records. `chunkById` uses `WHERE id > ?`, which is immune.

### `cursor()` caveat

`cursor()` keeps one model in PHP memory, but with the default **buffered** MySQL driver
the *client library* still buffers the entire result set. On a 10M-row table you will still
run out of memory.

```php
// Unbuffered queries — one row at a time on the wire
DB::connection()->getPdo()->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);

foreach (Order::cursor() as $order) { /* ... */ }

DB::connection()->getPdo()->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, true);
```

While an unbuffered query is open you cannot run another query on the same connection.
Use a second connection, or prefer `lazyById()` — which has neither problem.

## Streaming exports

Never build a large export in memory, and never build one in the request.

```php
final class StreamOrdersCsv
{
    public function handle(OrderExportFilters $filters): StreamedResponse
    {
        return response()->streamDownload(function () use ($filters): void {
            $handle = fopen('php://output', 'wb');

            fputcsv($handle, ['ID', 'Customer', 'Total', 'Placed at']);

            DB::table('orders')                       // query builder: no model hydration
                ->select(['orders.id', 'customers.name', 'orders.total', 'orders.placed_at'])
                ->join('customers', 'customers.id', '=', 'orders.customer_id')
                ->where('orders.tenant_id', $filters->tenantId)
                ->when($filters->from, fn ($q, $d) => $q->where('orders.placed_at', '>=', $d))
                ->orderBy('orders.id')
                ->lazyById(2000, 'orders.id')
                ->each(function (object $row) use ($handle): void {
                    fputcsv($handle, [
                        $row->id,
                        $row->name,
                        $row->total,
                        $row->placed_at,
                    ]);
                });

            fclose($handle);
        }, 'orders.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'X-Accel-Buffering' => 'no',     // stop Nginx buffering the whole stream
        ]);
    }
}
```

`X-Accel-Buffering: no` matters — without it Nginx buffers the entire response before
sending anything, defeating the streaming and often hitting `proxy_buffer` limits.

Beyond ~100k rows, do not stream from a request at all. Generate to storage in a job and
email a signed download link:

```php
final class GenerateOrdersExport implements ShouldQueue
{
    public int $timeout = 1800;

    public function handle(): void
    {
        $path = "exports/orders-{$this->exportId}.csv";
        $temp = tempnam(sys_get_temp_dir(), 'export');
        $handle = fopen($temp, 'wb');

        fputcsv($handle, ['ID', 'Customer', 'Total']);

        DB::table('orders')->where('tenant_id', $this->tenantId)
            ->orderBy('id')
            ->lazyById(5000)
            ->each(fn ($row) => fputcsv($handle, [$row->id, $row->customer_id, $row->total]));

        fclose($handle);

        Storage::disk('private')->putFileAs('exports', new File($temp), basename($path));
        unlink($temp);

        $this->user->notify(new ExportReady(
            URL::temporarySignedRoute('exports.download', now()->addHours(24), ['export' => $this->exportId])
        ));
    }
}
```

Signed, expiring URLs — not a public path. `laravel-security` and
`laravel-media-management` cover the storage rules.

### Excel

`.xlsx` is a compressed XML format that generally requires the whole sheet in memory. Above
~50k rows, produce CSV. If Excel output is mandatory, use a streaming writer
(`maatwebsite/excel` with `FromQuery` + `WithChunkReading`, or OpenSpout directly) and set
a hard row cap with a clear message when it is exceeded.

## Bulk imports

```php
final class ImportProducts implements ShouldQueue
{
    public int $timeout = 3600;

    public function handle(): void
    {
        $handle = fopen(Storage::path($this->path), 'rb');
        $header = fgetcsv($handle);
        $buffer = [];
        $imported = 0;
        $errors = [];

        while (($row = fgetcsv($handle)) !== false) {
            $data = array_combine($header, $row);

            $validator = Validator::make($data, ProductImportRules::rules());

            if ($validator->fails()) {
                $errors[] = ['line' => $imported + 2, 'errors' => $validator->errors()->all()];
                continue;
            }

            $buffer[] = [
                'sku'        => $data['sku'],
                'name'       => $data['name'],
                'price'      => (int) round((float) $data['price'] * 100),
                'tenant_id'  => $this->tenantId,
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if (count($buffer) >= 1000) {
                $this->flush($buffer);
                $buffer = [];
            }

            $imported++;
        }

        if ($buffer !== []) {
            $this->flush($buffer);
        }

        fclose($handle);

        $this->recordResult($imported, $errors);
    }

    private function flush(array $rows): void
    {
        Product::upsert($rows, uniqueBy: ['tenant_id', 'sku'], update: ['name', 'price', 'updated_at']);
    }
}
```

Points that matter:
- Read line by line — never `file()` or `explode` on the whole file
- Buffer to ~1000 rows per `upsert`
- `upsert` gives insert-or-update in one statement
- Validate per row and **collect** errors rather than aborting the whole import
- Report line numbers back to the user
- Timeout generously; run on a dedicated queue

For very large imports, `LOAD DATA INFILE` (MySQL) or `COPY` (Postgres) into a staging
table, then transform with SQL, is an order of magnitude faster than any PHP loop. Requires
appropriate DB privileges and careful escaping.

## Reports and aggregation

Do not aggregate millions of rows on every page view.

**Materialised summary tables** — compute once, read many:

```php
Schema::create('daily_order_stats', function (Blueprint $table): void {
    $table->id();
    $table->foreignId('tenant_id')->constrained();
    $table->date('day');
    $table->unsignedInteger('order_count');
    $table->unsignedBigInteger('revenue_minor');
    $table->timestamps();

    $table->unique(['tenant_id', 'day']);
});
```

```php
// routes/console.php
Schedule::job(new RollUpDailyOrderStats)->dailyAt('01:00');
```

```php
final class RollUpDailyOrderStats implements ShouldQueue
{
    public function handle(): void
    {
        $day = today()->subDay();

        $rows = DB::table('orders')
            ->selectRaw('tenant_id, DATE(placed_at) as day, COUNT(*) as order_count, SUM(total) as revenue_minor')
            ->whereBetween('placed_at', [$day->startOfDay(), $day->endOfDay()])
            ->groupBy('tenant_id', 'day')
            ->get()
            ->map(fn ($r) => (array) $r + ['created_at' => now(), 'updated_at' => now()])
            ->all();

        DB::table('daily_order_stats')->upsert(
            $rows,
            ['tenant_id', 'day'],
            ['order_count', 'revenue_minor', 'updated_at'],
        );
    }
}
```

The dashboard then reads ~365 rows per tenant per year instead of scanning the orders
table. This is the single biggest win available for reporting at scale.

Schema design for summary tables, partitioning, and archival: `laravel-database-scale`.

## Search

`LIKE '%term%'` cannot use a B-tree index. At scale it is a full table scan every time.

| Rows | Approach |
|---|---|
| < 100k | `LIKE 'term%'` with an index (prefix only), or full-text |
| 100k – 5M | MySQL/Postgres full-text index |
| > 5M, or relevance matters | Dedicated engine — Meilisearch, Typesense, Elasticsearch |

```php
// Full-text
Schema::table('posts', fn (Blueprint $t) => $t->fullText(['title', 'body']));

Post::whereFullText(['title', 'body'], $term)->paginate(20);

// Laravel Scout with Meilisearch/Typesense
Post::search($term)->paginate(20);
```

Scout keeps the index in sync via queued jobs — budget for the queue load on bulk imports
(`Post::withoutSyncingToSearch(fn () => /* import */)` then reindex once).

## Deletion at scale

```php
// ✗ Locks the table, blows the binlog, can time out
Order::where('created_at', '<', now()->subYears(3))->delete();

// ✓ Chunked, throttled
do {
    $deleted = Order::where('created_at', '<', now()->subYears(3))
        ->limit(1000)
        ->delete();

    usleep(100_000);   // 100ms — let replicas catch up
} while ($deleted > 0);
```

For genuinely huge purges, partition by date and `DROP PARTITION` — instant, no row-by-row
work. See `laravel-database-scale`.

## Sanity limits

Put a hard ceiling on anything user-controlled:

```php
'per_page' => ['integer', 'min:1', 'max:100'],
'ids'      => ['array', 'max:1000'],
'date_range' => ['required', new MaxRangeDays(366)],
```

Without these, one user requesting `?per_page=1000000` takes the site down. This is both a
performance and an availability control — see `laravel-security`.
