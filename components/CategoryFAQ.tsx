import { jsonLdString } from '@/lib/seo/json-ld';
/**
 * CategoryFAQ — server-component wrapper.
 *
 * Renders FAQPage JSON-LD schema as static SSR HTML (so the schema is
 * present on first byte, with no hydration dependency), then delegates the
 * interactive accordion UI to a client-only sibling component.
 *
 * Drop-in replacement for the original 'use client' implementation: same
 * import path, same props. Consumers do not need to change.
 */
import CategoryFAQAccordion from './CategoryFAQAccordion';
import {
    getCategoryFaqs,
    CATEGORY_LABELS,
    type CategorySlug,
    type FAQItem,
} from '@/lib/pseo/category-faq-data';

interface CategoryFAQProps {
    category: CategorySlug;
    totalJobs: number;
    avgSalary?: number;
    /** Pass custom FAQs (e.g. from metro data) instead of using built-in ones */
    customFaqs?: FAQItem[];
}

export default function CategoryFAQ({ category, totalJobs, avgSalary, customFaqs }: CategoryFAQProps) {
    const faqs = getCategoryFaqs({ category, totalJobs, avgSalary, customFaqs });
    if (faqs.length === 0) return null;

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
            <CategoryFAQAccordion faqs={faqs} categoryLabel={CATEGORY_LABELS[category]} />
        </>
    );
}
