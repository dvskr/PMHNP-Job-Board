'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { DollarSign, MapPin, Building2, TrendingUp, ArrowRight, Briefcase } from 'lucide-react';

/* ═══ Salary Data ═══ */
const STATE_DATA: Record<string, { label: string; multiplier: number; col: string }> = {
  'california': { label: 'California', multiplier: 1.25, col: 'High' },
  'new-york': { label: 'New York', multiplier: 1.22, col: 'High' },
  'new-jersey': { label: 'New Jersey', multiplier: 1.18, col: 'High' },
  'washington': { label: 'Washington', multiplier: 1.16, col: 'High' },
  'massachusetts': { label: 'Massachusetts', multiplier: 1.15, col: 'High' },
  'connecticut': { label: 'Connecticut', multiplier: 1.12, col: 'High' },
  'oregon': { label: 'Oregon', multiplier: 1.10, col: 'High' },
  'colorado': { label: 'Colorado', multiplier: 1.08, col: 'Medium' },
  'maryland': { label: 'Maryland', multiplier: 1.08, col: 'Medium' },
  'virginia': { label: 'Virginia', multiplier: 1.06, col: 'Medium' },
  'illinois': { label: 'Illinois', multiplier: 1.05, col: 'Medium' },
  'minnesota': { label: 'Minnesota', multiplier: 1.05, col: 'Medium' },
  'arizona': { label: 'Arizona', multiplier: 1.04, col: 'Medium' },
  'nevada': { label: 'Nevada', multiplier: 1.04, col: 'Medium' },
  'pennsylvania': { label: 'Pennsylvania', multiplier: 1.03, col: 'Medium' },
  'florida': { label: 'Florida', multiplier: 1.02, col: 'Medium' },
  'texas': { label: 'Texas', multiplier: 1.02, col: 'Medium' },
  'georgia': { label: 'Georgia', multiplier: 1.00, col: 'Medium' },
  'north-carolina': { label: 'North Carolina', multiplier: 1.00, col: 'Medium' },
  'michigan': { label: 'Michigan', multiplier: 0.99, col: 'Medium' },
  'ohio': { label: 'Ohio', multiplier: 0.98, col: 'Medium' },
  'tennessee': { label: 'Tennessee', multiplier: 0.97, col: 'Low' },
  'indiana': { label: 'Indiana', multiplier: 0.96, col: 'Low' },
  'missouri': { label: 'Missouri', multiplier: 0.96, col: 'Low' },
  'south-carolina': { label: 'South Carolina', multiplier: 0.95, col: 'Low' },
  'kentucky': { label: 'Kentucky', multiplier: 0.94, col: 'Low' },
  'alabama': { label: 'Alabama', multiplier: 0.93, col: 'Low' },
  'louisiana': { label: 'Louisiana', multiplier: 0.93, col: 'Low' },
  'oklahoma': { label: 'Oklahoma', multiplier: 0.92, col: 'Low' },
  'mississippi': { label: 'Mississippi', multiplier: 0.91, col: 'Low' },
  'arkansas': { label: 'Arkansas', multiplier: 0.90, col: 'Low' },
  'west-virginia': { label: 'West Virginia', multiplier: 0.90, col: 'Low' },
  'national': { label: 'National Average', multiplier: 1.00, col: 'Medium' },
};

const SETTINGS: Record<string, { label: string; multiplier: number; emoji: string }> = {
  'private-practice': { label: 'Private Practice', multiplier: 1.25, emoji: '🏥' },
  'telehealth': { label: 'Telehealth / Remote', multiplier: 1.10, emoji: '💻' },
  'hospital': { label: 'Hospital / Inpatient', multiplier: 1.08, emoji: '🏨' },
  'outpatient': { label: 'Outpatient Clinic', multiplier: 1.00, emoji: '🩺' },
  'community': { label: 'Community Mental Health', multiplier: 0.92, emoji: '🏛️' },
  'correctional': { label: 'Correctional / Forensic', multiplier: 1.18, emoji: '🔒' },
  'va': { label: 'VA / Federal', multiplier: 1.05, emoji: '🇺🇸' },
  'academia': { label: 'Academic / Teaching', multiplier: 0.95, emoji: '🎓' },
};

const EXPERIENCE: Record<string, { label: string; base: number }> = {
  'new-grad': { label: 'New Grad (0-1 years)', base: 125000 },
  'early': { label: 'Early Career (1-3 years)', base: 140000 },
  'mid': { label: 'Mid Career (3-7 years)', base: 158000 },
  'senior': { label: 'Senior (7-12 years)', base: 175000 },
  'expert': { label: 'Expert (12+ years)', base: 195000 },
};

