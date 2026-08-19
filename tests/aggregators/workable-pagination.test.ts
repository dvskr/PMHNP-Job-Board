/**
 * Workable cursor pagination (2026-08-19 API change).
 *
 * The board API caps every page at 10 rows and ignores limit/offset;
 * paging works only via the `nextPage` cursor echoed back as `token`
 * in the POST body. These tests pin:
 *   - token round-tripping between pages
 *   - the zero-relevant-page early stop (relevance-ranked results)
 *   - shortcode dedup across queries
 *   - the empty-description drop (H6) surviving the rewrite
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/aggregators/tenants/workable', () => ({
    WORKABLE_TENANTS: [{ slug: 'acme-health', name: 'Acme Health' }],
}));
vi.mock('@/lib/aggregators/search-terms/doccafe', () => ({
    DOCCAFE_SEARCH_QUERIES: ['PMHNP', 'psychiatric nurse practitioner'],
}));

import { fetchWorkableJobs } from '@/lib/aggregators/workable';

interface ListCall {
    query: string;
    token?: string;
}

const LIST_URL = 'https://apply.workable.com/api/v2/accounts/acme-health/jobs';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function job(shortcode: string, title: string) {
    return { shortcode, title, published: '2026-08-15' };
}

describe('fetchWorkableJobs cursor pagination', () => {
    const listCalls: ListCall[] = [];
    const detailCalls: string[] = [];

    beforeEach(() => {
        listCalls.length = 0;
        detailCalls.length = 0;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function stubFetch(
        pages: Record<string, { results: Array<{ shortcode: string; title: string }>; nextPage?: string }>,
        detail: (shortcode: string) => object | null,
    ) {
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === LIST_URL && init?.method === 'POST') {
                const body = JSON.parse(String(init.body)) as ListCall;
                listCalls.push({ query: body.query, token: body.token });
                const key = body.token ?? `q:${body.query}`;
                const page = pages[key] ?? { results: [] };
                return jsonResponse({ total: 999, ...page });
            }
            // Detail: GET /jobs/{shortcode}
            const m = /\/jobs\/([A-Z0-9]+)$/.exec(url);
            if (m) {
                detailCalls.push(m[1]);
                const d = detail(m[1]);
                return d ? jsonResponse(d) : jsonResponse({}, 404);
            }
            throw new Error(`unexpected fetch: ${url}`);
        }));
    }

    it('walks nextPage tokens through the POST body and collects every page', async () => {
        stubFetch(
            {
                'q:PMHNP': { results: [job('AAA1', 'PMHNP - Remote')], nextPage: 'tok-1' },
                'tok-1': { results: [job('BBB2', 'Psychiatric Nurse Practitioner')] }, // no nextPage — walk ends
                'q:psychiatric nurse practitioner': { results: [] },
            },
            () => ({ description: '<p>Full role description with plenty of detail.</p>' }),
        );

        const jobs = await fetchWorkableJobs();

        expect(jobs.map((j) => j.externalId)).toEqual([
            'workable-acme-health-AAA1',
            'workable-acme-health-BBB2',
        ]);
        // Second list call must carry the cursor from the first response.
        expect(listCalls[1]).toEqual({ query: 'PMHNP', token: 'tok-1' });
    });

    it('stops walking a query when a page has zero relevant titles', async () => {
        stubFetch(
            {
                'q:PMHNP': {
                    results: [job('CCC3', 'Software Engineer'), job('DDD4', 'Accountant')],
                    nextPage: 'tok-deeper', // must never be requested
                },
                'q:psychiatric nurse practitioner': { results: [] },
            },
            () => ({ description: 'irrelevant' }),
        );

        const jobs = await fetchWorkableJobs();

        expect(jobs).toEqual([]);
        expect(listCalls.map((c) => c.token)).not.toContain('tok-deeper');
        // One page per query, nothing deeper.
        expect(listCalls).toHaveLength(2);
    });

    it('dedups shortcodes seen under an earlier query and fetches detail once', async () => {
        stubFetch(
            {
                'q:PMHNP': { results: [job('EEE5', 'PMHNP Lead')] },
                'q:psychiatric nurse practitioner': { results: [job('EEE5', 'PMHNP Lead')] },
            },
            () => ({ description: '<p>desc</p>' }),
        );

        const jobs = await fetchWorkableJobs();

        expect(jobs).toHaveLength(1);
        expect(detailCalls).toEqual(['EEE5']);
    });

    it('drops jobs whose detail fetch yields no description (H6)', async () => {
        stubFetch(
            {
                'q:PMHNP': { results: [job('FFF6', 'PMHNP - Texas')] },
                'q:psychiatric nurse practitioner': { results: [] },
            },
            () => null, // detail 404s
        );

        const jobs = await fetchWorkableJobs();

        expect(jobs).toEqual([]);
        expect(detailCalls).toEqual(['FFF6']);
    });
});
