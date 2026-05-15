'use client';

/**
 * UnfinishedPostBanner — Dashboard surface for the employer's
 * in-progress job draft (if any).
 *
 * Why: with the 2026-05-14 auto-save cutover, drafts live in the
 * employer's account instead of an email link. The dashboard is now
 * the canonical "where do I pick up where I left off?" surface —
 * matching LinkedIn / Indeed UX.
 *
 * Behavior:
 *   - On mount, fetches /api/job-draft (returns null if no draft).
 *   - Renders nothing when there's no draft (default state for most visits).
 *   - When a draft exists, shows a single-row banner: title preview,
 *     timestamp, [Resume] (links to /post-job), [Discard] (DELETE +
 *     hide banner).
 *   - Confirms before discard so the employer doesn't lose work
 *     accidentally.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileEdit, Trash2, ChevronRight, Loader2 } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface DraftSnapshot {
  id: string;
  formData: Record<string, unknown>;
  savedAt: string;
  expiresAt: string;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

export default function UnfinishedPostBanner() {
  const [draft, setDraft] = useState<DraftSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/job-draft', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.draft) setDraft(data.draft as DraftSnapshot);
      })
      .catch(() => {
        // Silent — banner is a nicety, not core dashboard data.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || !draft) return null;

  const titlePreview =
    typeof draft.formData?.title === 'string' && draft.formData.title.trim().length > 0
      ? (draft.formData.title as string)
      : 'Untitled job post';

  const performDiscard = async () => {
    setConfirmingDiscard(false);
    setDiscarding(true);
    try {
      const res = await fetch('/api/job-draft', { method: 'DELETE' });
      if (res.ok) setDraft(null);
    } catch {
      // Surface nothing on failure — the banner stays so the user can retry.
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <>
    <div
      role="region"
      aria-label="Unfinished job post"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '16px 20px',
        marginBottom: 16,
        borderRadius: 16,
        background: 'linear-gradient(180deg, #ECFDF5 0%, #FFFFFF 100%)',
        border: '1px solid rgba(13,148,136,0.18)',
        boxShadow: '4px 4px 12px rgba(0,0,0,0.04), inset 1px 1px 2px rgba(255,255,255,0.7)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
        <span
          aria-hidden
          style={{
            width: 36, height: 36, borderRadius: 10,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: '#A7F3D0', color: '#0F766E', flexShrink: 0,
          }}
        >
          <FileEdit size={18} />
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1A2E35', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Continue your unfinished post: {titlePreview}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#475569' }}>
            Auto-saved {formatRelativeTime(draft.savedAt)}
          </p>
        </div>
      </div>

      <div style={{ display: 'inline-flex', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setConfirmingDiscard(true)}
          disabled={discarding}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            border: '1px solid rgba(0,0,0,0.06)', background: '#FFFFFF', color: '#7F1D1D',
            cursor: discarding ? 'wait' : 'pointer',
          }}
        >
          {discarding ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Discard
        </button>
        <Link
          href="/post-job"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#FFFFFF',
            background: 'linear-gradient(145deg, #0D9488, #10B981)',
            boxShadow: '3px 3px 8px rgba(13,148,136,0.2)',
            textDecoration: 'none',
          }}
        >
          Resume
          <ChevronRight size={14} />
        </Link>
      </div>
    </div>
    {confirmingDiscard && (
      <ConfirmDialog
        title="Discard your unfinished post?"
        description={`"${titlePreview}" will be permanently removed. This cannot be undone.`}
        confirmLabel="Discard"
        variant="danger"
        onConfirm={performDiscard}
        onCancel={() => setConfirmingDiscard(false)}
      />
    )}
    </>
  );
}
