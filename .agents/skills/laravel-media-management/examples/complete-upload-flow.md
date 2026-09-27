# End-to-end: avatar upload

Every layer, from the form to the CDN, with the reasoning for each decision.

## 1. The form

```blade
<form method="post" action="{{ route('profile.avatar.store') }}" enctype="multipart/form-data">
    @csrf

    <div class="field">
        <label for="avatar">{{ __('Profile photo') }}</label>

        {{-- State the constraints BEFORE the upload, not in the error --}}
        <p id="avatar-hint" class="field__hint">
            {{ __('JPG, PNG or WebP. Maximum 2 MB. At least 200 × 200 pixels.') }}
        </p>

        <input
            type="file"
            id="avatar"
            name="avatar"
            accept="image/jpeg,image/png,image/webp"
            aria-describedby="avatar-hint @error('avatar') avatar-error @enderror"
            @error('avatar') aria-invalid="true" @enderror
        >

        @error('avatar')
            <p id="avatar-error" class="field__error">
                <span class="sr-only">{{ __('Error:') }}</span>{{ $message }}
            </p>
        @enderror
    </div>

    <div class="field">
        <label for="avatar-alt">{{ __('Describe this photo') }}</label>
        <p id="avatar-alt-hint" class="field__hint">
            {{ __('For people using screen readers. For example: "Maria, smiling, wearing a blue shirt".') }}
        </p>
        <input type="text" id="avatar-alt" name="alt" maxlength="255" required
               aria-describedby="avatar-alt-hint">
    </div>

    <button type="submit">{{ __('Upload photo') }}</button>
</form>
```

`alt` is a **required form field**, not an optional afterthought. A nullable alt column
will be null.

## 2. Form Request

```php
final class StoreAvatarRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'avatar' => [
                'required',
                'file',
                'max:2048',                                          // KB
                'mimetypes:image/jpeg,image/png,image/webp',         // content sniffing
                'extensions:jpg,jpeg,png,webp',
                'dimensions:min_width=200,min_height=200,max_width=8000,max_height=8000',
            ],
            'alt' => ['required', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'avatar.max'        => __('The photo must be smaller than 2 MB.'),
            'avatar.mimetypes'  => __('Upload a JPG, PNG or WebP image.'),
            'avatar.dimensions' => __('The photo must be at least 200 × 200 pixels.'),
            'alt.required'      => __('Describe the photo so screen reader users know what it shows.'),
        ];
    }
}
```

`mimetypes` sniffs the actual content. `dimensions` caps decompression bombs — a 50KB PNG
declaring 60,000 × 60,000 pixels expands to ~14GB when decoded.

## 3. Route

```php
Route::post('/profile/avatar', StoreAvatarController::class)
    ->middleware(['auth', 'throttle:upload'])
    ->name('profile.avatar.store');
```

## 4. Controller — thin

```php
final class StoreAvatarController
{
    public function __invoke(StoreAvatarRequest $request, StoreAvatar $action): RedirectResponse
    {
        $action->handle($request->user(), $request->file('avatar'), $request->string('alt')->toString());

        return back()->with('status', __('Photo uploaded. It will appear shortly.'));
    }
}
```

"It will appear shortly" is accurate — derivatives are queued.

## 5. Action

```php
final class StoreAvatar
{
    public function handle(User $user, UploadedFile $file, string $alt): Media
    {
        $ulid = (string) Str::ulid();

        // Write the file BEFORE the transaction. A filesystem write cannot be
        // rolled back, and holding a DB transaction open across an S3 upload is
        // a lock-contention problem. If the transaction fails, the audit job
        // catches the orphan.
        $path = $file->storeAs(
            directory: sprintf('media/%s/%s/%s', now()->format('Y/m'), substr($ulid, 0, 2), $ulid),
            name: 'original.'.$this->extensionFor($file),
            options: ['disk' => 'private'],
        );

        return DB::transaction(function () use ($user, $file, $alt, $path, $ulid): Media {
            // One avatar per user — remove the previous, files included
            $user->media()->where('collection', 'avatar')->each->delete();

            $media = $user->media()->create([
                'ulid'          => $ulid,
                'collection'    => 'avatar',
                'disk'          => 'private',
                'path'          => $path,
                'original_name' => Str::limit($file->getClientOriginalName(), 200, ''),
                'mime_type'     => $file->getMimeType(),        // sniffed, not claimed
                'size_bytes'    => $file->getSize(),
                'checksum'      => hash_file('xxh128', $file->getRealPath()),
                'alt'           => $alt,
                'uploaded_by'   => $user->id,
                'tenant_id'     => $user->tenant_id,
            ]);

            // afterCommit — without it the worker can start before the row is visible
            ProcessMedia::dispatch($media->id)->afterCommit();

            return $media;
        });
    }

    /** Extension derived from the SNIFFED type, never from the client filename. */
    private function extensionFor(UploadedFile $file): string
    {
        return match ($file->getMimeType()) {
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
            default      => throw new UnsupportedMediaType($file->getMimeType()),
        };
    }
}
```

The stored path contains **no client-supplied string**. That closes path traversal
(`../../../public/shell.php`) completely.

