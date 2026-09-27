# Storage at scale

Target: hundreds of thousands to millions of files, served fast, at predictable cost.

## Disks

```php
// config/filesystems.php
'disks' => [
    // Never web-accessible. Authorized or signed access only.
    'private' => [
        'driver' => 'local',
        'root'   => storage_path('app/private'),
        'throw'  => true,
    ],

    // Behind a CDN, long cache headers, ULID filenames
    'public' => [
        'driver'     => 'local',
        'root'       => storage_path('app/public'),
        'url'        => env('CDN_URL', env('APP_URL').'/storage'),
        'visibility' => 'public',
        'throw'      => true,
    ],

    's3' => [
        'driver'   => 's3',
        'key'      => env('AWS_ACCESS_KEY_ID'),
        'secret'   => env('AWS_SECRET_ACCESS_KEY'),
        'region'   => env('AWS_DEFAULT_REGION', 'ap-southeast-1'),
        'bucket'   => env('AWS_BUCKET'),
        'url'      => env('AWS_URL'),
        'endpoint' => env('AWS_ENDPOINT'),          // set for R2, Spaces, MinIO
        'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
        'throw'    => true,
        'visibility' => 'private',                   // default to private
    ],
],
```

`'throw' => true` is important: without it, a failed write returns `false` and the code
carries on believing the file exists.

`ap-southeast-1` (Singapore) is the nearest AWS region to the Philippines; `ap-southeast-3`
(Jakarta) is also close. Latency to the storage region matters for upload experience.

## Provider comparison

| Provider | Storage | Egress | Notes |
|---|---|---|---|
| **Cloudflare R2** | Low | **Free** | S3-compatible; egress-free changes the economics entirely |
| **Backblaze B2** | Lowest | Free via Cloudflare | Good archival tier |
| **AWS S3** | Moderate | **Expensive** | Best ecosystem, lifecycle rules, storage classes |
| **DigitalOcean Spaces** | Flat | Included allowance | Simple pricing, built-in CDN |
| **Local disk** | Server cost | Bandwidth | Does not scale past one server |

For a media-heavy public product, egress usually dominates the bill. R2's free egress is
often the single biggest cost decision available.

**Local disk stops working the moment you have two application servers** — a file uploaded
to server A is invisible to server B. Move to object storage before horizontal scaling, not
after.

## Directory sharding

```php
// ✗ ext4 degrades noticeably past ~10k entries per directory; ls becomes unusable
'uploads/'.$filename

// ✓ Bounded fan-out
sprintf('media/%s/%s/%s', now()->format('Y/m'), substr($ulid, 0, 2), $filename)
// media/2026/07/01/01J8XK3M7QRVWXYZ.webp
```

Two levels of benefit:
- **Date prefix** — retention becomes a single directory delete (`media/2023/*`), and
  browsing by period is possible
- **ULID prefix** — 256 sub-buckets bound the files per directory

Object stores do not have real directories, but the key prefix still matters: S3 partitions
by key prefix, and a monotonically-increasing prefix (a plain timestamp) can create a hot
partition. ULID prefixes distribute writes.

## Derivative layout

```
media/2026/07/01/01J8XK3M7Q/
├── original.jpg
├── thumb.webp
├── thumb.avif
├── small.webp
├── small.avif
├── medium.webp
├── medium.avif
├── large.webp
└── large.avif
```

One directory per media item. Deleting the item is `deleteDirectory()` — no chance of
orphaning a derivative.

```php
public function directory(): string
{
    return sprintf('media/%s/%s/%s',
        $this->created_at->format('Y/m'),
        substr($this->ulid, 0, 2),
        $this->ulid,
    );
}

public function derivativePath(string $size, string $format): string
{
    return "{$this->directory()}/{$size}.{$format}";
}
```

## CDN

```php
'url' => env('CDN_URL'),   // https://cdn.example.com
```

```blade
<img src="{{ Storage::disk('public')->url($media->path) }}">
```

Cache headers — filenames contain a ULID, so content never changes at a given URL:

```
Cache-Control: public, max-age=31536000, immutable
```

Configure at the storage provider (S3 object metadata) or at the CDN edge.

```php
Storage::disk('s3')->put($path, $contents, [
    'CacheControl' => 'public, max-age=31536000, immutable',
    'ContentType'  => $mime,
]);
```

