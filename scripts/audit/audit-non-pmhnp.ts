/**
 * READ-ONLY audit: find non-PMHNP jobs in the LIVE "active" set.
 *
 * "Active" = exactly what candidates see on /jobs: isPublished=true AND the
 * same GLOBAL_EXCLUSIONS the site applies (via buildWhereClause(DEFAULT_FILTERS)).
 * So pure-physician/psychiatrist rows already excluded by the live query are
 * NOT counted here — this surfaces what STILL slips through.
 *
 * A PMHNP-board posting should be a PSYCHIATRIC / mental-health ADVANCED-PRACTICE
 * role (NP or — by current policy — a psych PA/APP). We flag:
 *   • NON_PSYCH_APP    — an NP/PA role with NO psychiatric/mental-health signal
 *                        anywhere (title or description) → wrong specialty
 *                        (Family NP, Peds primary care, ER, derm, etc.)
 *   • PSYCH_NON_APP    — psychiatric but NOT advanced practice (RN, LPN, MA,
 *                        social worker, therapist, counselor, psychologist,
 *                        case manager, tech) → not a PMHNP role
 *   • OTHER            — neither psych nor an NP/PA (non-clinical, other-
 *                        specialty RN, etc.)
 *   • AMBIGUOUS        — psych signal but no clear NP/PA and no clear non-NP
 *                        role token → eyeball it
 *
 * Read-only: no writes. Run: npx tsx scripts/audit/audit-non-pmhnp.ts
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
// prisma/filters are imported dynamically inside main() AFTER dotenv has run —
// a static import is hoisted above the dotenv call and trips
// lib/prisma's "DATABASE_URL must be set" guard at load time.

// ── Signal detection ──────────────────────────────────────────────────────
// Psychiatric / mental-health signal (generous, so we DON'T mis-flag a real
// psych job as non-psych). Substring, case-insensitive.
const PSYCH_TERMS = [
  'psych', 'mental health', 'behavioral health', 'behavioral', 'pmhnp', 'pmh-np',
  'telepsych', 'psychotherap', 'addiction', 'substance use', 'substance abuse',
  'suboxone', 'buprenorphine', 'bipolar', 'schizophren', 'depression', 'anxiety',
  'adhd', 'ptsd', 'mood disorder', 'mental illness', 'dual diagnosis',
  'medication-assisted', 'medication assisted', 'mat program', 'detox', 'opioid',
  'co-occurring', 'smi', 'eating disorder', 'crisis', 'esketamine', 'ketamine',
];

// Advanced-practice provider tokens (NP or PA). Word-boundary for abbreviations.
const APP_REGEX = new RegExp(
  [
    'nurse practitioner', 'pmhnp', 'pmh-np', '\\baprn\\b', '\\barnp\\b', '\\bcrnp\\b',
    '\\bnp\\b', '\\bdnp\\b', 'advanced practice', 'physician assistant', '\\bpa-c\\b',
    'psych np', 'psychiatric np', 'mental health np', '\\bapp\\b', '\\bapn\\b',
  ].join('|'),
  'i',
);

// Non-advanced-practice clinical / non-clinical role tokens (these are NOT PMHNPs
// even when psych). Word-boundary where an abbreviation could collide.
const NON_APP_ROLE = new RegExp(
  [
    'registered nurse', '\\brn\\b', '\\blpn\\b', '\\blvn\\b', '\\bcna\\b',
    'certified nursing assistant', 'medical assistant', '\\bma\\b',
    'social worker', '\\blcsw\\b', '\\blmsw\\b', '\\blicsw\\b', '\\bmsw\\b', '\\bcsw\\b',
    'therapist', 'counselor', 'counsellor', 'psychologist', '\\blmft\\b', '\\blpc\\b',
    '\\blmhc\\b', 'case manager', 'care manager', 'peer specialist', 'peer support',
    'recovery coach', 'behavioral health tech', '\\bbht\\b', 'mental health tech',
    'paramedic', '\\bemt\\b', 'phlebotom', 'scribe', 'recruiter', 'receptionist',
    'billing', 'coder', 'medical records', 'office manager', 'practice manager',
    'front desk', 'patient access', 'intake coordinator', 'authorization',
    'pharmacist', 'pharmacy tech', 'dietitian', 'chaplain', 'housekeep',
  ].join('|'),
  'i',
);

// Physician tokens (should already be excluded by GLOBAL_EXCLUSIONS; flag if any leak).
const PHYSICIAN_REGEX = /psychiatrist|\bphysician\b|\bmd\b|\bdo\b|\bm\.d\b|\bd\.o\b/i;

// Other-specialty hints, for labeling NON_PSYCH_APP buckets.
const SPECIALTY_HINTS: Array<[string, RegExp]> = [
  ['Family / Primary care', /family (nurse|np|practice|medicine)|\bfnp\b|primary care|internal medicine|general practice/i],
  ['Pediatric (non-psych)', /pediatric|\bpeds\b|\bpnp\b|child health|neonatal|\bnicu\b/i],
  ['Adult-Gero / Acute care', /gerontolog|\bagnp\b|\bagacnp\b|\bagpcnp\b|acute care|\bacnp\b|hospitalist|intensivist|\bicu\b/i],
  ["Women's health / OB", /women.?s health|\bwhnp\b|\bob\/?gyn\b|obstetric|gynecolog|midwife|\bcnm\b/i],
  ['Emergency / Urgent care', /emergency|\ber\b|urgent care|trauma/i],
  ['Dermatology / Aesthetic', /dermatolog|aesthetic|cosmetic|med spa|medspa|botox/i],
  ['Surgery / Ortho / Pain', /surg|orthopedic|\bortho\b|pain management|spine|anesthesi/i],
  ['Cardiology / Vascular', /cardiolog|cardiac|vascular|electrophysiolog/i],
  ['Oncology / Hematology', /oncolog|hematolog|cancer|infusion/i],
  ['Nephrology / Dialysis', /nephrolog|dialysis|\besrd\b|renal/i],
  ['GI / Endo / Pulm / Neuro', /gastroenter|\bgi\b|endocrinolog|diabetes|pulmonary|\bcopd\b|neurolog|sleep medicine/i],
  ['Wound / Palliative / Hospice', /wound care|palliative|hospice|home health|\bsnf\b|skilled nursing/i],
  ['Allergy / ENT / Ophtho / Uro', /allerg|\bent\b|otolaryng|ophthalmolog|optometr|urolog|\bgu\b/i],
  ['Occupational / Aesthetics / Other', /occupational health|weight (loss|management)|hormone|\btrt\b|functional medicine|concierge|telehealth general/i],
];

const has = (hay: string, needles: string[]) => needles.some((n) => hay.includes(n));

type Bucket = 'NON_PSYCH_APP' | 'PSYCH_NON_APP' | 'OTHER' | 'AMBIGUOUS' | 'PHYSICIAN_LEAK';

interface Row {
  id: string;
  slug: string | null;
  title: string;
  employer: string;
  sourceType: string | null;
  city: string | null;
  state: string | null;
}

function classify(title: string, blob: string): { bucket: Bucket | 'PMHNP_OK'; label: string } {
  const t = title.toLowerCase();
  const b = blob.toLowerCase();
  const hasPsych = has(b, PSYCH_TERMS);
  const isApp = APP_REGEX.test(title);
  const isNonAppRole = NON_APP_ROLE.test(title);
  const isPhysician = PHYSICIAN_REGEX.test(title) && !isApp; // psychiatrist+NP combos are fine

  const specialty = SPECIALTY_HINTS.find(([, re]) => re.test(title) || re.test(b))?.[0];

  if (isPhysician && !isApp) return { bucket: 'PHYSICIAN_LEAK', label: specialty ?? 'physician/MD/DO/psychiatrist' };
  if (hasPsych && isApp) return { bucket: 'PMHNP_OK', label: 'psych NP/PA' };
  if (!hasPsych && isApp) return { bucket: 'NON_PSYCH_APP', label: specialty ?? 'NP/PA, no psych signal' };
  if (hasPsych && !isApp && isNonAppRole) return { bucket: 'PSYCH_NON_APP', label: 'psych but RN/SW/therapist/tech' };
  if (!hasPsych && !isApp) return { bucket: 'OTHER', label: specialty ?? (isNonAppRole ? 'non-APP clinical/role' : 'no psych + no NP/PA') };
  void t;
  return { bucket: 'AMBIGUOUS', label: 'psych, no clear NP/PA token' };
}

async function main() {
  const { prisma } = await import('@/lib/prisma');
  const { buildWhereClause } = await import('@/lib/filters');
  const { DEFAULT_FILTERS } = await import('@/types/filters');
  const { classifyRelevance } = await import('@/lib/utils/job-filter');
  console.log(`[audit-non-pmhnp] DB=${(process.env.DATABASE_URL || '').replace(/:[^:@/]+@/, ':***@').slice(0, 60)}...`);

  const liveWhere = buildWhereClause(DEFAULT_FILTERS); // isPublished + GLOBAL_EXCLUSIONS
  const [totalPublished, totalLive] = await Promise.all([
    prisma.job.count({ where: { isPublished: true } }),
    prisma.job.count({ where: liveWhere }),
  ]);

  const jobs = await prisma.job.findMany({
    where: liveWhere,
    select: {
      id: true, slug: true, title: true, employer: true, sourceType: true,
      city: true, state: true, descriptionSummary: true, description: true, setting: true, population: true,
    },
  });

  const buckets: Record<Bucket | 'PMHNP_OK', Row[]> = {
    PMHNP_OK: [], NON_PSYCH_APP: [], PSYCH_NON_APP: [], OTHER: [], AMBIGUOUS: [], PHYSICIAN_LEAK: [],
  };
  const labelCounts: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  // Gate verification: would the (now-tightened) ingest classifyRelevance
  // reject this live row? Cross-tab vs the heuristic buckets so we can see
  // recall (flagged caught) vs false-positives (PMHNP_OK wrongly rejected).
  const gateRejectByBucket: Record<string, number> = {};
  const gateRejectReason: Record<string, number> = {};
  const gateFalsePositives: Row[] = [];

  for (const j of jobs) {
    const blob = [j.title, j.descriptionSummary ?? '', j.setting ?? '', j.population ?? ''].join(' \n ');
    const { bucket, label } = classify(j.title, blob);
    const row: Row = { id: j.id, slug: j.slug, title: j.title, employer: j.employer, sourceType: j.sourceType, city: j.city, state: j.state };
    buckets[bucket].push(row);
    if (bucket !== 'PMHNP_OK') {
      labelCounts[`${bucket} · ${label}`] = (labelCounts[`${bucket} · ${label}`] ?? 0) + 1;
      bySource[j.sourceType ?? 'unknown'] = (bySource[j.sourceType ?? 'unknown'] ?? 0) + 1;
    }

    const gate = classifyRelevance(j.title, j.description ?? '', j.employer);
    if (!gate.passes) {
      gateRejectByBucket[bucket] = (gateRejectByBucket[bucket] ?? 0) + 1;
      gateRejectReason[gate.reason] = (gateRejectReason[gate.reason] ?? 0) + 1;
      if (bucket === 'PMHNP_OK') gateFalsePositives.push(row);
    }
  }

  const flagged = buckets.NON_PSYCH_APP.length + buckets.PSYCH_NON_APP.length + buckets.OTHER.length + buckets.PHYSICIAN_LEAK.length;

  console.log('\n══════════ SUMMARY ══════════');
  console.log(`published (raw):            ${totalPublished}`);
  console.log(`live "active" (post-excl):  ${totalLive}`);
  console.log(`  PMHNP_OK (psych NP/PA):   ${buckets.PMHNP_OK.length}`);
  console.log(`  AMBIGUOUS (manual):       ${buckets.AMBIGUOUS.length}`);
  console.log(`  FLAGGED non-PMHNP:        ${flagged}  (${((flagged / Math.max(1, totalLive)) * 100).toFixed(1)}%)`);
  console.log(`    NON_PSYCH_APP:          ${buckets.NON_PSYCH_APP.length}`);
  console.log(`    PSYCH_NON_APP:          ${buckets.PSYCH_NON_APP.length}`);
  console.log(`    OTHER:                  ${buckets.OTHER.length}`);
  console.log(`    PHYSICIAN_LEAK:         ${buckets.PHYSICIAN_LEAK.length}`);

  console.log('\n── flagged by sub-label (desc) ──');
  for (const [k, v] of Object.entries(labelCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);

  console.log('\n── flagged by source ──');
  for (const [k, v] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);

  // Top employers among the confidently-flagged buckets (most actionable cut).
  const flaggedRows = [...buckets.NON_PSYCH_APP, ...buckets.PSYCH_NON_APP, ...buckets.OTHER, ...buckets.PHYSICIAN_LEAK];
  const byEmployer: Record<string, number> = {};
  for (const r of flaggedRows) byEmployer[r.employer] = (byEmployer[r.employer] ?? 0) + 1;
  console.log('\n── flagged by employer (top 20) ──');
  for (const [k, v] of Object.entries(byEmployer).sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(v).padStart(4)}  ${k}`);

  // ── Ingest-gate verification (tightened classifyRelevance over live rows) ──
  console.log('\n══════════ GATE VERIFICATION (new classifyRelevance) ══════════');
  console.log('would-reject by bucket (recall on flagged, false-pos on PMHNP_OK):');
  for (const bk of ['PMHNP_OK', 'NON_PSYCH_APP', 'PSYCH_NON_APP', 'OTHER', 'PHYSICIAN_LEAK', 'AMBIGUOUS'] as const) {
    const rej = gateRejectByBucket[bk] ?? 0;
    console.log(`  ${bk.padEnd(16)} ${String(rej).padStart(4)} / ${buckets[bk].length} rejected`);
  }
  console.log('reject reasons:');
  for (const [k, v] of Object.entries(gateRejectReason).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
  console.log(`\nFALSE POSITIVES (PMHNP_OK the new gate would reject): ${gateFalsePositives.length}`);
  for (const r of gateFalsePositives.slice(0, 40)) {
    console.log(`  ✗ ${r.title}  ·  ${r.employer}  ·  /jobs/${r.slug ?? r.id}`);
  }
  if (gateFalsePositives.length > 40) console.log(`  … +${gateFalsePositives.length - 40} more`);

  // ── Query-time exclusion review: what did the new GLOBAL_EXCLUSIONS remove? ──
  // Anything isPublished but NOT in the live set = excluded by the new rules.
  // Flag excluded rows our heuristic still considers psych (PMHNP_OK/AMBIGUOUS)
  // as potential false positives of the off-specialty exclusion.
  const liveIds = new Set(jobs.map((j) => j.id));
  const published = await prisma.job.findMany({
    where: { isPublished: true },
    select: { id: true, slug: true, title: true, employer: true, descriptionSummary: true, setting: true, population: true },
  });
  const excludedPsych: Array<{ title: string; employer: string; bucket: string; slug: string | null; id: string }> = [];
  let excludedTotal = 0;
  for (const p of published) {
    if (liveIds.has(p.id)) continue;
    excludedTotal += 1;
    const blob = [p.title, p.descriptionSummary ?? '', p.setting ?? '', p.population ?? ''].join(' \n ');
    const { bucket } = classify(p.title, blob);
    if (bucket === 'PMHNP_OK' || bucket === 'AMBIGUOUS') {
      excludedPsych.push({ title: p.title, employer: p.employer, bucket, slug: p.slug, id: p.id });
    }
  }
  console.log(`\n══════════ QUERY-TIME EXCLUSION REVIEW ══════════`);
  console.log(`excluded by GLOBAL_EXCLUSIONS (published − live): ${excludedTotal}`);
  console.log(`  of those, heuristic-psych (potential FPs to review): ${excludedPsych.length}`);
  for (const r of excludedPsych.slice(0, 40)) {
    console.log(`  ? [${r.bucket}] ${r.title}  ·  ${r.employer}  ·  /jobs/${r.slug ?? r.id}`);
  }
  if (excludedPsych.length > 40) console.log(`  … +${excludedPsych.length - 40} more`);

  const SAMPLE = 25;
  for (const bucket of ['PHYSICIAN_LEAK', 'NON_PSYCH_APP', 'PSYCH_NON_APP', 'OTHER', 'AMBIGUOUS'] as const) {
    const rows = buckets[bucket];
    if (!rows.length) continue;
    console.log(`\n── ${bucket} (${rows.length}) — first ${Math.min(SAMPLE, rows.length)} ──`);
    for (const r of rows.slice(0, SAMPLE)) {
      const loc = [r.city, r.state].filter(Boolean).join(', ') || '—';
      console.log(`  • ${r.title}  ·  ${r.employer}  ·  [${r.sourceType ?? '?'}]  ·  ${loc}  ·  /jobs/${r.slug ?? r.id}`);
    }
    if (rows.length > SAMPLE) console.log(`  … +${rows.length - SAMPLE} more`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error('[audit-non-pmhnp] fatal', e); process.exit(1); });
