/**
 * Drag-Drop Zone File Uploader
 *
 * Handles file upload for job application forms that use drag-drop zones
 * instead of standard <input type="file"> elements.
 *
 * Strategy:
 * 1. Detect drag-drop zones via common class/attribute patterns
 * 2. Look for hidden <input type="file"> inside the zone → inject file there
 * 3. If no hidden input, synthesize DragEvent sequence with DataTransfer
 */

import { log, warn } from '@/shared/logger';

// ─── Drag-Drop Zone Detection ───

/** Selectors for common drag-drop upload zones */
const DROPZONE_SELECTORS = [
    '[class*="dropzone"]',
    '[class*="drop-zone"]',
    '[class*="upload-area"]',
    '[class*="file-upload"]',
    '[class*="drag-drop"]',
    '[class*="DragDrop"]',
    '[data-automation-id*="file"]',
    '[data-automation-id*="upload"]',
    '[data-automation-id*="attachments"]',
    '[data-testid*="upload"]',
    '[data-testid*="file"]',
    '.upload-widget',
    '.resume-upload',
    '.file-drop',
    '[role="button"][aria-label*="upload"]',
    '[role="button"][aria-label*="drop"]',
];

/**
 * Find all drag-drop upload zones on the page.
 * Returns elements that look like file upload areas but aren't standard <input type="file">.
 */
export function findDropZones(): HTMLElement[] {
    const zones: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();

    for (const selector of DROPZONE_SELECTORS) {
        try {
            const elements = document.querySelectorAll<HTMLElement>(selector);
            for (const el of elements) {
                if (seen.has(el)) continue;
                if (!isVisible(el)) continue;
                seen.add(el);
                zones.push(el);
            }
        } catch {
            // Invalid selector — skip
        }
    }

    log(`[PMHNP-DZ] Found ${zones.length} drag-drop zone(s)`);
    return zones;
}

/**
 * Find a hidden <input type="file"> inside or near a drag-drop zone.
 * Many UI libraries (Workday, Greenhouse, Dropzone.js) hide the native file input
 * inside their custom upload widget.
 */
export function findHiddenFileInput(zone: HTMLElement): HTMLInputElement | null {
    // 1. Inside the zone
    const inside = zone.querySelector<HTMLInputElement>('input[type="file"]');
    if (inside) {
        log(`[PMHNP-DZ] Found hidden file input inside zone`);
        return inside;
    }

    // 2. Sibling of the zone
    const parent = zone.parentElement;
    if (parent) {
        const sibling = parent.querySelector<HTMLInputElement>('input[type="file"]');
        if (sibling) {
            log(`[PMHNP-DZ] Found hidden file input as sibling of zone`);
            return sibling;
        }
    }

    // 3. Parent's parent (some frameworks nest deeper)
    const grandparent = parent?.parentElement;
    if (grandparent) {
        const deep = grandparent.querySelector<HTMLInputElement>('input[type="file"]');
        if (deep) {
            log(`[PMHNP-DZ] Found hidden file input in grandparent`);
            return deep;
        }
    }

    return null;
}

// ─── File Injection ───

/**
 * Inject a file into a drag-drop zone.
 * Strategy: find hidden input first, fall back to DragEvent synthesis.
 */
export async function injectFileToDropZone(
    zone: HTMLElement,
    file: File
): Promise<boolean> {
    // Strategy 1: Find hidden <input type="file"> and inject there
    const hiddenInput = findHiddenFileInput(zone);
    if (hiddenInput) {
        return injectFileToInput(hiddenInput, file);
    }

    // Strategy 2: Synthesize drag-drop events
    return synthesizeDrop(zone, file);
}

/**
 * Inject a file into a standard <input type="file"> element.
 * Uses DataTransfer to programmatically set the files property.
 */
export function injectFileToInput(input: HTMLInputElement, file: File): boolean {
    try {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;

        // Dispatch change event
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));

        log(`[PMHNP-DZ] Injected file "${file.name}" into <input type="file">`);
        return true;
    } catch (err) {
        warn(`[PMHNP-DZ] Failed to inject file to input:`, err);
        return false;
    }
}

/**
 * Synthesize a full drag-drop event sequence on a target element.
 * Dispatches: dragenter → dragover → drop with DataTransfer containing the file.
 */
async function synthesizeDrop(target: HTMLElement, file: File): Promise<boolean> {
    try {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);

        // Simulate the full drag-drop sequence
        const events = ['dragenter', 'dragover', 'drop'] as const;

        for (const eventType of events) {
            const event = new DragEvent(eventType, {
                bubbles: true,
                cancelable: true,
                dataTransfer,
            });

            target.dispatchEvent(event);

            // Small delay between events to let frameworks react
            await sleep(100);
        }

        // Also dispatch dragleave to clean up
        target.dispatchEvent(new DragEvent('dragleave', { bubbles: true }));

        log(`[PMHNP-DZ] Synthesized drop event for "${file.name}" on zone`);
        return true;
    } catch (err) {
        warn(`[PMHNP-DZ] Failed to synthesize drop:`, err);
        return false;
    }
}

// ─── File Creation Helpers ───

/**
 * Create a File object from a base64 string.
 * Used when downloading resume from profile URL via background script.
 */
export function base64ToFile(base64: string, fileName: string, mimeType: string): File {
    const byteCharacters = atob(base64);
    const byteArrays: Uint8Array[] = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        byteArrays.push(new Uint8Array(byteNumbers));
    }

    const blob = new Blob(byteArrays as BlobPart[], { type: mimeType });
    return new File([blob], fileName, { type: mimeType });
}

/**
 * Detect MIME type from a file URL or extension.
 */
export function detectMimeType(url: string): string {
    const ext = url.split('.').pop()?.toLowerCase().split('?')[0] || '';
    const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        txt: 'text/plain',
        rtf: 'application/rtf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
    };
    return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Extract filename from a URL.
 */
export function extractFileName(url: string): string {
    try {
        const pathname = new URL(url).pathname;
        const segments = pathname.split('/');
        return segments[segments.length - 1] || 'resume.pdf';
    } catch {
        return 'resume.pdf';
    }
}

// ─── Helpers ───

function isVisible(el: HTMLElement): boolean {
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
