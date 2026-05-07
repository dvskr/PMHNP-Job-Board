'use client';

import { useEffect } from 'react';
import {
    X,
    User,
    Award,
    GraduationCap,
    Briefcase,
    BadgeCheck,
    FileText,
    Sparkles,
    Loader2,
    CheckCircle,
    AlertCircle,
} from 'lucide-react';
import type { ParsedResume } from '@/lib/resume-parser';

interface ResumeAutofillReviewProps {
    /** Open/close. The parent owns this state. */
    open: boolean;
    /** Parsed data from `/api/resume/parse?preview=1`. Null while loading. */
    parsed: ParsedResume | null;
    /** True while the preview fetch is in flight. */
    loading?: boolean;
    /** True while the apply fetch is in flight. */
    applying?: boolean;
    /** Set when preview fetch failed; shown to the user. */
    error?: string | null;
    /** `overwrite=false` → fill empty fields only (non-destructive merge).
     *  `overwrite=true` → replace existing scalar values + delete-and-
     *  recreate structured rows from the parsed payload. */
    onApply: (overwrite: boolean) => void;
    onClose: () => void;
}

const FIELD_BG = 'var(--bg-primary)';
const SECTION_BG = 'var(--bg-secondary)';
const BORDER = 'var(--border-color)';

/* ─────────────────────────────────────────────────────────────────────
 * Sprint 2.1.P5 — Review-before-save modal for resume autofill.
 *
 * Flow:
 *   1. ResumeUpload uploads file → server stores URL.
 *   2. ResumeUpload POSTs `/api/resume/parse?preview=1` (no DB writes).
 *   3. This modal displays the parsed JSON grouped by section.
 *   4. User clicks "Apply to Profile" → ResumeUpload re-POSTs
 *      `/api/resume/parse` (no flag) — gateway cache hits the same
 *      content hash and skips the LLM round-trip — and the route
 *      runs autoFillProfile() to populate empty fields + insert
 *      structured License/Cert/Education/Work rows.
 *
 * Sprint 2.1.P6 enforces that EEO-protected attributes (DOB, gender,
 * race, etc.) never appear in the parsed payload. This component
 * therefore intentionally has NO render path for those fields.
 * ──────────────────────────────────────────────────────────────────── */
