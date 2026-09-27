#!/usr/bin/env node
/**
 * Responsive layout scanner.
 *
 * Loads each given path at every width in the project breakpoint matrix and reports:
 *   - page-level horizontal overflow
 *   - the specific elements causing it
 *   - touch targets below the WCAG 2.5.8 minimum
 *   - text below a readable size
 *   - images with no intrinsic dimensions (layout shift)
 *
 * Usage:
 *   npm i -D playwright && npx playwright install chromium
 *   node responsive-check.js http://localhost:8000 / /invoices /invoices/create
 *
 * Exits non-zero when any page-level overflow is found — wire into CI.
 */

import { chromium } from 'playwright';

const WIDTHS = [320, 360, 375, 390, 414, 576, 768, 992, 1200, 1400, 1600, 1920];
const HEIGHT = 900;

// Landscape phone: short viewports break sticky chrome and modals.
const EXTRA_VIEWPORTS = [{ width: 812, height: 375, label: '812x375 (landscape phone)' }];

const [, , baseUrl, ...paths] = process.argv;

if (!baseUrl) {
    console.error('Usage: node responsive-check.js <baseUrl> [path...]');
    process.exit(1);
}

const targets = paths.length > 0 ? paths : ['/'];

const audit = () => {
    const docWidth = document.documentElement.clientWidth;
    const results = { overflow: [], smallTargets: [], smallText: [], unsizedImages: [] };

    // Page-level horizontal scroll
    results.pageOverflow =
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;

    for (const el of document.querySelectorAll('body *')) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        const describe = () =>
            el.tagName.toLowerCase() +
            (el.id ? `#${el.id}` : '') +
            (typeof el.className === 'string' && el.className
                ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
                : '');

        // Overflowing elements — skip legitimate scroll containers
        const scrolls = ['auto', 'scroll'].includes(style.overflowX);
        if (!scrolls && (rect.right > docWidth + 1 || rect.left < -1)) {
            results.overflow.push({
                el: describe(),
                width: Math.round(rect.width),
                right: Math.round(rect.right),
                viewport: docWidth,
            });
        }

        // WCAG 2.5.8 Target Size (Minimum) — 24x24 CSS px
        const interactive =
            ['BUTTON', 'A', 'SELECT', 'SUMMARY'].includes(el.tagName) ||
            (el.tagName === 'INPUT' && !['hidden'].includes(el.type)) ||
            el.getAttribute('role') === 'button';

        const inlineLink = el.tagName === 'A' && style.display.includes('inline');

        if (interactive && !inlineLink && (rect.width < 24 || rect.height < 24)) {
            results.smallTargets.push({
                el: describe(),
                size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
            });
        }

        // iOS zooms on focus when an input's font-size is under 16px
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
            const fs = parseFloat(style.fontSize);
            if (fs < 16) results.smallText.push({ el: describe(), fontSize: `${fs}px` });
        }

        // Images without width/height attributes cause layout shift
        if (el.tagName === 'IMG' && (!el.getAttribute('width') || !el.getAttribute('height'))) {
            results.unsizedImages.push({ el: describe(), src: (el.currentSrc || el.src).slice(-60) });
        }
    }

    // De-duplicate by selector
    const dedupe = (arr, key) => [...new Map(arr.map((i) => [i[key], i])).values()];
    results.overflow = dedupe(results.overflow, 'el').slice(0, 15);
    results.smallTargets = dedupe(results.smallTargets, 'el').slice(0, 15);
    results.smallText = dedupe(results.smallText, 'el').slice(0, 10);
    results.unsizedImages = dedupe(results.unsizedImages, 'el').slice(0, 10);

    return results;
};

const browser = await chromium.launch();
const page = await browser.newPage();

let failures = 0;

const viewports = [
    ...WIDTHS.map((width) => ({ width, height: HEIGHT, label: `${width}px` })),
    ...EXTRA_VIEWPORTS,
];

for (const path of targets) {
    const url = new URL(path, baseUrl).toString();
    console.log(`\n\x1b[1m${url}\x1b[0m`);

    for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(url, { waitUntil: 'networkidle' });

        const r = await page.evaluate(audit);

        const problems = [];
        if (r.pageOverflow) problems.push('PAGE OVERFLOW');
        if (r.overflow.length) problems.push(`${r.overflow.length} overflowing`);
        if (r.smallTargets.length) problems.push(`${r.smallTargets.length} small targets`);
        if (r.smallText.length) problems.push(`${r.smallText.length} inputs <16px`);
        if (r.unsizedImages.length) problems.push(`${r.unsizedImages.length} unsized images`);

        if (problems.length === 0) {
            console.log(`  \x1b[32m✓\x1b[0m ${vp.label}`);
            continue;
        }

        const fatal = r.pageOverflow || r.overflow.length > 0;
        if (fatal) failures++;

        console.log(`  ${fatal ? '\x1b[31m✗' : '\x1b[33m!'}\x1b[0m ${vp.label} — ${problems.join(', ')}`);

        r.overflow.forEach((o) =>
            console.log(`      overflow: ${o.el} (right ${o.right}px > viewport ${o.viewport}px)`)
        );
        r.smallTargets.forEach((t) => console.log(`      target:   ${t.el} is ${t.size} (min 24x24)`));
        r.smallText.forEach((t) => console.log(`      iOS zoom: ${t.el} font-size ${t.fontSize}`));
        r.unsizedImages.forEach((i) => console.log(`      no dims:  ${i.el} ${i.src}`));
    }
}

await browser.close();

console.log(
    failures === 0
        ? '\n\x1b[32mNo overflow failures.\x1b[0m'
        : `\n\x1b[31m${failures} viewport(s) with overflow.\x1b[0m`
);

process.exit(failures > 0 ? 1 : 0);
