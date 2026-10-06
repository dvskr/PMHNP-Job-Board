/**
 * BreadcrumbList markup must be valid for the trails job pages actually build.
 *
 * Google's URL Inspection reported 'Missing field "item"' on job pages in
 * 2026-10: a city crumb with no page of its own is rendered as a plain label,
 * and the markup emitted it as a ListItem with no URL in the middle of the
 * list. Only the last item may omit `item`.
 */
import { describe, expect, it } from 'vitest';
import { buildBreadcrumbSchema } from '@/components/Breadcrumbs';

const BASE = 'https://example.test';

describe('buildBreadcrumbSchema', () => {
    it('gives every item except the last a URL', () => {
        const schema = buildBreadcrumbSchema(
            [
                { label: 'Home', href: '/' },
                { label: 'Jobs', href: '/jobs' },
                { label: 'Texas', href: '/jobs/state/texas' },
                { label: 'A city with no page' },
                { label: 'PMHNP at Example Clinic', href: '' },
            ],
            BASE,
        );
        const items = schema.itemListElement;

        expect(items.slice(0, -1).every((i) => typeof i.item === 'string')).toBe(true);
        expect(items.at(-1)?.name).toBe('PMHNP at Example Clinic');
    });

    it('drops the unlinked middle crumb and renumbers without a gap', () => {
        const schema = buildBreadcrumbSchema(
            [
                { label: 'Home', href: '/' },
                { label: 'Unlinked state' },
                { label: 'Unlinked city' },
                { label: 'Current page' },
            ],
            BASE,
        );

        expect(schema.itemListElement.map((i) => i.name)).toEqual(['Home', 'Current page']);
        expect(schema.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    });

    it('leaves a fully linked trail unchanged', () => {
        const schema = buildBreadcrumbSchema(
            [
                { label: 'Home', href: '/' },
                { label: 'Blog', href: '/blog' },
                { label: 'An article' },
            ],
            BASE,
        );

        expect(schema.itemListElement).toHaveLength(3);
        expect(schema.itemListElement[1].item).toBe(`${BASE}/blog`);
    });
});
