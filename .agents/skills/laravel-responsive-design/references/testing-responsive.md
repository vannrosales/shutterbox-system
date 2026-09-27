# Testing responsive layouts

## The 30-second smoke test

Run this in the console at any width. It is the single highest-value responsive check.

```js
// Every element wider than the viewport
(() => {
  const vw = document.documentElement.clientWidth;
  const bad = [...document.querySelectorAll('*')].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > vw + 1 || r.right > vw + 1 || r.left < -1;
  });
  console.table(bad.map(el => ({
    tag: el.tagName.toLowerCase(),
    cls: el.className?.toString().slice(0, 40),
    w: Math.round(el.getBoundingClientRect().width),
    right: Math.round(el.getBoundingClientRect().right),
  })));
  bad.forEach(el => el.style.outline = '2px solid magenta');
  console.log(`${bad.length} overflowing element(s), viewport ${vw}px`);
})();
```

The magenta outlines show you exactly which element is the culprit — usually the innermost
one, not the scrolling ancestor.

## Manual pass

Set the DevTools device toolbar to **Responsive** and drag the width slowly from 1920 down
to 320. Do not jump between presets — the breakages happen *between* the presets.

At each width in the matrix, check:

| Check | Fail looks like |
|---|---|
| Horizontal scroll | The page scrolls sideways at all |
| Text clipping | Ellipsis or cut-off text that has no expanded view |
| Overlap | Elements sitting on top of each other |
| Touch targets | Buttons under 44px, or under 8px apart |
| Nav | Items wrapping into a broken second row |
| Tables | Squashed to unreadable, or overflowing the page |
| Forms | Fields narrower than their content, labels wrapping oddly |
| Modals | Taller than the viewport with no internal scroll |
| Images | Distorted aspect ratio, or overflowing |
| Line length | Over ~75 characters at wide widths |
| Whitespace | Enormous gaps at 1920px+ from a stretched layout |
| Sticky chrome | Consuming most of a short viewport |

Then rotate to landscape and repeat at 812×375.

## Zoom (also a WCAG requirement)

| Zoom | At 1280px viewport | Requirement |
|---|---|---|
| 200% | ≡ 640px | No content or function lost (SC 1.4.4) |
| 400% | ≡ 320px | Single column, no horizontal scroll (SC 1.4.10) |

Browser zoom is not the same as the device toolbar — test both. Zoom exposes `px`-based
media queries and `vw`-based font sizing that the device toolbar does not.

## Automated: Playwright scanner

`templates/responsive-check.js` runs the overflow check across the whole matrix and fails
the build. Run it against a running app:

```bash
npm i -D playwright
npx playwright install chromium
node templates/responsive-check.js http://localhost:8000 /invoices /invoices/create
```

Add to CI so a regression cannot merge.

## Visual regression

```bash
npx playwright test --update-snapshots   # baseline
npx playwright test                       # compare
```

```js
// tests/e2e/responsive.spec.js
import { test, expect } from '@playwright/test';

const WIDTHS = [320, 360, 375, 390, 414, 576, 768, 992, 1200, 1400, 1600, 1920];
const PAGES  = ['/', '/invoices', '/invoices/create'];

for (const width of WIDTHS) {
    for (const path of PAGES) {
        test(`${path} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(path);

            // No horizontal overflow
            const overflow = await page.evaluate(() =>
                document.documentElement.scrollWidth > document.documentElement.clientWidth
            );
            expect(overflow, `Horizontal overflow at ${width}px on ${path}`).toBe(false);

            await expect(page).toHaveScreenshot(`${path.replace(/\//g, '_')}-${width}.png`, {
                fullPage: true,
                maxDiffPixelRatio: 0.01,
            });
        });
    }
}
```

Visual regression is high-maintenance — every intentional design change updates dozens of
snapshots. Use it on a handful of critical pages, not everywhere. The overflow assertion
alone, with no screenshots, catches most regressions at a fraction of the cost.

## Real devices

Emulators miss: actual touch ergonomics, real network conditions, browser chrome height,
notch behaviour, and iOS Safari's specific quirks (the `100vh` problem, zoom-on-focus for
sub-16px inputs, rubber-band scrolling).

Minimum real-device coverage:
- One iOS phone (Safari)
- One Android phone (Chrome, and Samsung Internet if the market warrants it)
- One tablet, if the product has a tablet audience

For remote testing without a device lab, BrowserStack/LambdaTest cover the matrix.

### Debugging on a real device

```bash
# Android: chrome://inspect on the desktop, USB debugging enabled on the phone
# iOS: Settings > Safari > Advanced > Web Inspector, then Safari > Develop on macOS

# Expose your local server to the device on the same network
php artisan serve --host=0.0.0.0 --port=8000
# then visit http://<your-lan-ip>:8000 on the phone
```

Windows firewall will usually block this by default; allow PHP through for private
networks.

## Throttling

Test on a throttled connection, not just a fast one — layout that depends on late-loading
CSS or JS looks very different mid-load.

```
DevTools → Network → Slow 4G / Fast 3G
DevTools → Performance → CPU 4× or 6× slowdown
```

A mid-range Android is roughly a 4–6× CPU slowdown relative to a developer laptop.

## Foldable simulation

Chrome DevTools has Galaxy Fold and Surface Duo presets. The important test is not the
static width — it is **resizing live** from folded to unfolded. Drag the responsive width
from 280 → 717 in one motion and watch for:

- Layouts that only computed once on load
- JS that read `window.innerWidth` at startup
- Canvas/chart libraries that do not observe resize

```js
// Correct: observe, don't sample
new ResizeObserver(() => chart.resize()).observe(container);
```

## Checklist of things emulators will not catch

- iOS input zoom on focus (needs `font-size: 16px` minimum)
- `100vh` overshoot with browser chrome visible
- Safe-area insets on a notched device
- Touch target ergonomics — a 44px button in the top-left corner of a 6.7" phone is still
  hard to reach
- Scroll performance with `position: fixed` + `backdrop-filter`
- Actual font rendering differences

## Recording sign-off

Use `checklists/device-matrix.md` and keep the filled-in grid with the release. When a
responsive bug is reported later, the grid tells you whether it was a miss or a regression.
