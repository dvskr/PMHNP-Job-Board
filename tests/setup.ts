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
                groupBy: vi.fn(),
                aggregate: vi.fn(),
                upsert: vi.fn(),
                deleteMany: vi.fn(),
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
                updateMany: vi.fn(),
                delete: vi.fn(),
            },
            employerJob: {
                findFirst: vi.fn(),
                findMany: vi.fn(),
                count: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
            },
            profileView: {
                count: vi.fn(),
                findUnique: vi.fn(),
                findMany: vi.fn(),
                upsert: vi.fn(),
                create: vi.fn(),
            },
            conversation: {
                count: vi.fn(),
                findFirst: vi.fn(),
                findMany: vi.fn(),
                create: vi.fn(),
            },
            employerMessage: {
                count: vi.fn(),
                findMany: vi.fn(),
                create: vi.fn(),
            },
            processedStripeEvent: {
                create: vi.fn(),
                findUnique: vi.fn(),
                delete: vi.fn(),
            },
            jobCharge: {
                create: vi.fn(),
                findFirst: vi.fn(),
                findMany: vi.fn(),
            },
            jobDraft: {
                deleteMany: vi.fn(),
            },
            userProfile: {
                findUnique: vi.fn(),
                findMany: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            },
            employerLead: {
                findUnique: vi.fn(),
                findMany: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            },
            company: {
                findUnique: vi.fn(),
                findMany: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            },
            siteStat: {
                findUnique: vi.fn(),
                findMany: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            },
            aiCallLog: {
                create: vi.fn(),
                findMany: vi.fn(),
                count: vi.fn(),
                aggregate: vi.fn(),
            },
            aiEvalSnapshot: {
                create: vi.fn(),
                findMany: vi.fn(),
                count: vi.fn(),
            },
            aiFeatureFlagOverride: {
                findMany: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
                upsert: vi.fn(),
                deleteMany: vi.fn(),
            },
            candidateRecommendation: {
                findFirst: vi.fn(),
                findMany: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                updateMany: vi.fn(),
                deleteMany: vi.fn(),
            },
            candidateEmbedding: {
                delete: vi.fn(),
                deleteMany: vi.fn(),
                upsert: vi.fn(),
                findUnique: vi.fn(),
            },
            emailSend: {
                create: vi.fn(),
                createMany: vi.fn(),
                findMany: vi.fn(),
                update: vi.fn(),
                updateMany: vi.fn(),
                deleteMany: vi.fn(),
            },
            shortLinkClick: {
                findFirst: vi.fn(),
                findMany: vi.fn(),
                create: vi.fn(),
                count: vi.fn(),
                groupBy: vi.fn(),
                deleteMany: vi.fn(),
            },
            $queryRaw: vi.fn(),
        },
    };
});

// Mock Sentry — its real getEnv() pulls SUPABASE_SERVICE_ROLE_KEY / CRON_SECRET
// which aren't set in unit tests. Stub the surface the codebase uses.
vi.mock('@/lib/sentry', () => {
    return {
        initSentry: vi.fn(),
        captureException: vi.fn(),
        captureMessage: vi.fn(),
        setUser: vi.fn(),
        addBreadcrumb: vi.fn(),
        withSentry: <T extends (...args: unknown[]) => Promise<unknown>>(fn: T) => fn,
        default: {
            init: vi.fn(),
            captureException: vi.fn(),
            captureMessage: vi.fn(),
            setUser: vi.fn(),
            addBreadcrumb: vi.fn(),
            withSentry: <T extends (...args: unknown[]) => Promise<unknown>>(fn: T) => fn,
        },
    };
});

// Mock email service
vi.mock('@/lib/email-service', () => {
    return {
        sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
        sendConfirmationEmail: vi.fn().mockResolvedValue({ success: true }),
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
