/**
 * A single trailing space after a table row's closing pipe made the GFM
 * table pattern in markdownToHtml fail, so the whole table rendered as
 * paragraphs of raw `| a | b |` text (remote-pmhnp-jobs-guide-2026, found
 * 2026-10-06). Trailing whitespace is invisible in an editor and common in
 * pasted content, so the converter has to tolerate it.
 */
import { describe, it, expect } from 'vitest';
import { markdownToHtml } from '@/lib/blog';

const rowCount = (html: string) => (html.match(/<tr>/g) ?? []).length;

describe('markdownToHtml table rows with trailing whitespace', () => {
  it('renders a table whose separator row ends in a space', () => {
    const html = markdownToHtml(['| Platform | Model |', '|----------|-------| ', '| **A** | W-2 |', '| **B** | 1099 |'].join('\n'));
    expect(html).toContain('<table>');
    expect(html).not.toMatch(/<p>\s*\|/);
    expect(rowCount(html)).toBe(3);
  });

  it('keeps every body row when one ends in a tab or spaces', () => {
    const html = markdownToHtml(['| A | B |', '|---|---|', '| 1 | 2 |  ', '| 3 | 4 |\t', '| 5 | 6 |'].join('\n'));
    expect(rowCount(html)).toBe(4);
    expect(html).toContain('<td style="text-align:left">5</td>');
  });

  it('handles CRLF line endings with trailing spaces', () => {
    const html = markdownToHtml(['| A | B |', '|---|---| ', '| 1 | 2 | '].join('\r\n'));
    expect(rowCount(html)).toBe(2);
  });

  it('still renders a clean table unchanged', () => {
    const html = markdownToHtml(['| A | B |', '|:---|---:|', '| 1 | 2 |'].join('\n'));
    expect(html).toContain('<th style="text-align:left">A</th>');
    expect(html).toContain('<td style="text-align:right">2</td>');
  });

  it('leaves trailing spaces on ordinary prose lines alone', () => {
    const html = markdownToHtml('Use a pipe | in prose  \nnext line');
    expect(html).not.toContain('<table>');
  });
});
