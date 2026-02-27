/**
 * Sync Blog MDX Files → Database
 *
 * Reads all .mdx files from content/blog/, parses frontmatter,
 * and upserts each post into the blog_posts table as 'published'.
 *
 * Usage: npx tsx scripts/sync-blog-to-db.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const connectionString = process.env.PROD_DATABASE_URL;
if (!connectionString) {
    throw new Error('PROD_DATABASE_URL must be set in .env');
}

const pool = new Pool({ connectionString, max: 3 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

// Map MDX category slugs → DB category values
const CATEGORY_MAP: Record<string, string> = {
    'states': 'job_seeker_attraction',
    'new-grad': 'job_seeker_attraction',
    'career': 'career_development',
    'salary': 'salary_negotiation',
    'interview': 'interview_prep',
    'telehealth': 'telehealth_digital',
    'remote': 'telehealth_digital',
    'guide': 'career_development',
    'comparison': 'career_development',
};

function parseFrontmatter(fileContent: string): {
    data: Record<string, unknown>;
    content: string;
} {
    const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = fileContent.match(fmRegex);
    if (!match) return { data: {}, content: fileContent };

    const raw = match[1];
    const content = match[2];
    const data: Record<string, unknown> = {};

    for (const line of raw.split(/\r?\n/)) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.slice(0, colonIdx).trim();
        let value = line.slice(colonIdx + 1).trim();
        // Remove surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        // Handle booleans
        if (value === 'true') { data[key] = true; continue; }
        if (value === 'false') { data[key] = false; continue; }
        // Handle arrays (simple single-line)
        if (value.startsWith('[')) {
            try { data[key] = JSON.parse(value); } catch { data[key] = value; }
            continue;
        }
        data[key] = value;
    }

    return { data, content };
}

async function main() {
    const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.mdx'));
    console.log(`Found ${files.length} MDX files in ${BLOG_DIR}\n`);

    let synced = 0;
    let skipped = 0;

    for (const file of files) {
        const filePath = path.join(BLOG_DIR, file);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const { data, content } = parseFrontmatter(raw);

        const slug = (data.slug as string) || file.replace('.mdx', '');
        const title = (data.title as string) || slug;
        const description = (data.description as string) || null;
        const category = CATEGORY_MAP[(data.category as string) || ''] || (data.category as string) || 'job_seeker_attraction';
        const dateStr = (data.date as string) || (data.lastUpdated as string) || null;
        const targetKeyword = (data.tags as string[])?.join(', ') || null;

        // Check if post already exists
        const existing = await prisma.blogPost.findFirst({
            where: { slug },
        });

        if (existing) {
            console.log(`  SKIP  ${slug} (already in DB)`);
            skipped++;
            continue;
        }

        await prisma.blogPost.create({
            data: {
                title,
                slug,
                content: content.trim(),
                metaDescription: description,
                targetKeyword,
                category,
                status: 'published',
                publishDate: dateStr ? new Date(dateStr) : new Date(),
            },
        });

        console.log(`  SYNC  ${slug} → published`);
        synced++;
    }

    console.log(`\nDone! Synced: ${synced}, Skipped: ${skipped}`);
    await prisma.$disconnect();
    await pool.end();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
