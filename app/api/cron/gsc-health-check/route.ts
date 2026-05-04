import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert, sendDiscordMessage } from '@/lib/discord-notifier';
import { createSign } from 'node:crypto';

export const maxDuration = 60;

/**
 * P4.2: daily GSC Coverage snapshot + regression alert.
 *
 * What it does:
 *   1. Pulls Search Analytics (last 1 day, no dimensions) to record
 *      total impressions for the day → goes into `raw` JSON
 *   2. Pulls each error category total via the URL Inspection API is NOT
 *      bulk-queryable, so for the full-coverage breakdown we currently rely
 *      on the user uploading GSC bulk exports (see seed-deindex-queue.ts).
 *      THIS CRON only tracks the Search Analytics aggregate signal:
 *        - Total impressions / clicks / CTR (proxies for search visibility)
 *      and stores those in gsc_snapshots.raw.
 *   3. Compares today vs 7 days ago. Alerts via Discord if:
 *        - clicks drop > 20% week-over-week
 *        - impressions drop > 15% week-over-week
 *
 * Auth required:
 *   GSC_SERVICE_ACCOUNT_KEY env var = JSON-stringified service account JSON
 *      (or falls back to GOOGLE_INDEXING_CREDENTIALS — same service account
 *      JSON, different OAuth scope at token-exchange time. The service
 *      account must also be added as a "Restricted" user in GSC →
 *      Settings → Users and permissions → with the property selected.)
 *   GSC_SITE_URL env var = "sc-domain:pmhnphiring.com" or
 *                          "https://pmhnphiring.com/"  (default if not set)
 *
 * If env vars are missing, the cron logs and exits 200 (skipped, not failed)
 * so missing setup doesn't trigger noise.
 *
 * Schedule: 30 9 * * * (09:30 UTC, after Google's overnight index processing).
 */
export async function GET(request: NextRequest) {
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    const startTime = Date.now();
    // Prefer GSC_SERVICE_ACCOUNT_KEY; fall back to GOOGLE_INDEXING_CREDENTIALS
    // since the same service account JSON works for both APIs (Search Console
    // needs auth/webmasters.readonly scope; Indexing API needs auth/indexing).
    const keyJsonRaw = process.env.GSC_SERVICE_ACCOUNT_KEY ?? process.env.GOOGLE_INDEXING_CREDENTIALS;
    const siteUrl = process.env.GSC_SITE_URL || 'sc-domain:pmhnphiring.com';

    if (!keyJsonRaw) {
        console.log('[CRON:gsc-health-check] Skipped — neither GSC_SERVICE_ACCOUNT_KEY nor GOOGLE_INDEXING_CREDENTIALS configured.');
        return NextResponse.json({
            success: true,
            skipped: true,
            reason: 'no service account key configured',
            timestamp: new Date().toISOString(),
        });
    }
    // Decode if base64-encoded (matches the existing pattern in lib/search-indexing.ts).
    let keyJson: string;
    try {
        JSON.parse(keyJsonRaw);
        keyJson = keyJsonRaw;
    } catch {
        keyJson = Buffer.from(keyJsonRaw, 'base64').toString('utf-8');
    }

    try {
        const accessToken = await getAccessToken(keyJson);

        // Today's totals (yesterday is the latest fully-processed day)
        const yesterday = isoDate(daysAgo(1));
        const last7DaysAgo = isoDate(daysAgo(7));

        const todayRow = await fetchSearchAnalytics(accessToken, siteUrl, yesterday, yesterday);
        const weekAgoRow = await fetchSearchAnalytics(accessToken, siteUrl, last7DaysAgo, last7DaysAgo);

        const todayClicks = todayRow?.clicks ?? 0;
        const todayImpressions = todayRow?.impressions ?? 0;
        const weekAgoClicks = weekAgoRow?.clicks ?? 0;
        const weekAgoImpressions = weekAgoRow?.impressions ?? 0;

        // Persist a snapshot row. Stringify+parse to coerce the typed
        // SearchAnalyticsAggregate into Prisma's structural InputJsonValue.
        const rawPayload = JSON.parse(
            JSON.stringify({ searchAnalytics: { today: todayRow, weekAgo: weekAgoRow } })
        );
        await prisma.gscSnapshot.upsert({
            where: { capturedOn: new Date(yesterday) },
            update: { raw: rawPayload },
            create: { capturedOn: new Date(yesterday), raw: rawPayload },
        });

        // Regression detection.
        const alerts: string[] = [];
        if (weekAgoClicks > 0) {
            const clickDelta = (todayClicks - weekAgoClicks) / weekAgoClicks;
            if (clickDelta < -0.20) {
                alerts.push(`📉 GSC clicks dropped ${(clickDelta * 100).toFixed(1)}% week-over-week (${weekAgoClicks} → ${todayClicks})`);
            }
        }
        if (weekAgoImpressions > 0) {
            const imprDelta = (todayImpressions - weekAgoImpressions) / weekAgoImpressions;
            if (imprDelta < -0.15) {
                alerts.push(`📉 GSC impressions dropped ${(imprDelta * 100).toFixed(1)}% week-over-week (${weekAgoImpressions} → ${todayImpressions})`);
            }
        }

        if (alerts.length > 0) {
            await sendDiscordMessage('', [
                {
                    title: '⚠ GSC Health Check — Regression Detected',
                    description: alerts.join('\n'),
                    color: 0xFFAA00,
                    timestamp: new Date().toISOString(),
                },
            ]);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return NextResponse.json({
            success: true,
            today: { clicks: todayClicks, impressions: todayImpressions },
            weekAgo: { clicks: weekAgoClicks, impressions: weekAgoImpressions },
            alerts,
            duration: `${duration}s`,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        await sendCronFailureAlert('gsc-health-check', error);
        console.error('[CRON:gsc-health-check] Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'GSC health check failed',
                details: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d;
}

function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

async function getAccessToken(serviceAccountKey: string): Promise<string> {
    const key = JSON.parse(serviceAccountKey) as {
        client_email: string;
        private_key: string;
    };
    const now = Math.floor(Date.now() / 1000);
    const claim = {
        iss: key.client_email,
        scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    };
    const header = { alg: 'RS256', typ: 'JWT' };
    const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsignedJwt = `${b64(header)}.${b64(claim)}`;
    const sign = createSign('RSA-SHA256');
    sign.update(unsignedJwt);
    const signature = sign.sign(key.private_key, 'base64url');
    const jwt = `${unsignedJwt}.${signature}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }),
    });
    if (!tokenRes.ok) {
        throw new Error(`OAuth failed: ${await tokenRes.text()}`);
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    return access_token;
}

interface SearchAnalyticsAggregate {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

async function fetchSearchAnalytics(
    token: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
): Promise<SearchAnalyticsAggregate | null> {
    const res = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                startDate,
                endDate,
                rowLimit: 1,
                // No dimensions = aggregate over all queries / pages.
            }),
        }
    );
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Search Analytics ${startDate}: ${res.status} ${txt}`);
    }
    const data = (await res.json()) as { rows?: SearchAnalyticsAggregate[] };
    return data.rows?.[0] ?? null;
}
