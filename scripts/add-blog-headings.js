require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

(async () => {
    const res = await pool.query(
        "SELECT id, title, content FROM blog_posts WHERE title ILIKE '%become a pmhnp%' LIMIT 1"
    );

    const post = res.rows[0];
    let content = post.content;

    // This post is a wall of text with no line breaks
    // Add headings by finding key topic sentences and inserting ## before the natural section starts

    const headingsMap = [
        { before: "The real path: BSN", heading: "The Real Path: BSN → MSN/DNP → ANCC → First Job" },
        { before: "The clean version looks like this", heading: "The Clean Version" },
        { before: "The messy reality is that each step", heading: "The Messy Reality: Hidden Time Costs" },
        { before: "Year 1 is the BSN", heading: "Year 1: The BSN" },
        { before: "Once you're working as an RN", heading: "RN Experience: Building Your Foundation" },
        { before: "the MSN or DNP is the biggest", heading: "The MSN or DNP: The Biggest Time Investment" },
        { before: "Part-time programs", heading: "Part-Time vs Full-Time Programs" },
        { before: "clinical hours", heading: "Clinical Hours: The Bottleneck" },
        { before: "Once you graduate", heading: "After Graduation: ANCC Certification" },
        { before: "If you start right now", heading: "Realistic Timeline From Start to Finish" },
        { before: "the shortest realistic timeline", heading: "The Shortest Realistic Timeline" },
        { before: "most people", heading: "What Most People Actually Experience" },
        { before: "The job market right now", heading: "The PMHNP Job Market Right Now" },
        { before: "Starting salary", heading: "Starting Salaries" },
        { before: "If you're still weighing", heading: "Is It Worth It?" },
        { before: "Bottom line", heading: "Bottom Line" },
    ];

    // Try to add headings where the text naturally shifts topics
    // First, let's add paragraph breaks before each heading point
    for (const entry of headingsMap) {
        const idx = content.indexOf(entry.before);
        if (idx > 0) {
            // Insert heading before this sentence
            content = content.substring(0, idx) + '\n\n## ' + entry.heading + '\n\n' + content.substring(idx);
        }
    }

    // Clean up excessive newlines
    content = content.replace(/\n{3,}/g, '\n\n').trim();

    const headingCount = (content.match(/^## /gm) || []).length;
    console.log(`Found and inserted ${headingCount} headings`);

    if (headingCount > 0) {
        await pool.query('UPDATE blog_posts SET content = $1 WHERE id = $2', [content, post.id]);
        console.log('Updated successfully!');

        // Preview first 500 chars
        console.log('\nPreview:');
        console.log(content.substring(0, 500));
    }

    await pool.end();
})();
