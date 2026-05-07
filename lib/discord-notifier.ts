/**
 * Discord Notifier
 * 
 * Sends alerts and reports to Discord via webhook.
 * Used by monitoring systems for source health alerts,
 * daily quality reports, and ingestion summaries.
 */

import { sanitizeForDiscord } from './sanitize-for-discord';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

interface DiscordEmbed {
    title: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
}

/**
 * Send a message to Discord via webhook
 */
export async function sendDiscordMessage(content: string, embeds?: DiscordEmbed[]): Promise<boolean> {
    if (!DISCORD_WEBHOOK_URL) {
        console.warn('[Discord] DISCORD_WEBHOOK_URL not set — skipping notification');
        return false;
    }

    try {
        const res = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: content || undefined,
                embeds: embeds || undefined,
            }),
        });

        if (!res.ok) {
            console.error(`[Discord] Webhook failed: HTTP ${res.status}`);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[Discord] Failed to send:', error);
        return false;
    }
}

/**
 * Send a source health alert to Discord
 */
export async function sendHealthAlert(alerts: Array<{ source: string; alert: string; status: string }>): Promise<void> {
    if (alerts.length === 0) return;

    const embed: DiscordEmbed = {
        title: alerts.some(a => a.status === 'dead') ? '🚨 Source dead' : '⚠️ Source warning',
        description: alerts.map(a => a.alert).join('\n').slice(0, 1900),
        color: alerts.some(a => a.status === 'dead') ? 0xFF0000 : 0xFFAA00,
    };

    await sendDiscordMessage('', [embed]);
}

/**
 * Send daily quality report to Discord
 */
export async function sendDailyReport(stats: {
    totalPublished: number;
    addedLast24h: number;
    unpublishedLast24h: number;
    salaryPercent: number;
    cityPercent: number;
    avgQualityScore: number;
    topSources: Array<{ source: string; count: number }>;
    healthAlerts: string[];
}): Promise<void> {
    // Lean format: one-line description with the headline numbers, top
    // 3 sources inline, and an alerts field ONLY when something actually
    // needs attention. Coverage / quality scalars dropped — they live in
    // /admin/pipeline for anyone who actually wants to dig in.
    const topSourcesLine = stats.topSources
        .slice(0, 3)
        .map((s) => `${s.source} +${s.count}`)
        .join(' · ');

    const description = `+${stats.addedLast24h} added · −${stats.unpublishedLast24h} unpublished · ${stats.totalPublished.toLocaleString()} live`
        + (topSourcesLine ? `\n${topSourcesLine}` : '');

    const embed: DiscordEmbed = {
        title: stats.healthAlerts.length > 0 ? '📋 Daily report (with alerts)' : '📋 Daily report',
        description,
        color: stats.healthAlerts.length > 0 ? 0xFFAA00 : 0x00AA00,
        ...(stats.healthAlerts.length > 0
            ? { fields: [{ name: 'Alerts', value: stats.healthAlerts.join('\n').slice(0, 1020), inline: false }] }
            : {}),
    };

    await sendDiscordMessage('', [embed]);
}

// Removed 2026-05-06: sendIngestionSummary (the simpler version) was
// firing alongside the rich per-source summary in
// app/api/cron/ingest/route.ts on every cron firing — net effect was
// duplicate Discord embeds. The route's version is the single source
// of truth now.

/**
 * Send a cron-failure alert to Discord. Use from any cron's catch block
 * so an unhandled error or 500-level outcome surfaces to the team channel
 * instead of disappearing into Vercel function logs.
 *
 * Throttled internally — at most one alert per cron name per 30 minutes,
 * tracked via in-memory map. Vercel functions are stateless so this only
 * coalesces within a single run; cron-to-cron coalescing happens at the
 * Discord side via the channel rate limit.
 */
const cronAlertSeen = new Map<string, number>();

export async function sendCronFailureAlert(
    cronName: string,
    err: unknown,
    extras?: Record<string, string | number | undefined>,
): Promise<void> {
    const last = cronAlertSeen.get(cronName) ?? 0;
    if (Date.now() - last < 30 * 60 * 1000) return;
    cronAlertSeen.set(cronName, Date.now());

    // Sanitize before sending: cron failure errors can include DB URLs,
    // Bearer tokens, user emails, etc. Discord channels are persistent
    // and searchable — don't pipe raw error contents straight in.
    const rawMessage = err instanceof Error ? err.message : String(err);
    const message = sanitizeForDiscord(rawMessage).slice(0, 400);

    // Lean format: title carries the cron name, description carries the
    // error. Stack trace + extras dropped from the embed — they bloat
    // the channel for forensics that almost nobody actually uses.
    // Full stack is still in cron_runs.error and Vercel function logs.
    const embed: DiscordEmbed = {
        title: `🚨 ${cronName} failed`,
        description: '```\n' + message + '\n```',
        color: 0xFF0000,
    };
    await sendDiscordMessage('', [embed]);
    void extras; // intentionally not surfaced in the embed; logged via console where the cron throws
}
