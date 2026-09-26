/**
 * Turn a stored job description into body HTML an email client will render.
 *
 * Two things make this necessary.
 *
 * First, Job.description holds two incompatible formats and carries no
 * discriminator. Employer postings are sanitized Quill HTML, written through
 * sanitizeJobPosting at save time. Aggregator postings are PLAIN TEXT:
 * lib/description-cleaner.ts strips every tag at ingest and leaves bullet
 * characters and newlines. The web JD page sniffs between them at render
 * time and has about 110 lines of reflow logic inline in the page component
 * for the plain-text case. This module only handles the HTML case, because
 * the full-description email is gated to employer postings.
 *
 * Second, email needs inline styles on every element. Quill emits bare <p>,
 * <ul> and <strong> with no attributes, and a <style> block does not survive
 * Gmail, so each tag has to carry its own styling.
 *
 * There is also a hard size limit: Gmail clips a message at roughly 102KB and
 * hides the rest behind "View entire message", which would cut the apply
 * button off the bottom of a long posting. So the body is budgeted by visible
 * characters and cut at a block boundary, with the caller told it happened.
 */

import { SANS, SERIF, V2 } from '@/lib/email-templates-v2';

/**
 * Visible characters of description to include.
 *
 * Chosen against Gmail's clipping threshold rather than for looks: the shell,
 * the hero, the snapshot strip, the chips, the screening block and the footer
 * come to roughly 20KB of markup, and styled body HTML runs about 4x its
 * visible length once every tag carries inline CSS. 4,000 visible characters
 * lands the whole message near 40KB, which leaves room for a long title or an
 * unusually large set of screening questions without approaching the cut.
 */
export const JD_BODY_BUDGET = 4000;

/** Below this there is not enough posting to justify the format. */
export const JD_MIN_VISIBLE = 600;

export interface JdBody {
  /** Email-ready HTML. Empty when the input had no usable content. */
  html: string;
  /** Visible characters of the source, before any truncation. */
  visibleLength: number;
  /** True when the budget cut the body short. */
  truncated: boolean;
}

const BLOCK_SPLIT = /(?=<(?:p|h[1-6]|ul|ol|blockquote|div|section)\b)/i;

/** Visible text length, for budgeting and for the minimum-content gate. */
export function visibleTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, 'x')
    .replace(/\s+/g, ' ')
    .trim().length;
}

const P = `margin:0 0 14px;font-family:${SERIF};font-size:15px;line-height:1.72;color:${V2.textBody};`;
const LI = `margin:0 0 7px;font-family:${SERIF};font-size:15px;line-height:1.72;color:${V2.textBody};`;
const H = `margin:22px 0 10px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${V2.textHeading};`;

/**
 * Restyle the tags worth keeping and unwrap everything else.
 *
 * Deliberately not a parser. The input is already sanitized to a known tag
 * allowlist at write time, so the job here is presentational, and a regex
 * pass avoids pulling a DOM library into the mail path. Anything outside the
 * list below is unwrapped rather than dropped, so its text survives even when
 * its container does not.
 */
function restyle(html: string): string {
  let out = html;

  // Headings all collapse to one label style. A posting that uses h2 and h4
  // is not expressing two levels of meaning, it is just what the editor gave.
  //
  // Via a sentinel, because headings become <p> and the paragraph rule below
  // matches any <p ...>: rewriting them directly meant the paragraph rule
  // immediately overwrote the heading style with the body style, and every
  // section label rendered as ordinary prose.
  out = out.replace(/<h[1-6]\b[^>]*>/gi, '<x-jd-h>').replace(/<\/h[1-6]>/gi, '</x-jd-h>');

  out = out.replace(/<p\b[^>]*>/gi, `<p style="${P}">`);
  out = out.replace(/<x-jd-h>/g, `<p style="${H}">`).replace(/<\/x-jd-h>/g, '</p>');
  out = out.replace(/<li\b[^>]*>/gi, `<li style="${LI}">`);
  out = out.replace(/<ul\b[^>]*>/gi, `<ul style="margin:0 0 14px;padding-left:20px;">`);
  out = out.replace(/<ol\b[^>]*>/gi, `<ol style="margin:0 0 14px;padding-left:20px;">`);
  out = out.replace(
    /<blockquote\b[^>]*>/gi,
    `<blockquote style="margin:0 0 14px;padding:2px 0 2px 14px;border-left:3px solid ${V2.borderPeach};font-family:${SERIF};font-size:15px;line-height:1.7;color:${V2.textBody};">`,
  );
  out = out.replace(/<(strong|b)\b[^>]*>/gi, `<strong style="font-weight:700;color:${V2.textHeading};">`);
  out = out.replace(/<\/(strong|b)>/gi, '</strong>');
  out = out.replace(/<(em|i)\b[^>]*>/gi, '<em>').replace(/<\/(em|i)>/gi, '</em>');

  // Links keep their href and nothing else. target and rel are meaningless in
  // most mail clients and a stray style attribute could hide the text.
  out = out.replace(/<a\b[^>]*?href=["']([^"']*)["'][^>]*>/gi,
    (_m, href: string) => `<a href="${href}" style="color:${V2.teal};text-decoration:underline;">`);

  out = out.replace(/<hr\b[^>]*>/gi, `<div style="border-top:1px solid ${V2.borderLight};margin:18px 0;font-size:1px;line-height:1px;">&nbsp;</div>`);
  out = out.replace(/<br\s*\/?>/gi, '<br>');

  // Unwrap the rest: keep the words, drop the box.
  out = out.replace(/<\/?(?!p\b|\/?p>|li\b|ul\b|ol\b|strong\b|em\b|a\b|br\b|blockquote\b|div\b)[a-z][a-z0-9]*\b[^>]*>/gi, '');
  out = out.replace(/<\/?div\b[^>]*>/gi, '');

  return out;
}

/**
 * Build the body, cutting at a block boundary once the budget is spent.
 *
 * Cutting mid-sentence would be worse than cutting early: the reader cannot
 * tell a truncated posting from a badly written one. So blocks are added
 * whole, and the caller renders a link to the rest.
 */
export function buildJdBodyHtml(description: string, budget = JD_BODY_BUDGET): JdBody {
  const source = (description || '').trim();
  const visibleLength = visibleTextLength(source);
  if (!source || visibleLength === 0) {
    return { html: '', visibleLength: 0, truncated: false };
  }

  const styled = restyle(source);
  if (visibleLength <= budget) {
    return { html: styled, visibleLength, truncated: false };
  }

  const blocks = styled.split(BLOCK_SPLIT).filter((b) => b.trim());
  const kept: string[] = [];
  let spent = 0;
  for (const block of blocks) {
    const cost = visibleTextLength(block);
    // Always keep at least one block, or a posting whose opening paragraph
    // exceeds the budget on its own would render an empty body.
    if (kept.length && spent + cost > budget) break;
    kept.push(block);
    spent += cost;
  }

  return { html: kept.join(''), visibleLength, truncated: true };
}

/**
 * Whether a posting has enough description to be worth a full-description
 * email at all. Below the floor the format is a beautiful template wrapped
 * around two sentences, which is worse than the digest entry it replaced.
 */
export function hasEnoughDescription(description: string): boolean {
  return visibleTextLength(description || '') >= JD_MIN_VISIBLE;
}
