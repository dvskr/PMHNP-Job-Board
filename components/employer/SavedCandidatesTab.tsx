'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bookmark, Loader2, Users, Trash2 } from 'lucide-react';
import CandidateCard from './CandidateCard';

interface SavedCandidateEntry {
    id: string;
    note: string | null;
    savedAt: string;
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

    const fetchSaved = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/employer/saved-candidates');
            if (res.ok) {
                const data = await res.json();
                setSaved(data.savedCandidates);
            }
        } catch { /* silent */ }
        setLoading(false);
    }, []);

    useEffect(() => { fetchSaved(); }, [fetchSaved]);

    const handleUnsave = async (candidateId: string) => {
        // Optimistic remove
        setSaved(prev => prev.filter(s => s.candidate.id !== candidateId));
        try {
            await fetch('/api/employer/saved-candidates', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidateId }),
            });
        } catch {
            // Revert — re-fetch
            fetchSaved();
        }
    };

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
                textAlign: 'center',
                padding: '60px 20px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '16px',
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
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Bookmark size={18} style={{ color: '#F59E0B' }} />
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {saved.length} saved candidate{saved.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: '16px',
            }}>
                {saved.map((entry) => (
                    <div key={entry.id} style={{ position: 'relative' }}>
                        <CandidateCard
                            {...entry.candidate}
                            isSaved={true}
                            onToggleSave={() => handleUnsave(entry.candidate.id)}
                        />
                        {/* Saved date + unsave quick action */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 16px',
                            fontSize: '12px',
                            color: 'var(--text-tertiary)',
                        }}>
                            <span>
                                Saved {new Date(entry.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                            <button
                                onClick={() => handleUnsave(entry.candidate.id)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    color: 'var(--text-tertiary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '12px',
                                    transition: 'color 0.2s',
                                }}
                                title="Remove from saved"
                            >
                                <Trash2 size={12} /> Remove
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
