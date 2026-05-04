'use client';

/**
 * "For you" recommendations panel — Phase 1 Sprint 1.2.2.
 *
 * Drop into the candidate dashboard. Fetches the latest recommendation batch
 * via /api/recommendations and renders a compact ranked list with a match
 * badge per item. Clicking through fires /api/recommendations/click before
 * navigating, so we capture the engagement signal.
 *
 * If the feature flag is off (server returns enabled=false) or there are
 * zero recs (new candidate before the first cron run), the component renders
 * nothing — no awkward empty state cluttering the dashboard.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface RecJob {
    id: string;
    title: string;
    employer: string;
    state: string | null;
    isRemote: boolean;
    displaySalary: string | null;
    slug: string | null;
    isFeatured: boolean;
    descriptionSummary: string | null;
}

interface Recommendation {
    id: string;
    rank: number;
    matchPercent: number;
    reason: string | null;
    job: RecJob;
}

interface ApiResponse {
    enabled: boolean;
    recommendations: Recommendation[];
}

export default function ForYouRecommendations(): React.JSX.Element | null {
    const [data, setData] = useState<ApiResponse | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        fetch('/api/recommendations')
            .then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
            .then((json: ApiResponse) => setData(json))
            .catch(() => setError(true));
    }, []);

    if (error || !data || !data.enabled || data.recommendations.length === 0) {
        return null;
    }

    return (
        <section aria-labelledby="for-you-heading" className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
            <header className="mb-3 flex items-center justify-between">
                <div>
                    <h2 id="for-you-heading" className="text-lg font-semibold tracking-tight">For you</h2>
                    <p className="text-xs text-gray-500">Personalized matches based on your profile.</p>
                </div>
            </header>

            <ul className="divide-y divide-gray-100">
                {data.recommendations.map((rec) => (
                    <li key={rec.id} className="py-3">
                        <Link
                            href={rec.job.slug ? `/jobs/${rec.job.slug}` : '#'}
                            onClick={() => trackClick(rec.id)}
                            className="block focus:outline-none focus:ring-2 focus:ring-blue-200 rounded"
                        >
                            {/* Per-recommendation relevance badge intentionally
                                omitted — list order conveys the ranking signal
                                and the raw cosine % invites false precision. */}
                            <div className="min-w-0">
                                <p className="truncate font-medium text-gray-900">{rec.job.title}</p>
                                <p className="truncate text-xs text-gray-600">
                                    {rec.job.employer}
                                    {rec.job.state ? ` · ${rec.job.state}` : ''}
                                    {rec.job.isRemote ? ' · Remote' : ''}
                                    {rec.job.displaySalary ? ` · ${rec.job.displaySalary}` : ''}
                                </p>
                            </div>
                            {rec.reason && (
                                <p className="mt-1 text-xs italic text-gray-500">{rec.reason}</p>
                            )}
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function trackClick(recommendationId: string): void {
    // Fire-and-forget; never block navigation.
    fetch('/api/recommendations/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendationId }),
        keepalive: true,
    }).catch(() => undefined);
}

