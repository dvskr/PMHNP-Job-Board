/**
 * POST /api/employer/candidate-alerts used to have no validation at all.
 *
 * Reproduced during the 2026-09-03 hunt against the running app:
 *   {specialties: 'ADHD, PTSD'}   -> 500  (String has no .join)
 *   {minExperience: 'abc'}        -> 500  (Prisma rejected the Int)
 *   {workMode: 42}                -> 500
 *   {states: {MO: true}}          -> 200  {"success": true}, states stored null
 *
 * The last one is the worst of the four: the employer was told the alert saved
 * with filters it did not actually have. These pin all four as 400s, and pin
 * that a well-formed body still writes the comma-joined columns.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: async () => null,
    RATE_LIMITS: { employer: { limit: 100, windowSeconds: 60 } },
}));

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'sb-fic-employer' } }, error: null }) },
    }),
}));

const alertFindFirst = vi.fn();
const alertCreate = vi.fn();
const alertUpdate = vi.fn();
vi.mock('@/lib/prisma', () => ({
    prisma: {
        userProfile: {
            findUnique: async () => ({ id: 'profile-fic-1', role: 'employer' }),
        },
        employerCandidateAlert: {
            findFirst: (...a: unknown[]) => alertFindFirst(...a),
            create: (...a: unknown[]) => alertCreate(...a),
            update: (...a: unknown[]) => alertUpdate(...a),
        },
    },
}));

import { POST } from '@/app/api/employer/candidate-alerts/route';

function request(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/employer/candidate-alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    alertFindFirst.mockReset().mockResolvedValue(null);
    alertCreate.mockReset().mockResolvedValue({ id: 'alert-fic-1' });
    alertUpdate.mockReset().mockResolvedValue({ id: 'alert-fic-1' });
});

describe('malformed candidate-alert payloads are refused with 400', () => {
    it.each([
        ['specialties as a string', { specialties: 'ADHD, PTSD', states: ['MO'] }],
        ['minExperience as text', { specialties: ['ADHD'], minExperience: 'abc' }],
        ['workMode as a number', { workMode: 42 }],
        ['states as an object', { states: { MO: true } }],
        ['minExperience as a fraction', { minExperience: 2.5 }],
        ['isActive as a string', { isActive: 'yes' }],
    ])('%s', async (_label, body) => {
        const res = await POST(request(body));
        expect(res.status).toBe(400);
        expect(alertCreate).not.toHaveBeenCalled();
        expect(alertUpdate).not.toHaveBeenCalled();
    });

    it('never answers success while silently dropping a filter', async () => {
        const res = await POST(request({ states: { MO: true } }));
        const json = await res.json();
        expect(json.success).toBeUndefined();
        expect(json.error).toBeTruthy();
    });
});

describe('a well-formed payload is stored comma-joined', () => {
    it('creates the alert with the joined lists', async () => {
        const res = await POST(request({
            specialties: ['ADHD', 'PTSD'],
            states: ['MO', 'KS'],
            minExperience: 3,
            workMode: 'remote',
            isActive: true,
        }));

        expect(res.status).toBe(200);
        expect(alertCreate).toHaveBeenCalledTimes(1);
        const data = alertCreate.mock.calls[0][0].data;
        expect(data.specialties).toBe('ADHD,PTSD');
        expect(data.states).toBe('MO,KS');
        expect(data.minExperience).toBe(3);
        expect(data.workMode).toBe('remote');
    });

    it('empty lists and an empty work mode become null, not empty strings', async () => {
        await POST(request({ specialties: [], states: [], workMode: '' }));
        const data = alertCreate.mock.calls[0][0].data;
        expect(data.specialties).toBeNull();
        expect(data.states).toBeNull();
        expect(data.workMode).toBeNull();
    });

    it('a comma inside an entry cannot forge a second filter on read back', async () => {
        await POST(request({ specialties: ['ADHD, PTSD'] }));
        const data = alertCreate.mock.calls[0][0].data;
        expect(data.specialties).toBe('ADHD PTSD');
        expect(data.specialties.split(',')).toHaveLength(1);
    });
});
