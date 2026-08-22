import React from 'react';
import { STATE_CODE_TO_NAME } from '@/lib/us-states';
import { canonicalSalaryPeriod, type SalaryPeriodKey } from '@/lib/utils';
import {
  deriveExperienceLabel,
  effectiveExperienceLabel,
  effectiveNewGradFriendly,
} from '@/lib/experience-label';

/* ──────────────────────────────────────────────
 *  RoleSnapshot
 *  Compact strip of hard eligibility facts rendered above the job
 *  description, so candidates get the constraints (license states,
 *  experience floor, schedule, pay basis) before the prose. Server
 *  renderable: no client hooks, so it never waits on hydration.
 * ────────────────────────────────────────────── */

/** Fields the snapshot reads. Structural subset of the Prisma Job row. */
export interface RoleSnapshotJob {
  title?: string | null;
  experienceLabel: string | null;
  minYearsExperience: number | null;
  maxYearsExperience: number | null;
  newGradFriendly: boolean;
  jobType: string | null;
  /** Every schedule offered; jobType stays the single primary facet. */
  jobTypes?: string[];
  salaryPeriod: string | null;
  displaySalary: string | null;
  isRemote: boolean;
  isHybrid: boolean;
  mode: string | null;
  /** States a remote role is restricted to; empty = nationwide. */
  eligibleStateCodes?: string[];
  setting?: string | null;
  population?: string | null;
}

export interface RoleSnapshotRow {
  label: string;
  value: string;
  /** Spans both grid columns on desktop (long values like state lists). */
  wide?: boolean;
}

// Past this many named states the value stops being scannable; the
// remainder collapses to "+N more".
const MAX_STATES_SHOWN = 8;

const SALARY_BASIS_LABELS: Record<SalaryPeriodKey, string> = {
  hourly: 'Hourly rate',
  daily: 'Daily rate',
  weekly: 'Weekly rate',
  biweekly: 'Biweekly rate',
  monthly: 'Monthly rate',
  annual: 'Annual salary',
};

// Case/punctuation-insensitive compare so mode text like "On-site" or
// "In-Person" never renders next to an identical base word.
const normalizeModeWord = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '');

/**
 * Pure row builder — exported for unit tests. Every returned row has a
 * non-empty label AND value; callers can render dt/dd pairs blindly.
 */
