import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limit';
import { verifyCsrf } from '@/lib/csrf';

const ALLOWED_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

/** Magic byte signatures for document validation */
const DOC_MAGIC: Record<string, number[][]> = {
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
    'application/msword': [
        [0xD0, 0xCF, 0x11, 0xE0], // Legacy DOC
        [0x50, 0x4B, 0x03, 0x04], // Some .doc are actually DOCX
    ],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
        [0x50, 0x4B, 0x03, 0x04], // PK (ZIP/DOCX)
        [0x50, 0x4B, 0x05, 0x06], // PK empty archive
    ],
};

function verifyDocMagicBytes(buffer: Buffer, fileType: string): boolean {
    const sigs = DOC_MAGIC[fileType];
    if (!sigs) return false;
    return sigs.some(sig =>
        sig.every((byte, i) => buffer.length > i && buffer[i] === byte)
    );
}

export async function POST(req: NextRequest) {
    // Rate limiting — 10 attachments per minute
    const rateLimitResult = await rateLimit(req, 'message-attachment', { limit: 10, windowSeconds: 60 });
    if (rateLimitResult) return rateLimitResult;

    // CSRF protection
    const csrfResult = verifyCsrf(req);
    if (csrfResult) return csrfResult;

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // The file.size guard below only runs once the body has already been
        // buffered, and request.formData() throws on a body far past the cap —
        // which fell to the outer catch and surfaced as a generic 500 "Internal
        // server error" instead of telling the user the file is too big. Refuse
        // on the declared length first, and treat an unparseable body as the
        // client error it is. The 64KB allowance covers multipart framing.
        const declaredLength = Number(req.headers.get('content-length') ?? '');
        if (Number.isFinite(declaredLength) && declaredLength > MAX_SIZE + 64 * 1024) {
            return NextResponse.json({ error: 'File must be under 5MB' }, { status: 413 });
        }

        let formData: FormData;
        try {
            formData = await req.formData();
        } catch {
            return NextResponse.json(
                { error: 'Could not read the uploaded file. Please try again.' },
                { status: 400 },
            );
        }
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: 'File must be under 5MB' }, { status: 400 });
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: 'Only PDF, DOC, and DOCX files are allowed' },
                { status: 400 },
            );
        }

        const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = `${user.id}/${Date.now()}_${sanitizedName}`;
        const buffer = Buffer.from(await file.arrayBuffer());

        // Verify magic bytes to prevent MIME type spoofing
        if (!verifyDocMagicBytes(buffer, file.type)) {
            return NextResponse.json(
                { error: 'File content does not match declared file type' },
                { status: 400 },
            );
        }

        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceRoleKey) {
            console.error('SUPABASE_SERVICE_ROLE_KEY is not set');
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 },
            );
        }

        const adminClient = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey,
        );

        // Auto-create bucket if it doesn't exist
        const { data: buckets } = await adminClient.storage.listBuckets();
        if (!buckets?.find(b => b.name === 'message-attachments')) {
            await adminClient.storage.createBucket('message-attachments', {
                public: false,
                fileSizeLimit: MAX_SIZE,
                allowedMimeTypes: ALLOWED_TYPES,
            });
        }

        const { data, error } = await adminClient.storage
            .from('message-attachments')
            .upload(fileName, buffer, {
                contentType: file.type,
                cacheControl: '3600',
                upsert: false,
            });

        if (error) {
            console.error('Attachment upload error:', error);
            return NextResponse.json(
                { error: 'Upload failed' },
                { status: 500 },
            );
        }

        // Generate a signed URL (1 hour expiry) instead of public URL
        const { data: signedData, error: signedError } = await adminClient.storage
            .from('message-attachments')
            .createSignedUrl(data.path, 3600); // 1 hour

        if (signedError || !signedData?.signedUrl) {
            console.error('Signed URL error:', signedError);
            return NextResponse.json(
                { error: 'Failed to generate download URL' },
                { status: 500 },
            );
        }

        return NextResponse.json({
            path: data.path,   // Store THIS in the DB — permanent storage path
            url: signedData.signedUrl, // Use for immediate display — expires in 1 hour
            name: file.name,
            size: file.size,
            type: file.type,
        });
    } catch (err) {
        console.error('Attachment upload error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
