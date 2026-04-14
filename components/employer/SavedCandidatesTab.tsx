'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bookmark, Loader2, Trash2, Briefcase, StickyNote, Tag, Plus, X, Check } from 'lucide-react';
import CandidateCard from './CandidateCard';

/* ═══ CLAY TOKENS ═══ */
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
const clayBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '6px 12px', borderRadius: '10px',
    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '2px 2px 6px rgba(0,0,0,0.04), -1px -1px 4px rgba(255,255,255,0.7)',
    transition: 'all 0.2s',
};
const clayInput: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: '12px',
    borderRadius: '10px', border: '1px solid #D5E8E0', background: '#EDF5F0',
    color: '#1A2E35',
    boxShadow: 'inset 2px 2px 5px rgba(0,60,50,0.05), inset -1px -1px 3px rgba(255,255,255,0.4)',
    outline: 'none', transition: 'all 0.2s',
};

const TAG_COLORS = [
    '#0D9488', '#7C3AED', '#D97706', '#DC2626', '#2563EB', '#059669', '#DB2777', '#6366F1',
];

interface SavedCandidateEntry {
    id: string;
    note: string | null;
    tags: string[];
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

interface EmployerTag {
    id: string;
    name: string;
    color: string;
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
    const [filterTag, setFilterTag] = useState<string>('all');
    const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
    const [postings, setPostings] = useState<{ id: string; jobTitle: string; unlocks: { used: number; limit: number; remaining: number } }[]>([]);
    const [aggregateUsage, setAggregateUsage] = useState<{ used: number; limit: number | null; unlimited: boolean } | null>(null);

    // Tags
    const [employerTags, setEmployerTags] = useState<EmployerTag[]>([]);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
    const [showTagCreator, setShowTagCreator] = useState(false);

    // Notes editing
    const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);
    const [noteText, setNoteText] = useState('');
    const [savingNote, setSavingNote] = useState(false);

