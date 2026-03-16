/**
 * Health Endpoint Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/health/route';
import { prisma } from '@/lib/prisma';

describe('/api/health', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns healthy status when database is connected', async () => {
        // Mock successful database query
        vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '1': 1 }]);

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.status).toBe('healthy');
        expect(data.checks.database.status).toBe('up');
        expect(typeof data.checks.database.latencyMs).toBe('number');
    });

    it('returns unhealthy status when database is disconnected', async () => {
        // Mock database error
        vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('Connection failed'));

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(503);
        expect(data.status).toBe('unhealthy');
        expect(data.checks.database.status).toBe('down');
        expect(data.checks.database.error).toBe('Connection failed');
    });

    it('includes timestamp in response', async () => {
        vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '1': 1 }]);

        const response = await GET();
        const data = await response.json();

        expect(data.timestamp).toBeDefined();
        expect(new Date(data.timestamp)).toBeInstanceOf(Date);
    });
});
