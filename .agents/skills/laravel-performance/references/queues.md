# Queues and background processing

## What to queue

Queue anything that is slow, external, or retryable:

| Work | Queue? |
|---|---|
| Sending mail / SMS / push | Always |
| Third-party API calls | Always |
| Image/video processing | Always |
| PDF and report generation | Always |
| Bulk imports/exports | Always |
| Search index updates | Always |
| Webhook delivery | Always |
| Anything over ~200ms | Yes |
| Anything the user must see the result of immediately | No — or use a polling/broadcast pattern |
| Sub-10ms bookkeeping | No — use `defer()` |

```php
// Too small for a queue, still off the response path
defer(fn () => Analytics::record($event));
```

`defer()` runs after the response is sent, in the same process. Good for fire-and-forget
work under ~50ms with no retry requirement. It does **not** survive a crash — anything that
must not be lost belongs in a queue.

## Queue design

```php
final class ProcessUpload implements ShouldQueue, ShouldBeUnique
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 300;
    public int $maxExceptions = 2;
    public array $backoff = [30, 120, 600];   // exponential-ish

    public function __construct(public readonly int $uploadId)
    {
        $this->onQueue('media');
    }

    public function retryUntil(): \DateTimeInterface
    {
        return now()->addHours(2);
    }

    public function uniqueId(): string
    {
        return (string) $this->uploadId;
    }

    public function middleware(): array
    {
        return [
            new WithoutOverlapping($this->uploadId),
            new RateLimited('third-party-api'),
            new ThrottlesExceptions(5, 5 * 60),
        ];
    }

    public function handle(GenerateDerivatives $action): void
    {
        $action->handle(Upload::findOrFail($this->uploadId));
    }

    public function failed(?Throwable $e): void
    {
        Log::error('Upload processing failed', ['upload' => $this->uploadId, 'error' => $e?->getMessage()]);
        Upload::whereKey($this->uploadId)->update(['status' => 'failed']);
    }
}
```

### Idempotency is not optional

A job will run more than once. Network blips, worker restarts, and timeouts all cause
re-delivery *after the work may have partly succeeded*.

```php
// ✗ Double-charges on retry
public function handle(): void
{
    $this->gateway->charge($this->order->total);
    $this->order->markPaid();
}

// ✓ Safe to run twice
public function handle(): void
{
    if ($this->order->fresh()->isPaid()) {
        return;
    }

    $this->gateway->charge(
        $this->order->total,
        idempotencyKey: "order:{$this->order->id}:charge",
    );

    $this->order->markPaid();
}
```

Use the provider's idempotency key where one exists. Otherwise, guard on state you write
transactionally.

### Payloads

```php
// ✗ Serialises a large object graph into Redis
public function __construct(public Collection $orders) {}

// ✓ IDs. Re-query in handle().
public function __construct(public array $orderIds) {}
```

`SerializesModels` stores only the key and re-queries on unserialize — which is right, but
means the model may have changed or been deleted by the time the job runs. Handle
`ModelNotFoundException` (Laravel deletes such jobs by default when the model is missing).

## Queue separation

```php
// config/queue.php / Horizon
'queues' => ['high', 'default', 'media', 'reports'],
```

| Queue | Contents | Workers |
|---|---|---|
| `high` | Password resets, OTP, payment webhooks | Dedicated, always available |
| `default` | Ordinary notifications | Several |
| `media` | Image/video processing | Fewer, longer timeout |
| `reports` | Long exports | 1–2, very long timeout |

Without separation, one 10-minute report blocks every password-reset email behind it. This
is the single most common queue design mistake.

```bash
# Priority order — drains 'high' before touching 'default'
php artisan queue:work --queue=high,default,media
```

## Batching

```php
$batch = Bus::batch(
    $userIds->map(fn ($id) => new SendMonthlyStatement($id))->all()
)
->name('Monthly statements')
->allowFailures()
->onQueue('reports')
->then(fn (Batch $b) => Log::info('Statements complete', ['id' => $b->id]))
->catch(fn (Batch $b, Throwable $e) => Log::error('Batch failed', ['id' => $b->id]))
->finally(fn (Batch $b) => Notification::send($admin, new BatchFinished($b)))
->dispatch();

// Progress
$batch->progress();   // 0-100
```

