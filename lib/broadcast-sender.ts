import { prisma } from '@/lib/prisma';
import { sendBroadcastEmail, buildBroadcastHtml } from '@/lib/email-service';
import { logger } from '@/lib/logger';

// ── Rate limiting config (Resend Pro: 10/sec) ──────────────────
const BATCH_SIZE = 10;
const EMAIL_DELAY_MS = 150;  // 150ms between emails (~6.6/sec, safe margin)
const BATCH_DELAY_MS = 2000;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Replace merge tags in subject/body with real recipient data.
 */
function personalize(text: string, data: { email: string; firstName?: string | null }): string {
    return text
        .replace(/\{\{firstName\}\}/g, data.firstName || 'there')
        .replace(/\{\{email\}\}/g, data.email);
}

/**
 * Convert simple markdown-ish body text to email-safe HTML.
 * Handles: paragraphs, bold, italic, links, line breaks.
 */
function markdownToEmailHtml(md: string): string {
    return md
        .split(/\n{2,}/)
        .map(para => {
            let html = para.trim();
            // Bold
            html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            // Italic
            html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
            // Links [text](url)
            html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #2DD4BF; text-decoration: none;">$1</a>');
            // Line breaks
            html = html.replace(/\n/g, '<br>');
            return `<p style="margin: 0 0 16px;">${html}</p>`;
        })
        .join('\n');
}

export interface BroadcastProgress {
    broadcastId: string;
    total: number;
    sent: number;
    failed: number;
    status: 'sending' | 'sent' | 'failed';
}

/**
 * Execute a broadcast send. Called from the API route.
 * Processes all pending recipients for the given broadcast.
 */
export async function executeBroadcast(broadcastId: string): Promise<BroadcastProgress> {
    const broadcast = await prisma.emailBroadcast.findUnique({
        where: { id: broadcastId },
    });

    if (!broadcast) {
        throw new Error(`Broadcast ${broadcastId} not found`);
    }

    // Mark as sending
    await prisma.emailBroadcast.update({
        where: { id: broadcastId },
        data: { status: 'sending' },
    });

    const recipients = await prisma.emailBroadcastRecipient.findMany({
        where: { broadcastId, status: 'pending' },
    });

    let sent = broadcast.sentCount;
    let failed = broadcast.failedCount;

    // Pre-render the base HTML (merge tags still present for per-recipient personalization)
    const bodyHtml = markdownToEmailHtml(broadcast.body);

    // Process in batches
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);

        for (const recipient of batch) {
            const personalizedBody = personalize(bodyHtml, {
                email: recipient.email,
                firstName: recipient.firstName,
            });
            const personalizedSubject = personalize(broadcast.subject, {
                email: recipient.email,
                firstName: recipient.firstName,
            });

            const html = buildBroadcastHtml(personalizedBody, personalizedSubject);

            // Send with retry
            let success = false;
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                const result = await sendBroadcastEmail(recipient.email, personalizedSubject, html);

                if (result.success) {
                    success = true;
                    break;
                }

                const isRateLimit = result.error?.includes('429') || result.error?.includes('rate') || result.error?.includes('Too Many');
                if (isRateLimit && attempt < MAX_RETRIES) {
                    const backoff = EMAIL_DELAY_MS * Math.pow(2, attempt);
                    logger.warn(`[Broadcast] Rate limited for ${recipient.email}, retrying in ${backoff}ms`);
                    await sleep(backoff);
                } else {
                    // Mark failed
                    await prisma.emailBroadcastRecipient.update({
                        where: { id: recipient.id },
                        data: { status: 'failed', error: result.error || 'Unknown error' },
                    });
                    failed++;
                    logger.error(`[Broadcast] Failed to send to ${recipient.email}`, null, { error: result.error });
                    break;
                }
            }

            if (success) {
                await prisma.emailBroadcastRecipient.update({
                    where: { id: recipient.id },
                    data: { status: 'sent', sentAt: new Date() },
                });
                sent++;
            }

            // Delay between individual emails
            await sleep(EMAIL_DELAY_MS);
        }

        // Update progress after each batch
        await prisma.emailBroadcast.update({
            where: { id: broadcastId },
            data: { sentCount: sent, failedCount: failed },
        });

        // Delay between batches
        if (i + BATCH_SIZE < recipients.length) {
            await sleep(BATCH_DELAY_MS);
        }
    }

    // Final status
    const finalStatus = failed > 0 && sent === 0 ? 'failed' : 'sent';
    await prisma.emailBroadcast.update({
        where: { id: broadcastId },
        data: {
            status: finalStatus,
            sentAt: new Date(),
            sentCount: sent,
            failedCount: failed,
        },
    });

    logger.info(`[Broadcast] Complete: ${sent} sent, ${failed} failed`, { broadcastId });

    return {
        broadcastId,
        total: recipients.length,
        sent,
        failed,
        status: finalStatus,
    };
}
