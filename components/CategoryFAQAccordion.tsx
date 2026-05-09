'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { FAQItem } from '@/lib/pseo/category-faq-data';

interface CategoryFAQAccordionProps {
    faqs: FAQItem[];
    categoryLabel: string;
}

export default function CategoryFAQAccordion({ faqs, categoryLabel }: CategoryFAQAccordionProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    if (faqs.length === 0) return null;

    return (
        <div style={{ background: '#FDFBF7' }}>
            <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
                    Common Questions
                </p>
                <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>
                    {categoryLabel} PMHNP Jobs — FAQ
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
    );
}
