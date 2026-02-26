import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limit';
import { verifyCsrf } from '@/lib/csrf';

/** Allowed image types — SVG intentionally excluded (can contain JavaScript) */
const ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
];

/** Magic byte signatures for image validation */
const IMAGE_MAGIC: Record<string, number[][]> = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/jpg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]],
};

function verifyImageMagicBytes(buffer: Buffer, fileType: string): boolean {
    const sigs = IMAGE_MAGIC[fileType];
    if (!sigs) return false;
    return sigs.some(sig =>
        sig.every((byte, i) => buffer.length > i && buffer[i] === byte)
    );
}

export async function POST(req: NextRequest) {
    // Rate limiting — 10 uploads per minute
    const rateLimitResult = await rateLimit(req, 'company-logo', { limit: 10, windowSeconds: 60 });
    if (rateLimitResult) return rateLimitResult;

    // CSRF protection
    const csrfResult = verifyCsrf(req);
    if (csrfResult) return csrfResult;

    try {
        // Auth check with the regular server client
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (file.size > 2 * 1024 * 1024) {
            return NextResponse.json({ error: 'File must be under 2MB' }, { status: 400 });
        }

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: 'Only JPEG, PNG, and WebP images are allowed (SVG not permitted)' },
                { status: 400 },
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Verify magic bytes to prevent MIME type spoofing
        if (!verifyImageMagicBytes(buffer, file.type)) {
            return NextResponse.json(
                { error: 'File content does not match declared image type' },
                { status: 400 },
            );
        }

        const ext = file.name.split('.').pop() || 'png';
        const fileName = `logo_${user.id}_${Date.now()}.${ext}`;

        // Use service role key to bypass RLS for storage uploads
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceRoleKey) {
            console.error('SUPABASE_SERVICE_ROLE_KEY is not set');
            return NextResponse.json(
                { error: 'Server configuration error — missing service role key' },
                { status: 500 }
            );
        }

        const adminClient = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey
        );

        const { data, error } = await adminClient.storage
            .from('company-logos')
            .upload(fileName, buffer, {
                contentType: file.type,
                cacheControl: '3600',
                upsert: false,
            });

        if (error) {
            console.error('Supabase storage upload error:', error);
            return NextResponse.json(
                { error: `Upload failed: ${error.message}` },
                { status: 500 }
            );
        }

        const { data: urlData } = adminClient.storage
            .from('company-logos')
            .getPublicUrl(data.path);

        return NextResponse.json({ url: urlData.publicUrl });
    } catch (err) {
        console.error('Logo upload error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
