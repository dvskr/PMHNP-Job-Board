'use client';

import { useState, useEffect } from 'react';
import { FileText, Upload, CheckCircle, Loader2, AlertCircle, X, ShieldCheck } from 'lucide-react';

interface InPlatformApplyFormProps {
    jobId: string;
    jobTitle: string;
    onClose: () => void;
    onSuccess: () => void;
}

interface UserProfile {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
    resumeUrl?: string | null;
    headline?: string | null;
}

export default function InPlatformApplyForm({
    jobId,
    jobTitle,
    onClose,
    onSuccess,
}: InPlatformApplyFormProps) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [coverLetter, setCoverLetter] = useState('');
    const [resumeUrl, setResumeUrl] = useState<string | null>(null);
    const [useProfileResume, setUseProfileResume] = useState(true);
    const [uploadingResume, setUploadingResume] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [consentGiven, setConsentGiven] = useState(false);

    // Load user profile data
    useEffect(() => {
        async function loadProfile() {
            try {
                const res = await fetch('/api/profile');
                if (res.ok) {
                    const data = await res.json();
                    setProfile(data);
                    if (data.resumeUrl) {
                        setResumeUrl(data.resumeUrl);
                    }
                }
            } catch {
                // Profile load failed — not critical
            } finally {
                setLoadingProfile(false);
            }
        }
        loadProfile();
    }, []);

    const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (!allowedTypes.includes(file.type)) {
            setError('Please upload a PDF or Word document');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError('Resume must be under 5MB');
            return;
        }

        setUploadingResume(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/upload/resume', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Upload failed');
            }

            const { url } = await res.json();
            setResumeUrl(url);
            setUseProfileResume(false);
        } catch (err) {
            console.error('Resume upload failed:', err);
            setError('Failed to upload resume. Please try again.');
        } finally {
            setUploadingResume(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch('/api/applications/apply-direct', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    coverLetter: coverLetter.trim() || null,
                    resumeUrl: resumeUrl || null,
                    consent: consentGiven,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to submit application');
            }

            setSubmitted(true);
            setTimeout(() => {
                onSuccess();
            }, 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Success state ───
    if (submitted) {
        return (
            <div className="rounded-2xl p-6 text-center animate-fade-in"
                style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                }}
            >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                    style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}
                >
                    <CheckCircle size={28} style={{ color: '#22C55E' }} />
                </div>
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Application Submitted!
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Your application for <strong>{jobTitle}</strong> has been sent to the employer.
                    They&apos;ll be notified by email.
                </p>
            </div>
        );
    }

    return (
        <div
            className="rounded-2xl overflow-hidden"
            style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
            }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-6 py-4"
                style={{
                    background: 'linear-gradient(135deg, rgba(13,148,136,0.08), rgba(15,118,110,0.04))',
                    borderBottom: '1px solid var(--border-color)',
                }}
            >
                <div>
                    <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                        Apply for this position
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        {jobTitle}
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    aria-label="Close"
                >
                    <X size={18} style={{ color: 'var(--text-muted)' }} />
                </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
                {/* Profile Summary */}
                {loadingProfile ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                        <Loader2 size={14} className="animate-spin" />
                        Loading your profile...
                    </div>
                ) : profile && (
                    <div
                        className="flex items-center gap-3 p-3 rounded-xl"
                        style={{
                            backgroundColor: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                        }}
                    >
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                            style={{
                                background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                                color: 'white',
                            }}
                        >
                            {(profile.firstName?.charAt(0) || profile.email?.charAt(0) || 'U').toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                {[profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email}
                            </p>
                            {profile.headline && (
                                <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                                    {profile.headline}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Resume Section */}
                <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                        Resume
                    </label>

                    {/* Existing resume from profile */}
                    {profile?.resumeUrl && useProfileResume && (
                        <div
                            className="flex items-center gap-3 p-3 rounded-xl mb-2"
                            style={{
                                backgroundColor: 'rgba(13,148,136,0.06)',
                                border: '1px solid rgba(13,148,136,0.2)',
                            }}
                        >
                            <FileText size={18} style={{ color: '#0d9488' }} />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                    Using your profile resume
                                </p>
                                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                    Your saved resume will be shared with the employer
                                </p>
                            </div>
                            <CheckCircle size={16} style={{ color: '#0d9488' }} />
                        </div>
                    )}

                    {/* Upload new resume */}
                    <label
                        className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all hover:border-teal-400"
                        style={{
                            backgroundColor: 'var(--bg-tertiary)',
                            border: '1px dashed var(--border-color)',
                        }}
                    >
                        <Upload size={18} style={{ color: 'var(--text-tertiary)' }} />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                {profile?.resumeUrl
                                    ? 'Upload a different resume'
                                    : 'Upload your resume'}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                PDF or Word, up to 5MB
                            </p>
                        </div>
                        {uploadingResume && <Loader2 size={16} className="animate-spin" style={{ color: '#0d9488' }} />}
                        {!useProfileResume && resumeUrl && !uploadingResume && (
                            <CheckCircle size={16} style={{ color: '#0d9488' }} />
                        )}
                        <input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            onChange={handleResumeUpload}
                            className="sr-only"
                            disabled={uploadingResume}
                        />
                    </label>
                </div>

                {/* Cover Letter */}
                <div>
                    <label htmlFor="coverLetter" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                        Cover Letter <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>(optional)</span>
                    </label>
                    <textarea
                        id="coverLetter"
                        value={coverLetter}
                        onChange={(e) => setCoverLetter(e.target.value)}
                        placeholder="Tell the employer why you're a great fit for this role..."
                        rows={5}
                        className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all resize-none"
                        style={{
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = '#0d9488';
                            e.target.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.1)';
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = 'var(--border-color)';
                            e.target.style.boxShadow = 'none';
                        }}
                    />
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        {coverLetter.length > 0 ? `${coverLetter.length} characters` : 'A brief note can help you stand out'}
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div
                        className="flex items-start gap-2 p-3 rounded-xl text-sm"
                        style={{
                            backgroundColor: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            color: '#ef4444',
                        }}
                    >
                        <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Submit Button */}
                <button
                    type="submit"
                    disabled={submitting || uploadingResume || !consentGiven}
                    className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                        background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                        boxShadow: '0 4px 14px rgba(13,148,136,0.35)',
                    }}
                    onMouseEnter={(e) => {
                        if (!submitting) {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 6px 20px rgba(13,148,136,0.45)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 14px rgba(13,148,136,0.35)';
                    }}
                >
                    {submitting ? (
                        <span className="inline-flex items-center gap-2">
                            <Loader2 size={16} className="animate-spin" />
                            Submitting...
                        </span>
                    ) : (
                        'Submit Application'
                    )}
                </button>

                {/* GDPR Consent */}
                <label className="flex items-start gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={consentGiven}
                        onChange={(e) => setConsentGiven(e.target.checked)}
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                        <ShieldCheck size={12} className="inline mr-1" style={{ color: '#0d9488' }} />
                        I consent to sharing my profile, resume, and cover letter with this employer.
                        You may withdraw your application at any time.
                    </span>
                </label>

                {/* Privacy Note */}
                <p className="text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Your data is handled in accordance with our privacy policy.
                </p>
            </form>
        </div>
    );
}
