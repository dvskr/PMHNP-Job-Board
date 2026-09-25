import { jsonLdString } from '@/lib/seo/json-ld';
import { brand } from '@/config/brand';
import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FAQAccordion from '@/components/FAQAccordion';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { Mail, HelpCircle } from 'lucide-react';
import { config } from '@/lib/config';
import { FULL_PRACTICE_SUMMARY } from '@/lib/state-practice-authority';
import { getOfferMarketData, getHubStateSummaries } from '@/lib/salary-report/market-data';
import { summarizeMidpoints, roundDisplayDollars } from '@/lib/salary-report/stats';

// The salary answers below query live postings, so this page is ISR daily on
// the same cadence as /salary-guide rather than fully static.
export const revalidate = 86400;

const FAQ_OG_IMAGE = 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-hiring-frequently-asked-questions.webp';

export const metadata: Metadata = {
  // `absolute` opts out of the layout title template so we don't end up
  // with "FAQ | PMHNP Jobs | PMHNP Hiring" (the brand-confusing form
  // audit 09 M-18 flagged — "PMHNP Jobs" is not the brand name).
  title: { absolute: 'PMHNP Hiring FAQ: Job Search, Posting & Alerts' },
  description: 'Frequently asked questions about PMHNP Hiring. Learn how to search jobs, post positions, set up alerts, and make the most of the PMHNP-only job board.',
  openGraph: {
    title: 'PMHNP Hiring FAQ',
    description: 'Common questions about searching, posting, and managing PMHNP jobs.',
    type: 'website',
    url: `${brand.baseUrl}/faq`,
    siteName: 'PMHNP Hiring',
    images: [{ url: FAQ_OG_IMAGE, width: 1280, height: 900, alt: 'PMHNP Hiring FAQ: job posting, salary transparency, job alerts, employer features' }],
  },
  twitter: { card: 'summary_large_image', title: 'PMHNP Hiring FAQ', images: [FAQ_OG_IMAGE] },
  alternates: {
    canonical: `${brand.baseUrl}/faq`,
  },
};

