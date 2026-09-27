# Media lifecycle

Files and database rows drift apart in both directions. Both directions cause incidents.

| Drift | Symptom | Cause |
|---|---|---|
| Row without file | Broken image, 404 on download | Failed upload, manual deletion, restore mismatch |
| File without row | Silent disk growth until it is full | Abandoned upload, failed transaction, missing cleanup |

## Orphan prevention

### 1. Prune unattached uploads

```php
final class Media extends Model
{
    use Prunable;

    public function prunable(): Builder
    {
        return static::whereNull('attachable_id')
            ->where('created_at', '<', now()->subDay());
    }

    protected function pruning(): void
    {
        Storage::disk($this->disk)->deleteDirectory($this->directory());
    }
}
```

```php
Schedule::command('model:prune')->daily()->at('03:00');
```

Use `Prunable`, **not** `MassPrunable` — you need `pruning()` to run per row so the files
are deleted too. `MassPrunable` issues one `DELETE` and fires no hooks, which would orphan
every file.

Give users a real window (24 hours, not 1 hour) — a user who starts a form on Friday and
finishes on Monday should not lose their attachments.

### 2. Delete files when the parent is deleted

```php
final class Post extends Model
{
    protected static function booted(): void
    {
        static::deleting(function (Post $post): void {
            if ($post->isForceDeleting()) {
                $post->media->each->delete();     // model event → file deleted
            }
        });
    }
}
```

Soft-deleting a parent should **not** delete files — the whole point of a soft delete is
recoverability. Only clean up on force delete.

### 3. Delete the file when the row is deleted

```php
protected static function booted(): void
{
    static::deleted(function (Media $media): void {
        if (! $media->isForceDeleting() && $media->usesSoftDeletes()) {
            return;
        }

        Storage::disk($media->disk)->deleteDirectory($media->directory());
    });
}
```

Careful with deduplication: if two rows share one physical file, deleting either row
deletes the file for both. Either do not dedupe across rows, or reference-count:

```php
$stillReferenced = Media::where('checksum', $media->checksum)
    ->where('id', '!=', $media->id)
    ->exists();

if (! $stillReferenced) {
    Storage::disk($media->disk)->deleteDirectory($media->directory());
}
```

### 4. Transactional safety

```php
DB::transaction(function () use ($file, $model): Media {
    $media = $model->media()->create([...]);

    // afterCommit: without it, the job can start before the row is visible
    ProcessMedia::dispatch($media->id)->afterCommit();

    return $media;
});
```

The file is written **before** the transaction. If the transaction rolls back, the file is
orphaned — which is why the audit below exists. Writing the file inside the transaction
would be worse: a filesystem write cannot be rolled back, and holding a DB transaction open
across an S3 upload is a lock-contention problem.

Orphaned files are acceptable and expected; the audit catches them.

## Integrity audit

Run monthly. Both directions.

```php
final class AuditMediaIntegrity extends Command
{
    protected $signature = 'media:audit {--fix} {--disk=private}';

    public function handle(): int
    {
        $missingFiles = 0;
        $orphanedFiles = 0;

        // Direction 1: rows whose file is gone
        Media::where('disk', $this->option('disk'))
            ->chunkById(500, function (Collection $media) use (&$missingFiles): void {
                foreach ($media as $item) {
                    if (Storage::disk($item->disk)->exists($item->path)) {
                        continue;
                    }

                    $missingFiles++;
                    $this->warn("Missing file: media#{$item->id} → {$item->path}");

                    if ($this->option('fix')) {
                        $item->update(['failed_at' => now()]);   // flag, do not delete
                    }
                }
            });

        // Direction 2: files with no row
        $knownDirectories = Media::pluck('path')
            ->map(fn (string $p): string => dirname($p))
            ->unique()
            ->flip();

        foreach (Storage::disk($this->option('disk'))->allDirectories('media') as $directory) {
            if ($knownDirectories->has($directory) || ! $this->isLeafDirectory($directory)) {
                continue;
            }

            $orphanedFiles++;
            $this->warn("Orphaned directory: {$directory}");

            if ($this->option('fix')) {
                Storage::disk($this->option('disk'))->deleteDirectory($directory);
            }
        }

        $this->info("Missing files: {$missingFiles}, orphaned directories: {$orphanedFiles}");

        return $missingFiles + $orphanedFiles > 0 ? self::FAILURE : self::SUCCESS;
    }
}
```

```php
Schedule::command('media:audit')->monthly();        // report
// Run with --fix manually, after reviewing the report
```

**Never schedule `--fix` unattended.** A bug in the audit that deletes live files is
unrecoverable. Report automatically; delete deliberately.

For very large stores, listing every object is slow and expensive. Use the storage
provider's inventory report (S3 Inventory, R2 equivalent) rather than `allDirectories()`.

## Reprocessing

You will change your derivative sizes or formats at some point.

