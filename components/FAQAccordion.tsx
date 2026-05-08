'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQAccordionProps {
  items: FAQItem[];
}

export default function FAQAccordion({ items }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleItem(index);
    }
  };

  return (
    <div className="divide-y divide-gray-200">
      {items.map((item: FAQItem, index: number) => {
        const isOpen = openIndex === index;

        return (
          <div key={index} className="border-b border-gray-200 last:border-b-0">
            {/* Question Button.
                SEO Fix H8: removed `focus:outline-none` so the global
                focus-visible ring renders for keyboard users (WCAG 2.4.7). */}
            <button
              onClick={() => toggleItem(index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className="w-full flex items-center justify-between py-4 text-left font-medium text-gray-900 hover:text-primary-600 transition-colors duration-200 focus:text-primary-600"
              aria-expanded={isOpen}
              aria-controls={`faq-answer-${index}`}
            >
              <span className="flex-1 pr-4">{item.question}</span>
              <ChevronDown
                aria-hidden="true"
                className={`w-5 h-5 text-gray-500 transition-transform duration-300 flex-shrink-0 ${
                  isOpen ? 'rotate-180 text-primary-600' : ''
                }`}
              />
            </button>

            {/* Answer.
                SEO Fix H8: previously used `max-h-0; opacity-0; aria-hidden`
                which keeps text in the tab order if a focusable child were
                ever added. The native `hidden` attribute (a) takes the
                element out of the accessibility tree completely when closed
                and (b) prevents tab focus on any child. The visual transition
                is preserved by only animating when open. */}
            <div
              id={`faq-answer-${index}`}
              hidden={!isOpen}
              className={isOpen ? 'overflow-hidden transition-all duration-300 ease-in-out max-h-96 opacity-100' : ''}
            >
              <div className="pb-4 text-gray-600 leading-relaxed">
                {item.answer}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