## 6. Processing (queued)

`ProcessMedia` generates AVIF and WebP at 200/480 px (an avatar never needs 1920), applies
EXIF orientation then strips the metadata, records dimensions, and writes a placeholder.
See `templates/ProcessMedia.php.stub`.

Avatar-specific: `cover(400, 400)` rather than `scaleDown`, because avatars must be square.

## 7. Serving

Avatars on a public profile can be public. Avatars in a private workspace cannot.

```php
// Private: authorize, then let Nginx do the transfer
Route::get('/media/{media:ulid}/{size?}', function (Media $media, string $size = 'thumb') {
    Gate::authorize('view', $media);

    return response()->noContent()->withHeaders([
        'X-Accel-Redirect' => '/protected/'.$media->derivativePath($size, 'webp'),
        'Content-Type'     => 'image/webp',
        'Cache-Control'    => 'private, max-age=3600',
    ]);
})->middleware('auth')->name('media.show');
```

```nginx
location /protected/ {
    internal;                                  # unreachable except via X-Accel-Redirect
    alias /var/www/app/storage/app/private/;
}
```

Authorization in PHP, transfer at Nginx speed, and the `internal` directive means the path
cannot be requested directly.

## 8. Rendering

```blade
{{-- List view: small, lazy --}}
<x-media.image :media="$user->avatar" size="thumb" sizes="40px" class="avatar" />

{{-- Profile header: the LCP image on this page --}}
<x-media.image :media="$user->avatar" size="small" sizes="120px" priority class="avatar avatar--lg" />
```

```php
// Eager load, or a 20-row list costs 20 queries
$users = User::with('media')->paginate(20);
```

## 9. Cleanup

```php
// Old avatars: deleted on replace, in step 5
// Unattached uploads: pruned daily
Schedule::command('model:prune')->daily()->at('03:00');

// Integrity: report monthly, fix by hand
Schedule::command('media:audit')->monthly();
```

## 10. Tests

```php
it('stores an avatar privately with a generated filename', function (): void {
    Storage::fake('private');
    Queue::fake();

    $user = User::factory()->create();

    actingAs($user)
        ->post(route('profile.avatar.store'), [
            'avatar' => UploadedFile::fake()->image('my photo.jpg', 800, 800),
            'alt'    => 'Maria, smiling',
        ])
        ->assertRedirect();

    $media = $user->media()->sole();

    Storage::disk('private')->assertExists($media->path);
    expect($media->path)
        ->not->toContain('my photo')          // client name never used as a path
        ->and($media->alt)->toBe('Maria, smiling');

    Queue::assertPushed(ProcessMedia::class);
});

it('rejects a PHP file renamed to .jpg', function (): void {
    $file = UploadedFile::fake()->createWithContent('shell.jpg', '<?php system($_GET["c"]); ?>');

    actingAs(User::factory()->create())
        ->post(route('profile.avatar.store'), ['avatar' => $file, 'alt' => 'x'])
        ->assertSessionHasErrors('avatar');    // mimetypes sniffs content
});

it('requires alt text', function (): void {
    actingAs(User::factory()->create())
        ->post(route('profile.avatar.store'), [
            'avatar' => UploadedFile::fake()->image('a.jpg', 400, 400),
        ])
        ->assertSessionHasErrors('alt');
});

it('deletes the previous avatar and its files on replace', function (): void {
    Storage::fake('private');
    $user = User::factory()->create();
    $old = Media::factory()->for($user, 'attachable')->create(['collection' => 'avatar']);
    Storage::disk('private')->put($old->path, 'x');

    actingAs($user)->post(route('profile.avatar.store'), [
        'avatar' => UploadedFile::fake()->image('new.jpg', 400, 400),
        'alt'    => 'New photo',
    ]);

    expect(Media::find($old->id))->toBeNull();
    Storage::disk('private')->assertMissing($old->path);
});

it('denies access to another user\'s private media', function (): void {
    $media = Media::factory()->create();

    actingAs(User::factory()->create())
        ->get(route('media.show', $media))
        ->assertNotFound();
});
```

The disguised-PHP test and the cross-user access test are the two that matter most. Write
them the day you accept uploads.

## Decisions and why

| Decision | Reason |
|---|---|
| `mimetypes` not `mimes` | `mimes` trusts the extension |
| `dimensions` cap | Decompression bombs |
| Generated ULID filename | Path traversal, and no collisions |
| Private disk | Nothing uploaded is directly executable or fetchable |
| File written outside the transaction | Filesystem writes cannot roll back; audit catches orphans |
| `afterCommit()` | Job would otherwise race the commit |
| Queued derivatives | Seconds of CPU and hundreds of MB per image |
| EXIF stripped | GPS coordinates are PII |
| `orient()` before encoding | Otherwise portraits render sideways |
| AVIF + WebP + JPEG | ~50% smaller, with a universal fallback |
| `width`/`height` in the markup | Prevents layout shift |
| Required `alt` field | A nullable column will be null |
| `X-Accel-Redirect` | Authorization in PHP, transfer at Nginx speed |
| Prune + audit scheduled | Orphans are the usual cause of an unexpectedly full disk |
