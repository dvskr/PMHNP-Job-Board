'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Award,
  BadgeCheck,
  Briefcase,
  FileText,
  GraduationCap,
  Plus,
  Tags,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { updateDocument } from '@/components/resume-studio/studio-api';
import type {
  ResumeCertification,
  ResumeDocument,
  ResumeEducation,
  ResumeExperience,
  ResumeLicense,
  ResumeSections,
} from '@/components/resume-studio/studio-api';
import type { ResumeTemplateId } from '@/lib/resume-studio/templates';
import {
  studioColors,
  studioFontStack,
  studioMonoStack,
} from '@/lib/resume-studio/design';

const AUTOSAVE_DELAY_MS = 1200;
const AUTOSAVE_RETRY_MS = 4000;
const SUMMARY_MAX_CHARS = 2000;

/** Display face for section and card titles. Falls back to the site's Lora when
 *  IBM Plex Serif is not available, so the studio never lands on Times. */
const SERIF_STACK = "'IBM Plex Serif', var(--font-lora), Georgia, serif";

/** Static PMHNP vocabulary for the skill suggestion chips. No AI call: these are
 *  the terms the deterministic scorer looks for in the clinical scope dimension. */
const SKILL_SUGGESTIONS = [
  'Medication management',
  'Suicide risk assessment',
  'Telepsychiatry',
  'Group therapy',
  'Crisis intervention',
  'Care coordination',
  'Buprenorphine (MAT)',
  'Measurement-based care',
  'Patient education',
] as const;

const MAX_SUGGESTIONS = 4;

const EMPTY_EXPERIENCE: ResumeExperience = {
  jobTitle: '',
  employerName: '',
  location: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  bullets: [''],
};

const EMPTY_LICENSE: ResumeLicense = {
  licenseType: '',
  licenseState: '',
  licenseNumber: '',
  expiration: '',
};

const EMPTY_CERTIFICATION: ResumeCertification = {
  name: '',
  certifyingBody: '',
  expiration: '',
};

const EMPTY_EDUCATION: ResumeEducation = {
  degreeType: '',
  fieldOfStudy: '',
  schoolName: '',
  graduationYear: '',
};

/**
 * Scoped stylesheet for the editor pane. Inline styles cannot express :focus,
 * :hover, ::placeholder, media queries, or reduced motion, and the CareResume
 * input treatment (teal border plus a soft ring) is a focus state. Every color
 * is interpolated from design.ts, so the palette still lives in one place, and
 * every color-mix declaration is preceded by a plain token fallback.
 */