If a file must be replaced, **write a new ULID** rather than overwriting. Overwriting means
a cache purge, and purges are eventually consistent — users will see the old image for
minutes.

### CDN and private files

Private media can still use a CDN via signed URLs:

```php
$url = Storage::disk('s3')->temporaryUrl($media->path, now()->addMinutes(15));
```

Or CloudFront signed URLs/cookies, which keep the origin private while allowing edge
caching. Keep the expiry short — a signed URL that lives for 24 hours is effectively public
for 24 hours, and it will be shared.

## Serving private files through PHP

```php
// Streams — does not load the file into memory
return Storage::disk('private')->response($media->path, $media->original_name, [
    'Content-Type'        => $media->mime_type,
    'Content-Disposition' => 'inline; filename="'.addslashes($media->original_name).'"',
    'X-Content-Type-Options' => 'nosniff',
]);
```

For large files behind Nginx, offload the transfer so PHP is not tied up:

```php
return response()->noContent()->withHeaders([
    'X-Accel-Redirect' => '/protected/'.$media->path,
    'Content-Type'     => $media->mime_type,
]);
```

```nginx
location /protected/ {
    internal;                                    # only reachable via X-Accel-Redirect
    alias /var/www/app/storage/app/private/;
}
```

The `internal` directive means the path cannot be requested directly — only Nginx acting on
the header can serve it. This gives you authorization in PHP with Nginx-speed delivery.

Apache equivalent: `X-Sendfile` with `mod_xsendfile`.

## Cost control

| Lever | Effect |
|---|---|
| Modern formats (WebP/AVIF) | 30–50% less storage **and** egress |
| Only generate sizes you render | Directly proportional |
| Lifecycle rules to cold storage | Large saving on archival data |
| Egress-free provider (R2) | Often the largest single saving |
| Long CDN cache | Fewer origin requests |
| Deduplication by checksum | Saves on repeated uploads of the same file |
| Aggressive orphan pruning | Prevents silent unbounded growth |

```json
{
  "Rules": [{
    "Id": "archive-old-originals",
    "Status": "Enabled",
    "Filter": { "Prefix": "media/" },
    "Transitions": [
      { "Days": 90,  "StorageClass": "STANDARD_IA" },
      { "Days": 365, "StorageClass": "GLACIER_IR" }
    ]
  }]
}
```

Only transition **originals** — derivatives are served constantly and must stay hot.
Retrieval from Glacier is slow and charged.

### Deduplication

```php
$checksum = hash_file('xxh128', $file->getRealPath());

if ($existing = Media::where('checksum', $checksum)->where('tenant_id', $tenantId)->first()) {
    return $existing->replicate()->fill(['attachable_id' => $model->id])->save();
}
```

Scope dedup by tenant. Sharing a physical file across tenants means one tenant's deletion
affects another's, and creates a subtle information leak (upload timing reveals whether
another tenant has the same file).

## Monitoring

```php
Schedule::job(new RecordStorageMetrics)->daily();
```

```php
final class RecordStorageMetrics
{
    public function handle(): void
    {
        StorageMetric::create([
            'total_files'   => Media::count(),
            'total_bytes'   => Media::sum('size_bytes'),
            'unprocessed'   => Media::whereNull('processed_at')->whereNull('failed_at')->count(),
            'failed'        => Media::whereNotNull('failed_at')->count(),
            'orphaned'      => Media::whereNull('attachable_id')->where('created_at', '<', now()->subDay())->count(),
        ]);
    }
}
```

Track the **growth rate**, not just the total. "We have 400GB" tells you nothing; "we add
20GB/month and have 600GB of quota" tells you when to act.

Alert on: unprocessed backlog growing, failure count rising, orphan count rising, storage
approaching quota.

## Backups

Object storage is durable, not backed up. Durability protects against hardware failure, not
against your own `deleteDirectory()` bug or a compromised credential.

- **Versioning** on the bucket — recovers from accidental deletion and overwrites
- **Cross-region replication** for critical media
- **MFA delete** on the production bucket
- Separate credentials for the application (write) and backups (read)
- Test a restore. Untested backups are hopes.

`laravel-devops-deployment` owns the overall backup strategy.
