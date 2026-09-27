# Testing accessibility

Automated tooling catches roughly 30–40% of WCAG issues. The other 60% needs a keyboard and
a screen reader. All three layers below are required before claiming conformance.

## Layer 1 — automated

### Local, one page

```bash
npx @axe-core/cli http://localhost:8000/checkout --exit
npx pa11y http://localhost:8000/checkout --standard WCAG2AA
npx lighthouse http://localhost:8000 --only-categories=accessibility --view
```

### Whole site

```bash
npx pa11y-ci --sitemap http://localhost:8000/sitemap.xml --sitemap-exclude "/admin"
```

`.pa11yci.json`:

```json
{
  "defaults": {
    "standard": "WCAG2AA",
    "runners": ["axe", "htmlcs"],
    "timeout": 30000,
    "chromeLaunchConfig": { "args": ["--no-sandbox"] },
    "hideElements": "#third-party-widget"
  },
  "urls": [
    "http://localhost:8000/",
    "http://localhost:8000/register",
    { "url": "http://localhost:8000/dashboard", "actions": [
        "navigate to http://localhost:8000/login",
        "set field #email to test@example.com",
        "set field #password to password",
        "click element button[type=submit]",
        "wait for path to be /dashboard"
    ]}
  ]
}
```

Authenticated pages are where the real defects live. Always include them.

### In the test suite

Pest + Dusk with axe injected:

```php
// tests/Browser/AccessibilityTest.php
it('has no detectable accessibility violations on the checkout page', function (): void {
    $this->browse(function (Browser $browser): void {
        $browser->loginAs(User::factory()->create())
            ->visit('/checkout')
            ->script(file_get_contents(base_path('node_modules/axe-core/axe.min.js')));

        $results = $browser->script('
            return axe.run(document, { runOnly: ["wcag2a","wcag2aa","wcag22aa"] })
                .then(r => r.violations);
        ')[0];

        expect($results)->toBeEmpty(
            collect($results)->map(fn ($v) => "{$v['id']}: {$v['help']}")->implode("\n")
        );
    });
});
```

Assert on **zero violations** for the rule sets you claim. A test that logs violations
without failing is decoration.

### Markup-level assertions (fast, no browser)

```php
it('labels every input on the registration form', function (): void {
    $html = $this->get('/register')->getContent();
    $dom  = new DOMDocument();
    @$dom->loadHTML($html);
    $xpath = new DOMXPath($dom);

    foreach ($xpath->query('//input[not(@type="hidden")]') as $input) {
        $id = $input->getAttribute('id');

        expect($id)->not->toBeEmpty('Every input needs an id');
        expect($xpath->query("//label[@for='{$id}']")->length)
            ->toBeGreaterThan(0, "Input #{$id} has no <label for>");
    }
});

it('has exactly one h1 and no skipped heading levels', function (): void {
    // ... parse h1..h6 in document order, assert no jump > 1
});
```

These run in milliseconds and catch the most common regressions without Chrome.

### CI

`templates/a11y-workflow.yml` has a complete GitHub Actions job. Gate the build on it.

## Layer 2 — keyboard (mandatory, manual)

Unplug the mouse. For every page and component:

| Check | Pass condition |
|---|---|
| Tab from the top | First stop is the skip link, and it becomes visible |
| Tab through | Every interactive element is reachable |
| Focus visibility | You can always see where focus is, at 3:1 contrast |
| Order | Tab order matches the visual reading order |
| Sticky headers | Focused element is never hidden behind them (SC 2.4.11) |
| `Enter` / `Space` | Buttons activate with both; links with Enter |
| `Escape` | Closes any modal, dropdown, tooltip |
| Focus return | After closing a modal/menu, focus is back on the trigger |
| No trap | You can tab out of every component (except an open modal) |
| Forms | Submittable end to end; errors reachable and readable |
| Custom widgets | Arrow keys work where the pattern requires them |
| Drag interactions | A click-only alternative exists (SC 2.5.7) |

Any "no" is a blocking defect.

## Layer 3 — screen reader (mandatory for new components)

| Reader | Platform | Pair with | Notes |
|---|---|---|---|
| **NVDA** | Windows | Firefox, Chrome | Free; the highest-value single test, and most common in PH |
| **VoiceOver** | macOS / iOS | Safari | Built in; iOS testing is essential for mobile |
| **JAWS** | Windows | Chrome | Common in enterprise/government procurement |
| **TalkBack** | Android | Chrome | Mobile parity check |
| **Orca** | Linux | Firefox | Lower priority |

### NVDA quick reference

Start: `Ctrl+Alt+N` · Stop: `Insert+Q` · Silence: `Ctrl`

| Key | Action |
|---|---|
| `H` / `Shift+H` | Next / previous heading |
| `1`–`6` | Next heading at that level |
| `D` | Next landmark |
| `F` | Next form field |
| `B` | Next button |
| `T` | Next table |
| `K` | Next link |
| `Insert+F7` | Elements list — headings, links, landmarks |
| `Insert+Space` | Toggle browse ↔ focus mode |

### What to verify

1. **Page identity** — is the title read, and does it identify this page?
2. **Heading tour** (`H` repeatedly) — do the headings alone describe the page structure?
3. **Landmark tour** (`D`) — banner, navigation, main, contentinfo all present and named?
4. **Form tour** (`F`) — is every field announced with its label, required state, hint,
   and current value?
5. **Errors** — submit an invalid form. Is the error announced? Is the field's invalid
   state announced when you reach it?
6. **Dynamic updates** — filter a list. Is the new result count announced?
7. **Every custom component** — does it announce a **name**, a **role**, and its **state**?
   If you cannot hear all three, it fails SC 4.1.2.

## Layer 4 — other checks worth building in

```
Zoom to 200%          → no content lost, no horizontal scroll (SC 1.4.4)
Zoom to 400%          → single column at 320px equivalent (SC 1.4.10)
Windows High Contrast → borders and focus still visible; icons not invisible
prefers-reduced-motion → animation disabled
Grayscale the page    → is any meaning lost? (SC 1.4.1)
Disable CSS           → does the DOM still read in a sensible order? (SC 1.3.2)
Disable JavaScript    → do core tasks still work?
```

The grayscale check takes ten seconds in DevTools (Rendering → Emulate vision deficiencies)
and reliably catches colour-only encoding.

## Text-spacing bookmarklet (SC 1.4.12)

```js
javascript:(function(){
  const s = document.createElement('style');
  s.textContent = '*{line-height:1.5!important;letter-spacing:.12em!important;' +
                  'word-spacing:.16em!important}p{margin-bottom:2em!important}';
  document.head.appendChild(s);
})();
```

If text clips or overlaps, containers have fixed heights that need to become `min-height`.

## Recording results

Keep an accessibility test record per release: pages tested, tools and versions, AT and
browser pairs, findings, and what was deferred with justification. This is what an audit
or a procurement questionnaire will ask for, and it takes minutes if kept as you go.

## What automated tools cannot tell you

- Whether `alt` text is *meaningful* (only that it exists)
- Whether heading structure reflects the actual content hierarchy
- Whether tab order is *logical* (only that elements are focusable)
- Whether an error message is *helpful*
- Whether a custom widget's keyboard model matches user expectation
- Whether colour is the *only* carrier of meaning
- Whether the page makes sense when heard rather than seen

Never report "axe passes" as "accessible".
