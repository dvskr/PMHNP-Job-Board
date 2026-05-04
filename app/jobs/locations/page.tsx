import { brand } from '@/config/brand';
import { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, Wifi, TrendingUp, Globe, Video, Plane, GraduationCap, Calendar } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CategoryHero from '@/components/CategoryHero';

// Force dynamic rendering - don't try to statically generate during build
// force-dynamic removed: it overrides revalidate and defeats ISR caching
export const revalidate = 3600; // Revalidate every hour

// Type definitions for Prisma groupBy results
interface StateGroupResult {
  state: string | null;
  stateCode: string | null;
  _count: { state: number };
}

interface CityGroupResult {
  city: string | null;
  state: string | null;
  stateCode: string | null;
  _count: { city: number };
}

// Type definitions for processed/rendered data
interface ProcessedState {
  name: string;
  code: string;
  count: number;
  slug: string;
}

interface ProcessedCity {
  name: string;
  state: string;
  stateCode: string;
  count: number;
  slug: string;
}

/**
 * Fetch job counts by state
 */
async function getLocationStats() {
  // Job counts by state
  const stateData = await prisma.job.groupBy({
    by: ['state', 'stateCode'],
    where: {
      isPublished: true,
      state: { not: null },
    },
    _count: {
      state: true,
    },
    orderBy: {
      _count: {
        state: 'desc',
      },
    },
  });

  // Remote jobs count
  const remoteCount = await prisma.job.count({
    where: {
      isPublished: true,
      isRemote: true,
    },
  });

  // Top cities
  const topCities = await prisma.job.groupBy({
    by: ['city', 'state', 'stateCode'],
    where: {
      isPublished: true,
      city: { not: null },
      state: { not: null },
    },
    _count: {
      city: true,
    },
    orderBy: {
      _count: {
        city: 'desc',
      },
    },
    take: 12,
  });

  // Total jobs
  const totalJobs = await prisma.job.count({
    where: { isPublished: true },
  });

  // Valid US states + DC (whitelist to exclude non-US locations like British Columbia)
  const US_STATES = new Set([
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
    'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
    'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
    'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
    'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
    'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
    'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
    'Wisconsin','Wyoming',
  ]);

  // Process states with explicit typing — filter to US only
  const processedStates = stateData
    .filter((s: StateGroupResult) => s.state !== null && US_STATES.has(s.state!))
    .map((s: StateGroupResult) => ({
      name: s.state!,
      code: s.stateCode || '',
      count: s._count.state,
      slug: s.state!.toLowerCase().replace(/\s+/g, '-'),
    }));

  // Process cities with explicit typing — include state code in slug for proper routing
  const processedCities = topCities
    .filter((c: CityGroupResult) => c.city !== null && c.state !== null && c.stateCode !== null)
    .map((c: CityGroupResult) => ({
      name: c.city!,
      state: c.state!,
      stateCode: c.stateCode || '',
      count: c._count.city,
      slug: `${c.city!.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}-${(c.stateCode || '').toLowerCase()}`,
    }));

  return {
    states: processedStates,
    remoteCount,
    topCities: processedCities,
    totalJobs,
  };
}

/**
 * Generate metadata for SEO
 */
export const metadata: Metadata = {
  title: 'PMHNP Jobs by Location - All States',
  description: 'Find psychiatric mental health nurse practitioner jobs in all 50 states. Browse PMHNP positions by location, including remote opportunities.',
  openGraph: {
    title: 'PMHNP Jobs by Location',
    description: 'Browse psychiatric mental health nurse practitioner jobs in all 50 states and remote positions.',
    type: 'website',
    images: [{
      url: `/api/og?type=page&title=${encodeURIComponent('PMHNP Jobs by Location')}&subtitle=${encodeURIComponent('Browse positions across all 50 states')}`,
      width: 1200,
      height: 630,
      alt: 'PMHNP Jobs by Location',
    }],
  },
  alternates: {
    canonical: `${brand.baseUrl}/jobs/locations`,
  },
};

