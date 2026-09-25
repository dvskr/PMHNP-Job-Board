import { BLOG_CATEGORIES } from '@/lib/blog';

/**
 * The only two statuses a blog post can hold.
 *
 * Kept next to the handlers rather than in lib/blog.ts because it describes
 * the API's accepted input, not the rendering model: the public blog treats
 * anything that is not 'published' as hidden, and the admin status filter
 * offers exactly these two. Without the check, a typo stored a post in a third
 * state that no surface lists.
 */
export const BLOG_POST_STATUSES = ['draft', 'published'] as const;

/**
 * Categories offered when CREATING a post. Edits are not range-checked: see
 * the note on the PUT handler's field specs.
 */
export const BLOG_POST_CATEGORIES: readonly string[] = BLOG_CATEGORIES.map((c) => c.id);
