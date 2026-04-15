'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ArrowRight, CheckCircle2, AlertTriangle, ShieldX, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

interface StateGuide {
  name: string;
  slug: string;
}

interface StateSalary {
  state: string;
  avgSalary: number;
  minSalary: number;
  maxSalary: number;
  jobCount: number;
}

interface Props {
  stateGuides: StateGuide[];
  stateSalaries: StateSalary[];
  practiceAuthority: Record<string, { authority: 'full' | 'reduced' | 'restricted'; description: string; details: string }>;
}

/* ─── Requirements per state (common baseline + state-specific) ─── */
const COMMON_REQUIREMENTS = [
  { step: 1, text: 'MSN or DNP from accredited program', icon: '🎓' },
  { step: 2, text: 'ANCC PMHNP-BC certification', icon: '📋' },
  { step: 3, text: 'State APRN license application', icon: '📄' },
  { step: 4, text: 'NPI number registration', icon: '🏥' },
  { step: 5, text: 'DEA registration for prescribing', icon: '💊' },
  { step: 6, text: 'State-specific CE requirements', icon: '📚' },
];

const TIMELINE_MAP: Record<string, string> = {
  full: '4-8 weeks',
  reduced: '6-12 weeks',
  restricted: '8-16 weeks',
};

const AUTHORITY_CONFIG = {
  full: {
    label: 'Full Practice Authority',
    color: '#10B981',
    bg: '#D1FAE5',
    border: '#6EE7B7',
    desc: 'Independent practice — no physician oversight required',
    Icon: CheckCircle2,
  },
  reduced: {
    label: 'Reduced Practice',
    color: '#F59E0B',
    bg: '#FEF3C7',
    border: '#FCD34D',
    desc: 'Collaborative agreement with a physician required',
    Icon: AlertTriangle,
  },
  restricted: {
    label: 'Restricted Practice',
    color: '#EF4444',
    bg: '#FEE2E2',
    border: '#FCA5A5',
    desc: 'Physician supervision and protocol agreement required',
    Icon: ShieldX,
  },
};

const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

function fmt(n: number) {
  return n.toLocaleString('en-US');
}

