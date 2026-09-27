<?php

declare(strict_types=1);

use Rector\Config\RectorConfig;
use Rector\DeadCode\Rector\ClassMethod\RemoveUnusedPrivateMethodRector;
use RectorLaravel\Set\LaravelSetList;

/*
|--------------------------------------------------------------------------
| Rector
|--------------------------------------------------------------------------
|
| ALWAYS dry-run first, and actually read the diff:
|
|     vendor/bin/rector process --dry-run
|     vendor/bin/rector process
|     php artisan test && vendor/bin/pint && vendor/bin/phpstan analyse
|
| ONE rule set per commit. A PR mixing dead-code removal, type declarations,
| and a PHP upgrade is unreviewable — and when something breaks you cannot
| bisect which rule did it.
|
|     composer require --dev rector/rector driftingly/rector-laravel
*/

return RectorConfig::configure()
    ->withPaths([
        __DIR__.'/app',
        __DIR__.'/database/factories',
        __DIR__.'/database/seeders',
        __DIR__.'/routes',
        __DIR__.'/tests',
    ])

    // Run this ONLY after the runtime is actually on 8.4. Rector will happily
    // emit syntax the current PHP cannot parse.
    ->withPhpSets(php84: true)

    ->withSets([
        LaravelSetList::LARAVEL_120,

        // Framework idioms: ->has() && ->get() becomes ->filled(),
        // where('id', $id)->first() becomes find($id), etc.
        LaravelSetList::LARAVEL_CODE_QUALITY,

        // LaravelSetList::LARAVEL_IF_HELPERS,
        // LaravelSetList::LARAVEL_COLLECTION_MAPPING,
    ])

    ->withPreparedSets(
        deadCode: true,
        codeQuality: true,

        // The set that pays off most: does most of the work of moving from
        // PHPStan level 5 to level 6.
        typeDeclarations: true,

        privatization: true,
        earlyReturn: true,

        // naming: true  — produces enormous diffs and renames things you may
        // have named deliberately. Try it on ONE directory before adopting.
    )

    ->withSkip([
        __DIR__.'/app/Legacy',

        // Old migrations have already run. "Improving" them changes nothing in
        // production and risks breaking migrate:fresh for a new developer.
        __DIR__.'/database/migrations',

        __DIR__.'/bootstrap/cache',
        __DIR__.'/storage',

        // ── Rules Rector cannot reason about correctly here ──────────────────

        // Static analysis cannot see methods referenced by string in routes,
        // config arrays, Blade templates, or dynamic calls.
        RemoveUnusedPrivateMethodRector::class => [
            __DIR__.'/app/Http/Controllers/WebhookController.php',
            __DIR__.'/app/Support/Macros.php',
        ],

        // Sometimes an explicit if/else reads better than the "simplified" form.
        // \Rector\CodeQuality\Rector\If_\SimplifyIfReturnBoolRector::class,
    ])

    ->withCache(__DIR__.'/.rector.cache')   // add to .gitignore
    ->withParallel();

/*
|--------------------------------------------------------------------------
| Upgrade playbook — order matters
|--------------------------------------------------------------------------
|
| Moving PHP 8.1 / Laravel 10 → PHP 8.4 / Laravel 12:
|
|   1. Green baseline
|        php artisan test && vendor/bin/phpstan analyse
|
|   2. Framework first, ONE major at a time
|        composer require laravel/framework:^11.0 -W
|        # withSets([LaravelSetList::LARAVEL_110]) → dry-run → review → apply → test → commit
|
|   3. Then Laravel 12
|        composer require laravel/framework:^12.0 -W
|        # LARAVEL_120, same cycle
|
|   4. THEN the PHP version — only after the runtime is upgraded
|        ->withPhpSets(php84: true)
|
|   5. Quality sets last, one commit each
|        deadCode → typeDeclarations → codeQuality
|
|   6. Raise the PHPStan level now that types exist
|
| Rector handles a large part of a major upgrade, not all of it. It does NOT
| do Laravel 11's skeleton restructure (Kernel.php → bootstrap/app.php) — that
| needs the official upgrade guide plus manual work.
|
|--------------------------------------------------------------------------
| CI — dry-run ONLY
|--------------------------------------------------------------------------
|
|   - name: Rector (dry run)
|     run: vendor/bin/rector process --dry-run
|
| Never let CI rewrite code automatically. An unreviewed Rector commit on main
| is exactly what the dry-run discipline exists to prevent.
|
| Treating it as a warning rather than a hard failure is reasonable — it
| surfaces drift without blocking a PR on a stylistic suggestion.
*/
