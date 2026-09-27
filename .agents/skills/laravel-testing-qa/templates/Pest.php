<?php

declare(strict_types=1);

/*
 * tests/Pest.php
 *
 * Bindings, global helpers, and custom expectations.
 */

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Dusk\Browser;

/*
|--------------------------------------------------------------------------
| Test case bindings
|--------------------------------------------------------------------------
*/

pest()->extend(Tests\TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature', 'Unit');

// Browser tests run in a separate process, so a transaction cannot span both.
pest()->extend(Tests\DuskTestCase::class)
    ->use(Illuminate\Foundation\Testing\DatabaseTruncation::class)
    ->in('Browser');

/*
|--------------------------------------------------------------------------
| Custom expectations
|--------------------------------------------------------------------------
*/

expect()->extend('toBeOneOf', function (array $values) {
    expect($this->value)->toBeIn($values);

    return $this;
});

expect()->extend('toBeIsoDate', function () {
    expect($this->value)->toMatch('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/');

    return $this;
});

expect()->extend('toBeUlid', function () {
    expect($this->value)->toMatch('/^[0-9A-HJKMNP-TV-Z]{26}$/');

    return $this;
});

/*
|--------------------------------------------------------------------------
| Performance helpers
|--------------------------------------------------------------------------
|
| These are what keep an N+1 fix fixed. An optimisation without an assertion
| regresses within three sprints.
*/

/** Assert a callback issues fewer than $max queries. */
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

    expect(count($queries))->toBeLessThan($max, sprintf(
        "Expected fewer than %d queries, got %d:\n%s",
        $max,
        count($queries),
        collect($queries)
            ->map(fn (array $q, int $i): string => sprintf('  %2d. %s', $i + 1, $q['query']))
            ->implode("\n"),
    ));

    return $result;
}

/**
 * The definitive N+1 test: query count must NOT grow with row count.
 *
 * Runs the callback against a small dataset, then a larger one, and fails if
 * the count increased.
 */
function assertNoNPlusOne(Closure $seed, Closure $callback, int $small = 2, int $large = 10): void
{
    $seed($small);

    DB::flushQueryLog();
    DB::enableQueryLog();
    $callback();
    $baseline = count(DB::getQueryLog());

    $seed($large - $small);

    DB::flushQueryLog();
    $callback();
    $scaled = count(DB::getQueryLog());
    DB::disableQueryLog();

    expect($scaled)->toBe($baseline, sprintf(
        'Query count grew with row count (%d rows: %d queries, %d rows: %d queries) — this is an N+1.',
        $small, $baseline, $large, $scaled,
    ));
}

/** Assert peak memory stays under a budget — for exports and imports. */
function assertMemoryUnder(int $megabytes, Closure $callback): mixed
{
    gc_collect_cycles();
    $before = memory_get_peak_usage(true);

    $result = $callback();

    $usedMb = (memory_get_peak_usage(true) - $before) / 1_048_576;

    expect($usedMb)->toBeLessThan($megabytes, sprintf(
        'Expected under %dMB, used %.1fMB.', $megabytes, $usedMb,
    ));

    return $result;
}

/*
|--------------------------------------------------------------------------
| Accessibility helpers
|--------------------------------------------------------------------------
|
| Markup assertions run in milliseconds and catch the most common regressions.
| They do NOT replace the manual keyboard and screen-reader passes.
*/

/** Every non-hidden input must have a <label for> pointing at its id. */
function assertAllInputsLabelled(string $html): void
{
    $dom = new DOMDocument();
    @$dom->loadHTML($html, LIBXML_NOERROR);
    $xpath = new DOMXPath($dom);

    foreach ($xpath->query('//input[not(@type="hidden")] | //select | //textarea') as $field) {
        $id = $field->getAttribute('id');
        $name = $field->getAttribute('name') ?: $field->nodeName;

        if ($field->hasAttribute('aria-label') || $field->hasAttribute('aria-labelledby')) {
            continue;
        }

        expect($id)->not->toBeEmpty("Field [{$name}] has no id, so it cannot be labelled");
        expect($xpath->query("//label[@for='{$id}']")->length)
            ->toBeGreaterThan(0, "Field #{$id} has no <label for>");
    }
}

/** Exactly one h1, and no skipped heading levels. */
function assertHeadingOrder(string $html): void
{
    $dom = new DOMDocument();
    @$dom->loadHTML($html, LIBXML_NOERROR);
    $xpath = new DOMXPath($dom);

    expect($xpath->query('//h1')->length)->toBe(1, 'A page must have exactly one <h1>');

    $previous = 0;

    foreach ($xpath->query('//h1|//h2|//h3|//h4|//h5|//h6') as $heading) {
        $level = (int) substr($heading->nodeName, 1);

        if ($previous > 0) {
            expect($level - $previous)->toBeLessThanOrEqual(1, sprintf(
                'Heading level jumped from h%d to h%d ("%s")',
                $previous, $level, trim($heading->textContent),
            ));
        }

        $previous = $level;
    }
}

/** Every <img> needs an alt attribute — empty is fine, missing is not. */
function assertAllImagesHaveAlt(string $html): void
{
    $dom = new DOMDocument();
    @$dom->loadHTML($html, LIBXML_NOERROR);

    foreach ((new DOMXPath($dom))->query('//img') as $img) {
        expect($img->hasAttribute('alt'))->toBeTrue(
            'Missing alt attribute on image: '.$img->getAttribute('src')
        );
    }
}

/** Run axe-core in a Dusk browser and assert zero violations. */
function assertNoAxeViolations(Browser $browser, array $tags = ['wcag2a', 'wcag2aa', 'wcag22aa']): void
{
    $browser->script(file_get_contents(base_path('node_modules/axe-core/axe.min.js')));

    $violations = $browser->script(sprintf(
        'return axe.run(document, { runOnly: %s }).then(r => r.violations);',
        json_encode($tags),
    ))[0];

    expect($violations)->toBeEmpty(
        collect($violations)
            ->map(fn (array $v): string => "  [{$v['impact']}] {$v['id']}: {$v['help']}")
            ->implode("\n")
    );
}

/*
|--------------------------------------------------------------------------
| Domain helpers
|--------------------------------------------------------------------------
*/

function actingAsAdmin(?Tenant $tenant = null): Tests\TestCase
{
    $tenant ??= Tenant::factory()->create();

    return test()->actingAs(User::factory()->for($tenant)->admin()->create());
}

function actingAsMember(?Tenant $tenant = null): Tests\TestCase
{
    $tenant ??= Tenant::factory()->create();

    return test()->actingAs(User::factory()->for($tenant)->create());
}
