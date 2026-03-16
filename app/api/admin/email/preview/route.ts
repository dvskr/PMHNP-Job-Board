import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { buildBroadcastHtml } from '@/lib/email-service';

/**
 * POST /api/admin/email/preview
 * Renders the email HTML with sample data for preview.
 */
export async function POST(req: Request) {
    const authError = await requireApiAdmin();
    if (authError) return authError;

    try {
        const { subject, body } = await req.json();

        if (!subject || !body) {
            return NextResponse.json({ success: false, error: 'Subject and body required' }, { status: 400 });
        }

        // Convert markdown-ish body to HTML (same as broadcast-sender)
        const bodyHtml = body
            .split(/\n{2,}/)
            .map((para: string) => {
                let html = para.trim();
                html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
                html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #2DD4BF; text-decoration: none;">$1</a>');
                html = html.replace(/\n/g, '<br>');
                return `<p style="margin: 0 0 16px;">${html}</p>`;
            })
            .join('\n');

        // Replace merge tags with sample data
        const sampleBody = bodyHtml
            .replace(/\{\{firstName\}\}/g, 'Sarah')
            .replace(/\{\{email\}\}/g, 'sarah@example.com');

        const sampleSubject = subject
            .replace(/\{\{firstName\}\}/g, 'Sarah')
            .replace(/\{\{email\}\}/g, 'sarah@example.com');

        const html = buildBroadcastHtml(sampleBody, sampleSubject);

        return NextResponse.json({ success: true, html, subject: sampleSubject });
    } catch (error) {
        console.error('[Admin Email Preview] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to generate preview' }, { status: 500 });
    }
}
