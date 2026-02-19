import { createClient } from '@supabase/supabase-js';
import sanitizeHtml from 'sanitize-html';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BlogPost {
    id: string;
    title: string;
    slug: string;
    content: string;
    meta_description: string | null;
    target_keyword: string | null;
    category: BlogCategory;
    status: 'draft' | 'published';
    publish_date: string | null;
    created_at: string;
    updated_at: string;
}

export type BlogCategory =
    | 'job_seeker_attraction'
    | 'salary_negotiation'
    | 'career_myths'
    | 'state_spotlight'
    | 'employer_facing'
    | 'community_lifestyle'
    | 'industry_awareness'
    | 'product_lead_gen'
    | 'success_stories';

export const BLOG_CATEGORIES: { id: BlogCategory; label: string }[] = [
    { id: 'job_seeker_attraction', label: 'Job Seeker Tips' },
    { id: 'salary_negotiation', label: 'Salary Negotiation' },
    { id: 'career_myths', label: 'Career Myths' },
    { id: 'state_spotlight', label: 'State Spotlight' },
    { id: 'employer_facing', label: 'For Employers' },
    { id: 'community_lifestyle', label: 'Community & Lifestyle' },
    { id: 'industry_awareness', label: 'Industry Awareness' },
    { id: 'product_lead_gen', label: 'Product & Resources' },
    { id: 'success_stories', label: 'Success Stories' },
];

// ─── Supabase Client ─────────────────────────────────────────────────────────

function getSupabaseClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

function getSupabaseServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// ─── Query Functions ─────────────────────────────────────────────────────────

const POSTS_PER_PAGE = 12;

export async function getPublishedPosts(
    page = 1,
    limit = POSTS_PER_PAGE,
    category?: string
) {
    const supabase = getSupabaseClient();
    const offset = (page - 1) * limit;

    let query = supabase
        .from('blog_posts')
        .select('id, title, slug, meta_description, category, publish_date, created_at')
        .eq('status', 'published')
        .order('publish_date', { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

    if (category && category !== 'all') {
        query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching blog posts:', error);
        return [];
    }
    return data as BlogPost[];
}

export async function getPostCount(category?: string): Promise<number> {
    const supabase = getSupabaseClient();

    let query = supabase
        .from('blog_posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published');

    if (category && category !== 'all') {
        query = query.eq('category', category);
    }

    const { count, error } = await query;
    if (error) {
        console.error('Error counting blog posts:', error);
        return 0;
    }
    return count ?? 0;
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .single();

    if (error || !data) {
        return null;
    }
    return data as BlogPost;
}

export async function getRelatedPosts(
    category: string,
    currentSlug: string,
    limit = 3
): Promise<BlogPost[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, slug, meta_description, category, publish_date')
        .eq('status', 'published')
        .eq('category', category)
        .neq('slug', currentSlug)
        .order('publish_date', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching related posts:', error);
        return [];
    }
    return data as BlogPost[];
}

export async function getAllPublishedSlugs(): Promise<
    { slug: string; updated_at: string }[]
> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
        .from('blog_posts')
        .select('slug, updated_at')
        .eq('status', 'published')
        .order('publish_date', { ascending: false, nullsFirst: false });

    if (error) {
        console.error('Error fetching blog slugs:', error);
        return [];
    }
    return data ?? [];
}

// ─── Write Functions (service role) ──────────────────────────────────────────

export async function createBlogPost(
    data: Omit<BlogPost, 'id' | 'created_at' | 'updated_at'>
): Promise<BlogPost> {
    const supabase = getSupabaseServiceClient();

    const { data: post, error } = await supabase
        .from('blog_posts')
        .insert({ id: crypto.randomUUID(), ...data })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to create blog post: ${error.message}`);
    }
    return post as BlogPost;
}

// ─── Slug Generation ─────────────────────────────────────────────────────────

export function generateSlug(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
}

export async function generateUniqueSlug(title: string): Promise<string> {
    const supabase = getSupabaseServiceClient();
    const baseSlug = generateSlug(title);

    // Check if slug exists
    const { data } = await supabase
        .from('blog_posts')
        .select('slug')
        .like('slug', `${baseSlug}%`);

    if (!data || data.length === 0) return baseSlug;

    const existingSlugs = new Set(data.map((d) => d.slug));
    if (!existingSlugs.has(baseSlug)) return baseSlug;

    // Find next available number
    let counter = 2;
    while (existingSlugs.has(`${baseSlug}-${counter}`)) {
        counter++;
    }
    return `${baseSlug}-${counter}`;
}

// ─── Markdown to HTML ────────────────────────────────────────────────────────

export function markdownToHtml(markdown: string): string {
    let html = markdown;

    // Escape HTML entities in code blocks first (preserve them)
    const codeBlocks: string[] = [];
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
        codeBlocks.push(code);
        return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
    });

    const inlineCode: string[] = [];
    html = html.replace(/`([^`]+)`/g, (_, code) => {
        inlineCode.push(code);
        return `%%INLINECODE_${inlineCode.length - 1}%%`;
    });

    // Headings (h1-h6)
    html = html.replace(/^######\s+(.+)$/gm, (_, text) => {
        const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return `<h6 id="${id}">${text}</h6>`;
    });
    html = html.replace(/^#####\s+(.+)$/gm, (_, text) => {
        const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return `<h5 id="${id}">${text}</h5>`;
    });
    html = html.replace(/^####\s+(.+)$/gm, (_, text) => {
        const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return `<h4 id="${id}">${text}</h4>`;
    });
    html = html.replace(/^###\s+(.+)$/gm, (_, text) => {
        const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return `<h3 id="${id}">${text}</h3>`;
    });
    html = html.replace(/^##\s+(.+)$/gm, (_, text) => {
        const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return `<h2 id="${id}">${text}</h2>`;
    });
    html = html.replace(/^#\s+(.+)$/gm, (_, text) => {
        const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return `<h1 id="${id}">${text}</h1>`;
    });

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Blockquotes
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
    // Merge consecutive blockquotes
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr />');

    // Unordered lists
    html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Ordered lists
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<oli>$1</oli>');
    html = html.replace(/((?:<oli>.*<\/oli>\n?)+)/g, (match) => {
        return '<ol>' + match.replace(/<\/?oli>/g, (tag) => tag.replace('oli', 'li')) + '</ol>';
    });

    // Paragraphs — wrap remaining text lines
    html = html.replace(/^(?!<[a-z/]|%%)(.*\S.*)$/gm, '<p>$1</p>');

    // Remove empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');

    // Restore code blocks
    codeBlocks.forEach((code, i) => {
        const escaped = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        html = html.replace(
            `%%CODEBLOCK_${i}%%`,
            `<pre><code>${escaped.trim()}</code></pre>`
        );
    });

    inlineCode.forEach((code, i) => {
        const escaped = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        html = html.replace(`%%INLINECODE_${i}%%`, `<code>${escaped}</code>`);
    });

    // Sanitize HTML to prevent XSS
    html = sanitizeHtml(html, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
            'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code', 'hr',
        ]),
        allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            '*': ['id', 'class'],
            'img': ['src', 'alt', 'loading', 'width', 'height'],
            'a': ['href', 'target', 'rel'],
        },
        allowedSchemes: ['http', 'https', 'mailto'],
    });

    return html;
}

