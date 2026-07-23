'use client';

import { useMemo, useState } from 'react';
import { Calculator, Scale, TrendingUp, Building2 } from 'lucide-react';
import {
  compareW2VsContractor,
  type W2PackageInput,
  type ContractorPackageInput,
} from '@/lib/tools/contractor-comparison';

/* ═══ Editable fields — stored as strings so users can clear a field
       while typing; the lib clamps NaN/negatives to 0. ═══ */
interface FormState {
  annualSalary: string;
  matchPercent: string;
  healthMonthly: string;
  ptoDays: string;
  hourlyRate: string;
  hoursPerWeek: string;
  weeksPerYear: string;
}

const DEFAULTS: FormState = {
  annualSalary: '150000',
  matchPercent: '4',
  healthMonthly: '600',
  ptoDays: '20',
  hourlyRate: '100',
  hoursPerWeek: '40',
  weeksPerYear: '48',
};

const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: '12px',
  border: '1.5px solid rgba(0,0,0,0.08)', background: '#FAFAFA',
  fontSize: '14px', fontWeight: 500, color: '#1A2E35',
  outline: 'none', boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.03)',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748B',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px',
};

function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function formatRate(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface LineItemProps {
  label: string;
  value: string;
  tone?: 'plus' | 'minus' | 'neutral';
}

function LineItem({ label, value, tone = 'neutral' }: LineItemProps) {
  const color = tone === 'plus' ? '#0D9488' : tone === 'minus' ? '#EF4444' : '#1A2E35';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', fontSize: '13px' }}>
      <span style={{ color: '#5A4A42' }}>{label}</span>
      <span style={{ fontWeight: 700, color, whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  step?: string;
}

function Field({ id, label, value, onChange, step = '1' }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

export default function ContractorComparisonCalculator() {
  const [form, setForm] = useState<FormState>(DEFAULTS);

  const setField = (field: keyof FormState) => (next: string) =>
    setForm(prev => ({ ...prev, [field]: next }));

  const result = useMemo(() => {
    const w2: W2PackageInput = {
      annualSalary: Number(form.annualSalary),
      employer401kMatchPercent: Number(form.matchPercent),
      employerHealthInsuranceMonthly: Number(form.healthMonthly),
      ptoDays: Number(form.ptoDays),
    };
    const contractor: ContractorPackageInput = {
      hourlyRate: Number(form.hourlyRate),
      hoursPerWeek: Number(form.hoursPerWeek),
      weeksPerYear: Number(form.weeksPerYear),
    };
    return compareW2VsContractor(w2, contractor);
  }, [form]);

  const { w2, contractor, differential, advantage, breakEvenHourlyRate } = result;

  const verdict =
    advantage === 'even'
      ? 'The two packages are effectively even.'
      : advantage === 'contractor'
        ? `The 1099 package is ahead by ${formatMoney(Math.abs(differential))} per year.`
        : `The W-2 package is ahead by ${formatMoney(Math.abs(differential))} per year.`;

  return (
    <div style={{ ...clayCard, padding: 0, overflow: 'hidden', border: '2px solid rgba(13,148,136,0.12)' }}>
      {/* Header.
          WCAG contrast for the #FFF title (relative-luminance method):
          L(#115E59) = 0.0885 → (1.0 + 0.05) / (0.0885 + 0.05) = 7.6:1
          L(#0F766E) = 0.1419 → 1.05 / 0.1919 = 5.5:1
          so white text sits ≥4.5:1 (AA) across the whole gradient span.
          The previous #0D9488→#10B981 gradient measured ~2.0:1 at the
          green end. Subtitle is 92%-alpha white: blended over the lighter
          #0F766E end it lands at ~4.9:1, still AA for its 12px size. */}
      <div style={{
        background: 'linear-gradient(145deg, #115E59, #0F766E)',
        padding: '20px 28px', display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '12px',
          background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Calculator size={20} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', margin: 0 }}>1099 vs W-2 Take-Home Calculator</h2>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.92)', margin: '2px 0 0' }}>
            Edit any field; results update instantly. Uses 2025 tax constants.
          </p>
        </div>
      </div>

      {/* Inputs */}
      <div className="ccc-inputs" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Building2 size={16} color="#6366F1" />
            <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>W-2 Employee Offer</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Field id="ccc-salary" label="Annual salary ($)" value={form.annualSalary} onChange={setField('annualSalary')} step="1000" />
            <Field id="ccc-match" label="Employer 401(k) match (% of salary)" value={form.matchPercent} onChange={setField('matchPercent')} step="0.5" />
            <Field id="ccc-health" label="Employer-paid health insurance ($/month)" value={form.healthMonthly} onChange={setField('healthMonthly')} step="50" />
            <Field id="ccc-pto" label="Paid time off (days/year)" value={form.ptoDays} onChange={setField('ptoDays')} />
          </div>
        </div>

        <div className="ccc-input-right" style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <TrendingUp size={16} color="#0D9488" />
            <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>1099 Contract Offer</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Field id="ccc-rate" label="Hourly rate ($/hr)" value={form.hourlyRate} onChange={setField('hourlyRate')} step="5" />
            <Field id="ccc-hours" label="Hours per week" value={form.hoursPerWeek} onChange={setField('hoursPerWeek')} />
            <Field id="ccc-weeks" label="Weeks per year" value={form.weeksPerYear} onChange={setField('weeksPerYear')} />
            <div style={{
              padding: '12px 14px', borderRadius: '12px',
              background: '#F0FDFA', border: '1px solid #99F6E4',
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#134E4A' }}>Annual gross equivalent</span>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#0D9488' }}>{formatMoney(contractor.grossIncome)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live results region. aria-live must live on a container that is
          ALWAYS mounted (it renders on first paint, before any input edits):
          screen readers only announce changes INSIDE an existing live region —
          a region mounted together with its first content is never announced.
          "polite" queues updates instead of interrupting typing. */}
      <div aria-live="polite">
      {/* Break-even banner */}
      <div style={{
        background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
        borderTop: '1px solid rgba(13,148,136,0.15)', borderBottom: '1px solid rgba(13,148,136,0.15)',
        padding: '22px 28px', textAlign: 'center',
      }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
          Break-Even 1099 Hourly Rate
        </p>
        <div style={{ fontSize: 'clamp(34px, 6vw, 44px)', fontWeight: 800, color: '#134E4A', lineHeight: 1 }}>
          {breakEvenHourlyRate > 0 ? `${formatRate(breakEvenHourlyRate)}/hr` : '—'}
        </div>
        <p style={{ fontSize: '12.5px', color: '#134E4A', margin: '8px auto 0', maxWidth: '480px', lineHeight: 1.5 }}>
          At {form.hoursPerWeek || '0'} hrs/week for {form.weeksPerYear || '0'} weeks/year, a 1099 contract must pay at least
          this rate to match the full value of the W-2 offer after self-employment tax.
        </p>
      </div>

      {/* Side-by-side results */}
      <div className="ccc-results" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
        {/* W-2 column */}
        <div style={{ padding: '24px 28px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
            W-2 Package Value
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            <LineItem label="Gross salary" value={formatMoney(w2.grossSalary)} />
            <LineItem label="401(k) employer match" value={`+${formatMoney(w2.employer401kMatchValue)}`} tone="plus" />
            <LineItem label="Employer-paid health insurance" value={`+${formatMoney(w2.employerHealthInsuranceValue)}`} tone="plus" />
            <LineItem label={`PTO value (${form.ptoDays || '0'} days)`} value={`+${formatMoney(w2.ptoValue)}`} tone="plus" />
            {/* No hardcoded "(7.65%)": above the SS wage base the marginal
                employee rate drops to 1.45%, so a fixed percentage would be
                wrong for high salaries. The dollar figure is always exact. */}
            <LineItem label="FICA (employee share)" value={`−${formatMoney(w2.employeeFicaTax)}`} tone="minus" />
          </div>
          <div style={{
            marginTop: '14px', paddingTop: '12px', borderTop: '1.5px solid rgba(0,0,0,0.08)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1A2E35' }}>Effective value</span>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#6366F1' }}>{formatMoney(w2.effectiveValue)}</span>
          </div>
        </div>

        {/* 1099 column */}
        <div className="ccc-result-right" style={{ padding: '24px 28px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
            1099 Package Value
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            <LineItem label="Gross income" value={formatMoney(contractor.grossIncome)} />
            <LineItem label="SE tax: Social Security (12.4%)" value={`−${formatMoney(contractor.selfEmploymentTax.socialSecurityTax)}`} tone="minus" />
            <LineItem label="SE tax: Medicare (2.9%)" value={`−${formatMoney(contractor.selfEmploymentTax.medicareTax)}`} tone="minus" />
          </div>
          <div style={{
            marginTop: '14px', paddingTop: '12px', borderTop: '1.5px solid rgba(0,0,0,0.08)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1A2E35' }}>Effective value</span>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#0D9488' }}>{formatMoney(contractor.effectiveValue)}</span>
          </div>
          <p style={{ fontSize: '11px', color: '#94A3B8', margin: '10px 0 0', lineHeight: 1.5 }}>
            Half of the SE tax ({formatMoney(contractor.selfEmploymentTax.deductibleHalf)}) is deductible against your
            income taxes. Its dollar value depends on your bracket, so it is not counted here.
          </p>
        </div>
      </div>

      {/* Verdict */}
      <div style={{
        padding: '18px 28px', borderTop: '1px solid rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        background: 'rgba(0,0,0,0.015)',
      }}>
        <Scale size={16} color={advantage === 'w2' ? '#6366F1' : advantage === 'contractor' ? '#0D9488' : '#64748B'} style={{ flexShrink: 0 }} />
        <p style={{ fontSize: '13.5px', fontWeight: 700, color: '#1A2E35', margin: 0 }}>{verdict}</p>
        <p style={{ fontSize: '11px', color: '#94A3B8', margin: 0, width: '100%' }}>
          Both sides still owe federal and state income tax; it is deliberately excluded since it applies to each. Educational estimate, not tax advice.
        </p>
      </div>
      </div>{/* /aria-live results region */}

      <style>{`
        .ccc-inputs input:focus {
          border-color: rgba(13,148,136,0.4) !important;
          box-shadow: 0 0 0 3px rgba(13,148,136,0.08), inset 2px 2px 4px rgba(0,0,0,0.03) !important;
        }
        /* Mobile-first: single column above; split at tablet+ */
        @media (min-width: 769px) {
          .ccc-inputs, .ccc-results { grid-template-columns: 1fr 1fr !important; }
          .ccc-input-right, .ccc-result-right { border-left: 1px solid rgba(0,0,0,0.05); }
        }
      `}</style>
    </div>
  );
}
