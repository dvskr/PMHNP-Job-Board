/**
 * Discord Notifier
 * 
 * Sends alerts and reports to Discord via webhook.
 * Used by monitoring systems for source health alerts,
 * daily quality reports, and ingestion summaries.
 */

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
        title: '🚨 Source Health Alert',
        description: alerts.map(a => a.alert).join('\n'),
        color: alerts.some(a => a.status === 'dead') ? 0xFF0000 : 0xFFAA00, // Red for dead, orange for warning
        timestamp: new Date().toISOString(),
        footer: { text: 'PMHNP Job Board — Ingestion Monitor' },
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
    const fields: Array<{ name: string; value: string; inline: boolean }> = [
        { name: '📊 Total Published', value: stats.totalPublished.toLocaleString(), inline: true },
        { name: '➕ Added (24h)', value: stats.addedLast24h.toString(), inline: true },
        { name: '➖ Unpublished (24h)', value: stats.unpublishedLast24h.toString(), inline: true },
        { name: '💰 Salary Coverage', value: `${stats.salaryPercent}%`, inline: true },
        { name: '📍 City Coverage', value: `${stats.cityPercent}%`, inline: true },
        { name: '⭐ Avg Quality', value: stats.avgQualityScore.toFixed(1), inline: true },
    ];

    // Top sources
    if (stats.topSources.length > 0) {
        const topList = stats.topSources
            .slice(0, 5)
            .map((s, i) => `${i + 1}. ${s.source}: ${s.count}`)
            .join('\n');
        fields.push({ name: '🏆 Top Sources (24h)', value: topList, inline: false });
    }

    // Health alerts
    if (stats.healthAlerts.length > 0) {
        fields.push({ name: '⚠️ Alerts', value: stats.healthAlerts.join('\n'), inline: false });
    }

    const embed: DiscordEmbed = {
        title: '📋 Daily Job Board Report',
        color: stats.healthAlerts.length > 0 ? 0xFFAA00 : 0x00AA00, // Orange if alerts, green if clean
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'PMHNP Job Board — Daily Report' },
    };

    await sendDiscordMessage('', [embed]);
}

/**
 * Send ingestion completion summary to Discord
 */
export async function sendIngestionSummary(results: Array<{
    source: string;
    fetched: number;
    added: number;
    duplicates: number;
    errors: number;
    duration: number;
}>): Promise<void> {
    const totalAdded = results.reduce((s, r) => s + r.added, 0);
    const totalFetched = results.reduce((s, r) => s + r.fetched, 0);
    const totalDuration = results.reduce((s, r) => s + r.duration, 0);

    // Only send to Discord if we added jobs or had errors
    const totalErrors = results.reduce((s, r) => s + r.errors, 0);
    if (totalAdded === 0 && totalErrors === 0) return;

    const topAdders = results
        .filter(r => r.added > 0)
        .sort((a, b) => b.added - a.added)
        .slice(0, 5)
        .map(r => `${r.source}: +${r.added}`)
        .join(', ');

    const embed: DiscordEmbed = {
        title: totalErrors > 0 ? '⚠️ Ingestion Complete (with errors)' : '✅ Ingestion Complete',
        color: totalErrors > 0 ? 0xFFAA00 : 0x00AA00,
        fields: [
            { name: 'Fetched', value: totalFetched.toLocaleString(), inline: true },
            { name: 'Added', value: `+${totalAdded}`, inline: true },
            { name: 'Duration', value: `${(totalDuration / 1000).toFixed(0)}s`, inline: true },
            { name: 'Top Sources', value: topAdders || 'None', inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'PMHNP Job Board — Ingestion' },
    };

    if (totalErrors > 0) {
        const errorSources = results.filter(r => r.errors > 0).map(r => `${r.source}: ${r.errors}`).join(', ');
        embed.fields!.push({ name: '❌ Errors', value: errorSources, inline: false });
    }

    await sendDiscordMessage('', [embed]);
}
