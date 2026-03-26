import { Metadata } from 'next';
import Link from 'next/link';
import { GraduationCap, Sparkles, Target, BookOpen, TrendingUp, Building2, Users, Shield, Award, FileText, AlertTriangle, CheckCircle, ArrowRight, Bell, MapPin, Briefcase } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';

export const revalidate = 3600;

/**
 * New Grad PMHNP Resource Hub — /new-grad
 *
 * This is a CONTENT HUB, not a job listing page (that's /jobs/new-grad).
 * It aggregates all new-grad resources into one authoritative page that Google
 * can rank for the "new grad PMHNP" keyword cluster (19-22% CTR, position 2.4-2.6).
 *
 * Keyword targets:
 * - "new grad pmhnp" (primary)
 * - "new grad pmhnp jobs"
 * - "how to get first pmhnp job"
 * - "pmhnp fellowship programs"
 * - "new grad pmhnp salary"
 * - "pmhnp residency programs"
 */

async function getNewGradData() {
  const where = {
    isPublished: true,
    OR: [
      { title: { contains: 'new grad', mode: 'insensitive' as const } },
      { title: { contains: 'new graduate', mode: 'insensitive' as const } },
      { title: { contains: 'entry level', mode: 'insensitive' as const } },
      { title: { contains: 'fellowship', mode: 'insensitive' as const } },
      { title: { contains: 'residency', mode: 'insensitive' as const } },
      { title: { contains: 'recent graduate', mode: 'insensitive' as const } },
      { title: { contains: 'training program', mode: 'insensitive' as const } },
    ],
  };

  const [totalJobs, salaryData, topEmployers, recentJobs, totalAllJobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.aggregate({
      where: { ...where, normalizedMinSalary: { not: null }, normalizedMaxSalary: { not: null } },
      _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
    }),
    prisma.job.groupBy({
      by: ['employer'],
      where,
      _count: { employer: true },
      orderBy: { _count: { employer: 'desc' } },
      take: 10,
    }),
    prisma.job.findMany({
      where,
      orderBy: [{ isFeatured: 'desc' }, { qualityScore: 'desc' }, { createdAt: 'desc' }],
      take: 6,
    }),
    prisma.job.count({ where: { isPublished: true } }),
  ]);

  const avgMin = salaryData._avg.normalizedMinSalary || 0;
  const avgMax = salaryData._avg.normalizedMaxSalary || 0;

  return {
    totalJobs,
    avgSalary: Math.round((avgMin + avgMax) / 2 / 1000),
    minSalary: Math.round(avgMin / 1000),
    maxSalary: Math.round(avgMax / 1000),
    topEmployers: topEmployers.map(e => ({ name: e.employer, count: e._count.employer })),
    recentJobs: recentJobs as Job[],
    totalAllJobs,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const data = await getNewGradData();
  const year = new Date().getFullYear();

  return {
    title: `New Grad PMHNP Guide ${year}: First Job, Salary, Fellowships & Tips`,
    description: `The complete new grad PMHNP resource hub. ${data.totalJobs} entry-level jobs available. Average starting salary: $${data.avgSalary}K. Fellowship programs, interview tips, salary negotiation, red flags, and step-by-step guidance for landing your first psychiatric NP position.`,
    keywords: ['new grad pmhnp', 'new graduate pmhnp jobs', 'pmhnp fellowship', 'new grad pmhnp salary', 'how to get first pmhnp job', 'pmhnp residency programs', 'entry level psychiatric nurse practitioner'],
    openGraph: {
      title: `New Grad PMHNP Guide ${year} — Your Complete Career Launchpad`,
      description: `${data.totalJobs} entry-level PMHNP jobs. Average starting salary: $${data.avgSalary}K. Fellowships, interview tips, and salary negotiation strategies.`,
      type: 'article',
      images: [{
        url: `/api/og?type=page&title=${encodeURIComponent(`New Grad PMHNP Guide ${year}`)}&subtitle=${encodeURIComponent(`${data.totalJobs} Jobs • $${data.avgSalary}K Avg Salary • Fellowships & Tips`)}`,
        width: 1200, height: 630,
        alt: 'New Grad PMHNP Guide',
      }],
    },
    alternates: {
      canonical: 'https://pmhnphiring.com/new-grad',
    },
  };
}

