/**
 * Subscribe Endpoint Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/subscribe/route';
import { prisma } from '@/lib/prisma';
import { sendWelcomeEmail } from '@/lib/email-service';
import { NextRequest } from 'next/server';

// Helper to create NextRequest
function createRequest(body: object): NextRequest {
    return new NextRequest('http://localhost:3000/api/subscribe', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('/api/subscribe', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('successfully subscribes a new email', async () => {
        vi.mocked(prisma.emailLead.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.emailLead.create).mockResolvedValue({
            id: 'test-id',
            email: 'test@example.com',
            preferences: {},
            source: 'test',
            isSubscribed: true,
            unsubscribeToken: 'test-token',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const request = createRequest({ email: 'test@example.com', source: 'test' });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.message).toBe('Subscribed successfully!');
        expect(sendWelcomeEmail).toHaveBeenCalledWith('test@example.com', 'test-token');
    });

    it('rejects invalid email addresses', async () => {
        const request = createRequest({ email: 'invalid-email' });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Invalid email address');
    });

    it('handles already subscribed users', async () => {
        vi.mocked(prisma.emailLead.findUnique).mockResolvedValue({
            id: 'existing-id',
            email: 'existing@example.com',
            preferences: {},
            source: 'test',
            isSubscribed: true,
            unsubscribeToken: 'existing-token',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const request = createRequest({ email: 'existing@example.com' });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.message).toBe("You're already subscribed!");
    });

    it('resubscribes previously unsubscribed users', async () => {
        vi.mocked(prisma.emailLead.findUnique).mockResolvedValue({
            id: 'existing-id',
            email: 'unsubscribed@example.com',
            preferences: {},
            source: 'test',
            isSubscribed: false,
            unsubscribeToken: 'existing-token',
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        vi.mocked(prisma.emailLead.update).mockResolvedValue({
            id: 'existing-id',
            email: 'unsubscribed@example.com',
            preferences: {},
            source: 'test',
            isSubscribed: true,
            unsubscribeToken: 'existing-token',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const request = createRequest({ email: 'unsubscribed@example.com' });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.message).toBe('Welcome back! You have been resubscribed.');
    });

    it('sanitizes email input', async () => {
        vi.mocked(prisma.emailLead.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.emailLead.create).mockResolvedValue({
            id: 'test-id',
            email: 'test@example.com',
            preferences: {},
            source: 'unknown',
            isSubscribed: true,
            unsubscribeToken: 'test-token',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Email with spaces and uppercase should be sanitized
        const request = createRequest({ email: '  TEST@EXAMPLE.COM  ' });
        const response = await POST(request);

        expect(response.status).toBe(200);
        expect(prisma.emailLead.findUnique).toHaveBeenCalledWith({
            where: { email: 'test@example.com' },
        });
    });
});
