'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    ArrowLeft, MapPin, Briefcase, Award, Calendar, DollarSign,
    FileText, Mail, ExternalLink, Loader2, Shield, Clock, Linkedin, Lock, Plus,
} from 'lucide-react';
import ComposeMessageModal from './ComposeMessageModal';

interface CandidateProfile {
    id: string;
    displayName: string;
    initials: string;
    avatarUrl: string | null;
    headline: string | null;
    bio: string | null;
    yearsExperience: number | null;
    certifications: string[];
    licenseStates: string[];
    specialties: string[];
    preferredWorkMode: string | null;
    preferredJobType: string | null;
    availableDate: string | null;
    salaryRange: string | null;
    hasResume: boolean;
    linkedinUrl: string | null;
    joinedAt: string;
    hasFullAccess: boolean;
    contactEmail: string | null;
    resumeUrl: string | null;
}

const EXPERIENCE_LABELS: Record<number, string> = {
    0: 'New Graduate',
    1: '1-2 years',
    3: '3-5 years',
    5: '5-10 years',
    10: '10-15 years',
    15: '15-20 years',
    20: '20+ years',
};

function getExperienceLabel(years: number | null): string | null {
    if (years === null || years === undefined) return null;
    const keys = Object.keys(EXPERIENCE_LABELS).map(Number).sort((a, b) => b - a);
    for (const k of keys) {
        if (years >= k) return EXPERIENCE_LABELS[k];
    }
    return EXPERIENCE_LABELS[0];
}

/* ═══ CLAY TOKENS ═══ */
const cardBase: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '8px 8px 20px rgba(0,0,0,0.06), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)',
};

const recessedPill: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    fontSize: '12px', fontWeight: 600, padding: '4px 12px', borderRadius: '10px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: 'inset 1px 1px 3px rgba(0,60,50,0.04), inset -1px -1px 2px rgba(255,255,255,0.3)',
};

const clayBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '7px',
    padding: '10px 20px', borderRadius: '12px',
    fontSize: '14px', fontWeight: 600, cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '3px 3px 8px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.5)',
    transition: 'all 0.2s', textDecoration: 'none',
};

const sectionLabel: React.CSSProperties = {
    fontSize: '10px', fontWeight: 700, color: '#B0C4BC',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px',
};

type ErrorReason = 'no_posting' | 'posting_cap' | 'daily_cap' | 'not_found' | 'generic';

