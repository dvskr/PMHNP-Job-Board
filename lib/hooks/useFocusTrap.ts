'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

interface UseFocusTrapOptions {
    /** Whether the modal/dialog is currently open. Trap is only active when true. */
    isOpen: boolean;
    /** Optional callback fired when the user presses Escape. */
    onEscape?: () => void;
}

/**
 * Wires a dialog to common a11y expectations:
 *   - Moves focus to the first focusable element inside the dialog on open
 *   - Cycles Tab / Shift+Tab inside the dialog
 *   - Restores focus to the previously-focused element on close
 *   - Optionally calls `onEscape` when the user hits ESC
 *
 * Attach the returned ref to the dialog's outermost container. The hook itself
 * does not render anything, so callers still own role / aria-modal / labelling.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>({ isOpen, onEscape }: UseFocusTrapOptions) {
    const containerRef = useRef<T | null>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const container = containerRef.current;
        if (!container) return;

        previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

        const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        const initial = focusables[0] ?? container;
        // Defer to next tick so portal children mount before we focus.
        const id = window.setTimeout(() => {
            try { initial.focus(); } catch {
                // ignore: element may have unmounted between schedule and focus
            }
        }, 0);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onEscape) {
                e.stopPropagation();
                onEscape();
                return;
            }
            if (e.key !== 'Tab') return;

            const current = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
            if (current.length === 0) {
                e.preventDefault();
                return;
            }
            const first = current[0];
            const last = current[current.length - 1];
            const active = document.activeElement as HTMLElement | null;

            if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            window.clearTimeout(id);
            document.removeEventListener('keydown', handleKeyDown);
            const previously = previouslyFocusedRef.current;
            if (previously && typeof previously.focus === 'function') {
                try { previously.focus(); } catch {
                    // restoring focus is best-effort; ignore
                }
            }
        };
    }, [isOpen, onEscape]);

    return containerRef;
}
