/**
 * The blog taxonomy, in a module a client component can import.
 *
 * lib/blog.ts owns the same list as BLOG_CATEGORIES, but it also pulls in the
 * Supabase client and sanitize-html at module scope, so importing it from the
 * 'use client' admin editor would ship both into the browser bundle. The admin
 * console only needs the ids and labels.
 *
 * tests/regressions/pages-admin-blog.test.ts fails if the two lists
 * ever drift: a category that exists in one and not the other is how posts in
 * four categories ended up unfilterable in the admin console, rendering their
 * raw id because the label lookup fell through.
 */

export interface BlogCategoryOption {
    id: string;
    label: string;
}

export const BLOG_CATEGORY_OPTIONS: readonly BlogCategoryOption[] = [
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

/**
 * A category's display label, or the raw id when the row predates the list.
 *
 * Legacy rows can carry ids outside the taxonomy (the edit API deliberately
 * does not range-check category on update, so those posts stay editable), and
 * showing the id beats showing nothing.
 */
export function blogCategoryLabel(id: string): string {
    return BLOG_CATEGORY_OPTIONS.find((c) => c.id === id)?.label ?? id;
}
