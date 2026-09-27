# Specialist tests

Correctness tests are necessary. These four categories catch what they miss.

---

## Security regression tests

The highest-value tests in the suite. Each one prevents a class of vulnerability from
shipping twice.

### Authorization — one per tenant-scoped resource

```php
it('returns 404 for another tenant\'s invoice', function (): void {
    $theirs = Invoice::factory()->create();        // factory defaults to a NEW tenant

    actingAs($this->user)
        ->getJson(route('api.v1.invoices.show', $theirs))
        ->assertNotFound();                         // 404, NOT 403 — no existence disclosure
});

it('lists only the current tenant\'s invoices', function (): void {
    Invoice::factory()->count(3)->for($this->tenant)->create();
    Invoice::factory()->count(5)->create();

    actingAs($this->user)->getJson('/api/v1/invoices')->assertJsonCount(3, 'data');
});
```

Write both for every tenant-scoped resource. They are three lines each and they catch the
most common serious bug in multi-tenant Laravel applications.

### Mass assignment

```php
it('cannot escalate privileges through mass assignment', function (): void {
    actingAs($this->user)
        ->patchJson(route('api.v1.profile.update'), [
            'name'      => 'New name',
            'is_admin'  => true,
            'tenant_id' => 999,
        ])
        ->assertOk();

    expect($this->user->fresh())
        ->is_admin->toBeFalse()
        ->and($this->user->fresh()->tenant_id)->toBe($this->tenant->id);
});
```

### Injection

```php
it('rejects an unknown sort column', function (): void {
    actingAs($this->user)
        ->getJson('/api/v1/invoices?sort=(SELECT+password+FROM+users)')
        ->assertUnprocessable();
});

it('escapes user content in HTML output', function (): void {
    $post = Post::factory()->create(['title' => '<script>alert(1)</script>']);

    actingAs($this->user)
        ->get(route('posts.show', $post))
        ->assertSee('&lt;script&gt;', escape: false)
        ->assertDontSee('<script>alert(1)</script>', escape: false);
});
```

### Uploads

```php
it('rejects a PHP file renamed to .jpg', function (): void {
    $file = UploadedFile::fake()->createWithContent('shell.jpg', '<?php system($_GET["c"]); ?>');

    actingAs($this->user)
        ->post(route('media.store'), ['file' => $file, 'alt' => 'x'])
        ->assertSessionHasErrors('file');            // mimetypes: sniffs content
});

it('never uses the client filename as a path', function (): void {
    Storage::fake('private');

    actingAs($this->user)->post(route('media.store'), [
        'file' => UploadedFile::fake()->image('../../evil.jpg'),
        'alt'  => 'x',
    ]);

    expect(Media::sole()->path)->not->toContain('evil')->not->toContain('..');
});
```

### Rate limiting

```php
it('rate limits login attempts', function (): void {
    $user = User::factory()->create();

    foreach (range(1, 5) as $_) {
        post(route('login'), ['email' => $user->email, 'password' => 'wrong']);
    }

    post(route('login'), ['email' => $user->email, 'password' => 'wrong'])
        ->assertStatus(429);
});
```

### Data exposure

```php
it('never exposes internal fields', function (): void {
    actingAs($this->viewer)
        ->getJson(route('api.v1.invoices.show', $this->invoice))
        ->assertJsonMissingPath('data.internal_notes')
        ->assertJsonMissingPath('data.cost_price')
        ->assertJsonMissingPath('data.tenant_id');
});
```

This one fails the moment someone adds a sensitive field to a Resource without thinking.
One per resource.

### Headers

```php
it('sends security headers with a unique CSP nonce', function (): void {
    $a = $this->get('/');
    $b = $this->get('/');

    $a->assertHeader('X-Content-Type-Options', 'nosniff')
      ->assertHeader('X-Frame-Options', 'DENY');

    expect($a->headers->get('Content-Security-Policy'))
        ->not->toBe($b->headers->get('Content-Security-Policy'))   // nonce differs
        ->not->toContain("'unsafe-inline'");
});
```

---

## Performance regression tests

```php
// tests/Pest.php
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
        "Expected under %d queries, got %d:\n%s",
        $max, count($queries), collect($queries)->pluck('query')->implode("\n"),
    ));

    return $result;
}
```

```php
it('lists invoices without an N+1', function (): void {
    Invoice::factory()->count(50)->for($this->tenant)->hasLines(3)->create();

    assertQueryCountUnder(10, fn () =>
        actingAs($this->user)->get('/invoices')->assertOk()
    );
});
```

The definitive version — query count must not **grow** with row count:

```php
function assertNoNPlusOne(Closure $seed, Closure $callback, int $small = 2, int $large = 10): void
{
    $seed($small);
    DB::flushQueryLog(); DB::enableQueryLog();
    $callback();
    $baseline = count(DB::getQueryLog());

    $seed($large - $small);
    DB::flushQueryLog();
    $callback();
    $scaled = count(DB::getQueryLog());
    DB::disableQueryLog();

    expect($scaled)->toBe($baseline,
        "Query count grew with row count ({$baseline} → {$scaled}) — this is an N+1.");
}
```