const EDITOR_CSS = `
.rse-root{font-family:${studioFontStack};color:${studioColors.text}}
.rse-card{background:${studioColors.surface};border:1px solid ${studioColors.borderStrong};border-radius:14px;padding:18px 20px}
.rse-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
.rse-head-left{display:flex;align-items:center;gap:9px;min-width:0}
.rse-head-right{display:flex;align-items:center;gap:10px;flex-shrink:0}
.rse-tile{width:26px;height:26px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.rse-title{font-family:${SERIF_STACK};font-size:16px;font-weight:600;color:${studioColors.text};margin:0;letter-spacing:-.1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rse-meta{font-family:${studioMonoStack};font-size:11.5px;color:${studioColors.textFaint};white-space:nowrap}
.rse-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.rse-label{font-size:10.5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:${studioColors.textBody}}
.rse-input{width:100%;min-width:0;font-family:inherit;font-size:13.5px;line-height:1.35;color:${studioColors.text};background:${studioColors.surfaceAlt};border:1px solid ${studioColors.border};border-radius:9px;padding:9px 11px;transition:border-color .12s,box-shadow .12s}
.rse-input::placeholder{color:${studioColors.textFaint}}
.rse-input:hover:not(:disabled){border-color:${studioColors.border};border-color:color-mix(in srgb,${studioColors.border} 62%,${studioColors.textFaint})}
.rse-input:focus{outline:none;border-color:${studioColors.accent};box-shadow:0 0 0 3px ${studioColors.accentWash};box-shadow:0 0 0 3px color-mix(in srgb,${studioColors.accent} 12%,transparent)}
.rse-root .rse-input:focus-visible{outline:none}
.rse-input:disabled{background:${studioColors.well};color:${studioColors.textFaint};cursor:not-allowed}
textarea.rse-input{resize:vertical}
.rse-entry{background:${studioColors.surface};border:1px solid ${studioColors.borderSoft};border-radius:12px;padding:14px}
.rse-entry-row{padding:13px}
.rse-btn{font-family:inherit;cursor:pointer;transition:background-color .12s,color .12s,opacity .12s}
.rse-btn:focus-visible{outline:2px solid ${studioColors.accent};outline-offset:2px}
.rse-btn:disabled{cursor:not-allowed}
.rse-add{display:inline-flex;align-items:center;gap:5px;background:${studioColors.surface};color:${studioColors.accent};border:1px solid ${studioColors.accentWash};border:1px solid color-mix(in srgb,${studioColors.accent} 22%,${studioColors.surface});border-radius:8px;padding:5px 12px;font-size:12.5px;font-weight:600}
.rse-add:hover{background:${studioColors.accentWash}}
.rse-add:active{transform:translateY(1px)}
.rse-icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid ${studioColors.borderSoft};background:${studioColors.surface};border-radius:7px;color:${studioColors.textSoft}}
.rse-icon:hover:not(:disabled){background:${studioColors.surfaceAlt}}
.rse-icon:active:not(:disabled){transform:translateY(1px)}
.rse-icon:disabled{opacity:.35}
.rse-icon-danger{color:${studioColors.danger}}
.rse-icon-danger:hover:not(:disabled){background:${studioColors.well}}
.rse-icon-tall{height:38px;width:34px}
.rse-outline{display:inline-flex;align-items:center;justify-content:center;border:1px solid ${studioColors.accent};color:${studioColors.accent};background:${studioColors.surface};border-radius:9px;padding:0 18px;font-size:13.5px;font-weight:600}
.rse-outline:hover{background:${studioColors.accentWash}}.rse-outline:active,.rse-chip-x:active{transform:translateY(1px)}
.rse-check{width:15px;height:15px;accent-color:${studioColors.accent};cursor:pointer}
.rse-check:focus-visible{outline:2px solid ${studioColors.accent};outline-offset:2px}
.rse-chip{display:inline-flex;align-items:center;gap:7px;background:${studioColors.accentWash};background:color-mix(in srgb,${studioColors.accentWash} 62%,${studioColors.surface});border:1px solid ${studioColors.accentWash};border:1px solid color-mix(in srgb,${studioColors.accent} 18%,${studioColors.surface});color:${studioColors.accentDark};border-radius:8px;padding:5px 10px;font-size:13px;font-weight:500;max-width:100%}
.rse-chip-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rse-chip-x{display:inline-flex;align-items:center;justify-content:center;border:none;background:none;color:${studioColors.accentDark};padding:0;line-height:1;flex-shrink:0}
.rse-chip-x:hover{color:${studioColors.danger}}
.rse-suggest{display:inline-flex;align-items:center;gap:4px;border:1px dashed ${studioColors.border};border-color:color-mix(in srgb,${studioColors.border} 70%,${studioColors.textFaint});background:${studioColors.surfaceAlt};color:${studioColors.textBody};border-radius:7px;padding:3px 9px;font-size:12px}
.rse-suggest:hover{border-style:solid;background:${studioColors.surface}}
.rse-bullet-dot{width:6px;height:6px;border-radius:50%;background:${studioColors.accent};margin-top:15px;flex-shrink:0}
.rse-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.rse-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.rse-grid2-tight{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.rse-grid-dates{display:grid;grid-template-columns:1fr 1fr;gap:8px;min-width:0}
.rse-grid-lic{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}
.rse-grid-cert{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end}
.rse-span2{grid-column:1 / 3}
.rse-stack{display:flex;flex-direction:column;gap:11px}
.rse-stack-roles{display:flex;flex-direction:column;gap:14px}
.rse-empty{margin:0;background:${studioColors.well};border-radius:10px;padding:11px 12px;font-size:12.5px;line-height:1.45;color:${studioColors.textMuted}}
@keyframes rsPulse{0%,100%{opacity:1}50%{opacity:.5}}
.rse-pulse{animation:rsPulse 2s infinite}
@media (max-width:767px){
.rse-card{padding:14px}
.rse-grid2,.rse-grid2-tight,.rse-grid-dates,.rse-grid-lic,.rse-grid-cert{grid-template-columns:1fr}
.rse-span2{grid-column:auto}
.rse-icon-tall{width:100%;height:34px;order:9}
}
@media (prefers-reduced-motion:reduce){
.rse-pulse{animation:none}
.rse-input,.rse-btn{transition:none}
.rse-add:active,.rse-icon:active{transform:none}
}
`;

