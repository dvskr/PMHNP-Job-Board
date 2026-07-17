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
    image_url: string | null;
    youtube_video_id: string | null;
    video_url: string | null;
    /** Editorial review timestamp. Takes precedence over updated_at as the
     *  BlogPosting.dateModified value when set (audit 14 HIGH). Bump on
     *  each review pass so dateModified reflects real freshness instead of
     *  being permanently equal to publish_date. */
    reviewed_at: string | null;
    /** Per-post FAQ data emitted as FAQPage JSON-LD. Populated via the
     *  n8n content pipeline. When null, the post page falls back to the
     *  legacy hardcoded blogFaqData map (audit 14 MEDIUM). */
    faq_json: Array<{ name: string; text: string }> | null;
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
    | 'success_stories'
    | 'mental_health_trends'
    | 'policy_industry'
    | 'career_opportunities'
    | 'tech_tools';

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
    { id: 'mental_health_trends', label: 'Mental Health Trends' },
    { id: 'policy_industry', label: 'Policy & Industry' },
    { id: 'career_opportunities', label: 'Career Opportunities' },
    { id: 'tech_tools', label: 'Tech & Tools' },
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
        .select('id, title, slug, meta_description, category, publish_date, created_at, image_url, youtube_video_id')
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

// Published-post count per category, in one query. Used by the blog index
// to render filter pills only for categories that actually have posts —
// empty ?category= URLs returned 200 "No posts yet" soft-404s that crawlers
// kept discovering through the pill links (GSC Fix 2026-07 audit P3).
// Returns null on failure so the caller can FAIL OPEN (render all pills)
// instead of hiding every category behind a transient Supabase error.
export async function getPublishedCategoryCounts(): Promise<Record<string, number> | null> {
    const supabase = getSupabaseClient();

    // Explicit limit: PostgREST caps unbounded selects at 1000 rows, which
    // would silently truncate counts once the post catalog grows past that.
    const { data, error } = await supabase
        .from('blog_posts')
        .select('category')
        .eq('status', 'published')
        .limit(10000);

    if (error || !data) {
        if (error) console.error('Error fetching blog category counts:', error);
        return null;
    }

    const counts: Record<string, number> = {};
    for (const row of data) {
        if (row.category) counts[row.category] = (counts[row.category] || 0) + 1;
    }
    return counts;
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

    // Try same-category first — strongest topical relevance signal.
    const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, slug, meta_description, category, publish_date, image_url')
        .eq('status', 'published')
        .eq('category', category)
        .neq('slug', currentSlug)
        .order('publish_date', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching related posts:', error);
        return [];
    }

    let related = (data ?? []) as BlogPost[];

    // Top up from any-category if the same-category query is short of `limit`.
    // Thin categories (1-2 posts) would otherwise leave the "Read Next" block
    // empty, costing every post page an internal-linking opportunity. The
    // any-category fill ranks lower for topical match but still beats nothing.
    if (related.length < limit) {
        const have = new Set([currentSlug, ...related.map((p) => p.slug)]);
        const { data: fillData, error: fillErr } = await supabase
            .from('blog_posts')
            .select('id, title, slug, meta_description, category, publish_date, image_url')
            .eq('status', 'published')
            .neq('slug', currentSlug)
            .order('publish_date', { ascending: false, nullsFirst: false })
            .limit(limit + related.length);

        if (!fillErr && fillData) {
            for (const post of fillData as BlogPost[]) {
                if (related.length >= limit) break;
                if (have.has(post.slug)) continue;
                related.push(post);
                have.add(post.slug);
            }
        }
    }

    return related;
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
    // reviewed_at and faq_json are populated separately (editorial review
    // pass and n8n content pipeline respectively), not at create time.
    data: Omit<BlogPost, 'id' | 'created_at' | 'updated_at' | 'reviewed_at' | 'faq_json'>
): Promise<BlogPost> {
    const supabase = getSupabaseServiceClient();

    // Build insert payload — only include image_url when provided
    // (Supabase schema cache may not know about new columns immediately)
    const insertData: Record<string, unknown> = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...data,
    };
    if (!insertData.image_url) delete insertData.image_url;

    const { data: post, error } = await supabase
        .from('blog_posts')
        .insert(insertData)
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

// GSC Fix (2026-07 audit P2.12): thrown when a new post's slug collides with
// an existing one. On an automated pipeline a base-slug collision is a
// duplicate submission until proven otherwise — silently minting "-2" is how
// the live duplicate of the residency directory (the #2 page on the site) got
// published with its own self-canonical, splitting ranking signals.
export class SlugCollisionError extends Error {
    readonly slug: string;
    constructor(slug: string) {
        super(
            `A blog post with slug "${slug}" already exists — refusing to create a "-2" duplicate. ` +
            `If this is genuinely a different article, retitle it so it produces a distinct slug.`
        );
        this.name = 'SlugCollisionError';
        this.slug = slug;
    }
}

