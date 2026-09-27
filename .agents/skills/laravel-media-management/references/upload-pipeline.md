# The upload pipeline

## Validation

```php
final class StoreDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('upload', $this->route('project'));
    }

    public function rules(): array
    {
        return [
            'file' => [
                'required',
                'file',
                'max:10240',                                       // KB
                'mimetypes:application/pdf,image/jpeg,image/png',  // content sniffing
                'extensions:pdf,jpg,jpeg,png',
            ],
            // alt is REQUIRED for images. A nullable alt column will be null.
            'alt'   => ['required_if:type,image', 'string', 'max:255'],
            'title' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'file.max'       => __('The file must not be larger than 10 MB.'),
            'file.mimetypes' => __('Upload a PDF, JPG or PNG file.'),
            'alt.required_if'=> __('Describe the image for people using screen readers.'),
        ];
    }
}
```

### `mimetypes` vs `mimes` — the distinction that matters

| Rule | Checks | Bypassable |
|---|---|---|
| `mimes:jpg` | The **extension** against a MIME map | Yes — rename `shell.php` to `shell.jpg` |
| `mimetypes:image/jpeg` | The **actual content** via `finfo` | Much harder |

Always `mimetypes`. Add `extensions` alongside it so the stored extension is also
constrained.

Content sniffing is not infallible — a polyglot file can be a valid GIF *and* valid PHP.
That is why the file also goes outside the web root and the upload directory cannot execute
scripts. Defence in depth.

### Image-specific

```php
'image' => [
    'required', 'file', 'max:5120',
    'mimetypes:image/jpeg,image/png,image/webp,image/avif',
    'dimensions:min_width=100,min_height=100,max_width=8000,max_height=8000',
],
```

`dimensions` caps decompression bombs. A 50KB PNG declaring 60,000 × 60,000 pixels expands
to ~14GB when decoded, killing the process. The dimension check reads the header only.

### SVG needs sanitisation, not just validation

SVG is XML and can contain `<script>`, `onload=`, and external entity references.

```php
use enshrined\svgSanitize\Sanitizer;

$clean = (new Sanitizer())->sanitize(file_get_contents($file->getRealPath()));

throw_if($clean === false, ValidationException::withMessages([
    'file' => __('That SVG file could not be processed.'),
]));

Storage::disk('private')->put($path, $clean);
```

If SVG uploads are not a product requirement, do not accept them.

### Limits at every layer

Validation runs **after** the upload finishes. A 2GB upload consumes bandwidth and disk
before validation rejects it.

```ini
; php.ini
upload_max_filesize = 10M
post_max_size = 12M          ; must exceed upload_max_filesize
max_file_uploads = 20
memory_limit = 256M
```

```nginx
client_max_body_size 12m;
client_body_timeout 60s;
```

Keep them consistent: web server ≥ `post_max_size` ≥ `upload_max_filesize` ≥ validation
`max:`. A mismatch produces a confusing empty-`$_FILES` failure with no error message.

## Storage

```php
final class StoreMedia
{
    public function handle(UploadedFile $file, Model $attachable, MediaData $data): Media
    {
        $ulid = (string) Str::ulid();

        $path = $file->storeAs(
            directory: $this->directory($ulid),
            name: $ulid.'.'.$this->safeExtension($file),
            options: ['disk' => 'private'],
        );

        return DB::transaction(function () use ($file, $attachable, $data, $path, $ulid): Media {
            $media = $attachable->media()->create([
                'ulid'          => $ulid,
                'disk'          => 'private',
                'path'          => $path,
                'original_name' => $this->sanitiseName($file->getClientOriginalName()),
                'mime_type'     => $file->getMimeType(),       // sniffed
                'size_bytes'    => $file->getSize(),
                'checksum'      => hash_file('xxh128', $file->getRealPath()),
                'alt'           => $data->alt,
                'uploaded_by'   => auth()->id(),
            ]);

            ProcessMedia::dispatch($media->id)->onQueue('media')->afterCommit();

            return $media;
        });
    }

    private function directory(string $ulid): string
    {
        // Shard: date for retention, ULID prefix to bound files-per-directory
        return sprintf('media/%s/%s', now()->format('Y/m'), substr($ulid, 0, 2));
    }

    private function safeExtension(UploadedFile $file): string
    {
        // Derive from the sniffed MIME type, not from the client's filename
        return match ($file->getMimeType()) {
            'image/jpeg'      => 'jpg',
            'image/png'       => 'png',
            'image/webp'      => 'webp',
            'image/avif'      => 'avif',
            'application/pdf' => 'pdf',
            default           => throw new UnsupportedMediaType($file->getMimeType()),
        };
    }

    private function sanitiseName(string $name): string
    {
        // Display only — but strip path separators and control characters anyway
        return Str::limit(preg_replace('/[^\P{C}]|[\/\\\\]/u', '', $name), 200, '');
    }
}
```

