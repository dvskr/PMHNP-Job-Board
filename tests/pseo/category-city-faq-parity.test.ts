/**
 * Single-source FAQ lock for the category x city template (2026-09 audit).
 *
 * tests/seo/faq-schema-parity.test.ts already locks this property on metro,
 * state, home and category pages. The category x city template, which renders
 * the largest indexable pSEO surface on the site, had no such lock and had
 * drifted the furthest: TWO hand-written `faqs` arrays, one scoped inside an
 * IIFE that only fed the FAQPage JSON-LD and one that fed the visible
 * accordion. Four of five questions disagreed, so the markup promised answer
 * engines a salary range, a practice-authority statement and a qualifications
 * answer no visitor could find. Google's FAQ guidance requires the markup to
 * mirror visible content, and a citation a reader cannot verify costs trust
 * for the whole domain.
 *
 * Source-text assertions, matching the style of the sibling parity test: the
 * template is a server component with database calls, so reading it is both
 * cheaper and stricter than rendering it.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const src = fs.readFileSync(
  path.resolve(__dirname, '../../lib/pseo/category-city-template.tsx'),
  'utf8',
);

const count = (re: RegExp): number => (src.match(re) ?? []).length;

describe('category x city pages emit exactly one FAQPage from one array', () => {
  it('declares the single-source array once, above the JSX', () => {
    expect(count(/const categoryCityFaqs = \[/g)).toBe(1);
  });

  it('has no second hand-written faqs array', () => {
    expect(src).not.toMatch(/const faqs = \[/);
  });

  it('emits exactly one FAQPage block', () => {
    expect(count(/'@type': 'FAQPage'/g)).toBe(1);
  });

  it('builds the FAQPage mainEntity from categoryCityFaqs', () => {
    expect(src).toMatch(/mainEntity: categoryCityFaqs\.map/);
  });

  it('renders the visible accordion from the SAME array', () => {
    expect(src).toMatch(/return categoryCityFaqs\.map\(\(faq, i\)/);
  });

  it('serializes the schema through jsonLdString', () => {
    // Repo rule: every JSON-LD sink goes through jsonLdString().
    expect(src).toMatch(/__html: jsonLdString\(\{\s*'@context': 'https:\/\/schema\.org',\s*'@type': 'FAQPage'/);
  });
});

describe('FAQ questions are scoped to the taxonomy, not just the city', () => {
  // Unscoped, sibling category pages for one city shipped identical Q&A, the
  // same near-duplicate signal the narrative carried.
  const questions = [...src.matchAll(/^\s*q: `([^`]+)`/gm)].map((m) => m[1]);

  it('found the five questions', () => {
    expect(questions).toHaveLength(5);
  });

  it('every question interpolates the category label', () => {
    for (const q of questions) {
      expect(q).toMatch(/\$\{config\.label/);
    }
  });

  it('every question interpolates the city', () => {
    for (const q of questions) {
      expect(q).toMatch(/\$\{city!\.(name|state)/);
    }
  });
});
