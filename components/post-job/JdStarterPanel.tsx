'use client';

/**
 * JdStarterPanel — Enterprise-quality empty-state + AI assistant surface
 * for the post-job description editor.
 *
 * Renders three distinct UI states based on context:
 *
 *   1. Empty-state hero (visible-text < 50 chars):
 *      Three large cards — Template / AI Draft / Blank canvas.
 *      Disappears once the editor has real content.
 *
 *   2. Active toolbar (visible-text >= 50 chars):
 *      Compact pill bar above the editor with quick actions:
 *      "Regenerate", "Make shorter", "Make longer", "Change tone",
 *      "Undo". Shown ONLY after the user accepted an AI draft, so
 *      hand-written descriptions stay free of unsolicited AI prompts.
 *
 *   3. Modal layers (overlay):
 *      Template picker (3 cards with previews) and AI dialog
 *      (tone + length + must-haves form) — invoked from either
 *      the empty-state hero or the active toolbar.
 *
 * Architecture decisions:
 *   - State lives here, NOT in the parent post-job page. The parent
 *     only owns the `description` string. This panel owns:
 *       • prevDraft (for one-step undo)
 *       • lastAiMeta (so the toolbar can show "8,432 chars · 32s")
 *       • all modal open/close state
 *       • all in-flight request state
 *   - All AI calls go through the same /api/employer/ai-jd endpoint
 *     with different `mode` values, so the server is the single
 *     authority on guardrails and the client stays dumb.
 *   - All modals trap focus + close on Escape + close on backdrop click.
 *   - Confirm-on-replace dialogs use window.confirm — minimal but
 *     adequate for an internal recruiter tool. Can upgrade to a styled
 *     dialog later without changing the panel's public API.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Sparkles, FileText, PenSquare, X, Loader2, RotateCcw, Check, Wand2, AlertTriangle, Bookmark, Trash2, Pencil } from 'lucide-react';
import { JD_TEMPLATES, renderTemplate, TEMPLATE_CATEGORY_LABELS, type JdTemplate, type JdTemplateId, type JdTemplateCategory } from '@/lib/jd-templates';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

// ─── Custom (employer-saved) templates ─────────────────────────────
//
// Loaded from /api/employer/jd-templates on mount. Treated as a parallel
// list rather than mixing into JD_TEMPLATES so:
//   - The built-in skeletons stay immutable in code
//   - Delete operations target custom templates only
//   - The "My Templates" category filter is trivially derivable
//
// A CustomTemplate maps to a JdTemplate at render time via a thin
// adapter — the picker grid renders both kinds with the same card.

interface CustomTemplate {
  id: string;
  label: string;
  summary: string | null;
  body: string;
}

function customAsTemplate(c: CustomTemplate): JdTemplate {
  return {
    id: `custom:${c.id}` as unknown as JdTemplateId,
    category: 'specialty', // Slot under specialty for grouping in "All" view; the filter chip handles it separately
    label: c.label,
    summary: c.summary ?? 'Saved template',
    setting: '',
    population: '',
    body: c.body,
  };
}

// ─── AI generation rate limit (per employer per day) ──────────────
//
// Server-enforced. The cap (currently 5/day for jd_generator) is
// stored in lib/ai-usage.ts and counted from rows in ai_call_log
// since midnight Central Time. This mirrors the talent_search_rerank
// pattern so all AI features share one architecture:
//
//   client mounts → GET /api/employer/ai-jd/usage → { used, cap, remaining, resetAtIso }
//   client POST   → 429 if over, else fresh usage in the success payload
//
// No localStorage — the DB is the single source of truth. The client
// only caches what the server reports so the badge can update
// instantly after a successful call without a separate round-trip.

interface AiUsage {
  used: number;
  cap: number;
  remaining: number;
  resetAtIso: string;
}

// ─── Types ────────────────────────────────────────────────────────

type Tone = 'professional' | 'conversational' | 'warm';
type Length = 'concise' | 'standard' | 'detailed';
type Mode = 'generate' | 'shorten' | 'lengthen' | 'retone';

interface AiMeta {
  chars: number;
  latencyMs: number;
  mode: Mode;
  tone: Tone;
  length: Length;
}

export interface JdStarterPanelProps {
  description: string;
  onChange: (next: string) => void;
  formContext: {
    role: string;
    setting: string;
    employer: string;
    location: string;
    benefits: string[];
  };
}

// ─── Constants & styles ───────────────────────────────────────────

const VISIBLE_THRESHOLD = 50; // characters below which the empty-state hero shows

const TONE_LABELS: Record<Tone, string> = {
  professional: 'Professional',
  conversational: 'Conversational',
  warm: 'Warm',
};
const LENGTH_LABELS: Record<Length, string> = {
  concise: 'Concise (3-5k)',
  standard: 'Standard (5-7k)',
  detailed: 'Detailed (7-10k)',
};

function visibleLen(html: string): number {
  return html.replace(/<[^>]*>/g, '').trim().length;
}

// Inline styles only — keeps the panel drop-in usable without touching
// global stylesheets. All sizing is responsive via flex/grid wrap.
const sx = {
  hero: {
    background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)',
    border: '1px solid rgba(0,0,0,0.06)',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '14px',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.04), inset 1px 1px 2px rgba(255,255,255,0.7)',
  } satisfies React.CSSProperties,
  heroHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '18px',
  } satisfies React.CSSProperties,
  heroTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#1A2E35',
    margin: 0,
  } satisfies React.CSSProperties,
  heroSub: {
    fontSize: '12px',
    color: '#8A9BA6',
    margin: 0,
  } satisfies React.CSSProperties,
  pathGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
  } satisfies React.CSSProperties,
  pathCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: '8px',
    padding: '18px 16px',
    borderRadius: '14px',
    border: '1px solid rgba(0,0,0,0.06)',
    background: '#FFFFFF',
    boxShadow: '3px 3px 10px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.5)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    textAlign: 'left' as const,
    color: '#1A2E35',
    minHeight: '110px',
  } satisfies React.CSSProperties,
  pathIcon: {
    width: 36, height: 36, borderRadius: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: '#ECFDF5', color: '#0D9488',
  } satisfies React.CSSProperties,
  pathLabel: {
    fontSize: '14px', fontWeight: 700, margin: 0,
  } satisfies React.CSSProperties,
  pathDesc: {
    fontSize: '12px', color: '#475569', margin: 0, lineHeight: 1.4,
  } satisfies React.CSSProperties,
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    marginBottom: '12px',
    borderRadius: '12px',
    background: 'linear-gradient(180deg, #ECFDF5 0%, #F0FDF4 100%)',
    border: '1px solid rgba(13,148,136,0.18)',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.6)',
  } satisfies React.CSSProperties,
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '6px 12px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: 600,
    border: '1px solid rgba(0,0,0,0.06)',
    background: '#FFFFFF',
    color: '#0F766E',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  } satisfies React.CSSProperties,
  pillDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } satisfies React.CSSProperties,
  pillDanger: {
    color: '#92400E',
    background: '#FEF3C7',
  } satisfies React.CSSProperties,
  modalBackdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(15,23,42,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  } satisfies React.CSSProperties,
  modalCard: {
    background: '#FFFFFF',
    borderRadius: '20px',
    padding: '24px',
    maxWidth: '760px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
  } satisfies React.CSSProperties,
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '18px',
  } satisfies React.CSSProperties,
  modalTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#1A2E35',
    margin: 0,
    fontFamily: 'var(--font-lora), Georgia, serif',
  } satisfies React.CSSProperties,
  closeBtn: {
    width: 32, height: 32, borderRadius: 8, border: 'none',
    background: '#F1F5F9', color: '#475569', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  } satisfies React.CSSProperties,
  fieldLabel: {
    display: 'block', fontSize: '12px', fontWeight: 700,
    color: '#1A2E35', textTransform: 'uppercase' as const,
    letterSpacing: '0.05em', marginBottom: '8px',
  } satisfies React.CSSProperties,
  pillGroup: {
    display: 'inline-flex', flexWrap: 'wrap' as const, gap: '6px',
  } satisfies React.CSSProperties,
  toggleBtn: {
    padding: '8px 14px', borderRadius: '10px', fontSize: '13px',
    fontWeight: 600, border: '1px solid rgba(0,0,0,0.08)',
    background: '#F5F6F8', color: '#475569', cursor: 'pointer',
    transition: 'all 0.15s ease',
  } satisfies React.CSSProperties,
  toggleBtnActive: {
    background: 'linear-gradient(145deg, #0D9488, #10B981)',
    color: '#FFFFFF',
    border: '1px solid rgba(13,148,136,0.4)',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.2)',
  } satisfies React.CSSProperties,
  primaryBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    padding: '10px 20px', borderRadius: '12px', fontSize: '14px',
    fontWeight: 700, color: '#FFFFFF', cursor: 'pointer',
    background: 'linear-gradient(145deg, #0D9488, #10B981)',
    border: '1px solid rgba(13,148,136,0.4)',
    boxShadow: '3px 3px 10px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.2)',
    transition: 'all 0.15s ease',
  } satisfies React.CSSProperties,
  secondaryBtn: {
    padding: '10px 18px', borderRadius: '12px', fontSize: '13px',
    fontWeight: 600, color: '#475569', cursor: 'pointer',
    background: '#F5F6F8', border: '1px solid rgba(0,0,0,0.06)',
  } satisfies React.CSSProperties,
};

// ─── Component ────────────────────────────────────────────────────

export default function JdStarterPanel({ description, onChange, formContext }: JdStarterPanelProps) {
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiDialogMode, setAiDialogMode] = useState<Mode>('generate');
  const [prevDraft, setPrevDraft] = useState<string | null>(null);
  const [lastAiMeta, setLastAiMeta] = useState<AiMeta | null>(null);
  const [busy, setBusy] = useState<null | Mode>(null);
  // Error includes the top-level message AND any guardrail details from
  // the API, so the dialog can show "Output was too short" / "Word X was
  // 5% of total" etc. instead of a generic failure.
  const [error, setError] = useState<{ message: string; details?: string[] } | null>(null);
  // Server-sourced usage. Fetched on mount, refreshed on every
  // generation response. Null while loading so we render placeholder
  // copy instead of an incorrect "5 of 5 available".
  const [usage, setUsage] = useState<AiUsage | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/employer/ai-jd/usage', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.usage) return;
        setUsage(data.usage);
      })
      .catch(() => {
        // Non-fatal — the POST will return 429 if the cap is reached.
        // We just don't render the badge optimistically.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const aiLimitReached = usage !== null && usage.remaining === 0;

  // Per-employer saved templates. Hydrated on mount; refreshed after
  // save / delete / rename so the picker always reflects DB state.
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [customCap, setCustomCap] = useState<number>(20);
  const refreshCustomTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/employer/jd-templates', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.items)) setCustomTemplates(data.items);
      if (typeof data?.cap === 'number') setCustomCap(data.cap);
    } catch {
      // Non-fatal — picker just shows built-ins until next try.
    }
  }, []);
  useEffect(() => {
    refreshCustomTemplates();
  }, [refreshCustomTemplates]);

  // Save-template dialog state. Two modes: 'create' (save current draft
  // as a new template) and 'rename' (edit label/summary of an existing
  // saved template). Single dialog component handles both to keep the
  // UX consistent.
  const [saveDialog, setSaveDialog] = useState<
    | { mode: 'closed' }
    | { mode: 'create' }
    | { mode: 'rename'; id: string; label: string; summary: string | null }
  >({ mode: 'closed' });

  // Generic confirm dialog state. Replaces native window.confirm so
  // every destructive action ("Delete this template", "Replace your
  // current description") gets a properly styled centered modal
  // instead of the OS-rendered "localhost says…" popup.
  const [confirmDialog, setConfirmDialog] = useState<
    | null
    | {
        title: string;
        description?: string;
        confirmLabel: string;
        variant: 'default' | 'danger';
        onConfirm: () => void;
      }
  >(null);

  // The empty-state hero is shown when the editor is effectively empty.
  // The content toolbar replaces it once there's substantive content —
  // regardless of how that content got there (AI / template / typed).
  // Without this, users who picked a built-in template had no visible
  // way to save it to their library or browse other templates.
  const showHero = visibleLen(description) < VISIBLE_THRESHOLD;
  const showToolbar = !showHero;

  // ─── AI call (handles every mode) ──────────────────────────────
  async function callAi(payload: {
    mode: Mode;
    tone: Tone;
    length: Length;
    mustHaves: string[];
    factsSummary?: string;
  }) {
    setError(null);
    setBusy(payload.mode);

    if (payload.mode !== 'generate' && visibleLen(description) < 50) {
      setError({ message: 'Need at least a partial draft before refining.' });
      setBusy(null);
      return;
    }

    const role = formContext.role?.trim();
    if (!role || role.length < 5) {
      setError({ message: 'Add a job title above before generating.' });
      setBusy(null);
      return;
    }

    // Client-side cap pre-check is purely a UX optimization — if the
    // badge is already at 0 we skip the round-trip and surface the
    // exact same message the server would return. The server is still
    // authoritative; users who bypass the client by hand-crafting a
    // POST will hit the 429 in /api/employer/ai-jd.
    if (usage && usage.remaining === 0) {
      setError({
        message: `Daily AI limit reached (${usage.cap} per day).`,
        details: [
          'You can keep editing the current draft manually.',
          `Your quota resets at midnight Central Time.`,
        ],
      });
      setBusy(null);
      return;
    }

    const ctxParts: string[] = [];
    if (formContext.employer) ctxParts.push(`Employer name: ${formContext.employer}.`);
    if (formContext.location) ctxParts.push(`Location: ${formContext.location}.`);
    if (formContext.benefits.length > 0) ctxParts.push(`Benefits to include: ${formContext.benefits.join(', ')}.`);
    // Employer-supplied facts summary — the grounding layer. This is what
    // turns a generic AI draft into one that talks about the actual job
    // (patient mix, EHR, schedule specifics, sign-on amount, etc.).
    if (payload.factsSummary && payload.factsSummary.trim().length > 0) {
      ctxParts.push(`Specific facts from the employer (use these verbatim where relevant — do not contradict, do not invent additional specifics): ${payload.factsSummary.trim()}`);
    }

    try {
      const res = await fetch('/api/employer/ai-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          setting: formContext.setting || 'Outpatient',
          context: ctxParts.join(' '),
          mode: payload.mode,
          tone: payload.tone,
          length: payload.length,
          mustHaves: payload.mustHaves,
          currentDraft: payload.mode !== 'generate' ? description : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // 429 returns usage + a friendly message. Surface both so the
        // badge updates and the user sees the reset-at hint.
        if (res.status === 429 && body?.usage) {
          setUsage(body.usage as AiUsage);
          setError({
            message: body?.message || body?.error || 'Daily AI limit reached.',
            details: ['Your quota resets at midnight Central Time.'],
          });
        } else {
          setError({
            message: body?.error || 'AI request failed.',
            details: Array.isArray(body?.details) ? body.details : undefined,
          });
        }
        return;
      }
      const body = await res.json();
      if (!body?.description) {
        setError({ message: 'AI returned an empty draft. Try again.' });
        return;
      }
      // Stash the current value so the toolbar Undo can revert to it.
      // Only stash when we actually have content to undo to.
      if (description) setPrevDraft(description);
      onChange(body.description);
      const visibleChars = visibleLen(body.description);
      setLastAiMeta({
        chars: visibleChars,
        latencyMs: body.meta?.latencyMs ?? 0,
        mode: payload.mode,
        tone: payload.tone,
        length: payload.length,
      });
      // Server-authoritative usage update — the POST response includes
      // the post-increment snapshot from a fresh DB count. No local
      // arithmetic, no drift risk between tabs.
      if (body.usage) setUsage(body.usage as AiUsage);
      setAiDialogOpen(false);
    } catch {
      setError({ message: 'Network error — please try again.' });
    } finally {
      setBusy(null);
    }
  }

  // ─── Template loader ────────────────────────────────────────────
  function applyTemplate(id: string) {
    // Custom templates carry a "custom:" prefix on their id. Strip and
    // look up in the saved list; built-ins use the bare JdTemplateId.
    let tmpl: JdTemplate | undefined;
    if (id.startsWith('custom:')) {
      const realId = id.slice('custom:'.length);
      const custom = customTemplates.find((c) => c.id === realId);
      if (custom) tmpl = customAsTemplate(custom);
    } else {
      tmpl = JD_TEMPLATES.find((t) => t.id === id);
    }
    if (!tmpl) return;

    const doApply = () => {
      if (description) setPrevDraft(description);
      const rendered = renderTemplate(tmpl!, {
        employer: formContext.employer || '',
        city: '',
        state: formContext.location || '',
      });
      onChange(rendered);
      setLastAiMeta(null); // Template insert is NOT an AI action — don't show the AI toolbar.
      setTemplatePickerOpen(false);
    };

    // When the editor has substantive content, confirm before replacing
    // via the styled dialog (matches the rest of the app's modal UX —
    // no more native "localhost says…" popups).
    if (description && visibleLen(description) > 50) {
      setConfirmDialog({
        title: 'Replace your current description?',
        description: 'Loading this template will overwrite what you have in the editor. You can undo this from the toolbar.',
        confirmLabel: 'Replace',
        variant: 'default',
        onConfirm: () => {
          setConfirmDialog(null);
          doApply();
        },
      });
      return;
    }

    doApply();
  }

  function openSaveAsTemplate() {
    if (visibleLen(description) < 50) {
      setError({ message: 'Add more content before saving as a template (need at least 50 visible characters).' });
      return;
    }
    if (customTemplates.length >= customCap) {
      setError({
        message: `Template limit reached (${customCap}).`,
        details: ['Delete one in "My Templates" before saving another.'],
      });
      return;
    }
    setError(null);
    setSaveDialog({ mode: 'create' });
  }

  function openRenameTemplate(t: CustomTemplate) {
    setError(null);
    setSaveDialog({ mode: 'rename', id: t.id, label: t.label, summary: t.summary });
  }

  async function submitSaveTemplate(payload: { label: string; summary: string }) {
    // create + rename share this handler. Mode determines URL + method.
    const current = saveDialog;
    if (current.mode === 'closed') return;
    try {
      let res: Response;
      if (current.mode === 'create') {
        res = await fetch('/api/employer/jd-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: payload.label,
            summary: payload.summary,
            body: description,
          }),
        });
      } else {
        res = await fetch(`/api/employer/jd-templates/${current.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: payload.label, summary: payload.summary }),
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError({ message: body?.message || body?.error || 'Save failed.' });
        return;
      }
      await refreshCustomTemplates();
      setSaveDialog({ mode: 'closed' });
    } catch {
      setError({ message: 'Network error.' });
    }
  }

  function deleteCustomTemplate(id: string) {
    setConfirmDialog({
      title: 'Delete this saved template?',
      description: 'This cannot be undone. Built-in skeleton templates aren’t affected.',
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/employer/jd-templates/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setError({ message: body?.error || 'Failed to delete template.' });
            return;
          }
          await refreshCustomTemplates();
        } catch {
          setError({ message: 'Network error deleting template.' });
        }
      },
    });
  }

  // ─── Undo ───────────────────────────────────────────────────────
  function undo() {
    if (!prevDraft) return;
    const restored = prevDraft;
    setPrevDraft(null); // single-level undo
    setLastAiMeta(null);
    onChange(restored);
  }

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div>
      {showHero && (
        <EmptyStateHero
          usage={usage}
          aiLimitReached={aiLimitReached}
          onTemplate={() => setTemplatePickerOpen(true)}
          onAi={() => {
            if (aiLimitReached) return;
            setAiDialogMode('generate');
            setAiDialogOpen(true);
          }}
          onBlank={() => {
            // Just hide the hero — user types directly. We mark the hero
            // dismissed by giving the editor a single invisible space so
            // visibleLen crosses the threshold without showing anything.
            onChange('<p>&nbsp;</p>');
          }}
        />
      )}

      {showToolbar && (
        <PostGenToolbar
          chars={visibleLen(description)}
          tone={lastAiMeta?.tone ?? null}
          usage={usage}
          aiLimitReached={aiLimitReached}
          canUndo={prevDraft !== null}
          customTemplatesAtCap={customTemplates.length >= customCap}
          onRegenerate={() => {
            if (aiLimitReached) return;
            setAiDialogMode('generate');
            setAiDialogOpen(true);
          }}
          onUndo={undo}
          onSaveAsTemplate={openSaveAsTemplate}
          onBrowseTemplates={() => setTemplatePickerOpen(true)}
        />
      )}

      {/* Inline error shows ONLY when the dialog is closed — when it's
          open, the same error renders inside the dialog so the user
          doesn't have to close it to read what went wrong. */}
      {error && !aiDialogOpen && (
        <ErrorBlock error={error} onDismiss={() => setError(null)} />
      )}

      {templatePickerOpen && (
        <TemplatePicker
          customTemplates={customTemplates}
          customCap={customCap}
          // Disable the "Save current draft" CTA when there's nothing
          // worth saving. Picker remains usable for browsing built-ins.
          canSaveCurrent={visibleLen(description) >= 50}
          onClose={() => setTemplatePickerOpen(false)}
          onPick={applyTemplate}
          onSaveCurrent={openSaveAsTemplate}
          onRenameCustom={openRenameTemplate}
          onDeleteCustom={deleteCustomTemplate}
        />
      )}

      {saveDialog.mode !== 'closed' && (
        <SaveTemplateDialog
          mode={saveDialog.mode}
          initialLabel={saveDialog.mode === 'rename' ? saveDialog.label : (formContext.role?.trim() || '')}
          initialSummary={
            saveDialog.mode === 'rename'
              ? saveDialog.summary ?? ''
              : (formContext.setting ? `${formContext.setting} role` : '')
          }
          onClose={() => setSaveDialog({ mode: 'closed' })}
          onSubmit={submitSaveTemplate}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          description={confirmDialog.description}
          confirmLabel={confirmDialog.confirmLabel}
          variant={confirmDialog.variant}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {aiDialogOpen && (
        <AiDialog
          initialMode={aiDialogMode}
          initialTone={lastAiMeta?.tone}
          initialLength={lastAiMeta?.length}
          usage={usage}
          aiLimitReached={aiLimitReached}
          busy={busy !== null}
          error={error}
          onClose={() => {
            setError(null);
            setAiDialogOpen(false);
          }}
          onSubmit={(p) => callAi(p)}
        />
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────

function EmptyStateHero({
  usage,
  aiLimitReached,
  onTemplate,
  onAi,
  onBlank,
}: {
  usage: AiUsage | null;
  aiLimitReached: boolean;
  onTemplate: () => void;
  onAi: () => void;
  onBlank: () => void;
}) {
  const aiDesc = aiLimitReached
    ? 'Daily AI limit reached — browse a skeleton or write manually. Resets at midnight CT.'
    : 'Fresh long-form draft in ~30 seconds from your form inputs and a short facts summary.';

  return (
    <div style={sx.hero}>
      <div style={{ ...sx.heroHeader, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wand2 size={18} style={{ color: '#0D9488' }} />
          <div>
            <h3 style={sx.heroTitle}>How would you like to start your job description?</h3>
            <p style={sx.heroSub}>AI is the recommended path. You can switch any time.</p>
          </div>
        </div>
        <UsageBadge usage={usage} />
      </div>
      {/* AI promoted to primary CTA; "Write from scratch" stays as the
          fallback. Templates are demoted to a secondary text link below
          to discourage paste-and-go duplicate-content patterns. */}
      <div style={{ ...sx.pathGrid, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <PathCard
          icon={<Sparkles size={20} />}
          label="Generate with AI"
          desc={aiDesc}
          onClick={onAi}
          disabled={aiLimitReached}
          highlight={!aiLimitReached}
        />
        <PathCard
          icon={<PenSquare size={20} />}
          label="Write from scratch"
          desc="Open the editor and start typing. You can switch later."
          onClick={onBlank}
        />
      </div>
      <div style={{ marginTop: 14, textAlign: 'center' }}>
        <button
          type="button"
          onClick={onTemplate}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#0D9488', fontSize: 12, fontWeight: 600,
            textDecoration: 'underline', padding: '4px 8px',
          }}
        >
          <FileText size={12} />
          Or browse {JD_TEMPLATES.length} PMHNP skeleton starters
        </button>
      </div>
    </div>
  );
}

function PathCard({
  icon, label, desc, onClick, highlight = false, disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  onClick: () => void;
  highlight?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sx.pathCard,
        ...(highlight
          ? {
              borderColor: 'rgba(13,148,136,0.35)',
              background: 'linear-gradient(180deg, #ECFDF5 0%, #FFFFFF 70%)',
            }
          : {}),
        ...(disabled ? { opacity: 0.55, cursor: 'not-allowed' } : {}),
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '5px 5px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.9)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '3px 3px 10px rgba(0,0,0,0.04), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.5)';
      }}
    >
      <span style={sx.pathIcon}>{icon}</span>
      <h4 style={sx.pathLabel}>{label}</h4>
      <p style={sx.pathDesc}>{desc}</p>
    </button>
  );
}

function PostGenToolbar({
  chars, tone, usage, aiLimitReached, canUndo, customTemplatesAtCap,
  onRegenerate, onUndo, onSaveAsTemplate, onBrowseTemplates,
}: {
  chars: number;
  /** Set when the current draft came from AI; null otherwise. */
  tone: Tone | null;
  usage: AiUsage | null;
  aiLimitReached: boolean;
  canUndo: boolean;
  customTemplatesAtCap: boolean;
  onRegenerate: () => void;
  onUndo: () => void;
  onSaveAsTemplate: () => void;
  onBrowseTemplates: () => void;
}) {
  const hasAi = tone !== null;
  return (
    <div style={sx.toolbar}>
      {/* Status line: AI-specific when the current draft was AI-generated,
          generic char count when it was templated / typed. Either way the
          rest of the toolbar surfaces the same template + library actions. */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#0F766E' }}>
        {hasAi ? (
          <>
            <Sparkles size={14} />
            AI draft · {chars.toLocaleString()} chars · {TONE_LABELS[tone]}
          </>
        ) : (
          <>
            <FileText size={14} />
            {chars.toLocaleString()} chars in editor
          </>
        )}
      </span>

      {/* AI-only actions */}
      {hasAi && (
        <button
          type="button"
          style={{ ...sx.pill, ...(aiLimitReached ? sx.pillDisabled : {}) }}
          disabled={aiLimitReached}
          onClick={onRegenerate}
        >
          <RotateCcw size={12} />
          Regenerate
        </button>
      )}

      {/* Always-available actions */}
      <button
        type="button"
        style={{ ...sx.pill, ...(customTemplatesAtCap ? sx.pillDisabled : {}) }}
        disabled={customTemplatesAtCap}
        onClick={onSaveAsTemplate}
        title={customTemplatesAtCap ? 'Template library is full — delete one to save another' : 'Save this draft to your reusable template library'}
      >
        <Bookmark size={12} />
        Save to my templates
      </button>
      <button type="button" style={sx.pill} onClick={onBrowseTemplates}>
        <FileText size={12} />
        Browse templates
      </button>

      {canUndo && (
        <button type="button" style={{ ...sx.pill, ...sx.pillDanger }} onClick={onUndo}>
          <RotateCcw size={12} />
          Undo to previous
        </button>
      )}

      <span style={{ marginLeft: 'auto' }}>
        <UsageBadge usage={usage} emphasis="compact" />
      </span>
      {aiLimitReached && hasAi && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#92400E', fontWeight: 600 }}>
          <AlertTriangle size={12} />
          Resets at midnight CT
        </span>
      )}
    </div>
  );
}

// 'mine' is a synthetic filter that only surfaces employer-saved
// templates; the built-in categories come from TEMPLATE_CATEGORY_LABELS.
type PickerFilter = JdTemplateCategory | 'all' | 'mine';

function TemplatePicker({
  customTemplates,
  customCap,
  canSaveCurrent,
  onClose,
  onPick,
  onSaveCurrent,
  onRenameCustom,
  onDeleteCustom,
}: {
  customTemplates: CustomTemplate[];
  customCap: number;
  canSaveCurrent: boolean;
  onClose: () => void;
  onPick: (id: string) => void;
  onSaveCurrent: () => void;
  onRenameCustom: (t: CustomTemplate) => void;
  onDeleteCustom: (id: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<PickerFilter>('all');
  useEscClose(onClose);

  const categories = (Object.keys(TEMPLATE_CATEGORY_LABELS) as JdTemplateCategory[]);
  const customCount = customTemplates.length;
  const builtInTotal = JD_TEMPLATES.length;
  const totalCount = builtInTotal + customCount;

  // Filtered set of built-ins. Custom templates are surfaced separately
  // because they have a different render path (with delete button).
  const filteredBuiltIns: JdTemplate[] = activeFilter === 'all'
    ? [...JD_TEMPLATES]
    : activeFilter === 'mine'
      ? []
      : JD_TEMPLATES.filter((t) => t.category === activeFilter);

  const showCustomSection = activeFilter === 'all' || activeFilter === 'mine';

  // Group built-ins by category for the "All" view; collapse to a flat
  // list when filtered to a single category.
  const grouped: { category: JdTemplateCategory; items: JdTemplate[] }[] = categories
    .map((cat) => ({ category: cat, items: filteredBuiltIns.filter((t) => t.category === cat) }))
    .filter((g) => g.items.length > 0);

  const filterBtn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
    border: '1px solid rgba(0,0,0,0.06)', background: '#F5F6F8', color: '#475569',
    cursor: 'pointer', transition: 'all 0.15s',
  };
  const filterBtnActive: React.CSSProperties = {
    ...filterBtn,
    background: 'linear-gradient(145deg, #0D9488, #10B981)',
    color: '#FFFFFF',
    border: '1px solid rgba(13,148,136,0.4)',
  };

  return (
    <div style={sx.modalBackdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div style={{ ...sx.modalCard, maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
        <div style={sx.modalHeader}>
          <div>
            <h3 style={sx.modalTitle}>Browse PMHNP skeleton starters</h3>
            <p style={{ ...sx.heroSub, marginTop: 4 }}>
              {builtInTotal} built-in bullet skeletons plus your saved templates. [bracketed] prompts are where you fill in real specifics.
            </p>
          </div>
          <button type="button" style={sx.closeBtn} onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {/* Filter chips. "My Templates" appears in the row whenever the
            employer has saved at least one — keeps the chip count clean
            for first-time users. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          <button
            type="button"
            style={activeFilter === 'all' ? filterBtnActive : filterBtn}
            onClick={() => setActiveFilter('all')}
          >
            All ({totalCount})
          </button>
          {customCount > 0 && (
            <button
              type="button"
              style={activeFilter === 'mine' ? filterBtnActive : filterBtn}
              onClick={() => setActiveFilter('mine')}
            >
              <Bookmark size={11} style={{ marginRight: 4, display: 'inline', verticalAlign: '-1px' }} />
              My Templates ({customCount})
            </button>
          )}
          {categories.map((cat) => {
            const count = JD_TEMPLATES.filter((t) => t.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                style={activeFilter === cat ? filterBtnActive : filterBtn}
                onClick={() => setActiveFilter(cat)}
              >
                {TEMPLATE_CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>

        {/* Employer-saved templates section. Always exposes a "Save
            current draft" CTA at the top so users have a clear canonical
            place to trigger saves — not just the post-gen toolbar. */}
        {showCustomSection && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Bookmark size={12} />
                My Templates ({customCount}/{customCap})
              </h4>
              <button
                type="button"
                disabled={!canSaveCurrent || customCount >= customCap}
                onClick={onSaveCurrent}
                title={
                  !canSaveCurrent
                    ? 'Add more content in the editor before you can save it as a template'
                    : customCount >= customCap
                      ? 'Template library is full — delete one first'
                      : 'Save the current editor draft as a reusable template'
                }
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                  border: '1px solid rgba(13,148,136,0.3)',
                  background: !canSaveCurrent || customCount >= customCap ? '#F1F5F9' : 'linear-gradient(145deg, #0D9488, #10B981)',
                  color: !canSaveCurrent || customCount >= customCap ? '#94A3B8' : '#FFFFFF',
                  cursor: !canSaveCurrent || customCount >= customCap ? 'not-allowed' : 'pointer',
                }}
              >
                <Bookmark size={12} />
                Save current draft to my templates
              </button>
            </div>

            {customCount === 0 ? (
              <div style={{
                padding: '14px 16px', borderRadius: 12, border: '1px dashed rgba(0,0,0,0.12)',
                background: '#FAFAFA', fontSize: 12, color: '#64748B', textAlign: 'center',
              }}>
                {canSaveCurrent ? (
                  <>You haven't saved any templates yet. Click <strong>Save current draft to my templates</strong> above to reuse your current JD across postings.</>
                ) : (
                  <>Once you have a JD draft (50+ characters), click <strong>Save current draft to my templates</strong> above to keep a reusable copy.</>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {customTemplates.map((c) => (
                  <CustomTemplateCard
                    key={c.id}
                    template={c}
                    onPick={() => onPick(`custom:${c.id}`)}
                    onRename={() => onRenameCustom(c)}
                    onDelete={() => onDeleteCustom(c.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Built-in grouped cards */}
        {grouped.map((group) => (
          <div key={group.category} style={{ marginBottom: 18 }}>
            {activeFilter === 'all' && (
              <h4 style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>
                {TEMPLATE_CATEGORY_LABELS[group.category]}
              </h4>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {group.items.map((t) => (
                <TemplateCard key={t.id} template={t} onPick={() => onPick(t.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomTemplateCard({
  template,
  onPick,
  onRename,
  onDelete,
}: {
  template: CustomTemplate;
  onPick: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const iconBtn = (hoverColor: string, hoverBg: string): React.CSSProperties => ({
    width: 24, height: 24, borderRadius: 6, border: 'none',
    background: '#F5F6F8', color: '#94A3B8', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
    // hoverColor/hoverBg consumed by onMouseEnter handlers below
  });
  void iconBtn;

  return (
    <div
      style={{
        ...sx.pathCard,
        alignItems: 'stretch',
        minHeight: 'auto',
        padding: '14px 14px',
        cursor: 'default',
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'inline-flex', gap: 4 }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRename(); }}
          aria-label="Rename template"
          title="Rename"
          style={{
            width: 24, height: 24, borderRadius: 6, border: 'none',
            background: '#F5F6F8', color: '#94A3B8', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#0D9488'; e.currentTarget.style.background = '#ECFDF5'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = '#F5F6F8'; }}
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="Delete template"
          title="Delete"
          style={{
            width: 24, height: 24, borderRadius: 6, border: 'none',
            background: '#F5F6F8', color: '#94A3B8', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.background = '#FEF2F2'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = '#F5F6F8'; }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <button
        type="button"
        onClick={onPick}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'stretch',
          background: 'transparent', border: 'none', padding: 0,
          textAlign: 'left' as const, cursor: 'pointer', color: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, paddingRight: 56 }}>
          <span style={{ ...sx.pathIcon, width: 28, height: 28, background: '#FEF3C7', color: '#92400E' }}>
            <Bookmark size={14} />
          </span>
          <h4 style={{ ...sx.pathLabel, fontSize: 13 }}>{template.label}</h4>
        </div>
        <p style={{ ...sx.pathDesc, fontSize: 11, marginTop: 2 }}>
          {template.summary || 'Saved template'}
        </p>
      </button>
    </div>
  );
}

function TemplateCard({ template, onPick }: { template: JdTemplate; onPick: () => void }) {
  // Pull the first 4 H2/H3 section titles so the card hints at what's
  // inside without dumping the full skeleton. Mirrors the prior
  // approach but tighter since 12 cards now fit in the modal.
  const sections = (template.body.match(/<h[23]>([^<]+)<\/h[23]>/g) ?? [])
    .map((h) => h.replace(/<[^>]+>/g, ''))
    .filter((s) => !s.startsWith('About '))
    .slice(0, 4);

  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        ...sx.pathCard,
        alignItems: 'stretch',
        minHeight: 'auto',
        padding: '14px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span style={{ ...sx.pathIcon, width: 28, height: 28 }}>
          <FileText size={16} />
        </span>
        <h4 style={{ ...sx.pathLabel, fontSize: 13 }}>{template.label}</h4>
      </div>
      <p style={{ ...sx.pathDesc, fontSize: 11, marginTop: 2 }}>{template.summary}</p>
      <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', fontSize: 10, color: '#64748B' }}>
        {sections.map((s, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
            <Check size={9} style={{ color: '#10B981' }} /> {s}
          </li>
        ))}
      </ul>
    </button>
  );
}

// Minimum facts-summary length (visible chars) required before we'll
// call the AI. Below this the model has nothing to ground on and the
// output collapses to a generic template — the entire point of this
// dialog is to AVOID that. Tuned by feel; 60 chars is roughly two
// short bullet-style facts ("65 visits/week, Athena EHR, $15k sign-on").
const FACTS_SUMMARY_MIN = 60;

const FACTS_SUMMARY_PLACEHOLDER = `• Patient mix: adults + adolescents, mood/anxiety/ADHD, ~65 visits/week
• Schedule: M-Th in-clinic, F telehealth; no weekends; 1 admin half-day
• EHR: Athena with templated notes
• Comp: $145-165k base + quarterly outcomes bonus; $15k sign-on
• Team: 4 PMHNPs, 2 psychiatrists, 6 therapists, dedicated MA support
• What's unique: low panel cap (250), real admin team handles auth/PA`;

// Visual usage badge — shows current AI generation count vs daily cap
// with a small horizontal fill bar. Used in the hero card, AI dialog,
// and post-gen toolbar so the employer always sees how many they have
// left. Renders nothing while usage is still loading so the badge
// doesn't flicker an incorrect optimistic value.
function UsageBadge({
  usage,
  emphasis = 'normal',
}: {
  usage: AiUsage | null;
  emphasis?: 'normal' | 'compact';
}) {
  if (!usage) return null;
  const { used, cap, remaining } = usage;
  const exhausted = remaining === 0;
  const nearing = !exhausted && remaining <= 1;
  const trackColor = exhausted ? '#FECACA' : nearing ? '#FDE68A' : '#A7F3D0';
  const fillColor = exhausted ? '#DC2626' : nearing ? '#D97706' : '#0D9488';
  const textColor = exhausted ? '#991B1B' : nearing ? '#92400E' : '#0F766E';
  const fillPct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;

  const isCompact = emphasis === 'compact';
  const barWidth = isCompact ? 60 : 90;
  const barHeight = isCompact ? 5 : 6;
  const fontSize = isCompact ? 11 : 12;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize,
        fontWeight: 700,
        color: textColor,
        whiteSpace: 'nowrap',
      }}
      title={exhausted ? `Resets at midnight CT (${new Date(usage.resetAtIso).toLocaleString()})` : `${remaining} AI generation${remaining === 1 ? '' : 's'} remaining today`}
    >
      <Sparkles size={isCompact ? 11 : 13} />
      <span>{used} / {cap} used today</span>
      <span
        aria-hidden
        style={{
          width: barWidth,
          height: barHeight,
          borderRadius: 999,
          background: trackColor,
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: 'block',
            width: `${fillPct}%`,
            height: '100%',
            background: fillColor,
            transition: 'width 0.25s ease',
          }}
        />
      </span>
    </span>
  );
}

// Inline error block. Shows the top-level message verbatim. Renders a
// bullet list only when the server returned a `details[]` array (which
// happens for guardrail rejections — those have specific, actionable
// items the employer can act on). For everything else (network,
// validation, auth) we keep it terse — extra "adjust your inputs"
// guidance is just noise when the failure isn't an output-quality issue.
function ErrorBlock({
  error,
  onDismiss,
}: {
  error: { message: string; details?: string[] };
  onDismiss?: () => void;
}) {
  const hasDetails = !!error.details && error.details.length > 0;
  return (
    <div
      style={{
        marginBottom: '12px',
        padding: '12px 14px',
        borderRadius: 10,
        background: '#FEF2F2',
        border: '1px solid #FCA5A5',
        color: '#991B1B',
        fontSize: 13,
        position: 'relative',
      }}
      role="alert"
    >
      <div style={{ fontWeight: 700, marginBottom: hasDetails ? 6 : 0, paddingRight: onDismiss ? 24 : 0 }}>
        {error.message}
      </div>
      {hasDetails && (
        <>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, fontWeight: 500, lineHeight: 1.5 }}>
            {error.details!.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
          <div style={{ marginTop: 6, fontSize: 11, color: '#7F1D1D' }}>
            Adjust your inputs and try again.
          </div>
        </>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 22, height: 22, borderRadius: 6, border: 'none',
            background: 'transparent', color: '#991B1B', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function AiDialog({
  initialMode,
  initialTone,
  initialLength,
  usage,
  aiLimitReached,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  initialMode: Mode;
  initialTone?: Tone;
  initialLength?: Length;
  usage: AiUsage | null;
  aiLimitReached: boolean;
  busy: boolean;
  error: { message: string; details?: string[] } | null;
  onClose: () => void;
  onSubmit: (p: { mode: Mode; tone: Tone; length: Length; mustHaves: string[]; factsSummary?: string }) => void;
}) {
  const [tone, setTone] = useState<Tone>(initialTone ?? 'professional');
  const [length, setLength] = useState<Length>(initialLength ?? 'standard');
  const [factsSummary, setFactsSummary] = useState('');
  const [mustHavesText, setMustHavesText] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const mustHaves = useMemo(
    () => mustHavesText
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8),
    [mustHavesText],
  );

  // Retone mode is a faithful rewrite of an existing draft — it doesn't
  // need new facts, just a different voice. So facts is only required
  // for `generate`. Refinement modes (shorten/lengthen) come from the
  // toolbar and skip this dialog entirely.
  const factsRequired = initialMode === 'generate';
  const factsValid = !factsRequired || factsSummary.trim().length >= FACTS_SUMMARY_MIN;
  const showFactsError = factsRequired && submitAttempted && !factsValid;

  useEscClose(onClose);

  const title = initialMode === 'retone' ? 'Rewrite in a different tone' : 'Generate job description with AI';

  const handleSubmit = () => {
    setSubmitAttempted(true);
    if (!factsValid) return;
    onSubmit({
      mode: initialMode,
      tone,
      length,
      mustHaves,
      factsSummary: factsSummary.trim() || undefined,
    });
  };

  return (
    <div style={sx.modalBackdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div style={sx.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={sx.modalHeader}>
          <div>
            <h3 style={sx.modalTitle}>{title}</h3>
            <p style={{ ...sx.heroSub, marginTop: '4px' }}>
              The more real facts you give, the less the AI has to invent. Tone and length tune the voice.
            </p>
          </div>
          <button type="button" style={sx.closeBtn} onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {error && <ErrorBlock error={error} />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {factsRequired && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={sx.fieldLabel}>
                  Facts summary <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <span style={{ fontSize: 11, color: factsSummary.length >= FACTS_SUMMARY_MIN ? '#0F766E' : '#94A3B8', fontWeight: 600 }}>
                  {factsSummary.length} chars {factsSummary.length < FACTS_SUMMARY_MIN ? `(${FACTS_SUMMARY_MIN - factsSummary.length} more for AI grounding)` : '· ready'}
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#64748B', marginBottom: '8px', lineHeight: 1.4 }}>
                Tell the AI what specifics you have so it doesn't invent them. Patient mix, schedule, EHR, comp range, team size, anything distinctive about your practice. Bullet points are fine.
              </p>
              <textarea
                value={factsSummary}
                onChange={(e) => setFactsSummary(e.target.value)}
                placeholder={FACTS_SUMMARY_PLACEHOLDER}
                rows={8}
                aria-invalid={showFactsError}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 13,
                  border: showFactsError ? '1.5px solid #EF4444' : '1px solid rgba(0,0,0,0.08)',
                  background: '#F5F6F8',
                  boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.04)',
                  fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5,
                }}
              />
              {showFactsError && (
                <p style={{ marginTop: 6, fontSize: 12, color: '#EF4444', fontWeight: 600 }}>
                  Add at least {FACTS_SUMMARY_MIN} characters of real facts before generating — the AI needs grounding so the draft talks about your actual job.
                </p>
              )}
            </div>
          )}

          <div>
            <label style={sx.fieldLabel}>Tone</label>
            <div style={sx.pillGroup}>
              {(['professional', 'conversational', 'warm'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  style={{ ...sx.toggleBtn, ...(tone === t ? sx.toggleBtnActive : {}) }}
                >
                  {TONE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {initialMode !== 'retone' && (
            <div>
              <label style={sx.fieldLabel}>Length</label>
              <div style={sx.pillGroup}>
                {(['concise', 'standard', 'detailed'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLength(l)}
                    style={{ ...sx.toggleBtn, ...(length === l ? sx.toggleBtnActive : {}) }}
                  >
                    {LENGTH_LABELS[l]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {initialMode !== 'retone' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={sx.fieldLabel}>
                  Must-haves <span style={{ color: '#94A3B8', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>
                  {mustHaves.length} of 8
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#64748B', marginBottom: '8px', lineHeight: 1.4 }}>
                Specific qualifications or preferences to surface in the Required/Preferred sections. One per line or comma-separated.
              </p>
              <textarea
                value={mustHavesText}
                onChange={(e) => setMustHavesText(e.target.value)}
                placeholder={'psych ICU background preferred\nSpanish fluency a plus\nopen to new grads with strong placements'}
                rows={4}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13,
                  border: '1px solid rgba(0,0,0,0.08)', background: '#F5F6F8',
                  boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.04)',
                  fontFamily: 'inherit', resize: 'vertical',
                }}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '24px', flexWrap: 'wrap' }}>
          <UsageBadge usage={usage} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" style={sx.secondaryBtn} onClick={onClose}>Cancel</button>
            <button
              type="button"
              style={{
                ...sx.primaryBtn,
                ...(busy || aiLimitReached || (factsRequired && !factsValid) ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
              }}
              disabled={busy || aiLimitReached || (factsRequired && !factsValid)}
              onClick={handleSubmit}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {busy ? 'Generating…' : (initialMode === 'retone' ? 'Rewrite' : 'Generate')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ConfirmDialog moved to components/ui/ConfirmDialog.tsx so the
// dashboard banner, bulk-unlock toolbar, and Clear-draft flow can
// share the same styled modal.

// ─── Save / Rename dialog ─────────────────────────────────────────
//
// One modal handles both creating a new saved template and renaming an
// existing one. Replaces the prior window.prompt() flow which was
// jarring (browser-native chrome, no validation, no summary field).
//
// Validation:
//   - Label: 2-120 chars, trimmed
//   - Summary: optional, max 300 chars
//   - Save disabled until label is valid

function SaveTemplateDialog({
  mode,
  initialLabel,
  initialSummary,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'rename';
  initialLabel: string;
  initialSummary: string;
  onClose: () => void;
  onSubmit: (payload: { label: string; summary: string }) => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [summary, setSummary] = useState(initialSummary);
  const [submitting, setSubmitting] = useState(false);
  useEscClose(onClose);

  const labelTrim = label.trim();
  const labelValid = labelTrim.length >= 2 && labelTrim.length <= 120;
  const summaryValid = summary.length <= 300;
  const canSubmit = labelValid && summaryValid && !submitting;

  const title = mode === 'rename' ? 'Rename saved template' : 'Save as template';
  const description =
    mode === 'rename'
      ? 'Change the name or summary for this saved template. The body stays the same.'
      : 'Save your current draft to your template library. You can reuse it across future job postings.';
  const submitLabel = mode === 'rename' ? 'Save changes' : 'Save template';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    await onSubmit({ label: labelTrim.slice(0, 120), summary: summary.trim().slice(0, 300) });
    setSubmitting(false);
  };

  return (
    <div style={sx.modalBackdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div style={{ ...sx.modalCard, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div style={sx.modalHeader}>
          <div>
            <h3 style={sx.modalTitle}>{title}</h3>
            <p style={{ ...sx.heroSub, marginTop: 4 }}>{description}</p>
          </div>
          <button type="button" style={sx.closeBtn} onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={sx.fieldLabel}>
              Name <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              type="text"
              value={label}
              maxLength={120}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Outpatient PMHNP — North Austin clinic"
              autoFocus
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 14,
                border: '1px solid rgba(0,0,0,0.08)', background: '#F5F6F8',
                boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.04)',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ marginTop: 4, fontSize: 11, color: '#94A3B8' }}>
              {labelTrim.length}/120
              {!labelValid && labelTrim.length > 0 && (
                <span style={{ color: '#EF4444', fontWeight: 600, marginLeft: 8 }}>
                  Name must be at least 2 characters
                </span>
              )}
            </div>
          </div>

          <div>
            <label style={sx.fieldLabel}>
              Short summary <span style={{ color: '#94A3B8', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <input
              type="text"
              value={summary}
              maxLength={300}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. Adult outpatient med-management — Athena EHR — 250 panel cap"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13,
                border: '1px solid rgba(0,0,0,0.08)', background: '#F5F6F8',
                boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.04)',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ marginTop: 4, fontSize: 11, color: '#94A3B8' }}>
              {summary.length}/300 — helps you recognize this template later
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button type="button" style={sx.secondaryBtn} onClick={onClose}>Cancel</button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            style={{
              ...sx.primaryBtn,
              ...(!canSubmit ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Bookmark size={14} />}
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────

function useEscClose(onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