export default function ResumeAutofillReview({
    open,
    parsed,
    loading = false,
    applying = false,
    error = null,
    onApply,
    onClose,
}: ResumeAutofillReviewProps) {
    // Close on Escape (only when not mid-apply — avoids losing the
    // commit if the user fat-fingers Esc while the spinner is up).
    useEffect(() => {
        if (!open || applying) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, applying, onClose]);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="resume-review-title"
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9998,
                padding: '20px',
                animation: 'fadeIn 0.2s ease',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: '720px',
                    maxHeight: 'calc(100vh - 40px)',
                    background: SECTION_BG,
                    border: `1px solid ${BORDER}`,
                    borderRadius: '20px',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '20px 24px',
                        borderBottom: `1px solid ${BORDER}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                    }}
                >
                    <div
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: 'rgba(139,92,246,0.10)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <Sparkles size={20} style={{ color: '#8B5CF6' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2
                            id="resume-review-title"
                            style={{
                                fontSize: '17px',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                margin: 0,
                            }}
                        >
                            Review extracted resume data
                        </h2>
                        <p
                            style={{
                                fontSize: '13px',
                                color: 'var(--text-muted)',
                                margin: '2px 0 0',
                            }}
                        >
                            Nothing is saved until you choose. <strong>Fill empty fields</strong> keeps what you already have. <strong>Replace everything</strong> overwrites existing values and rewrites your licenses, certs, education and work history.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={applying}
                        aria-label="Close review"
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: applying ? 'not-allowed' : 'pointer',
                            color: 'var(--text-muted)',
                            padding: '6px',
                            opacity: applying ? 0.4 : 1,
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                    {loading && (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '14px',
                                padding: '64px 0',
                                color: 'var(--text-muted)',
                            }}
                        >
                            <Loader2 size={32} className="animate-spin" style={{ color: '#8B5CF6' }} />
                            <p style={{ fontSize: '13px', margin: 0 }}>Reading your resume…</p>
                        </div>
                    )}

                    {error && !loading && (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                                padding: '14px 16px',
                                borderRadius: '12px',
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                color: '#EF4444',
                                fontSize: '13px',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                                <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{error}</span>
                            </div>
                            <ul
                                style={{
                                    margin: 0,
                                    paddingLeft: '32px',
                                    color: 'var(--text-secondary)',
                                    fontSize: '12px',
                                    lineHeight: 1.6,
                                }}
                            >
                                <li>Use a <strong>text-based</strong> PDF (exported from Word/Google Docs), not a scan or screenshot.</li>
                                <li>If your PDF was scanned, run it through OCR or re-export from the original source.</li>
                                <li>DOCX usually works best if the PDF route fails.</li>
                            </ul>
                        </div>
                    )}

                    {!loading && !error && parsed && <ParsedSections parsed={parsed} />}
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '16px 24px',
                        borderTop: `1px solid ${BORDER}`,
                        display: 'flex',
                        gap: '10px',
                        justifyContent: 'flex-end',
                        background: 'var(--bg-tertiary)',
                    }}
                >
                    {/* Close / Skip — label depends on whether we have
                        parsed data the user could choose to apply. */}
                    <button
                        onClick={onClose}
                        disabled={applying}
                        style={{
                            padding: '10px 18px',
                            borderRadius: '10px',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-secondary)',
                            fontSize: '13px',
                            fontWeight: 600,
                            border: `1.5px solid ${BORDER}`,
                            cursor: applying ? 'not-allowed' : 'pointer',
                            opacity: applying ? 0.5 : 1,
                        }}
                    >
                        {error || !parsed ? 'Close' : 'Skip for now'}
                    </button>
                    {/* Two distinct apply modes — see onApply prop docs.
                        Replace is opt-in (red) since it deletes existing
                        structured rows; Fill is the safer default. */}
                    {parsed && !error && (
                        <>
                            <button
                                onClick={() => onApply(true)}
                                disabled={loading || applying}
                                title="Overwrite existing fields and replace all licenses, certifications, education and work experience with what's in the resume."
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '7px',
                                    padding: '10px 16px',
                                    borderRadius: '10px',
                                    background: 'rgba(239,68,68,0.08)',
                                    color: '#B91C1C',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    border: '1.5px solid rgba(239,68,68,0.35)',
                                    cursor: loading || applying ? 'not-allowed' : 'pointer',
                                    opacity: loading || applying ? 0.5 : 1,
                                }}
                            >
                                Replace everything
                            </button>
                            <button
                                onClick={() => onApply(false)}
                                disabled={loading || applying}
                                title="Only fill profile fields that are currently empty. Existing values and existing licenses/certs/education/work entries are kept."
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '7px',
                                    padding: '10px 22px',
                                    borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
                                    color: '#FFFFFF',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    border: 'none',
                                    cursor: loading || applying ? 'not-allowed' : 'pointer',
                                    opacity: loading || applying ? 0.6 : 1,
                                    boxShadow: '0 4px 12px rgba(139,92,246,0.25)',
                                }}
                            >
                                {applying ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        Saving…
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle size={14} />
                                        Fill empty fields
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────
 * Section renderers — each accepts the relevant slice of ParsedResume
 * and either renders a card or returns null (for empty sections).
 * ──────────────────────────────────────────────────────────────────── */

function ParsedSections({ parsed }: { parsed: ParsedResume }) {
    const sections: React.ReactNode[] = [];

    const personalRows = buildPersonalRows(parsed);
    if (personalRows.length > 0) {
        sections.push(
            <Section key="personal" icon={<User size={16} />} iconColor="#818CF8" title="Personal info">
                <FieldGrid rows={personalRows} />
            </Section>,
        );
    }

    const profRows = buildProfessionalRows(parsed);
    if (profRows.length > 0) {
        sections.push(
            <Section key="prof" icon={<BadgeCheck size={16} />} iconColor="#2DD4BF" title="Professional">
                <FieldGrid rows={profRows} />
            </Section>,
        );
    }

    if (parsed.licenses && parsed.licenses.length > 0) {
        sections.push(
            <Section key="lic" icon={<Award size={16} />} iconColor="#F59E0B" title={`Licenses (${parsed.licenses.length})`}>
                <ListBlock items={parsed.licenses.map((l) => ({
                    primary: `${l.licenseState} · ${l.licenseType}`,
                    secondary: `#${l.licenseNumber}${l.expirationDate ? ` · expires ${l.expirationDate}` : ''}`,
                }))} />
            </Section>,
        );
    }

    if (parsed.certificationRecords && parsed.certificationRecords.length > 0) {
        sections.push(
            <Section key="cert" icon={<Award size={16} />} iconColor="#A78BFA" title={`Certifications (${parsed.certificationRecords.length})`}>
                <ListBlock items={parsed.certificationRecords.map((c) => ({
                    primary: c.certificationName,
                    secondary: [c.certifyingBody, c.certificationNumber && `#${c.certificationNumber}`, c.expirationDate && `expires ${c.expirationDate}`]
                        .filter(Boolean)
                        .join(' · ') || undefined,
                }))} />
            </Section>,
        );
    } else if (parsed.certifications && parsed.certifications.length > 0) {
        sections.push(
            <Section key="cert-flat" icon={<Award size={16} />} iconColor="#A78BFA" title={`Certifications (${parsed.certifications.length})`}>
                <PillRow items={parsed.certifications} />
            </Section>,
        );
    }

    if (parsed.education && parsed.education.length > 0) {
        sections.push(
            <Section key="edu" icon={<GraduationCap size={16} />} iconColor="#0EA5E9" title={`Education (${parsed.education.length})`}>
                <ListBlock items={parsed.education.map((e) => ({
                    primary: `${e.degreeType}${e.fieldOfStudy ? ` · ${e.fieldOfStudy}` : ''}`,
                    secondary: `${e.schoolName}${e.graduationYear ? ` · ${e.graduationYear}` : ''}`,
                }))} />
            </Section>,
        );
    }

    if (parsed.workExperience && parsed.workExperience.length > 0) {
        sections.push(
            <Section
                key="work"
                icon={<Briefcase size={16} />}
                iconColor="#22C55E"
                title={`Work experience (${parsed.workExperience.length})`}
            >
                <ListBlock items={parsed.workExperience.map((w) => ({
                    primary: `${w.jobTitle} · ${w.employerName}`,
                    secondary: [
                        w.startDate || w.endDate ? `${w.startDate ?? '?'} – ${w.isCurrent ? 'Present' : (w.endDate ?? '?')}` : null,
                        w.practiceSetting,
                    ]
                        .filter(Boolean)
                        .join(' · ') || undefined,
                    tertiary: w.description || undefined,
                }))} />
            </Section>,
        );
    }

    if (sections.length === 0) {
        return (
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '48px 0',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                }}
            >
                <FileText size={28} />
                <p style={{ fontSize: '13px', margin: 0 }}>
                    We could not extract any structured data from this resume.
                </p>
                <p style={{ fontSize: '12px', margin: 0 }}>
                    Try a text-based PDF or DOCX with clear section headings.
                </p>
            </div>
        );
    }

    return <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>{sections}</div>;
}

