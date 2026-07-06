/**
 * DocCafe RSS adapter.
 *
 * Endpoint: https://www.doccafe.com/jobs/rss?q={query}
 * Public, unauthenticated. Returns a standard RSS 2.0 feed with up to
 * ~30 items per query, each carrying title, description, link, guid,
 * and pubDate.
 *
 * Heads-up: DocCafe's `?q=` filter is loose — many returned items are
 * physician/non-PMHNP. The orchestrator's relevance gate handles that;
 * this adapter just normalizes the RSS shape into the canonical
 * RawJobData. Net yield ~30-60 PMHNP/month after dedup, mostly from
 * small private practices that post on DocCafe but don't use ATSes.
 *
 * Why this adapter:
 *   - DocCafe is one of the few healthcare-specific aggregators with
 *     a working unauthenticated RSS endpoint.
 *   - Description ships INSIDE the RSS item — no per-job detail fetch.
 *   - Single GET per query keeps wall time minimal.
 *
 * Why no detail-page fetch:
 *   - RSS description blob is substantive enough (~200 chars) to pass
 *     the completeness floor in most cases.
 *   - Adding a per-job detail fetch would 30× the wall time for
 *     marginal description-quality gain.
 */

import type { Aggregator, RawJobData } from './types';
import { checkJobHealth, type HealthDecision } from '@/lib/health/check-job-health';
import { htmlToReadableText } from '@/lib/sanitize';
import { DOCCAFE_SEARCH_QUERIES as QUERIES } from './search-terms/doccafe';

const TIME_BUDGET_MS = 90_000; // Well under the 240s envelope; RSS is fast.
const QUERY_GAP_MS = 600;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Minimal RSS 2.0 <item> parser. We intentionally don't pull in a
 * full XML library — the DocCafe feed is well-formed and the field
 * set we care about is tiny.
 */
interface RssItem {
    title: string;
    description: string;
    link: string;
    guid: string;
    pubDate: string;
}

function unwrapCdata(s: string): string {
    return s.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
}

function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function pickTag(itemXml: string, tag: string): string {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = re.exec(itemXml);
    if (!m) return '';
    return decodeEntities(unwrapCdata(m[1])).trim();
}

function parseRssItems(xml: string): RssItem[] {
    const items: RssItem[] = [];
    const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null) {
        const block = m[1];
        items.push({
            title: pickTag(block, 'title'),
            description: pickTag(block, 'description'),
            link: pickTag(block, 'link'),
            guid: pickTag(block, 'guid'),
            pubDate: pickTag(block, 'pubDate'),
        });
    }
    return items;
}

/**
 * Strip HTML tags from RSS description while preserving structure.
 * DocCafe descriptions are usually plain prose but occasionally
 * include <br/> or basic formatting tags — htmlToReadableText keeps
 * those breaks so the JD page renders multi-paragraph layouts.
 */
function cleanDescription(raw: string): string {
    return htmlToReadableText(raw);
}

/**
 * DocCafe job links include the specialty and location in the URL
 * path. Use them as a location hint when present.
 *
 * Example:
 *   https://www.doccafe.com/job/np/psychiatric-mental-health/123/title-here
 */
function locationFromTitle(title: string): string {
    // Many DocCafe titles end with " - {City}, {ST}" or "in {City}, {ST}"
    const m = /(?:\bin\s+|-\s+)([A-Z][A-Za-z .']+,\s*[A-Z]{2})\b/.exec(title);
    return m ? m[1] : 'United States';
}

export async function fetchDocCafeJobs(): Promise<RawJobData[]> {
    const startTime = Date.now();
    const out: RawJobData[] = [];
    const seenGuid = new Set<string>();

    console.log(`[DocCafe] Starting RSS fetch with ${QUERIES.length} keyword variants...`);

    for (const q of QUERIES) {
        if (Date.now() - startTime > TIME_BUDGET_MS) {
            console.warn(`[DocCafe] Time budget exhausted after ${QUERIES.length} queries`);
            break;
        }
        const url = `https://www.doccafe.com/jobs/rss?q=${encodeURIComponent(q)}`;
        try {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 12_000);
            const res = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 PMHNP-Hiring-Aggregator',
                    Accept: 'application/rss+xml, application/xml, text/xml',
                },
            });
            clearTimeout(t);
            if (!res.ok) {
                console.warn(`[DocCafe] HTTP ${res.status} for query "${q}"`);
                continue;
            }
            const xml = await res.text();
            const items = parseRssItems(xml);

            for (const it of items) {
                if (!it.guid || seenGuid.has(it.guid)) continue;
                seenGuid.add(it.guid);
                if (!it.title || !it.link) continue;

                out.push({
                    externalId: `doccafe-${it.guid.split('/').pop() || it.guid}`,
                    title: it.title,
                    company: 'DocCafe Listing',
                    // Employer is rarely in the RSS feed — orchestrator's
                    // LLM-rescue + lead-mining will surface it from the
                    // description when present.
                    employer: 'Company Not Listed',
                    location: locationFromTitle(it.title),
                    description: cleanDescription(it.description),
                    applyLink: it.link,
                    postedDate: it.pubDate,
                    postedAt: it.pubDate,
                    sourceProvider: 'doccafe',
                    sourceSite: 'doccafe',
                } as RawJobData);
            }
            console.log(`[DocCafe] "${q}": ${items.length} items, ${out.length} unique so far`);
        } catch (err) {
            console.warn(`[DocCafe] Error fetching query "${q}":`, err);
        }
        await sleep(QUERY_GAP_MS);
    }

    console.log(`[DocCafe] Total: ${out.length} unique RSS items`);
    return out;
}

export const docCafeAggregator: Aggregator = {
    key: 'doccafe',
    chunkCount: 1,
    async fetch(): Promise<RawJobData[]> {
        return fetchDocCafeJobs();
    },
    async probeJob(externalId: string, applyLink: string): Promise<HealthDecision | null> {
        return checkJobHealth(applyLink, 'doccafe', { externalId });
    },
};
