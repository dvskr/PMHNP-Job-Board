'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

/* ──────────────────────────────────────────────
 *  SidebarVisualCards
 *  Two clay cards with 3D diorama illustrations:
 *  A) PMHNP Career Pulse  — industry stats
 *  C) Application Tips    — contextual advice
 * ────────────────────────────────────────────── */

/* ── Clay card wrapper ── */
const clayShadow = '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)';
const clayPebbleShadow = '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)';

/* ── Stat Pebble ── */
function StatPebble({ emoji, value, label, color }: { emoji: string; value: string; label: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 14px', borderRadius: '16px',
      backgroundColor: '#F0FAF8',
      border: '1px solid rgba(255,255,255,0.5)',
      boxShadow: clayPebbleShadow,
      transition: 'all 0.2s ease',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 10,
        backgroundColor: color,
        boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.04), 2px 2px 4px rgba(0,0,0,0.06)',
        border: '1px solid rgba(255,255,255,0.6)',
        fontSize: '14px',
      }}>{emoji}</span>
      <div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1F2937', lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: '11px', fontWeight: 500, color: '#6B7280', lineHeight: 1.3 }}>{label}</div>
      </div>
    </div>
  );
}

/* ── Tip Pill ── */
function TipPill({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      padding: '10px 14px', borderRadius: '14px',
      backgroundColor: '#F7FBF8',
      border: '1px solid rgba(255,255,255,0.5)',
      boxShadow: clayPebbleShadow,
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 8, flexShrink: 0,
        backgroundColor: '#E6FAF8',
        boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.04), 2px 2px 4px rgba(0,0,0,0.05)',
        border: '1px solid rgba(255,255,255,0.6)',
        fontSize: '12px',
      }}>{icon}</span>
      <p style={{ fontSize: '12.5px', lineHeight: 1.55, color: '#374151', margin: 0, fontWeight: 500 }}>{text}</p>
    </div>
  );
}

/* ── Helper: pick tips based on job attributes ── */
function getTips(props: {
  isRemote?: boolean;
  isTelehealth?: boolean;
  jobType?: string | null;
  mode?: string | null;
  isNewGrad?: boolean;
}) {
  const tips: { icon: string; text: string }[] = [];

  if (props.isRemote || props.isTelehealth) {
    tips.push({ icon: '🖥️', text: 'Highlight telehealth platform experience (Zoom, Doxy.me) and any virtual prescribing workflows.' });
  }
  if (props.mode?.toLowerCase().includes('contract') || props.jobType?.toLowerCase().includes('contract')) {
    tips.push({ icon: '📋', text: 'Mention your malpractice insurance status and willingness to credential with new payers.' });
  }
  if (props.jobType?.toLowerCase().includes('full-time')) {
    tips.push({ icon: '🏥', text: 'Ask about supervision ratios, patient panel size, and caseload expectations in your interview.' });
  }
  if (props.isNewGrad) {
    tips.push({ icon: '🎓', text: 'Emphasize clinical rotation hours and any specialty electives in psych settings.' });
  }

  // Defaults
  if (tips.length < 3) {
    const defaults = [
      { icon: '✨', text: 'Tailor your cover letter to mention the specific patient population this role serves.' },
      { icon: '📄', text: 'Include your NPI number, active license states, and DEA registration on your resume.' },
      { icon: '💬', text: 'Prepare 2-3 clinical case examples that show your diagnostic reasoning skills.' },
    ];
    for (const d of defaults) {
      if (tips.length >= 3) break;
      if (!tips.some(t => t.icon === d.icon)) tips.push(d);
    }
  }

  return tips.slice(0, 3);
}

/* ──────────────────────────────────────────────
 *  A) Career Pulse Card
 * ────────────────────────────────────────────── */
export function CareerPulseCard() {
  return (
    <div style={{
      backgroundColor: '#F7FBF8',
      borderRadius: '22px',
      border: '1px solid rgba(255,255,255,0.6)',
      boxShadow: clayShadow,
      padding: '0',
      overflow: 'hidden',
    }}>
      {/* Illustration — edge-to-edge, lavender mood */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '160px',
        backgroundColor: '#F0E6FA',
        overflow: 'hidden',
      }}>
        <Image
          src="/illustrations/vector-career-pulse.png"
          alt="PMHNP Career Growth"
          fill
          style={{ objectFit: 'cover' }}
        />
      </div>

      {/* Content */}
      <div style={{ padding: '18px 20px 20px' }}>
        <h3 style={{
          fontSize: '14px',
          fontWeight: 700,
          fontFamily: 'var(--font-lora), Georgia, serif',
          color: '#1F2937',
          margin: '0 0 4px',
          letterSpacing: '-0.01em',
        }}>
          PMHNP Career Pulse
        </h3>
        <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 14px', lineHeight: 1.4 }}>
          Why now is the best time to be a Psychiatric NP
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <StatPebble emoji="📈" value="43%" label="Projected growth 2024-2034" color="#D5F5F1" />
          <StatPebble emoji="💰" value="$160K+" label="Median annual salary" color="#FDE68A" />
          <StatPebble emoji="🏥" value="2,400+" label="Active openings nationwide" color="#BFDBFE" />
        </div>

        <Link href="/salary-guide" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          marginTop: '14px',
          padding: '9px 16px', borderRadius: '14px',
          fontSize: '13px', fontWeight: 600,
          color: '#0F766E',
          backgroundColor: '#E6FAF8',
          border: '1px solid rgba(255,255,255,0.5)',
          boxShadow: clayPebbleShadow,
          textDecoration: 'none',
          transition: 'all 0.2s ease',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.backgroundColor = '#CCFBF1'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.backgroundColor = '#E6FAF8'; }}
        >
          Explore Salary Guide →
        </Link>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
 *  C) Application Tips Card
 * ────────────────────────────────────────────── */
export function ApplicationTipsCard({
  isRemote,
  isTelehealth,
  jobType,
  mode,
}: {
  isRemote?: boolean;
  isTelehealth?: boolean;
  jobType?: string | null;
  mode?: string | null;
}) {
  const tips = getTips({ isRemote, isTelehealth, jobType, mode });

  return (
    <div style={{
      backgroundColor: '#F7FBF8',
      borderRadius: '22px',
      border: '1px solid rgba(255,255,255,0.6)',
      boxShadow: clayShadow,
      padding: '0',
      overflow: 'hidden',
    }}>
      {/* Illustration — edge-to-edge, warm peach mood */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '160px',
        backgroundColor: '#FFF5EE',
        overflow: 'hidden',
      }}>
        <Image
          src="/illustrations/vector-pro-tips.png"
          alt="Application Tips"
          fill
          style={{ objectFit: 'cover' }}
        />
      </div>

      {/* Content */}
      <div style={{ padding: '18px 20px 20px' }}>
        <h3 style={{
          fontSize: '14px',
          fontWeight: 700,
          fontFamily: 'var(--font-lora), Georgia, serif',
          color: '#1F2937',
          margin: '0 0 4px',
        }}>
          Pro Tips for This Role
        </h3>
        <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 14px', lineHeight: 1.4 }}>
          Stand out with these targeted suggestions
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tips.map((tip, i) => (
            <TipPill key={i} icon={tip.icon} text={tip.text} />
          ))}
        </div>
      </div>
    </div>
  );
}
