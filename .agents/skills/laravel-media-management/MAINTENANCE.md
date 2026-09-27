# Maintaining `laravel-media-management`

## Review triggers

| Trigger | Action |
|---|---|
| A new image format reaches broad support (JPEG XL, next-gen AVIF) | Add to the format table and the derivative pipeline |
| Intervention Image major version | Update the API calls in the stubs — the v2→v3 API changed substantially |
| ImageMagick or Ghostscript CVE | Re-check the `policy.xml` recommendations in `references/image-processing.md` |
| Storage provider pricing changes | Update the comparison table in `references/storage-at-scale.md` |
| An orphan/disk-full incident | Add the specific check to `checklists/media-review.md` |
| Browser lazy-loading or `fetchpriority` behaviour changes | Update the rendering guidance |

Scheduled: every 6 months.

## The parts most likely to go stale

**1. Format support.** The AVIF/WebP recommendation is current, but the landscape moves.
Check Baseline/caniuse before promoting a format from "emerging" to "default". Never
promote on Chrome support alone — the floor is Safari.

**2. The byte-size comparison** in `references/image-processing.md` is explicitly marked as
varying by image content. **Keep that hedge.** Quoting a hard "50% smaller" figure invites
someone to promise it to a client.

**3. Provider pricing** in `references/storage-at-scale.md`. Relative positions are stable
(R2 egress-free, S3 egress expensive); absolute numbers are not. The table gives no
absolute prices deliberately — keep it that way.

**4. Intervention Image API.** The stubs use v3 syntax (`scaleDown`, `encodeByExtension`,
`orient`). A major version bump will break them silently — they are stubs, so nothing
compiles them in CI.

## What to update where

| Change | File |
|---|---|
| Validation rules | `references/upload-pipeline.md` + `checklists/media-review.md` |
| Processing, formats, quality | `references/image-processing.md` + `templates/ProcessMedia.php.stub` |
| Disks, sharding, CDN, cost | `references/storage-at-scale.md` |
| Orphans, retention, migration | `references/lifecycle.md` + `templates/Media.php.stub` |
| Rendering | `templates/responsive-image.blade.php` |

The derivative size list (`Media::SIZES`) appears in the model stub, the job stub, and
`references/image-processing.md`. Change all three together.

## Testing changes to this skill

1. Skill loads: `/laravel-media-management`
2. Prompt test — *"Let users upload a profile picture"* — verify the output uses
   `mimetypes`, a generated filename, a private disk, and a queued job, without being asked
3. Second prompt test — *"Show the product image on the listing page"* — verify it produces
   `<picture>` with `width`/`height`, `sizes`, and `loading="lazy"`
4. Third prompt test — *"Why is our disk full?"* — verify orphaned media is the first thing
   suggested
5. Stubs parse:

```bash
php -l .claude/skills/laravel-media-management/templates/Media.php.stub
php -l .claude/skills/laravel-media-management/templates/ProcessMedia.php.stub
```

6. The Blade component renders in a real project (copy to
   `resources/views/components/media/image.blade.php` and `php artisan view:cache`)

## Boundary discipline

Owns: upload pipeline, storage layout, derivative generation, formats, `srcset` construction,
EXIF, CDN delivery, media lifecycle and integrity.

Hand off:
- General input validation, OWASP defence, SSRF → `laravel-security` (this skill
  *implements* its upload rules; it does not restate them)
- `alt` text quality, `<picture>` semantics, processing-state announcements →
  `laravel-ui-accessibility`
- `sizes` breakpoints, layout → `laravel-responsive-design`
- Queue worker sizing, memory tuning → `laravel-performance`, `laravel-devops-deployment`
- Bucket provisioning, CDN configuration, backups → `laravel-devops-deployment`

**Shared areas that must stay consistent:**

| Topic | This skill says | Other skill says |
|---|---|---|
| Upload validation | The concrete rules (`mimetypes`, `dimensions`) | Why they matter as a security control (`laravel-security`) |
| `alt` attribute | Make it a required DB/validation field | What good alt text contains (`laravel-ui-accessibility`) |
| `sizes` attribute | How to build the srcset | What the breakpoints should be (`laravel-responsive-design`) |
| Lazy loading | `loading="lazy"`, not on the LCP | Same rule, framed as a Core Web Vitals budget (`laravel-performance`) |

Both halves of each row say the same thing from different angles. If you change one, change
the other in the same commit — contradictory advice across two skills is worse than a gap
in one.

## The rule this skill exists to enforce

Most media bugs come from one of three shortcuts:

1. **Trusting the filename** — extension validation, or using the client name as a path
2. **Doing it in the request** — image processing that should be queued
3. **Never cleaning up** — no orphan prune, no retention, until the disk fills

If a future edit makes any of those three easier to do accidentally, it is the wrong edit.

## Changelog

| Date | Change |
|---|---|
| 2026-07-31 | Initial version. Intervention Image v3, AVIF/WebP pipeline, ULID sharding, orphan lifecycle. |
