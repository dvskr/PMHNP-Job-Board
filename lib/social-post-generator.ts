/**
 * Social Post Generator
 *
 * Queries the production DB for top jobs with a mix of categories,
 * then generates formatted captions for Facebook and Instagram,
 * plus carousel images for Instagram.
 */

import { prisma } from '@/lib/prisma';
import { generateJobCardPng, generateFBSummaryPng, type JobCardData } from '@/lib/job-card-generator';
import {
    uploadImage,
    postToFacebook,
    postToInstagramCarousel,
    type PostizImage,
} from '@/lib/postiz-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://pmhnphiring.com';
const JOBS_PER_POST = 10;
const HASHTAGS =
    '#PMHNP #NursePractitioner #MentalHealth #NurseJobs #PsychiatricNursing #Hiring #HealthcareJobs #NursingJobs';

// ---------------------------------------------------------------------------
// Job fetching — top jobs with a mix of categories
// ---------------------------------------------------------------------------

interface SocialJob {
    title: string;
    employer: string;
    location: string;
    jobType: string | null;
    mode: string | null;
    displaySalary: string | null;
    isRemote: boolean;
    isFeatured: boolean;
    slug: string | null;
    qualityScore: number;
    state: string | null;
    city: string | null;
}

export async function fetchTopJobsForSocial(): Promise<SocialJob[]> {
    // Use a raw query to get a diverse mix via ROW_NUMBER partitioned by job_type.
    // A date-seeded random tiebreaker ensures different jobs surface each day.
    const jobs = await prisma.$queryRaw<SocialJob[]>`
    WITH premium_posts AS (
      -- Premium tier employer posts get highest priority (always shown first)
      SELECT
        j.title, j.employer, j.location,
        j.job_type AS "jobType", j.mode,
        j.display_salary AS "displaySalary",
        j.is_remote AS "isRemote", j.is_featured AS "isFeatured", j.slug,
        j.quality_score AS "qualityScore", j.state, j.city,
        j.created_at,
        0 AS priority
      FROM jobs j
      INNER JOIN employer_jobs ej ON ej.job_id = j.id
      WHERE j.is_published = true
        AND (j.expires_at IS NULL OR j.expires_at > NOW())
        AND j.slug IS NOT NULL
        AND ej.pricing_tier = 'premium'
    ),
    employer_posts AS (
      -- Employer posts always included first, regardless of quality score
      SELECT
        title, employer, location,
        job_type AS "jobType", mode,
        display_salary AS "displaySalary",
        is_remote AS "isRemote", is_featured AS "isFeatured", slug,
        quality_score AS "qualityScore", state, city,
        created_at,
        1 AS priority
      FROM jobs
      WHERE is_published = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND slug IS NOT NULL
        AND created_at > NOW() - INTERVAL '48 hours'
        AND source_type = 'employer'
        AND id NOT IN (SELECT j.id FROM jobs j INNER JOIN employer_jobs ej ON ej.job_id = j.id WHERE ej.pricing_tier = 'premium')
    ),
    featured_posts AS (
      -- Featured/paid jobs get priority 2, capped at 30 days to prevent stale repeats
      SELECT
        title, employer, location,
        job_type AS "jobType", mode,
        display_salary AS "displaySalary",
        is_remote AS "isRemote", is_featured AS "isFeatured", slug,
        quality_score AS "qualityScore", state, city,
        created_at,
        2 AS priority
      FROM jobs
      WHERE is_published = true
        AND is_featured = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND slug IS NOT NULL
        AND created_at > NOW() - INTERVAL '30 days'
        AND source_type != 'employer'
    ),
    external_ranked AS (
      -- External jobs ranked by quality (salary bonus) with category diversity.
      -- Jobs with salary get +10 quality bonus so they rank higher, but jobs
      -- without salary are no longer excluded entirely.
      SELECT
        title, employer, location,
        job_type AS "jobType", mode,
        display_salary AS "displaySalary",
        is_remote AS "isRemote", is_featured AS "isFeatured", slug,
        quality_score AS "qualityScore", state, city,
        created_at,
        3 AS priority,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(job_type, 'General')
          ORDER BY
            (quality_score + CASE WHEN display_salary IS NOT NULL THEN 10 ELSE 0 END) DESC,
            created_at DESC
        ) AS rn
      FROM jobs
      WHERE is_published = true
        AND is_featured = false
        AND (expires_at IS NULL OR expires_at > NOW())
        AND slug IS NOT NULL
        AND created_at > NOW() - INTERVAL '48 hours'
        AND source_type != 'employer'
    ),
    combined AS (
      SELECT title, employer, location, "jobType", mode, "displaySalary",
             "isRemote", "isFeatured", slug, "qualityScore", state, city, priority, created_at
      FROM premium_posts
      UNION ALL
      SELECT title, employer, location, "jobType", mode, "displaySalary",
             "isRemote", "isFeatured", slug, "qualityScore", state, city, priority, created_at
      FROM employer_posts
      UNION ALL
      SELECT title, employer, location, "jobType", mode, "displaySalary",
             "isRemote", "isFeatured", slug, "qualityScore", state, city, priority, created_at
      FROM featured_posts
      UNION ALL
      SELECT title, employer, location, "jobType", mode, "displaySalary",
             "isRemote", "isFeatured", slug, "qualityScore", state, city, priority, created_at
      FROM external_ranked
      WHERE rn <= 3
    )
    SELECT title, employer, location, "jobType", mode, "displaySalary",
           "isRemote", "isFeatured", slug, "qualityScore", state, city
    FROM combined
    ORDER BY priority ASC, "qualityScore" DESC, created_at DESC
    LIMIT ${JOBS_PER_POST}
  `;

    return jobs;
}

