'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, MapPin, BadgeDollarSign, ArrowRight } from 'lucide-react';

/**
 * Honest replacement for the old SalaryCalculator: instead of applying
 * invented experience/setting/specialty multipliers to state means, this
 * explorer shows exactly what the live postings advertise per state
 * (median, middle 50%, sample size) and routes personal comparisons to
 * the Offer Analyzer. Every figure arrives precomputed from
 * lib/salary-report/stats.ts; nothing is synthesized client-side.
 */
export interface ExplorerState {
  state: string;
  stateCode: string;
  slug: string;
  n: number;
  median: number;
  p25: number | null;
  p75: number | null;
}

interface Props {
  states: ExplorerState[];
  national: { median: number; p25: number; p75: number; n: number };
}

const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '12px 40px 12px 14px', borderRadius: '12px',
  border: '1.5px solid rgba(0,0,0,0.08)', background: '#FAFAFA',
  fontSize: '14px', fontWeight: 500, color: '#1A2E35',
  appearance: 'none', cursor: 'pointer', outline: 'none',
  boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.03)',
};

const fmtK = (n: number) => `$${Math.round(n / 1000)}K`;
const fmtFull = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export default function SalaryStateExplorer({ states, national }: Props) {
  const [selected, setSelected] = useState<string>('national');

  const current = useMemo(() => {
    if (selected === 'national') return null;
    return states.find((s) => s.slug === selected) ?? null;
  }, [selected, states]);

  const median = current ? current.median : national.median;
  const p25 = current ? current.p25 : national.p25;
  const p75 = current ? current.p75 : national.p75;
  const n = current ? current.n : national.n;
  const label = current ? current.state : 'the United States';

  const diffPct = current && national.median > 0
    ? Math.round(((current.median - national.median) / national.median) * 100)
    : null;

  return (
    <div style={{ ...clayCard, padding: '28px 26px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <MapPin size={18} style={{ color: '#0D9488' }} />
        <h2 className="font-lora" style={{ fontSize: '18px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>
          Advertised Pay Explorer
        </h2>
      </div>
      <p style={{ fontSize: '12.5px', color: '#8A7A6E', margin: '0 0 18px' }}>
        Live figures from postings on this site. Pick a state; only states with at
        least 5 disclosed ranges appear.
      </p>

      <div style={{ position: 'relative', marginBottom: '22px' }}>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={selectStyle}
          aria-label="Choose a state"
        >
          <option value="national">United States (all states)</option>
          {states.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.state} ({s.stateCode})
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#8A7A6E', pointerEvents: 'none' }}
        />
      </div>

      <div style={{ textAlign: 'center', padding: '8px 0 18px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#8A7A6E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Median advertised pay in {label}
        </div>
        <div className="font-lora" style={{ fontSize: '44px', fontWeight: 800, color: '#0D9488', lineHeight: 1.15 }}>
          {fmtFull(median)}
        </div>
        <div style={{ fontSize: '12.5px', color: '#8A7A6E' }}>
          per year, from {n.toLocaleString()} postings with disclosed ranges
          {diffPct != null && (
            <>
              {' '}· {Math.abs(diffPct)}% {diffPct >= 0 ? 'above' : 'below'} the national median
            </>
          )}
        </div>
      </div>

      {p25 != null && p75 != null ? (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ position: 'relative', height: '10px', borderRadius: '6px', background: '#F1EBE4', boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.06)' }}>
            <div
              style={{
                position: 'absolute', left: '25%', width: '50%', height: '10px', borderRadius: '6px',
                background: 'linear-gradient(90deg, #5EEAD4, #0D9488)',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px', fontWeight: 600, color: '#8A7A6E' }}>
            <span>p25 {fmtK(p25)}</span>
            <span>middle 50% of postings</span>
            <span>p75 {fmtK(p75)}</span>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: '12.5px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '10px 14px', marginBottom: '20px' }}>
          Fewer than 10 postings disclose a range here, so we publish the median only.
        </p>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {current && (
          <Link
            href={`/jobs/state/${current.slug}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '11px 18px', borderRadius: '12px', fontWeight: 700, fontSize: '13px',
              background: '#0D9488', color: '#fff', textDecoration: 'none',
            }}
          >
            {current.stateCode} Jobs <ArrowRight size={14} />
          </Link>
        )}
        {current && (
          <Link
            href={`/salary-guide/${current.slug}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '11px 18px', borderRadius: '12px', fontWeight: 600, fontSize: '13px',
              background: '#fff', color: '#0D9488', border: '1px solid #99F6E4', textDecoration: 'none',
            }}
          >
            {current.state} Guide
          </Link>
        )}
        <Link
          href="/tools/offer-analyzer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '11px 18px', borderRadius: '12px', fontWeight: 600, fontSize: '13px',
            background: '#F0FDFA', color: '#134E4A', border: '1px solid #99F6E4', textDecoration: 'none',
          }}
        >
          <BadgeDollarSign size={14} /> Check your offer
        </Link>
      </div>
    </div>
  );
}
