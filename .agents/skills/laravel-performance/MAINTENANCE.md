# Maintaining `laravel-performance`

## Review triggers

| Trigger | Action |
|---|---|
| New Laravel release | Check for new first-party primitives (`Cache::flexible`, `defer`, `lazyById` were all recent additions) |
| A performance incident in production | Add the specific check to `checklists/performance-review.md` |
| Budgets consistently missed or trivially met | Re-tune the numbers in `SKILL.md` and `references/frontend.md` |
| Core Web Vitals thresholds change (Google) | Update the budget table — INP replaced FID in 2024; expect more churn |
| New profiling tool becomes standard | Update `references/profiling.md` |
| Octane / FrankenPHP maturity shifts | Revisit the "when it fits" guidance |

Scheduled: every 6 months.

## Keeping the budgets honest

The budget table in `SKILL.md` is the part most likely to rot. Two failure modes:

1. **Too lenient** — everything passes, so nobody thinks about it.
2. **Too strict** — nothing passes, so everyone ignores it.

Calibrate against real field data from projects using the library:

```sql
SELECT
    metric,
    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value), 0) AS p75
FROM web_vitals
WHERE recorded_at > NOW() - INTERVAL '30 days'
GROUP BY metric;
```

If p75 LCP across projects is 1.8s, a 2.5s budget is not driving anything — tighten it.
If it is 4s, find out why before loosening.

## What to update where

| Change | File |
|---|---|
| Query technique | `references/queries.md` |
| Caching pattern or store | `references/caching.md` |
| Queue configuration | `references/queues.md` |
| Bundle/vitals budgets | `SKILL.md` table + `references/frontend.md` |
| Export/import at scale | `references/large-datasets.md` |
| Tooling | `references/profiling.md` |
| Guardrail code | `templates/PerformanceServiceProvider.php.stub` |
| Test helpers | `templates/query-count-helper.php` |
| New blocking rule | `checklists/performance-review.md` |

## Testing changes to this skill

1. Skill loads: `/laravel-performance`
2. Prompt test — *"Show the last 50 orders with their customer and item count"* — verify
   the output uses `with()` + `withCount()` without being asked
3. Second prompt test — *"Export all orders to CSV"* — verify it streams or queues rather
   than calling `get()`
4. Templates are valid:

```bash
php -l .claude/skills/laravel-performance/templates/query-count-helper.php
php -l .claude/skills/laravel-performance/templates/PerformanceServiceProvider.php.stub
node --check .claude/skills/laravel-performance/templates/k6-load-test.js
```

(The `.stub` needs the placeholder namespace intact; `php -l` still parses it.)

5. Referenced paths exist:

```powershell
Select-String -Path .\SKILL.md -Pattern '`([a-z]+/[a-z0-9\-\.]+)`' -AllMatches |
    ForEach-Object { $_.Matches.Groups[1].Value } | Sort-Object -Unique |
    Where-Object { -not (Test-Path $_) }
```

## Boundary discipline

Owns: query efficiency, caching strategy, queue offloading, memory, asset delivery,
runtime budgets, profiling.

Hand off:
- Schema, index selection, partitioning, archival → `laravel-database-scale`
- Image derivatives, formats, CDN storage layout → `laravel-media-management`
- Server/worker/PHP-FPM configuration, OPcache settings → `laravel-devops-deployment`
- Where code lives → `laravel-enterprise-architecture`
- Input caps as abuse controls → `laravel-security`

**The boundary most likely to blur:** indexes. This skill says "check the plan, add the
index the query needs"; `laravel-database-scale` owns *how to choose* indexes, composite
column order, cardinality, and covering indexes. Keep the how-to-choose material there —
duplicating it here guarantees the two drift.

Second blurry boundary: input limits (`per_page` caps, array `max:`). They appear in this
skill's checklist as performance controls and in `laravel-security` as abuse controls.
That duplication is deliberate and safe because both say the same thing — if you change
the guidance, change both.

## Changelog

| Date | Change |
|---|---|
| 2026-07-31 | Initial version. Laravel 12 primitives: `Cache::flexible`, `defer()`, `lazyById`, Pulse. |