```php
it('does not N+1 on the invoice list', function (): void {
    assertNoNPlusOne(
        seed:     fn (int $n) => Invoice::factory()->count($n)->for($this->tenant)->create(),
        callback: fn () => actingAs($this->user)->get('/invoices')->assertOk(),
    );
});
```

Add one to every list, index, and export endpoint. An optimisation without an assertion
regresses within three sprints.

Memory, for exports:

```php
it('exports in constant memory', function (): void {
    Order::factory()->count(20_000)->create();

    gc_collect_cycles();
    $before = memory_get_peak_usage(true);

    (new StreamOrdersCsv)->handle($filters);

    expect((memory_get_peak_usage(true) - $before) / 1_048_576)->toBeLessThan(64);
});
```

---

## Accessibility tests

Automated tooling catches roughly a third of WCAG issues. Automate that third; the rest
needs a keyboard and a screen reader (`laravel-ui-accessibility`).

### Markup assertions — fast, no browser

```php
it('labels every input on the registration form', function (): void {
    $html = $this->get('/register')->getContent();

    $dom = new DOMDocument();
    @$dom->loadHTML($html);
    $xpath = new DOMXPath($dom);

    foreach ($xpath->query('//input[not(@type="hidden")]') as $input) {
        $id = $input->getAttribute('id');

        expect($id)->not->toBeEmpty('Every input needs an id');
        expect($xpath->query("//label[@for='{$id}']")->length)
            ->toBeGreaterThan(0, "Input #{$id} has no <label for>");
    }
});

it('has one h1 and no skipped heading levels', function (): void {
    $dom = new DOMDocument();
    @$dom->loadHTML($this->get('/')->getContent());
    $xpath = new DOMXPath($dom);

    expect($xpath->query('//h1')->length)->toBe(1);

    $previous = 0;
    foreach ($xpath->query('//h1|//h2|//h3|//h4|//h5|//h6') as $heading) {
        $level = (int) substr($heading->nodeName, 1);
        expect($level - $previous)->toBeLessThanOrEqual(1, "Heading level jumped to h{$level}");
        $previous = $level;
    }
});

it('gives every image an alt attribute', function (): void {
    $dom = new DOMDocument();
    @$dom->loadHTML($this->get('/')->getContent());

    foreach ((new DOMXPath($dom))->query('//img') as $img) {
        expect($img->hasAttribute('alt'))->toBeTrue(
            'Missing alt on '.$img->getAttribute('src')
        );
    }
});
```

These run in milliseconds and catch the most common regressions.

### axe, in a browser

```php
it('has no accessibility violations on checkout', function (): void {
    $this->browse(function (Browser $browser): void {
        $browser->loginAs(User::factory()->create())
            ->visit('/checkout')
            ->script(file_get_contents(base_path('node_modules/axe-core/axe.min.js')));

        $violations = $browser->script('
            return axe.run(document, { runOnly: ["wcag2a","wcag2aa","wcag22aa"] })
                .then(r => r.violations);
        ')[0];

        expect($violations)->toBeEmpty(
            collect($violations)->map(fn (array $v): string => "{$v['id']}: {$v['help']}")->implode("\n")
        );
    });
});
```

**Assert zero violations.** A test that logs violations without failing is decoration.

---

## Browser tests

Only for behaviour that cannot be tested any other way: JavaScript interaction, focus
management, drag-and-drop, real form submission with client-side validation.

```bash
composer require --dev laravel/dusk
php artisan dusk:install
```

```php
it('closes the modal with Escape and returns focus to the trigger', function (): void {
    $this->browse(function (Browser $browser): void {
        $browser->loginAs($this->user)
            ->visit('/invoices')
            ->click('@delete-invoice-1')
            ->waitFor('@confirm-dialog')
            ->assertFocused('@confirm-dialog')
            ->keys('', ['{escape}'])
            ->waitUntilMissing('@confirm-dialog')
            ->assertFocused('@delete-invoice-1');       // focus RETURNED
    });
});
```

```blade
<button dusk="delete-invoice-{{ $invoice->id }}">
```

`dusk` attributes rather than CSS selectors — a class change should not break a test.

Rules:
- `waitFor` / `waitUntilMissing` / `waitForText`. **Never `pause()`** — it is the primary
  cause of flaky browser tests.
- `DatabaseTruncation`, not `RefreshDatabase` — the browser runs in a separate process, so
  a transaction cannot span both.
- Keep them few. They are 40× slower than feature tests and an order of magnitude more
  fragile.

```php
uses(DatabaseTruncation::class);
```

---

## Contract tests

```php
it('matches the published OpenAPI spec', function (): void {
    Sanctum::actingAs($this->user, ['invoices:read']);

    $response = $this->getJson('/api/v1/invoices')->assertOk();

    assertMatchesOpenApi($response, 'get', '/invoices');
});
```

See `laravel-api-standards/references/openapi.md`.

---

## What to run, when

| When | Run |
|---|---|
| While coding | `php artisan test --dirty` |
| Before commit | `php artisan test --parallel --exclude-group=slow` |
| Pull request CI | Everything, both DB engines, coverage floor |
| Nightly | Browser + accessibility + slow groups |
| Before release | Full suite, plus the manual accessibility and responsive checklists |

Browser and accessibility suites are slow. Nightly is the right cadence — a 12-minute PR
pipeline stops being run.
