# Device matrix sign-off

Fill in per release. Keep the completed grid with the release notes — when a responsive bug
is reported later, this tells you whether it was a miss or a regression.

**Release:** _______________  **Date:** _______________  **Tester:** _______________

## Widths (emulated, DevTools responsive mode)

| Width | Home | List | Detail | Form | Dashboard | Notes |
|---|---|---|---|---|---|---|
| 320px | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 360px | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 375px | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 390px | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 414px | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 576px | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 768px | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 992px | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 1200px | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 1400px | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 1600px | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 1920px | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2560px+ | ☐ | ☐ | ☐ | ☐ | ☐ | caps & centres |

Pass = no horizontal scroll, no clipping, no overlap, all controls reachable.

## Orientation and height

| Scenario | Viewport | Pass | Notes |
|---|---|---|---|
| Phone landscape | 812×375 | ☐ | Sticky chrome, modal scroll |
| Tablet portrait | 768×1024 | ☐ | |
| Tablet landscape | 1024×768 | ☐ | |
| Short desktop window | 1280×600 | ☐ | |

## Zoom

| Level | Equivalent | Pass | Criterion |
|---|---|---|---|
| 200% @ 1280 | 640px | ☐ | WCAG 1.4.4 |
| 400% @ 1280 | 320px | ☐ | WCAG 1.4.10 |

## Foldables

| Check | Pass | Notes |
|---|---|---|
| 280px folded — no breakage | ☐ | |
| Live resize 280 → 717px reflows correctly | ☐ | |
| Charts/canvas resize on unfold | ☐ | |

## Real devices

| Device | OS | Browser | Pass | Notes |
|---|---|---|---|---|
| | iOS ___ | Safari | ☐ | |
| | Android ___ | Chrome | ☐ | |
| | Android ___ | Samsung Internet | ☐ | |
| | iPadOS ___ | Safari | ☐ | |

iOS-specific checks:
- [ ] No zoom-on-focus for form inputs (font-size ≥ 16px)
- [ ] `100dvh`/`100svh` behaves as expected with the address bar visible
- [ ] Safe areas respected on a notched device
- [ ] Rubber-band scrolling does not reveal broken backgrounds

## Browsers (desktop)

| Browser | Version | Pass | Notes |
|---|---|---|---|
| Chrome | | ☐ | |
| Edge | | ☐ | |
| Firefox | | ☐ | |
| Safari | | ☐ | |

## Conditions

| Condition | Pass | Notes |
|---|---|---|
| Slow 4G network profile | ☐ | |
| CPU 4× throttle | ☐ | |
| CPU 6× throttle (low-end Android) | ☐ | |
| JavaScript disabled — core tasks work | ☐ | |
| `prefers-reduced-motion` | ☐ | |
| Forced-colors / High Contrast | ☐ | |

## Automated

| Check | Result |
|---|---|
| `responsive-check.js` — overflow | ☐ Pass / ___ failures |
| `responsive-check.js` — touch targets | ☐ Pass / ___ warnings |
| `responsive-check.js` — unsized images | ☐ Pass / ___ warnings |
| Visual regression suite | ☐ Pass / ___ diffs |

## Defects found

| # | Width/device | Page | Description | Severity | Status |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |

## Sign-off

- [ ] All blocking defects resolved
- [ ] Non-blocking defects logged with owners
- [ ] Grid filed with the release notes

Signed: _______________  Date: _______________
