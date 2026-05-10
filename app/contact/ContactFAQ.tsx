'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FAQItem {
    q: string;
    a: string;
}

const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

export default function ContactFAQ({ items }: { items: FAQItem[] }) {
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {items.map((item, i) => (
                <div key={i} style={{ ...clayCard, overflow: 'hidden', padding: 0 }}>
                    <button
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '16px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                        }}
                        aria-expanded={openFaq === i}
                    >
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E35', paddingRight: '16px' }}>{item.q}</span>
                        <ChevronDown size={16} style={{ color: '#B0BEC5', flexShrink: 0, transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                    </button>
                    {openFaq === i && (
                        <div style={{ padding: '0 20px 16px', fontSize: '13px', color: '#6B7F8A', lineHeight: 1.6 }}>{item.a}</div>
                    )}
                </div>
            ))}
        </div>
    );
}
