'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

interface FAQItem {
    question: string;
    answer: string;
}

interface CategoryFAQProps {
    category: 'remote' | 'telehealth' | 'travel' | 'new-grad' | 'per-diem' | 'inpatient' | 'outpatient' | 'substance-abuse' | 'child-adolescent' | 'addiction' | 'behavioral-health' | 'community-health' | 'metro';
    totalJobs: number;
    avgSalary?: number;
    /** Pass custom FAQs (e.g. from metro data) instead of using built-in ones */
    customFaqs?: { question: string; answer: string }[];
}

const CATEGORY_FAQS: Record<string, (props: CategoryFAQProps) => FAQItem[]> = {
    remote: ({ totalJobs, avgSalary }) => [
        {
            question: 'How many remote PMHNP jobs are available?',
            answer: `There are currently ${totalJobs} remote PMHNP job openings. These include fully remote, hybrid, and telehealth positions from leading healthcare companies and private practices. New remote positions are added daily.`,
        },
        {
            question: 'What is the average salary for remote PMHNP jobs?',
            answer: avgSalary
                ? `Remote PMHNP positions offer an average salary of approximately $${avgSalary.toLocaleString()} per year. Remote roles often offer competitive or higher compensation compared to in-person positions due to expanded patient reach and reduced overhead costs.`
                : 'Remote PMHNP salaries typically range from $130,000 to $200,000+ per year, depending on experience, patient panel size, and whether the position is W-2 or 1099. Many telehealth companies also offer productivity bonuses.',
        },
        {
            question: 'Do remote PMHNP jobs require multi-state licensure?',
            answer: 'It depends on the employer. Some telehealth companies require you to be licensed in the states where your patients reside, while others work within the PSYPACT compact or only serve patients in states where you hold an active license. Many employers assist with multi-state licensure costs.',
        },
        {
            question: 'What platforms do remote PMHNPs use for telehealth?',
            answer: 'Common platforms include Zoom for Healthcare, Doxy.me, SimplePractice, TherapyNotes, and proprietary EHR systems. Most employers provide the technology platform and training. You typically need a reliable internet connection, a private workspace, and HIPAA-compliant setup.',
        },
    ],
    telehealth: ({ totalJobs, avgSalary }) => [
        {
            question: 'How many telehealth PMHNP positions are available?',
            answer: `There are currently ${totalJobs} telehealth PMHNP positions available. Telehealth positions include video visits, phone consultations, and asynchronous psychiatric care roles across major telehealth platforms and health systems.`,
        },
        {
            question: 'What is the difference between telehealth and remote PMHNP jobs?',
            answer: 'Telehealth specifically refers to providing patient care virtually via video or phone. Remote PMHNP jobs may include telehealth patient care but also encompass roles like utilization review, case management, or clinical documentation that are done remotely but don\'t involve direct patient care via video.',
        },
        {
            question: 'What is the average telehealth PMHNP salary?',
            answer: avgSalary
                ? `Telehealth PMHNP positions offer an average salary of approximately $${avgSalary.toLocaleString()} per year. Compensation varies based on patient volume, state licensure, and employment type (W-2 vs 1099).`
                : 'Telehealth PMHNP salaries range from $120,000 to $200,000+ annually. Many telehealth companies offer productivity-based compensation where higher patient volumes lead to increased earnings.',
        },
        {
            question: 'What qualifications do I need for telehealth PMHNP jobs?',
            answer: 'You need an active PMHNP certification (ANCC), state APRN licensure, a master\'s or doctoral degree in psychiatric nursing, and typically 1-2 years of clinical experience. Some entry-level telehealth positions accept new graduates with supervision. Familiarity with EHR systems and telehealth platforms is preferred.',
        },
    ],
    travel: ({ totalJobs }) => [
        {
            question: 'How many travel PMHNP jobs are currently available?',
            answer: `There are currently ${totalJobs} travel and locum tenens PMHNP positions available nationwide. These positions offer short-term contracts (typically 8-26 weeks) in various healthcare settings across the country.`,
        },
        {
            question: 'How much do travel PMHNP positions pay?',
            answer: 'Travel PMHNP positions typically pay 20-40% more than permanent roles, with weekly rates ranging from $2,500 to $5,000+. Compensation often includes tax-free housing stipends, travel reimbursement, and per diem allowances in addition to base pay.',
        },
        {
            question: 'What benefits do travel PMHNP jobs include?',
            answer: 'Travel PMHNP benefits commonly include housing stipends or company-provided housing, travel reimbursement, health insurance, 401(k), licensure reimbursement, malpractice insurance coverage, and completion bonuses. Some agencies also offer continuing education stipends.',
        },
        {
            question: 'Do I need experience for travel PMHNP positions?',
            answer: 'Most travel PMHNP positions require 1-2 years of clinical experience, as you\'ll be expected to practice independently with minimal orientation. However, some agencies offer "first-time traveler" programs with additional support. Having an active compact nursing license (NLC) can expand your opportunities.',
        },
    ],
    'new-grad': ({ totalJobs }) => [
        {
            question: 'How many entry-level PMHNP jobs are available for new graduates?',
            answer: `There are currently ${totalJobs} PMHNP positions that welcome new graduates. These include fellowship programs, residency positions, and employer-sponsored training programs designed for recent PMHNP graduates.`,
        },
        {
            question: 'Can new graduate PMHNPs find jobs easily?',
            answer: 'Yes — demand for PMHNPs far exceeds supply. New graduates are highly sought after, with many employers offering structured orientation, mentorship, and collaborative practice agreements. The psychiatric NP field has one of the highest job placement rates among all NP specialties.',
        },
        {
            question: 'What should new grad PMHNPs look for in their first job?',
            answer: 'Key factors include: structured supervision and mentorship, manageable patient panel size (starting at 8-12 patients/day), access to collaborating physicians, continuing education support, malpractice insurance coverage, and clear pathways to independent practice. Avoid positions with unrealistic productivity expectations for new providers.',
        },
        {
            question: 'Are there PMHNP fellowship or residency programs?',
            answer: 'Yes, several healthcare systems offer PMHNP fellowship and residency programs lasting 6-12 months. These programs provide intensive clinical training, didactic education, and mentorship. While they may pay slightly less initially, they provide invaluable experience and often lead to permanent positions.',
        },
    ],
    'per-diem': ({ totalJobs }) => [
        {
            question: 'How many per diem PMHNP positions are available?',
            answer: `There are currently ${totalJobs} per diem and PRN PMHNP positions available. Per diem roles offer maximum flexibility, allowing you to set your own schedule and work as needed.`,
        },
        {
            question: 'How much do per diem PMHNPs earn?',
            answer: 'Per diem PMHNPs typically earn $80-$150+ per hour, which is often higher than the hourly equivalent of full-time positions. Rates vary by location, setting, and demand. Some per diem positions also offer shift differentials for weekends, evenings, or holidays.',
        },
        {
            question: 'What are the pros and cons of per diem PMHNP work?',
            answer: 'Pros: flexible scheduling, higher hourly rates, variety of clinical settings, and the ability to supplement full-time income. Cons: no guaranteed hours, typically no benefits (health insurance, PTO, retirement), inconsistent income, and you may need your own malpractice insurance.',
        },
        {
            question: 'Can per diem PMHNPs work at multiple facilities?',
            answer: 'Yes — per diem PMHNPs can typically work at multiple facilities simultaneously. This is one of the main advantages of per diem work. You\'ll need to ensure you have proper credentialing and privileges at each facility, and check for any non-compete clauses in your agreements.',
        },
    ],
    inpatient: ({ totalJobs, avgSalary }) => [
        {
            question: 'How many inpatient PMHNP jobs are available?',
            answer: `There are currently ${totalJobs} inpatient PMHNP positions available. These include hospital-based psychiatric units, acute care facilities, crisis stabilization centers, and residential treatment programs across the country.`,
        },
        {
            question: 'What is the average salary for inpatient PMHNPs?',
            answer: avgSalary
                ? `Inpatient PMHNP positions offer an average salary of approximately $${avgSalary.toLocaleString()} per year. Hospital-based roles often include shift differentials, sign-on bonuses, and comprehensive benefits packages.`
                : 'Inpatient PMHNP salaries typically range from $140,000 to $200,000+ per year. Hospital roles often include night/weekend shift differentials (10-20% extra), sign-on bonuses ($5K-$25K), and full benefits including retirement and tuition reimbursement.',
        },
        {
            question: 'What does an inpatient PMHNP do daily?',
            answer: 'Inpatient PMHNPs conduct psychiatric evaluations for new admissions, manage acute medication regimens, perform risk assessments, lead treatment team rounds, coordinate discharge planning, and provide crisis intervention. Typical caseloads range from 12-20 patients per shift depending on acuity.',
        },
        {
            question: 'Do I need experience for inpatient PMHNP positions?',
            answer: 'While many inpatient positions prefer 1-2 years of experience, some hospitals offer fellowship programs and structured orientation for new graduates. Inpatient settings provide excellent training in crisis management, psychopharmacology, and multidisciplinary collaboration that accelerates career growth.',
        },
    ],
    outpatient: ({ totalJobs, avgSalary }) => [
        {
            question: 'How many outpatient PMHNP jobs are available?',
            answer: `There are currently ${totalJobs} outpatient PMHNP positions available. These include private practices, community mental health centers, group practices, and integrated care clinics across the country.`,
        },
        {
            question: 'What is the average outpatient PMHNP salary?',
            answer: avgSalary
                ? `Outpatient PMHNP positions offer an average salary of approximately $${avgSalary.toLocaleString()} per year. Private practice PMHNPs can earn significantly more through productivity-based compensation models.`
                : 'Outpatient PMHNP salaries typically range from $130,000 to $190,000 for W-2 positions. Private practice owners can earn $200,000-$300,000+ depending on patient volume and insurance panel mix.',
        },
        {
            question: 'What does a typical outpatient PMHNP schedule look like?',
            answer: 'Most outpatient positions offer Monday-Friday, 8am-5pm schedules with no nights, weekends, or on-call requirements. Typical caseloads are 12-20 patients per day for medication management, or 6-8 if integrating therapy. Many clinics offer 4-day work weeks.',
        },
        {
            question: 'Can outpatient PMHNPs start their own private practice?',
            answer: 'Yes — outpatient experience is ideal preparation for private practice. In full practice authority states, PMHNPs can open independent practices. Most PMHNPs gain 2-3 years of supervised experience first, then transition to private practice earning $200K+ with full schedule control.',
        },
    ],
    'substance-abuse': ({ totalJobs }) => [
        {
            question: 'How many substance abuse PMHNP positions are available?',
            answer: `There are currently ${totalJobs} substance abuse and addiction PMHNP positions available. These include MAT clinics, residential rehab facilities, detox centers, and dual-diagnosis treatment programs.`,
        },
        {
            question: 'Do PMHNPs need special training for addiction treatment?',
            answer: 'While PMHNPs can prescribe buprenorphine (Suboxone) with their standard DEA registration, additional training in addiction medicine is highly recommended. ASAM certification, motivational interviewing training, and CE courses in substance use disorders enhance clinical effectiveness and marketability.',
        },
        {
            question: 'What does a substance abuse PMHNP do daily?',
            answer: 'Addiction PMHNPs manage MAT programs (buprenorphine, naltrexone), conduct substance use assessments, monitor urine drug screens, coordinate with therapists and counselors, manage psychiatric comorbidities, and develop relapse prevention plans. Many also provide group therapy facilitation.',
        },
        {
            question: 'Is there loan repayment for addiction PMHNP positions?',
            answer: 'Yes — many substance abuse positions in underserved areas qualify for National Health Service Corps (NHSC) loan repayment up to $50,000 for 2 years of service. Positions at nonprofit employers also qualify for Public Service Loan Forgiveness (PSLF) after 10 years of qualifying payments.',
        },
    ],
    'child-adolescent': ({ totalJobs }) => [
        {
            question: 'How many child & adolescent PMHNP jobs are available?',
            answer: `There are currently ${totalJobs} child and adolescent PMHNP positions available. These span children's hospitals, school-based health centers, pediatric clinics, residential treatment facilities, and community mental health agencies.`,
        },
        {
            question: 'Do PMHNPs need special certification for pediatric psychiatry?',
            answer: 'The standard PMHNP certification (ANCC) is across-the-lifespan and qualifies you to treat children. However, employers strongly prefer candidates with pediatric clinical experience. Some programs offer child/adolescent PMHNP concentrations, and post-graduate fellowships provide specialized training.',
        },
        {
            question: 'What conditions do child & adolescent PMHNPs treat?',
            answer: 'Common conditions include ADHD, anxiety disorders, depression, autism spectrum disorder (ASD), oppositional defiant disorder (ODD), eating disorders, trauma/PTSD, and emerging personality disorders. Prescribing requires careful attention to pediatric dosing, growth effects, and FDA guidelines.',
        },
        {
            question: 'Are school-based PMHNP positions available?',
            answer: 'Yes — school-based PMHNP positions are growing rapidly as districts address the youth mental health crisis. These roles typically follow the school calendar with summers off, offer competitive salaries, and provide a rewarding opportunity to serve children where they spend most of their day.',
        },
    ],
    addiction: (props) => CATEGORY_FAQS['substance-abuse'](props),
    'behavioral-health': ({ totalJobs, avgSalary }) => [
        {
            question: 'How many behavioral health NP jobs are available?',
            answer: `There are currently ${totalJobs} behavioral health nurse practitioner positions available. These span outpatient clinics, inpatient units, community mental health centers, telehealth platforms, and integrated care settings.`,
        },
        {
            question: 'What is the average salary for behavioral health NPs?',
            answer: avgSalary
                ? `Behavioral health NP positions offer an average salary of approximately $${avgSalary.toLocaleString()} per year. Salaries vary by setting, experience, and geographic location, with private practice and specialty roles earning significantly more.`
                : 'Behavioral health NP salaries typically range from $130,000 to $200,000+ per year. Private practice owners and specialty providers (addiction, forensic, child/adolescent) can earn $200K-$300K+.',
        },
        {
            question: 'What settings do behavioral health NPs work in?',
            answer: 'Behavioral health NPs work in diverse settings including outpatient mental health clinics, hospitals (inpatient psychiatry), community mental health centers (CMHCs), FQHCs, telehealth platforms, residential treatment facilities, correctional facilities, VA medical centers, schools, and private practice.',
        },
        {
            question: 'What qualifications are needed for behavioral health NP roles?',
            answer: 'You need a PMHNP-BC certification from ANCC, an active APRN license in your state, and a master\'s or doctoral degree in psychiatric-mental health nursing. Most positions also require DEA registration for prescribing controlled substances. Experience requirements vary from new-grad friendly to 3+ years depending on the role.',
        },
    ],
    'community-health': ({ totalJobs, avgSalary }) => [
        {
            question: 'How many community health PMHNP jobs are available?',
            answer: `There are currently ${totalJobs} community health PMHNP positions available. These include roles at Federally Qualified Health Centers (FQHCs), community mental health centers, public health clinics, and integrated primary-care settings serving underserved populations.`,
        },
        {
            question: 'What is the average salary for community health PMHNPs?',
            answer: avgSalary
                ? `Community health PMHNP positions offer an average salary of approximately $${avgSalary.toLocaleString()} per year. Many FQHC and public health roles also include NHSC loan repayment up to $50,000 and PSLF eligibility.`
                : 'Community health PMHNP salaries typically range from $120,000 to $170,000 per year. Positions at FQHCs often include loan repayment programs, federal benefits, and generous PTO that significantly boost total compensation.',
        },
        {
            question: 'What qualifications are needed for community health PMHNP roles?',
            answer: 'You need an active PMHNP-BC certification (ANCC), state APRN licensure, DEA registration, and ideally experience working with diverse, underserved populations. Bilingual skills (especially Spanish) are highly valued. Some positions accept new graduates with structured supervision.',
        },
        {
            question: 'Do community health PMHNPs qualify for loan repayment?',
            answer: 'Yes — many community health positions at FQHCs and nonprofit agencies qualify for National Health Service Corps (NHSC) loan repayment of up to $50,000 for two years of service. Positions at 501(c)(3) employers also qualify for Public Service Loan Forgiveness (PSLF) after 120 qualifying payments.',
        },
    ],
};

