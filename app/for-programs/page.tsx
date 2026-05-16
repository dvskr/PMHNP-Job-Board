import { brand } from '@/config/brand'
import { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import ProgramEmbedBuilder from '@/components/ProgramEmbedBuilder'
import { prisma } from '@/lib/prisma'
import {
  ArrowRight,
  GraduationCap,
  Building2,
  FileBarChart2,
  Sparkles,
  Mail,
  Check,
  Code2,
  Layout,
  Globe,
} from 'lucide-react'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'For Program Directors — Free PMHNP Jobs Widget | PMHNP Hiring',
  description:
    'Help your PMHNP students land their first job. Free embeddable jobs widget for your career services page, quarterly placement reports, and AI resume reviewer for graduating seniors.',
  alternates: { canonical: `${brand.baseUrl}/for-programs` },
}

/* ═══ Design Tokens — matched to /for-employers ═══ */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow:
    '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
}

const CONTACT_EMAIL = 'hello@pmhnphiring.com'
const CONTACT_SUBJECT = encodeURIComponent('PMHNP Hiring widget for our program')
const CONTACT_BODY = encodeURIComponent(
  `Hi Sathish,\n\nI'm the program director (or coordinator) at <UNIVERSITY> in <STATE>. I'd like to learn more about the free PMHNP jobs widget for our career services page.\n\nA couple of times that work for a 15-minute chat:\n  • <DAY/TIME 1>\n  • <DAY/TIME 2>\n  • <DAY/TIME 3>\n\nThanks,\n<NAME>\n<TITLE, PROGRAM>`,
)
const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${CONTACT_SUBJECT}&body=${CONTACT_BODY}`

async function getProgramsStats() {
  try {
    const [totalJobs, stateRows, subscribers] = await Promise.all([
      prisma.job.count({
        where: {
          isPublished: true,
          isManuallyUnpublished: false,
          archivedAt: null,
        },
      }),
      prisma.job.groupBy({
        by: ['stateCode'],
        where: {
          isPublished: true,
          isManuallyUnpublished: false,
          archivedAt: null,
          stateCode: { not: null },
        },
      }),
      prisma.emailLead.count({ where: { isSubscribed: true } }),
    ])
    return {
      totalJobs,
      statesCovered: stateRows.length,
      subscribers,
    }
  } catch {
    return { totalJobs: 0, statesCovered: 0, subscribers: 0 }
  }
}

export default async function ForProgramsPage() {
  const stats = await getProgramsStats()
  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: brand.baseUrl },
          { name: 'For Program Directors', url: `${brand.baseUrl}/for-programs` },
        ]}
      />

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1: HERO + STATS
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ background: '#F0BFB5', padding: '64px 0 56px' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 24px' }}>
          <div
            className="emp-hero-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '1.15fr 0.85fr',
              gap: '40px',
              alignItems: 'center',
            }}
          >
            {/* Left — Text */}
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(255,255,255,0.55)',
                  color: '#5A4A3A',
                  padding: '7px 14px',
                  borderRadius: '999px',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '20px',
                  border: '1px solid rgba(255,255,255,0.6)',
                  boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.6)',
                }}
              >
                <GraduationCap size={15} strokeWidth={2.25} />
                For PMHNP Program Directors
              </div>

              <h1
                className="font-lora"
                style={{
                  fontSize: 'clamp(32px, 4.2vw, 48px)',
                  fontWeight: 800,
                  lineHeight: 1.08,
                  color: '#1A2E35',
                  margin: '0 0 20px',
                }}
              >
                Help Your PMHNP Students<br />
                Land Their{' '}
                <span style={{ color: '#0D9488' }}>First Role</span>
              </h1>

              <p
                style={{
                  fontSize: '16.5px',
                  color: '#3D2E26',
                  lineHeight: 1.75,
                  margin: '0 0 36px',
                  maxWidth: '480px',
                  fontWeight: 400,
                }}
              >
                Three free tools for accredited PMHNP programs — an
                embeddable jobs widget for your career services page,
                quarterly placement reports for accreditation, and an AI
                resume reviewer for your graduating seniors.
              </p>

              <div
                style={{
                  display: 'flex',
                  gap: '14px',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <a
                  href={MAILTO}
                  className="clay-btn"
                  style={{
                    padding: '16px 30px',
                    borderRadius: '16px',
                    fontWeight: 700,
                    fontSize: '15px',
                    background: '#0D9488',
                    color: '#fff',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  Email Us To Get Started <ArrowRight size={17} />
                </a>
                <a
                  href="#offer"
                  className="clay-btn"
                  style={{
                    padding: '16px 30px',
                    borderRadius: '16px',
                    fontWeight: 600,
                    fontSize: '15px',
                    background: '#FFFFFF',
                    color: '#1A2E35',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: '1px solid rgba(0,0,0,0.06)',
                  }}
                >
                  See What You Get
                </a>
              </div>
            </div>

            {/* Right — Pictogram (CSS-only "diploma + job board" composition) */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: '440px',
                  aspectRatio: '1 / 1',
                  position: 'relative',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {/* Back layer — soft cream halo */}
                <div
                  style={{
                    position: 'absolute',
                    inset: '10%',
                    background:
                      'radial-gradient(circle at 50% 45%, #FFF8EE 0%, rgba(255,248,238,0) 70%)',
                    borderRadius: '50%',
                  }}
                />
                {/* Diploma card */}
                <div
                  style={{
                    ...clayCard,
                    position: 'absolute',
                    top: '12%',
                    left: '8%',
                    width: '64%',
                    padding: '22px 22px 18px',
                    transform: 'rotate(-6deg)',
                  }}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#0D9488',
                      marginBottom: '10px',
                    }}
                  >
                    <GraduationCap size={14} strokeWidth={2.5} /> Diploma
                  </div>
                  <div
                    style={{
                      fontSize: '14.5px',
                      fontWeight: 800,
                      color: '#1A2E35',
                      marginBottom: '4px',
                      fontFamily: "'Lora', serif",
                    }}
                  >
                    Maya Carter, MSN
                  </div>
                  <div
                    style={{
                      fontSize: '11.5px',
                      color: '#7A6A62',
                      marginBottom: '14px',
                    }}
                  >
                    Psychiatric Mental Health Nurse Practitioner
                  </div>
                  <div
                    style={{
                      height: '6px',
                      background: 'linear-gradient(90deg, #FFE0D3, #F0BFB5)',
                      borderRadius: '999px',
                    }}
                  />
                </div>

                {/* Job offer card */}
                <div
                  style={{
                    ...clayCard,
                    position: 'absolute',
                    bottom: '12%',
                    right: '6%',
                    width: '66%',
                    padding: '18px 18px 16px',
                    transform: 'rotate(4deg)',
                    background:
                      'linear-gradient(145deg, #F0FDFA 0%, #FFFFFF 70%)',
                  }}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: '#0D9488',
                      marginBottom: '8px',
                    }}
                  >
                    <Sparkles size={13} strokeWidth={2.5} /> Offer
                  </div>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 800,
                      color: '#1A2E35',
                      marginBottom: '4px',
                    }}
                  >
                    Outpatient PMHNP
                  </div>
                  <div
                    style={{
                      fontSize: '11.5px',
                      color: '#7A6A62',
                      marginBottom: '10px',
                    }}
                  >
                    Telehealth · Full-time · $148k–$172k
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#065F46',
                      background: '#D4F5E9',
                      padding: '4px 10px',
                      borderRadius: '999px',
                    }}
                  >
                    <Check size={12} strokeWidth={3} /> Hired
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stat pills */}
          <div
            className="emp-stats-grid"
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '14px',
              flexWrap: 'wrap',
              marginTop: '48px',
            }}
          >
            {[
              {
                value: fmt(stats.totalJobs),
                label: 'Active PMHNP Roles',
                icon: Building2,
                bg: '#D4F5E9',
                iconBg: '#34D399',
                color: '#065F46',
                suffix: '+',
              },
              {
                value: String(stats.statesCovered),
                label: 'States Covered',
                icon: FileBarChart2,
                bg: '#FFE0D3',
                iconBg: '#F97316',
                color: '#7C2D12',
                suffix: '',
              },
              {
                value: fmt(stats.subscribers),
                label: 'PMHNPs in Network',
                icon: GraduationCap,
                bg: '#E8DAFE',
                iconBg: '#A855F7',
                color: '#4C1D95',
                suffix: '+',
              },
            ].map((s) => {
              const SIcon = s.icon
              return (
                <div
                  key={s.label}
                  className="emp-stat-pill"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 20px 10px 10px',
                    borderRadius: '40px',
                    background: s.bg,
                    boxShadow:
                      '4px 4px 12px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.6), inset 1px 1px 2px rgba(255,255,255,0.5)',
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: s.iconBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow:
                        '2px 2px 6px rgba(0,0,0,0.1), inset 1px 1px 2px rgba(255,255,255,0.3)',
                    }}
                  >
                    <SIcon size={16} color="#fff" />
                  </div>
                  <div>
                    <span
                      style={{
                        fontSize: '18px',
                        fontWeight: 800,
                        color: s.color,
                        lineHeight: 1,
                      }}
                    >
                      {s.value}
                      {s.suffix}
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        color: s.color,
                        opacity: 0.7,
                        marginLeft: '6px',
                        fontWeight: 500,
                      }}
                    >
                      {s.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 2: BENTO — WHAT YOU GET
          ═══════════════════════════════════════════════════════════════ */}
      <div
        id="offer"
        style={{
          background:
            'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)',
        }}
      >
        <section
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            padding: '80px 20px 56px',
          }}
        >
          <p
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#E86C2C',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              textAlign: 'center',
              marginBottom: '8px',
            }}
          >
            Free For Accredited Programs
          </p>
          <h2
            className="font-lora"
            style={{
              fontSize: 'clamp(26px, 3.5vw, 38px)',
              fontWeight: 700,
              color: '#1A2E35',
              textAlign: 'center',
              marginBottom: '8px',
            }}
          >
            Three Tools, Zero Cost
          </h2>
          <p
            style={{
              fontSize: '15px',
              color: '#5A4A42',
              textAlign: 'center',
              maxWidth: '520px',
              margin: '0 auto 48px',
              lineHeight: 1.6,
            }}
          >
            No fees, no student data shared with us, no contract.
            Designed for accredited PMHNP programs.
          </p>

          <div
            className="bento-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(12, 1fr)',
              gap: '14px',
            }}
          >
            {/* HERO BENTO — Widget (8 cols, split) */}
            <div
              className="bento-hero-1 emp-bento-card"
              style={{
                ...clayCard,
                gridColumn: 'span 8',
                padding: '0',
                overflow: 'hidden',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                alignItems: 'center',
              }}
            >
              <div style={{ padding: '32px 28px' }}>
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '16px',
                    boxShadow:
                      '3px 3px 8px rgba(0,0,0,0.05), inset 1px 1px 2px rgba(255,255,255,0.6)',
                  }}
                >
                  <Building2 size={22} color="#0D9488" strokeWidth={2.25} />
                </div>
                <h3
                  className="font-lora"
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    color: '#1A2E35',
                    margin: '0 0 8px',
                  }}
                >
                  Embeddable Jobs Widget
                </h3>
                <p
                  style={{
                    fontSize: '14px',
                    color: '#5A4A42',
                    margin: '0 0 14px',
                    lineHeight: 1.6,
                  }}
                >
                  One line of HTML on your career services page. Shows
                  the latest PMHNP roles in your state, refreshes daily,
                  co-branded with your program.
                </p>
                <a
                  href="#demo"
                  style={{
                    color: '#0D9488',
                    fontSize: '13px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  See the live demo <ArrowRight size={14} />
                </a>
              </div>
              <div
                style={{
                  height: '100%',
                  background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
                  padding: '24px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    ...clayCard,
                    width: '100%',
                    maxWidth: '260px',
                    padding: '14px 14px 12px',
                    background: '#FFFFFF',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#0D9488',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginBottom: '8px',
                    }}
                  >
                    Latest PMHNP Jobs
                  </div>
                  {[
                    { t: 'Outpatient PMHNP — Telehealth', c: '#1A2E35' },
                    { t: 'Inpatient PMHNP — UCSF Med Cntr', c: '#1A2E35' },
                    { t: 'TMS NP — Bay Area Mental Health', c: '#1A2E35' },
                  ].map((row, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: '12px',
                        color: row.c,
                        padding: '7px 0',
                        borderBottom:
                          i < 2 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                      }}
                    >
                      {row.t}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* TALL BENTO — Placement Report (4 cols) */}
            <div
              className="bento-hero-2 emp-bento-card"
              style={{
                ...clayCard,
                gridColumn: 'span 4',
                padding: '0',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  flex: '0 0 auto',
                  background: 'linear-gradient(145deg, #FFFBEB, #FEF3C7)',
                  padding: '20px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    ...clayCard,
                    width: '100%',
                    maxWidth: '180px',
                    padding: '14px 12px 10px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#B45309',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginBottom: '8px',
                    }}
                  >
                    Q2 Placement Report
                  </div>
                  {[
                    { l: 'Outpatient', v: '42%', bg: '#0D9488' },
                    { l: 'Telehealth', v: '28%', bg: '#34D399' },
                    { l: 'Inpatient', v: '18%', bg: '#F97316' },
                    { l: 'Other', v: '12%', bg: '#94A3B8' },
                  ].map((row) => (
                    <div
                      key={row.l}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#5A4A42',
                          width: '64px',
                        }}
                      >
                        {row.l}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: '6px',
                          background: 'rgba(0,0,0,0.05)',
                          borderRadius: '999px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: row.v,
                            height: '100%',
                            background: row.bg,
                            borderRadius: '999px',
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#1A2E35',
                          width: '26px',
                          textAlign: 'right',
                        }}
                      >
                        {row.v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: '24px 22px', flex: 1 }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'linear-gradient(145deg, #FFFBEB, #FEF3C7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '12px',
                    boxShadow:
                      '3px 3px 8px rgba(0,0,0,0.05), inset 1px 1px 2px rgba(255,255,255,0.6)',
                  }}
                >
                  <FileBarChart2
                    size={20}
                    color="#B45309"
                    strokeWidth={2.25}
                  />
                </div>
                <h3
                  className="font-lora"
                  style={{
                    fontSize: '17px',
                    fontWeight: 800,
                    color: '#1A2E35',
                    margin: '0 0 6px',
                  }}
                >
                  Quarterly Placement Report
                </h3>
                <p
                  style={{
                    fontSize: '12.5px',
                    color: '#7A6A62',
                    margin: 0,
                    lineHeight: 1.55,
                  }}
                >
                  PDF for your accreditation file — settings, salaries,
                  and employer types in your state.
                </p>
              </div>
            </div>

            {/* WIDE BENTO — Resume Reviewer (8 cols) */}
            <div
              className="bento-hero-3 emp-bento-card"
              style={{
                ...clayCard,
                gridColumn: 'span 8',
                padding: '0',
                overflow: 'hidden',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                alignItems: 'center',
              }}
            >
              <div style={{ padding: '32px 28px' }}>
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    background: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '16px',
                    boxShadow:
                      '3px 3px 8px rgba(0,0,0,0.05), inset 1px 1px 2px rgba(255,255,255,0.6)',
                  }}
                >
                  <Sparkles size={22} color="#E86C2C" strokeWidth={2.25} />
                </div>
                <h3
                  className="font-lora"
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    color: '#1A2E35',
                    margin: '0 0 8px',
                  }}
                >
                  AI Resume Reviewer
                </h3>
                <p
                  style={{
                    fontSize: '14px',
                    color: '#5A4A42',
                    margin: 0,
                    lineHeight: 1.6,
                  }}
                >
                  A co-branded link your seniors can use to get instant
                  feedback on their resume before their first PMHNP
                  interview. Resumes are never stored.
                </p>
              </div>
              <div
                style={{
                  height: '100%',
                  background: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)',
                  padding: '24px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    ...clayCard,
                    width: '100%',
                    maxWidth: '260px',
                    padding: '14px 14px 12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'center',
                      marginBottom: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: '#E86C2C',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '13px',
                      }}
                    >
                      A+
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 800,
                          color: '#1A2E35',
                          lineHeight: 1.2,
                        }}
                      >
                        Resume Score
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#7A6A62',
                        }}
                      >
                        Excellent · 92 / 100
                      </div>
                    </div>
                  </div>
                  {[
                    'Add 1 outcome metric',
                    'Highlight PMHNP-specific skills',
                    'Reorder clinical rotations',
                  ].map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        color: '#5A4A42',
                        padding: '4px 0',
                      }}
                    >
                      <Check
                        size={12}
                        strokeWidth={3}
                        style={{ color: '#0D9488', flexShrink: 0 }}
                      />
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* COMPACT BENTO — Co-Branding (4 cols) */}
            <div
              className="emp-bento-card"
              style={{
                ...clayCard,
                gridColumn: 'span 4',
                padding: '28px 22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
                border: '2px solid rgba(13,148,136,0.15)',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                  boxShadow:
                    '3px 3px 8px rgba(13,148,136,0.15), inset 1px 1px 2px rgba(255,255,255,0.6)',
                }}
              >
                <GraduationCap
                  size={20}
                  color="#0D9488"
                  strokeWidth={2.25}
                />
              </div>
              <h3
                className="font-lora"
                style={{
                  fontSize: '17px',
                  fontWeight: 800,
                  color: '#134E4A',
                  margin: '0 0 6px',
                }}
              >
                Co-Branded With Your Program
              </h3>
              <p
                style={{
                  fontSize: '13px',
                  color: '#0D9488',
                  margin: 0,
                  lineHeight: 1.55,
                  fontWeight: 500,
                }}
              >
                Your logo and program name on the widget and reviewer —
                so students recognize it as a service from your school.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3: LIVE DEMO
          ═══════════════════════════════════════════════════════════════ */}
      <section
        id="demo"
        style={{
          background:
            'linear-gradient(180deg, #F1F5F9 0%, #E8EDF2 50%, #F1F5F9 100%)',
          padding: '80px 20px',
        }}
      >
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <p
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#0D9488',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              textAlign: 'center',
              marginBottom: '8px',
            }}
          >
            Live Preview
          </p>
          <h2
            className="font-lora"
            style={{
              fontSize: 'clamp(26px, 3.5vw, 36px)',
              fontWeight: 700,
              color: '#1A2E35',
              textAlign: 'center',
              marginBottom: '8px',
            }}
          >
            See The Widget On A Real Page
          </h2>
          <p
            style={{
              fontSize: '15px',
              color: '#5A4A42',
              textAlign: 'center',
              maxWidth: '560px',
              margin: '0 auto 36px',
              lineHeight: 1.6,
            }}
          >
            Pick your state and name your program — the live preview and
            embed snippet update as you type.
          </p>

          <div style={{ maxWidth: '820px', margin: '0 auto' }}>
            <ProgramEmbedBuilder baseUrl={brand.baseUrl} />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3.5: HOW TO INSTALL
          Comes right after the embed builder so the flow reads:
          "copy your snippet" → "here's where to paste it" → "no
          maintenance, no IT lift".
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ background: '#FFFFFF', padding: '72px 0' }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '0 24px' }}>
          <p
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#0D9488',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              textAlign: 'center',
              marginBottom: '8px',
            }}
          >
            Paste Once, Never Touch Again
          </p>
          <h2
            className="font-lora"
            style={{
              fontSize: 'clamp(26px, 3.5vw, 36px)',
              fontWeight: 700,
              color: '#1A2E35',
              textAlign: 'center',
              marginBottom: '8px',
            }}
          >
            How To Install The Widget
          </h2>
          <p
            style={{
              fontSize: '15px',
              color: '#5A4A42',
              textAlign: 'center',
              maxWidth: '560px',
              margin: '0 auto 40px',
              lineHeight: 1.6,
            }}
          >
            One line of HTML on your career services page. No account,
            no API key, no maintenance. Jobs refresh automatically every
            day from our server.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {[
              {
                icon: Layout,
                accent: '#2563EB',
                bg: '#EFF6FF',
                title: 'WordPress',
                body: 'Edit the career services page → add a "Custom HTML" block → paste the snippet → publish.',
                note: 'Most common at universities. Works on WordPress.com and self-hosted.',
              },
              {
                icon: Globe,
                accent: '#0D9488',
                bg: '#F0FDFA',
                title: 'Drupal / Cascade CMS',
                body: 'Edit the page → insert an "Embed code" or HTML block → switch to source/HTML view → paste.',
                note: 'Used by most state schools and large university systems.',
              },
              {
                icon: Code2,
                accent: '#E86C2C',
                bg: '#FFF7ED',
                title: 'Any other site',
                body: 'Squarespace, Wix, Webflow, Canvas, Blackboard, plain HTML — all support an "Embed" or "Custom Code" block. Paste the snippet in.',
                note: 'If you can paste HTML anywhere on the page, you can install the widget.',
              },
            ].map(({ icon: Icon, accent, bg, title, body, note }) => (
              <div
                key={title}
                className="emp-bento-card"
                style={{
                  ...clayCard,
                  padding: '28px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '14px',
                    background: bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '16px',
                    boxShadow:
                      '3px 3px 8px rgba(0,0,0,0.05), inset 1px 1px 2px rgba(255,255,255,0.6)',
                  }}
                >
                  <Icon size={22} color={accent} strokeWidth={2.25} />
                </div>
                <h3
                  className="font-lora"
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: '#1A2E35',
                    margin: '0 0 8px',
                  }}
                >
                  {title}
                </h3>
                <p
                  style={{
                    fontSize: '13.5px',
                    color: '#5A4A42',
                    margin: '0 0 12px',
                    lineHeight: 1.6,
                  }}
                >
                  {body}
                </p>
                <p
                  style={{
                    fontSize: '12px',
                    color: '#7A6A62',
                    margin: 0,
                    lineHeight: 1.55,
                    fontStyle: 'italic',
                  }}
                >
                  {note}
                </p>
              </div>
            ))}
          </div>

          {/* "Need help?" footer below the three cards. */}
          <div
            style={{
              ...clayCard,
              marginTop: '24px',
              padding: '20px 28px',
              background: 'linear-gradient(135deg, #F0FDFA, #FFFFFF)',
              border: '1px solid rgba(13,148,136,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <p
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#1A2E35',
                  margin: '0 0 2px',
                  fontFamily: "'Lora', serif",
                }}
              >
                Not sure how to install it?
              </p>
              <p
                style={{
                  fontSize: '13px',
                  color: '#5A4A42',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                Forward the snippet to your web admin, or send us your
                career-services URL — we'll install it for you.
              </p>
            </div>
            <a
              href={MAILTO}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '11px 20px',
                borderRadius: '14px',
                background: '#FFFFFF',
                color: '#0D9488',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '13.5px',
                border: '1px solid rgba(13,148,136,0.25)',
                boxShadow:
                  '3px 3px 8px rgba(13,148,136,0.1), -2px -2px 6px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.6)',
                whiteSpace: 'nowrap',
              }}
            >
              <Mail size={14} /> Email us your URL
            </a>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 4: HOW IT WORKS
          ═══════════════════════════════════════════════════════════════ */}
      <div
        style={{
          background:
            'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)',
        }}
      >
        <section
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            padding: '80px 20px',
          }}
        >
          <p
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#E86C2C',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              textAlign: 'center',
              marginBottom: '8px',
            }}
          >
            Three Steps
          </p>
          <h2
            className="font-lora"
            style={{
              fontSize: 'clamp(26px, 3.5vw, 36px)',
              fontWeight: 700,
              color: '#1A2E35',
              textAlign: 'center',
              marginBottom: '48px',
            }}
          >
            How It Works
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            {[
              {
                step: '01',
                title: 'Send us an email',
                body: 'Tell us your university name and state. Two-line reply, no forms.',
                accent: '#0D9488',
                bg: '#F0FDFA',
              },
              {
                step: '02',
                title: 'We send the embed',
                body: 'One line of HTML — give it to your IT team or paste it yourself. Co-branded with your program.',
                accent: '#E86C2C',
                bg: '#FFF7ED',
              },
              {
                step: '03',
                title: 'Students see fresh roles',
                body: 'Daily-refreshed PMHNP roles. We send you a quarterly placement report by email.',
                accent: '#A855F7',
                bg: '#FAF5FF',
              },
            ].map(({ step, title, body, accent, bg }) => (
              <div
                key={step}
                className="emp-bento-card"
                style={{
                  ...clayCard,
                  padding: '28px 24px',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: bg,
                    color: accent,
                    fontWeight: 800,
                    fontSize: '14px',
                    letterSpacing: '0.04em',
                    marginBottom: '14px',
                    boxShadow:
                      '3px 3px 8px rgba(0,0,0,0.05), inset 1px 1px 2px rgba(255,255,255,0.6)',
                  }}
                >
                  {step}
                </div>
                <h3
                  className="font-lora"
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: '#1A2E35',
                    margin: '0 0 8px',
                  }}
                >
                  {title}
                </h3>
                <p
                  style={{
                    fontSize: '13.5px',
                    color: '#5A4A42',
                    margin: 0,
                    lineHeight: 1.6,
                  }}
                >
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 5: FAQ
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ background: '#FFFFFF', padding: '80px 20px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <p
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#0D9488',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              textAlign: 'center',
              marginBottom: '8px',
            }}
          >
            FAQ
          </p>
          <h2
            className="font-lora"
            style={{
              fontSize: 'clamp(26px, 3.5vw, 36px)',
              fontWeight: 700,
              color: '#1A2E35',
              textAlign: 'center',
              marginBottom: '36px',
            }}
          >
            Frequently Asked
          </h2>

          {[
            {
              q: 'Is there a cost to my program?',
              a: 'No. The widget, placement report, and resume reviewer are all free for accredited PMHNP programs. We make money from employers who post jobs.',
            },
            {
              q: 'Do you collect data on our students?',
              a: 'No. The widget is anonymous — we track aggregate clicks on the widget itself, but never tie clicks to individual students. The resume reviewer is opt-in per student and resumes are never stored.',
            },
            {
              q: "What if my IT team can't add an iframe?",
              a: "We can also send you a co-branded link your students can bookmark or you can put in your LMS. Email us and we'll work with you.",
            },
            {
              q: 'How is the placement report compiled?',
              a: 'We aggregate the active PMHNP listings in your state by setting (outpatient, inpatient, telehealth, etc.), salary range, and employer type. After your widget has been live for ~90 days we add cohort-specific data showing where students from your program have been viewing roles.',
            },
            {
              q: 'Can I see another program using the widget?',
              a: 'Yes — once we have a few installs we share live examples on request. Email us.',
            },
          ].map(({ q, a }, i) => (
            <details
              key={i}
              style={{
                ...clayCard,
                marginBottom: '12px',
                padding: '18px 22px',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontWeight: 700,
                  color: '#1A2E35',
                  fontSize: '15.5px',
                  listStyle: 'none',
                  fontFamily: "'Lora', serif",
                }}
              >
                {q}
              </summary>
              <p
                style={{
                  color: '#5A4A42',
                  fontSize: '14px',
                  lineHeight: 1.65,
                  margin: '12px 0 0',
                }}
              >
                {a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 6: FINAL CTA
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ background: '#F0BFB5', padding: '72px 20px' }}>
        <div
          style={{
            maxWidth: '760px',
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <h2
            className="font-lora"
            style={{
              fontSize: 'clamp(28px, 3.5vw, 40px)',
              fontWeight: 800,
              color: '#1A2E35',
              margin: '0 0 12px',
              lineHeight: 1.1,
            }}
          >
            Let's Help Your Students<br />
            <span style={{ color: '#0D9488' }}>Get Hired</span>
          </h2>
          <p
            style={{
              fontSize: '16px',
              color: '#3D2E26',
              margin: '0 0 32px',
              lineHeight: 1.65,
            }}
          >
            Send us a quick email with your program name and a few times
            that work for a 15-minute intro call. We'll come prepared with
            a sample widget for your state.
          </p>
          <a
            href={MAILTO}
            className="clay-btn"
            style={{
              padding: '16px 32px',
              borderRadius: '16px',
              fontWeight: 700,
              fontSize: '15px',
              background: '#0D9488',
              color: '#fff',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <Mail size={16} /> {CONTACT_EMAIL}
          </a>
          <p
            style={{
              color: '#5A4A3A',
              fontSize: '13px',
              margin: '20px 0 0',
            }}
          >
            Or follow us on{' '}
            <Link
              href="/"
              style={{
                color: '#0D9488',
                textDecoration: 'underline',
                fontWeight: 600,
              }}
            >
              pmhnphiring.com
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  )
}
