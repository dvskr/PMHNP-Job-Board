/**
 * The admin console used to swallow failed API calls.
 *
 * /admin/users applied a role change only `if (res.ok)` with no else, so a 500
 * left the <select> snapping back with nothing said; /admin/jobs did the same
 * for the edit modal, and both list loads acted only on `data.success`, so a
 * 429 rendered "0 total jobs / No jobs found" as though the catalogue were
 * empty. The fix routes every console call through lib/admin/admin-fetch.
 *
 * These assert the wrapper's behaviour (a failure of any shape produces a
 * message) and the one property the pages have to keep: they do not talk to
 * the API without it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { adminFetch, describeApiFailure } from '@/lib/admin/admin-fetch';
import { readCode } from '../helpers/source';

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
});

function stubFetch(body: unknown, status: number): void {
    globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(body === undefined ? null : JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
}

describe('adminFetch', () => {
    it('returns the payload for a successful call', async () => {
        stubFetch({ success: true, users: [{ id: 'u1' }] }, 200);
        const result = await adminFetch<{ users: Array<{ id: string }> }>('/api/admin/users');
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.data.users).toHaveLength(1);
    });

    it('reports the server message when a mutation is refused', async () => {
        stubFetch({ success: false, error: 'You cannot change your own role.' }, 400);
        const result = await adminFetch('/api/admin/users/u1', { method: 'PATCH' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('cannot change your own role');
    });

    it('treats a 200 carrying success:false as a failure', async () => {
        // Several admin handlers answer 200 with { success: false }. A caller
        // that only checked res.ok read those as applied changes.
        stubFetch({ success: false, error: 'No valid fields provided' }, 200);
        const result = await adminFetch('/api/admin/jobs/j1', { method: 'PATCH' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe('No valid fields provided');
    });

    it('still produces a message when the failure has no body at all', async () => {
        // The 429 that made /admin/jobs render its empty state.
        globalThis.fetch = vi.fn().mockResolvedValue(
            new Response('Too Many Requests', { status: 429 }),
        ) as unknown as typeof fetch;
        const result = await adminFetch('/api/admin/jobs?page=1');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.trim()).not.toBe('');
            expect(result.error).not.toContain('undefined');
        }
    });

    it('reports a rejected fetch instead of leaving the caller in the dark', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch')) as unknown as typeof fetch;
        const result = await adminFetch('/api/admin/users');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('Failed to fetch');
    });

    it('refuses a 2xx whose body is not a JSON object', async () => {
        // A proxy error page, an empty body, or a truncated response reaches
        // readJson as null. Returning ok:true with data:null moved the
        // failure to `result.data.jobs` in the caller, one line after the
        // early return that clears the spinner, so the page hung on a
        // loading state forever with nothing said. Worse than the bug this
        // wrapper exists to fix.
        globalThis.fetch = vi.fn().mockResolvedValue(
            new Response('<html>502 Bad Gateway</html>', {
                status: 200,
                headers: { 'content-type': 'text/html' },
            }),
        ) as unknown as typeof fetch;
        const result = await adminFetch<{ jobs: unknown[] }>('/api/admin/jobs?page=1');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.trim()).not.toBe('');
    });

    it('hands back an object whenever it reports success', async () => {
        // The property every caller relies on: `result.data.<field>` can
        // never throw on an ok result.
        for (const body of [null, 'a string', 42, true] as const) {
            globalThis.fetch = vi.fn().mockResolvedValue(
                new Response(JSON.stringify(body), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                }),
            ) as unknown as typeof fetch;
            const result = await adminFetch('/api/admin/jobs');
            if (result.ok) expect(typeof result.data).toBe('object');
        }
    });

    it('never describes a failure with an empty or placeholder string', () => {
        for (const status of [400, 401, 403, 404, 409, 429, 500, 502, 503]) {
            for (const payload of [null, {}, { error: '' }, { error: '   ' }, 'plain text']) {
                const message = describeApiFailure(status, payload);
                expect(message.trim().length).toBeGreaterThan(0);
                expect(message).not.toContain('undefined');
                expect(message).not.toContain('[object Object]');
            }
        }
    });
});

const PAGES = {
    '/admin/users': 'app/admin/users/page.tsx',
    '/admin/jobs': 'app/admin/jobs/page.tsx',
} as const;

/**
 * The assertions below read source text, because this repo has no jsdom and
 * no Testing Library, so an admin page cannot be rendered in a unit test.
 * They aim at shapes the behaviour actually requires rather than at
 * particular spellings, and they run against comment-blanked source: an
 * earlier version passed on a page whose only occurrence of the identifier it
 * checked for was in a comment about the bug.
 */
describe.each(Object.entries(PAGES))('%s', (_route, file) => {
    const src = readCode(file);

    it('reaches its API only through the failure-aware wrapper', () => {
        // A bare fetch() here is the shape the defect had: the caller decides,
        // usually by omission, what a non-ok response means.
        const bare = src.match(/(^|[^A-Za-z.])fetch\s*\(/g) ?? [];
        expect(bare).toHaveLength(0);
    });

    it('renders its failed-load state rather than only storing it', () => {
        // actionMsg self-clears after three seconds; a list that failed to
        // load stays wrong until it is reloaded, so it needs its own state.
        // Declaring that state and never rendering it is the same silent
        // failure in a new costume, so require it in a render position.
        const setter = src.match(/const \[(\w*[eE]rror\w*),\s*set\w+\]\s*=\s*useState/);
        expect(setter, 'no persistent error state is declared').not.toBeNull();
        const name = setter![1];
        // {name && ...} or {name ? ... : ...} inside JSX.
        expect(
            new RegExp(`\\{\\s*${name}\\s*(&&|\\?)`).test(src),
            `${name} is declared but never rendered`,
        ).toBe(true);
    });
});

describe('/admin/users deactivation', () => {
    const src = readCode(PAGES['/admin/users']);

    it('can send the PATCH that reverses a soft delete', () => {
        // DELETE only sets profileVisible=false, so restoring is a PATCH the
        // console can make. Before this, the only route back was a raw
        // request. What matters is that profileVisible:true travels in a
        // request body, not how the object literal happens to be written.
        const patches = [...src.matchAll(/adminFetch\([\s\S]{0,400}?method:\s*'PATCH'[\s\S]{0,400}?\)/g)]
            .map((m) => m[0]);
        expect(patches.length, 'no PATCH call found').toBeGreaterThan(0);
        expect(
            patches.some((p) => /profileVisible\s*:\s*true/.test(p)),
            'no PATCH sends profileVisible: true',
        ).toBe(true);
    });
});
