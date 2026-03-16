/**
 * Job Card Image Generator
 *
 * Generates 1080×1080 branded PNG images for Instagram carousel slides.
 * Uses satori (JSX → SVG) + @resvg/resvg-js (SVG → PNG).
 * Works on Vercel serverless because both are WASM-based.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JobCardData {
    title: string;
    employer: string;
    location: string;
    salary: string | null;
    jobType: string | null;
    isRemote: boolean;
    slug: string;
}

// ---------------------------------------------------------------------------
// Font loading — Inter from Google Fonts (fetched once, cached in memory)
// ---------------------------------------------------------------------------

let fontDataCache: ArrayBuffer | null = null;

async function loadFont(): Promise<ArrayBuffer> {
    if (fontDataCache) return fontDataCache;

    const res = await fetch(
        'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
    );
    fontDataCache = await res.arrayBuffer();
    return fontDataCache;
}

let fontBoldCache: ArrayBuffer | null = null;

async function loadFontBold(): Promise<ArrayBuffer> {
    if (fontBoldCache) return fontBoldCache;

    const res = await fetch(
        'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
    );
    fontBoldCache = await res.arrayBuffer();
    return fontBoldCache;
}

// ---------------------------------------------------------------------------
// Card renderer
// ---------------------------------------------------------------------------

export async function generateJobCardPng(
    job: JobCardData,
    slideNumber: number,
    totalSlides: number,
): Promise<Buffer> {
    const [fontRegular, fontBold] = await Promise.all([
        loadFont(),
        loadFontBold(),
    ]);

    const locationLabel = job.isRemote ? 'Remote' : job.location;
    const salaryLabel = job.salary ?? 'Competitive Salary';
    const typeLabel = job.jobType ?? 'Open Position';

    // Satori expects React-element-like objects
    const element = {
        type: 'div',
        props: {
            style: {
                width: '1080px',
                height: '1080px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '80px',
                background: 'linear-gradient(145deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
                fontFamily: 'Inter',
                color: '#ffffff',
            },
            children: [
                // Top bar: slide number + brand
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        background: 'rgba(255,255,255,0.15)',
                                        borderRadius: '24px',
                                        padding: '8px 24px',
                                        fontSize: '22px',
                                        fontWeight: 700,
                                    },
                                    children: `${slideNumber}/${totalSlides}`,
                                },
                            },
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        fontSize: '22px',
                                        fontWeight: 700,
                                        color: '#64ffda',
                                    },
                                    children: 'PMHNPHiring.com',
                                },
                            },
                        ],
                    },
                },

                // Middle: job info
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '24px',
                            flex: 1,
                            justifyContent: 'center',
                        },
                        children: [
                            // Job type badge
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                    },
                                    children: [
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    background: '#64ffda',
                                                    color: '#0f2027',
                                                    borderRadius: '12px',
                                                    padding: '8px 24px',
                                                    fontSize: '24px',
                                                    fontWeight: 700,
                                                },
                                                children: typeLabel,
                                            },
                                        },
                                    ],
                                },
                            },
                            // Title
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        fontSize: '48px',
                                        fontWeight: 700,
                                        lineHeight: 1.2,
                                        maxHeight: '180px',
                                        overflow: 'hidden',
                                    },
                                    children: job.title,
                                },
                            },
                            // Employer
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        fontSize: '30px',
                                        color: 'rgba(255,255,255,0.8)',
                                    },
                                    children: [
                                        {
                                            type: 'span',
                                            props: {
                                                style: {
                                                    background: 'rgba(100,255,218,0.15)',
                                                    color: '#64ffda',
                                                    borderRadius: '6px',
                                                    padding: '2px 10px',
                                                    fontSize: '20px',
                                                    marginRight: '12px',
                                                    fontWeight: 700,
                                                },
                                                children: 'COMPANY',
                                            },
                                        },
                                        job.employer,
                                    ],
                                },
                            },
                            // Location
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        fontSize: '28px',
                                        color: 'rgba(255,255,255,0.7)',
                                    },
                                    children: [
                                        {
                                            type: 'span',
                                            props: {
                                                style: {
                                                    background: 'rgba(100,255,218,0.15)',
                                                    color: '#64ffda',
                                                    borderRadius: '6px',
                                                    padding: '2px 10px',
                                                    fontSize: '18px',
                                                    marginRight: '12px',
                                                    fontWeight: 700,
                                                },
                                                children: 'LOCATION',
                                            },
                                        },
                                        locationLabel,
                                    ],
                                },
                            },
                            // Salary
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        fontSize: '40px',
                                        fontWeight: 700,
                                        color: '#64ffda',
                                        marginTop: '8px',
                                    },
                                    children: salaryLabel,
                                },
                            },
                        ],
                    },
                },

                // Bottom CTA
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            background: '#64ffda',
                            color: '#0f2027',
                            borderRadius: '16px',
                            padding: '20px 40px',
                            fontSize: '28px',
                            fontWeight: 700,
                        },
                        children: 'Apply Now →  pmhnphiring.com',
                    },
                },
            ],
        },
    };

    const svg = await satori(element as any, {
        width: 1080,
        height: 1080,
        fonts: [
            { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' },
            { name: 'Inter', data: fontBold, weight: 700, style: 'normal' },
        ],
    });

    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: 1080 },
    });

    return Buffer.from(resvg.render().asPng());
}

// ---------------------------------------------------------------------------
// Facebook summary image (1200×630) — all jobs in one branded graphic
// ---------------------------------------------------------------------------

export interface FBSummaryJobData {
    title: string;
    employer: string;
    location: string;
    salary: string | null;
    isRemote: boolean;
}

export async function generateFBSummaryPng(
    jobs: FBSummaryJobData[],
): Promise<Buffer> {
    const [fontRegular, fontBold] = await Promise.all([
        loadFont(),
        loadFontBold(),
    ]);

    const today = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });

    const jobRows = jobs.map((job, i) => {
        const salary = job.salary || 'Competitive';
        const loc = job.isRemote ? 'Remote' : (job.location || '').split(',')[0];
        const title =
            job.title.length > 42 ? job.title.substring(0, 39) + '...' : job.title;

        return {
            type: 'div',
            props: {
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    background:
                        i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent',
                },
                children: [
                    {
                        type: 'div',
                        props: {
                            style: {
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: '#64ffda',
                                color: '#0f2027',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '16px',
                                fontWeight: 700,
                                flexShrink: 0,
                            },
                            children: `${i + 1}`,
                        },
                    },
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                flexDirection: 'column',
                                flex: 1,
                                gap: '2px',
                                overflow: 'hidden',
                            },
                            children: [
                                {
                                    type: 'div',
                                    props: {
                                        style: {
                                            fontSize: '18px',
                                            fontWeight: 700,
                                            color: '#ffffff',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        },
                                        children: title,
                                    },
                                },
                                {
                                    type: 'div',
                                    props: {
                                        style: {
                                            fontSize: '14px',
                                            color: 'rgba(255,255,255,0.6)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        },
                                        children: `${job.employer}  |  ${loc}`,
                                    },
                                },
                            ],
                        },
                    },
                    {
                        type: 'div',
                        props: {
                            style: {
                                fontSize: '16px',
                                fontWeight: 700,
                                color: '#64ffda',
                                flexShrink: 0,
                                textAlign: 'right' as const,
                            },
                            children: salary,
                        },
                    },
                ],
            },
        };
    });

    const element = {
        type: 'div',
        props: {
            style: {
                width: '1200px',
                height: '630px',
                display: 'flex',
                flexDirection: 'column',
                padding: '40px 48px',
                background:
                    'linear-gradient(145deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
                fontFamily: 'Inter',
                color: '#ffffff',
            },
            children: [
                // Header
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '20px',
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px',
                                    },
                                    children: [
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    fontSize: '28px',
                                                    fontWeight: 700,
                                                },
                                                children: "Today's Top PMHNP Jobs",
                                            },
                                        },
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    fontSize: '14px',
                                                    color: 'rgba(255,255,255,0.5)',
                                                },
                                                children: today,
                                            },
                                        },
                                    ],
                                },
                            },
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        fontSize: '20px',
                                        fontWeight: 700,
                                        color: '#64ffda',
                                    },
                                    children: 'PMHNPHiring.com',
                                },
                            },
                        ],
                    },
                },
                // Divider
                {
                    type: 'div',
                    props: {
                        style: {
                            height: '2px',
                            background: 'rgba(100,255,218,0.3)',
                            marginBottom: '12px',
                        },
                        children: '',
                    },
                },
                // Jobs list
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            flex: 1,
                        },
                        children: jobRows,
                    },
                },
                // Footer CTA
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            justifyContent: 'center',
                            marginTop: '16px',
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        background: '#64ffda',
                                        color: '#0f2027',
                                        borderRadius: '12px',
                                        padding: '10px 40px',
                                        fontSize: '18px',
                                        fontWeight: 700,
                                    },
                                    children:
                                        'Browse All Jobs  ->  pmhnphiring.com',
                                },
                            },
                        ],
                    },
                },
            ],
        },
    };

    const svg = await satori(element as any, {
        width: 1200,
        height: 630,
        fonts: [
            { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' },
            { name: 'Inter', data: fontBold, weight: 700, style: 'normal' },
        ],
    });

    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: 1200 },
    });

    return Buffer.from(resvg.render().asPng());
}