export default function LicensureChecker({ stateGuides, stateSalaries, practiceAuthority }: Props) {
  const [selectedState, setSelectedState] = useState('');

  const result = useMemo(() => {
    if (!selectedState) return null;

    const auth = practiceAuthority[selectedState];
    if (!auth) return null;

    const salary = stateSalaries.find(s => s.state === selectedState);
    const guide = stateGuides.find(g => g.name === selectedState);
    const config = AUTHORITY_CONFIG[auth.authority];
    const timeline = TIMELINE_MAP[auth.authority];

    // Extra requirement for non-FPA states
    const extraReqs = auth.authority === 'full' ? [] :
      auth.authority === 'reduced' ? [{ step: 7, text: 'Secure collaborative physician agreement', icon: '🤝' }] :
      [{ step: 7, text: 'Secure supervising physician agreement', icon: '👨‍⚕️' }];

    return { auth, salary, guide, config, timeline, extraReqs };
  }, [selectedState, practiceAuthority, stateSalaries, stateGuides]);

  const stateList = Object.keys(practiceAuthority).sort();

  return (
    <div style={{ ...clayCard, padding: '0', overflow: 'hidden', border: '2px solid rgba(13,148,136,0.12)' }}>
      {/* ─── Header ─── */}
      <div style={{
        background: 'linear-gradient(145deg, #0D9488, #059669)',
        padding: '28px 32px',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '16px',
          background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.2)',
        }}>
          <Sparkles size={26} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.2 }}>
            PMHNP Licensure Checker
          </h2>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', margin: '4px 0 0' }}>
            Select your state to see requirements, timeline, and salary data
          </p>
        </div>
      </div>

      {/* ─── State Selector ─── */}
      <div style={{ padding: '28px 32px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
          Select Your State
        </label>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <select
            value={selectedState}
            onChange={e => setSelectedState(e.target.value)}
            style={{
              width: '100%', padding: '14px 44px 14px 16px', borderRadius: '14px',
              border: '2px solid rgba(13,148,136,0.15)', background: '#FAFAFA',
              fontSize: '15px', fontWeight: 600, color: '#1A2E35',
              appearance: 'none', cursor: 'pointer', outline: 'none',
              boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.03)',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            }}
            className="lic-select"
          >
            <option value="">Choose a state…</option>
            {stateList.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <ChevronDown size={18} style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
        </div>
      </div>

      {/* ─── Results ─── */}
      {!result ? (
        <div style={{ padding: '48px 32px', textAlign: 'center' }}>
          <Image src="/images/employers/clay-chart.png" alt="Select a state" width={64} height={64} style={{ width: '64px', height: '64px', margin: '0 auto 16px', opacity: 0.5 }} />
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#94A3B8', margin: '0 0 4px' }}>Select a state above</p>
          <p style={{ fontSize: '13px', color: '#CBD5E1', margin: 0 }}>to see licensure requirements, practice authority, salary, and timeline</p>
        </div>
      ) : (
        <div className="lic-results-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>

          {/* LEFT: Practice Authority + Requirements */}
          <div style={{ padding: '28px 32px', borderRight: '1px solid rgba(0,0,0,0.05)' }}>
            {/* Authority Badge */}
            <div style={{
              padding: '16px 20px', borderRadius: '16px',
              background: result.config.bg, border: `1.5px solid ${result.config.border}`,
              marginBottom: '24px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <result.config.Icon size={20} color={result.config.color} />
                <span style={{ fontSize: '15px', fontWeight: 800, color: result.config.color }}>{result.config.label}</span>
              </div>
              <p style={{ fontSize: '12.5px', color: '#5A4A42', margin: 0, lineHeight: 1.5 }}>
                {result.auth.details}
              </p>
            </div>

            {/* Requirements Checklist */}
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Licensure Steps for {selectedState}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[...COMMON_REQUIREMENTS, ...result.extraReqs].map((req) => (
                <div key={req.step} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                  padding: '10px 14px', borderRadius: '12px',
                  background: 'rgba(0,0,0,0.015)', border: '1px solid rgba(0,0,0,0.04)',
                }}>
                  <span style={{ fontSize: '18px', lineHeight: 1 }}>{req.icon}</span>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#0D9488' }}>STEP {req.step}</span>
                    <p style={{ fontSize: '13px', color: '#1A2E35', margin: '2px 0 0', fontWeight: 500 }}>{req.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Salary + Timeline + CTA */}
          <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Estimated Timeline */}
            <div style={{
              padding: '20px', borderRadius: '16px',
              background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
              border: '1.5px solid rgba(13,148,136,0.12)',
            }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
                Estimated Timeline
              </p>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#134E4A', lineHeight: 1 }}>
                {result.timeline}
              </div>
              <p style={{ fontSize: '12px', color: '#5A4A42', margin: '6px 0 0' }}>
                From application to active license
              </p>
            </div>

            {/* Salary Data */}
            {result.salary && (
              <div style={{
                padding: '20px', borderRadius: '16px',
                background: '#FAFAFA', border: '1px solid rgba(0,0,0,0.06)',
              }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
                  Average Salary in {selectedState}
                </p>
                <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>
                  ${fmt(result.salary.avgSalary)}
                </div>
                <p style={{ fontSize: '12px', color: '#94A3B8', margin: '6px 0 0' }}>
                  Range: ${fmt(result.salary.minSalary)} – ${fmt(result.salary.maxSalary)}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
                  <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#F0FDFA' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#0D9488' }}>{fmt(result.salary.jobCount)}</div>
                    <div style={{ fontSize: '10px', color: '#64748B' }}>Active Jobs</div>
                  </div>
                  <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#EEF2FF' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#6366F1' }}>
                      ~${fmt(Math.round(result.salary.avgSalary / 2080))}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748B' }}>Per Hour</div>
                  </div>
                </div>
              </div>
            )}

            {/* Key Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { label: 'Certification Exam', value: 'ANCC PMHNP-BC ($395)' },
                { label: 'DEA Registration', value: '$888 / 3 years' },
                { label: 'License Renewal', value: 'Every 2-3 years' },
                { label: 'CE Hours', value: '25-50 hours / cycle' },
              ].map(kv => (
                <div key={kv.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px' }}>
                  <span style={{ color: '#64748B' }}>{kv.label}</span>
                  <span style={{ fontWeight: 700, color: '#1A2E35' }}>{kv.value}</span>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto' }}>
              {result.guide && (
                <Link href={`/blog/${result.guide.slug}`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '14px 24px', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
                  background: 'linear-gradient(145deg, #0D9488, #059669)', color: '#fff',
                  textDecoration: 'none',
                  boxShadow: '0 4px 16px rgba(13,148,136,0.3)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                }} className="lic-cta-primary">
                  Read Full {selectedState} Guide <ArrowRight size={16} />
                </Link>
              )}
              <Link href={`/jobs/state/${selectedState.toLowerCase().replace(/\s+/g, '-')}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '12px 24px', borderRadius: '12px', fontWeight: 600, fontSize: '13px',
                background: 'transparent', color: '#0D9488',
                border: '1.5px solid rgba(13,148,136,0.2)', textDecoration: 'none',
                transition: 'border-color 0.2s ease, transform 0.2s ease',
              }} className="lic-cta-secondary">
                Browse {selectedState} Jobs <ArrowRight size={14} />
              </Link>
            </div>
          </div>

        </div>
      )}

      <style>{`
        .lic-select:focus {
          border-color: rgba(13,148,136,0.5) !important;
          box-shadow: 0 0 0 4px rgba(13,148,136,0.08), inset 2px 2px 4px rgba(0,0,0,0.03) !important;
        }
        .lic-cta-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(13,148,136,0.4) !important;
        }
        .lic-cta-secondary:hover {
          transform: translateY(-2px);
          border-color: rgba(13,148,136,0.4) !important;
        }
        @media (max-width: 768px) {
          .lic-results-body {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
