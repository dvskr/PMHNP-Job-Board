/**
 * Live Social Media Posting Script
 * Connects to PROD_DATABASE_URL, generates content, posts to FB + IG via Postiz.
 * Usage: node post-social-now.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const satori = require('satori').default;
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const PROD_DB = process.env.PROD_DATABASE_URL;
const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY;
const FB_ID = process.env.POSTIZ_FB_INTEGRATION_ID;
const IG_ID = process.env.POSTIZ_INSTAGRAM_INTEGRATION_ID;
const BASE_URL = 'https://pmhnphiring.com';
const POSTIZ_BASE = 'https://api.postiz.com/public/v1';
const JOBS_PER_POST = 10;

if (!PROD_DB) { console.error('PROD_DATABASE_URL not set'); process.exit(1); }
if (!POSTIZ_API_KEY) { console.error('POSTIZ_API_KEY not set'); process.exit(1); }

// ── Font loading ──
let fontCache = null;
async function loadFont() {
    if (fontCache) return fontCache;
    const res = await fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf');
    fontCache = await res.arrayBuffer();
    return fontCache;
}

// ── Query prod DB ──
async function fetchJobs() {
    const pool = new Pool({ connectionString: PROD_DB });
    const result = await pool.query(`
    WITH employer_posts AS (
      SELECT title, employer, location, job_type, mode, display_salary,
             is_remote, slug, quality_score, state, city, source_type, 1 AS priority
      FROM jobs
      WHERE is_published = true AND (expires_at IS NULL OR expires_at > NOW())
        AND slug IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours'
        AND source_type = 'employer'
    ),
    external_ranked AS (
      SELECT title, employer, location, job_type, mode, display_salary,
             is_remote, slug, quality_score, state, city, source_type, 2 AS priority,
        ROW_NUMBER() OVER (PARTITION BY COALESCE(job_type, 'General') ORDER BY quality_score DESC, created_at DESC) AS rn
      FROM jobs
      WHERE is_published = true AND (expires_at IS NULL OR expires_at > NOW())
        AND slug IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours'
        AND display_salary IS NOT NULL AND source_type != 'employer'
    ),
    combined AS (
      SELECT title, employer, location, job_type, mode, display_salary,
             is_remote, slug, quality_score, state, city, source_type, priority
      FROM employer_posts
      UNION ALL
      SELECT title, employer, location, job_type, mode, display_salary,
             is_remote, slug, quality_score, state, city, source_type, priority
      FROM external_ranked WHERE rn <= 3
    )
    SELECT * FROM combined ORDER BY priority ASC, quality_score DESC LIMIT $1
  `, [JOBS_PER_POST]);
    await pool.end();
    return result.rows;
}

// ── Render helper ──
async function renderPng(element, width, height) {
    const font = await loadFont();
    const svg = await satori(element, {
        width, height,
        fonts: [
            { name: 'Inter', data: font, weight: 400, style: 'normal' },
            { name: 'Inter', data: font, weight: 700, style: 'normal' },
        ],
    });
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
    return Buffer.from(resvg.render().asPng());
}

// ── Generate Instagram carousel card (single job, no emoji) ──
function buildCardElement(job, slideNum, total) {
    const locationLabel = job.is_remote ? 'Remote' : job.location;
    const salaryLabel = job.display_salary || 'Competitive Salary';
    const typeLabel = job.job_type || 'Open Position';

    return {
        type: 'div',
        props: {
            style: {
                width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between', padding: '80px',
                background: 'linear-gradient(145deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
                fontFamily: 'Inter', color: '#ffffff',
            },
            children: [
                // Top bar
                {
                    type: 'div', props: {
                        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [
                            { type: 'div', props: { style: { background: 'rgba(255,255,255,0.15)', borderRadius: '24px', padding: '8px 24px', fontSize: '22px', fontWeight: 700 }, children: `${slideNum}/${total}` } },
                            { type: 'div', props: { style: { fontSize: '22px', fontWeight: 700, color: '#64ffda' }, children: 'PMHNPHiring.com' } },
                        ]
                    }
                },
                // Content
                {
                    type: 'div', props: {
                        style: { display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, justifyContent: 'center' }, children: [
                            {
                                type: 'div', props: {
                                    style: { display: 'flex' }, children: [
                                        { type: 'div', props: { style: { background: '#64ffda', color: '#0f2027', borderRadius: '12px', padding: '8px 24px', fontSize: '24px', fontWeight: 700 }, children: typeLabel } },
                                    ]
                                }
                            },
                            { type: 'div', props: { style: { fontSize: '48px', fontWeight: 700, lineHeight: 1.2, maxHeight: '180px', overflow: 'hidden' }, children: job.title } },
                            // Employer with badge
                            {
                                type: 'div', props: {
                                    style: { fontSize: '30px', color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center' }, children: [
                                        { type: 'span', props: { style: { background: 'rgba(100,255,218,0.15)', color: '#64ffda', borderRadius: '6px', padding: '2px 10px', fontSize: '20px', marginRight: '12px', fontWeight: 700 }, children: 'COMPANY' } },
                                        job.employer,
                                    ]
                                }
                            },
                            // Location with badge
                            {
                                type: 'div', props: {
                                    style: { fontSize: '28px', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center' }, children: [
                                        { type: 'span', props: { style: { background: 'rgba(100,255,218,0.15)', color: '#64ffda', borderRadius: '6px', padding: '2px 10px', fontSize: '18px', marginRight: '12px', fontWeight: 700 }, children: 'LOCATION' } },
                                        locationLabel,
                                    ]
                                }
                            },
                            // Salary
                            { type: 'div', props: { style: { fontSize: '40px', fontWeight: 700, color: '#64ffda', marginTop: '8px' }, children: salaryLabel } },
                        ]
                    }
                },
                // CTA
                { type: 'div', props: { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#64ffda', color: '#0f2027', borderRadius: '16px', padding: '20px 40px', fontSize: '28px', fontWeight: 700 }, children: 'Apply Now  ->  pmhnphiring.com' } },
            ],
        },
    };
}

// ── Generate Facebook summary image (1200x630, all jobs in one graphic) ──
function buildFBSummaryElement(jobs) {
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const jobRows = jobs.map((job, i) => {
        const num = `${i + 1}`;
        const salary = job.display_salary || 'Competitive';
        const loc = job.is_remote ? 'Remote' : (job.location || '').split(',')[0];
        // Truncate title if too long
        const title = job.title.length > 42 ? job.title.substring(0, 39) + '...' : job.title;

        return {
            type: 'div', props: {
                style: {
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '8px 16px', borderRadius: '10px',
                    background: i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent',
                },
                children: [
                    // Number badge
                    { type: 'div', props: { style: { width: '32px', height: '32px', borderRadius: '50%', background: '#64ffda', color: '#0f2027', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700, flexShrink: 0 }, children: num } },
                    // Job info
                    {
                        type: 'div', props: {
                            style: { display: 'flex', flexDirection: 'column', flex: 1, gap: '2px', overflow: 'hidden' }, children: [
                                { type: 'div', props: { style: { fontSize: '18px', fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: title } },
                                { type: 'div', props: { style: { fontSize: '14px', color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: `${job.employer}  |  ${loc}` } },
                            ]
                        }
                    },
                    // Salary
                    { type: 'div', props: { style: { fontSize: '16px', fontWeight: 700, color: '#64ffda', flexShrink: 0, textAlign: 'right' }, children: salary } },
                ],
            }
        };
    });

    return {
        type: 'div',
        props: {
            style: {
                width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
                padding: '40px 48px',
                background: 'linear-gradient(145deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
                fontFamily: 'Inter', color: '#ffffff',
            },
            children: [
                // Header
                {
                    type: 'div', props: {
                        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }, children: [
                            {
                                type: 'div', props: {
                                    style: { display: 'flex', flexDirection: 'column', gap: '4px' }, children: [
                                        { type: 'div', props: { style: { fontSize: '28px', fontWeight: 700 }, children: "Today's Top PMHNP Jobs" } },
                                        { type: 'div', props: { style: { fontSize: '14px', color: 'rgba(255,255,255,0.5)' }, children: today } },
                                    ]
                                }
                            },
                            { type: 'div', props: { style: { fontSize: '20px', fontWeight: 700, color: '#64ffda' }, children: 'PMHNPHiring.com' } },
                        ]
                    }
                },
                // Divider
                { type: 'div', props: { style: { height: '2px', background: 'rgba(100,255,218,0.3)', marginBottom: '12px' }, children: '' } },
                // Jobs list
                { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }, children: jobRows } },
                // Footer CTA
                {
                    type: 'div', props: {
                        style: { display: 'flex', justifyContent: 'center', marginTop: '16px' }, children: [
                            { type: 'div', props: { style: { background: '#64ffda', color: '#0f2027', borderRadius: '12px', padding: '10px 40px', fontSize: '18px', fontWeight: 700 }, children: 'Browse All Jobs  ->  pmhnphiring.com' } },
                        ]
                    }
                },
            ],
        },
    };
}

// ── Postiz API helpers ──
async function postizFetch(endpoint, opts = {}) {
    const url = `${POSTIZ_BASE}${endpoint}`;
    console.log(`  -> ${opts.method || 'GET'} ${url}`);
    const res = await fetch(url, {
        ...opts,
        headers: { ...opts.headers, 'Authorization': POSTIZ_API_KEY },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Postiz ${endpoint} (${res.status}): ${text}`);
    try { return JSON.parse(text); } catch { return text; }
}

async function uploadImage(buffer, filename) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: 'image/png' }), filename);
    return postizFetch('/upload', { method: 'POST', body: form });
}

// FB: single image post (no link preview)
async function postToFacebook(caption, image) {
    return postizFetch('/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'now',
            date: new Date().toISOString(),
            shortLink: false,
            tags: [],
            posts: [{
                integration: { id: FB_ID },
                value: [{ content: caption, image: [image] }],
                settings: { __type: 'facebook' },
            }],
        }),
    });
}

// IG: carousel post
async function postToInstagramCarousel(caption, images) {
    return postizFetch('/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'now',
            date: new Date().toISOString(),
            shortLink: false,
            tags: [],
            posts: [{
                integration: { id: IG_ID },
                value: [{ content: caption, image: images }],
                settings: { __type: 'instagram', post_type: 'post' },
            }],
        }),
    });
}

// ── Build captions ──
const EMOJIS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const HASHTAGS = '#PMHNP #NursePractitioner #MentalHealth #NurseJobs #PsychiatricNursing #Hiring #HealthcareJobs #NursingJobs';

function buildFBCaption(jobs) {
    const lines = ['Today\'s Top PMHNP Jobs!\n'];
    jobs.forEach((job, i) => {
        const salary = job.display_salary ? ` - ${job.display_salary}` : '';
        const loc = job.is_remote ? 'Remote' : job.location;
        const type = job.job_type ? ` | ${job.job_type}` : '';
        const link = `${BASE_URL}/jobs/${job.slug}`;
        lines.push(`${i + 1}. ${job.title}${salary}`, `   ${loc}${type} | ${job.employer}`, `   ${link}`, '');
    });
    lines.push(`More jobs: ${BASE_URL}`, '', HASHTAGS);
    return lines.join('\n');
}

function buildIGCaption(jobs) {
    const lines = ['Swipe through today\'s top PMHNP job openings!\n'];
    jobs.forEach((job, i) => {
        const salary = job.display_salary ? ` - ${job.display_salary}` : '';
        lines.push(`${i + 1}. ${job.title}${salary}`);
    });
    lines.push('\nLink in bio for full listings', `\n${HASHTAGS}`);
    return lines.join('\n');
}

// ── Main ──
async function main() {
    console.log('Fetching jobs from prod DB...');
    const jobs = await fetchJobs();
    console.log(`Found ${jobs.length} jobs\n`);

    if (jobs.length === 0) { console.log('No jobs found.'); return; }

    jobs.forEach((j, i) => {
        const tag = j.source_type === 'employer' ? '*EMPLOYER*' : 'external';
        console.log(`  ${i + 1}. [${tag}] ${j.title} | ${j.employer} | ${j.display_salary || 'N/A'}`);
    });

    const fbCaption = buildFBCaption(jobs);
    const igCaption = buildIGCaption(jobs);
    const outDir = path.join(process.cwd(), 'tmp', 'social-preview');
    fs.mkdirSync(outDir, { recursive: true });

    // Generate FB summary image
    console.log('\nGenerating FB summary image...');
    const fbElement = buildFBSummaryElement(jobs);
    const fbPng = await renderPng(fbElement, 1200, 630);
    fs.writeFileSync(path.join(outDir, 'fb-summary.png'), fbPng);
    console.log('  FB summary saved to tmp/social-preview/fb-summary.png');

    // Generate IG carousel images
    console.log('\nGenerating IG carousel images...');
    const igBuffers = [];
    for (let i = 0; i < jobs.length; i++) {
        process.stdout.write(`  Slide ${i + 1}/${jobs.length}...`);
        const el = buildCardElement(jobs[i], i + 1, jobs.length);
        const png = await renderPng(el, 1080, 1080);
        igBuffers.push(png);
        fs.writeFileSync(path.join(outDir, `slide-${i + 1}.png`), png);
        console.log(' done');
    }

    // Upload FB summary image
    console.log('\nUploading FB summary image...');
    const fbUpload = await uploadImage(fbPng, 'fb-summary.png');
    console.log(`  Uploaded: ${fbUpload.id}`);

    // Upload IG carousel images
    console.log('\nUploading IG carousel images...');
    const igUploaded = [];
    for (let i = 0; i < igBuffers.length; i++) {
        process.stdout.write(`  Uploading ${i + 1}/${igBuffers.length}...`);
        const result = await uploadImage(igBuffers[i], `job-card-${i + 1}.png`);
        igUploaded.push({ id: result.id, path: result.path });
        console.log(` done (${result.id})`);
    }

    // Post to Facebook
    if (FB_ID) {
        console.log('\nPosting to Facebook...');
        try {
            await postToFacebook(fbCaption, { id: fbUpload.id, path: fbUpload.path });
            console.log('Facebook post successful!');
        } catch (e) {
            console.error('Facebook post failed:', e.message);
        }
    }

    // Post to Instagram
    if (IG_ID) {
        console.log('\nPosting to Instagram carousel...');
        try {
            await postToInstagramCarousel(igCaption, igUploaded);
            console.log('Instagram carousel posted!');
        } catch (e) {
            console.error('Instagram post failed:', e.message);
        }
    }

    console.log('\nDone!');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
