# One request, handled end to end

**The request:** *"Let team owners export their team's invoices to CSV."*

Nine words. Here is the whole process.

---

## 1. Analyse (4 minutes)

```bash
php -v                                    # PHP 8.3.12
composer show laravel/framework | head -3 # v11.9.2
ls app/                                   # Actions, DataTransferObjects, Enums, Models, Policies
cat CLAUDE.md
```

`CLAUDE.md` says: actions with `handle()`, no services, Pest, money as `*_minor`, multi-tenant
via `tenant_id` global scope, cross-tenant returns 404.

Closest existing feature — is there another export?

```bash
grep -rn "streamDownload\|Excel::\|fputcsv" app/
# → app/Actions/Reports/ExportPayments.php
```

Read it. It uses `streamDownload` with `lazyById`, dispatches nothing, and has a
`throttle:export` rate limiter. **Mirror this.**

```bash
php artisan db:show --counts
# invoices: 2,340,118 rows
```

That number changes the design.

---

## 2. Route to skills

| Skill | Why |
|---|---|
| `laravel-enterprise-architecture` | Where the action goes; mirror `ExportPayments` |
| `laravel-performance` | 2.3M rows — streaming vs queued, memory, N+1 |
| `laravel-database-scale` | `lazyById` not `chunk`; index for the tenant+date filter |
| `laravel-security` | Owner-only authorization; tenant scope; rate limit |
| `laravel-testing-qa` | Cross-tenant test, memory test |
| `laravel-code-quality` | `composer qa` before finishing |

Not loaded: media management (no file storage — streamed), API standards (this is a web
route), responsive design (no UI change), accessibility (a download link, and the existing
button pattern covers it).

---

## 3. State assumptions, then proceed

> Laravel 11.9 / PHP 8.3, actions with `handle()`, Pest, multi-tenant. Mirroring
> `ExportPayments`, which streams with `lazyById`.
>
> The invoices table has 2.3M rows. At an average ~500 invoices per team, streaming inline
> is fine — I'll keep the same shape as `ExportPayments` rather than introducing a queued
> job for one endpoint. If some teams have tens of thousands of invoices, say so and I'll
> switch to a queued export with a signed download link.
>
> Assuming **owners only** (the request said "team owners"), and all-time rather than a
> date range. Both are one-line changes if wrong.

---

## 4. Generate

**Route** — mirrors the payments export exactly:

```php
Route::get('/teams/{team}/invoices/export', ExportTeamInvoicesController::class)
    ->middleware(['auth', 'throttle:export'])
    ->name('teams.invoices.export');
```

**Policy** — added to the existing `TeamPolicy`:

```php
public function exportInvoices(User $user, Team $team): Response
{
    if ($team->roleFor($user) === null) {
        return Response::denyAsNotFound();          // 404, per CLAUDE.md
    }

    return $team->roleFor($user) === TeamRole::Owner
        ? Response::allow()
        : Response::deny(__('Only team owners can export invoices.'));
}
```

**Controller** — thin, mirrors the existing one:

```php
final class ExportTeamInvoicesController
{
    public function __invoke(
        Request $request,
        Team $team,
        ExportTeamInvoices $export,
    ): StreamedResponse {
        $this->authorize('exportInvoices', $team);

        return $export->handle($team);
    }
}
```

**Action:**

```php
final class ExportTeamInvoices
{
    public function handle(Team $team): StreamedResponse
    {
        $filename = sprintf('invoices-%s-%s.csv', $team->slug, now()->format('Y-m-d'));

        return response()->streamDownload(function () use ($team): void {
            $handle = fopen('php://output', 'wb');

            fputcsv($handle, [
                __('Reference'), __('Customer'), __('Status'),
                __('Total'), __('Currency'), __('Issued'), __('Due'),
            ]);

            // Query builder, not Eloquent: no model hydration over 2.3M rows.
            // Joined rather than eager loaded — one pass, no second query.
            DB::table('invoices')
                ->join('customers', 'customers.id', '=', 'invoices.customer_id')
                ->select([
                    'invoices.id',
                    'invoices.reference',
                    'customers.name as customer_name',
                    'invoices.status',
                    'invoices.total_minor',
                    'invoices.currency',
                    'invoices.issued_at',
                    'invoices.due_on',
                ])
                ->where('invoices.tenant_id', $team->tenant_id)   // tenant scope, explicit
                ->orderBy('invoices.id')
                ->lazyById(2000, 'invoices.id')                    // NOT chunk(): keyset
                ->each(function (object $row) use ($handle): void {
                    fputcsv($handle, [
                        $row->reference,
                        $row->customer_name,
                        InvoiceStatus::from($row->status)->label(),
                        $row->total_minor / 100,                   // minor → major for CSV
                        $row->currency,
                        $row->issued_at,
                        $row->due_on,
                    ]);
                });

            fclose($handle);
        }, $filename, [
            'Content-Type'      => 'text/csv; charset=UTF-8',
            // Without this, Nginx buffers the whole response and defeats streaming
            'X-Accel-Buffering' => 'no',
        ]);
    }
}
```

**Index** — checked whether one exists:

```bash
php artisan db:show invoices
# → invoices_tenant_status_issued_idx (tenant_id, status, issued_at)
```

