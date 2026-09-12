/**
 * The job-description sanitizer must not hand a posting the tools to redress
 * the public job page.
 *
 * Before this fix `sanitizeHtmlContent` allowed `id`, `class` and `style` on
 * every tag and passed no `allowedStyles`. sanitize-html only filters the
 * style attribute when `allowedStyles` is present, so every declaration
 * survived verbatim: a self-serve employer could store
 * `position:fixed; inset:0; z-index:9999` in the description and cover the
 * whole public job page with their own layer, hiding the real Apply button
 * behind an off-site link. Scripts and on* handlers were already stripped, so
 * the hole was UI redress rather than script XSS.
 *
 * These tests pin both halves: the attack payload loses its positioning, and
 * the formatting employers actually use keeps working.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeHtmlContent, sanitizeJobPosting } from '@/lib/sanitize';

describe('sanitizeHtmlContent: presentational and identity attributes', () => {
    describe('the overlay payload', () => {
        const overlay =
            '<div id="apply-button" class="fixed-overlay" ' +
            'style="position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;background:#fff">' +
            '<a href="https://not-the-employer.example/apply">Apply now</a></div>';

        it('strips position, inset, z-index and sizing from the style attribute', () => {
            const out = sanitizeHtmlContent(overlay);
            expect(out).not.toMatch(/position\s*:/i);
            expect(out).not.toMatch(/inset\s*:/i);
            expect(out).not.toMatch(/z-index/i);
            expect(out).not.toMatch(/100vw|100vh/i);
        });

        it('strips id so a posting cannot shadow a real element on the page', () => {
            expect(sanitizeHtmlContent(overlay)).not.toMatch(/\bid=/i);
        });

        it('strips class so a posting cannot borrow the page stylesheet', () => {
            expect(sanitizeHtmlContent(overlay)).not.toMatch(/\bclass=/i);
        });

        it('keeps the text content: the fix removes the weapon, not the words', () => {
            expect(sanitizeHtmlContent(overlay)).toContain('Apply now');
        });
    });

    describe('other layout escapes an inline style could reach for', () => {
        const cases: Array<[string, string]> = [
            ['display', '<p style="display:none">Legally required disclosure</p>'],
            ['opacity', '<p style="opacity:0">hidden</p>'],
            ['transform', '<span style="transform:scale(40)">x</span>'],
            ['background-image', '<div style="background-image:url(https://tracker.example/p.gif)">x</div>'],
            ['margin', '<p style="margin:-9999px">x</p>'],
        ];

        it.each(cases)('drops %s', (property, html) => {
            expect(sanitizeHtmlContent(html)).not.toMatch(new RegExp(property, 'i'));
        });
    });

    describe('formatting employers actually use still survives', () => {
        it('keeps headings, lists, bold, italic and underline', () => {
            const out = sanitizeHtmlContent(
                '<h2>About the role</h2><p>We are <strong>hiring</strong> an ' +
                '<em>outpatient</em> PMHNP.</p><ul><li>Flexible schedule</li></ul>'
            );
            expect(out).toContain('<h2>About the role</h2>');
            expect(out).toContain('<strong>hiring</strong>');
            expect(out).toContain('<em>outpatient</em>');
            expect(out).toContain('<li>Flexible schedule</li>');
        });

        it('keeps https links', () => {
            expect(sanitizeHtmlContent('<a href="https://careers.example/apply">Apply</a>'))
                .toContain('href="https://careers.example/apply"');
        });

        it('still drops javascript: links', () => {
            expect(sanitizeHtmlContent('<a href="javascript:alert(1)">click</a>'))
                .not.toMatch(/javascript:/i);
        });

        it('keeps typographic declarations that cannot move a box', () => {
            const out = sanitizeHtmlContent(
                '<p style="text-align:center;font-weight:bold;color:#1a2b3c">Now hiring</p>'
            );
            expect(out).toMatch(/text-align\s*:\s*center/i);
            expect(out).toMatch(/font-weight\s*:\s*bold/i);
            expect(out).toMatch(/color\s*:\s*#1a2b3c/i);
        });

        it('keeps table cell alignment while dropping cell positioning', () => {
            const out = sanitizeHtmlContent(
                '<table><tr><td colspan="2" style="text-align:right;position:absolute">Pay</td></tr></table>'
            );
            expect(out).toContain('colspan="2"');
            expect(out).toMatch(/text-align\s*:\s*right/i);
            expect(out).not.toMatch(/position\s*:/i);
        });
    });

    describe('the write path inherits the same rules', () => {
        it('sanitizeJobPosting strips the overlay from a stored description', () => {
            const result = sanitizeJobPosting({
                title: 'PMHNP Outpatient',
                employer: 'Fictional Behavioral Health',
                location: 'Austin, TX',
                description:
                    '<div id="overlay" class="takeover" style="position:fixed;inset:0;z-index:9999">' +
                    '<a href="https://not-the-employer.example">Apply</a></div>',
                applyLink: 'https://careers.example/apply',
                contactEmail: 'hiring@example.com',
            });

            expect(result.description).not.toMatch(/position\s*:/i);
            expect(result.description).not.toMatch(/\bid=/i);
            expect(result.description).not.toMatch(/\bclass=/i);
        });
    });
});
