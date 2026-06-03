'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';

interface StateSalary {
  state: string;
  stateCode: string;
  avgSalary: number;
  minSalary: number;
  maxSalary: number;
}

interface Props {
  stateSalaries: StateSalary[];
  nationalAvg: number;
}

/* ═══ Multipliers based on industry data ═══ */
const EXPERIENCE_OPTIONS = [
  { label: 'New Grad (0-1 yr)', value: 'new-grad', multiplier: 0.82 },
  { label: 'Early Career (1-3 yrs)', value: 'early', multiplier: 0.93 },
  { label: 'Mid-Career (3-7 yrs)', value: 'mid', multiplier: 1.0 },
  { label: 'Experienced (7-15 yrs)', value: 'experienced', multiplier: 1.12 },
  { label: 'Expert (15+ yrs)', value: 'expert', multiplier: 1.28 },
];

const SETTING_OPTIONS = [
  { label: 'Private Practice (Owner)', value: 'private', multiplier: 1.35 },
  { label: 'Travel / Locum Tenens', value: 'travel', multiplier: 1.20 },
  { label: 'Telehealth / Remote', value: 'telehealth', multiplier: 1.02 },
  { label: 'Outpatient Clinic', value: 'outpatient', multiplier: 0.95 },
  { label: 'Hospital / Inpatient', value: 'hospital', multiplier: 0.90 },
  { label: 'Community Mental Health', value: 'community', multiplier: 0.78 },
];

const SPECIALTY_OPTIONS = [
  { label: 'General Psychiatry', value: 'general', multiplier: 1.0 },
  { label: 'Addiction / MAT', value: 'addiction', multiplier: 1.17 },
  { label: 'Child & Adolescent', value: 'child', multiplier: 1.12 },
  { label: 'Forensic Psychiatry', value: 'forensic', multiplier: 1.20 },
  { label: 'Emergency / Crisis', value: 'emergency', multiplier: 1.15 },
  { label: 'Geriatric Psychiatry', value: 'geriatric', multiplier: 1.07 },
];

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
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
};

