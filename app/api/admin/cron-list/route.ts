import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/protect';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        await requireAdmin();

        // Read vercel.json from project root
        const vercelJsonPath = path.join(process.cwd(), 'vercel.json');
        
        if (!fs.existsSync(vercelJsonPath)) {
            return NextResponse.json({ crons: [] });
        }

        const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
        
        return NextResponse.json({
            crons: vercelJson.crons || []
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
