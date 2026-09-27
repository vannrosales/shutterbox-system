# Frontend performance

## Budgets

Enforce these; a budget nobody checks is a wish.

| Metric | Target (p75) | Fails at |
|---|---|---|
| LCP — Largest Contentful Paint | < 2.5s | > 4.0s |
| INP — Interaction to Next Paint | < 200ms | > 500ms |
| CLS — Cumulative Layout Shift | < 0.1 | > 0.25 |
| TTFB — Time to First Byte | < 600ms | > 1.0s |
| JS transferred | < 200KB gzip | — |
| CSS transferred | < 60KB gzip | — |
| Total page weight | < 1MB public / < 2MB app | — |
| Requests | < 50 | — |

For the Philippine market and similar, budget against a **mid-range Android on 4G**, not a
laptop on fibre. That is roughly a 4–6× CPU throttle in DevTools.

## Vite

```js
// vite.config.js
import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.js'],
            refresh: true,
        }),
    ],
    build: {
        cssCodeSplit: true,
        sourcemap: false,               // never ship sourcemaps to production
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['alpinejs'],
                    charts: ['chart.js'],   // split rarely-used heavy deps
                },
            },
        },
        chunkSizeWarningLimit: 500,
    },
});
```

```blade
@vite(['resources/css/app.css', 'resources/js/app.js'])
```

Vite emits content-hashed filenames, so assets can be served with
`Cache-Control: public, max-age=31536000, immutable` and still update on deploy.

### Splitting heavy dependencies

```js
// ✗ Chart.js in the main bundle on every page
import Chart from 'chart.js/auto';

// ✓ Loaded only when a chart exists
if (document.querySelector('[data-chart]')) {
    const { default: Chart } = await import('chart.js/auto');
    // ...
}
```

Check what is actually in the bundle:

```bash
npx vite-bundle-visualizer
npm run build -- --mode production && ls -lh public/build/assets
```

## Scripts

```blade
{{-- Vite already emits type="module", which is deferred by default --}}

{{-- Third-party: never render-blocking --}}
<script src="https://example.com/widget.js" defer></script>

{{-- Analytics: lowest priority --}}
<script async src="..."></script>
```

Audit third-party scripts ruthlessly. A single analytics/chat/tag-manager script routinely
costs more than the entire application bundle, and you do not control its performance.

## CSS

```blade
{{-- Critical CSS inline for above-the-fold, rest loaded async --}}
<style>{!! $criticalCss !!}</style>
<link rel="preload" href="{{ Vite::asset('resources/css/app.css') }}" as="style"
      onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="{{ Vite::asset('resources/css/app.css') }}"></noscript>
```

Only worth the complexity when LCP is CSS-blocked. Measure first.

Tailwind purges unused classes automatically — but only for classes it can see statically.
Dynamic class construction defeats it:

```blade
{{-- ✗ Tailwind cannot see this; the class is purged --}}
<div class="text-{{ $color }}-500">

{{-- ✓ Full class names, mapped --}}
@php $classes = ['red' => 'text-red-500', 'green' => 'text-green-500']; @endphp
<div class="{{ $classes[$color] }}">
```

## Fonts

```blade
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

{{-- Better: self-host. No third-party connection, no privacy question. --}}
<link rel="preload" href="{{ asset('fonts/inter-var-subset.woff2') }}"
      as="font" type="font/woff2" crossorigin>
```

```css
@font-face {
    font-family: 'Inter';
    src: url('/fonts/inter-var-subset.woff2') format('woff2-variations');
    font-weight: 100 900;
    font-display: swap;         /* text visible immediately in a fallback */
    unicode-range: U+0000-00FF, U+0131, U+2000-206F;   /* subset */
}
```

- **Self-host.** Google Fonts adds a DNS lookup, a connection, and a privacy consideration.
- **Subset.** A full variable font is 200KB+; a Latin subset is often under 30KB.
- **`font-display: swap`** — text renders immediately in the fallback, avoiding invisible
  text (FOIT).
- **Preload only the one face used above the fold.** Preloading four weights costs more
  than it saves.
