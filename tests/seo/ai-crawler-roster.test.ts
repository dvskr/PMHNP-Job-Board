/**
 * AI crawler roster locks (distribution audit D1).
 *
 * The 2025-26 on-demand AI fetchers (Claude-User, Perplexity-User, etc.)
 * were missing from both the middleware rate-limit allowlist and robots.txt.
 * These are the agents that fetch a page at the exact moment an assistant
 * decides whether to cite us — throttling or blocking them is invisible
 * lost distribution.
 *
 * Source-reading regression locks (same style as tests/api/renewal-cta.test.ts)
 * plus functional assertions against the robots() output, so neither roster
 * can silently lose an entry again.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import robotsHandler from '@/app/robots';

const read = (rel: string): string =>
    fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

/** The KNOWN_CRAWLER_UAS array literal from middleware.ts. */
function middlewareRosterSource(): string {
    const src = read('middleware.ts');
    const start = src.indexOf('const KNOWN_CRAWLER_UAS = [');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('];', start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
}

// The nine fetchers the audit found missing, plus a few pre-existing
// anchors so a wholesale roster deletion also fails loudly.
const REQUIRED_MIDDLEWARE_UAS = [
    // D1 additions
    'Claude-User',
    'Claude-SearchBot',
    'Perplexity-User',
    'DuckAssistBot',
    'Meta-ExternalAgent',
    'Meta-ExternalFetcher',
    'MistralAI-User',
    'Amazonbot',
    'AI2Bot',
    // Pre-existing anchors
    'Googlebot',
    'Bingbot',
    'ClaudeBot',
    'GPTBot',
    'PerplexityBot',
];

describe('middleware KNOWN_CRAWLER_UAS roster', () => {
    const roster = middlewareRosterSource();

    it.each(REQUIRED_MIDDLEWARE_UAS)('includes %s', (ua) => {
        expect(roster).toContain(ua);
    });
});

describe('robots.txt crawler rosters', () => {
    const robots = robotsHandler();
    const rules = robots.rules as Array<{
        userAgent?: string | string[];
        allow?: string | string[];
        disallow?: string | string[];
    }>;

    const ruleFor = (ua: string) =>
        rules.find((r) =>
            Array.isArray(r.userAgent) ? r.userAgent.includes(ua) : r.userAgent === ua
        );

    it('keeps the dedicated Anthropic rule with explicit Allow: / for all three Anthropic agents', () => {
        for (const ua of ['ClaudeBot', 'Claude-User', 'Claude-SearchBot']) {
            const rule = ruleFor(ua);
            expect(rule, `${ua} must have a rule block`).toBeDefined();
            const allows = Array.isArray(rule!.allow) ? rule!.allow : [rule!.allow];
            expect(allows).toContain('/');
            // Organic audit 2026-08 D6: the sitemap children and OG images
            // live under /api/, so the block needs the PUBLIC_ALLOW
            // carve-outs or Anthropic's parser treats them as blocked.
            expect(allows).toContain('/api/sitemaps');
            expect(allows).toContain('/api/og');
        }
    });

    it('the Anthropic rule disallows the token-bearing paths its policy comment promises', () => {
        const rule = ruleFor('ClaudeBot');
        expect(rule).toBeDefined();
        const disallows = Array.isArray(rule!.disallow) ? rule!.disallow : [rule!.disallow];
        for (const p of [
            '/jobs/edit/',
            '/post-job/checkout',
            '/post-job/preview',
            '/job-alerts/unsubscribe',
            '/email-preferences',
            '/unsubscribe',
            '/reset-password',
            '/forgot-password',
        ]) {
            expect(disallows, `ClaudeBot rule must disallow ${p}`).toContain(p);
        }
    });

    it.each([
        'Perplexity-User',
        'DuckAssistBot',
        'Meta-ExternalFetcher',
        'meta-externalagent',
        'MistralAI-User',
        'Amazonbot',
        'AI2Bot',
    ])('names %s in an allow rule', (ua) => {
        const rule = ruleFor(ua);
        expect(rule, `${ua} must be named in a rule block`).toBeDefined();
        // Every named AI rule carries an allow (either '/' or PUBLIC_ALLOW) —
        // being named with only a disallow would read as an unwelcome signal.
        expect(rule!.allow).toBeDefined();
    });

    it('gives the Anthropic block the SAME disallow set as the catch-all', () => {
        // The Anthropic block is special for exactly one reason: the explicit
        // `Allow: /` that its parser needs. Its disallow list was a separate
        // hand-written array, and it drifted -- most damagingly it never
        // received POST_DEADLINE_AUTH_REBLOCK, so Anthropic's fetchers were
        // the one crawler family still pointed at /login, /signup, /messages
        // and /saved after the re-block date, plus the parameterized /jobs?
        // URLs every other bot had been steered off.
        //
        // Pinning set equality (not a list of specific paths) is what keeps
        // it from drifting again: any future addition to FULL_DISALLOW or to
        // the post-deadline set lands in both places or fails here.
        const claude = ruleFor('ClaudeBot');
        const catchAll = ruleFor('*');
        expect(claude).toBeDefined();
        expect(catchAll).toBeDefined();
        const asList = (v: string | string[] | undefined) =>
            (Array.isArray(v) ? v : v ? [v] : []).slice().sort();
        expect(asList(claude!.disallow)).toEqual(asList(catchAll!.disallow));
    });

    it('still declares the sitemap entrypoints', () => {
        expect(robots.sitemap).toEqual(
            expect.arrayContaining([expect.stringContaining('/sitemap.xml')])
        );
    });
});
