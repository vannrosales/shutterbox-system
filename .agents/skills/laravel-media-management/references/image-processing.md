# Image processing

## Driver choice

```bash
composer require intervention/image
```

```php
// config/image.php
'driver' => extension_loaded('imagick')
    ? \Intervention\Image\Drivers\Imagick\Driver::class
    : \Intervention\Image\Drivers\Gd\Driver::class,
```

| Driver | Pros | Cons |
|---|---|---|
| **Imagick** | Better quality, more formats, AVIF/HEIC, colour profiles | Heavier, more CVE history |
| **GD** | Bundled with PHP, lighter | No AVIF, weaker resampling |

Prefer Imagick for a media-heavy product. Keep ImageMagick patched and restrict its
delegates — historically the source of several RCEs:

```xml
<!-- /etc/ImageMagick-7/policy.xml -->
<policymap>
  <policy domain="coder" rights="none" pattern="EPHEMERAL"/>
  <policy domain="coder" rights="none" pattern="URL"/>
  <policy domain="coder" rights="none" pattern="HTTPS"/>
  <policy domain="coder" rights="none" pattern="MVG"/>
  <policy domain="coder" rights="none" pattern="MSL"/>
  <policy domain="coder" rights="none" pattern="TEXT"/>
  <policy domain="resource" name="memory" value="256MiB"/>
  <policy domain="resource" name="width" value="16KP"/>
  <policy domain="resource" name="height" value="16KP"/>
</policymap>
```

The `URL`/`HTTPS` coder policies close an SSRF vector where a crafted image makes
ImageMagick fetch a URL. The resource limits cap decompression bombs.

For very high volume, consider `libvips` (`jcupitt/vips`) — several times faster and far
lower memory than either.

## Derivative sizes

```php
private const SIZES = [
    'thumb'  => 200,     // list rows, avatars
    'small'  => 480,     // mobile
    'medium' => 960,     // tablet / content width
    'large'  => 1920,    // desktop hero, retina content
];
```

Match these to the **`sizes` attribute** you actually render — generating a 1920px variant
that no breakpoint requests is wasted storage and CPU. Coordinate with
`laravel-responsive-design`.

**Never upscale:**

```php
if ($image->width() < $width) {
    continue;
}
```

A 400px source rendered at 1920px is blurry and larger than the original.

## Resize semantics

```php
// Preserve aspect ratio, never enlarge — the default for content images
$image->scaleDown(width: 960);

// Exact box, crops the overflow — for avatars and uniform grids
$image->cover(400, 400);

// Fit inside a box, pad the rest — rarely what you want
$image->contain(400, 400, background: 'ffffff');
```

`scaleDown` for content images. `cover` for anything that must be a fixed shape.

## Format and quality

```php
$image->encodeByExtension('webp', quality: 82);
$image->encodeByExtension('avif', quality: 55);   // AVIF quality scale differs from JPEG
$image->encodeByExtension('jpg',  quality: 82, progressive: true);
```

| Format | Quality | Notes |
|---|---|---|
| JPEG | 80–85 | Progressive; above 90 is mostly wasted bytes |
| WebP | 78–85 | ~30% smaller than equivalent JPEG |
| AVIF | 50–60 | Different scale — 55 ≈ JPEG 85; ~50% smaller |
| PNG | n/a | Lossless; use `pngquant` for palette reduction |

AVIF encoding is **slow** (seconds per image). Queue it, and consider generating AVIF only
for the sizes that matter most, or lazily on first request.

### Real byte comparison

A 2000×1333 photograph, resized to 960px wide:

| Format | Approx size |
|---|---|
| JPEG q85 | ~140 KB |
| WebP q82 | ~95 KB |
| AVIF q55 | ~65 KB |

Actual numbers vary heavily by image content — measure on your own corpus before promising
a figure.

## Orientation and EXIF

```php
$image = $this->manager->read($path);

// Apply the EXIF rotation flag, THEN encode (which drops EXIF)
$image->orient();

$encoded = $image->encodeByExtension('webp', quality: 82);
```

Without `orient()`, portrait photos from phones appear sideways — the pixels are landscape
and an EXIF flag says "rotate me". Once you re-encode and drop EXIF, that flag is gone, so
the rotation must be applied first.

Stripping EXIF is a **privacy requirement**: phone photos carry GPS coordinates, device
serial numbers, and timestamps. Intervention drops metadata on encode by default; verify
it:

```bash
exiftool derivative.webp    # should show no GPS, no device info
```

## Memory

