/**
 * Static guards against stale page metadata. Pricing moved to a single
 * tier on 2026-04-30, and count claims ("3,000+ employers", "85+ articles")
 * drift as the data grows. Each test reads the real source and pins the
 * fix: pricing copy flows from lib/config, count claims are either derived
 * from the live source or removed.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('post-job metadata sells the single-tier model from config', () => {
  const src = read('app/post-job/layout.tsx');

  it('description no longer names the retired Starter/Growth/Premium tiers', () => {
    expect(src).not.toContain('Starter');
    expect(src).not.toContain('Growth');
    expect(src).not.toContain('Premium');
  });

  it('price and duration come from lib/config, not hardcoded numbers', () => {
    expect(src).toContain("import { config } from '@/lib/config'");
    expect(src).toContain('${config.postingPrice}');
    expect(src).toContain('${config.durationDays}');
  });

  it('free post claim carries no duration, only the paid listing does', () => {
    expect(src).toMatch(/First post free, then \$\$\{config\.postingPrice\} for a \$\{config\.durationDays\}-day/);
  });
});

describe('companies metadata makes no employer-count claim', () => {
  const src = read('app/companies/page.tsx');

  it('no hardcoded employer count anywhere in the metadata or body', () => {
    expect(src).not.toMatch(/[\d,]+\+ employers/);
  });

  it('contact page FAQ makes no company-count claim either', () => {
    expect(read('app/contact/page.tsx')).not.toMatch(/[\d,]+\+ (?:companies|employers)/);
  });

  it('description and twitter.description share the number-free copy', () => {
    const copy = 'Browse employers actively hiring psychiatric nurse practitioners across all 50 states. Updated daily.';
    const occurrences = src.split(copy).length - 1;
    expect(occurrences).toBe(2);
  });
});

describe('resources metadata derives the article count instead of hardcoding it', () => {
  const src = read('app/resources/page.tsx');

  it('no hardcoded "85+" claim survives', () => {
    expect(src).not.toContain('85+');
  });

  it('generateMetadata counts published posts from the same table the body renders', () => {
    expect(src).toContain('export async function generateMetadata');
    expect(src).toMatch(/prisma\.blogPost\.count\(\{ where: \{ status: 'published' \} \}\)/);
  });

  it('count rounds down to the nearest 5 and goes number-free below one step', () => {
    expect(src).toContain('Math.floor(count / 5) * 5');
    expect(src).toMatch(/rounded >= 5 \? `\$\{rounded\}\+` : null/);
  });
});
