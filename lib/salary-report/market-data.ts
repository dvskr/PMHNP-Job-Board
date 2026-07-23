import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { STATE_PRACTICE_AUTHORITY } from '@/lib/state-practice-authority';
import { cleanSalaryRows, summarizeMidpoints, TIER_MEDIAN_MIN_N } from './stats';

/**
 * Advertised-pay market data for the candidate tools (offer analyzer,
 * salary converter context line). One DB scan per render, deduped via
 * cache(); pages consuming this run under ISR so this is at most a few
 * queries per revalidate window.
 *
 * Midpoints are rounded to $1k before shipping to the client — enough
 * resolution for percentile math, small enough to keep the payload lean,
 * and it avoids implying single-dollar precision the source data doesn't
 * have.
 */
export interface OfferMarketData {
  /** Ascending advertised midpoints ($/yr, $1k-rounded), all clean rows. */
  national: number[];
  /** Remote-only segment (isRemote, not hybrid). */
  remote: number[];
  /** state name → ascending midpoints; only states with n >= 5 are included. */
  states: Record<string, number[]>;
  /** Rows dropped by the quarantine gates, for methodology disclosure. */
  quarantined: number;
}

// A state segment must at least clear the median tier to be useful.
const MIN_STATE_N = TIER_MEDIAN_MIN_N;

// Canonical 50-states+DC whitelist — location-parser noise (e.g. metro names
// or non-US values in job.state) must never become a client-facing segment
// whose /jobs/state/{slug} links would 404.
const VALID_STATE_NAMES = new Set(Object.keys(STATE_PRACTICE_AUTHORITY));

const roundK = (v: number) => Math.round(v / 1000) * 1000;

export const getOfferMarketData = cache(async function getOfferMarketData(): Promise<OfferMarketData> {
  const rows = await prisma.job.findMany({
    where: {
      isPublished: true,
      normalizedMinSalary: { not: null },
      normalizedMaxSalary: { not: null },
      salaryIsEstimated: false,
    },
    select: {
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
      salaryIsEstimated: true,
      state: true,
      isRemote: true,
      isHybrid: true,
    },
  });

  const national = cleanSalaryRows(rows);

  const remoteRows = rows.filter((r) => r.isRemote && !r.isHybrid);
  const remote = cleanSalaryRows(remoteRows);

  const byState = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.state || !VALID_STATE_NAMES.has(r.state)) continue;
    const bucket = byState.get(r.state);
    if (bucket) bucket.push(r);
    else byState.set(r.state, [r]);
  }

  const states: Record<string, number[]> = {};
  for (const [state, stateRows] of byState) {
    const { midpoints } = cleanSalaryRows(stateRows);
    if (midpoints.length >= MIN_STATE_N) {
      states[state] = midpoints.map(roundK);
    }
  }

  return {
    national: national.midpoints.map(roundK),
    remote: remote.midpoints.map(roundK),
    states,
    quarantined: national.quarantined,
  };
});

/**
 * Per-state tier summaries for the salary-guide hub (table + explorer).
 * Derived from the same cached market data, so the hub, the state pages,
 * and the offer analyzer can never disagree. States below the median tier
 * (n < 5) are not included.
 */
export interface HubStateSummary {
  state: string;
  n: number;
  median: number;
  /** null when the state only clears the median tier (5 to 9 rows). */
  p25: number | null;
  p75: number | null;
}

export const getHubStateSummaries = cache(async function getHubStateSummaries(): Promise<HubStateSummary[]> {
  const market = await getOfferMarketData();
  const out: HubStateSummary[] = [];
  for (const [state, midpoints] of Object.entries(market.states)) {
    const s = summarizeMidpoints(midpoints);
    if (s.tier === 'full') {
      out.push({ state, n: s.n, median: s.median, p25: s.p25, p75: s.p75 });
    } else if (s.tier === 'median') {
      out.push({ state, n: s.n, median: s.median, p25: null, p75: null });
    }
  }
  return out.sort((a, b) => b.median - a.median);
});

/**
 * National advertised-pay medians by practice setting, matched on
 * title/jobType keywords. Each setting must clear the median tier on its
 * own; below n=5 it is silently dropped, never estimated.
 */
const HUB_SETTINGS = ['Telehealth', 'Remote', 'Outpatient', 'Inpatient', 'Community'] as const;

export interface SettingMedian {
  setting: string;
  median: number;
  n: number;
}

export const getNationalSettingMedians = cache(async function getNationalSettingMedians(): Promise<SettingMedian[]> {
  const rows = await prisma.job.findMany({
    where: {
      isPublished: true,
      normalizedMinSalary: { not: null },
      normalizedMaxSalary: { not: null },
      salaryIsEstimated: false,
    },
    select: {
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
      salaryIsEstimated: true,
      title: true,
      jobType: true,
    },
  });

  const out: SettingMedian[] = [];
  for (const setting of HUB_SETTINGS) {
    const needle = setting.toLowerCase();
    const settingRows = rows.filter(
      (r) => r.title.toLowerCase().includes(needle) || (r.jobType || '').toLowerCase().includes(needle)
    );
    const s = summarizeMidpoints(cleanSalaryRows(settingRows).midpoints);
    if (s.tier === 'full' || s.tier === 'median') {
      out.push({ setting, median: s.median, n: s.n });
    }
  }
  return out.sort((a, b) => b.median - a.median);
});
