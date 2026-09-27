/**
 * The plain-text reflow, now shared between the web job page and the
 * full-description email.
 *
 * Roughly 590 of the ~600 live postings with a substantial description are
 * aggregator rows, which lib/description-cleaner.ts stores as plain text
 * with bullet characters and newlines and no markup at all. Without this
 * reflow they render as one undifferentiated block, which is what made the
 * email format look viable only for employer postings.
 *
 * Each rule here was a real rendering fault on a real posting, so the cases
 * below are the faults, not invented edges.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect } from 'vitest';
import { parseJdBlocks, looksLikeHtml } from '@/lib/jd-blocks';
import { buildJdBodyHtml } from '@/lib/email/jd-body';

describe('it tells the two stored formats apart', () => {
  it('reads editor HTML as HTML', () => {
    expect(looksLikeHtml('<p>Adult outpatient panel.</p>')).toBe(true);
  });

  it('reads a cleaned aggregator body as plain text', () => {
    expect(looksLikeHtml('ABOUT THE ROLE\n\n• Medication management\n• Telehealth')).toBe(false);
  });

  it('treats an empty body as plain text rather than throwing', () => {
    expect(looksLikeHtml('')).toBe(false);
    expect(parseJdBlocks('')).toEqual([]);
  });
});

describe('it recovers the structure the aggregator flattened', () => {
  const blocks = parseJdBlocks(
    'ABOUT THE ROLE\nWe run an adult outpatient service.\n\nWhat you will do:\n• Diagnostic evaluation\n• Medication management\n\nBenefits\n• Health cover',
  );

  it('finds shouted lines as headers', () => {
    expect(blocks[0]).toEqual({ kind: 'header', text: 'ABOUT THE ROLE' });
  });

  it('finds a line ending in a colon as a header', () => {
    expect(blocks.some((b) => b.kind === 'header' && b.text === 'What you will do:')).toBe(true);
  });

  it('groups consecutive bullets into one list rather than many', () => {
    const lists = blocks.filter((b) => b.kind === 'bullets');
    expect(lists).toHaveLength(2);
    expect(lists[0]).toEqual({ kind: 'bullets', items: ['Diagnostic evaluation', 'Medication management'] });
  });

  it('keeps ordinary prose as paragraphs', () => {
    expect(blocks.some((b) => b.kind === 'para' && b.text.startsWith('We run an adult'))).toBe(true);
  });
});

describe('it drops the artefacts that ingest leaves behind', () => {
  it('drops a bullet marker with nothing after it', () => {
    const blocks = parseJdBlocks('• Real item\n•\n• Another item');
    expect(blocks).toEqual([{ kind: 'bullets', items: ['Real item', 'Another item'] }]);
  });

  it('does not split a list on a blank line that sits before a bullet', () => {
    const blocks = parseJdBlocks('• One\n\n• Two');
    expect(blocks.filter((b) => b.kind === 'bullets')).toHaveLength(1);
  });

  it('clamps a run of blank lines instead of stacking gaps', () => {
    const blocks = parseJdBlocks('First para.\n\n\n\n\nSecond para.');
    expect(blocks.filter((b) => b.kind === 'para')).toHaveLength(2);
  });
});

describe('the email renders a plain-text posting as real structure', () => {
  const plain = [
    'ABOUT THE ROLE',
    'Cascade runs a fully remote adult outpatient service across Texas with a panel of roughly ninety patients and protected administrative time each week for documentation and case review.',
    '',
    'What you will do:',
    '• Diagnostic evaluation and medication management for adults.',
    '• Ongoing telehealth follow-up on a fixed weekly template.',
    '',
    'Requirements:',
    '• Active Texas APRN licence with PMHNP-BC certification.',
    '• Unrestricted DEA registration and a willingness to work evenings occasionally.',
  ].join('\n');

  const body = buildJdBodyHtml(plain);

  it('emits lists and headings, not one run of text', () => {
    expect(body.html).toContain('<ul');
    expect(body.html).toContain('<li');
    expect(body.html).toContain('text-transform:uppercase');
  });

  it('inlines a style on everything, because a style block will not survive', () => {
    expect(body.html).not.toMatch(/<p>|<li>|<ul>/);
  });

  it('escapes the text, which arrives from a third-party feed', () => {
    const nasty = parseJdBlocks('• <script>alert(1)</script>');
    expect(nasty[0]).toEqual({ kind: 'bullets', items: ['<script>alert(1)</script>'] });
    expect(buildJdBodyHtml('Intro line.\n• <script>alert(1)</script>').html).not.toContain('<script>');
  });
});
