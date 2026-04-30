'use client';

import { useEffect, useState } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { CONSENT_EVENT, hasAnalyticsConsent } from '@/lib/consent';

/**
 * Mounts Vercel Speed Insights only after the user has explicitly granted
 * analytics consent. Listens for the consent-changed event so it mounts
 * immediately on accept without a page reload.
 */
export default function ConsentGatedTelemetry() {
    const [allowed, setAllowed] = useState(false);

    useEffect(() => {
        setAllowed(hasAnalyticsConsent());
        const onChange = () => setAllowed(hasAnalyticsConsent());
        window.addEventListener(CONSENT_EVENT, onChange);
        return () => window.removeEventListener(CONSENT_EVENT, onChange);
    }, []);

    if (!allowed) return null;
    return <SpeedInsights />;
}