```php
final class ReprocessMedia extends Command
{
    protected $signature = 'media:reprocess {--since=} {--type=} {--chunk=100}';

    public function handle(): int
    {
        $query = Media::query()
            ->when($this->option('since'), fn ($q, $d) => $q->where('created_at', '>=', $d))
            ->when($this->option('type'), fn ($q, $t) => $q->where('mime_type', 'like', "{$t}%"));

        $total = $query->count();
        $bar = $this->output->createProgressBar($total);

        $query->chunkById((int) $this->option('chunk'), function (Collection $media) use ($bar): void {
            Bus::batch(
                $media->map(fn (Media $m) => new ProcessMedia($m->id, force: true))->all()
            )->name('Media reprocess')->allowFailures()->onQueue('media')->dispatch();

            $bar->advance($media->count());
        });

        $bar->finish();

        return self::SUCCESS;
    }
}
```

Rules for a reprocess:
- **Keep the original.** Everything else is regenerable; the original is not.
- Batch it, so progress is visible and failures do not stop the run.
- Dedicated queue, so it does not starve user-facing jobs.
- Write new derivatives before deleting old ones, or the site shows broken images mid-run.
- Rate limit it — reprocessing 500k images will saturate the storage API and the CPU.

## Retention

```php
// Attachments to deleted records
Media::whereDoesntHave('attachable')->where('created_at', '<', now()->subMonths(3))->get();

// Temporary exports
Media::where('collection', 'exports')->where('created_at', '<', now()->subDays(7));

// Superseded versions
Media::where('collection', 'avatars')->where('id', '<', $current->id);
```

Every media collection needs a retention answer. Typical:

| Collection | Retention |
|---|---|
| User avatars | Current only — delete the previous on replace |
| Generated exports | 7 days |
| Email attachments | With the message |
| Document uploads | With the parent record |
| Audit evidence | Per legal requirement |
| Unattached uploads | 24 hours |

Personal data in media (a photo of an ID, a scanned form) falls under RA 10173 retention
and erasure obligations — see `laravel-security/references/data-privacy-ph.md`. An
anonymisation flow that clears the `users` table but leaves the uploaded passport scan on
S3 is incomplete.

## Migration between disks

```php
final class MigrateMediaDisk extends Command
{
    protected $signature = 'media:migrate-disk {from} {to} {--chunk=100}';

    public function handle(): int
    {
        Media::where('disk', $this->argument('from'))
            ->chunkById((int) $this->option('chunk'), function (Collection $media): void {
                foreach ($media as $item) {
                    // 1. Copy
                    Storage::disk($this->argument('to'))->writeStream(
                        $item->path,
                        Storage::disk($this->argument('from'))->readStream($item->path),
                    );

                    // 2. Verify
                    $ok = Storage::disk($this->argument('to'))->size($item->path) === $item->size_bytes;

                    if (! $ok) {
                        $this->error("Verification failed for media#{$item->id}");
                        continue;
                    }

                    // 3. Switch the pointer
                    $item->update(['disk' => $this->argument('to')]);

                    // 4. Delete the source LATER, in a separate pass, after confidence
                }
            });

        return self::SUCCESS;
    }
}
```

Copy → verify → switch → (much later) delete. Never delete in the same pass. Run the site
on the new disk for a week before removing the old files; a rollback with no source files
is not a rollback.

`writeStream`/`readStream` keeps memory constant regardless of file size.

## Testing

```php
it('stores the upload privately and queues processing', function (): void {
    Storage::fake('private');
    Queue::fake();

    $response = actingAs(User::factory()->create())
        ->post(route('media.store'), [
            'file' => UploadedFile::fake()->image('photo.jpg', 1200, 800),
            'alt'  => 'A description',
        ]);

    $response->assertCreated();

    $media = Media::sole();

    Storage::disk('private')->assertExists($media->path);
    expect($media->path)->not->toContain('photo.jpg');   // filename was generated
    Queue::assertPushed(ProcessMedia::class);
});

it('rejects a PHP file disguised as an image', function (): void {
    $file = UploadedFile::fake()->createWithContent('shell.jpg', '<?php system($_GET["c"]); ?>');

    actingAs(User::factory()->create())
        ->post(route('media.store'), ['file' => $file, 'alt' => 'x'])
        ->assertUnprocessable();      // mimetypes: sniffs content, so this fails
});

it('deletes files when the media row is force deleted', function (): void {
    Storage::fake('private');
    $media = Media::factory()->create();
    Storage::disk('private')->put($media->path, 'content');

    $media->forceDelete();

    Storage::disk('private')->assertMissing($media->path);
});

it('prunes unattached uploads older than a day', function (): void {
    Storage::fake('private');
    $orphan = Media::factory()->create(['attachable_id' => null, 'created_at' => now()->subDays(2)]);

    Artisan::call('model:prune', ['--model' => [Media::class]]);

    expect(Media::find($orphan->id))->toBeNull();
    Storage::disk('private')->assertMissing($orphan->path);
});
```

The disguised-PHP test is the important one — it proves `mimetypes` is doing its job. Add
it the moment you accept uploads.
