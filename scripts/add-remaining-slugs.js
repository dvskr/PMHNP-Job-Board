// Script to add remaining live slugs to aggregator files
const fs = require('fs');
const path = require('path');
const d = require('./ats-test-results.json');
const root = path.join(__dirname, '..');

const live = d.results.filter(r => r.status === 'live');

// --- ASHBY ---
const abFile = fs.readFileSync(path.join(root, 'lib/aggregators/ashby.ts'), 'utf-8');
const abMatch = abFile.match(/slug:\s*"([^"]+)"/g);
const abExisting = new Set(abMatch.map(s => s.match(/"([^"]+)"/)[1]));
const abLive = live.filter(r => r.platform === 'Ashby').map(r => r.slug);
const abNew = abLive.filter(s => !abExisting.has(s)).sort();
console.log(`Ashby: ${abExisting.size} existing, ${abNew.length} new`);

if (abNew.length > 0) {
    const insertPoint = abFile.indexOf('];', abFile.indexOf('ASHBY_COMPANIES'));
    const before = abFile.slice(0, insertPoint);
    const after = abFile.slice(insertPoint);
    const lines = abNew.map(s => {
        const name = s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
        return `    { slug: "${s}", name: "${name}" },`;
    }).join('\n');
    const addition = '\n    // === ADDED 2026-02-16 — All live healthcare slugs from CSV ===\n' + lines + '\n';
    fs.writeFileSync(path.join(root, 'lib/aggregators/ashby.ts'), before + addition + after, 'utf-8');
    console.log(`Inserted ${abNew.length} new Ashby slugs`);
}

// --- BAMBOOHR ---
const bbFile = fs.readFileSync(path.join(root, 'lib/aggregators/bamboohr.ts'), 'utf-8');
const bbMatch = bbFile.match(/slug:\s*'([^']+)'/g);
const bbExisting = new Set(bbMatch.map(s => s.match(/'([^']+)'/)[1]));
const bbLive = live.filter(r => r.platform === 'Bamboohr').map(r => r.slug);
const bbNew = bbLive.filter(s => !bbExisting.has(s)).sort();
console.log(`BambooHR: ${bbExisting.size} existing, ${bbNew.length} new`);

if (bbNew.length > 0) {
    const insertPoint = bbFile.indexOf('];', bbFile.indexOf('BAMBOOHR_COMPANIES'));
    const before = bbFile.slice(0, insertPoint);
    const after = bbFile.slice(insertPoint);
    const lines = bbNew.map(s => {
        const name = s.split(/[-_]/).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
        return `    { slug: '${s}', name: '${name}' },`;
    }).join('\n');
    const addition = '\n    // === ADDED 2026-02-16 — All live healthcare slugs from CSV ===\n' + lines + '\n';
    fs.writeFileSync(path.join(root, 'lib/aggregators/bamboohr.ts'), before + addition + after, 'utf-8');
    console.log(`Inserted ${bbNew.length} new BambooHR slugs`);
}

// --- WORKDAY ---
const wdFile = fs.readFileSync(path.join(root, 'lib/aggregators/workday.ts'), 'utf-8');
const wdMatch = wdFile.match(/slug:\s*'([^']+)'/g);
const wdExisting = new Set(wdMatch.map(s => s.match(/'([^']+)'/)[1]));
const wdLive = live.filter(r => r.platform === 'Workday');
const wdUniq = new Map();
wdLive.forEach(r => {
    const base = r.slug.split('|')[0];
    if (!wdUniq.has(base)) wdUniq.set(base, r);
});
const wdNew = [...wdUniq.entries()].filter(([k]) => !wdExisting.has(k));
console.log(`Workday: ${wdExisting.size} existing, ${wdNew.length} new`);

if (wdNew.length > 0) {
    const insertPoint = wdFile.indexOf('];', wdFile.indexOf('WORKDAY_COMPANIES'));
    const before = wdFile.slice(0, insertPoint);
    const after = wdFile.slice(insertPoint);
    const lines = wdNew.map(([base, r]) => {
        const parts = r.slug.split('|');
        let instance = 1, site = 'External';
        if (parts.length === 3) {
            instance = parseInt(parts[1].replace('wd', ''));
            site = parts[2];
        }
        const name = base.split(/[-_]/).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
        return `    { slug: '${base}', instance: ${instance}, site: '${site}', name: '${name}' },`;
    }).join('\n');
    const addition = '\n    // === ADDED 2026-02-16 — All live healthcare slugs from CSV ===\n' + lines + '\n';
    fs.writeFileSync(path.join(root, 'lib/aggregators/workday.ts'), before + addition + after, 'utf-8');
    console.log(`Inserted ${wdNew.length} new Workday slugs`);
}

console.log('\nDone! All live slugs added.');
