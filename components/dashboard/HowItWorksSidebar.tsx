'use client';

/**
 * "How this platform works" sidebar — explains the 3 application paths so
 * candidates can read the tier badges on their recommendations and on
 * search results without guessing what they mean.
 *
 * Lives in the dashboard left rail. Pure presentational, clay-styled to
 * match the rest of the dashboard surface.
 */

import React from 'react';
import { Zap, ExternalLink, Globe, ShieldCheck } from 'lucide-react';

const cardBase: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const pebble = (color: string, bg: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: bg,
    color,
    boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.04), 2px 2px 4px rgba(0,0,0,0.06)',
    border: '1px solid rgba(255,255,255,0.6)',
    flexShrink: 0,
});

interface RowProps {
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
    title: string;
    body: string;
}

function Row({ icon, iconBg, iconColor, title, body }: RowProps): React.JSX.Element {
    return (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={pebble(iconColor, iconBg)} aria-hidden="true">
                {icon}
            </span>
            <div style={{ minWidth: 0 }}>
                <p style={{ margin: '2px 0 2px', fontSize: '13px', fontWeight: 700, color: '#1A2E35' }}>{title}</p>
                <p style={{ margin: 0, fontSize: '12px', color: '#6B7F8A', lineHeight: 1.45 }}>{body}</p>
            </div>
        </div>
    );
}

export default function HowItWorksSidebar(): React.JSX.Element {
    return (
        <aside style={{ ...cardBase, padding: '20px 22px' }} aria-labelledby="how-it-works-heading">
            <header style={{ marginBottom: '14px' }}>
                <h2 id="how-it-works-heading" style={{
                    margin: '0 0 4px',
                    fontSize: '15px', fontWeight: 800,
                    fontFamily: 'var(--font-lora), Georgia, serif',
                    color: '#1A2E35',
                }}>
                    How this platform works
                </h2>
                <p style={{ margin: 0, fontSize: '12px', color: '#8A9BA6' }}>
                    Three ways to apply — what the badges mean.
                </p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <Row
                    icon={<Zap size={14} strokeWidth={2.5} />}
                    iconBg="#A7F3D0"
                    iconColor="#065F46"
                    title="⚡ Easy Apply"
                    body="One-click application right here. Fastest path. Posted by employers who hire on PMHNP Hiring."
                />

                <Row
                    icon={<ShieldCheck size={14} strokeWidth={2.5} />}
                    iconBg="#CCFBF1"
                    iconColor="#0F766E"
                    title="↗ Direct Apply"
                    body="Goes straight to the employer's careers site — no aggregator middlemen. Either employer-posted or a vetted partner link."
                />

                <Row
                    icon={<Globe size={14} strokeWidth={2.5} />}
                    iconBg="#E5E7EB"
                    iconColor="#4B5563"
                    title="Other listings"
                    body="Aggregated from partner sources. May redirect through their site and occasionally have stale links."
                />
            </div>

            <hr style={{ margin: '16px 0 12px', border: 0, borderTop: '1px solid rgba(0,0,0,0.06)' }} />

            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={pebble('#0D9488', '#CCFBF1')} aria-hidden="true">
                    <ExternalLink size={14} strokeWidth={2.5} />
                </span>
                <p style={{ margin: 0, fontSize: '12px', color: '#6B7F8A', lineHeight: 1.5 }}>
                    Your <strong style={{ color: '#1A2E35' }}>Recommended for you</strong> feed prioritizes Easy Apply and Direct Apply first — they convert faster and won't send you on a wild goose chase.
                </p>
            </div>
        </aside>
    );
}
