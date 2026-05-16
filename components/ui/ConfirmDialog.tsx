'use client';

/**
 * ConfirmDialog — shared centered confirm modal.
 *
 * Replaces native `window.confirm()` everywhere in the app. Browser
 * native confirms render with OS chrome ("localhost says…"), can't be
 * styled, and look out of place next to the rest of our modals.
 *
 * Usage:
 *
 *   const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
 *
 *   function tryDelete(id: string) {
 *     setConfirm({
 *       title: 'Delete this item?',
 *       description: 'This cannot be undone.',
 *       confirmLabel: 'Delete',
 *       variant: 'danger',
 *       onConfirm: () => { setConfirm(null); doDelete(id); },
 *     });
 *   }
 *
 *   // and in render:
 *   {confirm && (
 *     <ConfirmDialog
 *       {...confirm}
 *       onCancel={() => setConfirm(null)}
 *     />
 *   )}
 *
 * Two visual variants:
 *   - default → teal confirm button (replace, switch, continue)
 *   - danger  → red confirm button   (delete, discard, reset)
 *
 * Accessibility:
 *   - role="dialog" aria-modal="true" so screen readers announce it
 *   - Escape key cancels (matches OS convention)
 *   - Backdrop click cancels (matches OS convention)
 *   - Confirm button gets autoFocus so Enter activates it
 *   - Cancel renders on the left, confirm on the right (Mac/Win order)
 */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface ConfirmConfig {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
}

export interface ConfirmDialogProps extends ConfirmConfig {
  onCancel: () => void;
}

// Inline styles keep the component drop-in usable with no global CSS
// dependency. Sized to match the other panel/dialog modals across the
// app (AI dialog, save dialog, template picker).
const sx = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(15,23,42,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  } satisfies React.CSSProperties,
  card: {
    background: '#FFFFFF',
    borderRadius: '20px',
    padding: '24px',
    maxWidth: '460px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
  } satisfies React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  } satisfies React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#1A2E35',
    margin: 0,
    fontFamily: 'var(--font-lora), Georgia, serif',
  } satisfies React.CSSProperties,
  description: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 1.5,
    margin: '10px 0 22px',
  } satisfies React.CSSProperties,
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: 'none',
    background: '#F1F5F9',
    color: '#475569',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  } satisfies React.CSSProperties,
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
  } satisfies React.CSSProperties,
  cancelBtn: {
    padding: '10px 18px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#475569',
    cursor: 'pointer',
    background: '#F5F6F8',
    border: '1px solid rgba(0,0,0,0.06)',
  } satisfies React.CSSProperties,
  confirmDefault: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#FFFFFF',
    cursor: 'pointer',
    background: 'linear-gradient(145deg, #0D9488, #10B981)',
    border: '1px solid rgba(13,148,136,0.4)',
    boxShadow: '3px 3px 10px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.2)',
    transition: 'all 0.15s ease',
  } satisfies React.CSSProperties,
  confirmDanger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#FFFFFF',
    cursor: 'pointer',
    background: 'linear-gradient(145deg, #DC2626, #B91C1C)',
    border: '1px solid rgba(185,28,28,0.45)',
    boxShadow: '3px 3px 10px rgba(220,38,38,0.25), inset 1px 1px 2px rgba(255,255,255,0.2)',
    transition: 'all 0.15s ease',
  } satisfies React.CSSProperties,
};

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Stable ref for the latest onCancel so the Escape handler doesn't
  // need to re-bind on every parent render.
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelRef.current();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const confirmStyle = variant === 'danger' ? sx.confirmDanger : sx.confirmDefault;

  return (
    <div style={sx.backdrop} onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div style={sx.card} onClick={(e) => e.stopPropagation()}>
        <div style={sx.header}>
          <h3 id="confirm-dialog-title" style={sx.title}>{title}</h3>
          <button type="button" style={sx.closeBtn} onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {description && <p style={sx.description}>{description}</p>}
        <div style={sx.actions}>
          <button type="button" style={sx.cancelBtn} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" style={confirmStyle} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
