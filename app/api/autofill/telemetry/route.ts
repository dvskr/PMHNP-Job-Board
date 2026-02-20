import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyExtensionToken } from '@/lib/verify-extension-token';

/**
 * POST /api/autofill/telemetry
 * 
 * Receives field-level telemetry from the autofill extension.
 * Each entry records whether a field was matched deterministically, by AI, or unmatched.
 * This data enables pattern analysis and auto-promotion of AI patterns to deterministic rules.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await verifyExtensionToken(req);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { entries } = body;

        if (!entries || !Array.isArray(entries) || entries.length === 0) {
            return NextResponse.json({ error: 'entries array is required' }, { status: 400 });
        }

        // Limit batch size to prevent abuse
        const maxEntries = 200;
        const batch = entries.slice(0, maxEntries);

        // Insert all telemetry entries in a single transaction
        const result = await prisma.autofillTelemetry.createMany({
            data: batch.map((entry: {
                timestamp?: string;
                pageDomain?: string;
                atsName?: string;
                fieldName?: string;
                fieldLabel?: string;
                fieldType?: string;
                matchMethod?: string;
                profileKey?: string;
                valueSample?: string;
                confidence?: number;
                filled?: boolean;
            }) => ({
                userId: user.userId,
                timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
                atsDomain: entry.pageDomain || entry.atsName || null,
                fieldName: (entry.fieldName || '').substring(0, 255),
                fieldLabel: (entry.fieldLabel || '').substring(0, 255),
                fieldType: (entry.fieldType || 'unknown').substring(0, 50),
                matchMethod: entry.matchMethod || 'unmatched',
                profileKey: entry.profileKey || null,
                valueSample: entry.valueSample ? entry.valueSample.substring(0, 100) : null,
                confidence: entry.confidence || 0,
                filled: entry.filled || false,
            })),
            skipDuplicates: true,
        });

        return NextResponse.json({
            received: result.count,
            truncated: entries.length > maxEntries,
        });
    } catch (error) {
        console.error('Telemetry ingest error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
