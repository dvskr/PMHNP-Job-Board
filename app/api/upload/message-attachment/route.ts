import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const ALLOWED_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
    try {
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

        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: 'File must be under 5MB' }, { status: 400 });
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: 'Only PDF, DOC, and DOCX files are allowed' },
                { status: 400 },
            );
        }

        const ext = file.name.split('.').pop() || 'pdf';
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = `${user.id}/${Date.now()}_${sanitizedName}`;
        const buffer = Buffer.from(await file.arrayBuffer());

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
                public: true,
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
                { error: `Upload failed: ${error.message}` },
                { status: 500 },
            );
        }

        const { data: urlData } = adminClient.storage
            .from('message-attachments')
            .getPublicUrl(data.path);

        return NextResponse.json({
            url: urlData.publicUrl,
            name: file.name,
            size: file.size,
            type: file.type,
        });
    } catch (err) {
        console.error('Attachment upload error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