/* Layout-only style objects. Colors come from the tokens above; anything that
   needs a state selector lives in EDITOR_CSS. */
const roleHeadStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '11px' };
const roleTitleStyle: CSSProperties = { margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px', fontWeight: 600, color: studioColors.textBody };
const iconClusterStyle: CSSProperties = { display: 'flex', gap: '4px', flexShrink: 0 };
const currentRoleStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '7px', marginTop: '10px', fontSize: '12.5px', color: studioColors.textBody, cursor: 'pointer' };
const bulletListStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '8px' };
const bulletRowStyle: CSSProperties = { display: 'flex', gap: '7px', alignItems: 'flex-start' };
const bulletInputStyle: CSSProperties = { minHeight: '38px', padding: '8px 10px', lineHeight: 1.4 };
const chipRowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' };
const skillRowStyle: CSSProperties = { display: 'flex', gap: '9px' };
const suggestRowStyle: CSSProperties = { marginTop: '10px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '5px', fontSize: '12px', color: studioColors.textFaint };

/** Drop bullets that are only whitespace before sending to the server. */
function normalizeForSave(sections: ResumeSections): ResumeSections {
  return {
    ...sections,
    experience: sections.experience.map((exp) => ({
      ...exp,
      bullets: exp.bullets.filter((b) => b.trim() !== ''),
    })),
  };
}

function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

// ─── Small building blocks ───────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  className?: string;
}

function Field({ label, value, onChange, placeholder, type = 'text', disabled, className }: FieldProps) {
  return (
    <label className={className ? `rse-field ${className}` : 'rse-field'}>
      <span className="rse-label">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className="rse-input" />
    </label>
  );
}

interface SectionCardProps {
  icon: ReactNode;
  title: string;
  /** Completeness affordance: a filled icon tile plus a mono count. */
  filled: boolean;
  meta?: string;
  metaTone?: 'default' | 'danger';
  action?: ReactNode;
  children: ReactNode;
}

