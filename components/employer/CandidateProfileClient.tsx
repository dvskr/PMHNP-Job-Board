'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, MapPin, Briefcase, Award, Calendar, DollarSign,
    FileText, Mail, ExternalLink, Loader2, Shield, Clock, Linkedin,
} from 'lucide-react';

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
    // TODO: Gate behind paid plan
    contactEmail: string;
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

export default function CandidateProfileClient({ candidateId }: { candidateId: string }) {
    const [candidate, setCandidate] = useState<CandidateProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showContact, setShowContact] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/employer/candidates/${candidateId}`);
                if (!res.ok) {
                    setError(res.status === 404 ? 'Candidate not found or profile is no longer visible.' : 'Failed to load profile.');
                    return;
                }
                setCandidate(await res.json());
            } catch {
                setError('Failed to load profile.');
            } finally {
                setLoading(false);
            }
        })();
    }, [candidateId]);

    if (loading) {
        return (
            <div style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '80px', textAlign: 'center' }}>
                <Loader2 size={36} className="animate-spin" style={{ color: '#2DD4BF', margin: '0 auto 16px' }} />
                <p style={{ color: 'var(--text-secondary)' }}>Loading candidate profile…</p>
            </div>
        );
    }

    if (error || !candidate) {
        return (
            <div style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '80px', textAlign: 'center' }}>
                <Shield size={40} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    {error || 'Profile not available'}
                </h2>
                <Link
                    href="/employer/candidates"
                    style={{ color: '#2DD4BF', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}
                >
                    ← Back to Talent Pool
                </Link>
            </div>
        );
    }

    const expLabel = getExperienceLabel(candidate.yearsExperience);

    const sectionStyle: React.CSSProperties = {
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        paddingTop: '24px',
        paddingRight: '24px',
        paddingBottom: '24px',
        paddingLeft: '24px',
        marginBottom: '16px',
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        marginBottom: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '24px', paddingRight: '16px', paddingBottom: '48px', paddingLeft: '16px' }}>
            {/* Back Link */}
            <Link
                href="/employer/candidates"
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textDecoration: 'none',
                    marginBottom: '24px',
                }}
            >
                <ArrowLeft size={16} /> Back to Talent Pool
            </Link>

            {/* Profile Header */}
            <div style={{ ...sectionStyle, display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* Avatar */}
                <div
                    style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '18px',
                        background: candidate.avatarUrl
                            ? `url(${candidate.avatarUrl}) center/cover`
                            : 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '24px',
                        flexShrink: 0,
                    }}
                >
                    {!candidate.avatarUrl && candidate.initials}
                </div>

                <div style={{ flex: 1, minWidth: '200px' }}>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                        {candidate.displayName}
                    </h1>
                    {candidate.headline && (
                        <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                            {candidate.headline}
                        </p>
                    )}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {expLabel && (
                            <span style={{
                                fontSize: '12px', fontWeight: 600, padding: '4px 10px',
                                borderRadius: '8px', backgroundColor: 'rgba(45,212,191,0.12)', color: '#2DD4BF',
                            }}>
                                {expLabel}
                            </span>
                        )}
                        {candidate.hasResume && (
                            <span style={{
                                fontSize: '12px', fontWeight: 600, padding: '4px 10px',
                                borderRadius: '8px', backgroundColor: 'rgba(59,130,246,0.12)', color: '#60A5FA',
                                display: 'flex', alignItems: 'center', gap: '4px',
                            }}>
                                <FileText size={12} /> Resume Available
                            </span>
                        )}
                        {candidate.preferredWorkMode && (
                            <span style={{
                                fontSize: '12px', fontWeight: 600, padding: '4px 10px',
                                borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                                display: 'flex', alignItems: 'center', gap: '4px',
                            }}>
                                <Briefcase size={12} /> {candidate.preferredWorkMode}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Bio */}
            {candidate.bio && (
                <div style={sectionStyle}>
                    <h3 style={labelStyle}>About</h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                        {candidate.bio}
                    </p>
                </div>
            )}

            {/* Credentials */}
            <div style={sectionStyle}>
                <h3 style={labelStyle}><Award size={14} /> Credentials</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Certifications */}
                    {candidate.certifications.length > 0 && (
                        <div>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Certifications</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {candidate.certifications.map(c => (
                                    <span key={c} style={{
                                        fontSize: '12px', fontWeight: 600, padding: '5px 12px',
                                        borderRadius: '8px', backgroundColor: 'rgba(45,212,191,0.1)',
                                        color: '#2DD4BF', border: '1px solid rgba(45,212,191,0.2)',
                                    }}>
                                        {c}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Specialties */}
                    {candidate.specialties.length > 0 && (
                        <div>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Specialties</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {candidate.specialties.map(s => (
                                    <span key={s} style={{
                                        fontSize: '12px', padding: '5px 12px',
                                        borderRadius: '8px', backgroundColor: 'rgba(139,92,246,0.1)',
                                        color: '#A78BFA', border: '1px solid rgba(139,92,246,0.2)',
                                    }}>
                                        {s}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Licensed States */}
                    {candidate.licenseStates.length > 0 && (
                        <div>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <MapPin size={13} /> Licensed States
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {candidate.licenseStates.map(st => (
                                    <span key={st} style={{
                                        fontSize: '12px', padding: '4px 8px',
                                        borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.06)',
                                        color: 'var(--text-secondary)',
                                    }}>
                                        {st}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Preferences */}
            <div style={sectionStyle}>
                <h3 style={labelStyle}><Calendar size={14} /> Preferences & Availability</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    {candidate.preferredJobType && (
                        <div>
                            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Job Type</p>
                            <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>{candidate.preferredJobType}</p>
                        </div>
                    )}
                    {candidate.preferredWorkMode && (
                        <div>
                            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Work Mode</p>
                            <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>{candidate.preferredWorkMode}</p>
                        </div>
                    )}
                    {candidate.salaryRange && (
                        <div>
                            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <DollarSign size={12} /> Desired Salary Range
                            </p>
                            <p style={{ fontSize: '14px', color: '#2DD4BF', fontWeight: 700, margin: 0 }}>{candidate.salaryRange}</p>
                        </div>
                    )}
                    {candidate.availableDate && (
                        <div>
                            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={12} /> Available
                            </p>
                            <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>
                                {new Date(candidate.availableDate) <= new Date()
                                    ? 'Immediately'
                                    : new Date(candidate.availableDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div style={{
                ...sectionStyle,
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                alignItems: 'center',
            }}>
                {/* TODO: Gate behind paid plan — Contact Candidate */}
                {!showContact ? (
                    <button
                        onClick={() => setShowContact(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            paddingTop: '12px',
                            paddingRight: '24px',
                            paddingBottom: '12px',
                            paddingLeft: '24px',
                            borderRadius: '12px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '14px',
                            cursor: 'pointer',
                        }}
                    >
                        <Mail size={16} /> Contact Candidate
                    </button>
                ) : (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        paddingTop: '12px',
                        paddingRight: '20px',
                        paddingBottom: '12px',
                        paddingLeft: '20px',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(45,212,191,0.08)',
                        border: '1px solid rgba(45,212,191,0.2)',
                    }}>
                        <Mail size={16} style={{ color: '#2DD4BF' }} />
                        <a
                            href={`mailto:${candidate.contactEmail}`}
                            style={{ color: '#2DD4BF', fontWeight: 600, fontSize: '14px' }}
                        >
                            {candidate.contactEmail}
                        </a>
                    </div>
                )}

                {/* TODO: Gate behind paid plan — Download Resume */}
                {candidate.hasResume && candidate.resumeUrl && (
                    <a
                        href={candidate.resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            paddingTop: '12px',
                            paddingRight: '24px',
                            paddingBottom: '12px',
                            paddingLeft: '24px',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                            fontSize: '14px',
                            textDecoration: 'none',
                        }}
                    >
                        <FileText size={16} /> Download Resume
                    </a>
                )}

                {/* LinkedIn */}
                {candidate.linkedinUrl && (
                    <a
                        href={candidate.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            paddingTop: '12px',
                            paddingRight: '24px',
                            paddingBottom: '12px',
                            paddingLeft: '24px',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-secondary)',
                            color: '#0A66C2',
                            fontWeight: 600,
                            fontSize: '14px',
                            textDecoration: 'none',
                        }}
                    >
                        <Linkedin size={16} /> LinkedIn Profile
                    </a>
                )}
            </div>

            {/* Member since */}
            <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                Member since {new Date(candidate.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
        </div>
    );
}