- Consider a system font stack — zero bytes, instant render:

```css
font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
```

## Images

```blade
{{-- LCP image: eager, high priority, explicit dimensions --}}
<img src="{{ $hero->url }}"
     srcset="{{ $hero->srcset }}"
     sizes="(min-width: 62rem) 50vw, 100vw"
     width="1200" height="630"
     alt="{{ $hero->alt }}"
     fetchpriority="high"
     decoding="async">

{{-- Below the fold: lazy --}}
<img src="{{ $thumb->url }}" width="400" height="300" alt="{{ $thumb->alt }}"
     loading="lazy" decoding="async">
```

- `width`/`height` on **every** image — this is the main CLS fix.
- `loading="lazy"` below the fold only. Lazy-loading the LCP image makes LCP worse.
- `fetchpriority="high"` on the LCP image.

Formats, derivative generation, and `srcset` construction: `laravel-media-management`.

## Layout shift (CLS)

| Cause | Fix |
|---|---|
| Images without dimensions | `width`/`height` attributes |
| Ads/embeds | Reserve space with `aspect-ratio` |
| Web fonts | `font-display: swap` + a metric-matched fallback |
| Content injected above existing content | Reserve the space, or inject below |
| Dynamically sized banners | Fixed `min-block-size` |

```css
.embed { aspect-ratio: 16 / 9; }
.banner { min-block-size: 3rem; }
```

## Compression

Nginx:

```nginx
gzip on;
gzip_vary on;
gzip_comp_level 6;
gzip_min_length 256;
gzip_types text/plain text/css application/json application/javascript
           text/xml application/xml image/svg+xml;

brotli on;
brotli_comp_level 6;
brotli_types text/plain text/css application/json application/javascript
             text/xml application/xml image/svg+xml;
```

Brotli beats gzip by ~15–20% on text. Serve both; browsers negotiate.

Full server config: `laravel-devops-deployment`.

## Resource hints

```blade
<link rel="preconnect" href="https://cdn.example.com" crossorigin>
<link rel="dns-prefetch" href="https://analytics.example.com">
<link rel="preload" href="{{ Vite::asset('resources/js/app.js') }}" as="script">
```

Use sparingly. More than two or three `preconnect`s degrades performance by contending for
connections.

## Livewire / Inertia specifics

**Livewire**
- Every `wire:model.live` keystroke is a round trip. Use `.live.debounce.500ms`, or plain
  `wire:model` (deferred) where immediate feedback is not required.
- `wire:key` on every item in a loop, or Livewire re-renders the whole list.
- Computed properties (`#[Computed]`) are memoised per request — use them instead of
  re-querying in the view.
- Large public properties are serialised into the payload on every request. Keep them small.
- `wire:navigate` gives SPA-like navigation — remember to move focus and announce
  (`laravel-ui-accessibility`).

**Inertia**
- Partial reloads: `Inertia::render(..., ['users' => Inertia::lazy(fn () => ...)])`
- `only: ['users']` on visits to avoid re-sending the whole page payload
- Defer non-critical props

## Octane (when it fits)

```bash
composer require laravel/octane
php artisan octane:install --server=frankenphp
php artisan octane:start --workers=4 --max-requests=500
```

2–5× throughput by keeping the framework booted. The cost: **state leaks between requests**.

- Never store request-specific state in a singleton
- Reset any static property you write
- Watch for memory growth; `--max-requests` recycles workers
- Audit third-party packages for statics

Do not reach for Octane before fixing N+1s and adding indexes. It multiplies throughput; it
does not fix a slow query.

## Measuring

```bash
npx lighthouse https://example.com --view
npx unlighthouse --site https://example.com     # whole-site crawl

# Field data beats lab data — Core Web Vitals from real users
```

```js
// Report real-user vitals
import { onLCP, onINP, onCLS } from 'web-vitals';

const send = (metric) => navigator.sendBeacon('/api/vitals', JSON.stringify(metric));
onLCP(send); onINP(send); onCLS(send);
```

Lab tools measure one run on one machine. Field data is what your users actually
experience — and the p75 is what matters, not the median.
