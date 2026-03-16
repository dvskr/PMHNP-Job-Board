/**
 * Temporary preview endpoint — returns captions + saves carousel images locally.
 * GET /api/preview-social
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    fetchTopJobsForSocial,
    buildFacebookCaption,
    buildInstagramCaption,
    generateCarouselImages,
} from '@/lib/social-post-generator';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const jobs = await fetchTopJobsForSocial();

        if (jobs.length === 0) {
            return NextResponse.json({ error: 'No jobs found' }, { status: 404 });
        }

        const fbCaption = buildFacebookCaption(jobs);
        const igCaption = buildInstagramCaption(jobs);

        // Generate carousel images and save locally
        const images = await generateCarouselImages(jobs);
        const outDir = join(process.cwd(), 'tmp', 'social-preview');
        mkdirSync(outDir, { recursive: true });

        const savedPaths: string[] = [];
        for (let i = 0; i < images.length; i++) {
            const filePath = join(outDir, `slide-${i + 1}.png`);
            writeFileSync(filePath, images[i]);
            savedPaths.push(filePath);
        }

        return NextResponse.json({
            jobs: jobs.map((j) => ({
                title: j.title,
                employer: j.employer,
                salary: j.displaySalary,
                location: j.location,
                jobType: j.jobType,
                isRemote: j.isRemote,
            })),
            facebook: { caption: fbCaption },
            instagram: { caption: igCaption },
            carouselImages: savedPaths,
            message: `${images.length} carousel images saved to ${outDir}`,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
