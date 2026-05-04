'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Users, Loader2, X, ChevronLeft, ChevronRight, Briefcase, Lock, Sparkles } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import CandidateCard from './CandidateCard';

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */
const SPECIALTY_PRESETS = [
    'ADHD', 'Anxiety/Depression', 'PTSD', 'Addiction',
    'Child & Adolescent', 'Geriatric', 'Eating Disorders',
    'OCD', 'Bipolar', 'Schizophrenia', 'General Adult',
];
const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];
const WORK_MODES = ['Remote', 'On-site', 'Hybrid', 'Telehealth', 'Any'];
const EXPERIENCE_OPTIONS = [
    { label: 'Any Level', value: '' },
    { label: 'New Grad', value: '0' },
    { label: '1+ years', value: '1' },
    { label: '3+ years', value: '3' },
    { label: '5+ years', value: '5' },
    { label: '10+ years', value: '10' },
    { label: '15+ years', value: '15' },
    { label: '20+ years', value: '20' },
];

/* ═══════════════════════════════════════════
   CLAY DESIGN TOKENS — match the redesigned employer dashboard
   (cream #F5F0EB page bg, white cards, neutral inset surfaces)
   ═══════════════════════════════════════════ */
const cardBase: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const cardRecessed: React.CSSProperties = {
    background: '#F5F0EB',
    borderRadius: '14px',
    border: '1px solid rgba(0,0,0,0.04)',
    boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.04), inset -1px -1px 2px rgba(255,255,255,0.4)',
};

const clayInput: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    fontSize: '13px',
    borderRadius: '12px',
    border: '1px solid rgba(0,0,0,0.08)',
    background: '#F5F6F8',
    color: '#1A2E35',
    boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.05), inset -1px -1px 2px rgba(255,255,255,0.5)',
    outline: 'none',
    transition: 'all 0.2s',
};

const clayBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '8px 16px', borderRadius: '12px',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '3px 3px 8px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.5)',
    transition: 'all 0.2s',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Candidate = any;

interface SmartMatchState {
    /**
     * 'idle' = Smart Match hasn't run yet (or just toggled off).
     * 'loading' = request in flight.
     * 'ready' = response with candidates.
     * 'limit_reached' = 429 daily cap; banner + upgrade CTA.
     * 'disabled' = 404 from the API (feature flag is off for this employer).
     * 'unavailable' = transient error (network, 5xx); user should retry.
     */
    status: 'idle' | 'loading' | 'ready' | 'limit_reached' | 'disabled' | 'unavailable';
    /** Daily reranks remaining after the latest call. */
    usesRemaining: number | null;
    /** 429-message rendered as the limit banner. */
    limitMessage: string | null;
}

