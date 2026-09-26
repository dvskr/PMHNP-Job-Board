import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { brand } from '@/config/brand';
import { CONSENT_COOKIE, parseConsentCookie } from '@/lib/consent';
import DoNotSellClient from './DoNotSellClient';

/**
 * Server shell for the CCPA / CPRA opt-out.
 *
 * Two jobs the client component could not do:
 *   1. Export metadata. As a `'use client'` leaf the page inherited the ROOT
 *      title, description and og:url and emitted no canonical of its own, so
 *      a legal opt-out control described itself to crawlers as the homepage
 *      job board. noindex + follow matches the /data-request decision and the
 *      X-Robots-Tag middleware.ts already sends for this path.
 *   2. Read the stored choice. The consent cookie is HttpOnly (an XSS payload
 *      must not be able to flip or read it), so only a Server Component can
 *      see it. Without this the page forgot the opt-out on every reload and
 *      offered the button again, telling a visitor their request had not
 *      stuck when it had.
 */
export const metadata: Metadata = {
    title: 'Do Not Sell or Share My Personal Information',
    description: `Opt out of the sale or sharing of your personal information for cross-context behavioral advertising under CCPA and CPRA. ${brand.name} honors Global Privacy Control automatically.`,
    alternates: {
        canonical: `${brand.baseUrl}/do-not-sell`,
    },
    robots: { index: false, follow: true },
};

export default async function DoNotSellPage() {
    const stored = parseConsentCookie((await cookies()).get(CONSENT_COOKIE)?.value);
    // Opted out means every non-essential category is denied. A visitor who
    // has never answered the banner (null) is not opted out.
    const initialOptedOut = stored !== null && !stored.analytics && !stored.marketing;

    return <DoNotSellClient initialOptedOut={initialOptedOut} />;
}
