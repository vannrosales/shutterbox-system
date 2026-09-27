/**
 * k6 load test template.
 *
 *   k6 run -e BASE_URL=https://staging.example.com -e EMAIL=... -e PASSWORD=... load-test.js
 *
 * Run against staging seeded to PRODUCTION-LIKE data volume. A load test against
 * a demo dataset measures PHP, not your indexes — and will pass while production
 * falls over.
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const listDuration = new Trend('list_page_duration');
const searchDuration = new Trend('search_duration');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export const options = {
    scenarios: {
        // Steady browsing traffic
        browse: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 50 },    // ramp to expected peak
                { duration: '5m', target: 50 },    // hold
                { duration: '2m', target: 150 },   // 3x peak — find the first bottleneck
                { duration: '3m', target: 150 },
                { duration: '2m', target: 0 },
            ],
            gracefulRampDown: '30s',
        },

        // A few users doing expensive things concurrently
        heavy: {
            executor: 'constant-vus',
            vus: 5,
            duration: '14m',
            exec: 'heavyOperations',
        },
    },

    thresholds: {
        http_req_duration: ['p(95)<500', 'p(99)<1500'],
        http_req_failed: ['rate<0.01'],
        errors: ['rate<0.01'],
        list_page_duration: ['p(95)<600'],
        search_duration: ['p(95)<800'],
    },
};

/** Log in once per VU and reuse the session. */
export function setup() {
    if (!__ENV.EMAIL) {
        return { cookies: null };
    }

    const loginPage = http.get(`${BASE_URL}/login`);
    const token = loginPage.html().find('input[name=_token]').attr('value');

    const res = http.post(`${BASE_URL}/login`, {
        _token: token,
        email: __ENV.EMAIL,
        password: __ENV.PASSWORD,
    });

    check(res, { 'logged in': (r) => r.status === 200 || r.status === 302 });

    return { cookies: res.cookies };
}

export default function (data) {
    const params = data.cookies ? { cookies: data.cookies } : {};

    group('landing', () => {
        const res = http.get(`${BASE_URL}/`, params);
        const ok = check(res, {
            'home 200': (r) => r.status === 200,
            'home < 500ms': (r) => r.timings.duration < 500,
        });
        errorRate.add(!ok);
    });

    sleep(Math.random() * 2 + 1);

    group('list page', () => {
        const res = http.get(`${BASE_URL}/invoices?page=1`, params);
        listDuration.add(res.timings.duration);
        errorRate.add(!check(res, { 'list 200': (r) => r.status === 200 }));
    });

    sleep(Math.random() * 2 + 1);

    group('deep pagination', () => {
        // The classic scaling failure: OFFSET on a large table.
        // If this is much slower than page 1, you need keyset pagination.
        const res = http.get(`${BASE_URL}/invoices?page=500`, params);
        errorRate.add(!check(res, {
            'deep page 200': (r) => r.status === 200,
            'deep page not much slower': (r) => r.timings.duration < 1500,
        }));
    });

    sleep(Math.random() * 3 + 1);

    group('search', () => {
        const terms = ['invoice', 'payment', 'refund', 'draft'];
        const term = terms[Math.floor(Math.random() * terms.length)];
        const res = http.get(`${BASE_URL}/invoices?q=${term}`, params);
        searchDuration.add(res.timings.duration);
        errorRate.add(!check(res, { 'search 200': (r) => r.status === 200 }));
    });

    sleep(Math.random() * 3 + 2);
}

/** Expensive endpoints — run at low concurrency alongside normal traffic. */
export function heavyOperations(data) {
    const params = data.cookies ? { cookies: data.cookies, timeout: '120s' } : { timeout: '120s' };

    group('report', () => {
        const res = http.get(`${BASE_URL}/reports/monthly`, params);
        check(res, {
            'report completes': (r) => r.status === 200,
            'report < 10s': (r) => r.timings.duration < 10_000,
        });
    });

    sleep(10);

    group('export', () => {
        const res = http.get(`${BASE_URL}/invoices/export`, params);
        // Exports over ~100k rows should be QUEUED, returning 202 — not streamed inline.
        check(res, { 'export accepted or streamed': (r) => [200, 202].includes(r.status) });
    });

    sleep(20);
}

export function handleSummary(data) {
    const p95 = data.metrics.http_req_duration.values['p(95)'].toFixed(0);
    const p99 = data.metrics.http_req_duration.values['p(99)'].toFixed(0);
    const failed = (data.metrics.http_req_failed.values.rate * 100).toFixed(2);

    return {
        stdout: `
─────────────────────────────────────────────
  p95 response time : ${p95}ms   (target <500)
  p99 response time : ${p99}ms   (target <1500)
  failed requests   : ${failed}% (target <1%)
  total requests    : ${data.metrics.http_reqs.values.count}
─────────────────────────────────────────────
`,
        'k6-summary.json': JSON.stringify(data, null, 2),
    };
}
