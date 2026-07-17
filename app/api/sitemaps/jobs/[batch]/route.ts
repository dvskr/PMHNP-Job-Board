/**
 * Batched job-detail sitemap — serves /jobs/{slug}-{uuid} URLs in batches.
 *
 * Why this exists: the primary sitemap (app/sitemap.ts) used to dump every
 * active job into one file uncapped. Google's per-sitemap limit is 50,000
 * URLs; if we cross it, Google rejects the *entire* sitemap and stops
 * recrawling everything. This route mirrors the cities batch pattern to
 * keep each sitemap file under the limit regardless of ingestion volume.
 *
 * BATCH_SIZE=25000 keeps each file well under the URL cap and the 50MB
 * uncompressed byte limit (each <url> block ≈ 200 bytes → ~5MB max).
 *
 * Routes:
 *   /api/sitemaps/jobs/0  → first 25K active jobs (highest qualityScore first)
 *   /api/sitemaps/jobs/1  → next 25K
 *   ...
 *
 * Ordering matches the previous primary-sitemap behavior: qualityScore desc,
 * createdAt desc — so Google crawls the strongest URLs first when a batch
 * is partially fetched.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { activeIndexableJobWhere } from '@/lib/active-job-filter';
import { slugify } from '@/lib/utils';

const BATCH_SIZE = 25000;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

// GSC Fix (2026-07 audit): jobs within 7 days of expiry are excluded from
// this sitemap — Google's median index latency exceeds their remaining
// lifetime, so advertising them spends crawl budget on URLs that will 410
// before earning an impression. Must stay in lockstep with the job-batch
// count in /api/sitemaps/index. (Previously the where-clause was built at
// module scope, freezing `now` at cold start — it's now built per request.)
const SITEMAP_EXPIRY_BUFFER_DAYS = 7;

interface JobBatchRow {
    id: string;
    title: string;
    slug: string | null;
    updatedAt: Date;
}

// GSC Fix (2026-07 audit, review finding): the sitemap must advertise the
// SAME URL the page emits as its canonical — app/jobs/[slug]/page.tsx uses
// `job.slug || slugify(title, id)`. The previous local slug computation
// diverged from stored slugs (different algorithm), so the sitemap
// systematically advertised non-canonical variant URLs. Stored slug wins;
// the shared slugify is only the legacy null-slug fallback.
function jobSlug(job: JobBatchRow): string {
    return job.slug || slugify(job.title, job.id);
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ batch: string }> },
) {
    const { batch: batchStr } = await params;
    const batchIndex = parseInt(batchStr, 10);

    if (isNaN(batchIndex) || batchIndex < 0) {
        return NextResponse.json({ error: 'Invalid batch index' }, { status: 404 });
    }

    // Published, not expired (with the near-expiry buffer), not a dead link.
    const activeJobWhere = activeIndexableJobWhere(new Date(), { expiryBufferDays: SITEMAP_EXPIRY_BUFFER_DAYS });

    // Cheap count first to validate batch index without paying the full findMany.
    const totalJobs = await prisma.job.count({ where: activeJobWhere });
    const totalBatches = Math.max(1, Math.ceil(totalJobs / BATCH_SIZE));

    if (batchIndex >= totalBatches) {
        return NextResponse.json({ error: 'Invalid batch index' }, { status: 404 });
    }

    const skip = batchIndex * BATCH_SIZE;
    const jobs: JobBatchRow[] = await prisma.job.findMany({
        where: activeJobWhere,
        select: { id: true, title: true, slug: true, updatedAt: true },
        orderBy: [
            { qualityScore: 'desc' },
            { createdAt: 'desc' },
        ],
        skip,
        take: BATCH_SIZE,
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${jobs.map(j => {
        const lastmod = j.updatedAt.toISOString();
        return `  <url>
    <loc>${BASE_URL}/jobs/${jobSlug(j)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }).join('\n')}
</urlset>`;

    return new NextResponse(xml, {
        headers: {
            'Content-Type': 'application/xml',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
    });
}