function buildPersonalRows(p: ParsedResume): Array<{ label: string; value: string }> {
    const rows: Array<{ label: string; value: string }> = [];
    const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ');
    if (fullName) rows.push({ label: 'Name', value: fullName });
    if (p.phone) rows.push({ label: 'Phone', value: p.phone });
    if (p.linkedinUrl) rows.push({ label: 'LinkedIn', value: p.linkedinUrl });
    if (p.headline) rows.push({ label: 'Headline', value: p.headline });
    return rows;
}

function buildProfessionalRows(p: ParsedResume): Array<{ label: string; value: string }> {
    const rows: Array<{ label: string; value: string }> = [];
    if (typeof p.yearsExperience === 'number') {
        rows.push({ label: 'Years experience', value: String(p.yearsExperience) });
    }
    if (p.npiNumber) rows.push({ label: 'NPI', value: p.npiNumber });
    if (p.deaNumber) rows.push({ label: 'DEA', value: p.deaNumber });
    if (p.licenseStates && p.licenseStates.length > 0) {
        rows.push({ label: 'License states', value: p.licenseStates.join(', ') });
    }
    if (p.specialties && p.specialties.length > 0) {
        rows.push({ label: 'Specialties', value: p.specialties.join(', ') });
    }
    if (p.skills && p.skills.length > 0) {
        rows.push({ label: 'Skills', value: p.skills.join(', ') });
    }
    return rows;
}

interface SectionProps {
    icon: React.ReactNode;
    iconColor: string;
    title: string;
    children: React.ReactNode;
}

function Section({ icon, iconColor, title, children }: SectionProps) {
    return (
        <div
            style={{
                background: FIELD_BG,
                border: `1px solid ${BORDER}`,
                borderRadius: '12px',
                padding: '14px 16px',
            }}
        >
            <h3
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    margin: '0 0 12px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                }}
            >
                <span style={{ color: iconColor, display: 'inline-flex' }}>{icon}</span>
                {title}
            </h3>
            {children}
        </div>
    );
}

function FieldGrid({ rows }: { rows: Array<{ label: string; value: string }> }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', rowGap: '8px', columnGap: '12px' }}>
            {rows.map((r) => (
                <FieldRow key={r.label} label={r.label} value={r.value} />
            ))}
        </div>
    );
}

function FieldRow({ label, value }: { label: string; value: string }) {
    return (
        <>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', paddingTop: '2px' }}>{label}</div>
            <div
                style={{
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    wordBreak: 'break-word',
                }}
            >
                {value}
            </div>
        </>
    );
}

interface ListItem {
    primary: string;
    secondary?: string;
    tertiary?: string;
}

function ListBlock({ items }: { items: ListItem[] }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {items.map((item, i) => (
                <div
                    key={i}
                    style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: 'var(--bg-tertiary)',
                        border: `1px solid ${BORDER}`,
                    }}
                >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.primary}</div>
                    {item.secondary && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.secondary}</div>
                    )}
                    {item.tertiary && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.4 }}>
                            {item.tertiary}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function PillRow({ items }: { items: string[] }) {
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {items.map((item, i) => (
                <span
                    key={i}
                    style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#A78BFA',
                        background: 'rgba(167,139,250,0.10)',
                        border: '1px solid rgba(167,139,250,0.25)',
                    }}
                >
                    {item}
                </span>
            ))}
        </div>
    );
}
