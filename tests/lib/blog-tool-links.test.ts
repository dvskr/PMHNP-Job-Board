import { describe, expect, it } from 'vitest';
import { getBlogToolLinks, MAX_BLOG_TOOL_LINKS } from '@/lib/blog-tool-links';

describe('getBlogToolLinks', () => {
    it('points a salary post at the offer analyzer', () => {
        const links = getBlogToolLinks('PMHNP Salary Negotiation: how to counter an offer');

        expect(links.map((l) => l.href)).toContain('/tools/offer-analyzer');
    });

    it('points a contractor post at the 1099 calculator first', () => {
        const links = getBlogToolLinks('PMHNP 1099 Tax Guide: what contractors owe and how pay compares');

        expect(links[0].href).toBe('/tools/1099-vs-w2-calculator');
    });

    it('points a resume post at the resume checker', () => {
        const links = getBlogToolLinks('PMHNP Resume Guide: beat the ATS');

        expect(links.map((l) => l.href)).toEqual(['/tools/resume-checker']);
    });

    it('returns nothing for a post no tool answers', () => {
        expect(getBlogToolLinks('A day in the life of a psychiatric nurse practitioner')).toEqual([]);
    });

    it('never returns more than the cap, however many topics a post touches', () => {
        const links = getBlogToolLinks('1099 contractor resume, salary offer, hourly rate, practice authority and licensure');

        expect(links).toHaveLength(MAX_BLOG_TOOL_LINKS);
    });

    it('does not match a topic word buried inside another word', () => {
        // "repay" and "payer" contain "pay"; "cvs" contains "cv".
        expect(getBlogToolLinks('How a payer credentials you, and what CVS repayment looks like')).toEqual([]);
    });
});
