---
name: laravel-media-management
description: Use when handling file uploads, images, documents, avatars, attachments, or any user-supplied media. Covers upload validation, safe storage layout, derivative and thumbnail generation, WebP/AVIF conversion, responsive srcset, EXIF stripping, CDN delivery, signed access, orphan cleanup, and storage that scales to hundreds of thousands of files. Triggers on "upload", "image", "file", "attachment", "avatar", "thumbnail", "photo", "PDF", "storage", "S3", "CDN", or any form with a file input.
---

# Image & File Management

Uploads are simultaneously a security surface, a storage cost, a performance factor, and an
accessibility obligation. Get the pipeline right once and reuse it.

## The pipeline

```
Validate → Store privately → Record in DB → Queue derivatives →
Serve via signed URL or CDN → Prune orphans
```

Never skip a stage. Every skipped stage becomes an incident: skipped validation is RCE,
skipped queueing is a 30-second request, skipped pruning is a full disk.

## 1. Validate — content, not extension

```php
'document' => [
    'required',
    'file',
    'max:10240',                                        // KB
    'mimetypes:application/pdf,image/jpeg,image/png',   // sniffs actual content
    'extensions:pdf,jpg,jpeg,png',                      // belt and braces
],

'avatar' => [
    'required', 'file', 'max:2048',
    'mimetypes:image/jpeg,image/png,image/webp',
    'dimensions:min_width=100,min_height=100,max_width=4000,max_height=4000',
],
```

- **`mimetypes:` not `mimes:`** — `mimes` trusts the extension. `shell.jpg.php` passes
  `mimes:jpg`.
- `dimensions` caps decompression-bomb inputs (a 50KB PNG can expand to 40GB in memory).
- Size limits must also exist in `php.ini` (`upload_max_filesize`, `post_max_size`) and the
  web server (`client_max_body_size`) — validation runs *after* the upload completes.

## 2. Store — private by default, generated names

```php
$file = $request->file('document');

$path = $file->storeAs(
    directory: $this->directoryFor($model),
    name: Str::ulid().'.'.$file->extension(),   // WE generate the name
    options: 'private',                         // outside the web root
);
```

Never use `getClientOriginalName()` as a storage name — it is attacker-controlled and
enables path traversal (`../../../public/shell.php`).

Keep the original name as *metadata* for display and download:

```php
Media::create([
    'disk'          => 'private',
    'path'          => $path,
    'original_name' => $file->getClientOriginalName(),   // display only
    'mime_type'     => $file->getMimeType(),             // sniffed, not claimed
    'size_bytes'    => $file->getSize(),
    'checksum'      => hash_file('xxh128', $file->getRealPath()),
]);
```

### Directory layout at scale

```php
// ✗ 500,000 files in one directory — most filesystems degrade badly
'uploads/'.$filename

// ✓ Sharded by date and id
sprintf('media/%s/%s/%s', now()->format('Y/m'), substr($ulid, 0, 2), $filename)
// → media/2026/07/01/01J8X....webp
```

Date-sharding also makes retention trivial: delete `media/2023/*` in one operation.

## 3. Derivatives — always queued

```php
ProcessMedia::dispatch($media->id)->onQueue('media');
```

Image processing takes seconds and hundreds of MB of memory. In a web request it blocks a
PHP-FPM worker and risks a timeout. Always queue it.

```php
final class GenerateDerivatives
{
    private const SIZES = [
        'thumb'  => 200,
        'small'  => 480,
        'medium' => 960,
        'large'  => 1920,
    ];

    public function handle(Media $media): void
    {
        $image = $this->manager->read(Storage::disk($media->disk)->path($media->path));

        foreach (self::SIZES as $name => $width) {
            if ($image->width() < $width) {
                continue;               // never upscale
            }

            foreach (['webp', 'avif'] as $format) {
                $derivative = (clone $image)->scaleDown(width: $width);

                Storage::disk($media->disk)->put(
                    $media->derivativePath($name, $format),
                    $derivative->encodeByExtension($format, quality: $this->quality($format)),
                );
            }
        }

        $media->update(['processed_at' => now()]);
    }
}
```