export async function generateUniqueSlug(title: string): Promise<string> {
    const supabase = getSupabaseServiceClient();
    const baseSlug = generateSlug(title);

    // Check if slug exists. A FAILED check must throw (review finding): the
    // old code treated query errors as "no collision", silently bypassing
    // the SlugCollisionError contract exactly when Supabase is flaky.
    const { data, error } = await supabase
        .from('blog_posts')
        .select('slug')
        .like('slug', `${baseSlug}%`);

    if (error) {
        throw new Error(`Slug collision check failed for "${baseSlug}": ${error.message}`);
    }

    if (!data || data.length === 0) return baseSlug;

    const existingSlugs = new Set(data.map((d) => d.slug));
    if (!existingSlugs.has(baseSlug)) return baseSlug;

    throw new SlugCollisionError(baseSlug);
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
    // Single-hash markdown headings render as <h2>, not <h1>. Blog post pages
    // already render the post title as the page-level <h1>; allowing body
    // content to emit additional H1s would produce duplicate-H1 documents
    // and weaken topic signal. Authors who want the largest body heading
    // should use ## (which already renders as <h2>) — the visual size is
    // controlled by editorial.css, not the tag.
    html = html.replace(/^#\s+(.+)$/gm, (_, text) => {
        const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return `<h2 id="${id}">${text}</h2>`;
    });

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');

    // Links (markdown syntax)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Auto-link bare URLs (not already inside an <a> tag or href attribute)
    html = html.replace(
        /(?<!")(?<!href=")(?<!<a[^>]*>)(https?:\/\/[^\s<>"',;!)\]]+[^\s<>"',;!.)\]])/g,
        (url) => {
            const isInternal = url.includes('pmhnphiring.com');
            return isInternal
                ? `<a href="${url}">${url}</a>`
                : `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
        }
    );

    // Blockquotes
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
    // Merge consecutive blockquotes
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

    // GFM Tables
    html = html.replace(
        /^(\|.+\|)\r?\n(\|[\s:|-]+\|)\r?\n((?:\|.+\|\r?\n?)+)/gm,
        (match, headerRow, separatorRow, bodyRows) => {
            // Parse alignment from separator row
            const alignments = separatorRow
                .split('|')
                .filter((c: string) => c.trim())
                .map((c: string) => {
                    const trimmed = c.trim();
                    if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
                    if (trimmed.endsWith(':')) return 'right';
                    return 'left';
                });

            // Parse header
            const headers = headerRow
                .split('|')
                .filter((c: string) => c.trim() !== '')
                .map((c: string) => c.trim());

            let tableHtml =
                '<div class="table-wrapper" style="overflow-x:auto;"><table><thead><tr>';
            headers.forEach((h: string, i: number) => {
                const align = alignments[i] || 'left';
                tableHtml += `<th style="text-align:${align}">${h}</th>`;
            });
            tableHtml += '</tr></thead><tbody>';

            // Parse body rows
            const rows = bodyRows.trim().split('\n');
            rows.forEach((row: string) => {
                const cells = row
                    .split('|')
                    .filter((c: string) => c.trim() !== '')
                    .map((c: string) => c.trim());
                tableHtml += '<tr>';
                cells.forEach((cell: string, i: number) => {
                    const align = alignments[i] || 'left';
                    tableHtml += `<td style="text-align:${align}">${cell}</td>`;
                });
                tableHtml += '</tr>';
            });

            tableHtml += '</tbody></table></div>';
            return tableHtml;
        }
    );

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
    html = sanitizeHtml(html, BLOG_SANITIZE_CONFIG);

    return html;
}

// Shared sanitize-html config so the post-autoLink re-sanitize pass below
// uses the exact same allowedTags/allowedAttributes as the initial pass —
// otherwise we'd silently strip legitimate markup added by the auto-linkers.
const BLOG_SANITIZE_CONFIG: sanitizeHtml.IOptions = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code', 'hr',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div',
    ]),
    allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        '*': ['id', 'class', 'style'],
        'img': ['src', 'alt', 'loading', 'width', 'height'],
        'a': ['href', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
};

/**
 * Re-sanitize blog post HTML after autoLinkStates / autoLinkCategories.
 *
 * Why: those functions inject <a> tags into already-sanitized HTML using
 * regex — defense-in-depth says any text-in-attribute false positive that
 * slips past the negative-lookbehind would bypass the original sanitize-
 * html step. Applying the same config a second time catches it.
 *
 * The auto-linkers only emit well-formed <a href class> tags that
 * BLOG_SANITIZE_CONFIG already allows, so legitimate output passes
 * through unchanged.
 */
export function resanitizeBlogHtml(html: string): string {
    return sanitizeHtml(html, BLOG_SANITIZE_CONFIG);
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
