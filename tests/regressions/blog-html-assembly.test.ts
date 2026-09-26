/**
 * Blog HTML assembled AFTER the sanitizer, and blog JSON-LD dates.
 *
 * app/blog/[slug]/page.tsx sanitizes the article body, then splices the Key
 * Takeaways block in above the first H2 and hands the whole string to
 * dangerouslySetInnerHTML. Whatever is spliced in at that point never meets
 * sanitize-html, and the heading text it renders is the RAW markdown source
 * line, so it has to escape on its own.
 *
 * The date half pins the other contract on the same page: blog_posts
 * timestamps are TIMESTAMP without time zone and arrive offset-less through
 * PostgREST, and Google reads an offset-less Article/VideoObject date as
 * ambiguous (the VideoObject validator rejects it outright).
 */
import { describe, expect, it } from 'vitest';
import {
    buildKeyTakeawaysHtml,
    escapeBlogText,
    extractHeadings,
    toIsoUtc,
} from '@/lib/blog';

describe('Key Takeaways cannot smuggle markup past the sanitizer', () => {
    const hostileMarkdown = [
        '## <img src=x onerror=alert(document.domain)>Salary',
        '',
        'Body copy.',
        '',
        '## <script>alert(1)</script>Benefits',
        '',
        'More body copy.',
    ].join('\n');

    it('renders no tag and no attribute that came from heading text', () => {
        const html = buildKeyTakeawaysHtml(extractHeadings(hostileMarkdown));

        // Only the elements and attributes this builder writes itself.
        const tags = [...html.matchAll(/<\/?([a-z][a-z0-9]*)\b/gi)].map((m) => m[1].toLowerCase());
        expect(new Set(tags)).toEqual(new Set(['div', 'span', 'ul', 'li', 'a']));
        const attrs = [...html.matchAll(/<[a-z][a-z0-9]*\s+([^>]*)>/gi)]
            .flatMap((m) => [...m[1].matchAll(/([a-zA-Z-]+)\s*=/g)].map((a) => a[1].toLowerCase()));
        expect(new Set(attrs)).toEqual(new Set(['class', 'href']));

        // Whatever came from the heading survives as inert text, never markup.
        expect(html.replace(/<[^>]*>/g, '')).not.toMatch(/[<>]/);
    });

    it('keeps the heading text readable rather than dropping it', () => {
        const html = buildKeyTakeawaysHtml(extractHeadings(hostileMarkdown));
        expect(html).toContain('Salary');
        expect(html).toContain('Benefits');
    });

    it('never lets an anchor id close its own href attribute', () => {
        const html = buildKeyTakeawaysHtml([
            { level: 2, text: 'x', id: 'a" onmouseover="alert(1)' },
        ]);
        // Scanning to the first raw double quote is exactly how a parser
        // finds the end of the attribute: the whole hostile id has to still
        // be inside it, with nothing spilling out as a second attribute.
        const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
        expect(hrefs).toHaveLength(1);
        expect(hrefs[0]).toContain('alert(1)');
        expect(hrefs[0]).not.toContain('"');
    });

    it('escapes the five characters that change HTML meaning', () => {
        expect(escapeBlogText(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
    });
});

describe('blog JSON-LD dates carry a timezone', () => {
    it('stamps UTC on an offset-less PostgREST timestamp', () => {
        const out = toIsoUtc('2026-02-02T00:00:00');
        expect(out).toBe('2026-02-02T00:00:00.000Z');
    });

    it('leaves an already-zoned value at the same instant', () => {
        expect(toIsoUtc('2026-02-02T05:30:00+05:30')).toBe('2026-02-02T00:00:00.000Z');
        expect(toIsoUtc('2026-02-02T00:00:00.000Z')).toBe('2026-02-02T00:00:00.000Z');
    });

    it('omits the field rather than emitting an invalid date', () => {
        expect(toIsoUtc(null)).toBeUndefined();
        expect(toIsoUtc('')).toBeUndefined();
        expect(toIsoUtc('not a date')).toBeUndefined();
    });
});