export default function CategoryFAQ({ category, totalJobs, avgSalary, customFaqs }: CategoryFAQProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    const faqs = customFaqs ?? (CATEGORY_FAQS[category]?.({ category, totalJobs, avgSalary }) ?? []);
    if (faqs.length === 0) return null;

    const categoryLabels: Record<string, string> = {
        remote: 'Remote',
        telehealth: 'Telehealth',
        travel: 'Travel',
        'new-grad': 'New Grad',
        'per-diem': 'Per Diem',
        inpatient: 'Inpatient',
        outpatient: 'Outpatient',
        'substance-abuse': 'Substance Abuse',
        'child-adolescent': 'Child & Adolescent',
        addiction: 'Addiction',
        'behavioral-health': 'Behavioral Health',
        'community-health': 'Community Health',
        metro: 'Metro',
    };

    // FAQ Schema for structured data (FAQPage)
    const faqSchema = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
            },
        })),
    };

    return (
        <>
            {/* FAQ Schema */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
            />

            <div style={{ background: '#FDFBF7' }}>
                <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
                        Common Questions
                    </p>
                    <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>
                        {categoryLabels[category]} PMHNP Jobs — FAQ
                    </h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {faqs.map((faq, index) => (
                            <div
                                key={index}
                                style={{
                                    background: '#FFFFFF',
                                    borderRadius: '16px',
                                    border: '1px solid rgba(255,255,255,0.5)',
                                    boxShadow: openIndex === index
                                        ? '6px 6px 20px rgba(0,0,0,0.08), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)'
                                        : '4px 4px 12px rgba(0,0,0,0.04), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
                                    overflow: 'hidden',
                                    transition: 'box-shadow 0.3s ease, transform 0.3s ease',
                                }}
                            >
                                <button
                                    onClick={() => setOpenIndex(openIndex === index ? null : index)}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '20px 24px',
                                        textAlign: 'left',
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#1A2E35', paddingRight: '16px', lineHeight: 1.4 }}>{faq.question}</span>
                                    <span style={{
                                        width: '28px', height: '28px', borderRadius: '8px',
                                        background: openIndex === index ? '#0D9488' : '#F0FDFA',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, transition: 'background 0.2s ease',
                                    }}>
                                        {openIndex === index ? (
                                            <ChevronUp size={16} style={{ color: '#fff' }} />
                                        ) : (
                                            <ChevronDown size={16} style={{ color: '#0D9488' }} />
                                        )}
                                    </span>
                                </button>
                                {openIndex === index && (
                                    <div style={{ padding: '0 24px 20px', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                                        <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: '16px 0 0' }}>{faq.answer}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </>
    );
}