For very large batches, dispatch in chunks so you do not build a 100k-element array in
memory:

```php
User::where('active', true)->chunkById(1000, function (Collection $users) use ($batch): void {
    $batch->add($users->map(fn ($u) => new SendMonthlyStatement($u->id))->all());
});
```

## Chained jobs

```php
Bus::chain([
    new ImportRows($file),
    new ValidateImport($file),
    new NotifyImportComplete($file),
])->onQueue('imports')->dispatch();
```

A chain stops at the first failure — right when steps depend on each other, wrong when they
are independent (use a batch).

## Rate-limiting external calls

```php
// AppServiceProvider::boot()
RateLimiter::for('third-party-api', fn () => Limit::perMinute(60));
```

```php
public function middleware(): array
{
    return [new RateLimited('third-party-api')];
}
```

Jobs that exceed the limit are released back to the queue rather than failing.

## Horizon

```php
// config/horizon.php
'environments' => [
    'production' => [
        'supervisor-high' => [
            'connection' => 'redis',
            'queue' => ['high'],
            'balance' => 'auto',
            'minProcesses' => 2,
            'maxProcesses' => 10,
            'tries' => 3,
            'timeout' => 60,
            'memory' => 256,
        ],
        'supervisor-default' => [
            'queue' => ['default', 'media'],
            'balance' => 'auto',
            'maxProcesses' => 20,
            'timeout' => 300,
            'memory' => 512,
        ],
        'supervisor-long' => [
            'queue' => ['reports'],
            'maxProcesses' => 2,
            'timeout' => 1800,
            'memory' => 1024,
        ],
    ],
],

'waits' => ['redis:high' => 30, 'redis:default' => 120],   // alert thresholds
```

`timeout` must be **less than** the Supervisor `stopwaitsecs` and less than
`retry_after` in `config/queue.php`, or a job can be retried while still running.

```php
// config/queue.php
'redis' => [
    'retry_after' => 90,   // MUST exceed the longest job timeout on this connection
],
```

Getting this wrong causes duplicate execution — the most confusing class of queue bug.

## Failures

```bash
php artisan queue:failed
php artisan queue:retry <id>
php artisan queue:retry all
php artisan queue:flush            # purge failed jobs table
php artisan queue:prune-failed --hours=168
```

```php
// routes/console.php
Schedule::command('queue:prune-failed --hours=168')->daily();
Schedule::command('queue:prune-batches --hours=48')->daily();
```

Alert on failed-job count and queue wait time. Horizon exposes both; wire them to your
monitoring (`laravel-devops-deployment`).

## Backpressure

When the queue depth grows faster than workers drain it, adding workers is not always the
answer — the bottleneck is usually the database or a rate-limited third party.

```php
// Shed load rather than queue infinitely
if (Queue::size('reports') > 10_000) {
    throw new ServiceBusy(__('Report generation is backed up. Please try again shortly.'));
}
```

Monitor: queue depth, oldest job age, job runtime p95, failure rate.

## Testing

```php
it('queues the derivative job instead of processing inline', function (): void {
    Queue::fake();

    $this->postJson('/api/uploads', ['file' => UploadedFile::fake()->image('a.jpg')]);

    Queue::assertPushedOn('media', ProcessUpload::class);
});

it('is idempotent', function (): void {
    $order = Order::factory()->paid()->create();

    (new ChargeOrder($order->id))->handle($gateway);
    (new ChargeOrder($order->id))->handle($gateway);

    expect($order->payments()->count())->toBe(1);
});
```

`laravel-testing-qa` owns the full test matrix.

## Local development

```bash
php artisan queue:listen        # picks up code changes; slower
php artisan queue:work          # production behaviour; must restart after code changes
```

`queue:work` boots the framework once. **Code changes are not picked up until restart** —
a recurring source of "my fix didn't work" confusion. Use `queue:listen` locally, and
`php artisan queue:restart` in the deploy script.
