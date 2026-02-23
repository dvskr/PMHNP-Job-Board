/**
 * Preview script — generates FB caption + Instagram carousel images.
 * Saves images to tmp/social-preview/ for inspection.
 */

require('dotenv').config();
const { Client } = require('pg');

async function main() {
    const client = new Client({
        connectionString: process.env.PROD_DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });

    await client.connect();
    console.log('🔍 Fetching top jobs from DB...\n');

    const result = await client.query(`
    WITH categorized AS (
      SELECT
        title, employer, location,
        job_type AS "jobType", mode,
        display_salary AS "displaySalary",
        is_remote AS "isRemote", slug,
        quality_score AS "qualityScore", state, city,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(job_type, 'General')
          ORDER BY quality_score DESC, created_at DESC
        ) AS rn
      FROM jobs
      WHERE is_published = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND slug IS NOT NULL
    )
    SELECT title, employer, location, "jobType", mode, "displaySalary",
           "isRemote", slug, "qualityScore", state, city
    FROM categorized
    WHERE rn <= 2
    ORDER BY "qualityScore" DESC
    LIMIT 5
  `);

    const jobs = result.rows;

    console.log(`Found ${jobs.length} jobs\n`);

    // ── Build FB Caption ──
    const JOB_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
    const BASE_URL = 'https://pmhnphiring.com';
    const HASHTAGS = '#PMHNP #NursePractitioner #MentalHealth #NurseJobs #PsychiatricNursing #Hiring #HealthcareJobs #NursingJobs';

    const lines = ['🔥 Today\'s Top PMHNP Jobs!\n'];
    jobs.forEach((job, i) => {
        const emoji = JOB_EMOJIS[i];
        const salary = job.displaySalary ? ` — ${job.displaySalary} 💰` : '';
        const loc = job.isRemote ? 'Remote' : job.location;
        const type = job.jobType ? ` | ${job.jobType}` : '';
        lines.push(
            `${emoji} ${job.title}${salary}`,
            `   📍 ${loc}${type}`,
            `   🏢 ${job.employer}`,
            `   👉 ${BASE_URL}/jobs/${job.slug}`,
            '',
        );
    });
    lines.push(`🔎 More jobs → ${BASE_URL}`);
    lines.push(HASHTAGS);

    const fbCaption = lines.join('\n');

    console.log('═'.repeat(60));
    console.log('📘  FACEBOOK CAPTION');
    console.log('═'.repeat(60));
    console.log(fbCaption);
    console.log();

    // ── Build IG Caption ──
    const igLines = ['🔥 Swipe through today\'s top PMHNP job openings! ➡️\n'];
    jobs.forEach((job, i) => {
        const emoji = JOB_EMOJIS[i];
        const salary = job.displaySalary ? ` — ${job.displaySalary}` : '';
        igLines.push(`${emoji} ${job.title}${salary}`);
    });
    igLines.push(`\n🔗 Link in bio for full listings`);
    igLines.push(`\n${HASHTAGS}`);

    console.log('═'.repeat(60));
    console.log('📸  INSTAGRAM CAPTION');
    console.log('═'.repeat(60));
    console.log(igLines.join('\n'));
    console.log();

    // ── Generate carousel images ──
    console.log('🎨 Generating carousel images...');

    const satori = (await import('satori')).default;
    const { Resvg } = require('@resvg/resvg-js');
    const fs = require('fs');
    const path = require('path');

    // Load fonts
    const fontRes = await fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff');
    const fontRegular = await fontRes.arrayBuffer();
    const fontBoldRes = await fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYAZ9hiA.woff');
    const fontBold = await fontBoldRes.arrayBuffer();

    const outDir = path.join(__dirname, 'tmp', 'social-preview');
    fs.mkdirSync(outDir, { recursive: true });

    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const locationLabel = job.isRemote ? '🏠 Remote' : `📍 ${job.location}`;
        const salaryLabel = job.displaySalary || 'Competitive Salary';
        const typeLabel = job.jobType || 'Open Position';

        const element = {
            type: 'div',
            props: {
                style: {
                    width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column',
                    justifyContent: 'space-between', padding: '80px',
                    background: 'linear-gradient(145deg, #0f2027 0%, #203a43 40%, #2c5364 100%)',
                    fontFamily: 'Inter', color: '#ffffff',
                },
                children: [
                    {
                        type: 'div', props: {
                            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
                            children: [
                                { type: 'div', props: { style: { background: 'rgba(255,255,255,0.15)', borderRadius: '24px', padding: '8px 24px', fontSize: '22px', fontWeight: 700 }, children: `${i + 1}/${jobs.length}` } },
                                { type: 'div', props: { style: { fontSize: '22px', fontWeight: 700, color: '#64ffda' }, children: 'PMHNPHiring.com' } },
                            ],
                        },
                    },
                    {
                        type: 'div', props: {
                            style: { display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, justifyContent: 'center' },
                            children: [
                                { type: 'div', props: { style: { display: 'flex' }, children: [{ type: 'div', props: { style: { background: '#64ffda', color: '#0f2027', borderRadius: '12px', padding: '8px 24px', fontSize: '24px', fontWeight: 700 }, children: typeLabel } }] } },
                                { type: 'div', props: { style: { fontSize: '48px', fontWeight: 700, lineHeight: 1.2, maxHeight: '180px', overflow: 'hidden' }, children: job.title } },
                                { type: 'div', props: { style: { fontSize: '30px', color: 'rgba(255,255,255,0.8)' }, children: `🏢  ${job.employer}` } },
                                { type: 'div', props: { style: { fontSize: '28px', color: 'rgba(255,255,255,0.7)' }, children: locationLabel } },
                                { type: 'div', props: { style: { fontSize: '40px', fontWeight: 700, color: '#64ffda', marginTop: '8px' }, children: `💰 ${salaryLabel}` } },
                            ],
                        },
                    },
                    {
                        type: 'div', props: {
                            style: { display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#64ffda', color: '#0f2027', borderRadius: '16px', padding: '20px 40px', fontSize: '28px', fontWeight: 700 },
                            children: 'Apply Now →  pmhnphiring.com',
                        },
                    },
                ],
            },
        };

        const svg = await satori(element, {
            width: 1080, height: 1080,
            fonts: [
                { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' },
                { name: 'Inter', data: fontBold, weight: 700, style: 'normal' },
            ],
        });

        const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } });
        const png = Buffer.from(resvg.render().asPng());

        const filePath = path.join(outDir, `slide-${i + 1}.png`);
        fs.writeFileSync(filePath, png);
        console.log(`  ✅ Slide ${i + 1}: ${filePath}`);
    }

    console.log(`\n🎉 Done! Preview images saved to: ${outDir}`);

    await client.end();
    process.exit(0);
}

main().catch((err) => { console.error('Error:', err); process.exit(1); });
