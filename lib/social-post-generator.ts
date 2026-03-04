/**
 * Social Post Generator
 *
 * Queries the production DB for top jobs with a mix of categories,
 * then generates formatted captions for Facebook, Instagram, LinkedIn, and X,
 * plus carousel images for Instagram and LinkedIn.
 */

import { prisma } from '@/lib/prisma';
import { generateJobCardPng, generateFBSummaryPng, type JobCardData } from '@/lib/job-card-generator';
import {
    uploadImage,
    postToFacebook,
    postToInstagramCarousel,
    postToLinkedIn,
    postToX,
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
    slug: string | null;
    qualityScore: number;
    state: string | null;
    city: string | null;
}

export async function fetchTopJobsForSocial(): Promise<SocialJob[]> {
    // Use a raw query to get a diverse mix via ROW_NUMBER partitioned by job_type
    const jobs = await prisma.$queryRaw<SocialJob[]>`
    WITH employer_posts AS (
      -- Employer posts always included, regardless of quality score
      SELECT
        title, employer, location,
        job_type AS "jobType", mode,
        display_salary AS "displaySalary",
        is_remote AS "isRemote", slug,
        quality_score AS "qualityScore", state, city,
        1 AS priority
      FROM jobs
      WHERE is_published = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND slug IS NOT NULL
        AND created_at > NOW() - INTERVAL '24 hours'
        AND source_type = 'employer'
    ),
    external_ranked AS (
      -- External jobs ranked by quality with category diversity
      SELECT
        title, employer, location,
        job_type AS "jobType", mode,
        display_salary AS "displaySalary",
        is_remote AS "isRemote", slug,
        quality_score AS "qualityScore", state, city,
        2 AS priority,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(job_type, 'General')
          ORDER BY quality_score DESC, created_at DESC
        ) AS rn
      FROM jobs
      WHERE is_published = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND slug IS NOT NULL
        AND created_at > NOW() - INTERVAL '24 hours'
        AND display_salary IS NOT NULL
        AND source_type != 'employer'
    ),
    combined AS (
      SELECT title, employer, location, "jobType", mode, "displaySalary",
             "isRemote", slug, "qualityScore", state, city, priority
      FROM employer_posts
      UNION ALL
      SELECT title, employer, location, "jobType", mode, "displaySalary",
             "isRemote", slug, "qualityScore", state, city, priority
      FROM external_ranked
      WHERE rn <= 3
    )
    SELECT title, employer, location, "jobType", mode, "displaySalary",
           "isRemote", slug, "qualityScore", state, city
    FROM combined
    ORDER BY priority ASC, "qualityScore" DESC
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
        const salary = job.displaySalary ? ` — ${job.displaySalary} 💰` : '';
        const loc = job.isRemote ? 'Remote' : job.location;
        const type = job.jobType ? ` | ${job.jobType}` : '';
        const link = `${BASE_URL}/jobs/${job.slug}`;

        lines.push(
            `${emoji} ${job.title}${salary}`,
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
// LinkedIn caption
// ---------------------------------------------------------------------------

export function buildLinkedInCaption(jobs: SocialJob[]): string {
    const lines = [
        '🔥 Today\'s Top PMHNP Opportunities\n',
        'We\'re seeing strong demand for Psychiatric Mental Health Nurse Practitioners. Here are today\'s top openings:\n',
    ];

    jobs.forEach((job, i) => {
        const emoji = JOB_EMOJIS[i] ?? `${i + 1}.`;
        const salary = job.displaySalary ? ` | ${job.displaySalary}` : '';
        const loc = job.isRemote ? 'Remote' : job.location;
        lines.push(`${emoji} ${job.title}`);
        lines.push(`   🏢 ${job.employer} · 📍 ${loc}${salary}`);
        lines.push('');
    });

    lines.push(`👉 Browse all openings: ${BASE_URL}`);
    lines.push(`\n${HASHTAGS} #LinkedIn #PMHNPJobs`);

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// X (Twitter) caption — concise due to character limit
// ---------------------------------------------------------------------------

export function buildXCaption(jobs: SocialJob[]): string {
    const topJobs = jobs.slice(0, 5); // Keep it short for X
    const lines = ['🔥 Top PMHNP Jobs Today:\n'];

    topJobs.forEach((job, i) => {
        const salary = job.displaySalary ? ` — ${job.displaySalary}` : '';
        const loc = job.isRemote ? '🌐 Remote' : `📍 ${job.location}`;
        lines.push(`${i + 1}. ${job.title}${salary}`);
        lines.push(`   ${loc} | ${job.employer}`);
    });

    lines.push(`\n👉 ${BASE_URL}`);
    lines.push('#PMHNP #NurseJobs #MentalHealth #Hiring');

    return lines.join('\n');
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
    linkedin?: { posted: boolean; error?: string };
    x?: { posted: boolean; error?: string };
    dryRun: boolean;
    caption?: string;
}

export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'all';

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
    const liCaption = (platform === 'linkedin' || platform === 'all') ? buildLinkedInCaption(jobs) : '';
    const xCaption = (platform === 'x' || platform === 'all') ? buildXCaption(jobs) : '';

    if (dryRun) {
        return {
            success: true,
            jobCount: jobs.length,
            dryRun: true,
            caption: fbCaption || igCaption || liCaption || xCaption,
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

    // ── LinkedIn carousel ──
    if (platform === 'linkedin' || platform === 'all') {
        const liId = process.env.POSTIZ_LINKEDIN_INTEGRATION_ID;
        if (liId) {
            try {
                console.log('[SOCIAL] Generating LinkedIn carousel images...');
                // Reuse Instagram carousel images if already generated, otherwise generate
                let imageBuffers: Buffer[];
                if (result.instagram?.posted || platform === 'all') {
                    // Images were already generated for Instagram, regenerate for LinkedIn
                    imageBuffers = await generateCarouselImages(jobs);
                } else {
                    imageBuffers = await generateCarouselImages(jobs);
                }

                console.log(`[SOCIAL] Uploading ${imageBuffers.length} images for LinkedIn...`);
                const uploadedImages = await uploadCarouselImages(imageBuffers);

                console.log('[SOCIAL] Posting to LinkedIn...');
                await postToLinkedIn(liId, liCaption, uploadedImages);
                result.linkedin = { posted: true };
                console.log('[SOCIAL] LinkedIn post successful');
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('[SOCIAL] LinkedIn post failed:', msg);
                result.linkedin = { posted: false, error: msg };
                result.success = false;
            }
        } else {
            console.warn('[SOCIAL] POSTIZ_LINKEDIN_INTEGRATION_ID not set — skipping LinkedIn');
            result.linkedin = { posted: false, error: 'Integration ID not configured' };
            result.reason = (result.reason ? result.reason + '; ' : '') + 'POSTIZ_LINKEDIN_INTEGRATION_ID not set';
        }
    }

    // ── X (Twitter) — single summary image ──
    if (platform === 'x' || platform === 'all') {
        const xId = process.env.POSTIZ_X_INTEGRATION_ID;
        if (xId) {
            try {
                console.log('[SOCIAL] Generating X summary image...');
                const xSummaryPng = await generateFBSummaryPng(
                    jobs.map((j) => ({
                        title: j.title,
                        employer: j.employer,
                        location: j.location,
                        salary: j.displaySalary,
                        isRemote: j.isRemote,
                    })),
                );

                console.log('[SOCIAL] Uploading X summary image...');
                const xUpload = await uploadImage(xSummaryPng, 'x-summary.png');

                console.log('[SOCIAL] Posting to X...');
                await postToX(xId, xCaption, { id: xUpload.id, path: xUpload.path });
                result.x = { posted: true };
                console.log('[SOCIAL] X post successful');
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('[SOCIAL] X post failed:', msg);
                result.x = { posted: false, error: msg };
                result.success = false;
            }
        } else {
            console.warn('[SOCIAL] POSTIZ_X_INTEGRATION_ID not set — skipping X');
            result.x = { posted: false, error: 'Integration ID not configured' };
            result.reason = (result.reason ? result.reason + '; ' : '') + 'POSTIZ_X_INTEGRATION_ID not set';
        }
    }

    return result;
}
