'use client';

/**
 * Semantic job search UI — Phase 1 Sprint 1.1.
 *
 * Mounted at /jobs/search. Uses the same clay design tokens as the other
 * /jobs category pages (FDFBF7 page bg, white clay cards, inset cream
 * recessed surfaces) and the existing <JobCard> component to render results
 * — no parallel design system.
 *
 * Free-text query → calls /api/jobs/search/semantic. Behind feature flag
 * `ai.search.semantic` (server-checked); when off, the API returns 404 and
 * we render a graceful empty-state pointing back to the main /jobs browse.
 */

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, Sparkles } from 'lucide-react';
import JobCard from '@/components/JobCard';
import type { Job } from '@/lib/types';

// Server returns Job-shaped rows + an aiMatchPercent override on each.
type SearchHit = Job & { aiMatchPercent: number };

interface SearchResponse {
    jobs: SearchHit[];
    degraded: boolean;
    mode: 'hybrid' | 'keyword';
    query: string;
}

const PAGE_BG = '#FDFBF7';

const clayCard: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const clayInput: React.CSSProperties = {
    width: '100%',
    padding: '12px 44px',
    fontSize: '15px',
    borderRadius: '14px',
    border: '1px solid rgba(0,0,0,0.08)',
    background: '#F5F0EB',
    color: '#1f1a17',
    boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.05), inset -1px -1px 2px rgba(255,255,255,0.5)',
    outline: 'none',
    transition: 'all 0.2s',
};

const clayBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '14px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    background: '#1f1a17',
    color: '#FDFBF7',
    border: '1px solid rgba(255,255,255,0.3)',
    boxShadow: '4px 4px 10px rgba(0,0,0,0.12), inset 1px 1px 2px rgba(255,255,255,0.15)',
    transition: 'all 0.2s',
};

export default function SemanticJobSearch(): React.JSX.Element {
    const searchParams = useSearchParams();
    const initialQ = searchParams.get('q') ?? '';
    const initialState = (searchParams.get('state') ?? '').toUpperCase().slice(0, 2);

    const [query, setQuery] = useState(initialQ);
    const [stateFilter, setStateFilter] = useState(initialState);
    const [results, setResults] = useState<SearchResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runSearch = useCallback(async (q: string, st: string): Promise<void> => {
        if (q.trim().length < 2) return;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ q: q.trim(), k: '20' });
            if (st) params.set('state', st);
            const res = await fetch(`/api/jobs/search/semantic?${params.toString()}`);
            if (res.status === 404) {
                setError('Smart search is not enabled yet. Browse all jobs below.');
                setResults(null);
                return;
            }
            if (!res.ok) {
                setError(`Search unavailable (${res.status}). Try the main browse instead.`);
                setResults(null);
                return;
            }
            const data = (await res.json()) as SearchResponse;
            setResults(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
            setResults(null);
        } finally {
            setLoading(false);
        }
    }, []);

    // Auto-execute when the page is opened with ?q=... so shareable / inbound
    // deep-links land on real results instead of an empty form.
    useEffect(() => {
        if (initialQ.trim().length >= 2) {
            void runSearch(initialQ, initialState);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleSearch(e: React.FormEvent): void {
        e.preventDefault();
        void runSearch(query, stateFilter);
    }

    return (
        <div style={{ backgroundColor: PAGE_BG, minHeight: '100vh' }}>
            <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
                {/* Hero */}
                <div className="mb-10">
                    <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#F5F0EB] px-3 py-1 text-xs font-medium uppercase tracking-wider text-[#3d342d]">
                        <Sparkles size={14} aria-hidden="true" />
                        Smart Search · beta
                    </p>
                    <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-[#1f1a17] sm:text-5xl">
                        Describe the role,
                        <br />
                        <span className="italic text-[#3d342d]">we&apos;ll find the fit.</span>
                    </h1>
                    <p className="mt-4 max-w-2xl text-base text-[#3d342d]">
                        Type the job you want in your own words — &ldquo;telehealth child psychiatry on the west coast&rdquo; —
                        and we&apos;ll match it semantically. No keyword guessing required.
                    </p>
                </div>

                {/* Search form — clay card */}
                <form onSubmit={handleSearch} style={clayCard} className="mb-8 p-5 sm:p-6">
                    <div className="space-y-4">
                        <div className="relative">
                            <Search
                                aria-hidden="true"
                                size={18}
                                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6b5d52]"
                            />
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="e.g. telehealth child psychiatry on the west coast"
                                style={clayInput}
                                aria-label="Describe the role you want"
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <input
                                type="text"
                                value={stateFilter}
                                onChange={(e) => setStateFilter(e.target.value.toUpperCase().slice(0, 2))}
                                placeholder="State (CA)"
                                aria-label="Optional state filter"
                                style={{ ...clayInput, padding: '10px 14px', width: '120px' }}
                                className="uppercase"
                            />
                            <button
                                type="submit"
                                disabled={loading || query.trim().length < 2}
                                style={clayBtn}
                                className="disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loading ? 'Searching…' : 'Find jobs'}
                            </button>
                        </div>
                    </div>
                </form>

                {error && (
                    <div role="alert" style={clayCard} className="mb-6 p-4 text-sm text-[#3d342d]">
                        <p className="font-medium">{error}</p>
                        <Link href="/jobs/full-time" className="mt-2 inline-block underline">
                            Browse all jobs →
                        </Link>
                    </div>
                )}

                {results?.degraded && (
                    <div role="status" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-900">
                        Smart search is temporarily unavailable — showing keyword matches.
                    </div>
                )}

                {results && results.jobs.length === 0 && !error && (
                    <div style={clayCard} className="p-6 text-center">
                        <p className="text-sm text-[#3d342d]">
                            No jobs matched your search. Try a broader query, or{' '}
                            <Link href="/jobs/full-time" className="underline">
                                browse all jobs
                            </Link>
                            .
                        </p>
                    </div>
                )}

                {results && results.jobs.length > 0 && (
                    <div className="space-y-4">
                        <p className="text-xs uppercase tracking-wider text-[#6b5d52]">
                            {results.jobs.length} matches for &ldquo;{results.query}&rdquo;
                        </p>
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {results.jobs.map((job) => (
                                <JobCard key={job.id} job={job} viewMode="grid" />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
