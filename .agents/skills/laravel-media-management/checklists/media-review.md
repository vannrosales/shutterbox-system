# Media review — pre-merge gate

For any change that accepts, stores, processes, or renders user-supplied files.

## Validation

- [ ] `mimetypes:` used (content sniffing), **not** `mimes:` (extension only)
- [ ] `extensions:` also constrains the stored extension
- [ ] `max:` size limit set
- [ ] `dimensions:` caps set for images (decompression bombs)
- [ ] SVG uploads either rejected or sanitised with a dedicated sanitiser
- [ ] Limits consistent across validation, `php.ini`, and the web server
      (web server ≥ `post_max_size` ≥ `upload_max_filesize` ≥ validation `max:`)
- [ ] `alt` is a **required** field for images, not nullable-and-forgotten
- [ ] Upload endpoint is rate limited

## Storage

- [ ] Filename is generated (ULID), never `getClientOriginalName()`
- [ ] Extension derived from the sniffed MIME type, not the client filename
- [ ] Stored on a **private** disk, outside the web root
- [ ] Directory sharded by date and ULID prefix — not one flat directory
- [ ] One directory per media item, so deletion cannot orphan a derivative
- [ ] Original filename kept as metadata for display only
- [ ] Checksum recorded (deduplication + integrity audit)
- [ ] `'throw' => true` on the disk config

## Two-step uploads

- [ ] `attachable_id` is nullable so orphans are representable and findable
- [ ] Attachment validation scopes by `uploaded_by = auth()->id()` **and**
      `whereNull('attachable_id')` — otherwise a user can attach someone else's file
- [ ] Unattached rows pruned after a sensible window (24h, not 1h)

## Processing

- [ ] Derivative generation is **queued**, never inline
- [ ] Dispatched with `->afterCommit()`
- [ ] Job is idempotent (checks `processed_at` unless forced)
- [ ] `$tries`, `$timeout`, `$backoff` set
- [ ] `uniqueId()` set so duplicate dispatches collapse
- [ ] Runs on a dedicated `media` queue
- [ ] Memory limit raised deliberately, and restored in `finally`
- [ ] Never upscales — skips sizes larger than the source
- [ ] `orient()` applied **before** encoding
- [ ] EXIF stripped from every derivative
- [ ] Failure recorded (`failed_at`) and logged
- [ ] Only generates sizes that some `sizes` attribute actually requests

## Formats and delivery

- [ ] AVIF and WebP generated, with a JPEG/PNG fallback
- [ ] Quality values appropriate per format (AVIF uses a different scale)
- [ ] `<picture>` with `type` on each `<source>`
- [ ] `srcset` includes only generated sizes
- [ ] `sizes` matches the real rendered width at each breakpoint
- [ ] `width` and `height` on every `<img>` (CLS)
- [ ] `loading="lazy"` below the fold — **not** on the LCP image
- [ ] `fetchpriority="high"` on the LCP image
- [ ] Cache headers `public, max-age=31536000, immutable` on derivatives
- [ ] Replacing a file writes a new ULID rather than overwriting

## Access control

- [ ] Private media served via an authorizing controller or a short-lived signed URL
- [ ] Policy check on media access (cross-user returns 404)
- [ ] Signed URL expiry is short (minutes, not days)
- [ ] `X-Accel-Redirect` / `X-Sendfile` used for large files, with `internal` on the
      Nginx location
- [ ] Presigned direct-to-S3 uploads are verified server-side after the fact
- [ ] Upload directory cannot execute scripts

## Rendering states

- [ ] Processed → full `<picture>`
- [ ] Failed → falls back to the original
- [ ] Still processing → `role="status"` with text, and reserved space
- [ ] Decorative images use `alt=""`, never a missing `alt`
- [ ] Media eager loaded in list views (`->with('media')`)

## Lifecycle

- [ ] Files deleted when the row is force-deleted
- [ ] Files **not** deleted on soft delete
- [ ] Parent deletion cascades to media
- [ ] Deduplication (if used) is reference-counted or scoped per tenant
- [ ] `model:prune` scheduled and verified running
- [ ] `media:audit` scheduled as a **report** — never `--fix` unattended
- [ ] Retention policy defined for every media collection
- [ ] Personal data in media covered by the anonymisation path

## Storage operations

- [ ] Growth rate tracked, not just total size
- [ ] Alerts on: unprocessed backlog, failure count, orphan count, quota
- [ ] Bucket versioning enabled
- [ ] Lifecycle rules transition **originals** only (derivatives stay hot)
- [ ] Backup/restore tested

## Tests

- [ ] Upload stores privately with a generated filename
- [ ] **A PHP file renamed to `.jpg` is rejected**
- [ ] `alt` is required
- [ ] Cross-user media access returns 404
- [ ] Files deleted on force delete
- [ ] Orphans pruned
- [ ] Processing job queued, not run inline

## Handoffs

- [ ] Validation and access control reviewed → `laravel-security`
- [ ] `alt` quality and `<picture>` semantics → `laravel-ui-accessibility`
- [ ] `sizes` breakpoints match the layout → `laravel-responsive-design`
- [ ] Queue capacity for the processing load → `laravel-performance`
- [ ] CDN and storage infrastructure → `laravel-devops-deployment`
