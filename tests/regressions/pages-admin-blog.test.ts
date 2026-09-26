/**
 * Two defects on /admin/blog.
 *
 *  1. The page kept its own 9-entry category list while lib/blog.ts defines 13.
 *     Posts in the other four could not be filtered to, could not be reassigned
 *     in the editor, and rendered their raw id in the table because the label
 *     lookup fell through to the value.
 *
 *  2. The Preview control was a plain anchor to /blog/<slug>, and the public
 *     loader filters on status='published'. Previewing a draft was a guaranteed
 *     404: the only way to see a post before publishing was to publish it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BLOG_CATEGORY_OPTIONS, blogCategoryLabel } from '@/lib/blog-categories';
import { BLOG_CATEGORIES } from '@/lib/blog';
import { readCode } from '../helpers/source';

const ADMIN_BLOG_PAGE = path.join(process.cwd(), 'app/admin/blog/page.tsx');
const PREVIEW_PAGE = path.join(process.cwd(), 'app/admin/blog/preview/[id]/page.tsx');

describe('blog category taxonomy', () => {
    it('offers exactly the categories a post can hold', () => {
        const canonical = BLOG_CATEGORIES.map((c) => c.id).sort();
        const offered = BLOG_CATEGORY_OPTIONS.map((c) => c.id).sort();
        expect(offered).toEqual(canonical);
    });

    it('has a label for every category, so no surface renders a raw id', () => {
        for (const category of BLOG_CATEGORIES) {
            const label = blogCategoryLabel(category.id);
            expect(label).not.toBe(category.id);
            expect(label.trim()).not.toBe('');
        }
    });

    it('falls back to the id for a row that predates the taxonomy', () => {
        // The edit API deliberately does not range-check category on update so
        // legacy rows stay editable; showing their id beats showing nothing.
        expect(blogCategoryLabel('some_legacy_value')).toBe('some_legacy_value');
    });

    it('is the list the admin console renders, not a second copy of it', () => {
        const src = fs.readFileSync(ADMIN_BLOG_PAGE, 'utf8');
        expect(src).toContain('BLOG_CATEGORY_OPTIONS');
        // A literal category id in the page would be a hand-maintained list
        // creeping back in. The ids only belong in lib/blog-categories.ts.
        const inlineIds = BLOG_CATEGORIES.filter((c) => src.includes(`'${c.id}'`));
        expect(inlineIds.map((c) => c.id)).toEqual([]);
    });
});

describe('draft preview', () => {
    const src = readCode('app/admin/blog/page.tsx');

    it('does not send a draft to the public URL, which 404s until it is published', () => {
        // The old href was unconditional. The invariant is that the public
        // path is only ever reached from a published check, so require the
        // two to sit in one expression rather than on one physical line:
        // splitting the ternary across lines is a reformat, not a defect.
        const publicHref = src.indexOf('`/blog/${post.slug}`');
        expect(publicHref, 'the public blog href is gone entirely').toBeGreaterThan(-1);
        // Walk back to the enclosing href={...} and require the guard inside.
        const attrStart = src.lastIndexOf('href={', publicHref);
        expect(attrStart, 'the public href is not inside an href attribute').toBeGreaterThan(-1);
        const expression = src.slice(attrStart, publicHref);
        expect(
            /post\.status\s*===\s*'published'/.test(expression),
            'the public href is not gated on the post being published',
        ).toBe(true);
    });

    it('points a draft at an admin preview route that exists', () => {
        expect(src).toContain('/admin/blog/preview/');
        expect(fs.existsSync(PREVIEW_PAGE)).toBe(true);
    });

    it('renders the preview regardless of status and keeps it out of the index', () => {
        const preview = readCode('app/admin/blog/preview/[id]/page.tsx');
        // Looking the post up by id rather than by published slug is the whole
        // point; a status filter here would reintroduce the 404. Any of the
        // by-id lookups is fine, so do not pin one method name.
        expect(preview).toMatch(/prisma\.blogPost\.find(Unique|UniqueOrThrow|First)\b/);
        expect(preview).toMatch(/\bid\b/);
        expect(preview).not.toContain("status: 'published'");
        expect(preview).toMatch(/index:\s*false/);
    });
});
