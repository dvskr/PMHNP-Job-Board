import { Metadata } from 'next';
import Link from 'next/link';
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
    images: [{ url: '/images/pages/pmhnp-hiring-frequently-asked-questions.webp', width: 1280, height: 900, alt: 'PMHNP Hiring FAQ page with answers about job posting, salary transparency, job alerts, and employer features' }],
  },
  twitter: { card: 'summary_large_image', images: ['/images/pages/pmhnp-hiring-frequently-asked-questions.webp'] },
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
      answer: config.isPaidPostingEnabled
        ? "We offer three posting tiers: Starter ($199) for a 30-day listing, Growth ($299) with featured placement and 25 candidate unlocks/posting, and Premium ($399) with 90-day listing, unlimited unlocks, and social media promotion."
        : "During our launch period, job postings are completely FREE! This includes all tiers. Take advantage of this limited-time offer to get your positions in front of qualified PMHNPs."
    },
    {
      question: "Is there a free trial?",
      answer: config.isPaidPostingEnabled
        ? "We don't offer a free trial, but our pricing is straightforward with no hidden fees. You only pay when you post a job, and your listing stays active for 30 days."
        : "Even better - we're currently offering FREE job postings during our launch period! No credit card required. Simply create your listing and it goes live immediately."
    },
    {
      question: "What are the differences between tiers?",
      answer: config.isPaidPostingEnabled
        ? "Starter gets you a 30-day listing with basic analytics and 5 candidate unlocks/posting. Growth adds a featured badge, top search placement, 25 candidate unlocks/posting, and 25 InMails/posting for 60 days. Premium extends to 90 days with unlimited unlocks, unlimited InMails, social media promotion, and dedicated support."
        : "Growth jobs appear at the top of search results, are highlighted in job alerts, and display a prominent 'Featured' badge. During our free launch period, all tiers are free - we recommend choosing Growth for maximum visibility!"
    },
    {
      question: "How long do job postings last?",
      answer: config.isPaidPostingEnabled
        ? "Starter postings are active for 30 days. Growth postings are active for 60 days. Premium postings are active for 90 days. You can renew your posting at any time from your employer dashboard before or after it expires."
        : "All postings are active for 30 days. You can renew your posting at any time from your employer dashboard before or after it expires - completely free during our launch period!"
    },
    {
      question: "Can I edit my job posting?",
      answer: "Yes! You'll receive an edit link in your confirmation email. You can update your posting anytime—change salary, requirements, description, or any other details. Changes go live immediately."
    },
    {
      question: "How do I access my employer dashboard?",
      answer: config.isPaidPostingEnabled
        ? "Check your confirmation email for a dashboard link. The dashboard allows you to view analytics, edit your posting, renew listings, and manage all your job postings in one place. If you've lost the link, contact us at support@pmhnphiring.com."
        : "Check your confirmation email for a dashboard link. The dashboard allows you to view analytics, edit your posting, and renew listings for free during our launch period. If you've lost the link, contact us at support@pmhnphiring.com."
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
      <section className="bg-gradient-to-br from-teal-600 to-teal-800 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <HelpCircle className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-xl text-teal-100 max-w-3xl mx-auto">
            Find answers to common questions about PMHNP Jobs, careers, salary, and credentials
          </p>
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
    </div>
  );
}

