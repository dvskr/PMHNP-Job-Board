import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { logger } from '@/lib/logger';
import fs from 'fs/promises';
import path from 'path';

/**
 * GET /api/admin/cron-list — the schedules declared in vercel.json.
 *
 * Auth uses requireApiAdmin (JSON 401/403), not the page-style requireAdmin:
 * that helper signals rejection by THROWING a NEXT_REDIRECT, which the catch
 * below swallowed and reported as `500 {"error":"NEXT_REDIRECT"}` to anonymous
 * and non-admin callers. The redirect never happened, the status was wrong,
 * and the framework's internal error string was echoed to the client.
 */
export async function GET(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    try {
        const vercelJsonPath = path.join(process.cwd(), 'vercel.json');
        const raw = await fs.readFile(vercelJsonPath, 'utf-8').catch(() => null);
        if (raw === null) {
            return NextResponse.json({ crons: [] });
        }

        const vercelJson = JSON.parse(raw);
        return NextResponse.json({ crons: vercelJson.crons || [] });
    } catch (err) {
        logger.error('[admin/cron-list] failed to read cron schedules', err);
        return NextResponse.json({ error: 'Failed to read cron schedules' }, { status: 500 });
    }
}
