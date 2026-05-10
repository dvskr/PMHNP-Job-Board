import { brand } from '@/config/brand';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import type { Metadata } from 'next';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';

export const revalidate = 3600; // ISR: revalidate every hour

export const metadata: Metadata = {
  title: 'PMHNP Employers — Companies Hiring Psychiatric Nurse Practitioners',
  description:
    'Browse companies actively hiring PMHNPs. See open positions, salary data, and apply directly. Updated daily with 3,000+ employers across all 50 states.',
  openGraph: {
    title: 'Companies Hiring PMHNPs — PMHNP Hiring',
    description: 'Explore employers with open psychiatric nurse practitioner positions.',
    url: 'https://pmhnphiring.com/companies',
    type: 'website',
    siteName: 'PMHNP Hiring',
    images: [{
      url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-employer-hiring-solutions.webp',
      width: 1280,
      height: 900,
      alt: 'Companies hiring PMHNPs',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Companies Hiring PMHNPs',
    description: 'Browse 3,000+ employers actively hiring psychiatric nurse practitioners.',
    images: ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-employer-hiring-solutions.webp'],
  },
  alternates: {
    canonical: `${brand.baseUrl}/companies`,
  },
};

/* ─── Claymorphism tokens ─── */
const clayCard: React.CSSProperties = {
  backgroundColor: '#FAFBF9',
  border: '1px solid rgba(255,255,255,0.7)',
  borderRadius: '22px',
  padding: '24px',
  boxShadow:
    '8px 8px 20px rgba(0,0,0,0.06), ' +
    '-6px -6px 16px rgba(255,255,255,0.9), ' +
    'inset 3px 3px 6px rgba(255,255,255,0.7), ' +
    'inset -2px -2px 4px rgba(0,0,0,0.03)',
  transition: 'transform 0.2s, box-shadow 0.2s',
};

export default async function CompaniesIndexPage() {
  const companies = await prisma.company.findMany({
    where: {
      jobs: {
        some: {
          isPublished: true,
        },
      },
    },
    select: {
      id: true,
      name: true,
      normalizedName: true,
      logoUrl: true,
      isVerified: true,
      _count: {
        select: {
          jobs: {
            where: { isPublished: true },
          },
        },
      },
    },
    orderBy: {
      jobCount: 'desc',
    },
    take: 200,
  });

  const totalCompanies = companies.length;

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://pmhnphiring.com' },
          { name: 'Companies', url: 'https://pmhnphiring.com/companies' },
        ]}
      />

      <div className="min-h-screen" style={{ background: '#FDFBF7' }}>
        {/* Hero */}
        <section
          style={{
            background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
            padding: '64px 24px 48px',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#0D9488',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              marginBottom: '8px',
            }}
          >
            Employers
          </p>
          <h1
            className="font-lora"
            style={{
              fontSize: 'clamp(28px, 4vw, 42px)',
              fontWeight: 700,
              color: '#1A2E35',
              marginBottom: '12px',
            }}
          >
            Companies Hiring PMHNPs
          </h1>
          <p style={{ fontSize: '16px', color: '#5A4A42', maxWidth: '560px', margin: '0 auto', lineHeight: 1.6 }}>
            {totalCompanies} employers with active psychiatric nurse practitioner positions. Browse by company, see open roles, and apply directly.
          </p>
        </section>

        {/* Editorial intro — adds substantive prose so the page isn't just
            a card grid (audit 15 thin-pages CRITICAL). Explains who shows
            up here, why they made the list, and what a candidate should
            consider when evaluating an employer for PMHNP work. */}
        <section style={{ maxWidth: '760px', margin: '0 auto', padding: '32px 24px 0' }}>
          <div style={{ fontSize: '15px', color: '#3D3530', lineHeight: 1.75 }}>
            <p style={{ marginBottom: '16px' }}>
              Every employer below has at least one currently published PMHNP role on
              PMHNP Hiring. The list is a mix of <strong>direct employers</strong> —
              health systems, community mental health centers (CMHCs), Federally
              Qualified Health Centers (FQHCs), VA medical centers, telehealth
              platforms, and private practices — alongside <strong>staffing agencies</strong>{' '}
              that place PMHNPs into locum and travel assignments. We pull active
              postings from each employer&apos;s career pages and ATS feeds twice
              daily, so the company list reflects who is genuinely hiring now, not
              a static directory.
            </p>
            <p style={{ marginBottom: '16px' }}>
              When evaluating a PMHNP employer, the questions that matter most are
              practical: <strong>practice authority</strong> in the states they hire
              for (full vs. reduced vs. restricted, plus Nurse Licensure Compact
              membership), <strong>caseload structure</strong> (15-minute med checks
              vs. 30-60 minute integrated visits), <strong>productivity expectations</strong>{' '}
              (RVU targets, pace), <strong>collaborative-physician requirements</strong>{' '}
              if your state needs them, and what they cover on{' '}
              <strong>malpractice, CME, and EMR/billing infrastructure</strong>.
              Larger health systems and federal employers (VA, IHS) tend to
              standardize these; private practices and telehealth startups vary
              widely.
            </p>
            <p style={{ marginBottom: 0 }}>
              Compensation patterns differ by employer type too. VA roles bundle
              federal pension + EDRP loan repayment up to $200K; FQHCs and CMHCs
              qualify for NHSC repayment; telehealth platforms typically offer the
              highest hourly rates but no benefits; hospital systems offer signing
              bonuses + relocation. Open one of the listings below to see specific
              roles, compensation ranges, and apply paths for that employer.
            </p>
          </div>
        </section>

        {/* Grid */}
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px 64px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {companies.map((company) => {
              const activeJobs = company._count.jobs;
              if (activeJobs === 0) return null;

              return (
                <Link
                  key={company.id}
                  href={`/companies/${company.normalizedName}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div
                    style={{
                      ...clayCard,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      cursor: 'pointer',
                    }}
                    className="company-card"
                  >
                    {/* Logo */}
                    <div
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '14px',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '22px',
                        fontWeight: 800,
                        color: '#fff',
                        background: company.logoUrl
                          ? `url(${company.logoUrl}) center/cover no-repeat`
                          : 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                        boxShadow:
                          'inset 2px 2px 4px rgba(255,255,255,0.3), inset -1px -1px 3px rgba(0,0,0,0.08)',
                      }}
                    >
                      {!company.logoUrl && company.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span
                          style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            color: '#1A2E35',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {company.name}
                        </span>
                        {company.isVerified && (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 20 20"
                            fill="#3B82F6"
                            style={{ flexShrink: 0 }}
                          >
                            <path
                              fillRule="evenodd"
                              d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#0D9488',
                        }}
                      >
                        {activeJobs} open {activeJobs === 1 ? 'position' : 'positions'}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Browse all jobs CTA */}
          <div style={{ textAlign: 'center', marginTop: '48px' }}>
            <Link
              href="/jobs"
              style={{
                padding: '14px 32px',
                borderRadius: '16px',
                fontWeight: 700,
                fontSize: '15px',
                background: 'linear-gradient(145deg, #0D9488, #0F766E)',
                color: '#fff',
                textDecoration: 'none',
                display: 'inline-block',
                boxShadow:
                  '4px 4px 12px rgba(13,148,136,0.25), -2px -2px 6px rgba(255,255,255,0.3)',
              }}
            >
              Browse All PMHNP Jobs
            </Link>
          </div>
        </section>
      </div>

      {/* Hover styles */}
      <style>{`
        .company-card:hover {
          transform: translateY(-4px) !important;
          box-shadow: 12px 12px 28px rgba(0,0,0,0.1), -8px -8px 20px rgba(255,255,255,0.95), inset 3px 3px 6px rgba(255,255,255,0.7), inset -2px -2px 4px rgba(0,0,0,0.03) !important;
        }
      `}</style>
    </>
  );
}
