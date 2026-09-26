/**
 * Company URL slugs.
 *
 * /companies linked straight to Company.normalizedName, and rows created
 * before the kebab normalizer still hold the space form, so the index shipped
 * hrefs like "/companies/life stance" and the company page echoed the literal
 * space back into its own canonical tag.
 *
 * The two invariants that matter: a slug with no whitespace wherever that is
 * safe, and a slug that the [slug] route can still resolve. That route tries
 * an exact match and then turns EVERY hyphen back into a space, so the round
 * trip has to be lossless or the link 404s.
 */
import { describe, expect, it } from 'vitest';
import { companyUrlSlug } from '@/lib/company-slug';

/** The de-slug step app/companies/[slug]/page.tsx falls back to. */
const legacyForm = (slug: string) => slug.replace(/-/g, ' ');

const NAMES = [
    'headway',
    'life stance',
    'seasoned recruitment',
    'blue sky telepsych',
    'kebab-already-normalized',
    'mixed form-name',
    'three word company name',
];

describe('companyUrlSlug', () => {
    it.each(NAMES)('keeps %s reachable through the [slug] resolver', (name) => {
        const slug = companyUrlSlug(name);
        const resolvable = slug === name || legacyForm(slug) === name;
        expect(resolvable, `${slug} resolves to neither form of ${name}`).toBe(true);
    });

    it('removes the whitespace from legacy space-form names', () => {
        expect(companyUrlSlug('life stance')).toBe('life-stance');
        expect(companyUrlSlug('blue sky telepsych')).toBe('blue-sky-telepsych');
    });

    it('leaves a name the resolver could not round-trip alone', () => {
        // "foo bar-baz" would be looked up as "foo bar baz" and 404. An ugly
        // URL that works beats a clean one that does not.
        expect(companyUrlSlug('foo bar-baz')).toBe('foo bar-baz');
    });

    it('is a no-op on names that are already clean', () => {
        expect(companyUrlSlug('headway')).toBe('headway');
        expect(companyUrlSlug('kebab-already-normalized')).toBe('kebab-already-normalized');
    });
});