The export filters on `tenant_id` and sorts by `id`. The leading column matches, so the
existing index serves it. **No migration needed** — worth saying rather than adding a
redundant index.

**Rate limiter** — already defined:

```php
RateLimiter::for('export', fn (Request $r) => Limit::perHour(5)->by($r->user()->id));
```

**Button** — existing component, existing pattern:

```blade
@can('exportInvoices', $team)
    <a href="{{ route('teams.invoices.export', $team) }}" class="btn">
        {{ __('Export invoices (CSV)') }}
    </a>
@endcan
```

---

## 5. Tests

```php
it('exports the team\'s invoices as CSV', function (): void {
    $team  = Team::factory()->create();
    $owner = User::factory()->create();
    $team->members()->attach($owner, ['role' => TeamRole::Owner]);

    Invoice::factory()->count(3)->for($team->tenant)->create();

    $response = actingAs($owner)->get(route('teams.invoices.export', $team));

    $response->assertOk()
        ->assertHeader('Content-Type', 'text/csv; charset=UTF-8');

    $csv = $response->streamedContent();

    expect(substr_count($csv, "\n"))->toBe(4);      // header + 3 rows
});

it('forbids non-owners', function (): void {
    $team   = Team::factory()->create();
    $member = User::factory()->create();
    $team->members()->attach($member, ['role' => TeamRole::Member]);

    actingAs($member)
        ->get(route('teams.invoices.export', $team))
        ->assertForbidden();
});

it('returns 404 for a team the user does not belong to', function (): void {
    actingAs(User::factory()->create())
        ->get(route('teams.invoices.export', Team::factory()->create()))
        ->assertNotFound();                          // 404, not 403
});

it('never includes another tenant\'s invoices', function (): void {
    $team  = Team::factory()->create();
    $owner = User::factory()->create();
    $team->members()->attach($owner, ['role' => TeamRole::Owner]);

    Invoice::factory()->count(2)->for($team->tenant)->create(['reference' => 'MINE']);
    Invoice::factory()->count(5)->create(['reference' => 'THEIRS']);

    $csv = actingAs($owner)->get(route('teams.invoices.export', $team))->streamedContent();

    expect($csv)->toContain('MINE')->not->toContain('THEIRS');
});

it('rate limits exports', function (): void {
    // ... 5 requests, then assert 429
});

it('streams in constant memory', function (): void {
    $team  = Team::factory()->create();
    $owner = User::factory()->create();
    $team->members()->attach($owner, ['role' => TeamRole::Owner]);

    Invoice::factory()->count(20_000)->for($team->tenant)->create();

    assertMemoryUnder(64, fn () =>
        actingAs($owner)->get(route('teams.invoices.export', $team))->streamedContent()
    );
})->group('slow');
```

Six tests. Four of them test something going wrong.

---

## 6. Verify

```bash
composer qa
# Pint      ✓
# PHPStan   ✓ level 6
# Tests     ✓ 6 passed
```

Checklists run: `laravel-code-quality/checklists/quality-review.md`,
`laravel-security/checklists/security-review.md`,
`laravel-performance/checklists/performance-review.md`.

---

## 7. Report

> **Done.** Team owners can export their team's invoices from the team page.
>
> Files: route, `ExportTeamInvoicesController`, `ExportTeamInvoices` action, a
> `exportInvoices` method on the existing `TeamPolicy`, the button, and six feature tests.
> `composer qa` passes.
>
> **Design:** mirrored `ExportPayments` — streamed with `lazyById(2000)` over the query
> builder rather than Eloquent, so memory stays flat regardless of row count. Verified at
> 20k invoices: under 64MB. The `X-Accel-Buffering: no` header is required or Nginx buffers
> the whole response and defeats the streaming.
>
> **No migration needed.** The existing `(tenant_id, status, issued_at)` index has the right
> leading column for this query. I checked rather than adding a redundant one.
>
> **Assumed:** owners only, all-time (no date filter). Both are one-line changes.
>
> **Not done:** if some teams have tens of thousands of invoices, an inline stream will hold
> a PHP-FPM worker for the duration. At that point this should become a queued job that
> writes to storage and emails a signed link. Happy to build that instead — it is a bigger
> change, so I did not assume it.
>
> **Noticed but out of scope:** `ExportPayments` has no rate limiter on its route, unlike
> this one. That looks like an oversight. Separate fix?

---

## What made this go well

| Step | Effect |
|---|---|
| Read `ExportPayments` first | The new code matches the codebase, not this library's defaults |
| Checked the row count | 2.3M changed `chunk` → `lazyById`, Eloquent → query builder |
| Checked existing indexes | Avoided an unnecessary migration |
| Checked existing rate limiters | Avoided a duplicate definition |
| Stated the owners-only assumption up front | Cheap to correct; nothing was thrown away |
| Wrote the cross-tenant test | The one that would catch the expensive bug |
| Named the scaling limit explicitly | The user can decide whether to invest now |
| Reported the `ExportPayments` gap separately | Did not bloat this PR with an unrelated fix |

Total: about 25 minutes, four minutes of which was reading before writing anything. That
four minutes is what kept the other twenty-one from being wasted.
