'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Users, Loader2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import CandidateCard from './CandidateCard';

// Filter presets (match settings page)
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
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

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
            }
        } catch { /* silent */ }
        setLoading(false);
    }, [query, experience, selectedSpecialties, selectedStates, workMode, hasResume, page]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(fetchCandidates, 300);
        return () => clearTimeout(timer);
    }, [fetchCandidates]);

    // Reset to page 1 when filters change
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

    const selectStyle: React.CSSProperties = {
        padding: '8px 12px',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontSize: '13px',
        outline: 'none',
        cursor: 'pointer',
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', paddingTop: '32px', paddingRight: '16px', paddingBottom: '48px', paddingLeft: '16px' }}>
            {/* Header */}
            <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Users size={20} style={{ color: '#fff' }} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                            PMHNP Talent Pool
                        </h1>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                            {loading ? 'Loading...' : `${totalCount} qualified candidate${totalCount !== 1 ? 's' : ''} available`}
                        </p>
                    </div>
                </div>
            </div>

            {/* Search + Filter Toggle */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                    <Search
                        size={16}
                        style={{
                            position: 'absolute',
                            left: '14px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-tertiary)',
                        }}
                    />
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search by name, specialty, keyword..."
                        style={{
                            width: '100%',
                            paddingTop: '10px',
                            paddingRight: '14px',
                            paddingBottom: '10px',
                            paddingLeft: '40px',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            fontSize: '14px',
                            outline: 'none',
                        }}
                    />
                </div>
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        paddingTop: '10px',
                        paddingRight: '16px',
                        paddingBottom: '10px',
                        paddingLeft: '16px',
                        borderRadius: '12px',
                        border: '1px solid',
                        borderColor: showFilters ? '#2DD4BF' : 'var(--border-color)',
                        backgroundColor: showFilters ? 'rgba(45,212,191,0.1)' : 'var(--bg-secondary)',
                        color: showFilters ? '#2DD4BF' : 'var(--text-primary)',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    <Filter size={16} />
                    Filters
                    {activeFilterCount > 0 && (
                        <span
                            style={{
                                backgroundColor: '#2DD4BF',
                                color: '#0F172A',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '1px 7px',
                                borderRadius: '10px',
                            }}
                        >
                            {activeFilterCount}
                        </span>
                    )}
                </button>
                {activeFilterCount > 0 && (
                    <button
                        onClick={clearFilters}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            paddingTop: '10px',
                            paddingRight: '12px',
                            paddingBottom: '10px',
                            paddingLeft: '12px',
                            borderRadius: '12px',
                            border: '1px solid rgba(239,68,68,0.3)',
                            backgroundColor: 'rgba(239,68,68,0.06)',
                            color: '#EF4444',
                            fontSize: '13px',
                            cursor: 'pointer',
                        }}
                    >
                        <X size={14} />
                        Clear
                    </button>
                )}
            </div>

            {/* Filter Panel */}
            {showFilters && (
                <div
                    style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '16px',
                        paddingTop: '20px',
                        paddingRight: '20px',
                        paddingBottom: '20px',
                        paddingLeft: '20px',
                        marginBottom: '20px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '20px',
                    }}
                >
                    {/* Experience */}
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                            Experience
                        </label>
                        <select
                            value={experience}
                            onChange={e => setExperience(e.target.value)}
                            style={selectStyle}
                        >
                            {EXPERIENCE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Work Mode */}
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                            Work Mode
                        </label>
                        <select
                            value={workMode}
                            onChange={e => setWorkMode(e.target.value)}
                            style={selectStyle}
                        >
                            <option value="">Any Mode</option>
                            {WORK_MODES.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    {/* Has Resume */}
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                            Resume
                        </label>
                        <select
                            value={hasResume}
                            onChange={e => setHasResume(e.target.value)}
                            style={selectStyle}
                        >
                            <option value="">Any</option>
                            <option value="true">Has Resume</option>
                            <option value="false">No Resume</option>
                        </select>
                    </div>

                    {/* Specialties */}
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                            Specialties
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {SPECIALTY_PRESETS.map(s => {
                                const selected = selectedSpecialties.includes(s);
                                return (
                                    <button
                                        key={s}
                                        onClick={() => toggleSpecialty(s)}
                                        style={{
                                            fontSize: '12px',
                                            paddingTop: '5px',
                                            paddingRight: '10px',
                                            paddingBottom: '5px',
                                            paddingLeft: '10px',
                                            borderRadius: '8px',
                                            border: '1px solid',
                                            borderColor: selected ? '#A78BFA' : 'var(--border-color)',
                                            backgroundColor: selected ? 'rgba(139,92,246,0.15)' : 'transparent',
                                            color: selected ? '#A78BFA' : 'var(--text-secondary)',
                                            cursor: 'pointer',
                                            fontWeight: selected ? 600 : 400,
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
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
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
                                            fontSize: '11px',
                                            paddingTop: '4px',
                                            paddingRight: '7px',
                                            paddingBottom: '4px',
                                            paddingLeft: '7px',
                                            borderRadius: '6px',
                                            border: '1px solid',
                                            borderColor: selected ? '#2DD4BF' : 'var(--border-color)',
                                            backgroundColor: selected ? 'rgba(45,212,191,0.15)' : 'transparent',
                                            color: selected ? '#2DD4BF' : 'var(--text-secondary)',
                                            cursor: 'pointer',
                                            fontWeight: selected ? 600 : 400,
                                            minWidth: '36px',
                                            textAlign: 'center' as const,
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

            {/* Results */}
            {loading ? (
                <div style={{ textAlign: 'center', paddingTop: '60px', paddingBottom: '60px' }}>
                    <Loader2 size={32} className="animate-spin" style={{ color: '#2DD4BF', margin: '0 auto 12px' }} />
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Searching candidates…</p>
                </div>
            ) : candidates.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    paddingTop: '60px',
                    paddingBottom: '60px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '16px',
                    border: '1px solid var(--border-color)',
                }}>
                    <Users size={40} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                        No candidates found
                    </h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Try adjusting your search or filters
                    </p>
                </div>
            ) : (
                <>
                    {/* Results count */}
                    <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>
                        Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, totalCount)} of {totalCount} candidate{totalCount !== 1 ? 's' : ''}
                    </p>

                    {/* Card Grid */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                            gap: '16px',
                            marginBottom: '32px',
                        }}
                    >
                        {candidates.map((c: Candidate) => (
                            <CandidateCard key={c.id} {...c} />
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    paddingTop: '8px',
                                    paddingRight: '14px',
                                    paddingBottom: '8px',
                                    paddingLeft: '14px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-color)',
                                    backgroundColor: 'var(--bg-secondary)',
                                    color: page <= 1 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                                    cursor: page <= 1 ? 'default' : 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    opacity: page <= 1 ? 0.5 : 1,
                                }}
                            >
                                <ChevronLeft size={16} /> Previous
                            </button>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    paddingTop: '8px',
                                    paddingRight: '14px',
                                    paddingBottom: '8px',
                                    paddingLeft: '14px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-color)',
                                    backgroundColor: 'var(--bg-secondary)',
                                    color: page >= totalPages ? 'var(--text-tertiary)' : 'var(--text-primary)',
                                    cursor: page >= totalPages ? 'default' : 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    opacity: page >= totalPages ? 0.5 : 1,
                                }}
                            >
                                Next <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
