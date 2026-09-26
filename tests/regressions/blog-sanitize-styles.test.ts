/**
 * The blog HTML pipeline allowed `style` on every element with no
 * allowedStyles map (hunt 2026-09-03). sanitize-html only filters the
 * attribute when that map is present, so post content could carry
 * `position:fixed; inset:0; z-index:99999` and cover the article with an
 * arbitrary overlay. lib/sanitize.ts fixed the job-description pipeline; the
 * duplicated blog config did not get the same treatment.
 *
 * Table styles must survive: markdownToHtml emits overflow-x on the wrapper
 * and text-align on aligned cells.
 */
import { describe, it, expect } from 'vitest';
import { resanitizeBlogHtml } from '@/lib/blog';

describe('blog HTML sanitizer style filtering', () => {
  it.each([
    'position:fixed',
    'z-index:99999',
    'inset:0',
    'top:0',
    'width:100vw',
    'background:url(https://evil.example/x.png)',
    'transform:scale(40)',
  ])('strips %s', (declaration) => {
    const out = resanitizeBlogHtml(`<div style="${declaration}">overlay</div>`);
    expect(out).not.toContain(declaration.split(':')[0]);
  });

  it('keeps the table styles markdownToHtml emits', () => {
    const wrapper = resanitizeBlogHtml('<div class="table-wrapper" style="overflow-x:auto;"><p>x</p></div>');
    expect(wrapper).toContain('overflow-x');

    const cell = resanitizeBlogHtml('<table><tbody><tr><td style="text-align:center">x</td></tr></tbody></table>');
    expect(cell).toContain('text-align');
  });

  it('keeps ordinary typographic styles', () => {
    const out = resanitizeBlogHtml('<span style="font-weight:bold;color:#ff0000">x</span>');
    expect(out).toContain('font-weight');
    expect(out).toContain('color');
  });
});
