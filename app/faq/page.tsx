import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FAQAccordion from '@/components/FAQAccordion';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import VideoJsonLd from '@/components/VideoJsonLd';
import { Mail, HelpCircle } from 'lucide-react';
import { config } from '@/lib/config';

export const metadata: Metadata = {
  title: 'FAQ | PMHNP Jobs',
  description: 'Frequently asked questions about PMHNP Hiring. Learn how to search jobs, post positions, set up alerts, and make the most of the #1 PMHNP job board.',
  openGraph: {
    images: [{ url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-hiring-frequently-asked-questions.webp', width: 1280, height: 900, alt: 'PMHNP Hiring FAQ page with answers about job posting, salary transparency, job alerts, and employer features' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-hiring-frequently-asked-questions.webp'] },
  alternates: {
    canonical: 'https://pmhnphiring.com/faq',
  },
};

export default function FAQPage() {
  const jobSeekerFaqs = [
    {
      question: "Is PMHNP Jobs free to use?",
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

  const employerFaqs = [
    {
      question: "How much does it cost to post a job?",
      answer: `Your first ${config.freePostsPerEmail} job posts are completely FREE with all features included — no credit card required. After that, each additional post costs $${config.postingPrice} flat. Renewals are discounted at $${config.renewalPrice} (${Math.round((1 - config.renewalPrice / config.postingPrice) * 100)}% off).`
    },
    {
      question: "What features are included?",
      answer: `Every job post — free or paid — gets the same features: ${config.durationDays}-day listing, Featured badge, top placement in search results, company logo, full analytics with salary benchmarks, ${config.limits.candidateUnlocksPerPosting} candidate profile views, ${config.limits.inmailsPerPosting} InMails, up to 5 screening questions, and apply-on-platform.`
    },
    {
      question: "How long do job postings last?",
      answer: `All job postings are active for ${config.durationDays} days. You can renew your posting at any time from your employer dashboard for $${config.renewalPrice} (${Math.round((1 - config.renewalPrice / config.postingPrice) * 100)}% off the regular price).`
    },
    {
      question: "If I renew before my post expires, do I lose the remaining days?",
      answer: `No. Renewing early adds ${config.durationDays} days to your current expiration date — you keep every day you've already paid for. Renew on your schedule.`
    },
    {
      question: "What happens to candidates I've unlocked when my posting expires?",
      answer: "You keep them. Once you've unlocked a candidate (paid 1 of your 25 unlocks to view their full profile), their contact info, resume, and details remain accessible in your dashboard forever — even after the posting expires. To unlock new candidates or send new InMails, you'll need an active posting."
    },
    {
      question: "Can I edit my job posting?",
      answer: "Yes! You'll receive an edit link in your confirmation email. You can update your posting anytime—change salary, requirements, description, or any other details. Changes go live immediately."
    },
    {
      question: "How do I access my employer dashboard?",
      answer: "Check your confirmation email for a dashboard link. The dashboard allows you to view analytics, edit your posting, browse candidates, and manage all your job postings in one place. If you've lost the link, contact us at support@pmhnphiring.com."
    },
    {
      question: "Do you offer refunds?",
      answer: "Contact us at support@pmhnphiring.com within 7 days of posting if you're unsatisfied and we'll work with you. We want you to have a great experience and will do our best to resolve any issues."
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
      answer: "Becoming a PMHNP typically takes 6-8 years: 4 years for a BSN, 1-2 years of RN experience, and 2-3 years for an MSN or DNP with PMHNP specialization. Accelerated BSN-to-DNP programs can shorten this timeline."
    },
    {
      question: "What educational background is required for a PMHNP role?",
      answer: "You need a Bachelor of Science in Nursing (BSN), then a Master's (MSN) or Doctoral (DNP) degree with psychiatric-mental health specialization from a CCNE or ACEN accredited program. You must also pass the ANCC PMHNP-BC certification exam."
    },
    {
      question: "What is the difference between a PMHNP and a psychiatrist?",
      answer: "PMHNPs hold a Master's or Doctoral degree in nursing (2-4 years of graduate school), while psychiatrists complete medical school plus a 4-year residency. Both can diagnose and prescribe. In full practice authority states, PMHNPs practice independently. PMHNPs earn $155,000-$200,000+ vs psychiatrists' $250,000-$350,000+."
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
      answer: "The ROI is excellent. Graduate school costs $35,000-$80,000 for an MSN. PMHNPs earn an average of $155,000+ — roughly $75,000 more per year than an RN. Most PMHNPs pay off their graduate degree investment within 2-3 years of working."
    },
    {
      question: "What are the top 3 PMHNP jobs for new grads?",
      answer: "1) Community Mental Health Centers — structured settings with mentorship, often qualifying for HRSA loan repayment. 2) Outpatient group practices — collaborative environments with gradual caseload ramp-up. 3) VA psychiatric NP positions — federal benefits, pension, and residency programs for new graduates."
    },
  ];

  const salaryFaqs = [
    {
      question: "What is the average salary of a psychiatric nurse practitioner in the United States?",
      answer: "The average PMHNP salary in 2026 is $155,000-$165,000 per year. New graduates start at $115,000-$145,000, while experienced PMHNPs (7-15 years) earn $180,000-$210,000. Private practice owners can earn $200,000-$300,000+. The top 10% earn over $210,000 annually."
    },
    {
      question: "Which states pay the highest salaries for PMHNPs?",
      answer: "The highest-paying states for PMHNPs include Idaho ($205,080 average), New Jersey ($182,022), California ($181,670), Rhode Island ($175,530), and Washington ($173,331). When adjusted for cost of living, Idaho, Louisiana, Pennsylvania, Arkansas, and Missouri offer the best value."
    },
    {
      question: "How do psychiatric nurse practitioner salaries compare to other NP roles?",
      answer: "PMHNPs are among the highest-paid NP specialties. They earn 10-20% more than Family NPs (average $120,000-$135,000) and comparable to Acute Care NPs. This premium reflects the critical shortage of mental health providers and the specialized nature of psychiatric care."
    },
    {
      question: "Does having a DNP vs MSN affect a PMHNP's salary?",
      answer: "In clinical roles, DNP and MSN PMHNPs typically earn similar salaries — the degree itself rarely commands a higher clinical wage. However, DNP holders have advantages in academic positions, executive leadership roles, and may qualify for higher-tier positions in hospital systems."
    },
    {
      question: "How can you make the most money as a PMHNP?",
      answer: "Top strategies include: owning a private practice ($200K-$300K+), specializing in high-demand areas like addiction (+15-20% premium) or forensic psychiatry (+15-25%), practicing in Full Practice Authority states (+12-15% premium), working locum tenens ($150K-$250K), and always negotiating total compensation."
    },
    {
      question: "What is the salary range for locum tenens PMHNP jobs?",
      answer: "Locum tenens PMHNPs earn $150,000-$250,000+ annually, with hourly rates of $85-$150+. This includes housing stipends, travel allowances, and malpractice coverage. Locum tenens pay rates are typically 20-50% higher than permanent positions, making it one of the highest-earning PMHNP career paths."
    },
  ];

  const scopeFaqs = [
    {
      question: "What is the scope of practice for a PMHNP?",
      answer: "A PMHNP's scope of practice includes conducting psychiatric evaluations, diagnosing mental health disorders (using DSM-5-TR criteria), prescribing psychotropic medications including controlled substances, providing psychotherapy (CBT, DBT, motivational interviewing), ordering and interpreting diagnostic tests, and managing treatment plans. The specific scope varies by state practice authority laws."
    },
    {
      question: "What are the certification requirements for PMHNP graduates?",
      answer: "After graduating from an accredited PMHNP program, you must pass the ANCC PMHNP-BC exam ($395), apply for state APRN licensure, obtain an NPI number, register with the DEA for prescriptive authority ($888/3 years), and create a CAQH ProView profile for insurance credentialing. Board certification must be renewed every 5 years with 75 CE hours."
    },
    {
      question: "What extra certifications can a PMHNP get?",
      answer: "PMHNPs can pursue additional credentials including MAT/DATA waiver for addiction treatment, child and adolescent psychiatry specialization, addiction nursing certification (CARN-AP), forensic nursing certification, and geriatric psychiatry specialization. These certifications command 10-25% salary premiums."
    },
    {
      question: "Are there state licensure rules that affect demand for PMHNPs?",
      answer: "Yes. States with Full Practice Authority (34 states + DC) allow PMHNPs to practice independently, driving higher demand and salaries. Reduced and restricted practice states require physician collaboration or supervision, which can limit the number of available positions and affect compensation."
    },
    {
      question: "What skills are employers seeking in PMHNP graduates?",
      answer: "Top skills employers seek include psychopharmacology expertise, prescriptive authority management, Epic/Cerner EHR proficiency, crisis intervention and de-escalation, evidence-based psychotherapy (CBT, motivational interviewing), cultural competence, telehealth platform experience, and experience with diverse populations including children, geriatric, and veterans."
    },
    {
      question: "What negotiation strategies can enhance salary offers for PMHNPs?",
      answer: "Key strategies include researching market rates by state and setting, negotiating total compensation (not just base salary), asking for sign-on bonuses ($5,000-$30,000), requesting CME allowance ($2,000-$5,000/year), student loan repayment assistance, additional PTO, and flexible scheduling. PMHNPs who negotiate typically secure 5-15% higher starting salaries."
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <VideoJsonLd pathname="/faq" />
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'FAQ', url: 'https://pmhnphiring.com/faq' },
      ]} />
      {/* FAQPage Schema for Google rich results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
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
                      Find answers to common questions about PMHNP Jobs, platform features, salary benchmarks, and clinical credentials.
                  </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/clay_hero_faq.webp" alt="FAQ PMHNP Jobs" width={280} height={280} style={{ objectFit: 'contain', filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.15))' }} priority />
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