export default function CandidateProfileClient({ candidateId }: { candidateId: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [candidate, setCandidate] = useState<CandidateProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [errorReason, setErrorReason] = useState<ErrorReason | null>(null);
    const [showContact, setShowContact] = useState(false);
    const [showCompose, setShowCompose] = useState(false);
    const [postingJobId, setPostingJobId] = useState<string | undefined>(undefined);
    const [postingJobTitle, setPostingJobTitle] = useState<string | undefined>(undefined);

    // Read the originating page from the URL (?fromPage=N, set by
    // CandidateCard when the user clicked through from the Talent Pool).
    // This is the source of truth for the Back link — encoding the page in
    // the candidate URL itself sidesteps every router.back()/history quirk
    // we've fought with: the URL is the URL, and the back href is just a
    // function of what's in the address bar right now.
    const fromPageParam = (() => {
        const raw = searchParams.get('fromPage');
        const n = raw ? parseInt(raw, 10) : NaN;
        return Number.isFinite(n) && n > 1 ? n : null;
    })();
    const backHref = fromPageParam
        ? `/employer/candidates?page=${fromPageParam}`
        : '/employer/candidates';
    // Keep router.back() as the click handler as a belt-and-suspenders
    // path — if the user navigated via browser history (not the card),
    // back() restores the exact prior URL including any filter params
    // we don't encode in fromPage. If history is empty we fall through
    // to the href (push).
    const handleBackToTalentPool = (e: React.MouseEvent) => {
        // If we have an explicit fromPage, prefer that — it's the most
        // reliable signal and matches exactly what the user expects.
        if (fromPageParam) return; // let the Link href do the work
        e.preventDefault();
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
        } else {
            router.push('/employer/candidates');
        }
    };

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/employer/candidates/${candidateId}`);
                if (!res.ok) {
                    if (res.status === 404) {
                        setError('Candidate not found or profile is no longer visible.');
                        setErrorReason('not_found');
                        return;
                    }
                    // 403s from the unlock endpoint carry a `reason` we can use
                    // to render an actionable message instead of "Failed to load".
                    let body: { error?: string; reason?: ErrorReason } = {};
                    try { body = await res.json(); } catch { /* non-JSON */ }
                    const reason = body.reason && ['no_posting', 'posting_cap', 'daily_cap'].includes(body.reason)
                        ? body.reason
                        : 'generic';
                    setErrorReason(reason);
                    setError(body.error || 'Failed to load profile.');
                    return;
                }
                setCandidate(await res.json());
            } catch {
                setError('Failed to load profile.');
                setErrorReason('generic');
            } finally {
                setLoading(false);
            }
        })();
        (async () => {
            try {
                const res = await fetch('/api/employer/usage');
                if (res.ok) {
                    const data = await res.json();
                    if (data.postings && data.postings.length > 0) {
                        const savedPostingId = typeof window !== 'undefined' ? sessionStorage.getItem('talentPool_posting') : null;
                        const match = savedPostingId ? data.postings.find((p: { id: string }) => p.id === savedPostingId) : null;
                        const posting = match || data.postings[0];
                        setPostingJobId(posting.jobId);
                        setPostingJobTitle(posting.jobTitle);
                    }
                }
            } catch { /* silent */ }
        })();
    }, [candidateId]);

    if (loading) {
        return (
            <div style={{ background: '#F5F0EB', padding: '80px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <Loader2 size={32} className="animate-spin" style={{ color: '#0D9488', margin: '0 auto 12px', display: 'block' }} />
                    <p style={{ color: '#8A9BA6', fontSize: '14px' }}>Loading candidate profile…</p>
                </div>
            </div>
        );
    }

    if (error || !candidate) {
        const isNoPosting = errorReason === 'no_posting';
        const heading = isNoPosting
            ? 'Post a job to unlock candidates'
            : (error || 'Profile not available');
        const sub = isNoPosting
            ? 'Candidate contact info, resume, and LinkedIn unlock once you have at least one active job posting.'
            : null;
        return (
            <div style={{ background: '#F5F0EB', padding: '80px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ ...cardBase, padding: '48px 32px', textAlign: 'center', maxWidth: '460px' }}>
                    {isNoPosting ? (
                        <Briefcase size={36} style={{ color: '#0D9488', margin: '0 auto 12px', display: 'block' }} />
                    ) : (
                        <Shield size={36} style={{ color: '#B0C4BC', margin: '0 auto 12px', display: 'block' }} />
                    )}
                    <h2 style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', marginBottom: '8px' }}>
                        {heading}
                    </h2>
                    {sub && (
                        <p style={{ fontSize: '13px', color: '#6B7F8A', lineHeight: 1.55, margin: '0 0 18px' }}>
                            {sub}
                        </p>
                    )}
                    {isNoPosting && (
                        <Link
                            href="/post-job"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '10px 18px', borderRadius: '12px',
                                fontSize: '13px', fontWeight: 600, color: '#fff',
                                background: 'linear-gradient(145deg, #10B981, #0D9488)',
                                boxShadow: '3px 3px 8px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
                                textDecoration: 'none', marginBottom: '14px',
                            }}
                        >
                            <Plus size={14} /> Post a Job
                        </Link>
                    )}
                    <div>
                        <Link
                            href={backHref}
                            onClick={handleBackToTalentPool}
                            style={{ color: '#0D9488', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}
                        >
                            ← Back to Talent Pool
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const expLabel = getExperienceLabel(candidate.yearsExperience);
    const safeCerts = candidate.certifications || [];
    const safeSpecs = candidate.specialties || [];
    const safeStates = candidate.licenseStates || [];

    return (
        <div style={{ background: '#F5F0EB' }}>
            {/* Header band */}
            <div style={{
                padding: '20px 16px',
                background: 'linear-gradient(180deg, #EDE7E0 0%, #F5F0EB 100%)',
                borderBottom: '1px solid #E5E7EB',
            }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <Link
                        href={backHref}
                        onClick={handleBackToTalentPool}
                        className="cp-back-link"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            fontSize: '13px', fontWeight: 600, color: '#8A9BA6', textDecoration: 'none',
                        }}
                    >
                        <ArrowLeft size={15} /> Back to Talent Pool
                    </Link>
                </div>
            </div>

            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px 16px 48px' }}>

                {/* ═══ Profile Header ═══ */}
                <div style={{ ...cardBase, padding: '24px', marginBottom: '14px', display: 'flex', gap: '18px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{
                        width: '72px', height: '72px', borderRadius: '20px',
                        background: candidate.avatarUrl
                            ? `url(${candidate.avatarUrl}) center/cover`
                            : 'linear-gradient(145deg, #10B981, #0D9488)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 800, fontSize: '24px', flexShrink: 0,
                        boxShadow: '4px 4px 12px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.3)',
                    }}>
                        {!candidate.avatarUrl && candidate.initials}
                    </div>

                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <h1 style={{
                            fontSize: '24px', fontWeight: 800,
                            fontFamily: 'var(--font-lora), Georgia, serif',
                            color: '#1A2E35', margin: '0 0 4px',
                        }}>
                            {candidate.displayName}
                        </h1>
                        {candidate.headline && (
                            <p style={{ fontSize: '14px', color: '#6B7F8A', margin: '0 0 10px' }}>
                                {candidate.headline}
                                {candidate.yearsExperience !== null && ` | ${candidate.yearsExperience} years experience`}
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                            {expLabel && (
                                <span style={{ ...recessedPill, background: '#CCFBF1', color: '#0D9488', border: '1px solid #99F6E4' }}>
                                    {expLabel}
                                </span>
                            )}
                            {candidate.hasResume && (
                                <span style={{ ...recessedPill, background: '#DBEAFE', color: '#2563EB', border: '1px solid #BFDBFE' }}>
                                    <FileText size={11} /> Resume Available
                                </span>
                            )}
                            {candidate.preferredWorkMode && (
                                <span style={{ ...recessedPill, background: '#F5F6F8', color: '#6B7F8A' }}>
                                    <Briefcase size={11} /> {candidate.preferredWorkMode}
                                </span>
                            )}
                        </div>

                        {/* Quick Actions */}
                        {candidate.hasFullAccess && (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button onClick={() => setShowCompose(true)} className="cp-action-btn" style={{
                                    ...clayBtn,
                                    background: 'linear-gradient(145deg, #10B981, #0D9488)', color: '#fff', border: 'none',
                                    boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                                }}>
                                    <Mail size={15} /> Contact Candidate
                                </button>
                                {candidate.hasResume && (
                                    <a href={`/api/employer/candidates/${candidate.id}/resume`} target="_blank" rel="noopener noreferrer" className="cp-action-btn" style={{
                                        ...clayBtn, background: '#FFFFFF', color: '#2A4A5A',
                                    }}>
                                        <FileText size={15} /> Download Resume
                                    </a>
                                )}
                                {candidate.linkedinUrl && (
                                    <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="cp-action-btn" style={{
                                        ...clayBtn, background: '#FFFFFF', color: '#0A66C2',
                                    }}>
                                        <Linkedin size={15} /> LinkedIn
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══ Bio ═══ */}
                {candidate.bio && (
                    <div style={{ ...cardBase, padding: '20px 24px', marginBottom: '14px' }}>
                        <p style={{ ...sectionLabel }}><ExternalLink size={12} /> About</p>
                        <p style={{ fontSize: '14px', color: '#2A4A5A', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                            {candidate.bio}
                        </p>
                    </div>
                )}

                {/* ═══ Credentials ═══ */}
                {(safeSpecs.length > 0 || safeCerts.length > 0 || safeStates.length > 0) && (
                    <div style={{ ...cardBase, padding: '20px 24px', marginBottom: '14px' }}>
                        <p style={{ ...sectionLabel }}><Award size={12} /> Credentials</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {safeSpecs.length > 0 && (
                                <div>
                                    <p style={{ fontSize: '12px', color: '#8A9BA6', marginBottom: '6px', fontWeight: 500 }}>Specialties</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                        {safeSpecs.map(s => (
                                            <span key={s} style={{ ...recessedPill, background: '#EDE9FE', color: '#7C3AED', border: '1px solid #DDD6FE' }}>
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {safeCerts.length > 0 && (
                                <div>
                                    <p style={{ fontSize: '12px', color: '#8A9BA6', marginBottom: '6px', fontWeight: 500 }}>Certifications</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                        {safeCerts.map(c => (
                                            <span key={c} style={{ ...recessedPill, background: '#CCFBF1', color: '#0D9488', border: '1px solid #99F6E4' }}>
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {safeStates.length > 0 && (
                                <div>
                                    <p style={{ fontSize: '12px', color: '#8A9BA6', marginBottom: '6px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <MapPin size={11} /> Licensed States
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {safeStates.map(st => (
                                            <span key={st} style={{
                                                fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '8px',
                                                background: '#F5F6F8', color: '#6B7F8A', border: '1px solid rgba(0,0,0,0.06)',
                                            }}>
                                                {st}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══ Preferences & Availability ═══ */}
                {(candidate.preferredJobType || candidate.preferredWorkMode || candidate.salaryRange || candidate.availableDate) && (
                    <div style={{ ...cardBase, padding: '20px 24px', marginBottom: '14px' }}>
                        <p style={{ ...sectionLabel }}><Calendar size={12} /> Preferences & Availability</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
                            {candidate.preferredJobType && (
                                <div>
                                    <p style={{ fontSize: '11px', color: '#B0C4BC', marginBottom: '3px' }}>Job Type</p>
                                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E35', margin: 0 }}>{candidate.preferredJobType}</p>
                                </div>
                            )}
                            {candidate.preferredWorkMode && (
                                <div>
                                    <p style={{ fontSize: '11px', color: '#B0C4BC', marginBottom: '3px' }}>Work Mode</p>
                                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E35', margin: 0 }}>{candidate.preferredWorkMode}</p>
                                </div>
                            )}
                            {candidate.salaryRange && (
                                <div>
                                    <p style={{ fontSize: '11px', color: '#B0C4BC', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <DollarSign size={10} /> Desired Salary
                                    </p>
                                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#0D9488', margin: 0 }}>{candidate.salaryRange}</p>
                                </div>
                            )}
                            {candidate.availableDate && (
                                <div>
                                    <p style={{ fontSize: '11px', color: '#B0C4BC', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <Clock size={10} /> Available
                                    </p>
                                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E35', margin: 0 }}>
                                        {new Date(candidate.availableDate) <= new Date()
                                            ? 'Immediately'
                                            : new Date(candidate.availableDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══ Contact Actions (full access) ═══ */}
                {candidate.hasFullAccess ? (
                    <div style={{ ...cardBase, padding: '20px 24px', marginBottom: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {!showContact ? (
                            <button onClick={() => setShowContact(true)} className="cp-action-btn" style={{
                                ...clayBtn,
                                background: 'linear-gradient(145deg, #10B981, #0D9488)', color: '#fff', border: 'none',
                                boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                            }}>
                                <Mail size={15} /> Contact Candidate
                            </button>
                        ) : (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '10px 16px', borderRadius: '12px',
                                background: '#CCFBF1', border: '1px solid #99F6E4',
                            }}>
                                <Mail size={15} style={{ color: '#0D9488' }} />
                                <a href={`mailto:${candidate.contactEmail}`} style={{ color: '#0D9488', fontWeight: 600, fontSize: '14px' }}>
                                    {candidate.contactEmail}
                                </a>
                            </div>
                        )}
                        {candidate.hasResume && (
                            <a href={`/api/employer/candidates/${candidate.id}/resume`} target="_blank" rel="noopener noreferrer" className="cp-action-btn" style={{
                                ...clayBtn, background: '#FFFFFF', color: '#2A4A5A',
                            }}>
                                <FileText size={15} /> Download Resume
                            </a>
                        )}
                        {candidate.linkedinUrl && (
                            <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="cp-action-btn" style={{
                                ...clayBtn, background: '#FFFFFF', color: '#0A66C2',
                            }}>
                                <Linkedin size={15} /> LinkedIn Profile
                            </a>
                        )}
                    </div>
                ) : (
                    /* ═══ Upgrade CTA ═══ */
                    <div style={{
                        ...cardBase, padding: '32px 24px', marginBottom: '14px', textAlign: 'center',
                        background: 'linear-gradient(145deg, #FFFFFF 0%, #F8F9FB 100%)',
                    }}>
                        <div style={{
                            width: '56px', height: '56px', borderRadius: '18px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 14px',
                            background: 'linear-gradient(145deg, #EDE9FE, #DBEAFE)',
                            boxShadow: '4px 4px 12px rgba(0,0,0,0.06), -3px -3px 8px rgba(255,255,255,0.9)',
                        }}>
                            <Lock size={24} style={{ color: '#7C3AED' }} />
                        </div>
                        <h3 style={{
                            fontSize: '18px', fontWeight: 700,
                            fontFamily: 'var(--font-lora), Georgia, serif',
                            color: '#1A2E35', marginBottom: '6px',
                        }}>
                            Unlock Full Candidate Access
                        </h3>
                        <p style={{ fontSize: '13px', color: '#8A9BA6', marginBottom: '4px', lineHeight: 1.6 }}>
                            Contact info, resume, and LinkedIn access requires an active job posting with remaining unlocks.
                        </p>
                        <p style={{ fontSize: '12px', color: '#B0C4BC', marginBottom: '18px' }}>
                            Post a job to unlock candidate profiles (first 2 posts are free).
                        </p>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '18px' }}>
                            {[
                                { icon: <Mail size={13} />, label: 'Direct email', color: '#0D9488' },
                                { icon: <FileText size={13} />, label: 'Resume download', color: '#2563EB' },
                                { icon: <Linkedin size={13} />, label: 'LinkedIn profile', color: '#0A66C2' },
                            ].map(f => (
                                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#8A9BA6' }}>
                                    <span style={{ color: f.color }}>{f.icon}</span> {f.label}
                                </div>
                            ))}
                        </div>
                        <a href="/post-job" className="cp-action-btn" style={{
                            ...clayBtn,
                            background: 'linear-gradient(145deg, #10B981, #0D9488)', color: '#fff', border: 'none',
                            padding: '12px 24px', fontSize: '14px',
                            boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                        }}>
                            Post a Featured Job to Unlock →
                        </a>
                    </div>
                )}

                {/* Member since */}
                <p style={{ textAlign: 'center', fontSize: '11px', color: '#B0C4BC', marginTop: '8px' }}>
                    Member since {new Date(candidate.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>

                {/* Compose Message Modal */}
                {showCompose && (
                    <ComposeMessageModal
                        recipientId={candidate.id}
                        recipientName={candidate.displayName}
                        jobId={postingJobId}
                        jobTitle={postingJobTitle}
                        onClose={() => setShowCompose(false)}
                        onSent={() => setShowCompose(false)}
                    />
                )}
            </div>

            {/* Hover styles */}
            <style>{`
                .cp-action-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 5px 5px 14px rgba(0,0,0,0.09), -3px -3px 8px rgba(255,255,255,0.9) !important;
                }
                .cp-back-link:hover {
                    color: #0D9488 !important;
                }
            `}</style>
        </div>
    );
}
