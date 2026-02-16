/**
 * Undo / Rollback functionality.
 * Takes a DOM snapshot of all form field values before autofill,
 * then restores them on undo.
 */
import { triggerReactChange } from './filler';
import { log, warn } from '@/shared/logger';

interface FieldSnapshot {
    element: HTMLElement;
    tagName: string;
    type: string;
    previousValue: string;
    previousChecked: boolean;
    previousSelectedIndex: number;
    selector: string;
}

let snapshots: FieldSnapshot[] = [];
let hasSnapshot = false;

/**
 * Take a snapshot of all form field values on the current page.
 * Call this before performing autofill.
 */
export function takeSnapshot(): void {
    snapshots = [];
    const fields = document.querySelectorAll('input, select, textarea, [contenteditable="true"]');

    for (const field of fields) {
        const el = field as HTMLElement;
        const input = el as HTMLInputElement;

        snapshots.push({
            element: el,
            tagName: el.tagName.toLowerCase(),
            type: input.type || '',
            previousValue: input.value || el.textContent || '',
            previousChecked: input.checked || false,
            previousSelectedIndex: (el as HTMLSelectElement).selectedIndex || 0,
            selector: generateSelector(el),
        });
    }

    hasSnapshot = true;
    log(`[PMHNP-Undo] Snapshot taken: ${snapshots.length} fields`);
}

/**
 * Restore all form fields to their snapshot values.
 */
export function restoreSnapshot(): { restored: number; failed: number } {
    if (!hasSnapshot || snapshots.length === 0) {
        log('[PMHNP-Undo] No snapshot available');
        return { restored: 0, failed: 0 };
    }

    let restored = 0;
    let failed = 0;

    for (const snap of snapshots) {
        try {
            // Try to find the element (it might have been re-rendered in an SPA)
            let el = snap.element;
            if (!document.contains(el)) {
                // Element was removed — try to find by selector
                const found = document.querySelector(snap.selector) as HTMLElement;
                if (!found) {
                    failed++;
                    continue;
                }
                el = found;
            }

            const tag = el.tagName.toLowerCase();

            if (tag === 'select') {
                (el as HTMLSelectElement).selectedIndex = snap.previousSelectedIndex;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (tag === 'input' && (snap.type === 'checkbox' || snap.type === 'radio')) {
                (el as HTMLInputElement).checked = snap.previousChecked;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (el.getAttribute('contenteditable') === 'true') {
                el.textContent = snap.previousValue;
                el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            } else {
                (el as HTMLInputElement).value = snap.previousValue;
                triggerReactChange(el, snap.previousValue);
                el.dispatchEvent(new InputEvent('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }

            restored++;
        } catch {
            failed++;
        }
    }

    log(`[PMHNP-Undo] Restored ${restored}/${snapshots.length} fields (${failed} failed)`);
    return { restored, failed };
}

/**
 * Check if a snapshot is available for undo.
 */
export function canUndo(): boolean {
    return hasSnapshot && snapshots.length > 0;
}

/**
 * Clear the snapshot.
 */
export function clearSnapshot(): void {
    snapshots = [];
    hasSnapshot = false;
}

/**
 * Generate a CSS selector to re-find an element if it's re-rendered.
 */
function generateSelector(el: HTMLElement): string {
    if (el.id) return `#${CSS.escape(el.id)}`;

    const name = (el as HTMLInputElement).name;
    if (name) return `[name="${CSS.escape(name)}"]`;

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return `[aria-label="${CSS.escape(ariaLabel)}"]`;

    // Fallback to tag + index
    const tag = el.tagName.toLowerCase();
    const parent = el.parentElement;
    if (parent) {
        const siblings = parent.querySelectorAll(tag);
        const index = Array.from(siblings).indexOf(el);
        return `${tag}:nth-of-type(${index + 1})`;
    }

    return tag;
}