export function buildRoleSnapshotRows(job: RoleSnapshotJob): RoleSnapshotRow[] {
  const rows: RoleSnapshotRow[] = [];
  const isFullyRemote = job.isRemote && !job.isHybrid;

  // 1. Eligible license states. Codes → full names; unknown codes pass
  //    through raw rather than vanishing. When the list is EMPTY the row is
  //    omitted entirely: the extractor is conservative and an empty array
  //    means "no restriction found", not "verified nationwide" — asserting
  //    "no state restriction" would over-promise on rows it failed to parse.
  const stateCodes = (job.eligibleStateCodes ?? []).filter(Boolean);
  if (stateCodes.length > 0) {
    const names = stateCodes.map((code) => STATE_CODE_TO_NAME[code] ?? code);
    const shown = names.slice(0, MAX_STATES_SHOWN);
    const overflow = names.length - shown.length;
    const value = overflow > 0
      ? `${shown.join(', ')}, +${overflow} more`
      : shown.join(', ');
    rows.push({ label: 'Eligible license states', value, wide: true });
  }

  // 2/3. New grad eligibility + required experience. Same effective helpers
  //      as JobCard so the snapshot can never disagree with the hero chip;
  //      deriveExperienceLabel fills in for legacy rows with a null stored
  //      label. The new-grad signal gets its own row, so the experience row
  //      drops the "· new grads welcome" suffix and skips the pure
  //      "New grad welcome" label entirely (zero-experience floor).
  const expLabel = effectiveExperienceLabel(job) ?? deriveExperienceLabel({
    minYearsExperience: job.minYearsExperience,
    maxYearsExperience: job.maxYearsExperience,
    newGradFriendly: job.newGradFriendly,
  });
  const isNewGradFriendly =
    effectiveNewGradFriendly(job) || (!!expLabel && /new\s+grad/i.test(expLabel));
  if (isNewGradFriendly) {
    rows.push({ label: 'New grad friendly', value: 'Yes' });
  }
  if (expLabel) {
    const yearsOnly = expLabel.replace(/\s*·\s*new grads welcome\s*$/i, '').trim();
    if (yearsOnly && !/new\s+grad/i.test(yearsOnly)) {
      rows.push({ label: 'Required experience', value: yearsOnly });
    }
  }

  // 4. Schedule: every offered schedule, primary facet as fallback.
  const schedules = (job.jobTypes ?? []).filter(Boolean);
  const scheduleValue = schedules.length > 0 ? schedules.join(', ') : (job.jobType ?? '').trim();
  if (scheduleValue) {
    rows.push({ label: 'Schedule', value: scheduleValue });
  }

  // 5. Salary basis. canonicalSalaryPeriod collapses null to 'annual', so
  //    gate on a stored period before naming a basis; a bare displaySalary
  //    still renders (its /hr /yr suffix carries the basis).
  const hasStoredPeriod = !!job.salaryPeriod?.trim();
  const basis = hasStoredPeriod ? SALARY_BASIS_LABELS[canonicalSalaryPeriod(job.salaryPeriod)] : null;
  const displaySalary = job.displaySalary?.trim() || null;
  const salaryValue = basis && displaySalary
    ? `${basis}, ${displaySalary}`
    : (basis ?? displaySalary ?? '');
  if (salaryValue) {
    rows.push({ label: 'Salary basis', value: salaryValue });
  }

  // 6. Work mode. The booleans are always present, so this row always has
  //    data; free-text mode ("Telehealth") is appended only when it adds a
  //    word the base value doesn't already say.
  const baseMode = isFullyRemote ? 'Remote' : job.isHybrid ? 'Hybrid' : 'In person';
  const modeText = job.mode?.trim();
  const modeIsRedundant = !modeText
    || normalizeModeWord(modeText) === normalizeModeWord(baseMode)
    || (baseMode === 'In person' && normalizeModeWord(modeText) === 'onsite');
  rows.push({
    label: 'Work mode',
    value: modeIsRedundant ? baseMode : `${baseMode}, ${modeText}`,
  });

  // 7/8. Clinical setting and patient population, when tagged.
  const setting = job.setting?.trim();
  if (setting) rows.push({ label: 'Setting', value: setting });
  const population = job.population?.trim();
  if (population) rows.push({ label: 'Population', value: population });

  return rows;
}

/* ── Clay styling: same card language as the sibling description card in
     app/jobs/[slug]/page.tsx and the pebbles in SidebarVisualCards. ── */
const clayPebbleShadow = '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)';

const cardStyle: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '6px 6px 12px rgba(0,0,0,0.06), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
  padding: '20px 24px',
  marginBottom: '20px',
};

const pebbleStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '14px',
  backgroundColor: '#F7FBF8',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: clayPebbleShadow,
};

const labelStyle: React.CSSProperties = {
  fontSize: '10.5px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#6B7280',
  marginBottom: '3px',
};

const valueStyle: React.CSSProperties = {
  fontSize: '13.5px',
  fontWeight: 600,
  color: '#1F2937',
  lineHeight: 1.45,
  margin: 0,
};

export default function RoleSnapshot({ job }: { job: RoleSnapshotJob }) {
  const rows = buildRoleSnapshotRows(job);
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="role-snapshot-heading" style={cardStyle}>
      <h2
        id="role-snapshot-heading"
        style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: 'var(--text-primary)', marginBottom: '14px' }}
      >
        Role Snapshot
      </h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2" style={{ margin: 0 }}>
        {rows.map((row) => (
          <div key={row.label} className={row.wide ? 'sm:col-span-2' : undefined} style={pebbleStyle}>
            <dt style={labelStyle}>{row.label}</dt>
            <dd style={valueStyle}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
