'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Users, Loader2, X, ChevronLeft, ChevronRight, Briefcase, Lock } from 'lucide-react';
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
   CLAY DESIGN TOKENS
   ═══════════════════════════════════════════ */
const cardBase: React.CSSProperties = {
    background: '#F7FBF8',
    borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)',
};

const cardRecessed: React.CSSProperties = {
    background: '#EDF5F0',
    borderRadius: '14px',
    border: '1px solid #D5E8E0',
    boxShadow: 'inset 2px 2px 6px rgba(0,60,50,0.06), inset -1px -1px 3px rgba(255,255,255,0.5)',
};

const clayInput: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    fontSize: '13px',
    borderRadius: '12px',
    border: '1px solid #D5E8E0',
    background: '#EDF5F0',
    color: '#1A2E35',
    boxShadow: 'inset 2px 2px 6px rgba(0,60,50,0.06), inset -1px -1px 3px rgba(255,255,255,0.4)',
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

export default function CandidateSearchClient() {
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
        const params = new URLSearchParams();
        if (query) params.set('q', query);
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
    }, [query, experience, selectedSpecialties, selectedStates, workMode, hasResume, page]);

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
        <div style={{ background: '#F5F6F8' }}>
            {/* ═══ Hero Header ═══ */}
            <div style={{
                padding: '28px 16px 20px',
                background: 'linear-gradient(180deg, #F0F2F5 0%, #F5F6F8 100%)',
                borderBottom: '1px solid #E5E7EB',
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
                    </div>
                )}

                {/* ═══ Search + Filter Toggle ═══ */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#B0C4BC' }} />
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search by name, specialty, keyword..."
                            style={{ ...clayInput, paddingLeft: '38px', fontSize: '14px' }}
                        />
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
                        {/* Results count */}
                        <p style={{ fontSize: '12px', color: '#8A9BA6', marginBottom: '14px', fontWeight: 500 }}>
                            Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, totalCount)} of {totalCount} candidate{totalCount !== 1 ? 's' : ''}
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
                                    />
                                );
                            })}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
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
