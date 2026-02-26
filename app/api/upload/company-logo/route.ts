import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
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

        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
        }

        const ext = file.name.split('.').pop() || 'png';
        const fileName = `logo_${user.id}_${Date.now()}.${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());

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