export default async function FAQPage() {
  // Salary answers are computed, not written. Every dollar figure on this page
  // comes from the same engine /salary-guide uses (medians of advertised
  // ranges, quarantined and n-gated by lib/salary-report/stats.ts) and travels
  // with its sample size. The previous versions of these answers hardcoded a
  // national average, per-state averages, new-grad and top-decile bands,
  // specialty and FPA "premium" percentages, locum ranges and sign-on bonus
  // ranges. None of them could be reproduced from any source the codebase
  // holds, and they disagreed with /salary-guide and /salary-guide/{state} on
  // the same domain, inside FAQPage JSON-LD that llms.txt points answer
  // engines at. Below the sample floor the answer says so instead of guessing.
  const [market, hubStates] = await Promise.all([getOfferMarketData(), getHubStateSummaries()]);
  const national = summarizeMidpoints(market.national);
  const nationalFull = national.tier === 'full' ? national : null;
  const nationalMedian = national.tier === 'full' || national.tier === 'median' ? national : null;
  const topStates = hubStates.filter((s) => s.p25 != null).slice(0, 5);

  const fmtK = (n: number) => `$${Math.round(roundDisplayDollars(n) / 1000)}K`;
  const STANDARD_ANNUAL_HOURS = 2080;

  const jobSeekerFaqs = [
    {
      question: "Is PMHNP Hiring free to use?",
      answer: "Yes! Job seekers can browse, save, and apply to jobs completely free. There are no hidden fees, subscriptions, or charges for candidates."
    },
    {
      question: "How do I save jobs?",
      answer: "Click the bookmark icon on any job card or detail page. Saved jobs are stored in your browser and accessible anytime from the 'Saved Jobs' page in the navigation menu."
    },
    {
      question: "How do job alerts work?",
      answer: "Create an alert with your search criteria (location, job type, salary, etc.). We'll email you when new matching jobs are posted. You can manage or unsubscribe from alerts at any time."
    },
    {
      question: "Where do the jobs come from?",
      answer: "We aggregate jobs from multiple sources including job boards, company career pages, and direct employer postings. This gives you access to the most comprehensive collection of PMHNP opportunities in one place."
    },
    {
      question: "How do I apply to a job?",
      answer: "Click 'Apply Now' on any job listing. You'll be directed to the employer's application page where you can submit your resume and information directly to them."
    },
    {
      question: "Can I track my applications?",
      answer: "Yes! When you apply to a job and confirm that you've completed the application, the job is automatically tracked in your 'Applications' tab on the Saved Jobs page."
    },
  ];

  const renewalDiscountPercent = Math.round((1 - config.renewalPrice / config.postingPrice) * 100);

  const employerFaqs = [
    {
      question: "How much does it cost to post a job?",
      answer: `Your first job post is half price: $${config.firstPostPrice} instead of $${config.postingPrice}, once per employer. Every post after that costs $${config.postingPrice} flat. Renewals are discounted at $${config.renewalPrice} (${renewalDiscountPercent}% off).`
    },
    {
      question: "What features are included?",
      answer: `Every job post gets the same features: Featured badge, top placement in search results, company logo, full analytics with salary benchmarks, ${config.limits.candidateUnlocksPerPosting} candidate profile views, ${config.limits.inmailsPerPosting} InMails, up to 5 screening questions, and apply-on-platform. The half-price first post is identical to a standard post in every way except the price.`
    },
    {
      question: "How long do job postings last?",
      answer: `Every posting is active for ${config.durationDays} days, first post included. Postings can be renewed any time from the employer dashboard for $${config.renewalPrice} (${renewalDiscountPercent}% off the regular price).`
    },
    {
      question: "If I renew before my post expires, do I lose the remaining days?",
      answer: `No. Renewing early adds ${config.durationDays} days to your current expiration date, so you keep every day you've already paid for. Renew on your schedule.`
    },
    {
      question: "What happens to candidates I've unlocked when my posting expires?",
      answer: "You keep them. Once you've unlocked a candidate (paid 1 of your 25 unlocks to view their full profile), their contact info, resume, and details remain accessible in your dashboard forever, even after the posting expires. To unlock new candidates or send new InMails, you'll need an active posting."
    },
    {
      question: "Can I edit my job posting?",
      answer: `Yes! Open your employer dashboard (link is in your confirmation email) and click Edit on any posting. You can update salary, requirements, description, or any other details: changes go live immediately.`
    },
    {
      question: "How do I access my employer dashboard?",
      answer: "Check your confirmation email for a dashboard link. The dashboard allows you to view analytics, edit your posting, browse candidates, and manage all your job postings in one place. If you've lost the link, contact us at support@pmhnphiring.com."
    },
    {
      // There is no refund guarantee. The old answer ("we'll work with you")
      // read like one in structured data while the Terms say postings are
      // generally non-refundable, so this now states the actual policy.
      question: "Do you offer refunds?",
      answer: "Job posting and renewal fees are generally non-refundable. You can email support@pmhnphiring.com within 7 days of purchase with your order details and the reason, and we consider requests case by case at our discretion. The full policy is in our Terms of Service."
    },
  ];

  const generalFaqs = [
    {
      question: "How do I contact support?",
      answer: "Email us at support@pmhnphiring.com and we'll respond within 24 hours (usually much faster). You can also use our contact form for general inquiries."
    },
    {
      question: "Is my information secure?",
      answer: "Yes. We use industry-standard security practices including encrypted connections (HTTPS), secure payment processing through Stripe, and we never share your personal information with third parties. See our Privacy Policy for complete details."
    },
    {
      question: "How often are jobs updated?",
      answer: "Jobs are added and updated daily. New postings go live immediately, and we regularly refresh aggregated listings to ensure accuracy."
    },
    {
      question: "Can I post jobs in multiple locations?",
      answer: "Yes! When creating your job posting, you can specify multiple locations or select 'Remote' for positions that can be done from anywhere."
    },
  ];

  const careerFaqs = [
    {
      question: "How long does it take to become a psychiatric mental health nurse practitioner?",
      answer: "Becoming a PMHNP typically takes 6 to 8 years: 4 years for a BSN, 1 to 2 years of RN experience, and 2 to 3 years for an MSN or DNP with PMHNP specialization. Accelerated BSN-to-DNP programs can shorten this timeline."
    },
    {
      question: "What educational background is required for a PMHNP role?",
      answer: "You need a Bachelor of Science in Nursing (BSN), then a Master's (MSN) or Doctoral (DNP) degree with psychiatric-mental health specialization from a CCNE or ACEN accredited program. You must also pass the ANCC PMHNP-BC certification exam."
    },
    {
      question: "What is the difference between a PMHNP and a psychiatrist?",
      answer: "PMHNPs hold a Master's or Doctoral degree in nursing (2 to 4 years of graduate school), while psychiatrists complete medical school plus a 4-year residency. Both can diagnose and prescribe. In full practice authority states, PMHNPs practice independently. Psychiatrists are paid more, though we only publish figures we can compute: our salary guide shows current advertised PMHNP medians, and we do not track psychiatrist pay."
    },
    {
      question: "What is the difference between a PMHNP and an FNP?",
      answer: "A PMHNP (Psychiatric Mental Health NP) specializes in diagnosing and treating mental health conditions across the lifespan, including prescribing psychotropic medications. An FNP (Family NP) provides primary care for all ages. PMHNPs focus on psychiatric disorders, psychotherapy, and psychopharmacology, while FNPs handle general medical conditions."
    },
    {
      question: "Can I complete a PMHNP program online?",
      answer: "Yes, many accredited universities offer online PMHNP programs. Didactic coursework is completed online, but you'll still need to complete 500+ clinical hours in person at approved sites. Top online programs include Vanderbilt, Rush, and University of Cincinnati."
    },
    {
      question: "What is the ROI of a PMHNP degree?",
      answer: nationalMedian
        ? `Run it with real numbers rather than a rule of thumb. The current median advertised PMHNP salary across ${nationalMedian.n.toLocaleString()} live postings that disclose a range is ${fmtK(nationalMedian.median)} per year, which our salary guide keeps up to date with its sample size. Put that against your own program's tuition and against what you earn now: we do not publish a generic payback period because tuition, prior RN pay, and local market all move it.`
        : "Run it with real numbers rather than a rule of thumb. Our salary guide publishes the current median advertised PMHNP salary from live postings with its sample size. Put that against your own program's tuition and against what you earn now: tuition, prior RN pay, and local market all move the payback period, so a single national figure would mislead."
    },
    {
      question: "What are the top 3 PMHNP jobs for new grads?",
      answer: "1) Community Mental Health Centers: structured settings with mentorship, often qualifying for HRSA loan repayment. 2) Outpatient group practices: collaborative environments with gradual caseload ramp-up. 3) VA psychiatric NP positions: federal benefits, pension, and residency programs for new graduates."
    },
  ];

  const salaryFaqs = [
    {
      question: "What is the average salary of a psychiatric nurse practitioner in the United States?",
      answer: nationalFull
        ? `Across ${nationalFull.n.toLocaleString()} live postings on this site that disclose a salary range, the median advertised PMHNP salary is ${fmtK(nationalFull.median)} per year, and the middle 50% of those postings advertise between ${fmtK(nationalFull.p25)} and ${fmtK(nationalFull.p75)}. These are advertised figures from job postings, not self-reported earnings, and they move as postings turn over. The salary guide shows the current numbers with their sample size.`
        : nationalMedian
          ? `Across ${nationalMedian.n.toLocaleString()} live postings on this site that disclose a salary range, the median advertised PMHNP salary is ${fmtK(nationalMedian.median)} per year. That is an advertised figure from job postings, not self-reported earnings. We withhold the percentile range until enough postings disclose one.`
          : "We publish pay only when enough live postings disclose a salary range to compute a median, and right now they do not. Rather than estimate, we withhold the figure. The salary guide shows whatever the current sample supports."
    },
    {
      question: "Which states pay the highest salaries for PMHNPs?",
      answer: topStates.length >= 3
        ? `By median advertised pay in current postings, counting only states with at least 10 disclosed ranges: ${topStates.map((s, i) => `${i + 1}. ${s.state} (${fmtK(s.median)}, n=${s.n})`).join(', ')}. Rankings shift as postings turn over, and a high nominal median does not survive a high cost of living, so compare against where you would actually live.`
        : "We rank states by the median advertised pay in current postings, and only for states with enough disclosed ranges to support a median. See the salary guide for the current ranking and each state's sample size."
    },
    {
      question: "How do psychiatric nurse practitioner salaries compare to other NP roles?",
      answer: "PMHNPs are widely considered one of the better-paid NP specialties, which is usually attributed to the shortage of psychiatric prescribers. We do not publish a cross-specialty comparison, because this board only carries PMHNP postings and we will not quote a figure for a specialty we have no data on. Our PMHNP medians come from advertised ranges in live postings and ship with their sample size."
    },
    {
      question: "Does having a DNP versus an MSN affect a PMHNP's salary?",
      answer: "In clinical roles, DNP and MSN PMHNPs typically earn similar salaries; the degree itself rarely commands a higher clinical wage. However, DNP holders have advantages in academic positions, executive leadership roles, and may qualify for higher-tier positions in hospital systems."
    },
    {
      question: "How can you make the most money as a PMHNP?",
      answer: "The levers most PMHNPs actually pull: practicing in a Full Practice Authority state, which opens independent and private practice; building depth in scarce areas like addiction, forensic, or child and adolescent psychiatry; weighing 1099 contract rates against W-2 packages honestly, including the tax and benefits difference; and negotiating total compensation rather than base alone. We do not attach a percentage premium to any of these, because we have no dataset that would support one. The Offer Analyzer shows where a specific offer sits against current advertised ranges."
    },
    {
      question: "What is the salary range for locum tenens PMHNP jobs?",
      answer: `Locum and travel contracts are usually quoted hourly and often look higher than a salaried role, but the quote typically excludes benefits and adds self-employment tax, so it is not a like-for-like comparison. Browse current locum tenens postings for real advertised rates, and use the salary converter to annualize an hourly quote over your actual schedule (a standard full-time year is ${STANDARD_ANNUAL_HOURS.toLocaleString()} hours).`
    },
  ];

  const scopeFaqs = [
    {
      question: "What is the scope of practice for a PMHNP?",
      answer: "A PMHNP's scope of practice includes conducting psychiatric evaluations, diagnosing mental health disorders (using DSM-5-TR criteria), prescribing psychotropic medications including controlled substances, providing psychotherapy (CBT, DBT, motivational interviewing), ordering and interpreting diagnostic tests, and managing treatment plans. The specific scope varies by state practice authority laws."
    },
    {
      question: "What are the certification requirements for PMHNP graduates?",
      // Fee amounts removed: the ANCC exam fee and the DEA registration fee
      // were quoted here as fixed dollar figures with no source and no review
      // date, and both are set by bodies that change them. Check the current
      // fee with the issuing body rather than with us.
      answer: "After graduating from an accredited PMHNP program, you must pass the ANCC PMHNP-BC exam, apply for state APRN licensure, obtain an NPI number, register with the DEA for prescriptive authority, and create a CAQH ProView profile for insurance credentialing. Board certification is renewed on a 5-year cycle. Current fees are published by ANCC and the DEA; confirm them there, since they change."
    },
    {
      question: "What extra certifications can a PMHNP get?",
      answer: "PMHNPs can pursue additional credentials including child and adolescent psychiatry specialization, addiction nursing certification (CARN-AP), forensic nursing certification, and geriatric psychiatry specialization. These open roles in scarcer niches, which is where the stronger offers tend to sit. We do not quote a percentage premium for any of them, because we have no dataset that would support one."
    },
    {
      question: "Are there state licensure rules that affect demand for PMHNPs?",
      answer: `Yes. States with Full Practice Authority (${FULL_PRACTICE_SUMMARY}, per the AANP State Practice Environment) allow PMHNPs to practice independently, driving higher demand and salaries. Reduced and restricted practice states require physician collaboration or supervision, which can limit the number of available positions and affect compensation. Our practice authority map at pmhnphiring.com/tools/practice-authority-map shows the classification for every state.`
    },
    {
      question: "What skills are employers seeking in PMHNP graduates?",
      answer: "Top skills employers seek include psychopharmacology expertise, prescriptive authority management, Epic/Cerner EHR proficiency, crisis intervention and de-escalation, evidence-based psychotherapy (CBT, motivational interviewing), cultural competence, telehealth platform experience, and experience with diverse populations including children, geriatric, and veterans."
    },
    {
      question: "What negotiation strategies can enhance salary offers for PMHNPs?",
      answer: "Go in with the market rate for your state and setting rather than a national figure: our salary guide publishes advertised medians by state with the sample size behind each one, and the Offer Analyzer places a specific offer against current postings. Negotiate total compensation, not base alone, which means the sign-on, the CME allowance, loan repayment assistance, PTO, and scheduling. We do not publish typical bonus amounts or a typical negotiated uplift, because those are not figures this site can compute."
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'FAQ', url: 'https://pmhnphiring.com/faq' },
      ]} />
      {/* FAQPage Schema for Google rich results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [...jobSeekerFaqs, ...employerFaqs, ...careerFaqs, ...salaryFaqs, ...scopeFaqs, ...generalFaqs].map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
              },
            })),
          }),
        }}
      />
      {/* Hero Section */}
      <section style={{ padding: '80px 16px 64px', maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: '32px', alignItems: 'center' }} className="faq-hero-grid">
              <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: '#FFF1F2', color: '#E11D48', borderRadius: '20px', fontSize: '13px', fontWeight: 700, marginBottom: '24px' }}>
                      <HelpCircle size={14} /> Knowledge Base
                  </div>
                  <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 3.5rem)', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', marginBottom: '16px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                      Frequently Asked <span style={{ color: '#E11D48' }}>Questions</span>
                  </h1>
                  <p style={{ fontSize: '20px', color: '#6B7F8A', lineHeight: 1.6, margin: 0, maxWidth: '500px' }}>
                      Find answers to common questions about PMHNP Hiring, platform features, salary benchmarks, and clinical credentials.
                  </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/clay_hero_faq.webp" alt="PMHNP Hiring FAQ" width={280} sizes="(max-width: 768px) 100vw, 280px" height={280} style={{ objectFit: 'contain', filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.15))' }} priority />
              </div>
          </div>
      </section>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* For Job Seekers FAQ */}
        <section className="mb-12">
          <Card padding="lg" variant="elevated">
            <h2 className="text-2xl font-bold mb-6 pb-4 border-b" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}>
              For Job Seekers
            </h2>
            <FAQAccordion items={jobSeekerFaqs} />
          </Card>
        </section>

        {/* For Employers FAQ */}
        <section className="mb-12">
          <Card padding="lg" variant="elevated">
            <h2 className="text-2xl font-bold mb-6 pb-4 border-b" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}>
              For Employers
            </h2>
            <FAQAccordion items={employerFaqs} />
          </Card>
        </section>

        {/* PMHNP Career & Education FAQ */}
        <section className="mb-12">
          <Card padding="lg" variant="elevated">
            <h2 className="text-2xl font-bold mb-6 pb-4 border-b" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}>
              PMHNP Career &amp; Education
            </h2>
            <FAQAccordion items={careerFaqs} />
          </Card>
        </section>

        {/* Salary & Compensation FAQ */}
        <section className="mb-12">
          <Card padding="lg" variant="elevated">
            <h2 className="text-2xl font-bold mb-6 pb-4 border-b" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}>
              Salary &amp; Compensation
            </h2>
            <FAQAccordion items={salaryFaqs} />
          </Card>
        </section>

        {/* Scope of Practice & Credentials FAQ */}
        <section className="mb-12">
          <Card padding="lg" variant="elevated">
            <h2 className="text-2xl font-bold mb-6 pb-4 border-b" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}>
              Scope of Practice &amp; Credentials
            </h2>
            <FAQAccordion items={scopeFaqs} />
          </Card>
        </section>

        {/* General FAQ */}
        <section className="mb-12">
          <Card padding="lg" variant="elevated">
            <h2 className="text-2xl font-bold mb-6 pb-4 border-b" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}>
              General Questions
            </h2>
            <FAQAccordion items={generalFaqs} />
          </Card>
        </section>

        {/* Still Have Questions Section */}
        <section>
          <Card padding="lg" variant="bordered" className="text-center">
            <Mail className="w-12 h-12 text-teal-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Still Have Questions?
            </h2>
            <p className="mb-6 max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Didn&apos;t find your answer? We&apos;re here to help. Reach out and we&apos;ll get back to you within 24 hours.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-lg mx-auto">
              <a href="mailto:support@pmhnphiring.com" className="w-full sm:w-auto">
                <Button variant="primary" size="lg" className="w-full">
                  <Mail size={20} />
                  Email Us
                </Button>
              </a>
              <Link href="/contact" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="w-full">
                  Contact Us
                </Button>
              </Link>
            </div>
          </Card>
        </section>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
          @media (max-width: 768px) {
              .faq-hero-grid { grid-template-columns: 1fr !important; text-align: center; }
              .faq-hero-grid > div:last-child { order: -1; }
              .faq-hero-grid > div:first-child p { margin-left: auto; margin-right: auto; }
          }
      ` }} />
    </div>
  );
}

