/**
 * Probe specialty PMHNP-adjacent job boards to see if any expose a
 * public RSS / JSON / HTML feed we can ingest. None are ATSes —
 * they're aggregator boards run by professional associations or
 * recruiter firms.
 *
 * Read-only. No DB.
 */

interface ProbeShape {
    label: string;
    url: string;
    method?: 'GET' | 'POST';
    body?: string;
    headers?: Record<string, string>;
}

const PROBES: ReadonlyArray<ProbeShape> = [
    // APNA — American Psychiatric Nurses Association
    // Typically powered by Naylor / YourMembership / etc.
    { label: 'APNA careercenter root', url: 'https://careercenter.apna.org/' },
    { label: 'APNA careercenter jobs', url: 'https://careercenter.apna.org/jobs/' },
    { label: 'APNA careercenter RSS', url: 'https://careercenter.apna.org/rss/jobs.xml' },
    { label: 'APNA jobs.rss', url: 'https://careercenter.apna.org/jobs.rss' },
    { label: 'APNA jobboard root', url: 'https://www.apna.org/career-center/' },

    // AANP — American Association of Nurse Practitioners
    { label: 'AANP jobcenter root', url: 'https://jobcenter.aanp.org/' },
    { label: 'AANP careercenter root', url: 'https://careercenter.aanp.org/' },
    { label: 'AANP career-center jobs', url: 'https://www.aanp.org/career-center/jobs' },
    { label: 'AANP careerlink.aanp.org', url: 'https://careerlink.aanp.org/' },

    // PracticeLink — large healthcare recruiter
    { label: 'PracticeLink behavioral search', url: 'https://www.practicelink.com/jobs/search/?specialty=Psychiatry+-+Adult&prac=phys' },
    { label: 'PracticeLink NP behavioral', url: 'https://www.practicelink.com/jobs/Advanced-Practice/Behavioral-Health-Psychiatry/' },
    { label: 'PracticeLink jobs.rss', url: 'https://www.practicelink.com/jobs.rss' },
    { label: 'PracticeLink API jobs', url: 'https://www.practicelink.com/api/jobs/search?specialty=psychiatric-mental-health-np' },

    // Health eCareers
    { label: 'Health eCareers PMHNP search', url: 'https://www.healthecareers.com/jobs?keyword=PMHNP' },
    { label: 'Health eCareers RSS', url: 'https://www.healthecareers.com/jobs/rss?keyword=PMHNP' },

    // DocCafe
    { label: 'DocCafe PMHNP search', url: 'https://www.doccafe.com/jobs/psychiatric-nurse-practitioner' },
    { label: 'DocCafe RSS', url: 'https://www.doccafe.com/jobs/rss?q=PMHNP' },

    // NursingJobs.com
    { label: 'NursingJobs PMHNP', url: 'https://nursingjobs.com/jobs?q=PMHNP' },
];

async function probe(p: ProbeShape): Promise<{ status: number; ct: string; size: number; snippet: string; sig: { hasJobPosting: boolean; hasRss: boolean; hasJsonJobs: boolean; jobCount: number } }> {
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 12_000);
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml,application/json',
            ...(p.headers ?? {}),
        };
        const init: RequestInit = { signal: controller.signal, headers, redirect: 'follow' };
        if (p.method === 'POST' && p.body) {
            (init as RequestInit & { method?: string; body?: string }).method = 'POST';
            (init as RequestInit & { method?: string; body?: string }).body = p.body;
        }
        const res = await fetch(p.url, init);
        clearTimeout(t);
        const body = await res.text();
        const ct = res.headers.get('content-type') ?? '';
        const sig = {
            hasJobPosting: /"@type"\s*:\s*"JobPosting"/i.test(body),
            hasRss: body.startsWith('<?xml') && /<item[\s>]/.test(body),
            hasJsonJobs: /^\s*[\{\[]/.test(body) && /"jobs"\s*:|"results"\s*:|"data"\s*:/i.test(body),
            jobCount: 0,
        };
        if (sig.hasRss) {
            sig.jobCount = (body.match(/<item[\s>]/g) ?? []).length;
        } else if (sig.hasJobPosting) {
            sig.jobCount = (body.match(/"@type"\s*:\s*"JobPosting"/gi) ?? []).length;
        }
        return {
            status: res.status,
            ct,
            size: body.length,
            snippet: body.slice(0, 250).replace(/\s+/g, ' '),
            sig,
        };
    } catch (err) {
        return {
            status: 0,
            ct: '',
            size: 0,
            snippet: String(err).slice(0, 200),
            sig: { hasJobPosting: false, hasRss: false, hasJsonJobs: false, jobCount: 0 },
        };
    }
}

async function main(): Promise<void> {
    console.log(`Probing ${PROBES.length} specialty boards...\n`);
    for (const p of PROBES) {
        const r = await probe(p);
        const mark = r.status === 200 && (r.sig.hasJobPosting || r.sig.hasRss || r.sig.hasJsonJobs)
            ? '★'
            : r.status === 200
                ? '·'
                : ' ';
        console.log(`${mark} ${p.label}`);
        console.log(`     HTTP ${r.status}   ct=${r.ct.slice(0, 30)}   size=${r.size}`);
        console.log(`     signals: jobposting=${r.sig.hasJobPosting} rss=${r.sig.hasRss} json=${r.sig.hasJsonJobs} count=${r.sig.jobCount}`);
        if (r.status !== 200 || !(r.sig.hasJobPosting || r.sig.hasRss || r.sig.hasJsonJobs)) {
            console.log(`     snippet: ${r.snippet.slice(0, 180)}`);
        }
        console.log();
        await new Promise((resolve) => setTimeout(resolve, 400));
    }
}

main().catch((err) => {
    console.error('Probe crashed:', err);
    process.exit(1);
});
