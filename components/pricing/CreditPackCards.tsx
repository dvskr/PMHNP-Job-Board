'use client';

/**
 * Prepaid posting credit packs, for agencies that post continuously.
 *
 * Every figure here is interpolated from lib/config.ts. The packs, their
 * prices, the per-post maths and the expiry window all live there, so the
 * page cannot drift from what /api/create-pack-checkout actually charges.
 *
 * The route resolves the pack id against the same catalogue and prices it
 * from config, so a tampered packId can select a different pack but never a
 * different price for one.
 */

import { useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { config, CreditPackOption } from '@/lib/config';

const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const dollars = (cents: number): string => (cents / 100).toLocaleString('en-US');

/** The pack that carries the emphasis, so the row has a hierarchy. */
const FEATURED_PACK_ID = 'pack5';

export default function CreditPackCards() {
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const buy = async (pack: CreditPackOption) => {
        setError(null);
        setPendingId(pack.id);
        try {
            const res = await fetch('/api/create-pack-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packId: pack.id }),
            });

            if (res.status === 401) {
                // Signed out. Come back here rather than dropping them on a
                // dashboard with no memory of what they were buying.
                window.location.href =
                    `/employer/login?redirectTo=${encodeURIComponent('/pricing#credit-packs')}`;
                return;
            }

            const data = (await res.json().catch(() => null)) as
                { url?: string; error?: string } | null;

            if (!res.ok || !data?.url) {
                setError(data?.error ?? 'Could not start checkout. Please try again.');
                setPendingId(null);
                return;
            }

            window.location.href = data.url;
        } catch {
            setError('Could not reach checkout. Check your connection and try again.');
            setPendingId(null);
        }
    };

    return (
        <section id="credit-packs" style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 20px 0' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
                For Agencies and Multi-Site Employers
            </p>
            <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', margin: '0 0 10px' }}>
                Buy Posts in Bulk
            </h2>
            <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '520px', margin: '0 auto 36px', lineHeight: 1.6 }}>
                Pay once, then post whenever a role opens. Credits work on any listing,
                carry the same full package, and stay good for {config.creditPackValidDays} days.
            </p>

            <div className="pack-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', alignItems: 'stretch' }}>
                {config.creditPacks.map((pack) => {
                    const isFeatured = pack.id === FEATURED_PACK_ID;
                    const perPost = config.creditPackPerPostPrice(pack);
                    const busy = pendingId === pack.id;

                    return (
                        <div
                            key={pack.id}
                            className="emp-bento-card"
                            style={{
                                ...clayCard,
                                padding: isFeatured ? '34px 26px 28px' : '28px 26px',
                                border: isFeatured ? '2px solid rgba(13,148,136,0.3)' : clayCard.border,
                                display: 'flex', flexDirection: 'column',
                                position: 'relative',
                            }}
                        >
                            {isFeatured && (
                                <div style={{
                                    position: 'absolute', top: '-1px', left: '50%', transform: 'translateX(-50%)',
                                    background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                                    fontSize: '10.5px', fontWeight: 700, padding: '5px 18px', borderRadius: '0 0 10px 10px',
                                    textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                                }}>Most Chosen</div>
                            )}

                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>
                                    {pack.credits} posts
                                </h3>
                                <span style={{
                                    fontSize: '11px', fontWeight: 700, color: '#0D9488',
                                    background: 'rgba(13,148,136,0.1)', padding: '3px 9px', borderRadius: '99px',
                                    whiteSpace: 'nowrap',
                                }}>
                                    Save {pack.savingsPercent}%
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginTop: '10px' }}>
                                <span style={{ fontSize: isFeatured ? '40px' : '34px', fontWeight: 800, color: '#134E4A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                                    ${dollars(pack.priceCents)}
                                </span>
                            </div>
                            <p style={{ fontSize: '13px', color: '#0D9488', fontWeight: 600, margin: '8px 0 0' }}>
                                About ${perPost} per post, against ${config.postingPrice} each
                            </p>

                            <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 22px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {[
                                    `${config.durationDays} day featured listing each`,
                                    `${config.limits.candidateUnlocksPerPosting} unlocks, ${config.limits.inmailsPerPosting} InMails per post`,
                                    `Credits last ${config.creditPackValidDays} days`,
                                ].map((feat) => (
                                    <li key={feat} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: '#5A4A42', lineHeight: 1.45 }}>
                                        <Check size={14} style={{ color: '#0D9488', flexShrink: 0, marginTop: '3px' }} /> {feat}
                                    </li>
                                ))}
                            </ul>

                            <button
                                type="button"
                                onClick={() => buy(pack)}
                                disabled={busy}
                                className="emp-cta-primary"
                                style={{
                                    marginTop: 'auto',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    padding: '12px 22px', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
                                    border: 'none', width: '100%',
                                    cursor: busy ? 'wait' : 'pointer',
                                    opacity: busy ? 0.75 : 1,
                                    background: isFeatured
                                        ? 'linear-gradient(145deg, #0D9488, #10B981)'
                                        : '#FFFFFF',
                                    color: isFeatured ? '#fff' : '#134E4A',
                                    boxShadow: isFeatured
                                        ? '4px 4px 12px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.15)'
                                        : 'inset 0 0 0 1px rgba(13,148,136,0.3)',
                                }}
                            >
                                {busy
                                    ? <><Loader2 size={15} className="pack-spin" /> Starting checkout</>
                                    : <>Buy {pack.credits} posts <ArrowRight size={15} /></>}
                            </button>
                        </div>
                    );
                })}
            </div>

            {error && (
                <p role="alert" style={{
                    marginTop: '16px', textAlign: 'center', fontSize: '13.5px', fontWeight: 600,
                    color: '#B91C1C', background: 'rgba(185,28,28,0.07)',
                    padding: '10px 16px', borderRadius: '10px',
                }}>
                    {error}
                </p>
            )}

            <p style={{ fontSize: '12.5px', color: '#7A6A62', textAlign: 'center', margin: '18px auto 0', maxWidth: '560px', lineHeight: 1.55 }}>
                Credits are drawn automatically the next time you post, soonest to expire first.
                Need more than {config.creditPacks[config.creditPacks.length - 1].credits} posts, or an invoice
                and a purchase order? Email support@pmhnphiring.com.
            </p>

            <style>{`
                .pack-spin { animation: pack-spin 0.9s linear infinite; }
                @keyframes pack-spin { to { transform: rotate(360deg); } }
                @media (prefers-reduced-motion: reduce) { .pack-spin { animation: none; } }
                @media (max-width: 860px) {
                    .pack-grid { grid-template-columns: 1fr !important; }
                }
            `}</style>
        </section>
    );
}
