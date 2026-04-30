'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import {
    denyAllConsent,
    grantAllConsent,
    updateConsentByCategories,
} from '@/lib/analytics';
import {
    ALL_DENIED,
    ALL_GRANTED,
    ANALYTICS_ONLY,
    CONSENT_REOPEN_EVENT,
    getConsent,
    getConsentCategories,
    getConsentRegion,
    getPrivacySignal,
    setConsent,
    setConsentCategories,
    type ConsentCategories,
} from '@/lib/consent';

/**
 * Cookie consent banner — Consent Mode v2 compliant with granular categories.
 *
 * Decision tree on mount:
 *   1. Privacy signal (Sec-GPC, DNT) → record all-denied, no banner.
 *   2. Implied-consent region (US, RoW) → auto-grant analytics-only,
 *      no banner. User can revoke via footer "Cookie Settings".
 *   3. Strict-consent region (EEA, UK, CH, CA, BR, AU) → show banner.
 *
 * Categories map to Google Consent Mode v2 signals:
 *   essential  → security_storage, functionality_storage (always on)
 *   analytics  → analytics_storage, personalization_storage
 *   marketing  → ad_storage, ad_user_data, ad_personalization
 */
export default function CookieConsent() {
    const [show, setShow] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [cats, setCats] = useState<ConsentCategories>(ALL_DENIED);

    const evaluate = useCallback(() => {
        // 1. Honor browser privacy signals — legal requirement under CCPA/CPRA.
        const signal = getPrivacySignal();
        if (signal) {
            denyAllConsent();
            setConsent('denied');
            setShow(false);
            return;
        }

        // 2. Respect any prior, still-current-version choice.
        if (getConsent() !== null) {
            setShow(false);
            return;
        }

        // 3. Implied-consent regions: grant analytics only, suppress banner.
        if (getConsentRegion() === 'implied') {
            updateConsentByCategories(ANALYTICS_ONLY);
            setConsentCategories(ANALYTICS_ONLY);
            setShow(false);
            return;
        }

        // 4. Strict-consent regions: show banner after small delay.
        setTimeout(() => setShow(true), 1500);
    }, []);

    useEffect(() => {
        evaluate();
        const onReopen = () => {
            // Pre-populate toggles with current saved state when re-opened.
            const saved = getConsentCategories();
            if (saved) setCats(saved);
            setExpanded(false);
            setShow(true);
        };
        window.addEventListener(CONSENT_REOPEN_EVENT, onReopen);
        return () => window.removeEventListener(CONSENT_REOPEN_EVENT, onReopen);
    }, [evaluate]);

    const acceptAll = () => {
        setShow(false);
        setExpanded(false);
        grantAllConsent();
        setConsentCategories(ALL_GRANTED);
    };

    const declineAll = () => {
        setShow(false);
        setExpanded(false);
        denyAllConsent();
        setConsentCategories(ALL_DENIED);
    };

    const savePreferences = () => {
        setShow(false);
        setExpanded(false);
        updateConsentByCategories(cats);
        setConsentCategories(cats);
    };

    if (!show) return null;

    return (
        <div
            className="fixed bottom-0 left-0 right-0 z-[9990] p-4"
            style={{
                backgroundColor: '#F5F0EB',
                backdropFilter: 'blur(8px)',
                borderTop: '1px solid rgba(90,74,66,0.10)',
                boxShadow: '0 -4px 20px rgba(90,74,66,0.08)',
            }}
            role="dialog"
            aria-label="Cookie consent"
            aria-describedby="cookie-consent-description"
        >
            <div className="max-w-5xl mx-auto">
                {/* ─── Top row: message + collapsed actions ─── */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-sm" style={{ color: '#5A4A42' }}>
                        <Shield size={18} style={{ color: '#0D9488', flexShrink: 0 }} />
                        <p id="cookie-consent-description">
                            We use cookies for analytics and to improve your experience.
                            By continuing, you agree to our{' '}
                            <a href="/privacy" className="underline" style={{ color: '#0D9488', fontWeight: 600 }}>
                                Privacy Policy
                            </a>.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            onClick={declineAll}
                            className="px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
                            style={{
                                color: '#5A4A42',
                                backgroundColor: '#EDE7E0',
                                border: '1px solid rgba(255,255,255,0.5)',
                            }}
                        >
                            Decline
                        </button>
                        <button
                            onClick={() => setExpanded((v) => !v)}
                            className="px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer flex items-center gap-1"
                            style={{
                                color: '#5A4A42',
                                backgroundColor: 'transparent',
                                border: '1px solid rgba(90,74,66,0.20)',
                            }}
                            aria-expanded={expanded}
                            aria-controls="cookie-consent-categories"
                        >
                            Customize
                            {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        </button>
                        <button
                            onClick={acceptAll}
                            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all cursor-pointer"
                            style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)' }}
                        >
                            Accept All
                        </button>
                        <button
                            onClick={declineAll}
                            className="p-2 rounded-lg transition-colors cursor-pointer"
                            style={{ color: '#7A6A62' }}
                            aria-label="Close"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* ─── Expanded panel: per-category toggles ─── */}
                {expanded && (
                    <div
                        id="cookie-consent-categories"
                        className="mt-4 pt-4"
                        style={{ borderTop: '1px solid rgba(90,74,66,0.10)' }}
                    >
                        <CategoryRow
                            title="Essential"
                            description="Required for authentication, security, and core site functionality. Always on."
                            locked
                            checked
                        />
                        <CategoryRow
                            title="Analytics"
                            description="Helps us understand how visitors use the site so we can improve it. (Google Analytics, Vercel Speed Insights.)"
                            checked={cats.analytics}
                            onChange={(v) => setCats((p) => ({ ...p, analytics: v }))}
                        />
                        <CategoryRow
                            title="Marketing"
                            description="Personalized job recommendations and advertising relevance. (Currently no advertising partners; reserved for future use.)"
                            checked={cats.marketing}
                            onChange={(v) => setCats((p) => ({ ...p, marketing: v }))}
                        />
                        <div className="flex justify-end mt-3">
                            <button
                                onClick={savePreferences}
                                className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all cursor-pointer"
                                style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)' }}
                            >
                                Save Preferences
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Per-category row ───────────────────────────────────────────────
interface CategoryRowProps {
    title: string;
    description: string;
    checked: boolean;
    locked?: boolean;
    onChange?: (next: boolean) => void;
}

function CategoryRow({ title, description, checked, locked = false, onChange }: CategoryRowProps) {
    const id = `consent-cat-${title.toLowerCase()}`;
    return (
        <div className="flex items-start justify-between gap-4 py-2">
            <label htmlFor={id} className="flex-1 cursor-pointer">
                <div className="text-sm font-semibold" style={{ color: '#3D2E24' }}>{title}</div>
                <div className="text-xs mt-0.5" style={{ color: '#7A6A62' }}>{description}</div>
            </label>
            <ConsentToggle
                id={id}
                checked={checked}
                disabled={locked}
                onChange={onChange ?? (() => { /* locked */ })}
            />
        </div>
    );
}

// ─── Toggle switch ──────────────────────────────────────────────────
interface ConsentToggleProps {
    id: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (next: boolean) => void;
}

function ConsentToggle({ id, checked, disabled = false, onChange }: ConsentToggleProps) {
    return (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            aria-disabled={disabled}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            style={{
                width: 36,
                height: 20,
                borderRadius: 999,
                border: '1px solid rgba(90,74,66,0.20)',
                backgroundColor: checked ? '#0D9488' : '#EDE7E0',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.6 : 1,
                position: 'relative',
                flexShrink: 0,
                transition: 'background-color 0.15s ease',
            }}
        >
            <span
                aria-hidden
                style={{
                    position: 'absolute',
                    top: 1,
                    left: checked ? 17 : 1,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: '#FFFFFF',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    transition: 'left 0.15s ease',
                }}
            />
        </button>
    );
}
