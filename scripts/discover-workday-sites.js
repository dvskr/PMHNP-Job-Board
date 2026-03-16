/**
 * Probe remaining Workday companies with expanded site name guesses
 */
const UNDISCOVERED = [
    { slug: 'geodehealth', instance: 1 },
    { slug: 'saintlukes', instance: 1 },
    { slug: 'brightli', instance: 5 },
    { slug: 'canopygrowth', instance: 3 },
    { slug: 'communicarehealth', instance: 1 },
    { slug: 'seamar', instance: 12 },
];

const EXPANDED_SITES = [
    'External', 'Careers', 'careers', 'external', 'jobs', 'External_Career_Site',
    'ExternalCareers', 'External_Careers', 'Job_Posting', 'JobPosting',
    // Slug-based
];

async function probe(slug, instance, site) {
    const url = `https://${slug}.wd${instance}.myworkdayjobs.com/wday/cxs/${slug}/${site}/jobs`;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0 }),
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (resp.ok) {
            const data = await resp.json();
            if (data.total > 0) return { site, total: data.total };
        }
        return null;
    } catch { return null; }
}

(async () => {
    for (const c of UNDISCOVERED) {
        // Try expanded list
        const allSites = [
            ...EXPANDED_SITES,
            c.slug, c.slug + 'careers', c.slug + '_careers', c.slug + '_jobs',
            c.slug + 'jobs', c.slug + 'external', c.slug + '_external',
            // Extra patterns found in existing companies
            'Geode_Health', 'GeodeHealth', 'geode', 'geodehealth',
            'Saint_Lukes', 'SaintLukes', 'SCS', 'SLHS',
            'Brightli', 'BrightliCareers',
            'Canopy', 'CanopyGrowth',
            'CommuniCare', 'communicare', 'CommuniCare_Health',
            'SeaMar', 'sea_mar', 'SEAMAR',
        ];

        let found = false;
        for (const site of allSites) {
            const result = await probe(c.slug, c.instance, site);
            if (result) {
                console.log('✅ ' + c.slug + '.wd' + c.instance + ' → site: \'' + result.site + '\' (' + result.total + ' jobs)');
                found = true;
                break;
            }
        }
        if (!found) {
            console.log('❌ ' + c.slug + '.wd' + c.instance + ' → still not found');
        }
    }
})();
