/**
 * Backfill: re-encode existing employer logos to high-quality WebP.
 *
 * For every distinct Supabase-hosted logoUrl in EmployerJob.companyLogoUrl
 * and Company.logoUrl, this script:
 *   1. Fetches the original bytes from the public Supabase URL
 *   2. Runs sharp: auto-rotate (EXIF), resize to 512px max edge, WebP q=90
 *   3. Uploads as a new `logo_<id>_<ts>.webp` object
 *   4. Updates every DB row pointing at the old URL to the new one
 *   5. (with --delete-old) removes the original Supabase object
 *
 * Safety:
 *   - Default is dry-run; pass `--apply` to mutate.
 *   - Skips URLs that already look like a `.webp` file uploaded after the
 *     server-side WebP conversion went live (those are already optimized).
 *   - Skips non-Supabase URLs (we don't own them).
 *   - On any per-logo failure, the original URL is left untouched so the
 *     job card keeps rendering — partial progress is recoverable.
 *
 *   npx tsx scripts/backfill-logos-webp.ts [--env=prod] [--apply] [--delete-old]
 */
import { config as dotenvConfig } from 'dotenv';
const isProd = process.argv.includes('--env=prod');
const apply = process.argv.includes('--apply');
const deleteOld = process.argv.includes('--delete-old');
if (isProd) {
    dotenvConfig({ path: '.env.prod' });
    if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
    if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
    if (process.env.PROD_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.PROD_SUPABASE_URL;
    if (process.env.PROD_SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
} else {
    dotenvConfig({ path: '.env' });
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
const sharp = require('sharp') as typeof import('sharp').default;
const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
/* eslint-enable @typescript-eslint/no-require-imports */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'company-logos';
const MAX_EDGE = 512;
const QUALITY = 90;

interface LogoUsage {
    url: string;
    employerJobIds: string[];
    companyIds: string[];
}

function isSupabaseLogoUrl(url: string): boolean {
    if (!url) return false;
    try {
        const u = new URL(url);
        return u.hostname.endsWith('.supabase.co') && u.pathname.includes(`/${BUCKET}/`);
    } catch {
        return false;
    }
}

function extractStoragePath(url: string): string | null {
    // Public URL shape: https://<proj>.supabase.co/storage/v1/object/public/company-logos/<path>
    const m = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+?)(\?|$)/);
    return m ? decodeURIComponent(m[1]) : null;
}

function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function main(): Promise<void> {
    if (!SUPABASE_URL || !SERVICE_KEY) {
        console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY env vars');
        process.exit(1);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    console.log(`env=${isProd ? 'prod' : 'dev'}  mode=${apply ? 'APPLY' : 'dry-run'}  deleteOld=${deleteOld}`);
    console.log('');

    // Collect every (url, source) reference so we can update all DB rows
    // atomically after a successful re-encode + upload.
    const jobs = await prisma.employerJob.findMany({
        where: { companyLogoUrl: { not: null } },
        select: { id: true, companyLogoUrl: true },
    });
    const companies = await prisma.company.findMany({
        where: { logoUrl: { not: null } },
        select: { id: true, logoUrl: true },
    });

    const byUrl = new Map<string, LogoUsage>();
    for (const j of jobs) {
        if (!j.companyLogoUrl) continue;
        const e = byUrl.get(j.companyLogoUrl) ?? { url: j.companyLogoUrl, employerJobIds: [], companyIds: [] };
        e.employerJobIds.push(j.id);
        byUrl.set(j.companyLogoUrl, e);
    }
    for (const c of companies) {
        if (!c.logoUrl) continue;
        const e = byUrl.get(c.logoUrl) ?? { url: c.logoUrl, employerJobIds: [], companyIds: [] };
        e.companyIds.push(c.id);
        byUrl.set(c.logoUrl, e);
    }

    const all = Array.from(byUrl.values());
    const processable = all.filter((u) => isSupabaseLogoUrl(u.url) && !u.url.toLowerCase().endsWith('.webp'));
    const skippedExternal = all.filter((u) => !isSupabaseLogoUrl(u.url));
    const skippedAlreadyWebp = all.filter((u) => isSupabaseLogoUrl(u.url) && u.url.toLowerCase().endsWith('.webp'));

    console.log(`  ${all.length} distinct logoUrls`);
    console.log(`    ${processable.length} eligible for re-encode`);
    console.log(`    ${skippedAlreadyWebp.length} already .webp — skipped`);
    console.log(`    ${skippedExternal.length} non-Supabase — skipped`);
    console.log('');

    let totalBefore = 0;
    let totalAfter = 0;
    let succeeded = 0;
    let failed = 0;
    let dbRowsUpdated = 0;

    for (const u of processable) {
        try {
            const res = await fetch(u.url);
            if (!res.ok) {
                console.log(`  ❌  fetch ${res.status}  ${u.url}`);
                failed++;
                continue;
            }
            const originalBuf = Buffer.from(await res.arrayBuffer());
            const originalSize = originalBuf.length;

            const webpBuf = await sharp(originalBuf, { failOn: 'error' })
                .rotate()
                .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: QUALITY, effort: 6 })
                .toBuffer();

            totalBefore += originalSize;
            totalAfter += webpBuf.length;

            const oldPath = extractStoragePath(u.url);
            // Re-use the user-id portion from the legacy filename when we can
            // ("logo_<uid>_<ts>.png" → "logo_<uid>_<ts>.webp"), so the new
            // object stays attributable to the same uploader.
            const stem = oldPath ? oldPath.replace(/\.[^/.]+$/, '') : `logo_backfill_${Date.now()}`;
            const newPath = `${stem}_webp_${Date.now()}.webp`;

            const refCount = u.employerJobIds.length + u.companyIds.length;
            const savedPct = ((1 - webpBuf.length / originalSize) * 100).toFixed(0);
            console.log(
                `  ${apply ? '🔄' : '👀'}  ${fmtBytes(originalSize).padStart(8)} → ${fmtBytes(webpBuf.length).padStart(8)}  (${savedPct}% smaller)  refs=${refCount}  ${oldPath ?? '(?)'}`
            );

            if (!apply) {
                succeeded++;
                continue;
            }

            const { error: uploadErr } = await admin.storage.from(BUCKET).upload(newPath, webpBuf, {
                contentType: 'image/webp',
                cacheControl: '3600',
                upsert: false,
            });
            if (uploadErr) {
                console.log(`        ❌  upload failed: ${uploadErr.message}`);
                failed++;
                continue;
            }

            const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(newPath);
            const newUrl = urlData.publicUrl;

            // Update all referencing DB rows BEFORE deleting the old object,
            // so a delete failure doesn't orphan rows pointing at nothing.
            if (u.employerJobIds.length > 0) {
                await prisma.employerJob.updateMany({
                    where: { id: { in: u.employerJobIds } },
                    data: { companyLogoUrl: newUrl },
                });
                dbRowsUpdated += u.employerJobIds.length;
            }
            if (u.companyIds.length > 0) {
                await prisma.company.updateMany({
                    where: { id: { in: u.companyIds } },
                    data: { logoUrl: newUrl },
                });
                dbRowsUpdated += u.companyIds.length;
            }

            if (deleteOld && oldPath) {
                const { error: delErr } = await admin.storage.from(BUCKET).remove([oldPath]);
                if (delErr) {
                    console.log(`        ⚠️   old object delete failed (DB already updated): ${delErr.message}`);
                }
            }

            succeeded++;
        } catch (err) {
            console.log(`  ❌  ${(err as Error).message}  ${u.url}`);
            failed++;
        }
    }

    const saved = totalBefore - totalAfter;
    const savedPct = totalBefore > 0 ? ((saved / totalBefore) * 100).toFixed(1) : '0.0';
    console.log('');
    console.log(`  ${succeeded} ${apply ? 'processed' : 'eligible'}, ${failed} failed`);
    console.log(`  ${dbRowsUpdated} DB rows updated`);
    console.log(`  bytes:  ${fmtBytes(totalBefore)}  →  ${fmtBytes(totalAfter)}  (saved ${fmtBytes(saved)}, ${savedPct}%)`);
    if (!apply) {
        console.log('');
        console.log('  ⚠  dry-run: re-run with --apply to mutate storage + DB');
        console.log('     add --delete-old to also remove the original objects');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
