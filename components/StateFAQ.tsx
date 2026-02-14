'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

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

export default function StateFAQ({
    stateName,
    stateCode,
    totalJobs,
    avgSalary,
    practiceAuthority,
}: StateFAQProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    // Generate state-specific FAQs
    const faqs: FAQItem[] = [
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
                : `PMHNP salaries in ${stateName} vary based on experience, setting, and job type. The national average for PMHNPs is approximately $155,000 per year. Check our salary guide for more detailed information about compensation by state and setting.`,
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

    // FAQ Schema for structured data
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

            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mt-8">
                <div className="flex items-center gap-2 mb-6">
                    <HelpCircle className="w-6 h-6 text-teal-600" />
                    <h2 className="text-2xl font-bold text-gray-900">
                        Frequently Asked Questions About PMHNP Jobs in {stateName}
                    </h2>
                </div>

                <div className="space-y-3">
                    {faqs.map((faq, index) => (
                        <div
                            key={index}
                            className="border border-gray-200 rounded-lg overflow-hidden"
                        >
                            <button
                                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                                className="w-full flex items-center justify-between p-4 text-left bg-gray-50 hover:bg-gray-100 transition-colors"
                            >
                                <span className="font-medium text-gray-900 pr-4">{faq.question}</span>
                                {openIndex === index ? (
                                    <ChevronUp className="w-5 h-5 text-gray-500 flex-shrink-0" />
                                ) : (
                                    <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
                                )}
                            </button>
                            {openIndex === index && (
                                <div className="p-4 bg-white border-t border-gray-200">
                                    <p className="text-gray-700 leading-relaxed">{faq.answer}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </section>
        </>
    );
}
