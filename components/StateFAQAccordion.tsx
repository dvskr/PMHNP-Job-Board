'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

interface FAQItem {
    question: string;
    answer: string;
}

interface StateFAQAccordionProps {
    stateName: string;
    faqs: FAQItem[];
}

export default function StateFAQAccordion({ stateName, faqs }: StateFAQAccordionProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    if (faqs.length === 0) return null;

    return (
        <section className="bg-white dark:bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-gray-200 dark:border-[var(--border-color)] p-6 md:p-8 mt-8">
            <div className="flex items-center gap-2 mb-6">
                <HelpCircle className="w-6 h-6 text-teal-600" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-[var(--text-primary)]">
                    Frequently Asked Questions About PMHNP Jobs in {stateName}
                </h2>
            </div>

            <div className="space-y-3">
                {faqs.map((faq, index) => (
                    <div
                        key={index}
                        className="border border-gray-200 dark:border-[var(--border-color)] rounded-lg overflow-hidden"
                    >
                        <button
                            onClick={() => setOpenIndex(openIndex === index ? null : index)}
                            className="w-full flex items-center justify-between p-4 text-left bg-gray-50 hover:bg-gray-100 dark:bg-[var(--bg-tertiary)] dark:hover:bg-[var(--bg-primary)] transition-colors"
                        >
                            <span className="font-medium text-gray-900 dark:text-[var(--text-primary)] pr-4">{faq.question}</span>
                            {openIndex === index ? (
                                <ChevronUp className="w-5 h-5 text-gray-500 flex-shrink-0" />
                            ) : (
                                <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
                            )}
                        </button>
                        {openIndex === index && (
                            <div className="p-4 bg-white dark:bg-[var(--bg-secondary)] border-t border-gray-200 dark:border-[var(--border-color)]">
                                <p className="text-gray-700 dark:text-[var(--text-secondary)] leading-relaxed">{faq.answer}</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
