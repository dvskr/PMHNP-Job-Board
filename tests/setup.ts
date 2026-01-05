/**
 * Test Setup
 * 
 * Configures Prisma mocking and other test utilities.
 */

import { vi, beforeEach } from 'vitest';

// Mock Prisma client
vi.mock('@/lib/prisma', () => {
    return {
        prisma: {
            job: {
                findMany: vi.fn(),
                findUnique: vi.fn(),
                findFirst: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
                count: vi.fn(),
            },
            emailLead: {
                findUnique: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
            },
            jobAlert: {
                findMany: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            },
            employerJob: {
                findFirst: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
            },
            jobDraft: {
                deleteMany: vi.fn(),
            },
            $queryRaw: vi.fn(),
        },
    };
});

// Mock email service
vi.mock('@/lib/email-service', () => {
    return {
        sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
        sendConfirmationEmail: vi.fn().mockResolvedValue({ success: true }),
        sendJobAlertEmail: vi.fn().mockResolvedValue(undefined),
        sendRenewalConfirmationEmail: vi.fn().mockResolvedValue({ success: true }),
        sendExpiryWarningEmail: vi.fn().mockResolvedValue({ success: true }),
        sendDraftSavedEmail: vi.fn().mockResolvedValue({ success: true }),
    };
});

// Reset all mocks before each test
beforeEach(() => {
    vi.clearAllMocks();
});

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
// NODE_ENV is set via vitest config
