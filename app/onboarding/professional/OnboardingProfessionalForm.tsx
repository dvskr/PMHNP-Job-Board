'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, ArrowRight, Loader2, FileText } from 'lucide-react';
import ResumeUpload from '@/components/auth/ResumeUpload';

// Kept in sync with components/employer/CandidateSearchClient.tsx —
// the same chip set employers use to filter the talent pool, so the
// candidate's tags align with how they'll be discovered.
const SPECIALTY_PRESETS = [
    'ADHD', 'Anxiety/Depression', 'PTSD', 'Addiction',
    'Child & Adolescent', 'Geriatric', 'Eating Disorders',
    'OCD', 'Bipolar', 'Schizophrenia', 'General Adult',
];

interface InitialValues {
    headline: string;
    bio: string;
    specialties: string;
    yearsExperience: number | null;
    resumeUrl: string | null;
    resumeParseStatus: string | null;
}

export default function OnboardingProfessionalForm({ initial }: { initial: InitialValues }) {
    const router = useRouter();
    const [headline, setHeadline] = useState(initial.headline);
    const [bio, setBio] = useState(initial.bio);
    const [yearsExperience, setYearsExperience] = useState<number | null>(initial.yearsExperience);
    const [resumeUrl, setResumeUrl] = useState<string | null>(initial.resumeUrl);
    const [resumeParseStatus, setResumeParseStatus] = useState<string | null>(initial.resumeParseStatus);
    // After AI autofill applies, refetch the profile so the manual fields
    // below show the parsed values — and the user can save without
    // re-typing what the resume already gave us.
    const refetchProfile = async () => {
        try {
            const res = await fetch('/api/auth/profile', { credentials: 'include' });
            if (!res.ok) return;
            const p = await res.json();
            if (typeof p.headline === 'string') setHeadline(p.headline);
            if (typeof p.bio === 'string') setBio(p.bio);
            if (typeof p.yearsExperience === 'number') setYearsExperience(p.yearsExperience);
            if (typeof p.specialties === 'string') {
                setSelectedSpecialties(new Set(p.specialties.split(',').map((s: string) => s.trim()).filter(Boolean)));
            }
            if (typeof p.resumeParseStatus === 'string') setResumeParseStatus(p.resumeParseStatus);
        } catch {
            // Non-fatal — user can still type fields manually.
        }
    };
    const [selectedSpecialties, setSelectedSpecialties] = useState<Set<string>>(
        new Set(initial.specialties.split(',').map((s) => s.trim()).filter(Boolean))
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleSpecialty = (s: string) => {
        const next = new Set(selectedSpecialties);
        if (next.has(s)) next.delete(s); else next.add(s);
        setSelectedSpecialties(next);
    };

    async function handleSubmit(skip: boolean) {
        setError(null);
        setSaving(true);
        try {
            // Skip = navigate without writing. Dashboard's amber callout will
            // keep prompting until the searchability rule is met.
            if (skip) {
                router.push('/dashboard');
                return;
            }
            const res = await fetch('/api/auth/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    headline: headline.trim() || null,
                    bio: bio.trim() || null,
                    specialties: Array.from(selectedSpecialties).join(', ') || null,
                    yearsExperience,
                }),
            });
            if (!res.ok) {
                setError('Could not save your details. Try again or skip for now.');
                setSaving(false);
                return;
            }
            router.push('/dashboard');
            router.refresh();
        } catch {
            setError('Could not save your details. Try again or skip for now.');
            setSaving(false);
        }
    }

    const minimallyComplete = headline.trim().length > 0 && selectedSpecialties.size > 0;

    return (
        <main style={{ minHeight: '100vh', background: '#F0F5F1', padding: '40px 16px' }}>
            <div style={{ maxWidth: '640px', margin: '0 auto' }}>
                <div style={{
                    background: '#FFFFFF', borderRadius: '20px', padding: '32px',
                    border: '1px solid rgba(213,232,224,0.6)',
                    boxShadow: '8px 8px 20px rgba(0,60,50,0.06), -3px -3px 10px rgba(255,255,255,0.8)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '10px',
                            background: 'linear-gradient(145deg, #8B5CF6, #7C3AED)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                        }}>
                            <Sparkles size={16} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7C3AED' }}>
                            Step 1 of 1
                        </span>
                    </div>
                    <h1 style={{
                        fontSize: '26px', fontWeight: 700, color: '#1A2E35', margin: '0 0 8px',
                        fontFamily: 'var(--font-lora), Georgia, serif',
                    }}>
                        Make yourself findable to employers
                    </h1>
                    <p style={{ fontSize: '14px', color: '#6B7F8A', margin: '0 0 24px', lineHeight: 1.5 }}>
                        Upload a resume and we&apos;ll fill out everything below for you — or type the
                        details in by hand. Either way, takes about 30 seconds.
                    </p>

                    {/* ─── Fast path: resume upload + AI autofill ───
                        Drops the user into the existing ResumeUpload flow
                        which uploads → preview-parses → opens the
                        ResumeAutofillReview modal. After they apply, we
                        refetch the profile so the manual fields below
                        populate with the parsed values. The embedding
                        refresh fires server-side from /api/resume/parse,
                        so the candidate becomes searchable in employer AI
                        Match without any further clicks here. */}
                    <div style={{
                        marginBottom: '20px',
                        padding: '16px',
                        borderRadius: '14px',
                        background: 'linear-gradient(145deg, rgba(139,92,246,0.06), rgba(124,58,237,0.04))',
                        border: '1px solid rgba(139,92,246,0.18)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            <div style={{
                                width: '24px', height: '24px', borderRadius: '8px',
                                background: 'linear-gradient(145deg, #8B5CF6, #7C3AED)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                            }}>
                                <FileText size={13} />
                            </div>
                            <h2 style={{
                                fontSize: '15px', fontWeight: 700, color: '#5B21B6', margin: 0,
                                fontFamily: 'var(--font-lora), Georgia, serif',
                            }}>
                                Fastest: upload your resume, AI fills the rest
                            </h2>
                        </div>
                        <ResumeUpload
                            currentResumeUrl={resumeUrl}
                            resumeParseStatus={resumeParseStatus}
                            onUploadComplete={(url) => setResumeUrl(url)}
                            onAutofillApplied={() => { void refetchProfile(); }}
                        />
                    </div>

                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        margin: '8px 0 20px', color: '#8A9BA6', fontSize: '12px',
                        fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>
                        <span style={{ flex: 1, height: '1px', background: 'rgba(0,0,0,0.08)' }} />
                        or fill in by hand
                        <span style={{ flex: 1, height: '1px', background: 'rgba(0,0,0,0.08)' }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <label htmlFor="headline" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A2E35', marginBottom: '6px' }}>
                                Professional headline
                            </label>
                            <input
                                id="headline"
                                type="text"
                                value={headline}
                                onChange={(e) => setHeadline(e.target.value)}
                                placeholder="e.g. PMHNP-BC | 5 yrs telehealth, child + adolescent"
                                maxLength={120}
                                style={inputStyle}
                            />
                            <p style={hintStyle}>One line that introduces you. Surfaces in search and on your profile card.</p>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A2E35', marginBottom: '6px' }}>
                                Specialties <span style={{ color: '#8A9BA6', fontWeight: 400 }}>(pick what fits)</span>
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {SPECIALTY_PRESETS.map((s) => {
                                    const active = selectedSpecialties.has(s);
                                    return (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => toggleSpecialty(s)}
                                            style={{
                                                padding: '7px 14px', borderRadius: '999px',
                                                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                                background: active ? '#7C3AED' : '#F5F0EB',
                                                color: active ? '#fff' : '#6B7F8A',
                                                border: active ? '1px solid #7C3AED' : '1px solid rgba(0,0,0,0.06)',
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {s}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="years" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A2E35', marginBottom: '6px' }}>
                                Years of experience
                            </label>
                            <select
                                id="years"
                                value={yearsExperience ?? ''}
                                onChange={(e) => setYearsExperience(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                                style={{ ...inputStyle, cursor: 'pointer' }}
                            >
                                <option value="">Select…</option>
                                <option value="0">New Grad</option>
                                {Array.from({ length: 29 }, (_, i) => i + 1).map((n) => (
                                    <option key={n} value={n}>{n} year{n === 1 ? '' : 's'}</option>
                                ))}
                                <option value="30">30+ years</option>
                            </select>
                        </div>

                        <div>
                            <label htmlFor="bio" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1A2E35', marginBottom: '6px' }}>
                                Brief summary <span style={{ color: '#8A9BA6', fontWeight: 400 }}>(optional, but high-impact)</span>
                            </label>
                            <textarea
                                id="bio"
                                value={bio}
                                onChange={(e) => setBio(e.target.value.slice(0, 500))}
                                placeholder="What kinds of patients you love working with, your approach, settings you've worked in…"
                                rows={4}
                                style={{ ...inputStyle, resize: 'vertical', minHeight: '110px' }}
                            />
                            <p style={hintStyle}>{bio.length}/500 characters</p>
                        </div>
                    </div>

                    {error && (
                        <p style={{ fontSize: '13px', color: '#DC2626', marginTop: '16px' }}>{error}</p>
                    )}

                    <div style={{ display: 'flex', gap: '12px', marginTop: '28px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => handleSubmit(false)}
                            disabled={saving || !minimallyComplete}
                            style={{
                                flex: '1 1 auto',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                padding: '13px 24px', borderRadius: '12px', border: 'none',
                                fontWeight: 700, fontSize: '14px', cursor: saving || !minimallyComplete ? 'not-allowed' : 'pointer',
                                color: '#fff',
                                background: 'linear-gradient(145deg, #0D9488, #0F766E)',
                                opacity: saving || !minimallyComplete ? 0.55 : 1,
                                boxShadow: '0 4px 14px rgba(13,148,136,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                            }}
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <>Save and continue <ArrowRight size={16} /></>}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSubmit(true)}
                            disabled={saving}
                            style={{
                                padding: '13px 20px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.08)',
                                background: 'transparent', color: '#6B7F8A',
                                fontWeight: 600, fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer',
                            }}
                        >
                            Skip for now
                        </button>
                    </div>

                    {!minimallyComplete && (
                        <p style={{ fontSize: '12px', color: '#8A9BA6', marginTop: '10px', textAlign: 'center' }}>
                            Fill at least the headline and one specialty to save.
                        </p>
                    )}
                </div>

                <p style={{ textAlign: 'center', marginTop: '20px' }}>
                    <Link href="/dashboard" style={{ fontSize: '12px', color: '#6B7F8A', textDecoration: 'underline' }}>
                        Take me to my dashboard instead
                    </Link>
                </p>
            </div>
        </main>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', fontSize: '14px',
    borderRadius: '12px', border: '1px solid rgba(0,0,0,0.08)',
    background: '#F5F6F8', color: '#1A2E35', outline: 'none',
    boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.05), inset -1px -1px 2px rgba(255,255,255,0.5)',
    fontFamily: 'inherit',
};

const hintStyle: React.CSSProperties = {
    fontSize: '12px', color: '#8A9BA6', margin: '6px 0 0',
};
