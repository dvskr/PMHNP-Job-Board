/**
 * Verify which public API endpoints actually exist for Workable, JazzHR,
 * and BambooHR before committing to adapter builds. Probes one known
 * tenant per ATS (surfaced from prod DB discovery) and reports auth
 * shape + response structure.
 *
 * Read-only. No DB.
 */

interface ProbeResult {
    ats: string;
    url: string;
    status: number;
    snippet: string;
    jobCount: number | null;
}

async function probe(ats: string, url: string, headers: HeadersInit = {}): Promise<ProbeResult> {
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(t);
        const text = await res.text();
        let jobCount: number | null = null;
        try {
            const json = JSON.parse(text);
            if (Array.isArray(json)) jobCount = json.length;
            else if (Array.isArray(json.jobs)) jobCount = json.jobs.length;
            else if (Array.isArray(json.results)) jobCount = json.results.length;
            else if (Array.isArray(json.data)) jobCount = json.data.length;
        } catch {
            // not JSON
        }
        return {
            ats,
            url,
            status: res.status,
            snippet: text.slice(0, 250).replace(/\s+/g, ' '),
            jobCount,
        };
    } catch (err) {
        return { ats, url, status: 0, snippet: String(err).slice(0, 200), jobCount: null };
    }
}

async function main(): Promise<void> {
    const probes: Array<{ label: string; url: string; headers?: HeadersInit }> = [
        // Workable — try www.workable.com pattern and the canonical "jobs" slug
        { label: 'workable: workable.com/api/accounts/atria-health/jobs', url: 'https://www.workable.com/api/accounts/atria-health/jobs' },
        { label: 'workable: workable.com/api/v1/accounts/atria-health/jobs', url: 'https://www.workable.com/api/v1/accounts/atria-health/jobs' },
        { label: 'workable: apply.workable.com/atria-health (HTML)', url: 'https://apply.workable.com/atria-health/' },
        { label: 'workable: api/v1/widget/accounts/atria-health', url: 'https://www.workable.com/api/v1/widget/accounts/atria-health' },
        { label: 'workable: apply.workable.com/api/v1/widget/accounts/atria-health/jobs', url: 'https://apply.workable.com/api/v1/widget/accounts/atria-health/jobs' },
        // JazzHR — try sitemap-style endpoints + JSON-LD
        { label: 'jazzhr: mastercenter/jobs.json', url: 'https://mastercenterforaddictionmedicine.applytojob.com/jobs.json' },
        { label: 'jazzhr: mastercenter/sitemap.xml', url: 'https://mastercenterforaddictionmedicine.applytojob.com/sitemap.xml' },
        { label: 'jazzhr: mastercenter/jobs/list', url: 'https://mastercenterforaddictionmedicine.applytojob.com/jobs/list' },
    ];

    console.log(`Probing ${probes.length} candidate ATS endpoints...\n`);
    for (const p of probes) {
        const r = await probe(p.label.split(':')[0], p.url, p.headers);
        const mark = r.status === 200 ? '★' : r.status >= 400 ? ' ' : '·';
        console.log(`${mark} ${p.label}`);
        console.log(`     HTTP ${r.status}   jobs=${r.jobCount ?? '?'}`);
        console.log(`     snippet: ${r.snippet.slice(0, 200)}`);
        console.log();
        await new Promise((r) => setTimeout(r, 300));
    }
}

main().catch((err) => {
    console.error('Probe crashed:', err);
    process.exit(1);
});