Key points:

- **`->afterCommit()`** on the job dispatch. Without it, the job can start before the
  transaction commits and fail with "model not found" — an intermittent bug that is
  miserable to diagnose.
- The extension comes from the **sniffed MIME type**, not the filename.
- `checksum` enables deduplication and integrity auditing.
- The original filename is stored for display but never used as a path.

## The model

```php
Schema::create('media', function (Blueprint $table): void {
    $table->id();
    $table->ulid('ulid')->unique();

    $table->nullableMorphs('attachable');          // nullable so orphans are detectable
    $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
    $table->foreignId('tenant_id')->nullable()->constrained()->cascadeOnDelete();

    $table->string('disk', 32);
    $table->string('path', 512);
    $table->string('original_name', 255);
    $table->string('mime_type', 128);
    $table->unsignedBigInteger('size_bytes');
    $table->string('checksum', 64)->index();       // dedup + integrity audit

    $table->string('alt', 255)->nullable();        // required at validation for images
    $table->unsignedInteger('width')->nullable();
    $table->unsignedInteger('height')->nullable();
    $table->json('derivatives')->nullable();       // generated variants

    $table->timestamp('processed_at')->nullable();
    $table->timestamp('failed_at')->nullable();
    $table->timestamps();

    $table->index(['attachable_type', 'attachable_id']);
    $table->index(['tenant_id', 'created_at']);
    // Finds orphans: unattached rows older than a day
    $table->index(['attachable_id', 'created_at']);
});
```

`nullableMorphs` matters: a two-step flow (upload, then attach on form submit) creates rows
with no owner. Making the column nullable is what lets you *find* and prune them.

## Two-step uploads

Most real forms upload before the parent record exists.

```php
// 1. User picks a file → immediate async upload
Route::post('/media', StoreMediaController::class)->middleware(['auth', 'throttle:upload']);
// Returns { id, ulid, preview_url }

// 2. Form submit references the media id
'attachments'   => ['array', 'max:10'],
'attachments.*' => ['integer', Rule::exists('media', 'id')
    ->where('uploaded_by', auth()->id())        // ← essential
    ->whereNull('attachable_id')],
```

The `where('uploaded_by', auth()->id())` scope is essential — without it, a user can
attach **another user's** uploaded file to their own record by guessing an id. That is an
IDOR in a place most people do not look for one.

```php
// 3. Attach on save
$post->media()->saveMany(Media::whereIn('id', $data->attachmentIds)->get());
```

```php
// 4. Prune whatever was never attached
public function prunable(): Builder
{
    return static::whereNull('attachable_id')->where('created_at', '<', now()->subDay());
}
```

## Direct-to-S3 uploads

For large files, uploading through the PHP application is wasteful — it consumes a worker
for the entire transfer.

```php
// Issue a presigned PUT URL
Route::post('/media/presign', function (PresignRequest $request) {
    $ulid = (string) Str::ulid();
    $path = "uploads/{$ulid}";

    return [
        'url'  => Storage::disk('s3')->temporaryUploadUrl($path, now()->addMinutes(10))['url'],
        'path' => $path,
    ];
})->middleware(['auth', 'throttle:upload']);
```

The client PUTs directly to S3. Then confirm server-side — and **verify the object**,
because the presigned URL bypassed your validation:

```php
$size = Storage::disk('s3')->size($path);
$mime = Storage::disk('s3')->mimeType($path);

abort_if($size > 10 * 1024 * 1024, 422);
abort_unless(in_array($mime, ['image/jpeg', 'image/png'], true), 422);
```

Constrain the presigned URL itself where the provider supports it (content-length range,
content-type condition). Without server-side verification, a presigned upload URL is an
unrestricted file upload.

## Errors the user can act on

```php
match (true) {
    $e instanceof PostTooLargeException => __('That file is too large. The maximum is 10 MB.'),
    $e instanceof UnsupportedMediaType  => __('That file type is not supported. Upload a PDF, JPG or PNG.'),
    default                             => __('The upload failed. Please try again.'),
};
```

State the limit and the accepted formats **before** the upload (in the hint text), not only
in the error — see `laravel-ui-accessibility`.

Show progress for anything over a few hundred KB, with a `role="status"` live region so
screen-reader users know something is happening.
