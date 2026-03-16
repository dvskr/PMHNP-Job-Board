import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    version: string;
    checks: {
        database: {
            status: 'up' | 'down';
            latencyMs?: number;
            error?: string;
        };
    };
}

export async function GET(): Promise<NextResponse<HealthStatus>> {
    const startTime = Date.now();
    const healthStatus: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        checks: {
            database: { status: 'up' },
        },
    };

    // Check database connectivity
    try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        healthStatus.checks.database.latencyMs = Date.now() - dbStart;
    } catch (error) {
        healthStatus.checks.database.status = 'down';
        healthStatus.checks.database.error = error instanceof Error ? error.message : 'Unknown error';
        healthStatus.status = 'unhealthy';

        logger.error('Health check failed: Database unreachable', error);
    }

    // Determine overall status
    const allChecksUp = Object.values(healthStatus.checks).every(
        (check) => check.status === 'up'
    );

    if (!allChecksUp) {
        healthStatus.status = 'unhealthy';
    }

    const responseStatus = healthStatus.status === 'healthy' ? 200 : 503;

    logger.debug('Health check completed', {
        status: healthStatus.status,
        latencyMs: Date.now() - startTime,
    });

    return NextResponse.json(healthStatus, { status: responseStatus });
}