function SectionCard({ icon, title, filled, meta, metaTone = 'default', action, children }: SectionCardProps) {
  return (
    <section className="rse-card" aria-label={title}>
      <div className="rse-head">
        <div className="rse-head-left">
          <span
            className="rse-tile"
            aria-hidden="true"
            style={{
              background: filled ? studioColors.accentWash : studioColors.well,
              color: filled ? studioColors.accent : studioColors.textFaint,
            }}
          >
            {icon}
          </span>
          <h3 className="rse-title">{title}</h3>
        </div>
        <div className="rse-head-right">
          {meta && <span className="rse-meta" style={metaTone === 'danger' ? { color: studioColors.danger } : undefined}>{meta}</span>}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

function AddButton({ label, onClick, style }: { label: string; onClick: () => void; style?: CSSProperties }) {
  return (
    <button type="button" onClick={onClick} className="rse-btn rse-add" style={style}>
      <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </button>
  );
}

function RemoveEntryButton({ label, onClick, tall }: { label: string; onClick: () => void; tall?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title="Remove" className={tall ? 'rse-btn rse-icon rse-icon-danger rse-icon-tall' : 'rse-btn rse-icon rse-icon-danger'}>
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

// ─── Main editor ─────────────────────────────────────────────────────────────

export type SaveState = 'idle' | 'saving' | 'saved' | 'retrying';

interface SectionEditorProps {
  doc: ResumeDocument;
  onSectionsChange: (sections: ResumeSections, docId: string) => void;
  /**
   * Kept for the shell's prop contract. The template picker now lives in the
   * rail's Design tab alongside font, density, and paper, so the form pane no
   * longer calls this. Declared with method syntax on purpose: the parameter
   * stays bivariant, so a handler typed against either template union is
   * assignable while the studio-api migration is in flight.
   */
  onTemplateChange?(template: ResumeTemplateId, docId: string): void;
  onSaved: (doc: ResumeDocument) => void;
  /**
   * Lifts the live save state to the shell, which renders the single save
   * indicator in the toolbar. Keeping a second one here duplicated the
   * header and cost a row of editing height.
   */
  onSaveStateChange?: (state: SaveState) => void;
}

export default function SectionEditor({ doc, onSectionsChange, onSaved, onSaveStateChange }: SectionEditorProps) {
  const sections = doc.sections;

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [skillDraft, setSkillDraft] = useState('');
  const [skillNote, setSkillNote] = useState<string | null>(null);

  const lastSavedRef = useRef<ResumeSections>(doc.sections);
  const saveSeqRef = useRef(0);
  const docIdRef = useRef(doc.id);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always hold the latest on-screen sections so a retry saves what the user has
  // typed by then, not a stale snapshot captured when the failed attempt ran.
  const latestSectionsRef = useRef<ResumeSections>(doc.sections);
  latestSectionsRef.current = doc.sections;

  // Focus management for the experience up/down reorder controls.
  const moveButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const pendingMoveFocusRef = useRef<string | null>(null);

  const clearRetry = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  // Belt and braces: the parent keys this component by doc.id, but if the id
  // ever changes in place, reset the autosave baseline instead of PATCHing
  // the old document's sections into the new one.
  useEffect(() => {
    if (docIdRef.current !== doc.id) {
      docIdRef.current = doc.id;
      lastSavedRef.current = doc.sections;
      saveSeqRef.current += 1;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setSaveState('idle');
    }
  }, [doc.id, doc.sections]);

  // Cancel any pending retry when this editor unmounts (for example, on doc switch).
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Send the current sections to the server. On failure we deliberately KEEP the
  // user's on-screen edits (typed content is never rolled back) and schedule a
  // retry; only a successful save advances lastSavedRef. Guarded by the save
  // sequence and by the document id captured at send time, so a late response can
  // never sync into a different, now-selected document.
  const runSave = () => {
    const snapshot = latestSectionsRef.current;
    if (snapshot === lastSavedRef.current) {
      setSaveState((prev) => (prev === 'saving' ? 'idle' : prev));
      return;
    }
    const seq = ++saveSeqRef.current;
    const savingDocId = docIdRef.current;
    setSaveState('saving');

    void updateDocument(savingDocId, { sections: normalizeForSave(snapshot) }).then((res) => {
      if (seq !== saveSeqRef.current) return; // superseded by a newer save
      if (savingDocId !== docIdRef.current) return; // a different document is selected now
      if (res.ok) {
        lastSavedRef.current = res.data.document.sections ?? snapshot;
        setSaveState('saved');
        onSaved(res.data.document);
      } else {
        // Keep the edits on screen. Surface a retrying status and try again shortly.
        setSaveState('retrying');
        clearRetry();
        retryTimerRef.current = setTimeout(runSave, AUTOSAVE_RETRY_MS);
      }
    });
  };

  // Debounced autosave: AUTOSAVE_DELAY_MS after the last change, PATCH sections.
  useEffect(() => {
    if (doc.sections === lastSavedRef.current) return;
    clearRetry();
    setSaveState('saving');
    const timer = setTimeout(runSave, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.sections, doc.id]);

  // After a reorder re-renders the list, move focus to the moved row's reorder
  // button in its new position. If that same-direction control is disabled at the
  // new end of the list, fall back to the opposite control on the same row.
  useEffect(() => {
    const key = pendingMoveFocusRef.current;
    if (!key) return;
    pendingMoveFocusRef.current = null;
    const btn = moveButtonRefs.current.get(key);
    if (btn && !btn.disabled) {
      btn.focus();
      return;
    }
    const [idx, dir] = key.split(':');
    moveButtonRefs.current.get(`${idx}:${dir === '1' ? '-1' : '1'}`)?.focus();
  }, [sections.experience]);

  // ── Immutable update helpers ───────────────────────────────────────────────

  const update = (partial: Partial<ResumeSections>) => {
    onSectionsChange({ ...sections, ...partial }, doc.id);
  };

  const updateContact = (field: keyof ResumeSections['contact'], value: string) => {
    update({ contact: { ...sections.contact, [field]: value } });
  };

  const updateExperience = (index: number, patch: Partial<ResumeExperience>) => {
    update({ experience: sections.experience.map((e, i) => (i === index ? { ...e, ...patch } : e)) });
  };

  const moveExperience = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.experience.length) return;
    const next = [...sections.experience];
    const moved = next[index];
    next[index] = next[target];
    next[target] = moved;
    // After the reorder, return keyboard focus to the same control on the row in
    // its new position so a screen-reader or keyboard user can keep moving it.
    pendingMoveFocusRef.current = `${target}:${direction}`;
    update({ experience: next });
  };

  const updateLicense = (index: number, patch: Partial<ResumeLicense>) => {
    update({ licenses: sections.licenses.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  };

  const updateCertification = (index: number, patch: Partial<ResumeCertification>) => {
    update({ certifications: sections.certifications.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  };

  const updateEducation = (index: number, patch: Partial<ResumeEducation>) => {
    update({ education: sections.education.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  };

  const removeExperience = (index: number) => {
    update({ experience: sections.experience.filter((_, i) => i !== index) });
  };

  const removeLicense = (index: number) => {
    update({ licenses: sections.licenses.filter((_, i) => i !== index) });
  };

  const removeCertification = (index: number) => {
    update({ certifications: sections.certifications.filter((_, i) => i !== index) });
  };

  const removeEducation = (index: number) => {
    update({ education: sections.education.filter((_, i) => i !== index) });
  };

  /** Case-insensitive dedupe. A duplicate keeps the typed text and says why. */
  const addSkill = () => {
    const value = skillDraft.trim();
    if (!value) {
      setSkillDraft('');
      setSkillNote(null);
      return;
    }
    if (sections.skills.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setSkillNote(`${value} is already on your list.`);
      return;
    }
    setSkillDraft('');
    setSkillNote(null);
    update({ skills: [...sections.skills, value] });
  };

  const addSuggestedSkill = (value: string) => {
    if (sections.skills.some((s) => s.toLowerCase() === value.toLowerCase())) return;
    setSkillNote(null);
    update({ skills: [...sections.skills, value] });
  };

  // ── Derived, for the section head completeness affordance ──────────────────

  const contactFilled = Object.values(sections.contact).filter((v) => v.trim() !== '').length;
  const contactTotal = Object.keys(sections.contact).length;
  const summaryLength = sections.summary.length;
  const suggestions = SKILL_SUGGESTIONS.filter(
    (s) => !sections.skills.some((existing) => existing.toLowerCase() === s.toLowerCase()),
  ).slice(0, MAX_SUGGESTIONS);

  // The shell renders the one save indicator; report every transition up.
  useEffect(() => {
    onSaveStateChange?.(saveState);
  }, [saveState, onSaveStateChange]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rse-root" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <style>{EDITOR_CSS}</style>

      {/* Contact */}
      <SectionCard icon={<User className="h-3.5 w-3.5" aria-hidden="true" />} title="Contact" filled={contactFilled > 0} meta={`${contactFilled}/${contactTotal}`}>
        <div className="rse-grid2">
          <Field label="Full name" value={sections.contact.fullName} onChange={(v) => updateContact('fullName', v)} placeholder="Jordan Rivera" />
          <Field label="Email" value={sections.contact.email} onChange={(v) => updateContact('email', v)} type="email" placeholder="you@example.com" />
          <Field label="Phone" value={sections.contact.phone} onChange={(v) => updateContact('phone', v)} type="tel" placeholder="(555) 555-5555" />
          <Field label="City" value={sections.contact.city} onChange={(v) => updateContact('city', v)} placeholder="Austin" />
          <Field label="State" value={sections.contact.state} onChange={(v) => updateContact('state', v)} placeholder="Texas" />
          <Field label="LinkedIn URL" value={sections.contact.linkedinUrl} onChange={(v) => updateContact('linkedinUrl', v)} placeholder="linkedin.com/in/yourname" className="rse-span2" />
        </div>
      </SectionCard>

      {/* Summary */}
      <SectionCard
        icon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Professional summary"
        filled={summaryLength > 0}
        meta={`${summaryLength}/${SUMMARY_MAX_CHARS}`}
        metaTone={summaryLength >= SUMMARY_MAX_CHARS ? 'danger' : 'default'}
      >
        <label className="rse-field">
          <span className="sr-only">Professional summary</span>
          <textarea
            value={sections.summary}
            onChange={(e) => update({ summary: e.target.value.slice(0, SUMMARY_MAX_CHARS) })}
            maxLength={SUMMARY_MAX_CHARS}
            placeholder="Two to four sentences on your specialty focus, populations served, and what you bring to a psychiatric care team."
            className="rse-input"
            style={{ minHeight: '96px', lineHeight: 1.5 }}
          />
        </label>
      </SectionCard>

      {/* Experience */}
      <SectionCard
        icon={<Briefcase className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Experience"
        filled={sections.experience.length > 0}
        meta={countLabel(sections.experience.length, 'role', 'roles')}
        action={<AddButton label="Add role" onClick={() => update({ experience: [...sections.experience, { ...EMPTY_EXPERIENCE, bullets: [''] }] })} />}
      >
        {sections.experience.length === 0 && <p className="rse-empty">No roles yet. Add your most recent position first.</p>}
        <div className="rse-stack-roles">
          {sections.experience.map((exp, i) => (
            <div key={i} className="rse-entry">
              <div style={roleHeadStyle}>
                <p style={roleTitleStyle}>
                  Role {i + 1}
                  {exp.jobTitle ? <span style={{ fontWeight: 500, color: studioColors.textFaint }}>, {exp.jobTitle}</span> : null}
                </p>
                <div style={iconClusterStyle}>
                  <button
                    type="button"
                    ref={(el) => {
                      moveButtonRefs.current.set(`${i}:-1`, el);
                    }}
                    onClick={() => moveExperience(i, -1)}
                    disabled={i === 0}
                    aria-disabled={i === 0}
                    aria-label={`Move ${exp.jobTitle || `role ${i + 1}`} up`}
                    className="rse-btn rse-icon"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    ref={(el) => {
                      moveButtonRefs.current.set(`${i}:1`, el);
                    }}
                    onClick={() => moveExperience(i, 1)}
                    disabled={i === sections.experience.length - 1}
                    aria-disabled={i === sections.experience.length - 1}
                    aria-label={`Move ${exp.jobTitle || `role ${i + 1}`} down`}
                    className="rse-btn rse-icon"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <RemoveEntryButton label={`Remove ${exp.jobTitle || `role ${i + 1}`}`} onClick={() => removeExperience(i)} />
                </div>
              </div>

              <div className="rse-grid2-tight">
                <Field label="Job title" value={exp.jobTitle} onChange={(v) => updateExperience(i, { jobTitle: v })} placeholder="PMHNP, Outpatient" />
                <Field label="Employer" value={exp.employerName} onChange={(v) => updateExperience(i, { employerName: v })} placeholder="Lakeside Behavioral Health" />
                <Field label="Location" value={exp.location} onChange={(v) => updateExperience(i, { location: v })} placeholder="Denver, CO or Remote" />
                <div className="rse-grid-dates">
                  <Field label="Start" value={exp.startDate} onChange={(v) => updateExperience(i, { startDate: v })} placeholder="Jan 2022" />
                  <Field
                    label="End"
                    value={exp.isCurrent ? '' : exp.endDate}
                    onChange={(v) => updateExperience(i, { endDate: v })}
                    disabled={exp.isCurrent}
                    placeholder={exp.isCurrent ? 'Present' : 'Jun 2024'}
                  />
                </div>
              </div>

              <label style={currentRoleStyle}>
                <input
                  type="checkbox"
                  checked={exp.isCurrent}
                  onChange={(e) => updateExperience(i, e.target.checked ? { isCurrent: true, endDate: '' } : { isCurrent: false })}
                  className="rse-check"
                />
                I currently work here
              </label>

              <div style={{ marginTop: '11px' }}>
                <span className="rse-label" style={{ display: 'block', marginBottom: '7px' }}>
                  Achievement bullets
                </span>
                <div style={bulletListStyle}>
                  {exp.bullets.map((bullet, bi) => (
                    <div key={bi} style={bulletRowStyle}>
                      <span className="rse-bullet-dot" aria-hidden="true" />
                      <textarea
                        value={bullet}
                        onChange={(e) => updateExperience(i, { bullets: exp.bullets.map((b, idx) => (idx === bi ? e.target.value : b)) })}
                        aria-label={`Bullet ${bi + 1} for ${exp.jobTitle || `role ${i + 1}`}`}
                        placeholder="Start with an action verb and include a number where you can."
                        className="rse-input"
                        style={bulletInputStyle}
                      />
                      <button
                        type="button"
                        onClick={() => updateExperience(i, { bullets: exp.bullets.filter((_, idx) => idx !== bi) })}
                        aria-label={`Remove bullet ${bi + 1} for ${exp.jobTitle || `role ${i + 1}`}`}
                        className="rse-btn rse-icon rse-icon-danger"
                        style={{ marginTop: '5px', flexShrink: 0 }}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                <AddButton label="Add bullet" onClick={() => updateExperience(i, { bullets: [...exp.bullets, ''] })} style={{ marginTop: '9px' }} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Licenses */}
      <SectionCard
        icon={<BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Licenses"
        filled={sections.licenses.length > 0}
        meta={countLabel(sections.licenses.length, 'license', 'licenses')}
        action={<AddButton label="Add license" onClick={() => update({ licenses: [...sections.licenses, { ...EMPTY_LICENSE }] })} />}
      >
        {sections.licenses.length === 0 && <p className="rse-empty">No licenses yet. Add your APRN or RN license.</p>}
        <div className="rse-stack">
          {sections.licenses.map((lic, i) => (
            <div key={i} className="rse-entry rse-entry-row rse-grid-lic">
              <Field label="Type" value={lic.licenseType} onChange={(v) => updateLicense(i, { licenseType: v })} placeholder="APRN" />
              <Field label="State" value={lic.licenseState} onChange={(v) => updateLicense(i, { licenseState: v })} placeholder="Texas" />
              <RemoveEntryButton label={`Remove ${lic.licenseType || `license ${i + 1}`}`} onClick={() => removeLicense(i)} tall />
              <Field label="Number" value={lic.licenseNumber} onChange={(v) => updateLicense(i, { licenseNumber: v })} placeholder="Optional" />
              <Field label="Expiration" value={lic.expiration} onChange={(v) => updateLicense(i, { expiration: v })} placeholder="Aug 2027" />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Certifications */}
      <SectionCard
        icon={<Award className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Certifications"
        filled={sections.certifications.length > 0}
        meta={countLabel(sections.certifications.length, 'certification', 'certifications')}
        action={<AddButton label="Add" onClick={() => update({ certifications: [...sections.certifications, { ...EMPTY_CERTIFICATION }] })} />}
      >
        {sections.certifications.length === 0 && <p className="rse-empty">No certifications yet. PMHNP-BC belongs here.</p>}
        <div className="rse-stack">
          {sections.certifications.map((cert, i) => (
            <div key={i} className="rse-entry rse-entry-row rse-grid-cert">
              <Field label="Name" value={cert.name} onChange={(v) => updateCertification(i, { name: v })} placeholder="PMHNP-BC" />
              <Field label="Body" value={cert.certifyingBody} onChange={(v) => updateCertification(i, { certifyingBody: v })} placeholder="ANCC" />
              <Field label="Expiration" value={cert.expiration} onChange={(v) => updateCertification(i, { expiration: v })} placeholder="Dec 2028" />
              <RemoveEntryButton label={`Remove ${cert.name || `certification ${i + 1}`}`} onClick={() => removeCertification(i)} tall />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Education */}
      <SectionCard
        icon={<GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Education"
        filled={sections.education.length > 0}
        meta={countLabel(sections.education.length, 'entry', 'entries')}
        action={<AddButton label="Add" onClick={() => update({ education: [...sections.education, { ...EMPTY_EDUCATION }] })} />}
      >
        {sections.education.length === 0 && <p className="rse-empty">No education entries yet.</p>}
        <div className="rse-stack">
          {sections.education.map((edu, i) => (
            <div key={i} className="rse-entry rse-entry-row rse-grid-lic">
              <Field label="Degree" value={edu.degreeType} onChange={(v) => updateEducation(i, { degreeType: v })} placeholder="MSN" />
              <Field label="Field" value={edu.fieldOfStudy} onChange={(v) => updateEducation(i, { fieldOfStudy: v })} placeholder="Psychiatric-Mental Health" />
              <RemoveEntryButton label={`Remove ${edu.degreeType || `education ${i + 1}`}`} onClick={() => removeEducation(i)} tall />
              <Field label="School" value={edu.schoolName} onChange={(v) => updateEducation(i, { schoolName: v })} placeholder="University of Texas" />
              <Field label="Grad year" value={edu.graduationYear} onChange={(v) => updateEducation(i, { graduationYear: v })} placeholder="2020" />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Skills */}
      <SectionCard icon={<Tags className="h-3.5 w-3.5" aria-hidden="true" />} title="Skills" filled={sections.skills.length > 0} meta={countLabel(sections.skills.length, 'skill', 'skills')}>
        {sections.skills.length > 0 ? (
          <div style={chipRowStyle}>
            {sections.skills.map((skill, index) => (
              <span key={`${skill}-${index}`} className="rse-chip">
                <span className="rse-chip-label">{skill}</span>
                <button
                  type="button"
                  onClick={() => update({ skills: sections.skills.filter((s) => s !== skill) })}
                  aria-label={`Remove skill ${skill}`}
                  className="rse-btn rse-chip-x"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="rse-empty" style={{ marginBottom: '12px' }}>
            No skills yet. Try medication management, telepsychiatry, or crisis intervention.
          </p>
        )}

        <div style={skillRowStyle}>
          <label className="rse-field" style={{ flex: 1 }}>
            <span className="sr-only">Add a skill</span>
            <input
              type="text"
              value={skillDraft}
              onChange={(e) => {
                setSkillDraft(e.target.value);
                if (skillNote) setSkillNote(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSkill();
                }
              }}
              placeholder="Type a skill and press Enter"
              aria-describedby={skillNote ? 'rse-skill-note' : undefined}
              className="rse-input"
            />
          </label>
          <button type="button" onClick={addSkill} className="rse-btn rse-outline" style={{ flexShrink: 0 }}>
            Add
          </button>
        </div>

        {skillNote && (
          <p id="rse-skill-note" role="status" style={{ margin: '6px 0 0', fontSize: '12px', color: studioColors.danger }}>
            {skillNote}
          </p>
        )}

        {suggestions.length > 0 && (
          <div style={suggestRowStyle}>
            <span>Suggestions:</span>
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => addSuggestedSkill(s)} aria-label={`Add skill ${s}`} className="rse-btn rse-suggest">
                <Plus className="h-3 w-3" aria-hidden="true" />
                {s}
              </button>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