function formatSalary(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export default function SalaryCalculator({ stateSalaries, nationalAvg }: Props) {
  const [selectedState, setSelectedState] = useState('');
  const [experience, setExperience] = useState('mid');
  const [setting, setSetting] = useState('outpatient');
  const [specialty, setSpecialty] = useState('general');

  const result = useMemo(() => {
    // Base salary: state avg or national avg
    const stateData = stateSalaries.find(s => s.state === selectedState);
    const baseSalary = stateData ? stateData.avgSalary : nationalAvg;

    const expMult = EXPERIENCE_OPTIONS.find(e => e.value === experience)?.multiplier || 1;
    const setMult = SETTING_OPTIONS.find(s => s.value === setting)?.multiplier || 1;
    const specMult = SPECIALTY_OPTIONS.find(s => s.value === specialty)?.multiplier || 1;

    const estimated = baseSalary * expMult * setMult * specMult;
    const low = estimated * 0.90;
    const high = estimated * 1.10;

    // Breakdown: how much each factor adds
    const baseContrib = baseSalary;
    const expContrib = baseSalary * (expMult - 1);
    const setContrib = baseSalary * expMult * (setMult - 1);
    const specContrib = baseSalary * expMult * setMult * (specMult - 1);

    return {
      estimated: Math.round(estimated),
      low: Math.round(low),
      high: Math.round(high),
      baseSalary: Math.round(baseContrib),
      expImpact: Math.round(expContrib),
      setImpact: Math.round(setContrib),
      specImpact: Math.round(specContrib),
      stateName: stateData?.state || 'National',
      stateCode: stateData?.stateCode || 'US',
    };
  }, [selectedState, experience, setting, specialty, stateSalaries, nationalAvg]);

  return (
    <div style={{ ...clayCard, padding: '0', overflow: 'hidden', border: '2px solid rgba(13,148,136,0.12)' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(145deg, #0D9488, #10B981)',
        padding: '20px 28px',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '12px',
          background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={20} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', margin: 0 }}>PMHNP Salary Calculator</h2>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', margin: '2px 0 0' }}>Get a personalized estimate based on your profile</p>
        </div>
      </div>

      <div className="sal-calc-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
        {/* LEFT: Inputs */}
        <div style={{ padding: '28px 28px', borderRight: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

            {/* State */}
            <div>
              <label htmlFor="sal-state" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                State
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  id="sal-state"
                  value={selectedState}
                  onChange={e => setSelectedState(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">National Average</option>
                  {stateSalaries.map(s => (
                    <option key={s.state} value={s.state}>{s.state} ({s.stateCode})</option>
                  ))}
                </select>
                <ChevronDown size={16} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
              </div>
            </div>

            {/* Experience */}
            <div>
              <label htmlFor="sal-experience" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Experience Level
              </label>
              <div style={{ position: 'relative' }}>
                <select id="sal-experience" value={experience} onChange={e => setExperience(e.target.value)} style={selectStyle}>
                  {EXPERIENCE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={16} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
              </div>
            </div>

            {/* Setting */}
            <div>
              <label htmlFor="sal-setting" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Practice Setting
              </label>
              <div style={{ position: 'relative' }}>
                <select id="sal-setting" value={setting} onChange={e => setSetting(e.target.value)} style={selectStyle}>
                  {SETTING_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={16} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
              </div>
            </div>

            {/* Specialty */}
            <div>
              <label htmlFor="sal-specialty" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Specialty
              </label>
              <div style={{ position: 'relative' }}>
                <select id="sal-specialty" value={specialty} onChange={e => setSpecialty(e.target.value)} style={selectStyle}>
                  {SPECIALTY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={16} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT: Results */}
        <div style={{ padding: '28px 28px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {/* Main number */}
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
            Estimated Annual Salary
          </p>
          <div style={{ fontSize: '42px', fontWeight: 800, color: '#134E4A', lineHeight: 1, marginBottom: '4px' }}>
            {formatSalary(result.estimated)}
          </div>
          <p style={{ fontSize: '13px', color: '#0D9488', margin: '0 0 20px', fontWeight: 500 }}>
            Range: {formatSalary(result.low)} – {formatSalary(result.high)}
          </p>

          {/* Breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px' }}>
              <span style={{ color: '#5A4A42' }}>Base ({result.stateName})</span>
              <span style={{ fontWeight: 700, color: '#134E4A' }}>{formatSalary(result.baseSalary)}</span>
            </div>
            {result.expImpact !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px' }}>
                <span style={{ color: '#5A4A42' }}>Experience</span>
                <span style={{ fontWeight: 700, color: result.expImpact > 0 ? '#0D9488' : '#EF4444' }}>
                  {result.expImpact > 0 ? '+' : ''}{formatSalary(result.expImpact)}
                </span>
              </div>
            )}
            {result.setImpact !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px' }}>
                <span style={{ color: '#5A4A42' }}>Setting</span>
                <span style={{ fontWeight: 700, color: result.setImpact > 0 ? '#0D9488' : '#EF4444' }}>
                  {result.setImpact > 0 ? '+' : ''}{formatSalary(result.setImpact)}
                </span>
              </div>
            )}
            {result.specImpact !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px' }}>
                <span style={{ color: '#5A4A42' }}>Specialty</span>
                <span style={{ fontWeight: 700, color: result.specImpact > 0 ? '#0D9488' : '#EF4444' }}>
                  {result.specImpact > 0 ? '+' : ''}{formatSalary(result.specImpact)}
                </span>
              </div>
            )}
          </div>

          {/* Hourly */}
          <div style={{
            marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(13,148,136,0.15)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '12px', color: '#5A4A42' }}>Hourly equivalent</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#134E4A' }}>
              ~{formatSalary(Math.round(result.estimated / 2080))}/hr
            </span>
          </div>

          <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '14px', lineHeight: 1.4 }}>
            * Estimates based on BLS, ZipRecruiter, Indeed, and 10,000+ job postings. Actual salary varies by employer.
          </p>
        </div>
      </div>

      <style>{`
        .sal-calc-body select:focus {
          border-color: rgba(13,148,136,0.4) !important;
          box-shadow: 0 0 0 3px rgba(13,148,136,0.08), inset 2px 2px 4px rgba(0,0,0,0.03) !important;
        }
        @media (max-width: 768px) {
          .sal-calc-body {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