**Never upscale.** A 400px source rendered at 1920px is blurry and wastes storage.

## 4. Formats

| Format | Use for | Notes |
|---|---|---|
| **AVIF** | Best compression, photos | ~50% smaller than JPEG; slower to encode |
| **WebP** | Default modern format | ~30% smaller than JPEG; universal support |
| **JPEG** | Fallback, photos | Universal |
| **PNG** | Transparency, screenshots, line art | Large for photos |
| **SVG** | Icons, logos | **Sanitise** — SVG can contain script |
| **Original** | Downloads | Keep it; derive everything else |

Serve with `<picture>` so the browser picks:

```blade
<picture>
    <source type="image/avif" srcset="{{ $media->srcset('avif') }}" sizes="{{ $sizes }}">
    <source type="image/webp" srcset="{{ $media->srcset('webp') }}" sizes="{{ $sizes }}">
    <img src="{{ $media->url('medium', 'jpg') }}"
         width="{{ $media->width }}" height="{{ $media->height }}"
         alt="{{ $media->alt }}"
         loading="lazy" decoding="async">
</picture>
```

`width` and `height` are mandatory — they prevent layout shift (CLS). `alt` is mandatory —
make it a **required, validated** field at upload time, or it will be null.

## 5. Strip EXIF

```php
$image->encodeByExtension('webp', quality: 82);   // Intervention drops EXIF by default
```

Photos from phones carry GPS coordinates, device identifiers, and timestamps. Publishing
them is a privacy breach. Strip on every derivative, and on the original if you re-encode
it.

Keep orientation, though — apply the EXIF rotation before stripping, or portrait photos
render sideways.

## 6. Serve — authorize or sign

```php
// Private files: authorize, then stream
Route::get('/media/{media}', function (Media $media) {
    Gate::authorize('view', $media);

    return Storage::disk($media->disk)->response($media->path, $media->original_name);
})->middleware('auth')->name('media.show');

// Or a short-lived signed URL (S3-compatible)
$url = Storage::disk('s3')->temporaryUrl($media->path, now()->addMinutes(15));
```

Public assets (marketing images, avatars on a public profile) can go on a public disk
behind a CDN with long cache headers — the filename contains a ULID, so it is
content-addressed enough to cache forever.

## 7. Prune orphans

Every media row needs a matching file, and every file needs a matching row. Both drift.

```php
final class Media extends Model
{
    use Prunable;

    public function prunable(): Builder
    {
        // Uploads never attached to anything
        return static::whereNull('attachable_id')->where('created_at', '<', now()->subDay());
    }

    protected function pruning(): void
    {
        Storage::disk($this->disk)->deleteDirectory($this->directory());
    }
}
```

Orphaned files are the most common cause of a full disk that nobody predicted. Schedule
`model:prune` daily and audit both directions monthly — see `references/lifecycle.md`.

## Scope boundaries

Owns: upload pipeline, storage layout, derivatives, formats, `srcset` generation, EXIF,
CDN delivery, media lifecycle.

Does not own: general input validation and OWASP defence (`laravel-security` — this skill
implements its upload rules); `alt` text quality and `<picture>` accessibility semantics
(`laravel-ui-accessibility`); layout and `sizes` breakpoints (`laravel-responsive-design`);
queue configuration (`laravel-performance`).

## Bundled resources

- `references/upload-pipeline.md` — validation, storage, models, transactional safety
- `references/image-processing.md` — Intervention/Imagick, derivatives, formats, quality
- `references/storage-at-scale.md` — disks, S3, sharding, CDN, cost, hundreds of thousands of files
- `references/lifecycle.md` — orphans, retention, migration, integrity audits
- `templates/` — `Media` model + migration, `ProcessMedia` job, upload action, Blade component
- `examples/complete-upload-flow.md` — end-to-end, form to CDN
- `checklists/media-review.md` — pre-merge gate

---
Last reviewed: 2026-07-31 · See MAINTENANCE.md
