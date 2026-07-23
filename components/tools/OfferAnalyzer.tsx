'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, MapPin, ShieldCheck } from 'lucide-react';
import {
  percentileRank,
  summarizeMidpoints,
  roundDisplayDollars,
  TIER_FULL_MIN_N,
} from '@/lib/salary-report/stats';
import type { OfferMarketData } from '@/lib/salary-report/market-data';

interface Props {
  data: OfferMarketData;
}

type PayPeriod = 'annual' | 'hourly';

/** 1st/2nd/3rd/…nth with the 11th–13th exception. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

const MAX_HOURS_PER_WEEK = 100;

const card: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow:
    '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const fmtK = (v: number) => `$${Math.round(v / 1000)}k`;
const fmtFull = (v: number) => `$${roundDisplayDollars(v).toLocaleString()}`;

function stateSlug(state: string): string {
  return state.toLowerCase().replace(/\s+/g, '-');
}

export default function OfferAnalyzer({ data }: Props) {
  const [amount, setAmount] = useState<string>('');
  const [period, setPeriod] = useState<PayPeriod>('annual');
  const [hoursPerWeek, setHoursPerWeek] = useState<string>('40');
  const [segment, setSegment] = useState<string>('national');

  const stateNames = useMemo(() => Object.keys(data.states).sort(), [data.states]);

  const midpoints = useMemo(() => {
    if (segment === 'national') return data.national;
    if (segment === 'remote') return data.remote;
    return data.states[segment] ?? data.national;
  }, [segment, data]);

  const summary = useMemo(() => summarizeMidpoints(midpoints), [midpoints]);

  const parsedHours = Number(hoursPerWeek);
  const hoursValid = Number.isFinite(parsedHours) && parsedHours > 0 && parsedHours <= MAX_HOURS_PER_WEEK;

  const annualOffer = useMemo(() => {
    const raw = Number(amount.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(raw) || raw <= 0) return null;
    if (period === 'annual') return raw;
    // No silent fallback: an out-of-range hours value yields no result plus
    // a visible hint, never a quietly-assumed 40-hour week.
    if (!hoursValid) return null;
    return raw * parsedHours * 52;
  }, [amount, period, hoursValid, parsedHours]);

  const rank = annualOffer != null && midpoints.length > 0
    ? percentileRank(midpoints, annualOffer)
    : null;
  const rankRounded = rank != null ? Math.round(rank) : null;
  const rankSuffix = rankRounded != null ? ordinal(rankRounded).slice(String(rankRounded).length) : '';

  const segmentLabel =
    segment === 'national' ? 'nationwide' : segment === 'remote' ? 'remote positions' : segment;

  return (
    <div>
      {/* Inputs */}
      <div style={{ ...card, padding: '24px' }}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>
              Offer amount
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={period === 'annual' ? 'e.g. 165000' : 'e.g. 85'}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
              aria-label="Offer amount"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>
              Pay period
            </span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PayPeriod)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="annual">Per year</option>
              <option value="hourly">Per hour</option>
            </select>
          </label>
          {period === 'hourly' && (
            <label className="block">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>
                Hours / week
              </span>
              <input
                type="number"
                min={1}
                max={MAX_HOURS_PER_WEEK}
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="Hours per week"
              />
              {!hoursValid && (
                <span className="mt-1 block text-xs text-red-600">
                  Enter hours between 1 and {MAX_HOURS_PER_WEEK}.
                </span>
              )}
            </label>
          )}
          <label className="block">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>
              Compare against
            </span>
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="national">All states (national)</option>
              {data.remote.length >= 5 && <option value="remote">Remote positions</option>}
              {stateNames.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs flex items-center gap-1.5" style={{ color: 'var(--text-tertiary, #6B7280)' }}>
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
          Your offer is analyzed in your browser. The number you type never leaves this page.
        </p>
      </div>

      {/* Result — the aria-live container stays mounted so the FIRST result
          is announced too; content swaps inside it. */}
      <div aria-live="polite">
      {annualOffer != null && (summary.tier === 'full' || summary.tier === 'median') && (
        <div style={{ ...card, padding: '28px', marginTop: '20px' }}>
          {summary.tier === 'full' && rank != null && (
            <>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span
                  className="text-5xl font-extrabold"
                  style={{ fontFamily: 'var(--font-lora), Georgia, serif', color: '#0D9488' }}
                >
                  {rankRounded}
                  <span className="text-2xl align-super">{rankSuffix}</span>
                </span>
                <span className="text-lg font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>
                  percentile of advertised pay {segmentLabel === 'nationwide' ? 'nationwide' : `in ${segmentLabel}`}
                </span>
              </div>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary, #4B5563)' }}>
                Your {period === 'hourly' ? `hourly offer (≈ ${fmtFull(annualOffer)}/yr at ${parsedHours} h/wk × 52 wks)` : `offer of ${fmtFull(annualOffer)}`}{' '}
                lands at the {ordinal(rankRounded ?? 0)} percentile of the advertised salary midpoints in {summary.n} live postings.
              </p>

              {/* Percentile-rank scale: the fill is your rank, and the p25 /
                  median / p75 ticks sit at 25% / 50% / 75% on the SAME axis,
                  so labels and fill can never disagree. */}
              <div className="mt-6">
                <div className="relative h-2 rounded-full" style={{ background: '#E7E5E4' }}>
                  <div
                    className="absolute h-2 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, #99F6E4, #0D9488)',
                      left: '0%',
                      width: `${Math.min(100, Math.max(2, rank))}%`,
                    }}
                  />
                  {[25, 50, 75].map((p) => (
                    <div
                      key={p}
                      className="absolute"
                      style={{ left: `${p}%`, top: '-4px', width: '2px', height: '16px', background: '#A8A29E' }}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <div className="relative mt-2 h-4 text-xs font-medium" style={{ color: 'var(--text-tertiary, #6B7280)' }}>
                  <span className="absolute -translate-x-1/2" style={{ left: '25%' }}>p25 {fmtK(summary.p25)}</span>
                  <span className="absolute -translate-x-1/2" style={{ left: '50%' }}>median {fmtK(summary.median)}</span>
                  <span className="absolute -translate-x-1/2" style={{ left: '75%' }}>p75 {fmtK(summary.p75)}</span>
                </div>
              </div>
            </>
          )}

          {summary.tier === 'median' && (
            <>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>
                {/* Compare against the SAME rounded figure we display, so the
                    verdict can never contradict the number next to it. */}
                Your offer is {annualOffer >= roundDisplayDollars(summary.median) ? 'at or above' : 'below'} the advertised median of{' '}
                {fmtFull(summary.median)} in {segmentLabel}.
              </div>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary, #4B5563)' }}>
                Only {summary.n} postings there disclose a usable range, which is too few for percentile
                math, so we show the median comparison only. Try the national comparison for a fuller picture.
              </p>
            </>
          )}

          <p className="mt-5 text-xs" style={{ color: 'var(--text-tertiary, #6B7280)' }}>
            <strong>n={summary.n}</strong> means this math uses {summary.n} live postings that advertise a
            salary range (not self-reported earnings). <strong>p25 / median / p75</strong> are the pay
            levels that 25%, 50%, and 75% of those advertised midpoints fall below. Percentiles need
            at least {TIER_FULL_MIN_N} postings.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            {segment !== 'national' && segment !== 'remote' && (
              <>
                <Link
                  href={`/jobs/state/${stateSlug(segment)}`}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white"
                  style={{ background: '#0D9488' }}
                >
                  <MapPin className="w-4 h-4" aria-hidden="true" /> PMHNP jobs in {segment}
                </Link>
                <Link
                  href={`/salary-guide/${stateSlug(segment)}`}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
                  style={{ color: '#0D9488', border: '1px solid #0D9488' }}
                >
                  <TrendingUp className="w-4 h-4" aria-hidden="true" /> {segment} salary guide
                </Link>
              </>
            )}
            {(segment === 'national' || segment === 'remote') && (
              <Link
                href={segment === 'remote' ? '/jobs/remote' : '/jobs'}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white"
                style={{ background: '#0D9488' }}
              >
                <MapPin className="w-4 h-4" aria-hidden="true" />
                Browse {segment === 'remote' ? 'remote ' : ''}PMHNP jobs
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Honest degrade for n<5: the page promises "we say so instead of
          guessing" — so say so, with the count, and never a dollar figure. */}
      {annualOffer != null && (summary.tier === 'countOnly' || summary.tier === 'none') && (
        <div style={{ ...card, padding: '24px', marginTop: '20px' }}>
          <div className="text-lg font-semibold" style={{ color: 'var(--text-primary, #1F2937)' }}>
            Too few postings to compare honestly.
          </div>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary, #4B5563)' }}>
            {summary.n === 0
              ? 'No postings in this segment disclose a usable salary range right now.'
              : `Only ${summary.n} posting${summary.n === 1 ? '' : 's'} in this segment disclose a usable salary range, which is below the 5-posting minimum for showing dollar figures.`}{' '}
            Try the national comparison instead.
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