/**
 * Locations directory page
 */
export default async function LocationsPage() {
  const stats = await getLocationStats();

  /* Design Tokens */
  const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FDFBF7' }}>
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: "Locations", url: "https://pmhnphiring.com/jobs/locations" }
      ]} />
      {/* ═══ HERO ═══ */}
      <CategoryHero
        bgColor="#0D9488"
        heroImage="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/hero_wc_states.webp"
        heroAlt="PMHNP Jobs by Location"
        badgeText="Nationwide"
        breadcrumbs={['Home', 'Jobs', 'Locations']}
        indexLabel="№ 02"
        headlineLine1="PMHNP"
        headlineLine2="Locations"
        headlineSub="Search by State & City"
        stats={[
          { value: stats.totalJobs.toLocaleString(), label: 'Jobs' },
          { value: '50', label: 'States' },
          { value: `${stats.topCities.length}+`, label: 'Cities' },
          { value: stats.remoteCount.toString(), label: 'Remote' },
        ]}
        description={`Explore ${stats.totalJobs.toLocaleString()} psychiatric nurse practitioner positions across the United States. Find opportunities in all 50 states, top metropolitan areas, and remote positions.`}
        ctaLabel="Browse All Jobs"
        ctaHref="/jobs"
      />

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-7xl mx-auto">
          {/* ═══ Remote Jobs — Premium Clay Banner ═══ */}
          {stats.remoteCount > 0 && (
            <div className="mb-12">
              <Link href="/jobs/remote" className="block group">
                <div
                  className="rounded-2xl overflow-hidden transition-all duration-300 group-hover:-translate-y-1"
                  style={{
                    ...clayCard,
                    padding: 0,
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '0' }}>
                    {/* Left — Icon + Copy */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '28px 32px' }}>
                      {/* Large Clay Icon */}
                      <div style={{
                        width: '80px', height: '80px', borderRadius: '20px', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#F9F7F1',
                        border: '1px solid rgba(255,255,255,0.6)',
                        boxShadow: '4px 4px 10px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 3px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)',
                      }}>
                        <img src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_remote.webp" alt="" width={52} height={52} style={{ objectFit: 'contain' }} />
                      </div>

                      <div>
                        <h2 style={{
                          fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800,
                          fontFamily: 'var(--font-lora, Georgia, serif)',
                          color: '#1A2E35', margin: '0 0 6px', lineHeight: 1.2,
                        }}>
                          Remote PMHNP Jobs
                        </h2>
                        <p style={{ fontSize: '14px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                          Work from anywhere — telehealth &amp; fully remote positions across all 50 states
                        </p>
                      </div>
                    </div>

                    {/* Right — Stat + CTA */}
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      padding: '28px 36px', gap: '14px',
                      borderLeft: '1px solid rgba(0,0,0,0.04)',
                      background: 'linear-gradient(180deg, rgba(249,247,241,0.4) 0%, rgba(255,255,255,0) 100%)',
                    }}>
                      {/* Stat Pill */}
                      <div style={{
                        padding: '8px 20px', borderRadius: '14px',
                        background: '#F9F7F1',
                        border: '1px solid #EAE6DF',
                        boxShadow: 'inset 2px 2px 6px rgba(0,0,0,0.03), inset -1px -1px 3px rgba(255,255,255,0.5)',
                        textAlign: 'center',
                      }}>
                        <div style={{ fontSize: '28px', fontWeight: 800, color: '#0D9488', lineHeight: 1.1 }}>
                          {stats.remoteCount}
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#9A8A7E', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          Open Positions
                        </div>
                      </div>

                      {/* CTA Button */}
                      <div
                        className="group-hover:-translate-y-0.5 transition-all"
                        style={{
                          padding: '10px 24px', borderRadius: '14px',
                          fontSize: '14px', fontWeight: 700, color: '#fff',
                          background: 'linear-gradient(135deg, #0D9488, #0F766E)',
                          boxShadow: '4px 4px 12px rgba(13,148,136,0.2), -2px -2px 6px rgba(255,255,255,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        View Remote Jobs
                        <span style={{ transition: 'transform 0.2s' }} className="group-hover:translate-x-1">→</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* ═══ Browse by Job Type — Clay Icon Grid ═══ */}
          <div className="mb-12">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <img src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_location.webp" alt="" width={28} height={28} style={{ objectFit: 'contain' }} />
              <h2 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1A2E35', margin: 0 }}>
                Browse by Job Type
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { href: '/jobs/remote',     icon: 'clay_icon_remote.png',     label: 'Remote',     sub: 'Work from anywhere' },
                { href: '/jobs/telehealth', icon: 'clay_icon_telehealth.png', label: 'Telehealth', sub: 'Virtual patient care' },
                { href: '/jobs/travel',     icon: 'clay_icon_travel.png',     label: 'Travel',     sub: 'Locum tenens' },
                { href: '/jobs/new-grad',   icon: 'clay_icon_newgrad.png',    label: 'New Grad',   sub: 'Entry-level friendly' },
                { href: '/jobs/per-diem',   icon: 'clay_icon_perdiem.png',    label: 'Per Diem',   sub: 'Flexible scheduling' },
              ].map((cat) => (
                <Link key={cat.href} href={cat.href} className="group">
                  <div
                    className="h-full flex flex-col items-center text-center transition-all duration-200 group-hover:-translate-y-1"
                    style={{ ...clayCard, padding: '24px 16px' }}
                  >
                    {/* Clay Icon Well */}
                    <div style={{
                      width: '56px', height: '56px', borderRadius: '16px', marginBottom: '14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#F9F7F1',
                      border: '1px solid rgba(255,255,255,0.6)',
                      boxShadow: '3px 3px 8px rgba(0,0,0,0.04), -2px -2px 5px rgba(255,255,255,0.8), inset 1px 1px 3px rgba(255,255,255,0.6)',
                    }}>
                      <img src={`https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/${cat.icon.replace('.png', '.webp')}`} alt="" width={34} height={34} style={{ objectFit: 'contain' }} />
                    </div>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 4px' }}>{cat.label}</h3>
                    <p style={{ fontSize: '12px', color: '#9A8A7E', margin: '0 0 12px', lineHeight: 1.4 }}>{cat.sub}</p>
                    <div style={{
                      marginTop: 'auto', fontSize: '12px', fontWeight: 700, color: '#0D9488',
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                      View Jobs <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* ═══ Browse by State — Diorama Cards ═══ */}
          <div className="mb-12">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <img src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_location.webp" alt="" width={28} height={28} style={{ objectFit: 'contain' }} />
              <h2 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1A2E35', margin: 0 }}>
                Browse by State
              </h2>
            </div>

            {stats.states.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={clayCard}>
                <MapPin className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                <p style={{ color: 'var(--text-secondary)' }}>No state data available</p>
              </div>
            ) : (
              <>
              <style dangerouslySetInnerHTML={{ __html: `
                .state-card {
                  transition: transform 0.3s ease, box-shadow 0.3s ease;
                }
                .state-card:hover {
                  transform: translateY(-6px) scale(1.03);
                  box-shadow: inset 4px 4px 10px rgba(255,255,255,0.3), inset -3px -3px 8px rgba(0,0,0,0.08), 0 14px 32px rgba(0,0,0,0.16) !important;
                }
                .state-card:hover .state-footer {
                  background: #F9F7F1;
                }
                .state-card:hover .state-name {
                  color: #0D9488 !important;
                }
              `}} />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                {stats.states.map((state: ProcessedState) => (
                  <Link
                    key={state.code}
                    href={`/jobs/state/${state.slug}`}
                    className="group block"
                    style={{ textDecoration: 'none' }}
                  >
                    {/* Diorama — aspect-square, matching home page */}
                    <div
                      className="state-card relative overflow-hidden aspect-square"
                      style={{
                        borderRadius: '24px',
                        boxShadow: 'inset 4px 4px 10px rgba(255,255,255,0.3), inset -3px -3px 8px rgba(0,0,0,0.08), 0 6px 20px rgba(0,0,0,0.1)',
                      }}
                    >
                      <img
                        src={`https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/states/${state.slug}.webp`}
                        alt={`${state.name} PMHNP Jobs`}
                        width={300}
                        height={300}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      {/* Job count badge */}
                      <div style={{
                        position: 'absolute', bottom: '10px', right: '10px',
                        padding: '5px 12px', borderRadius: '12px',
                        background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
                        fontSize: '13px', fontWeight: 800, color: '#0D9488', lineHeight: 1,
                        display: 'flex', alignItems: 'baseline', gap: '3px',
                      }}>
                        {state.count} <span style={{ fontSize: '10px', fontWeight: 600, color: '#7A6A62' }}>jobs</span>
                      </div>
                    </div>
                    {/* Footer: Name + CTA */}
                    <div className="state-footer" style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 6px 4px',
                    }}>
                      <span className="state-name" style={{ fontSize: '13px', fontWeight: 700, color: '#1A2E35', transition: 'color 0.2s' }}>
                        {state.name}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        View →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
              </>
            )}
          </div>

          {/* Top Cities Section */}
          {stats.topCities.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <TrendingUp className="h-6 w-6 text-green-500" />
                <h2 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Top Cities with PMHNP Jobs
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {stats.topCities.map((city: ProcessedCity) => (
                  <Link
                    key={`${city.slug}-${city.state}`}
                    href={`/jobs/city/${city.slug}`}
                    className="group"
                  >
                    <div className="rounded-xl p-5 hover:shadow-md transition-all duration-200 h-full" style={clayCard}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-bold group-hover:text-green-500 transition-colors mb-1" style={{ color: 'var(--text-primary)' }}>
                            {city.name}
                          </h3>
                          <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                            {city.state} {city.stateCode && `(${city.stateCode})`}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-green-500">
                            {city.count}
                          </div>
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {city.count === 1 ? 'job' : 'jobs'}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm text-green-500 font-medium flex items-center gap-1">
                        View Jobs
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="mt-8 text-center">
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  Looking for jobs in a specific city?
                </p>
                <Link
                  href="/jobs"
                  className="inline-block px-6 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors shadow-sm hover:shadow-md"
                >
                  Search All Jobs
                </Link>
              </div>
            </div>
          )}

          {/* Info Section */}
          <div className="mt-12 rounded-xl p-6 md:p-8" style={clayCard}>
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              About PMHNP Job Locations
            </h2>
            <div className="grid md:grid-cols-2 gap-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>State-by-State Opportunities</h3>
                <p className="leading-relaxed">
                  Each state offers unique opportunities for psychiatric mental health nurse practitioners.
                  Browse by state to find positions that match your location preferences, licensing, and
                  career goals. States vary in demand, salary ranges, and practice requirements.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Metropolitan Markets</h3>
                <p className="leading-relaxed">
                  Major cities typically offer higher concentrations of PMHNP positions across diverse
                  settings including hospitals, clinics, private practices, and telehealth companies.
                  Urban areas often provide competitive salaries and career advancement opportunities.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Remote Work Options</h3>
                <p className="leading-relaxed">
                  Telehealth has expanded opportunities for PMHNPs to work from anywhere. Remote positions
                  offer flexibility, work-life balance, and the ability to serve patients across state lines
                  with appropriate licensure.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Location Considerations</h3>
                <p className="leading-relaxed">
                  When choosing a location, consider factors like cost of living, state licensing requirements,
                  scope of practice regulations, professional development opportunities, and quality of life.
                  Research each state&apos;s specific PMHNP practice environment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