```php
final class GenerateDerivatives
{
    public function handle(Media $media): void
    {
        // An 8000x8000 image needs ~256MB decoded, regardless of file size
        $previous = ini_set('memory_limit', '512M');

        try {
            // ...
        } finally {
            ini_set('memory_limit', $previous);
        }
    }
}
```

Better: cap dimensions at validation (`dimensions:max_width=8000`) so the memory ceiling is
predictable. Memory needed ≈ `width × height × 4 bytes` for the decoded bitmap, plus
working space.

Free eagerly when processing several sizes:

```php
foreach (self::SIZES as $name => $width) {
    $derivative = $this->manager->read($sourcePath)->scaleDown(width: $width);
    Storage::disk($disk)->put($path, $derivative->encodeByExtension('webp', 82));
    unset($derivative);
}
```

Re-reading the source per size uses more CPU but bounds peak memory — the right trade for
a queue worker processing many jobs.

## `srcset` generation

```php
public function srcset(string $format = 'webp'): string
{
    return collect($this->derivatives[$format] ?? [])
        ->map(fn (array $d): string => "{$this->url($d['name'], $format)} {$d['width']}w")
        ->implode(', ');
}
```

```blade
<picture>
    <source type="image/avif" srcset="{{ $media->srcset('avif') }}"
            sizes="(min-width: 62rem) 50vw, 100vw">
    <source type="image/webp" srcset="{{ $media->srcset('webp') }}"
            sizes="(min-width: 62rem) 50vw, 100vw">
    <img src="{{ $media->url('medium', 'jpg') }}"
         width="{{ $media->width }}" height="{{ $media->height }}"
         alt="{{ $media->alt }}"
         loading="lazy" decoding="async">
</picture>
```

The `sizes` attribute tells the browser how wide the image will *render* before CSS loads.
Getting it wrong means the browser downloads the wrong variant — usually too large. It must
match the actual layout, so it is owned jointly with `laravel-responsive-design`.

**Do not lazy-load the LCP image.** `loading="lazy"` on the hero delays the largest paint.
Use `fetchpriority="high"` there instead.

## Placeholders

```php
// Tiny blurred preview, stored inline in the database
$blur = $this->manager->read($path)
    ->scaleDown(width: 20)
    ->blur(5)
    ->encodeByExtension('webp', quality: 40);

$media->update(['placeholder' => 'data:image/webp;base64,'.base64_encode((string) $blur)]);
```

```blade
<img src="{{ $media->url('medium') }}"
     style="background-image: url('{{ $media->placeholder }}'); background-size: cover"
     width="{{ $media->width }}" height="{{ $media->height }}"
     alt="{{ $media->alt }}" loading="lazy">
```

Keep placeholders under ~1KB or the saving is negative. A solid dominant colour is often
enough and costs 7 bytes.

## PDFs and documents

```php
// Thumbnail the first page (requires Imagick + Ghostscript)
$image = $this->manager->read($pdfPath.'[0]');
```

Ghostscript has a significant CVE history. If you thumbnail PDFs:
- Keep it patched
- Run it in a sandboxed container with no network access
- Cap the resource limits in ImageMagick's policy
- Consider whether a generic file-type icon would do instead

For DOCX/XLSX thumbnails, LibreOffice headless works but is heavy — a queue job with a long
timeout and a dedicated worker.

## Video

Out of scope for most applications, but the shape is the same: validate, store privately,
queue processing, serve via CDN. Use `php-ffmpeg/php-ffmpeg` for thumbnails and transcoding,
run it on a dedicated queue with generous timeouts, and consider a managed service
(Mux, Cloudflare Stream) rather than running transcoding yourself.

## Failure handling

```php
public function handle(Media $media): void
{
    try {
        // ...
        $media->update(['processed_at' => now(), 'failed_at' => null]);
    } catch (Throwable $e) {
        $media->update(['failed_at' => now()]);

        Log::error('Derivative generation failed', [
            'media' => $media->id,
            'mime'  => $media->mime_type,
            'error' => $e->getMessage(),
        ]);

        throw $e;    // let the queue retry
    }
}
```

The UI must handle "uploaded but not yet processed" and "processing failed" — fall back to
the original, or show a placeholder with a retry option. A broken `<img>` with no alt text
is the worst outcome.

```blade
@if ($media->processed_at)
    <picture>...</picture>
@elseif ($media->failed_at)
    <img src="{{ $media->url() }}" alt="{{ $media->alt }}" width="..." height="...">
@else
    <div role="status">{{ __('Image is still processing.') }}</div>
@endif
```
