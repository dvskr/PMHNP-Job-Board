import { jsonLdString } from '@/lib/seo/json-ld';
/**
 * StateFAQ — server-component wrapper.
 *
 * Computes the per-state FAQ list, emits FAQPage JSON-LD as static SSR HTML
 * on the server, then delegates the interactive accordion UI to a client-only
 * sibling component. Drop-in replacement for the original 'use client'
 * implementation: same import path, same props.
 */
import StateFAQAccordion from './StateFAQAccordion';
import { NATIONAL_AVG_PMHNP_SALARY_FORMATTED } from '@/lib/salary-stats';

interface FAQItem {
    question: string;
    answer: string;
}

interface StateFAQProps {
    stateName: string;
    stateCode: string;
    totalJobs: number;
    avgSalary: number;
    practiceAuthority?: 'full' | 'reduced' | 'restricted';
}

function buildStateFaqs({
    stateName,
    stateCode,
    totalJobs,
    avgSalary,
    practiceAuthority,
}: StateFAQProps): FAQItem[] {
    return [
        {
            question: `How many PMHNP jobs are available in ${stateName}?`,
            answer: totalJobs > 0
                ? `There are currently ${totalJobs} PMHNP job openings in ${stateName}. New positions are added daily as healthcare facilities, telehealth companies, and private practices post openings for psychiatric mental health nurse practitioners.`
                : `While there are no current PMHNP openings specifically in ${stateName}, new positions are added daily. Consider setting up a job alert to be notified when jobs become available, or explore remote/telehealth positions that may allow you to work from ${stateName}.`,
        },
        {
            question: `What is the average PMHNP salary in ${stateName}?`,
            answer: avgSalary > 0
                ? `The average PMHNP salary in ${stateName} is approximately $${avgSalary},000 per year. However, salaries can range significantly based on experience level, practice setting (hospital, outpatient, private practice), and whether the position is full-time, part-time, or per diem. Telehealth positions may offer different compensation structures.`
                : `PMHNP salaries in ${stateName} vary based on experience, setting, and job type. The national average for PMHNPs is approximately ${NATIONAL_AVG_PMHNP_SALARY_FORMATTED} per year. Check our salary guide for more detailed information about compensation by state and setting.`,
        },
        {
            question: `What are the PMHNP licensure requirements in ${stateName}?`,
            answer: practiceAuthority === 'full'
                ? `${stateName} has full practice authority for nurse practitioners, meaning PMHNPs can practice independently without physician oversight after meeting initial requirements. You'll need an active RN license in ${stateCode}, completion of an accredited PMHNP program, national certification (ANCC), and state APRN licensure.`
                : practiceAuthority === 'reduced'
                    ? `${stateName} has reduced practice authority, requiring PMHNPs to have a collaborative agreement with a physician. Requirements include an active RN license, completion of an accredited PMHNP program, national certification, state APRN licensure, and a documented collaborative practice agreement.`
                    : practiceAuthority === 'restricted'
                        ? `${stateName} has restricted practice authority, requiring physician supervision for PMHNPs. You'll need an active RN license, completion of an accredited PMHNP program, national certification, state APRN licensure, and a formal supervisory agreement with a licensed physician.`
                        : `To practice as a PMHNP in ${stateName}, you'll typically need an active RN license, completion of an accredited PMHNP graduate program, national certification through ANCC, and state APRN licensure. Contact the ${stateName} Board of Nursing for specific requirements.`,
        },
        {
            question: `Are there telehealth PMHNP jobs in ${stateName}?`,
            answer: `Yes, many telehealth and remote PMHNP positions are available that allow you to work from ${stateName}. Telehealth has expanded significantly in psychiatric care, making it possible to provide services from home. Note that you'll need to be licensed in the state where your patients are located, and some employers help with multi-state licensure.`,
        },
        {
            question: `What settings hire PMHNPs in ${stateName}?`,
            answer: `PMHNPs in ${stateName} work in various settings including community mental health centers, hospitals and psychiatric units, private practices, correctional facilities, substance abuse treatment centers, schools and universities, Veterans Affairs facilities, and telehealth companies. Each setting offers different patient populations, schedules, and compensation structures.`,
        },
    ];
}

export default function StateFAQ(props: StateFAQProps) {
    const faqs = buildStateFaqs(props);

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
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: jsonLdString(faqSchema) }}
            />
            <StateFAQAccordion stateName={props.stateName} faqs={faqs} />
        </>
    );
}
