'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shield, CheckCircle2 } from 'lucide-react';
import { denyAllConsent, updateConsentByCategories } from '@/lib/analytics';
import {
    ALL_DENIED,
    getPrivacySignal,
    setConsentCategories,
} from '@/lib/consent';
import { brand } from '@/config/brand';

const clayCard: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow:
        '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
};
const h2Style: React.CSSProperties = { fontSize: '20px', fontWeight: 700, color: '#1A2E35', marginBottom: '16px', marginTop: '32px' };
const pStyle: React.CSSProperties = { fontSize: '14px', color: '#4A5568', lineHeight: 1.75, marginBottom: '14px' };

/**
 * CCPA / CPRA "Do Not Sell or Share" page.
 *
 * Clicking opt-out:
 *   1. Calls denyAllConsent() (resets GA Consent Mode v2 signals)
 *   2. Persists ALL_DENIED categories in localStorage so the consent
 *      banner respects the choice and Speed Insights / GA stay off.
 *   3. Surfaces a confirmation + reminder that GPC is the most durable
 *      signal because it travels with the browser, not the device.
 */
export default function DoNotSellPage() {
    const [optedOut, setOptedOut] = useState(false);
    const [gpcActive, setGpcActive] = useState(false);

    useEffect(() => {
        setGpcActive(getPrivacySignal() !== null);
    }, []);

    const handleOptOut = async () => {
        denyAllConsent();
        updateConsentByCategories(ALL_DENIED);
        await setConsentCategories(ALL_DENIED);
        setOptedOut(true);
    };

    return (
        <div style={{ background: '#F5F0EB', minHeight: '100vh', padding: '48px 16px 80px' }}>
            <article style={{ ...clayCard, maxWidth: '720px', margin: '0 auto', padding: '48px 40px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: '#FEF3C7', color: '#92400E', borderRadius: '20px', fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>
                    <Shield size={14} /> CCPA / CPRA
                </div>
                <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.4rem)', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 16px 0', lineHeight: 1.15 }}>
                    Do Not Sell or Share My Personal Information
                </h1>
                <p style={pStyle}>
                    Under the California Consumer Privacy Act (CCPA) and the California Privacy Rights Act (CPRA),
                    you can opt out of the sale or &quot;sharing&quot; of your personal information for cross-context
                    behavioral advertising.
                </p>
                <p style={pStyle}>
                    {brand.name} does not sell personal information for money. Loading third-party analytics
                    (Google Analytics, Vercel Speed Insights) may meet the broader CPRA definition of
                    &quot;sharing&quot;. The button below opts your device out of all analytics and marketing
                    cookies. Essential cookies (login, security, fraud prevention) remain active because the
                    site won&apos;t function without them.
                </p>

                <h2 style={h2Style}>How to opt out</h2>
                {optedOut ? (
                    <div
                        style={{
                            ...clayCard,
                            padding: '20px 24px',
                            background: '#ECFDF5',
                            border: '1px solid rgba(5,150,105,0.25)',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                        }}
                    >
                        <CheckCircle2 size={22} style={{ color: '#059669', flexShrink: 0, marginTop: '2px' }} />
                        <div>
                            <p style={{ ...pStyle, marginBottom: '6px', color: '#065F46', fontWeight: 700 }}>
                                You&apos;re opted out on this device.
                            </p>
                            <p style={{ ...pStyle, marginBottom: 0, color: '#065F46' }}>
                                Analytics and marketing cookies are off. Clearing your browser data or switching
                                devices will reset this preference — re-visit this page or use Global Privacy
                                Control for a more durable opt-out.
                            </p>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={handleOptOut}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '14px 28px',
                            borderRadius: '14px',
                            background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                            color: '#fff',
                            fontSize: '15px',
                            fontWeight: 700,
                            border: '1px solid rgba(255,255,255,0.3)',
                            boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.25)',
                            cursor: 'pointer',
                        }}
                    >
                        Opt Out on This Device
                    </button>
                )}

                <h2 style={h2Style}>The most durable opt-out: Global Privacy Control</h2>
                <p style={pStyle}>
                    Global Privacy Control (GPC) is a browser-level signal that travels with you across every
                    site you visit. We honor it automatically — when GPC is on, the consent banner does not
                    appear and analytics never load.
                </p>
                {gpcActive ? (
                    <p style={{ ...pStyle, color: '#065F46', fontWeight: 600 }}>
                        ✓ Your browser is sending Global Privacy Control. We see it and we respect it on every page.
                    </p>
                ) : (
                    <p style={pStyle}>
                        Your browser is not currently sending Global Privacy Control. Most major browsers (Firefox,
                        Brave, DuckDuckGo) have it built in; for Chrome and Safari you can install the
                        <a href="https://privacybadger.org" target="_blank" rel="noopener noreferrer" style={{ color: '#0D9488', textDecoration: 'underline', marginLeft: '4px' }}>
                            Privacy Badger
                        </a>{' '}
                        extension which sends GPC automatically.
                    </p>
                )}

                <h2 style={h2Style}>Other rights</h2>
                <p style={pStyle}>
                    For requests to access, delete, correct, or limit the use of your sensitive personal
                    information, use our <Link href="/data-request" style={{ color: '#0D9488', textDecoration: 'underline' }}>Data Request form</Link> or
                    email <a href={`mailto:${brand.email.privacy}`} style={{ color: '#0D9488', textDecoration: 'underline' }}>{brand.email.privacy}</a>.
                </p>
                <p style={pStyle}>
                    Read the full <Link href="/privacy" style={{ color: '#0D9488', textDecoration: 'underline' }}>Privacy Policy</Link>.
                </p>
            </article>
        </div>
    );
}