export default function CandidateSearchClient() {
    const searchParams = useSearchParams();
    /** Smart Match is on if `?ai=1` is in the URL, OR after the user clicks the toggle. */
    // ?postingId=X deep-link → auto-fire JD-driven Smart Match against
    // that posting on mount. ?ai=1 (legacy) just opens Smart Match in
    // free-text mode.
    const initialPostingId = searchParams.get('postingId');
    // AI search is always on for the talent pool — typing fires the
    // semantic + rerank pipeline by default. The legacy ?ai=1 flag and
    // toggle button are gone; the only fallback to plain keyword search
    // is when the rerank API returns 429 (daily cap hit) or 5xx.
    const [aiMode, setAiMode] = useState(true);
    /**
     * When set, the next Smart Match call uses postingId instead of a
     * typed query — embeds the JD's title + description against the
     * candidate vectors. Clicking the action button next to the posting
     * selector sets this; typing in the search bar clears it.
     */
    const [jdSearchPostingId, setJdSearchPostingId] = useState<string | null>(initialPostingId);
    /** Title of the posting being JD-matched, for the result banner. */
    const [jdSearchTitle, setJdSearchTitle] = useState<string | null>(null);
    /** Underlying rerank failure message from the last call (dev only).
     *  Non-null iff the LLM rerank failed and we fell back to vector order. */
    const [rerankError, setRerankError] = useState<string | null>(null);
    const [aiState, setAiState] = useState<SmartMatchState>({
        status: 'idle', usesRemaining: null, limitMessage: null,
    });

    const [query, setQuery] = useState('');
    const [experience, setExperience] = useState('');
    const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
    const [selectedStates, setSelectedStates] = useState<string[]>([]);
    const [workMode, setWorkMode] = useState('');
    const [hasResume, setHasResume] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem('talentPool_page');
            return saved ? parseInt(saved, 10) : 1;
        }
        return 1;
    });
    const [loading, setLoading] = useState(true);
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
    const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
    const [unlockUsage, setUnlockUsage] = useState<{ used: number; limit: number | null; unlimited: boolean } | null>(null);
    const [postings, setPostings] = useState<{ id: string; jobId: string; jobTitle: string; tier: string; unlocks: { used: number; limit: number; remaining: number }; inmails: { used: number; limit: number; remaining: number } }[]>([]);
    const [selectedPostingId, setSelectedPostingId] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            return sessionStorage.getItem('talentPool_posting') || '';
        }
        return '';
    });

    // Persist page and posting to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('talentPool_page', String(page));
    }, [page]);
    useEffect(() => {
        if (selectedPostingId) {
            sessionStorage.setItem('talentPool_posting', selectedPostingId);
        }
    }, [selectedPostingId]);

    const fetchCandidates = useCallback(async () => {
        setLoading(true);

        // ── Smart Match path — POST to /api/employer/talent/search ──────
        // Two sub-modes:
        //   - jdSearchPostingId set → JD-driven match. Server loads the
        //     posting and embeds its title + description.
        //   - free-text → user-typed query (≥3 chars).
        // When neither applies in AI mode we silently fall back to the
        // standard browse so the page never feels empty after toggling on.
        const hasJd = aiMode && !!jdSearchPostingId;
        const hasText = aiMode && query.trim().length >= 3;
        if (hasJd || hasText) {
            setAiState((s) => ({ ...s, status: 'loading' }));
            try {
                const requestBody = hasJd
                    ? {
                        postingId: jdSearchPostingId,
                        states: selectedStates.length > 0 ? selectedStates : undefined,
                        k: 25,
                    }
                    : {
                        query: query.trim(),
                        states: selectedStates.length > 0 ? selectedStates : undefined,
                        k: 25,
                    };
                const res = await fetch('/api/employer/talent/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                });
                if (res.status === 404) {
                    // Feature flag is off for this employer — surface
                    // distinct "disabled" state so the banner can be honest
                    // about why (vs a transient outage).
                    setAiState({ status: 'disabled', usesRemaining: null, limitMessage: null });
                } else if (res.status === 429) {
                    const data = await res.json().catch(() => ({}));
                    setAiState({
                        status: 'limit_reached',
                        usesRemaining: 0,
                        limitMessage: data.message || 'Daily AI search limit reached.',
                    });
                    // Fall through to keyword browse so the page still works
                    // — limit only blocks AI rerank, not regular search.
                    // The user can type a name/specialty and get keyword
                    // results until midnight CT.
                } else if (res.ok) {
                    const data = await res.json();
                    setCandidates(data.candidates || []);
                    setTotalCount((data.candidates || []).length);
                    setTotalPages(1); // Smart Match returns a single ranked slate; no pagination.
                    // For JD-driven matches the server returns the posting
                    // title; surface it on the result banner.
                    setJdSearchTitle(typeof data.postingTitle === 'string' ? data.postingTitle : null);
                    // If the rerank failed and we fell back to vector
                    // order, the API returns `rerankError` with the
                    // underlying message (dev only). Surface it so the
                    // page tells the truth instead of silently degrading.
                    setRerankError(typeof data.rerankError === 'string' ? data.rerankError : null);
                    setAiState({
                        status: 'ready',
                        usesRemaining: typeof data.rerankUsesRemaining === 'number' ? data.rerankUsesRemaining : null,
                        limitMessage: null,
                    });
                    setLoading(false);
                    return;
                } else {
                    setAiState({ status: 'unavailable', usesRemaining: null, limitMessage: null });
                }
            } catch {
                setAiState({ status: 'unavailable', usesRemaining: null, limitMessage: null });
            }
            // Fall through to standard browse on unavailable — keep results visible.
        }

        // Build params for the regular browse.
        //
        // When falling through from an AI flag-off or transient outage
        // (status='disabled' or 'unavailable'), we DROP the query text —
        // AI-style queries are sentences, not substrings, and passing
        // them to the keyword endpoint reliably matches zero candidates.
        //
        // When falling through because the daily AI cap is hit
        // (status='limit_reached'), we KEEP the query — the user is
        // still actively trying to search; they should be able to keep
        // working with keyword search the rest of the day.
        const fallingBackFromAiSilently = aiMode
            && query.trim().length >= 3
            && (aiState.status === 'disabled' || aiState.status === 'unavailable');
        const params = new URLSearchParams();
        if (query && !fallingBackFromAiSilently) params.set('q', query);
        if (experience) params.set('experience', experience);
        if (selectedSpecialties.length) params.set('specialties', selectedSpecialties.join(','));
        if (selectedStates.length) params.set('states', selectedStates.join(','));
        if (workMode) params.set('workMode', workMode);
        if (hasResume) params.set('hasResume', hasResume);
        params.set('page', String(page));
        params.set('limit', '20');

        try {
            const res = await fetch(`/api/employer/candidates?${params}`);
            if (res.ok) {
                const data = await res.json();
                setCandidates(data.candidates);
                setTotalCount(data.totalCount);
                setTotalPages(data.totalPages);
                if (data.viewedCandidateIds) {
                    setViewedIds(new Set(data.viewedCandidateIds));
                }
            }
        } catch { /* silent */ }
        setLoading(false);
    }, [aiMode, jdSearchPostingId, query, experience, selectedSpecialties, selectedStates, workMode, hasResume, page]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(fetchCandidates, 300);
        return () => clearTimeout(timer);
    }, [fetchCandidates]);

    // Fetch saved candidate IDs + usage
    useEffect(() => {
        (async () => {
            try {
                const savedUrl = selectedPostingId
                    ? `/api/employer/saved-candidates?postingId=${selectedPostingId}`
                    : '/api/employer/saved-candidates';
                const [savedRes, usageRes] = await Promise.all([
                    fetch(savedUrl),
                    fetch('/api/employer/usage'),
                ]);
                if (savedRes.ok) {
                    const data = await savedRes.json();
                    setSavedIds(new Set(data.savedCandidates.map((s: { candidate: { id: string } }) => s.candidate.id)));
                }
                if (usageRes.ok) {
                    const usageData = await usageRes.json();
                    setUnlockUsage(usageData.usage?.candidateUnlocks || null);
                    // Seed AI usage so the tracker badge shows the right
                    // count on page load (used to start at 0/10 and only
                    // update after the first search completed).
                    const ai = usageData.usage?.aiSearches as
                        | { used: number; limit: number; remaining: number }
                        | undefined;
                    if (ai) {
                        const atLimit = ai.remaining <= 0;
                        setAiState({
                            status: atLimit ? 'limit_reached' : 'idle',
                            usesRemaining: ai.remaining,
                            limitMessage: atLimit
                                ? `You've used your ${ai.limit} AI searches for today. Resets at midnight Central Time.`
                                : null,
                        });
                    }
                    if (usageData.postings) {
                        setPostings(usageData.postings);
                        // Restore from sessionStorage or default to first
                        if (usageData.postings.length > 0 && !selectedPostingId) {
                            const savedPosting = sessionStorage.getItem('talentPool_posting');
                            const match = savedPosting ? usageData.postings.find((p: { id: string }) => p.id === savedPosting) : null;
                            setSelectedPostingId(match ? match.id : usageData.postings[0].id);
                        }
                    }
                }
            } catch { /* silent */ }
        })();
    }, [selectedPostingId]);

    const toggleSave = async (candidateId: string) => {
        const wasSaved = savedIds.has(candidateId);
        setSavedIds(prev => {
            const next = new Set(prev);
            if (wasSaved) next.delete(candidateId); else next.add(candidateId);
            return next;
        });
        try {
            if (wasSaved) {
                await fetch('/api/employer/saved-candidates', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ candidateId, postingId: selectedPostingId || undefined }),
                });
            } else {
                await fetch('/api/employer/saved-candidates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ candidateId, postingId: selectedPostingId || undefined }),
                });
            }
        } catch {
            setSavedIds(prev => {
                const next = new Set(prev);
                if (wasSaved) next.add(candidateId); else next.delete(candidateId);
                return next;
            });
        }
    };

    useEffect(() => {
        setPage(1);
    }, [query, experience, selectedSpecialties, selectedStates, workMode, hasResume]);

    // (Smart Match toggle removed — AI is always the engine for typed
    // queries on this page. The aiMode state stays as a flag in case
    // future flows need to disable AI temporarily.)

    const toggleSpecialty = (s: string) => {
        setSelectedSpecialties(prev =>
            prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
        );
    };

    const toggleState = (s: string) => {
        setSelectedStates(prev =>
            prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
        );
    };

    const clearFilters = () => {
        setQuery('');
        setExperience('');
        setSelectedSpecialties([]);
        setSelectedStates([]);
        setWorkMode('');
        setHasResume('');
    };

    const activeFilterCount = [
        experience,
        selectedSpecialties.length > 0 ? '1' : '',
        selectedStates.length > 0 ? '1' : '',
        workMode,
        hasResume,
    ].filter(Boolean).length;

    return (
        <div style={{ background: '#F5F0EB' }}>
            {/* ═══ Hero Header ═══ */}
            <div style={{
                padding: '20px 16px 16px',
                background: 'linear-gradient(180deg, #EDE7E0 0%, #F5F0EB 100%)',
                borderBottom: '1px solid #E5DDD3',
            }}>
                <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '48px', height: '48px', borderRadius: '16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(145deg, #10B981, #0D9488)', color: '#fff', flexShrink: 0,
                        boxShadow: '4px 4px 10px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                    }}>
                        <Users size={22} />
                    </div>
                    <div>
                        <h1 style={{
                            fontSize: '24px', fontWeight: 800,
                            fontFamily: 'var(--font-lora), Georgia, serif',
                            color: '#1A2E35', margin: '0 0 2px',
                        }}>PMHNP Talent Pool</h1>
                        <p style={{ fontSize: '13px', color: '#6B7F8A', margin: 0 }}>
                            {loading ? 'Loading...' : `${totalCount} qualified candidate${totalCount !== 1 ? 's' : ''} available`}
                        </p>
                    </div>
                </div>
            </div>

            <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '20px 16px 48px' }}>

                {/* ═══ Posting Selector ═══ */}
                {postings.length > 0 && (
                    <div style={{
                        ...cardBase, padding: '14px 18px', marginBottom: '16px',
                        display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            <Briefcase size={14} style={{ color: '#0D9488' }} />
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6B7F8A' }}>Using credits from:</span>
                        </div>
                        <select
                            value={selectedPostingId}
                            onChange={e => setSelectedPostingId(e.target.value)}
                            style={{ ...clayInput, flex: 1, minWidth: '200px' }}
                        >
                            {postings.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.jobTitle} ({p.tier.charAt(0).toUpperCase() + p.tier.slice(1)}) — {p.unlocks.remaining === -1 ? '∞' : p.unlocks.remaining} unlocks left
                                </option>
                            ))}
                        </select>
                        {(() => {
                            const sel = postings.find(p => p.id === selectedPostingId);
                            if (!sel) return null;
                            const unlockPct = sel.unlocks.limit > 0 ? (sel.unlocks.used / sel.unlocks.limit) * 100 : 0;
                            const inmailPct = sel.inmails.limit > 0 ? (sel.inmails.used / sel.inmails.limit) * 100 : 0;
                            return (
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{
                                        ...cardRecessed, padding: '4px 10px', fontSize: '11px', fontWeight: 600,
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        color: unlockPct >= 100 ? '#DC2626' : unlockPct >= 80 ? '#D97706' : '#6B7F8A',
                                    }}>
                                        <Lock size={10} />
                                        {sel.unlocks.remaining === -1 ? '∞ unlocks' : `${sel.unlocks.remaining}/${sel.unlocks.limit} unlocks`}
                                    </span>
                                    <span style={{
                                        ...cardRecessed, padding: '4px 10px', fontSize: '11px', fontWeight: 600,
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        color: inmailPct >= 100 ? '#DC2626' : inmailPct >= 80 ? '#D97706' : '#6B7F8A',
                                    }}>
                                        ✉ {sel.inmails.remaining === -1 ? '∞ InMails' : `${sel.inmails.remaining}/${sel.inmails.limit} InMails`}
                                    </span>
                                </div>
                            );
                        })()}
                        {/* JD-driven Smart Match — Sprint 1.3.6.
                            Skip the typing step; embed the posting's JD
                            against candidate vectors. Forces aiMode on and
                            sets jdSearchPostingId so the next fetch fires
                            against /api/employer/talent/search with
                            { postingId } instead of { query }. */}
                        {selectedPostingId && (() => {
                            const atLimit = aiState.status === 'limit_reached';
                            return (
                                <button
                                    onClick={() => {
                                        if (atLimit) return;
                                        setAiMode(true);
                                        setQuery('');
                                        setJdSearchPostingId(selectedPostingId);
                                        setJdSearchTitle(null);
                                    }}
                                    disabled={atLimit}
                                    className="tp-filter-btn"
                                    title={atLimit
                                        ? 'Daily AI search limit reached. Resets at midnight Central Time.'
                                        : 'Use this posting\'s job description as the AI search query'}
                                    style={{
                                        ...clayBtn,
                                        background: atLimit
                                            ? '#E5E7EB'
                                            : 'linear-gradient(145deg, #8B5CF6, #7C3AED)',
                                        color: atLimit ? '#9CA3AF' : '#fff',
                                        border: atLimit ? '1px solid #D1D5DB' : '1px solid #A78BFA',
                                        boxShadow: atLimit
                                            ? 'inset 1px 1px 2px rgba(0,0,0,0.04)'
                                            : '3px 3px 8px rgba(124,58,237,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                                        cursor: atLimit ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    <Sparkles size={13} /> Find AI Matches for this Posting
                                </button>
                            );
                        })()}
                    </div>
                )}

                {/* ═══ AI tracker chip + Search bar + Filters — single row ═══
                    Tracker chip on the left mirrors the UNLOCKS / INMAILS
                    chip pattern from the dashboard (icon-square + label +
                    count + thin progress bar pinned to bottom). Search
                    bar fills remaining space; same visual height. */}
                {(() => {
                    const cap = 10;
                    const usesRemaining = aiState.usesRemaining;
                    const used = usesRemaining === null ? 0 : Math.max(0, cap - usesRemaining);
                    const atLimit = aiState.status === 'limit_reached' || used >= cap;
                    const isNearLimit = used >= cap * 0.8;
                    const valueColor = atLimit ? '#EF4444' : isNearLimit ? '#F59E0B' : '#1A2E35';
                    const accent = '#7C3AED';
                    const pct = Math.min((used / cap) * 100, 100);
                    const barGradient = atLimit
                        ? 'linear-gradient(90deg, #EF4444, #F87171)'
                        : isNearLimit
                            ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                            : 'linear-gradient(90deg, #7C3AED, #A78BFA)';

                    return (
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'stretch' }}>
                            {/* AI Searches chip — proper clay styling matching cardBase
                                tokens used elsewhere on this page. Multi-layer shadows
                                (outer drop + outer light + inset highlights) so it
                                feels carved, not flat. Border color escalates with
                                usage; the icon square is a gradient pill, not a
                                flat tint. */}
                            <div
                                style={{
                                    ...cardBase,
                                    borderRadius: '16px',
                                    border: atLimit
                                        ? '1px solid rgba(239,68,68,0.30)'
                                        : isNearLimit
                                            ? '1px solid rgba(251,191,36,0.35)'
                                            : '1px solid rgba(124,58,237,0.18)',
                                    padding: '12px 16px',
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    flexShrink: 0, minWidth: '200px',
                                    position: 'relative', overflow: 'hidden',
                                }}
                                title={atLimit
                                    ? 'AI search limit reached for today. Resets at midnight Central Time.'
                                    : `${used} of ${cap} AI searches used today. Resets at midnight Central Time.`}
                            >
                                {/* Icon square — soft purple gradient with inner highlight */}
                                <div style={{
                                    width: '34px', height: '34px', borderRadius: '11px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: atLimit
                                        ? 'linear-gradient(145deg, #FCA5A5, #F87171)'
                                        : isNearLimit
                                            ? 'linear-gradient(145deg, #FCD34D, #F59E0B)'
                                            : 'linear-gradient(145deg, #C4B5FD, #A78BFA)',
                                    color: '#fff',
                                    flexShrink: 0,
                                    boxShadow: '3px 3px 8px rgba(124,58,237,0.18), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 1px rgba(0,0,0,0.05)',
                                }}>
                                    <Sparkles size={15} />
                                </div>
                                <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                                    <span style={{
                                        fontSize: '10px', fontWeight: 700, color: '#8A9BA6',
                                        textTransform: 'uppercase', letterSpacing: '0.08em',
                                        whiteSpace: 'nowrap',
                                    }}>AI Searches</span>
                                    <span style={{
                                        fontSize: '15px', fontWeight: 800,
                                        color: valueColor,
                                        fontVariantNumeric: 'tabular-nums',
                                        whiteSpace: 'nowrap',
                                        letterSpacing: '0.01em',
                                    }}>
                                        {used}<span style={{ opacity: 0.4, fontWeight: 700 }}>/{cap}</span>
                                    </span>
                                </div>
                                {/* Inset progress trough pinned to the bottom edge */}
                                <div style={{
                                    position: 'absolute', left: '12px', right: '12px', bottom: '6px',
                                    height: '3px', borderRadius: '2px',
                                    background: 'rgba(0,0,0,0.05)',
                                    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.04)',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{
                                        width: `${pct}%`, height: '100%', borderRadius: '2px',
                                        background: barGradient,
                                        transition: 'width 0.6s ease',
                                        boxShadow: '0 0 4px rgba(124,58,237,0.25)',
                                    }} />
                                </div>
                            </div>

                            {/* Search bar (clay) + inline AI submit */}
                            <div style={{ flex: 1, minWidth: '240px', position: 'relative', display: 'flex' }}>
                                <Search size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#B0C4BC' }} />
                                    <input
                                        type="text"
                                        value={query}
                                        onChange={e => {
                                            setQuery(e.target.value);
                                            if (jdSearchPostingId) {
                                                setJdSearchPostingId(null);
                                                setJdSearchTitle(null);
                                            }
                                        }}
                                        placeholder='Describe the candidate you need (e.g., "experienced CA-licensed telehealth PMHNP")'
                                        style={{
                                            ...clayInput,
                                            paddingLeft: '38px',
                                            paddingRight: '90px',
                                            fontSize: '14px',
                                        }}
                                    />
                                    {/* Inline AI Search button — sits inside the search bar */}
                                    <button
                                        type="button"
                                        disabled={atLimit || query.trim().length < 3}
                                        onClick={() => {
                                            if (atLimit || query.trim().length < 3) return;
                                            // Force a fetch by re-triggering the debounced effect.
                                            // The query change already triggers fetchCandidates;
                                            // this button is the explicit submit affordance.
                                            setAiMode(true);
                                        }}
                                        title={atLimit
                                            ? 'AI search limit reached. Resets at midnight CT.'
                                            : query.trim().length < 3
                                                ? 'Type at least 3 characters'
                                                : 'Run AI search'}
                                        style={{
                                            position: 'absolute',
                                            right: '6px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            cursor: (atLimit || query.trim().length < 3) ? 'not-allowed' : 'pointer',
                                            background: atLimit
                                                ? '#E5E7EB'
                                                : 'linear-gradient(145deg, #8B5CF6, #7C3AED)',
                                            color: atLimit ? '#9CA3AF' : '#fff',
                                            border: atLimit ? '1px solid #D1D5DB' : '1px solid #A78BFA',
                                            boxShadow: atLimit
                                                ? 'inset 1px 1px 2px rgba(0,0,0,0.04)'
                                                : '2px 2px 6px rgba(124,58,237,0.25)',
                                            opacity: query.trim().length < 3 ? 0.55 : 1,
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        <Sparkles size={11} />
                                        AI Search
                                    </button>
                                </div>

                                <button
                                    onClick={() => setShowFilters(!showFilters)}
                                    className="tp-filter-btn"
                                    style={{
                                        ...clayBtn,
                                        background: showFilters ? '#CCFBF1' : '#F7FBF8',
                                        color: showFilters ? '#0D9488' : '#2A4A5A',
                                        border: showFilters ? '1px solid #99F6E4' : '1px solid rgba(255,255,255,0.5)',
                                    }}
                                >
                                    <Filter size={14} />
                                    Filters
                                    {activeFilterCount > 0 && (
                                        <span style={{
                                            background: '#0D9488', color: '#fff',
                                            fontSize: '10px', fontWeight: 700,
                                            padding: '1px 7px', borderRadius: '10px',
                                        }}>
                                            {activeFilterCount}
                                        </span>
                                    )}
                                </button>
                                {activeFilterCount > 0 && (
                                    <button onClick={clearFilters} className="tp-filter-btn" style={{
                                        ...clayBtn, background: '#FEE2E2', color: '#DC2626',
                                        border: '1px solid #FECACA',
                                    }}>
                                        <X size={13} /> Clear
                                    </button>
                                )}
                        </div>
                    );
                })()}

                {/* Limit-reached banner removed — the tracker badge above
                    already shows '10/10 — resets at midnight CT' in red,
                    so this was redundant noise. */}
                {aiMode && aiState.status === 'disabled' && (
                    <div style={{
                        ...cardRecessed, padding: '12px 16px', marginBottom: '16px',
                        fontSize: '12px', color: '#92400E',
                    }}>
                        AI search isn&rsquo;t enabled on your account yet — contact support if you&rsquo;d like early access.
                    </div>
                )}
                {aiMode && aiState.status === 'unavailable' && (
                    <div style={{
                        ...cardRecessed, padding: '12px 16px', marginBottom: '16px',
                        fontSize: '12px', color: '#92400E',
                    }}>
                        AI search is temporarily unavailable — try again in a moment.
                    </div>
                )}
                {/* Removed: helper text below the search bar — the placeholder
                    inside the input + the AI Search button's disabled state
                    already convey the same guidance without taking visual space. */}

                {/* ═══ Filter Panel ═══ */}
                {showFilters && (
                    <div style={{
                        ...cardBase, padding: '20px', marginBottom: '20px',
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px',
                    }}>
                        {/* Experience */}
                        <div>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: '#B0C4BC', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>Experience</label>
                            <select value={experience} onChange={e => setExperience(e.target.value)} style={clayInput}>
                                {EXPERIENCE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Work Mode */}
                        <div>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: '#B0C4BC', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>Work Mode</label>
                            <select value={workMode} onChange={e => setWorkMode(e.target.value)} style={clayInput}>
                                <option value="">Any Mode</option>
                                {WORK_MODES.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>

                        {/* Has Resume */}
                        <div>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: '#B0C4BC', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>Resume</label>
                            <select value={hasResume} onChange={e => setHasResume(e.target.value)} style={clayInput}>
                                <option value="">Any</option>
                                <option value="true">Has Resume</option>
                                <option value="false">No Resume</option>
                            </select>
                        </div>

                        {/* Specialties */}
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: '#B0C4BC', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', display: 'block' }}>Specialties</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {SPECIALTY_PRESETS.map(s => {
                                    const selected = selectedSpecialties.includes(s);
                                    return (
                                        <button
                                            key={s}
                                            onClick={() => toggleSpecialty(s)}
                                            style={{
                                                fontSize: '12px', padding: '5px 12px', borderRadius: '10px',
                                                fontWeight: selected ? 600 : 400, cursor: 'pointer',
                                                background: selected ? '#EDE9FE' : '#EDF5F0',
                                                color: selected ? '#7C3AED' : '#6B7F8A',
                                                border: `1px solid ${selected ? '#C4B5FD' : '#D5E8E0'}`,
                                                boxShadow: selected
                                                    ? '2px 2px 6px rgba(124,58,237,0.1)'
                                                    : 'inset 1px 1px 3px rgba(0,60,50,0.04)',
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {s}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Licensed States */}
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: '#B0C4BC', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', display: 'block' }}>
                                Licensed States {selectedStates.length > 0 && `(${selectedStates.length})`}
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {US_STATES.map(st => {
                                    const selected = selectedStates.includes(st);
                                    return (
                                        <button
                                            key={st}
                                            onClick={() => toggleState(st)}
                                            style={{
                                                fontSize: '11px', padding: '4px 8px', borderRadius: '8px',
                                                minWidth: '36px', textAlign: 'center' as const,
                                                fontWeight: selected ? 600 : 400, cursor: 'pointer',
                                                background: selected ? '#CCFBF1' : '#EDF5F0',
                                                color: selected ? '#0D9488' : '#6B7F8A',
                                                border: `1px solid ${selected ? '#99F6E4' : '#D5E8E0'}`,
                                                boxShadow: selected
                                                    ? '2px 2px 6px rgba(13,148,136,0.1)'
                                                    : 'inset 1px 1px 3px rgba(0,60,50,0.04)',
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {st}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══ Results ═══ */}
                {loading ? (
                    <div style={{ ...cardBase, padding: '60px 24px', textAlign: 'center' }}>
                        <Loader2 size={28} className="animate-spin" style={{ color: '#0D9488', margin: '0 auto 12px', display: 'block' }} />
                        <p style={{ color: '#8A9BA6', fontSize: '14px', margin: 0 }}>Searching candidates…</p>
                    </div>
                ) : candidates.length === 0 ? (
                    <div style={{ ...cardBase, padding: '60px 24px', textAlign: 'center' }}>
                        <Users size={36} style={{ color: '#B0C4BC', marginBottom: '12px' }} />
                        <h3 style={{
                            fontSize: '18px', fontWeight: 700,
                            fontFamily: 'var(--font-lora), Georgia, serif',
                            color: '#1A2E35', marginBottom: '6px',
                        }}>No candidates found</h3>
                        <p style={{ fontSize: '13px', color: '#8A9BA6' }}>Try adjusting your search or filters</p>
                    </div>
                ) : (
                    <>
                        {/* Rerank-failure diagnostic — surfaces the actual
                            error so we can stop chasing dev-server logs. */}
                        {rerankError && aiState.status === 'ready' && (
                            <div style={{
                                background: '#FEF3C7',
                                border: '1px solid #FCD34D',
                                borderRadius: '12px',
                                padding: '10px 14px',
                                marginBottom: '14px',
                                fontSize: '12px',
                                color: '#92400E',
                                fontFamily: 'monospace',
                            }}>
                                <strong>Rerank fell back to vector order.</strong> Reason: {rerankError}
                            </div>
                        )}

                        {/* JD-match result banner — only when actively
                            showing candidates ranked against a posting. */}
                        {jdSearchPostingId && jdSearchTitle && aiState.status === 'ready' && (
                            <div style={{
                                background: 'linear-gradient(145deg, #F5F3FF, #EDE9FE)',
                                border: '1px solid #DDD6FE',
                                borderRadius: '12px',
                                padding: '10px 14px',
                                marginBottom: '14px',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: '10px', flexWrap: 'wrap',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#4C1D95' }}>
                                    <Sparkles size={14} style={{ color: '#7C3AED' }} />
                                    <span>Showing top candidates for <strong>{jdSearchTitle}</strong></span>
                                </div>
                                <button
                                    onClick={() => {
                                        setJdSearchPostingId(null);
                                        setJdSearchTitle(null);
                                    }}
                                    style={{
                                        fontSize: '12px', padding: '4px 10px', borderRadius: '8px',
                                        background: '#FFFFFF', color: '#6B21A8',
                                        border: '1px solid #DDD6FE', cursor: 'pointer', fontWeight: 600,
                                    }}
                                >
                                    Clear posting filter
                                </button>
                            </div>
                        )}

                        {/* Results count */}
                        <p style={{ fontSize: '12px', color: '#8A9BA6', marginBottom: '14px', fontWeight: 500 }}>
                            {aiMode && aiState.status === 'ready'
                                ? jdSearchPostingId
                                    ? `Top ${candidates.length} AI-ranked candidate${candidates.length !== 1 ? 's' : ''} for this posting`
                                    : `Top ${candidates.length} AI-ranked candidate${candidates.length !== 1 ? 's' : ''} for your query`
                                : `Showing ${(page - 1) * 20 + 1}–${Math.min(page * 20, totalCount)} of ${totalCount} candidate${totalCount !== 1 ? 's' : ''}`}
                        </p>

                        {/* Card Grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                            gap: '14px',
                            marginBottom: '28px',
                        }}>
                            {candidates.map((c: Candidate) => {
                                const selPosting = postings.find(p => p.id === selectedPostingId);
                                const perPostingUsage = selPosting ? {
                                    used: selPosting.unlocks.used,
                                    limit: selPosting.unlocks.limit === -1 ? null : selPosting.unlocks.limit,
                                    unlimited: selPosting.unlocks.limit === -1,
                                } : (unlockUsage || undefined);
                                return (
                                    <CandidateCard
                                        key={c.id}
                                        {...c}
                                        isSaved={savedIds.has(c.id)}
                                        isViewed={viewedIds.has(c.id)}
                                        unlockUsage={perPostingUsage}
                                        onToggleSave={toggleSave}
                                        aiReason={c.reason}
                                        aiMatchPercent={typeof c.matchPercent === 'number' ? c.matchPercent : undefined}
                                    />
                                );
                            })}
                        </div>

                        {/* Pagination — hidden in Smart Match (single ranked slate) */}
                        {!aiMode && totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="tp-page-btn"
                                    style={{
                                        ...clayBtn,
                                        background: '#F7FBF8', color: page <= 1 ? '#B0C4BC' : '#2A4A5A',
                                        opacity: page <= 1 ? 0.5 : 1,
                                        cursor: page <= 1 ? 'default' : 'pointer',
                                    }}
                                >
                                    <ChevronLeft size={14} /> Previous
                                </button>
                                <span style={{
                                    ...cardRecessed, padding: '6px 14px', fontSize: '12px', fontWeight: 600, color: '#6B7F8A',
                                }}>
                                    Page {page} of {totalPages}
                                </span>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="tp-page-btn"
                                    style={{
                                        ...clayBtn,
                                        background: '#F7FBF8', color: page >= totalPages ? '#B0C4BC' : '#2A4A5A',
                                        opacity: page >= totalPages ? 0.5 : 1,
                                        cursor: page >= totalPages ? 'default' : 'pointer',
                                    }}
                                >
                                    Next <ChevronRight size={14} />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ═══ Hover Styles ═══ */}
            <style>{`
                .tp-filter-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 4px 4px 10px rgba(0,0,0,0.07), -3px -3px 8px rgba(255,255,255,0.8) !important;
                }
                .tp-page-btn:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 4px 4px 10px rgba(0,0,0,0.07), -3px -3px 8px rgba(255,255,255,0.8) !important;
                }
            `}</style>
        </div>
    );
}
