'use client';

import { useMemo, useState } from 'react';
import type { SalaryPeriodKey } from '@/lib/utils';

interface Props {
  /** National advertised median ($/yr) for context, null when unavailable. */
  nationalMedian: number | null;
  nationalN: number;
}

const card: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow:
    '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const PERIODS: { key: SalaryPeriodKey; label: string }[] = [
  { key: 'hourly', label: 'Hourly' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'biweekly', label: 'Biweekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'annual', label: 'Annual' },
];

/**
 * Convert an amount in `from` units to $/yr under the given assumptions.
 * Kept as plain exported math so tests can pin it.
 */
export function toAnnual(
  amount: number,
  from: SalaryPeriodKey,
  hoursPerWeek: number,
  weeksPerYear: number
): number {
  switch (from) {
    case 'hourly':
      return amount * hoursPerWeek * weeksPerYear;
    case 'daily':
      // Days derived from hours/week at an 8-hour day, capped at 7/week.
      return amount * Math.min(7, hoursPerWeek / 8) * weeksPerYear;
    case 'weekly':
      return amount * weeksPerYear;
    case 'biweekly':
      return amount * (weeksPerYear / 2);
    case 'monthly':
      return amount * 12;
    case 'annual':
      return amount;
  }
}

export function fromAnnual(
  annual: number,
  to: SalaryPeriodKey,
  hoursPerWeek: number,
  weeksPerYear: number
): number {
  switch (to) {
    case 'hourly':
      return annual / (hoursPerWeek * weeksPerYear);
    case 'daily':
      return annual / (Math.min(7, hoursPerWeek / 8) * weeksPerYear);
    case 'weekly':
      return annual / weeksPerYear;
    case 'biweekly':
      return annual / (weeksPerYear / 2);
    case 'monthly':
      return annual / 12;
    case 'annual':
      return annual;
  }
}

const fmt = (v: number, decimals: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

export default function SalaryConverter({ nationalMedian, nationalN }: Props) {
  const [amount, setAmount] = useState<string>('');
  const [from, setFrom] = useState<SalaryPeriodKey>('hourly');
  const [hoursPerWeek, setHoursPerWeek] = useState<string>('40');
  const [weeksPerYear, setWeeksPerYear] = useState<string>('52');

  const amountValid = (() => {
    const raw = Number(amount.replace(/[^0-9.]/g, ''));
    return Number.isFinite(raw) && raw > 0;
  })();
  const hrsValid = (() => {
    const hrs = Number(hoursPerWeek);
    return Number.isFinite(hrs) && hrs > 0 && hrs <= 100;
  })();
  const wksValid = (() => {
    const wks = Number(weeksPerYear);
    return Number.isFinite(wks) && wks > 0 && wks <= 53;
  })();

  const parsed = useMemo(() => {
    if (!amountValid || !hrsValid || !wksValid) return null;
    const raw = Number(amount.replace(/[^0-9.]/g, ''));
    return { annual: toAnnual(raw, from, Number(hoursPerWeek), Number(weeksPerYear)), hrs: Number(hoursPerWeek), wks: Number(weeksPerYear) };
  }, [amount, from, hoursPerWeek, weeksPerYear, amountValid, hrsValid, wksValid]);

  return (
    <div>
      <div style={{ ...card, padding: '24px' }}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>Amount</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={from === 'hourly' ? 'e.g. 85' : 'e.g. 165000'}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
              aria-label="Pay amount"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>Paid</span>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value as SalaryPeriodKey)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {PERIODS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>Hours / week</span>
            <input
              type="number" min={1} max={100}
              value={hoursPerWeek}
              onChange={(e) => setHoursPerWeek(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
              aria-label="Hours per week"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>Weeks / year</span>
            <input
              type="number" min={1} max={53}
              value={weeksPerYear}
              onChange={(e) => setWeeksPerYear(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
              aria-label="Weeks per year"
            />
          </label>
        </div>
        {/* Say WHY nothing renders instead of silently vanishing the results. */}
        {amountValid && (!hrsValid || !wksValid) && (
          <p className="mt-3 text-xs text-red-600" role="status">
            {!hrsValid ? 'Enter hours between 1 and 100. ' : ''}
            {!wksValid ? 'Enter weeks between 1 and 53.' : ''}
          </p>
        )}
        <p className="mt-3 text-xs" style={{ color: 'var(--text-tertiary, #6B7280)' }}>
          Daily figures assume an 8-hour day (days/week = hours/week ÷ 8, capped at 7).
        </p>
      </div>

      {parsed && (
        <div style={{ ...card, padding: '24px', marginTop: '20px' }} aria-live="polite">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PERIODS.map((p) => {
              const v = fromAnnual(parsed.annual, p.key, parsed.hrs, parsed.wks);
              const decimals = p.key === 'hourly' || p.key === 'daily' ? 2 : 0;
              const highlight = p.key === from;
              return (
                <div
                  key={p.key}
                  className="rounded-2xl px-4 py-3"
                  style={{
                    background: highlight ? '#F0FDFA' : '#FAFAF9',
                    border: highlight ? '1px solid #99F6E4' : '1px solid rgba(0,0,0,0.04)',
                  }}
                >
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary, #6B7280)' }}>
                    {p.label}
                  </div>
                  <div className="text-lg font-bold" style={{ color: highlight ? '#0D9488' : 'var(--text-primary, #1F2937)' }}>
                    {fmt(v, decimals)}
                  </div>
                </div>
              );
            })}
          </div>

          {nationalMedian != null && (
            <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary, #4B5563)' }}>
              For context: the national advertised median across live PMHNP postings is{' '}
              <strong>${nationalMedian.toLocaleString()}/yr</strong> (n={nationalN}). Your input converts to{' '}
              <strong>${Math.round(parsed.annual).toLocaleString()}/yr</strong> under these assumptions.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
