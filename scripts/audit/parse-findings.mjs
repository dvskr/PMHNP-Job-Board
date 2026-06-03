// Parse the code-audit workflow result into a compact, severity-sorted digest.
// The Workflow tool writes its result to a task .output file ( {summary,result} );
// pass that path (or a file containing the bare JSON array) as argv[2].
//
//   node scripts/audit/parse-findings.mjs <workflow-output.json> [out.md]
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const src = process.argv[2];
const outPath = process.argv[3] || 'tmp/audit/digest.md';
if (!src) { console.error('usage: parse-findings.mjs <workflow-output.json> [out.md]'); process.exit(1); }

let raw = readFileSync(src, 'utf8').trim();
let top; try { top = JSON.parse(raw); } catch { top = JSON.parse(raw.slice(raw.indexOf('{'))); }
let data = Array.isArray(top) ? top : top.result;
if (typeof data === 'string') data = JSON.parse(data.slice(data.indexOf('[')));

const ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, refuted: 0 };
const lines = [];
for (const dim of data) {
  const vmap = Object.fromEntries((dim.verdicts || []).map(v => [v.id, v]));
  lines.push(`\n## ${dim.dimension}\n${dim.summary || ''}`);
  for (const f of (dim.findings || []).slice().sort((a, b) => ORDER[a.severity] - ORDER[b.severity])) {
    const v = vmap[f.id]; const verdict = v?.verdict || 'no-verdict'; const sev = v?.severity || f.severity;
    if (verdict === 'refuted') { counts.refuted++; lines.push(`  - [REFUTED] (${f.severity}) ${f.title} :: ${v.note || ''}`); continue; }
    counts[sev] = (counts[sev] || 0) + 1;
    lines.push(`  - [${sev}] (${verdict}, conf ${f.confidence}) ${f.title}\n      files: ${(f.files || []).join(' | ')}\n      impact: ${(f.impact || '').slice(0, 440)}\n      fix: ${(f.recommendation || '').slice(0, 300)}${v?.note ? '\n      verifier: ' + v.note.slice(0, 300) : ''}`);
  }
}
mkdirSync('tmp/audit', { recursive: true });
writeFileSync(outPath, lines.join('\n'));
console.log('COUNTS', JSON.stringify(counts));
console.log('wrote', outPath, '— dimensions:', data.length);