    // Tag editing
    const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);

    const effectiveUnlockUsage = (() => {
        if (filterPosting !== 'all' && filterPosting !== 'none') {
            const posting = postings.find(p => p.id === filterPosting);
            if (posting) return { used: posting.unlocks.used, limit: posting.unlocks.limit, unlimited: false };
        }
        return aggregateUsage;
    })();

    useEffect(() => {
        sessionStorage.setItem('savedTab_filter', filterPosting);
    }, [filterPosting]);

    const fetchSaved = useCallback(async () => {
        setLoading(true);
        try {
            const [savedRes, usageRes, tagsRes] = await Promise.all([
                fetch('/api/employer/saved-candidates'),
                fetch('/api/employer/usage'),
                fetch('/api/employer/tags'),
            ]);
            if (savedRes.ok) {
                const data = await savedRes.json();
                setSaved(data.savedCandidates);
                if (data.viewedCandidateIds) setViewedIds(new Set(data.viewedCandidateIds));
            }
            if (usageRes.ok) {
                const usageData = await usageRes.json();
                setAggregateUsage(usageData.usage?.candidateUnlocks || null);
                if (usageData.postings) setPostings(usageData.postings);
            }
            if (tagsRes.ok) {
                const tagsData = await tagsRes.json();
                setEmployerTags(tagsData.tags || []);
            }
        } catch { /* silent */ }
        setLoading(false);
    }, []);

    useEffect(() => { fetchSaved(); }, [fetchSaved]);

    const handleUnsave = async (candidateId: string, postingId: string | null) => {
        setSaved(prev => prev.filter(s => !(s.candidate.id === candidateId && s.postingId === postingId)));
        try {
            await fetch('/api/employer/saved-candidates', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidateId, postingId: postingId || undefined }),
            });
        } catch { fetchSaved(); }
    };

    const handleSaveNote = async (entry: SavedCandidateEntry) => {
        setSavingNote(true);
        try {
            const res = await fetch('/api/employer/saved-candidates/note', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidateId: entry.candidate.id,
                    postingId: entry.postingId || undefined,
                    note: noteText,
                }),
            });
            if (res.ok) {
                setSaved(prev => prev.map(s =>
                    s.id === entry.id ? { ...s, note: noteText || null } : s
                ));
            }
        } catch { /* silent */ }
        setSavingNote(false);
        setEditingNoteFor(null);
    };

    const handleToggleTag = async (entry: SavedCandidateEntry, tagName: string) => {
        const currentTags = entry.tags || [];
        const newTags = currentTags.includes(tagName)
            ? currentTags.filter(t => t !== tagName)
            : [...currentTags, tagName];

        // Optimistic
        setSaved(prev => prev.map(s =>
            s.id === entry.id ? { ...s, tags: newTags } : s
        ));

        try {
            await fetch('/api/employer/saved-candidates/note', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidateId: entry.candidate.id,
                    postingId: entry.postingId || undefined,
                    tags: newTags,
                }),
            });
        } catch {
            setSaved(prev => prev.map(s =>
                s.id === entry.id ? { ...s, tags: currentTags } : s
            ));
        }
    };

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;
        try {
            const res = await fetch('/api/employer/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
            });
            if (res.ok) {
                const data = await res.json();
                setEmployerTags(prev => [...prev, data.tag]);
                setNewTagName('');
                setShowTagCreator(false);
            }
        } catch { /* silent */ }
    };

    const handleDeleteTag = async (tagId: string) => {
        setEmployerTags(prev => prev.filter(t => t.id !== tagId));
        try {
            await fetch('/api/employer/tags', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tagId }),
            });
        } catch { fetchSaved(); }
    };

    const postingOptions = Array.from(
        new Map(
            saved.filter(s => s.postingId).map(s => [s.postingId!, s.postingTitle || 'Untitled Job'])
        ).entries()
    );

    let filtered = filterPosting === 'all'
        ? saved
        : filterPosting === 'none'
            ? saved.filter(s => !s.postingId)
            : saved.filter(s => s.postingId === filterPosting);

    // Tag filter
    if (filterTag !== 'all') {
        filtered = filtered.filter(s => (s.tags || []).includes(filterTag));
    }

    if (loading) {
        return (
            <div style={{ ...cardBase, padding: '60px 24px', textAlign: 'center' }}>
                <Loader2 size={28} className="animate-spin" style={{ color: '#0D9488', margin: '0 auto 12px', display: 'block' }} />
                <p style={{ color: '#8A9BA6', fontSize: '14px', margin: 0 }}>Loading saved candidates…</p>
            </div>
        );
    }

    if (saved.length === 0) {
        return (
            <div style={{ ...cardBase, padding: '60px 24px', textAlign: 'center' }}>
                <Bookmark size={36} style={{ color: '#B0C4BC', marginBottom: '12px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', marginBottom: '6px' }}>
                    No saved candidates
                </h3>
                <p style={{ fontSize: '13px', color: '#8A9BA6', maxWidth: '400px', margin: '0 auto' }}>
                    Browse the Talent Pool and bookmark candidates you&apos;re interested in. They&apos;ll appear here for easy access.
                </p>
            </div>
        );
    }

    return (
        <div>
            {/* Header + Filters */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '10px', marginBottom: '14px', flexWrap: 'wrap',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Bookmark size={16} style={{ color: '#F59E0B' }} />
                    <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35' }}>
                        {filtered.length} saved candidate{filtered.length !== 1 ? 's' : ''}
                    </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Posting filter */}
                    {postingOptions.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Briefcase size={12} style={{ color: '#0D9488' }} />
                            <select value={filterPosting} onChange={e => setFilterPosting(e.target.value)} style={clayInput as React.CSSProperties}>
                                <option value="all">All Postings</option>
                                {postingOptions.map(([id, title]) => (
                                    <option key={id} value={id}>{title}</option>
                                ))}
                                <option value="none">No posting</option>
                            </select>
                        </div>
                    )}

                    {/* Tag filter */}
                    {employerTags.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Tag size={12} style={{ color: '#7C3AED' }} />
                            <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={clayInput as React.CSSProperties}>
                                <option value="all">All Tags</option>
                                {employerTags.map(t => (
                                    <option key={t.id} value={t.name}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* Tag Manager Bar */}
            <div style={{ ...cardRecessed, padding: '10px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <Tag size={13} style={{ color: '#7C3AED', flexShrink: 0 }} />
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#8A9BA6', flexShrink: 0 }}>Tags:</span>
                {employerTags.map(t => (
                    <span key={t.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                        background: `${t.color}18`, color: t.color, border: `1px solid ${t.color}30`,
                    }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.color }} />
                        {t.name}
                        <button onClick={() => handleDeleteTag(t.id)} style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            color: t.color, opacity: 0.5, display: 'flex',
                        }}>
                            <X size={10} />
                        </button>
                    </span>
                ))}
                {!showTagCreator ? (
                    <button onClick={() => setShowTagCreator(true)} style={{
                        ...clayBtn, padding: '3px 8px', fontSize: '11px', background: '#F7FBF8', color: '#8A9BA6',
                    }}>
                        <Plus size={10} /> New Tag
                    </button>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                            type="text"
                            value={newTagName}
                            onChange={e => setNewTagName(e.target.value)}
                            placeholder="Tag name..."
                            maxLength={20}
                            onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
                            style={{ ...clayInput, width: '100px', padding: '3px 8px', fontSize: '11px' }}
                            autoFocus
                        />
                        <div style={{ display: 'flex', gap: '2px' }}>
                            {TAG_COLORS.map(c => (
                                <button key={c} onClick={() => setNewTagColor(c)} style={{
                                    width: '14px', height: '14px', borderRadius: '4px',
                                    background: c, border: newTagColor === c ? '2px solid #1A2E35' : '1px solid rgba(0,0,0,0.1)',
                                    cursor: 'pointer', padding: 0,
                                }} />
                            ))}
                        </div>
                        <button onClick={handleCreateTag} style={{
                            ...clayBtn, padding: '3px 6px', background: '#D1FAE5', color: '#059669',
                        }}>
                            <Check size={10} />
                        </button>
                        <button onClick={() => { setShowTagCreator(false); setNewTagName(''); }} style={{
                            ...clayBtn, padding: '3px 6px', background: '#FEE2E2', color: '#DC2626',
                        }}>
                            <X size={10} />
                        </button>
                    </div>
                )}
            </div>

            {/* Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: '14px',
            }}>
                {filtered.map((entry) => {
                    const cardUsage = (() => {
                        if (entry.postingId) {
                            const posting = postings.find(p => p.id === entry.postingId);
                            if (posting) return { used: posting.unlocks.used, limit: posting.unlocks.limit, unlimited: false };
                        }
                        return aggregateUsage;
                    })();

                    return (
                        <div key={entry.id} style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            <CandidateCard
                                {...entry.candidate}
                                isSaved={true}
                                isViewed={viewedIds.has(entry.candidate.id)}
                                unlockUsage={cardUsage || undefined}
                                onToggleSave={() => handleUnsave(entry.candidate.id, entry.postingId)}
                            />

                            {/* Notes + Tags + Meta footer */}
                            <div style={{
                                ...cardRecessed, borderRadius: '0 0 16px 16px', marginTop: '-8px',
                                padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px',
                            }}>
                                {/* Tags Row */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                    {(entry.tags || []).map(tagName => {
                                        const tagDef = employerTags.find(t => t.name === tagName);
                                        const color = tagDef?.color || '#6B7F8A';
                                        return (
                                            <span key={tagName} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                                                background: `${color}18`, color, border: `1px solid ${color}30`,
                                            }}>
                                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: color }} />
                                                {tagName}
                                            </span>
                                        );
                                    })}
                                    <button
                                        onClick={() => setEditingTagsFor(editingTagsFor === entry.id ? null : entry.id)}
                                        style={{
                                            ...clayBtn, padding: '2px 6px', fontSize: '10px',
                                            background: editingTagsFor === entry.id ? '#CCFBF1' : '#F7FBF8',
                                            color: editingTagsFor === entry.id ? '#0D9488' : '#B0C4BC',
                                        }}
                                    >
                                        <Tag size={9} /> {(entry.tags || []).length > 0 ? '✎' : '+ Tag'}
                                    </button>
                                </div>

                                {/* Tag picker dropdown */}
                                {editingTagsFor === entry.id && employerTags.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {employerTags.map(t => {
                                            const isOn = (entry.tags || []).includes(t.name);
                                            return (
                                                <button key={t.id} onClick={() => handleToggleTag(entry, t.name)} style={{
                                                    padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                                                    cursor: 'pointer',
                                                    background: isOn ? `${t.color}20` : '#F4F8F5',
                                                    color: isOn ? t.color : '#8A9BA6',
                                                    border: `1px solid ${isOn ? `${t.color}40` : '#E8F0EB'}`,
                                                    transition: 'all 0.15s',
                                                }}>
                                                    {isOn ? '✓ ' : ''}{t.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Note */}
                                {editingNoteFor === entry.id ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <textarea
                                            value={noteText}
                                            onChange={e => setNoteText(e.target.value)}
                                            placeholder="Add a private note about this candidate..."
                                            maxLength={500}
                                            rows={3}
                                            style={{ ...clayInput, resize: 'vertical', fontSize: '12px', lineHeight: 1.5 }}
                                            autoFocus
                                        />
                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                            <button onClick={() => setEditingNoteFor(null)} style={{
                                                ...clayBtn, background: '#F7FBF8', color: '#8A9BA6', fontSize: '11px',
                                            }}>Cancel</button>
                                            <button onClick={() => handleSaveNote(entry)} disabled={savingNote} style={{
                                                ...clayBtn, background: '#D1FAE5', color: '#059669', fontSize: '11px',
                                                opacity: savingNote ? 0.6 : 1,
                                            }}>
                                                {savingNote ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {entry.note ? (
                                                <p style={{
                                                    fontSize: '11px', color: '#6B7F8A', margin: 0,
                                                    lineHeight: 1.5, fontStyle: 'italic',
                                                    padding: '4px 8px', borderRadius: '6px',
                                                    background: 'rgba(255,255,255,0.4)',
                                                }}>
                                                    📝 {entry.note}
                                                </p>
                                            ) : null}
                                        </div>
                                        <button
                                            onClick={() => { setEditingNoteFor(entry.id); setNoteText(entry.note || ''); }}
                                            style={{
                                                ...clayBtn, padding: '3px 8px', fontSize: '10px',
                                                background: '#F7FBF8', color: '#B0C4BC', flexShrink: 0,
                                            }}
                                        >
                                            <StickyNote size={9} /> {entry.note ? 'Edit' : '+ Note'}
                                        </button>
                                    </div>
                                )}

                                {/* Meta row */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#B0C4BC' }}>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        {entry.postingTitle && (
                                            <span style={{
                                                padding: '2px 6px', borderRadius: '5px', fontSize: '9px', fontWeight: 600,
                                                background: '#CCFBF1', color: '#0D9488', border: '1px solid #99F6E4',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px',
                                            }}>
                                                📋 {entry.postingTitle}
                                            </span>
                                        )}
                                        <span>Saved {new Date(entry.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                    </div>
                                    <button
                                        onClick={() => handleUnsave(entry.candidate.id, entry.postingId)}
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                                            color: '#B0C4BC', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px',
                                        }}
                                    >
                                        <Trash2 size={10} /> Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