const CERTIFICATIONS: Record<string, { label: string; bonus: number }> = {
  'none': { label: 'PMHNP-BC only', bonus: 0 },
  'dnp': { label: '+ DNP Degree', bonus: 12000 },
  'mat': { label: '+ MAT/Addiction Cert', bonus: 15000 },
  'child': { label: '+ Child/Adolescent Focus', bonus: 10000 },
  'forensic': { label: '+ Forensic Nursing (AFN-BC)', bonus: 12000 },
};

const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

interface FAQ {
  q: string;
  a: string;
}

export default function SalaryCalculator({ faqs }: { faqs: FAQ[] }) {
  const [state, setState] = useState('national');
  const [setting, setSetting] = useState('outpatient');
  const [experience, setExperience] = useState('mid');
  const [certification, setCertification] = useState('none');

  const salary = useMemo(() => {
    const base = EXPERIENCE[experience].base;
    const stateMultiplier = STATE_DATA[state].multiplier;
    const settingMultiplier = SETTINGS[setting].multiplier;
    const certBonus = CERTIFICATIONS[certification].bonus;
    const estimated = Math.round((base * stateMultiplier * settingMultiplier + certBonus) / 1000) * 1000;
    const low = Math.round(estimated * 0.88 / 1000) * 1000;
    const high = Math.round(estimated * 1.12 / 1000) * 1000;
    const hourly = Math.round(estimated / 2080);
    const monthly = Math.round(estimated / 12);
    return { estimated, low, high, hourly, monthly };
  }, [state, setting, experience, certification]);

  const formatCurrency = (n: number) => `$${n.toLocaleString()}`;

  return (
    <>
      {/* HERO */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 24px 32px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' }}>
          Free Tool
        </p>
        <h1 className="font-lora" style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 700, color: '#1A2E35', marginBottom: '16px' }}>
          PMHNP Salary Calculator
        </h1>
        <p style={{ fontSize: '17px', color: '#5A4A42', maxWidth: '600px', margin: '0 auto 32px', lineHeight: 1.6 }}>
          Estimate your psychiatric nurse practitioner salary based on state, practice setting, experience level, and specialty certifications.
        </p>
      </section>

      {/* CALCULATOR */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 48px' }}>
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Controls */}
          <div className="lg:col-span-2">
            <div style={{ ...clayCard, padding: '32px' }}>
              <div className="grid md:grid-cols-2 gap-6">
                {/* State */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>
                    <MapPin size={16} style={{ color: '#0D9488' }} /> State
                  </label>
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    id="salary-state-select"
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: '12px',
                      border: '2px solid rgba(13,148,136,0.15)', background: '#F0FDFA',
                      fontSize: '14px', color: '#1A2E35', fontWeight: 500,
                      cursor: 'pointer', outline: 'none',
                    }}
                  >
                    {Object.entries(STATE_DATA).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>

                {/* Setting */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>
                    <Building2 size={16} style={{ color: '#0D9488' }} /> Practice Setting
                  </label>
                  <select
                    value={setting}
                    onChange={(e) => setSetting(e.target.value)}
                    id="salary-setting-select"
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: '12px',
                      border: '2px solid rgba(13,148,136,0.15)', background: '#F0FDFA',
                      fontSize: '14px', color: '#1A2E35', fontWeight: 500,
                      cursor: 'pointer', outline: 'none',
                    }}
                  >
                    {Object.entries(SETTINGS).map(([k, v]) => (
                      <option key={k} value={k}>{v.emoji} {v.label}</option>
                    ))}
                  </select>
                </div>

                {/* Experience */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>
                    <TrendingUp size={16} style={{ color: '#0D9488' }} /> Experience Level
                  </label>
                  <select
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    id="salary-experience-select"
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: '12px',
                      border: '2px solid rgba(13,148,136,0.15)', background: '#F0FDFA',
                      fontSize: '14px', color: '#1A2E35', fontWeight: 500,
                      cursor: 'pointer', outline: 'none',
                    }}
                  >
                    {Object.entries(EXPERIENCE).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>

                {/* Certification */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>
                    <Briefcase size={16} style={{ color: '#0D9488' }} /> Specialty Certification
                  </label>
                  <select
                    value={certification}
                    onChange={(e) => setCertification(e.target.value)}
                    id="salary-cert-select"
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: '12px',
                      border: '2px solid rgba(13,148,136,0.15)', background: '#F0FDFA',
                      fontSize: '14px', color: '#1A2E35', fontWeight: 500,
                      cursor: 'pointer', outline: 'none',
                    }}
                  >
                    {Object.entries(CERTIFICATIONS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Breakdown Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginTop: '20px' }}>
              {[
                { label: 'Annual Low', value: formatCurrency(salary.low), color: '#7A6A62' },
                { label: 'Annual Est.', value: formatCurrency(salary.estimated), color: '#0D9488' },
                { label: 'Annual High', value: formatCurrency(salary.high), color: '#1A2E35' },
                { label: 'Hourly Rate', value: `${formatCurrency(salary.hourly)}/hr`, color: '#E86C2C' },
              ].map((item) => (
                <div key={item.label} className="sc-card" style={{ ...clayCard, padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#7A6A62', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>{item.label}</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Result Card */}
          <div>
            <div className="sc-result-card" style={{
              ...clayCard, padding: '32px', textAlign: 'center',
              background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
              border: '2px solid rgba(13,148,136,0.15)',
            }}>
              <DollarSign size={32} style={{ color: '#0D9488', margin: '0 auto 12px' }} />
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>
                Estimated Annual Salary
              </p>
              <div style={{ fontSize: '48px', fontWeight: 800, color: '#1A2E35', lineHeight: 1.1 }}>
                {formatCurrency(salary.estimated)}
              </div>
              <p style={{ fontSize: '14px', color: '#0D9488', marginTop: '8px', fontWeight: 500 }}>
                {formatCurrency(salary.monthly)}/month
              </p>
              <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.6)', borderRadius: '12px' }}>
                <div style={{ fontSize: '12px', color: '#5A4A42', lineHeight: 1.6 }}>
                  <strong>{STATE_DATA[state].label}</strong> • {SETTINGS[setting].label}
                  <br />
                  {EXPERIENCE[experience].label}
                  {certification !== 'none' && <><br />{CERTIFICATIONS[certification].label}</>}
                </div>
              </div>
              <p style={{ fontSize: '10px', color: '#7A6A62', marginTop: '16px', lineHeight: 1.5 }}>
                Range: {formatCurrency(salary.low)} – {formatCurrency(salary.high)}
              </p>
            </div>

            {/* CTA */}
            <div className="sc-card" style={{ ...clayCard, padding: '24px', marginTop: '16px', textAlign: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: '0 0 8px' }}>Ready to Earn This?</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', marginBottom: '16px' }}>Browse matching jobs in {STATE_DATA[state].label}</p>
              <Link
                href={state !== 'national' ? `/jobs/state/${state}` : '/jobs'}
                className="sc-cta"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
                  background: '#0D9488', color: '#fff', textDecoration: 'none',
                  boxShadow: '4px 4px 12px rgba(13,148,136,0.2)',
                }}
              >
                Browse Jobs <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* SALARY TABLE */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 48px' }}>
        <div style={{ ...clayCard, padding: '32px', overflow: 'auto' }}>
          <h2 className="font-lora" style={{ fontSize: '24px', fontWeight: 700, color: '#1A2E35', marginBottom: '20px' }}>
            PMHNP Salary by Setting ({new Date().getFullYear()})
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#7A6A62', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Setting</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', color: '#7A6A62', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Entry</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', color: '#7A6A62', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Mid-Career</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', color: '#7A6A62', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Senior</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(SETTINGS).map(([, s], idx) => (
                <tr key={s.label} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1A2E35' }}>{s.emoji} {s.label}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#5A4A42' }}>{formatCurrency(Math.round(125000 * s.multiplier / 1000) * 1000)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#1A2E35', fontWeight: 600 }}>{formatCurrency(Math.round(158000 * s.multiplier / 1000) * 1000)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#0D9488', fontWeight: 700 }}>{formatCurrency(Math.round(195000 * s.multiplier / 1000) * 1000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* EXPLORE MORE */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 48px' }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { href: '/salary-guide', label: 'Full Salary Guide', sub: '2026 data', color: '#0D9488' },
            { href: '/jobs/remote', label: 'Remote Jobs', sub: 'Telehealth roles', color: '#3B82F6' },
            { href: '/jobs/private-practice', label: 'Private Practice', sub: 'Top earners', color: '#E86C2C' },
            { href: '/blog/pmhnp-salary-negotiation', label: 'Negotiation Tips', sub: 'Get paid more', color: '#8B5CF6' },
          ].map(link => (
            <Link key={link.href} href={link.href} className="sc-card" style={{ ...clayCard, padding: '20px', textDecoration: 'none', textAlign: 'center', display: 'block' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', display: 'block', marginBottom: '4px' }}>{link.label}</span>
              <span style={{ fontSize: '12px', color: link.color, fontWeight: 600 }}>{link.sub}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 64px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>FAQ</p>
        <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '32px' }}>
          Salary Calculator Questions
        </h2>
        <div style={{ display: 'grid', gap: '16px', maxWidth: '800px', margin: '0 auto' }}>
          {faqs.map((faq, idx) => (
            <div key={idx} className="sc-card" style={{ ...clayCard, padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>{faq.q}</h3>
              <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: 0 }}>{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      <style>{`
        .sc-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .sc-card:hover { transform: translateY(-3px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        .sc-cta { transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease; }
        .sc-cta:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(13,148,136,0.35) !important; filter: brightness(1.05); }
        .sc-result-card { transition: transform 0.3s ease; }
        select:focus { border-color: #0D9488 !important; box-shadow: 0 0 0 3px rgba(13,148,136,0.1); }
      `}</style>
    </>
  );
}
