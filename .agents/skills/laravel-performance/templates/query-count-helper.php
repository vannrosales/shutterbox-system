<?php

declare(strict_types=1);

/*
 * Query-count assertions for Pest / PHPUnit.
 *
 * Add the helpers to tests/Pest.php (Pest) or a base TestCase trait (PHPUnit).
 *
 * These are the tests that keep an N+1 fix fixed. An optimisation without an
 * assertion regresses within three sprints.
 */

use Illuminate\Support\Facades\DB;

/**
 * Assert that a callback issues fewer than $max queries.
 *
 * @throws Throwable
 */
function assertQueryCountUnder(int $max, Closure $callback): mixed
{
    DB::flushQueryLog();
    DB::enableQueryLog();

    try {
        $result = $callback();
    } finally {
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
    }

    $count = count($queries);

    expect($count)->toBeLessThan($max, sprintf(
        "Expected fewer than %d queries, got %d:\n%s",
        $max,
        $count,
        collect($queries)
            ->map(fn (array $q, int $i): string => sprintf('  %2d. %s', $i + 1, $q['query']))
            ->implode("\n"),
    ));

    return $result;
}

/** Assert an exact query count — use where the number is part of the contract. */
function assertQueryCount(int $expected, Closure $callback): mixed
{
    DB::flushQueryLog();
    DB::enableQueryLog();

    try {
        $result = $callback();
    } finally {
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
    }

    expect($queries)->toHaveCount($expected, sprintf(
        "Expected exactly %d queries, got %d:\n%s",
        $expected,
        count($queries),
        collect($queries)->pluck('query')->implode("\n"),
    ));

    return $result;
}

/**
 * The definitive N+1 test: query count must NOT grow with row count.
 *
 * Runs the callback twice — once with a small dataset, once with a larger one —
 * and fails if the query count increased.
 */
function assertNoNPlusOne(Closure $seed, Closure $callback, int $small = 2, int $large = 10): void
{
    $seed($small);

    DB::flushQueryLog();
    DB::enableQueryLog();
    $callback();
    $baseline = count(DB::getQueryLog());
    DB::disableQueryLog();

    $seed($large - $small);

    DB::flushQueryLog();
    DB::enableQueryLog();
    $callback();
    $scaled = count(DB::getQueryLog());
    DB::disableQueryLog();

    expect($scaled)->toBe($baseline, sprintf(
        'Query count grew with row count (%d rows: %d queries, %d rows: %d queries) — this is an N+1.',
        $small,
        $baseline,
        $large,
        $scaled,
    ));
}

/** Assert a callback completes within a wall-clock budget. */
function assertFasterThan(int $milliseconds, Closure $callback): mixed
{
    $start = hrtime(true);
    $result = $callback();
    $elapsed = (hrtime(true) - $start) / 1_000_000;

    expect($elapsed)->toBeLessThan(
        $milliseconds,
        sprintf('Expected under %dms, took %.2fms.', $milliseconds, $elapsed),
    );

    return $result;
}

/** Assert peak memory stays under a budget — for exports and imports. */
function assertMemoryUnder(int $megabytes, Closure $callback): mixed
{
    gc_collect_cycles();
    $before = memory_get_peak_usage(true);

    $result = $callback();

    $usedMb = (memory_get_peak_usage(true) - $before) / 1_048_576;

    expect($usedMb)->toBeLessThan(
        $megabytes,
        sprintf('Expected under %dMB, used %.1fMB.', $megabytes, $usedMb),
    );

    return $result;
}

/*
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 * it('lists invoices without an N+1', function (): void {
 *     $user = User::factory()->create();
 *
 *     assertNoNPlusOne(
 *         seed:     fn (int $n) => Invoice::factory()->count($n)->for($user->tenant)->create(),
 *         callback: fn () => $this->actingAs($user)->get('/invoices')->assertOk(),
 *     );
 * });
 *
 * it('renders the dashboard within budget', function (): void {
 *     Invoice::factory()->count(200)->create();
 *
 *     assertQueryCountUnder(15, fn () => $this->actingAs($user)->get('/dashboard')->assertOk());
 * });
 *
 * it('streams a large export in constant memory', function (): void {
 *     Order::factory()->count(20_000)->create();
 *
 *     assertMemoryUnder(64, fn () => (new StreamOrdersCsv)->handle($filters));
 * });
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
