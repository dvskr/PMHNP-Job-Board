'use client';

import { useEffect, useState } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { CONSENT_EVENT, type ConsentCategories } from '@/lib/consent';

interface Props {
    /** Read by the layout server component from the HttpOnly consent cookie. */
    initialConsent: ConsentCategories | null;
}

/**
 * Mounts Vercel Speed Insights only after the user has explicitly granted
 * analytics consent. Initial state comes from the server-rendered prop
 * (HttpOnly cookie); subsequent changes arrive via the consent-changed
 * event the banner dispatches on accept/deny.
 */
export default function ConsentGatedTelemetry({ initialConsent }: Props) {
    const [allowed, setAllowed] = useState<boolean>(initialConsent?.analytics === true);

    useEffect(() => {
        const onChange = (e: Event) => {
            const detail = (e as CustomEvent<ConsentCategories | null>).detail;
            setAllowed(detail?.analytics === true);
        };
        window.addEventListener(CONSENT_EVENT, onChange);
        return () => window.removeEventListener(CONSENT_EVENT, onChange);
    }, []);

    if (!allowed) return null;
    return <SpeedInsights />;
}
