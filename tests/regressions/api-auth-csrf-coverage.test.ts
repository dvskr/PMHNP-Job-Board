/**
 * Session-authenticated mutations must refuse a foreign Origin.
 *
 * lib/csrf.ts existed but was wired into six route files out of the whole API,
 * so /api/employer/settings, /api/saved-jobs and /api/applications/withdraw all
 * accepted a cross-origin write: the session cookie is ambient authority, and
 * nothing at these three endpoints looked at where the request came from. What
 * kept it theoretical was the SameSite=Lax cookie the Supabase client issues,
 * which is a property of the auth library rather than a control this code owns.
 *
 * The invariant pinned here is behavioural: a foreign Origin is refused before
 * anything is read or written, a first-party Origin is not.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { blankComments } from '../helpers/source';

// Hoisted with the vi.mock factories that read them.
const { USER_ID, dbCalls } = vi.hoisted(() => ({
    USER_ID: 'supabase-user-fic-csrf-1',
    dbCalls: vi.fn(),
}));
const EVIL_ORIGIN = 'https://evil.example';
const FIRST_PARTY_ORIGIN = 'http://localhost:3000';

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: {
            getUser: async () => ({
                data: { user: { id: USER_ID, email: 'employer@example.test' } },
                error: null,
            }),
        },
    }),
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: async () => null,
    rateLimitByKey: async () => null,
    RATE_LIMITS: {
        general: { limit: 100, windowSeconds: 60 },
        employer: { limit: 100, windowSeconds: 60 },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/prisma', () => {
    const record = <T>(name: string, result: T) => async (...args: unknown[]) => {
        dbCalls(name, ...args);
        return result;
    };
    return {
    prisma: {
        userProfile: {
            findUnique: record('userProfile.findUnique', {
                id: 'profile-fic-1',
                role: 'employer',
                company: 'Fictional Care Group',
            }),
            update: record('userProfile.update', {}),
        },
        employerJob: { updateMany: record('employerJob.updateMany', { count: 0 }) },
        savedJob: {
            upsert: record('savedJob.upsert', { userId: USER_ID, jobId: 'job-fic-1' }),
            deleteMany: record('savedJob.deleteMany', { count: 1 }),
        },
        jobApplication: {
            findUnique: record('jobApplication.findUnique', { userId: USER_ID, jobId: 'job-fic-1' }),
            update: record('jobApplication.update', {}),
        },
    },
    };
});

import { PATCH as employerSettingsPatch } from '@/app/api/employer/settings/route';
import { POST as saveJob, DELETE as unsaveJob } from '@/app/api/saved-jobs/route';
import { DELETE as withdrawApplication } from '@/app/api/applications/withdraw/route';

type Handler = (request: NextRequest) => Promise<Response>;

interface Case {
    name: string;
    handler: Handler;
    url: string;
    method: 'POST' | 'PATCH' | 'DELETE';
    body: unknown;
}

const CASES: Case[] = [
    {
        name: 'PATCH /api/employer/settings',
        handler: employerSettingsPatch,
        url: 'http://localhost:3000/api/employer/settings',
        method: 'PATCH',
        body: { phone: '5550002222' },
    },
    {
        name: 'POST /api/saved-jobs',
        handler: saveJob,
        url: 'http://localhost:3000/api/saved-jobs',
        method: 'POST',
        body: { jobId: 'job-fic-1' },
    },
    {
        name: 'DELETE /api/saved-jobs',
        handler: unsaveJob,
        url: 'http://localhost:3000/api/saved-jobs',
        method: 'DELETE',
        body: { jobId: 'job-fic-1' },
    },
    {
        name: 'DELETE /api/applications/withdraw',
        handler: withdrawApplication,
        url: 'http://localhost:3000/api/applications/withdraw',
        method: 'DELETE',
        body: { applicationId: 'application-fic-1' },
    },
];

function request(testCase: Case, origin: string | null): NextRequest {
    return new NextRequest(testCase.url, {
        method: testCase.method,
        headers: {
            'content-type': 'application/json',
            ...(origin ? { origin, referer: `${origin}/attack` } : {}),
        },
        body: JSON.stringify(testCase.body),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe.each(CASES)('$name', (testCase) => {
    it('refuses a cross-origin caller without touching the database', async () => {
        const res = await testCase.handler(request(testCase, EVIL_ORIGIN));

        expect(res.status).toBe(403);
        expect(dbCalls).not.toHaveBeenCalled();
    });

    it('accepts the same write from a first-party origin', async () => {
        const res = await testCase.handler(request(testCase, FIRST_PARTY_ORIGIN));

        expect(res.status).not.toBe(403);
        expect(dbCalls).toHaveBeenCalled();
    });

    it('accepts a non-browser caller that sends no origin at all', async () => {
        const res = await testCase.handler(request(testCase, null));

        expect(res.status).not.toBe(403);
    });
});

/**
 * The cases above prove the guard works. This proves it is actually on.
 *
 * The first pass wired verifyCsrf into the three routes a bug report happened
 * to name and stopped, which left nineteen sibling mutations under
 * /api/employer open, including the one that spends paid profile-unlock
 * credits and the one that takes a paid listing dark. Enumerating today's
 * routes in a list would have the same problem one route from now, so this
 * walks the directory: a new mutating handler is in scope the moment it
 * exists.
 */
describe('every session-authenticated employer mutation is guarded', () => {
    const EMPLOYER_API = path.join(process.cwd(), 'app/api/employer');

    function routeFiles(dir: string, out: string[] = []): string[] {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) routeFiles(full, out);
            else if (entry.name === 'route.ts') out.push(full);
        }
        return out;
    }

    /** Each mutating handler, as { route, verb, body-up-to-the-next-handler }. */
    const handlers = routeFiles(EMPLOYER_API).flatMap((file) => {
        const src = blankComments(fs.readFileSync(file, 'utf8'));
        const route = path.relative(process.cwd(), file).split(path.sep).join('/');
        const found = [...src.matchAll(/export async function (POST|PATCH|PUT|DELETE)\s*\(([^)]*)\)/g)];
        return found.map((m, i) => ({
            route,
            verb: m[1],
            params: m[2],
            body: src.slice(m.index!, found[i + 1]?.index ?? src.length),
        }));
    });

    it('finds the handlers at all', () => {
        // Guards the guard: a wrong path would make every case below vacuous.
        expect(handlers.length).toBeGreaterThan(15);
    });

    it.each(handlers.map((h) => [`${h.verb} ${h.route}`, h] as const))(
        '%s calls verifyCsrf',
        (_label, handler) => {
            expect(handler.body).toContain('verifyCsrf');
        },
    );

    it.each(handlers.map((h) => [`${h.verb} ${h.route}`, h] as const))(
        '%s takes the request it needs to check an origin',
        (_label, handler) => {
            // DELETE /api/employer/candidate-alerts declared no parameter at
            // all, so there was nothing to inspect even in principle.
            expect(handler.params.trim()).not.toBe('');
        },
    );
});