export default async function NewGradHubPage() {
  const data = await getNewGradData();
  const year = new Date().getFullYear();

  const faqs = [
    {
      question: 'Can a new grad PMHNP prescribe controlled substances?',
      answer: `Yes, in most states. PMHNPs are authorized to prescribe schedule II-V controlled substances, including stimulants, benzodiazepines, and buprenorphine. In Full Practice Authority (FPA) states, you can prescribe independently from day one. In reduced/restricted practice states, you'll need a collaborative agreement with a physician. All new grads need to apply for both state prescriptive authority and a DEA registration.`,
    },
    {
      question: 'Should I do a PMHNP fellowship or residency?',
      answer: `Fellowships and residency programs are highly recommended but not required. They typically last 12 months and offer reduced caseloads (starting at 4-6 patients/day), weekly 1:1 clinical supervision, structured didactic training, and exposure to diverse patient populations. The trade-off is lower initial salary ($90K-$120K vs $130K-$155K for direct-hire). If you can afford the temporary pay cut, a fellowship builds confidence and clinical skills that pay dividends throughout your career.`,
    },
    {
      question: 'What is the average salary for a new grad PMHNP?',
      answer: `New grad PMHNP salaries range from $115,000 to $165,000 depending on location, setting, and practice authority. Community mental health centers typically pay $115K-$135K but may offer federal loan repayment ($50K+). Outpatient/private practice: $130K-$155K. Hospital/inpatient: $125K-$145K. Telehealth: $120K-$150K. After 1-2 years of experience, salaries typically jump 15-25%.`,
    },
    {
      question: 'How many patients should a new grad PMHNP see per day?',
      answer: `In your first 3-6 months, a reasonable caseload is 6-10 patients per day for follow-ups and 2-4 for new patient evaluations. Experienced PMHNPs typically see 12-18 patients daily. Be wary of employers expecting 20+ patients/day from the start — this is a red flag for inadequate support. Most quality employers offer a gradual ramp-up period of 3-6 months before expecting full productivity.`,
    },
    {
      question: 'What states are best for new grad PMHNPs?',
      answer: `Full Practice Authority (FPA) states are ideal for new grads because they allow independent practice without physician supervision. Top FPA states include: Arizona, Colorado, Oregon, Washington, Ohio, Illinois, and Idaho. These states let you prescribe, diagnose, and even start your own practice from day one. States like New York, Texas, and Georgia have reduced/restricted practice but still offer abundant jobs and competitive salaries.`,
    },
    {
      question: 'How do I find a PMHNP mentor as a new graduate?',
      answer: `Start during clinical rotations — ask preceptors about mentoring relationships. Join AANP (American Association of Nurse Practitioners) and ISPN (International Society of Psychiatric-Mental Health Nurses) for networking events. Many health systems offer formal mentorship programs. LinkedIn groups like "PMHNP Collective" connect new grads with experienced practitioners. Consider fellowship programs that include built-in mentorship. Your DEA-waivered mentor can also help you learn MAT/buprenorphine prescribing.`,
    },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Schema */}
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "New Grad PMHNP Guide", url: "https://pmhnphiring.com/new-grad" },
      ]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqs.map(faq => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: { '@type': 'Answer', text: faq.answer },
            })),
          }),
        }}
      />

      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, #0f766e 0%, #115e59 50%, #134e4a 100%)' }} className="text-white py-14 md:py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-3 mb-5">
              <GraduationCap className="h-10 w-10" />
              <Sparkles className="h-8 w-8 text-yellow-300" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              New Grad PMHNP Guide {year}
            </h1>
            <p className="text-base text-teal-200 mb-2">Your complete resource hub for landing your first PMHNP job</p>
            <p className="text-lg md:text-xl text-teal-100 mb-8 max-w-2xl mx-auto">
              Everything you need: {data.totalJobs} entry-level jobs, salary benchmarks, fellowship directory, interview prep, and red flags to watch for.
            </p>
            <div className="flex flex-wrap justify-center gap-6 md:gap-10">
              <div className="text-center">
                <div className="text-3xl font-bold">{data.totalJobs}</div>
                <div className="text-sm text-teal-200">New Grad Jobs</div>
              </div>
              {data.avgSalary > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold">${data.avgSalary}K</div>
                  <div className="text-sm text-teal-200">Avg. Starting Salary</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold">{data.topEmployers.length}+</div>
                <div className="text-sm text-teal-200">Employers Hiring</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">{data.totalAllJobs.toLocaleString()}</div>
                <div className="text-sm text-teal-200">Total PMHNP Jobs</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-10 md:py-14">
        <div className="max-w-5xl mx-auto space-y-10">

          {/* Step-by-Step Guide */}
          <section>
            <h2 className="text-2xl md:text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
              <Target size={28} className="inline-block mr-2 mb-1" style={{ color: 'var(--color-primary)' }} />
              How to Land Your First PMHNP Job: Step-by-Step
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { step: '1', title: 'Pass Your Certification Exam', desc: 'Take the ANCC PMHNP-BC exam. Study with Barkley or APEA review courses. Most grads choose ANCC; some employers accept AANPCB.' },
                { step: '2', title: 'Get Your State License + DEA', desc: 'Apply for NP licensure in your state, then register for your DEA number. In FPA states this is straightforward; in restricted states, secure a collaborative physician first.' },
                { step: '3', title: 'Build Your Resume & Cover Letter', desc: 'Highlight clinical hours, patient populations served, and any subspecialties (SUD, child/adolescent, geriatric). Quantify your clinical experience with numbers.' },
                { step: '4', title: 'Target the Right Employers', desc: 'Look for positions offering mentorship, gradual caseload ramp-up, and reasonable expectations. Community mental health centers and academic medical centers are ideal starts.' },
                { step: '5', title: 'Prepare for Interviews', desc: 'Know common psych scenarios: suicidal patient protocol, medication titration questions, differentiating bipolar from ADHD. Prepare to discuss your clinical rotation cases.' },
                { step: '6', title: 'Negotiate Your Offer', desc: 'Don\'t accept the first offer. Negotiate salary, loan repayment, CME stipends, schedule flexibility, and malpractice coverage. New grads have more leverage than they think.' },
              ].map(item => (
                <div key={item.step} className="flex gap-4 p-5 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm" style={{ backgroundColor: 'var(--color-primary)' }}>
                    {item.step}
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Salary Expectations */}
          <section className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              <TrendingUp size={24} className="inline-block mr-2 mb-1 text-green-500" />
              New Grad PMHNP Salary Expectations ({year})
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              Based on {data.totalJobs} active new grad positions on our platform. Salaries vary by setting, state, and practice authority.
            </p>
            <div className="grid md:grid-cols-4 gap-4 mb-6">
              {[
                { range: '$115K–$135K', setting: 'Community Mental Health', note: 'Often qualifies for HRSA loan repayment ($50K+)', color: '#22c55e' },
                { range: '$130K–$155K', setting: 'Outpatient / Private Practice', note: 'Higher with productivity-based comp', color: '#3b82f6' },
                { range: '$125K–$145K', setting: 'Inpatient / Hospital', note: 'Includes shift differentials + benefits', color: '#8b5cf6' },
                { range: '$120K–$150K', setting: 'Telehealth / Remote', note: 'Multi-state license increases options', color: '#f59e0b' },
              ].map(item => (
                <div key={item.setting} className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <div className="text-lg font-bold" style={{ color: item.color }}>{item.range}</div>
                  <div className="text-sm font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{item.setting}</div>
                  <div className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>{item.note}</div>
                </div>
              ))}
            </div>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              See state-by-state breakdowns in our{' '}
              <Link href="/salary-guide" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>
                2026 PMHNP Salary Guide →
              </Link>
            </p>
          </section>

          {/* Fellowship & Residency Directory */}
          <section className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              <Award size={24} className="inline-block mr-2 mb-1" style={{ color: 'var(--color-primary)' }} />
              PMHNP Fellowship & Residency Programs
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              Fellowships offer 12 months of structured training with reduced caseloads, daily supervision, and didactic instruction. They&apos;re the gold standard for new grad PMHNPs who want to build clinical excellence.
            </p>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              {[
                { title: 'What You Get', items: ['1:1 clinical supervision (weekly)', 'Gradual caseload: 4→12 patients/day', 'Exposure to diverse diagnoses', 'Structured didactic training', 'Certificate of completion'] },
                { title: 'What to Expect', items: ['Duration: 12 months typical', 'Salary: $90K-$120K during fellowship', 'Post-fellowship salary bump: 20-40%', 'Most hire fellows into permanent roles', 'Competitive — apply 6-12 months early'] },
              ].map(col => (
                <div key={col.title} className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{col.title}</h3>
                  <ul className="space-y-2">
                    {col.items.map(item => (
                      <li key={item} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <CheckCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <Link
              href="/jobs/new-grad?page=1"
              className="inline-flex items-center gap-2 text-sm font-medium hover:opacity-80 transition-opacity"
              style={{ color: 'var(--color-primary)' }}
            >
              Browse fellowship and new grad positions <ArrowRight size={14} />
            </Link>
          </section>

          {/* Red Flags */}
          <section className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              <AlertTriangle size={24} className="inline-block mr-2 mb-1 text-orange-500" />
              Red Flags to Watch for as a New Grad PMHNP
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { flag: 'Full caseload from day one', fix: 'Quality employers ramp up over 3-6 months. If they expect 15+ patients/day immediately, the support structure is likely inadequate.' },
                { flag: 'No mentorship or supervision', fix: 'Even in FPA states, new grads should have access to a senior clinician for case consultations. "figure it out on your own" is a major red flag.' },
                { flag: '20+ patients/day expectation', fix: 'Experienced PMHNPs see 12-18/day. Expecting 20+ from a new grad signals a pill-mill environment or unrealistic productivity targets.' },
                { flag: 'Non-compete clause > 1 year', fix: 'Limits future career moves. Negotiate it down or remove it entirely — your first job shouldn\'t restrict your next 3 years.' },
                { flag: '100% 1099 contractor role', fix: 'As a 1099, you pay self-employment tax (~15%), buy your own malpractice insurance, and get no benefits. Factor in the true cost before comparing to W2 offers.' },
                { flag: 'No credentials/DEA support', fix: 'Quality employers assist with credentialing, DEA registration, and insurance paneling. If they expect you to do this entirely on your own, it suggests poor organizational support.' },
              ].map(item => (
                <div key={item.flag} className="flex gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <span className="text-orange-500 font-bold flex-shrink-0 mt-0.5">⚠️</span>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.flag}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{item.fix}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Practice Authority Guide */}
          <section className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              <Shield size={24} className="inline-block mr-2 mb-1" style={{ color: 'var(--color-primary)' }} />
              State Practice Authority for New Grads
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              Practice authority determines how independently you can work. Full Practice Authority (FPA) states let you prescribe, diagnose, and practice without physician supervision from day one.
            </p>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
                <div className="font-bold text-green-600 mb-2">✅ Full Practice Authority</div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Independent practice from day one</p>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>AZ, CO, OR, WA, OH, IL, ID, NM, MT, ND, HI, ME, VT, NH, AK, IA, NE, SD, WY, DC...</div>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <div className="font-bold text-amber-600 mb-2">⚡ Reduced Practice</div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Collaborative agreement for initial period</p>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>NY, TX, GA, NJ, PA, IN, KY, WI, KS, LA, WV, UT...</div>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <div className="font-bold text-red-500 mb-2">⛔ Restricted Practice</div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Ongoing physician supervision required</p>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>CA, FL, SC, NC, MI, OK, MO, TN, VA, MA...</div>
              </div>
            </div>
            <Link
              href="/resources/state-licensure-guide/alabama"
              className="inline-flex items-center gap-1 text-sm font-medium hover:opacity-80 transition-opacity"
              style={{ color: 'var(--color-primary)' }}
            >
              Browse all 50
 state licensure guides <ArrowRight size={14} />
            </Link>
          </section>

          {/* Companies Hiring New Grads */}
          {data.topEmployers.length > 0 && (
            <section className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                <Building2 size={24} className="inline-block mr-2 mb-1" style={{ color: 'var(--color-primary)' }} />
                Top Employers Hiring New Grad PMHNPs
              </h2>
              <div className="grid md:grid-cols-2 gap-3">
                {data.topEmployers.map((employer, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <span className="text-sm font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>{employer.name}</span>
                    <span className="text-sm font-medium ml-2 px-2 py-1 rounded-full" style={{ color: 'var(--color-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                      {employer.count} {employer.count === 1 ? 'opening' : 'openings'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Latest Jobs */}
          {data.recentJobs.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Latest New Grad PMHNP Jobs
                </h2>
                <Link href="/jobs/new-grad" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--color-primary)' }}>
                  View All {data.totalJobs} →
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.recentJobs.map((job: Job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
              <div className="text-center mt-6">
                <Link
                  href="/jobs/new-grad"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  Browse All {data.totalJobs} New Grad Jobs <ArrowRight size={16} />
                </Link>
              </div>
            </section>
          )}

          {/* Related Resources */}
          <section>
            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
              <BookOpen size={24} className="inline-block mr-2 mb-1" style={{ color: 'var(--color-primary)' }} />
              Related Resources
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { href: '/blog/how-to-become-a-pmhnp', emoji: '🎓', title: 'How to Become a PMHNP', desc: 'Complete guide: education, certification, licensure' },
                { href: '/blog/new-grad-pmhnp-first-job', emoji: '🚀', title: 'New Grad First Job Guide', desc: 'Interview tips, salary negotiation, red flags' },
                { href: '/blog/pmhnp-vs-psychiatrist', emoji: '⚖️', title: 'PMHNP vs Psychiatrist', desc: 'Scope, salary, education, career trajectory' },
                { href: '/salary-guide', emoji: '💰', title: '2026 Salary Guide', desc: 'State-by-state salary breakdowns and trends' },
                { href: '/jobs/remote', emoji: '🏠', title: 'Remote PMHNP Jobs', desc: 'Work-from-home telehealth positions' },
                { href: '/jobs/locations', emoji: '📍', title: 'Jobs by Location', desc: 'Find openings in your state or city' },
              ].map(res => (
                <Link key={res.href} href={res.href} className="block p-4 rounded-xl hover:shadow-md transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>{res.emoji} {res.title}</h3>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{res.desc}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
              Frequently Asked Questions: New Grad PMHNPs
            </h2>
            <div className="space-y-6">
              {faqs.map((faq, i) => (
                <div key={i}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{faq.question}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Job Alerts CTA */}
          <section className="bg-teal-600 rounded-xl p-8 text-white text-center">
            <Bell className="h-10 w-10 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Get New Grad PMHNP Job Alerts</h2>
            <p className="text-teal-100 mb-6 max-w-lg mx-auto">
              Be the first to know when new fellowship, residency, and entry-level PMHNP positions are posted.
            </p>
            <Link
              href="/job-alerts"
              className="inline-block px-8 py-3 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors"
            >
              Create Free Alert
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
