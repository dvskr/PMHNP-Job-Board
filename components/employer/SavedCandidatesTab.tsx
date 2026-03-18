'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bookmark, Loader2, Trash2, Briefcase } from 'lucide-react';
import CandidateCard from './CandidateCard';

interface SavedCandidateEntry {
    id: string;
    note: string | null;
    savedAt: string;
    postingId: string | null;
    postingTitle: string | null;
    candidate: {
        id: string;
        displayName: string;
        initials: string;
        avatarUrl: string | null;
        headline: string | null;
        yearsExperience: number | null;
        certifications: string[];
        licenseStates: string[];
        specialties: string[];
        preferredWorkMode: string | null;
        availableDate: string | null;
        hasResume: boolean;
    };
}

export default function SavedCandidatesTab() {
    const [saved, setSaved] = useState<SavedCandidateEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterPosting, setFilterPosting] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            return sessionStorage.getItem('savedTab_filter') || 'all';
        }
        return 'all';
    });
    const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
    const [postings, setPostings] = useState<{ id: string; jobTitle: string; unlocks: { used: number; limit: number; remaining: number } }[]>([]);
    const [aggregateUsage, setAggregateUsage] = useState<{ used: number; limit: number | null; unlimited: boolean } | null>(null);

    // Compute effective unlockUsage based on the selected filter
    const effectiveUnlockUsage = (() => {
        if (filterPosting !== 'all' && filterPosting !== 'none') {
            const posting = postings.find(p => p.id === filterPosting);
            if (posting) {
                return { used: posting.unlocks.used, limit: posting.unlocks.limit, unlimited: false };
            }
        }
        return aggregateUsage;
    })();

    // Persist filter to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('savedTab_filter', filterPosting);
    }, [filterPosting]);

    const fetchSaved = useCallback(async () => {
        setLoading(true);
        try {
            const [savedRes, usageRes] = await Promise.all([
                fetch('/api/employer/saved-candidates'),
                fetch('/api/employer/usage'),
            ]);
            if (savedRes.ok) {
                const data = await savedRes.json();
                setSaved(data.savedCandidates);
                if (data.viewedCandidateIds) {
                    setViewedIds(new Set(data.viewedCandidateIds));
                }
            }
            if (usageRes.ok) {
                const usageData = await usageRes.json();
                setAggregateUsage(usageData.usage?.candidateUnlocks || null);
                if (usageData.postings) {
                    setPostings(usageData.postings);
                }
            }
        } catch { /* silent */ }
        setLoading(false);
    }, []);

    useEffect(() => { fetchSaved(); }, [fetchSaved]);

    const handleUnsave = async (candidateId: string, postingId: string | null) => {
        // Optimistic remove
        setSaved(prev => prev.filter(s => !(s.candidate.id === candidateId && s.postingId === postingId)));
        try {
            await fetch('/api/employer/saved-candidates', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidateId, postingId: postingId || undefined }),
            });
        } catch {
            fetchSaved();
        }
    };

    // Build posting filter options from saved data
    const postingOptions = Array.from(
        new Map(
            saved
                .filter(s => s.postingId)
                .map(s => [s.postingId!, s.postingTitle || 'Untitled Job'])
        ).entries()
    );

    const filtered = filterPosting === 'all'
        ? saved
        : filterPosting === 'none'
            ? saved.filter(s => !s.postingId)
            : saved.filter(s => s.postingId === filterPosting);

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <Loader2 size={32} className="animate-spin" style={{ color: '#2DD4BF', margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading saved candidates…</p>
            </div>
        );
    }

    if (saved.length === 0) {
        return (
            <div style={{
                textAlign: 'center', padding: '60px 20px',
                backgroundColor: 'var(--bg-secondary)', borderRadius: '16px',
                border: '1px solid var(--border-color)',
            }}>
                <Bookmark size={40} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                    No saved candidates
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
                    Browse the Talent Pool and bookmark candidates you&apos;re interested in. They&apos;ll appear here for easy access.
                </p>
            </div>
        );
    }

    return (
        <div>
            {/* Header + Posting Filter */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '12px', marginBottom: '16px', flexWrap: 'wrap',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Bookmark size={18} style={{ color: '#F59E0B' }} />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {filtered.length} saved candidate{filtered.length !== 1 ? 's' : ''}
                        {filterPosting !== 'all' && ` (filtered)`}
                    </span>
                </div>

                {postingOptions.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Briefcase size={14} style={{ color: '#2DD4BF' }} />
                        <select
                            value={filterPosting}
                            onChange={e => setFilterPosting(e.target.value)}
                            style={{
                                padding: '6px 10px', borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                fontSize: '12px', fontWeight: 600,
                                outline: 'none', cursor: 'pointer',
                            }}
                        >
                            <option value="all">All Postings</option>
                            {postingOptions.map(([id, title]) => (
                                <option key={id} value={id}>{title}</option>
                            ))}
                            <option value="none">No posting assigned</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: '16px',
            }}>
                {filtered.map((entry) => {
                    // Compute unlock usage specific to this card's posting
                    const cardUsage = (() => {
                        if (entry.postingId) {
                            const posting = postings.find(p => p.id === entry.postingId);
                            if (posting) {
                                return { used: posting.unlocks.used, limit: posting.unlocks.limit, unlimited: false };
                            }
                        }
                        return aggregateUsage;
                    })();

                    return (
                    <div key={entry.id} style={{ position: 'relative' }}>
                        <CandidateCard
                            {...entry.candidate}
                            isSaved={true}
                            isViewed={viewedIds.has(entry.candidate.id)}
                            unlockUsage={cardUsage || undefined}
                            onToggleSave={() => handleUnsave(entry.candidate.id, entry.postingId)}
                        />
                        {/* Posting badge + Saved date + Remove */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 16px', fontSize: '12px', color: 'var(--text-tertiary)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {entry.postingTitle && (
                                    <span style={{
                                        fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                                        borderRadius: '6px', backgroundColor: 'rgba(45,212,191,0.1)',
                                        color: '#2DD4BF', border: '1px solid rgba(45,212,191,0.2)',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        maxWidth: '200px', display: 'inline-block',
                                    }}>
                                        📋 {entry.postingTitle}
                                    </span>
                                )}
                                <span>
                                    Saved {new Date(entry.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                            </div>
                            <button
                                onClick={() => handleUnsave(entry.candidate.id, entry.postingId)}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                                    color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center',
                                    gap: '4px', fontSize: '12px', transition: 'color 0.2s',
                                }}
                                title="Remove from saved"
                            >
                                <Trash2 size={12} /> Remove
                            </button>
                        </div>
                    </div>
                    );
                })}
            </div>
        </div>
    );
}
