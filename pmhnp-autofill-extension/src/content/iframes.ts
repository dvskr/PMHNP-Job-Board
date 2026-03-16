/**
 * iframe handling for ATS platforms that embed forms in iframes.
 * Attempts to access same-origin iframes and detect form fields within them.
 */

import type { DetectedField, FieldCategory } from '@/shared/types';

/**
 * Scans all accessible iframes on the page for form fields.
 * Only same-origin iframes can be accessed; cross-origin iframes
 * will be silently skipped.
 */
export function detectFieldsInIframes(): DetectedField[] {
    const fields: DetectedField[] = [];
    const iframes = document.querySelectorAll('iframe');

    for (const iframe of iframes) {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!doc) continue;

            // Check if iframe has form-like content
            const formElements = doc.querySelectorAll('input, select, textarea');
            if (formElements.length === 0) continue;

            // Detect fields within the iframe's document
            const iframeFields = detectFormFieldsInDocument(doc);

            // Mark them with iframe context
            for (const field of iframeFields) {
                field.atsSpecific = true;
                fields.push(field);
            }
        } catch {
            // Cross-origin iframe — cannot access. This is expected.
            continue;
        }
    }

    return fields;
}

type DetectedFieldType = DetectedField['fieldType'];

/**
 * Detects form fields within a specific document (main or iframe).
 */
function detectFormFieldsInDocument(doc: Document): DetectedField[] {
    const elements = doc.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), ' +
        'select, textarea, [contenteditable="true"], [role="textbox"]'
    );

    const fields: DetectedField[] = [];

    for (const element of elements) {
        const input = element as HTMLInputElement;
        const identifier = input.name || input.id || input.getAttribute('data-automation-id') || '';

        if (!identifier && !input.type) continue;

        const label = findLabelInDoc(doc, element);

        fields.push({
            element,
            identifier,
            fieldType: categorizeFieldType(input),
            confidence: 0.6,
            label,
            name: input.name || '',
            id: input.id || '',
            placeholder: input.placeholder || '',
            ariaLabel: element.getAttribute('aria-label') || '',
            required: input.required || element.getAttribute('aria-required') === 'true',
            currentValue: input.value || '',
            options: input.tagName === 'SELECT'
                ? Array.from((input as unknown as HTMLSelectElement).options).map(o => o.text)
                : [],
            fieldCategory: 'unknown' as FieldCategory,
            atsSpecific: true,
        });
    }

    return fields;
}

function findLabelInDoc(doc: Document, element: HTMLElement): string {
    const id = element.id;
    if (id) {
        const label = doc.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label) return label.textContent?.trim() || '';
    }
    const parentLabel = element.closest('label');
    if (parentLabel) return parentLabel.textContent?.trim() || '';
    return element.getAttribute('aria-label') || '';
}

function categorizeFieldType(el: HTMLInputElement): DetectedFieldType {
    if (el.tagName === 'SELECT') return 'select';
    if (el.tagName === 'TEXTAREA') return 'textarea';
    const type = el.type?.toLowerCase() || 'text';
    if (type === 'file') return 'file';
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
    return 'input';
}