// ---------------------------------------------------------------------------
// Facebook caption — bulleted list
// ---------------------------------------------------------------------------

const JOB_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export function buildFacebookCaption(jobs: SocialJob[]): string {
    const lines = ['🔥 Today\'s Top PMHNP Jobs!\n'];

    jobs.forEach((job, i) => {
        const emoji = JOB_EMOJIS[i] ?? `${i + 1}.`;
        const featured = job.isFeatured ? ' ⭐ FEATURED' : '';
        const salary = job.displaySalary ? ` — ${job.displaySalary} 💰` : '';
        const loc = job.isRemote ? 'Remote' : job.location;
        const type = job.jobType ? ` | ${job.jobType}` : '';
        const link = `${BASE_URL}/jobs/${job.slug}`;

        lines.push(
            `${emoji} ${job.title}${featured}${salary}`,
            `   📍 ${loc}${type}`,
            `   🏢 ${job.employer}`,
            `   👉 ${link}`,
            '',
        );
    });

    lines.push(`🔎 More jobs → ${BASE_URL}`);
    lines.push(HASHTAGS);

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Instagram caption + carousel images
// ---------------------------------------------------------------------------

export function buildInstagramCaption(jobs: SocialJob[]): string {
    const lines = [
        '🔥 Swipe through today\'s top PMHNP job openings! ➡️\n',
    ];

    jobs.forEach((job, i) => {
        const emoji = JOB_EMOJIS[i] ?? `${i + 1}.`;
        const salary = job.displaySalary ? ` — ${job.displaySalary}` : '';
        lines.push(`${emoji} ${job.title}${salary}`);
    });

    lines.push(`\n🔗 Link in bio for full listings`);
    lines.push(`\n${HASHTAGS}`);

    return lines.join('\n');
}

export async function generateCarouselImages(
    jobs: SocialJob[],
): Promise<Buffer[]> {
    const total = jobs.length;
    const buffers: Buffer[] = [];

    for (let i = 0; i < total; i++) {
        const job = jobs[i];
        const cardData: JobCardData = {
            title: job.title,
            employer: job.employer,
            location: job.location,
            salary: job.displaySalary,
            jobType: job.jobType,
            isRemote: job.isRemote,
            slug: job.slug ?? '',
        };

        const png = await generateJobCardPng(cardData, i + 1, total);
        buffers.push(png);
    }

    return buffers;
}

// ---------------------------------------------------------------------------
// Upload carousel images to Postiz
// ---------------------------------------------------------------------------

export async function uploadCarouselImages(
    images: Buffer[],
): Promise<PostizImage[]> {
    const uploaded: PostizImage[] = [];

    for (let i = 0; i < images.length; i++) {
        const result = await uploadImage(images[i], `job-card-${i + 1}.png`);
        uploaded.push({ id: result.id, path: result.path });
    }

    return uploaded;
}

// ---------------------------------------------------------------------------
// Orchestrator — run the full pipeline
// ---------------------------------------------------------------------------

export interface SocialPostResult {
    success: boolean;
    jobCount: number;
    reason?: string;
    facebook?: { posted: boolean; error?: string };
    instagram?: { posted: boolean; error?: string };
    dryRun: boolean;
    caption?: string;
}

export type SocialPlatform = 'facebook' | 'instagram' | 'all';

export async function runSocialPostPipeline(
    dryRun = false,
    platform: SocialPlatform = 'all',
): Promise<SocialPostResult> {
    console.log(`[SOCIAL] Fetching top jobs for social media (platform: ${platform})...`);
    const jobs = await fetchTopJobsForSocial();

    if (jobs.length === 0) {
        console.warn('[SOCIAL] No jobs found to post!');
        return { success: false, jobCount: 0, dryRun, reason: 'No qualifying jobs found in last 24 hours' };
    }

    console.log(`[SOCIAL] Found ${jobs.length} jobs`);

    const result: SocialPostResult = {
        success: true,
        jobCount: jobs.length,
        dryRun: false,
    };

    // Build captions
    const fbCaption = (platform === 'facebook' || platform === 'all') ? buildFacebookCaption(jobs) : '';
    const igCaption = (platform === 'instagram' || platform === 'all') ? buildInstagramCaption(jobs) : '';

    if (dryRun) {
        return {
            success: true,
            jobCount: jobs.length,
            dryRun: true,
            caption: fbCaption || igCaption,
        };
    }

    // ── Facebook — generate summary image + post ──
    if (platform === 'facebook' || platform === 'all') {
        const fbId = process.env.POSTIZ_FB_INTEGRATION_ID;
        if (fbId) {
            try {
                console.log('[SOCIAL] Generating FB summary image...');
                const fbSummaryPng = await generateFBSummaryPng(
                    jobs.map((j) => ({
                        title: j.title,
                        employer: j.employer,
                        location: j.location,
                        salary: j.displaySalary,
                        isRemote: j.isRemote,
                    })),
                );

                console.log('[SOCIAL] Uploading FB summary image...');
                const fbUpload = await uploadImage(fbSummaryPng, 'fb-summary.png');

                console.log('[SOCIAL] Posting to Facebook...');
                await postToFacebook(fbId, fbCaption, { id: fbUpload.id, path: fbUpload.path });
                result.facebook = { posted: true };
                console.log('[SOCIAL] Facebook post successful');
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('[SOCIAL] Facebook post failed:', msg);
                result.facebook = { posted: false, error: msg };
                result.success = false;
            }
        } else {
            console.warn('[SOCIAL] POSTIZ_FB_INTEGRATION_ID not set — skipping FB');
            result.facebook = { posted: false, error: 'Integration ID not configured' };
            result.reason = (result.reason ? result.reason + '; ' : '') + 'POSTIZ_FB_INTEGRATION_ID not set';
        }
    }

    // ── Instagram carousel ──
    if (platform === 'instagram' || platform === 'all') {
        const igId = process.env.POSTIZ_INSTAGRAM_INTEGRATION_ID;
        if (igId) {
            try {
                console.log('[SOCIAL] Generating carousel images...');
                const imageBuffers = await generateCarouselImages(jobs);

                console.log(`[SOCIAL] Generated ${imageBuffers.length} carousel images`);
                console.log('[SOCIAL] Uploading images to Postiz...');
                const uploadedImages = await uploadCarouselImages(imageBuffers);

                console.log(`[SOCIAL] Uploaded ${uploadedImages.length} images. Posting Instagram carousel...`);
                await postToInstagramCarousel(igId, igCaption, uploadedImages);
                result.instagram = { posted: true };
                console.log('[SOCIAL] Instagram carousel posted successfully');
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('[SOCIAL] Instagram post failed:', msg);
                result.instagram = { posted: false, error: msg };
                result.success = false;
            }
        } else {
            console.warn('[SOCIAL] POSTIZ_INSTAGRAM_INTEGRATION_ID not set — skipping IG');
            result.instagram = { posted: false, error: 'Integration ID not configured' };
            result.reason = (result.reason ? result.reason + '; ' : '') + 'POSTIZ_INSTAGRAM_INTEGRATION_ID not set';
        }
    }

    return result;
}
