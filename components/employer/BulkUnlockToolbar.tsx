'use client';

/**
 * BulkUnlockToolbar — Phase 4 #5.
 *
 * Renders above the candidate grid on the talent pool / candidates pages.
 * Lets the employer pick a subset of currently-locked candidates and
 * unlock them in one request (POST /api/employer/profiles/unlock-bulk).
 *
 * State model:
 *   - `lockedCandidateIds` is the set of locked-and-visible ids the
 *     parent passes in. The toolbar tracks its own selected subset.
 *   - Selecting more than the remaining-credit cap is prevented at
 *     the "Select all" handler; an explicit cap message replaces a
 *     silent truncation so the employer always knows what's happening.
 *   - On submit, the toolbar shows a confirm modal with the exact
 *     spend, fires the request, and surfaces partial-success counts.
 *
 * Coordination with the candidate list:
 *   - The parent supplies `onUnlocked(ids)` so the list can flip
 *     those rows' unlocked state without a refetch round-trip.
 *   - On any failure path, the parent can call `selectedIds.clear()`
 *     by re-rendering with `lockedCandidateIds` updated.
 */
import { useMemo, useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface BulkUnlockToolbarProps {
  /** IDs of candidates currently visible AND still locked. */
  lockedCandidateIds: string[];
  /** Remaining unlock credits the employer has (used cap on "Select all"). */
  remainingCredits: number | null;
  /** The posting the user has selected in the UI. Sent to the server so
   *  the unlocks are debited from THIS posting's quota — keeps the
   *  on-screen "N/M unlocks" counter consistent with what's spent. */
  postingId?: string | null;
  /** Called after a successful unlock so the parent can update UI in place. */
  onUnlocked?: (candidateIds: string[]) => void;
}

interface UnlockResult {
  unlocked: { candidateId: string }[];
  failed: { candidateId: string; reason: string; message: string }[];
  allowanceRemaining: number | null;
}

const barStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '12px',
  padding: '14px 18px',
  marginBottom: '14px',
  borderRadius: '14px',
  background: '#FFFFFF',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '3px 3px 10px rgba(0,0,0,0.04), inset 1px 1px 2px rgba(255,255,255,0.6)',
};

const pillBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  borderRadius: '12px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid rgba(0,0,0,0.06)',
  transition: 'all 0.15s',
};

export default function BulkUnlockToolbar({
  lockedCandidateIds,
  remainingCredits,
  postingId,
  onUnlocked,
}: BulkUnlockToolbarProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [confirmingUnlock, setConfirmingUnlock] = useState(false);
  const [lastResult, setLastResult] = useState<UnlockResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cap the "Select all" action by the remaining-credit count so the
  // employer never has more rows selected than they can actually pay for.
  const selectableCap = useMemo(() => {
    if (remainingCredits === null) return lockedCandidateIds.length;
    return Math.min(lockedCandidateIds.length, remainingCredits);
  }, [lockedCandidateIds.length, remainingCredits]);

  const selectAll = () => {
    setSelected(new Set(lockedCandidateIds.slice(0, selectableCap)));
  };
  const clearSelection = () => setSelected(new Set());
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (remainingCredits === null || next.size < remainingCredits) next.add(id);
      return next;
    });
  };

  // Exposed so parent rows can call into the toolbar via a custom event
  // if we want to keep individual-checkbox UI on each card.
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__bulkUnlockToggle = toggle;
  }

  const handleUnlock = async () => {
    if (selected.size === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/employer/profiles/unlock-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateIds: Array.from(selected),
          ...(postingId ? { postingId } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || 'Bulk unlock failed.');
        return;
      }
      const result = (await res.json()) as UnlockResult;
      setLastResult(result);
      if (result.unlocked.length > 0 && onUnlocked) {
        onUnlocked(result.unlocked.map((u) => u.candidateId));
      }
      setSelected(new Set());
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (lockedCandidateIds.length === 0 && !lastResult) return null;

  return (
    <>
    <div style={barStyle}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <Lock size={16} style={{ color: '#0D9488' }} />
        <span style={{ fontWeight: 700, color: '#1A2E35' }}>
          {selected.size} selected
        </span>
        <span style={{ color: '#8A9BA6', fontSize: '13px' }}>
          {lockedCandidateIds.length} locked
          {remainingCredits !== null ? ` · ${remainingCredits} credits` : ''}
        </span>
      </div>

      <button
        type="button"
        onClick={selectAll}
        disabled={selectableCap === 0 || submitting}
        style={{
          ...pillBtn,
          background: '#F5F6F8',
          color: '#1A2E35',
          opacity: selectableCap === 0 ? 0.5 : 1,
        }}
      >
        Select all {selectableCap > 0 ? `(${selectableCap})` : ''}
      </button>

      {selected.size > 0 && (
        <button
          type="button"
          onClick={clearSelection}
          style={{ ...pillBtn, background: '#F5F6F8', color: '#475569' }}
        >
          Clear
        </button>
      )}

      <button
        type="button"
        disabled={selected.size === 0 || submitting}
        onClick={() => setConfirmingUnlock(true)}
        style={{
          ...pillBtn,
          background: selected.size === 0 || submitting ? '#E5E7EB' : 'linear-gradient(145deg, #0D9488, #10B981)',
          color: selected.size === 0 || submitting ? '#6B7280' : '#fff',
          cursor: selected.size === 0 || submitting ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
        {submitting ? 'Unlocking…' : `Unlock ${selected.size}`}
      </button>

      {remainingCredits !== null && remainingCredits === 0 && (
        <span style={{ fontSize: '12px', color: '#B45309' }}>
          0 credits left —{' '}
          <a href="/pricing" style={{ color: '#0D9488', textDecoration: 'underline' }}>
            buy more
          </a>
        </span>
      )}

      {error && <span style={{ fontSize: '12px', color: '#EF4444' }}>{error}</span>}

      {lastResult && (
        <span style={{ fontSize: '12px', color: '#0F766E' }}>
          ✓ {lastResult.unlocked.length} unlocked
          {lastResult.failed.length > 0 ? `, ${lastResult.failed.length} failed` : ''}
        </span>
      )}
    </div>
    {confirmingUnlock && (
      <ConfirmDialog
        title={`Unlock ${selected.size} profile${selected.size === 1 ? '' : 's'}?`}
        description={`This will use ${selected.size} of your ${remainingCredits === null ? '' : `${remainingCredits} `}credits. Already-unlocked profiles won't be charged again.`}
        confirmLabel={`Unlock ${selected.size}`}
        variant="default"
        onConfirm={() => {
          setConfirmingUnlock(false);
          handleUnlock();
        }}
        onCancel={() => setConfirmingUnlock(false)}
      />
    )}
    </>
  );
}
