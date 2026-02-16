/**
 * One-time script: reformat the existing blog post content in Supabase.
 * Run with: npx tsx scripts/reformat-blog.ts
 */
import { createClient } from '@supabase/supabase-js';
import { formatBlogContent } from '../lib/blog-formatter';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Use production DB URL if available
    const prodDbUrl = process.env.PROD_DATABASE_URL;

    if (!url || !key) {
        console.error('Missing SUPABASE env vars');
        process.exit(1);
    }

    // We need to connect to the PRODUCTION Supabase project
    const supabase = createClient(
        'https://sggccmqjzuimwlahocmy.supabase.co',
        key.includes('sggccmqjzuimwlahocmy') ? key : key  // Will use whatever service key is available
    );

    console.log('Fetching blog posts...');

    const { data: posts, error } = await supabase
        .from('blog_posts')
        .select('id, slug, content, status');

    if (error) {
        console.error('Error fetching posts:', error.message);
        process.exit(1);
    }

    console.log(`Found ${posts?.length || 0} posts`);

    for (const post of posts || []) {
        console.log(`\nProcessing: ${post.slug} (${post.status})`);

        const formatted = formatBlogContent(post.content);

        if (formatted === post.content) {
            console.log('  → No changes needed');
            continue;
        }

        // Show a preview of changes
        const originalLines = post.content.split('\n').length;
        const formattedLines = formatted.split('\n').length;
        console.log(`  → Lines: ${originalLines} → ${formattedLines}`);

        // Preview first 500 chars of formatted content
        console.log('  → Preview:');
        console.log(formatted.substring(0, 500).split('\n').map(l => `    ${l}`).join('\n'));

        const { error: updateError } = await supabase
            .from('blog_posts')
            .update({ content: formatted })
            .eq('id', post.id);

        if (updateError) {
            console.error(`  → ERROR: ${updateError.message}`);
        } else {
            console.log('  → ✅ Updated successfully');
        }
    }

    console.log('\nDone!');
}

main().catch(console.error);