// ─── Auto-link State Mentions ────────────────────────────────────────────────

const STATE_MAP: Record<string, string> = {
    'Alabama': 'alabama', 'Alaska': 'alaska', 'Arizona': 'arizona',
    'Arkansas': 'arkansas', 'California': 'california', 'Colorado': 'colorado',
    'Connecticut': 'connecticut', 'Delaware': 'delaware', 'Florida': 'florida',
    'Georgia': 'georgia', 'Hawaii': 'hawaii', 'Idaho': 'idaho',
    'Illinois': 'illinois', 'Indiana': 'indiana', 'Iowa': 'iowa',
    'Kansas': 'kansas', 'Kentucky': 'kentucky', 'Louisiana': 'louisiana',
    'Maine': 'maine', 'Maryland': 'maryland', 'Massachusetts': 'massachusetts',
    'Michigan': 'michigan', 'Minnesota': 'minnesota', 'Mississippi': 'mississippi',
    'Missouri': 'missouri', 'Montana': 'montana', 'Nebraska': 'nebraska',
    'Nevada': 'nevada', 'New Hampshire': 'new-hampshire', 'New Jersey': 'new-jersey',
    'New Mexico': 'new-mexico', 'New York': 'new-york', 'North Carolina': 'north-carolina',
    'North Dakota': 'north-dakota', 'Ohio': 'ohio', 'Oklahoma': 'oklahoma',
    'Oregon': 'oregon', 'Pennsylvania': 'pennsylvania', 'Rhode Island': 'rhode-island',
    'South Carolina': 'south-carolina', 'South Dakota': 'south-dakota',
    'Tennessee': 'tennessee', 'Texas': 'texas', 'Utah': 'utah',
    'Vermont': 'vermont', 'Virginia': 'virginia', 'Washington': 'washington',
    'West Virginia': 'west-virginia', 'Wisconsin': 'wisconsin', 'Wyoming': 'wyoming',
    'District of Columbia': 'district-of-columbia',
};

export function autoLinkStates(html: string): string {
    const linked = new Set<string>();

    for (const [stateName, slug] of Object.entries(STATE_MAP)) {
        if (linked.has(stateName)) continue;

        // Only replace in text content, not inside tags or existing links
        const regex = new RegExp(
            `(?<!["/\\w-])\\b${stateName.replace(/\s/g, '\\s')}\\b(?![^<]*>)(?![^<]*<\\/a>)`,
            'g'
        );

        if (regex.test(html)) {
            // Only link the first occurrence
            let replaced = false;
            html = html.replace(regex, (match) => {
                if (replaced) return match;
                replaced = true;
                linked.add(stateName);
                return `<a href="/jobs/state/${slug}" class="text-teal-600 hover:underline">${match}</a>`;
            });
        }
    }

    return html;
}

// ─── Extract Headings for TOC ────────────────────────────────────────────────

export function extractHeadings(
    markdown: string
): { level: number; text: string; id: string }[] {
    const headings = markdown.match(/^#{2,3}\s.+/gm);
    if (!headings) return [];

    return headings.map((heading) => {
        const level = heading.startsWith('###') ? 3 : 2;
        const text = heading.replace(/^#{2,3}\s/, '');
        const id = text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-');
        return { level, text, id };
    });
}
