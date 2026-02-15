/**
 * Universal Form Field Scanner
 *
 * Scans the page for ALL form elements and extracts metadata about each one.
 * No pattern matching, no field classification — just raw data collection.
 * Shadow DOM traversal is built in.
 */

export interface ScannedField {
    index: number;
    tagName: string;
    type: string;             // text, email, tel, file, radio, checkbox, select, textarea, custom-dropdown
    label: string;
    placeholder: string;
    name: string;
    id: string;
    options: string[];
    isRequired: boolean;
    currentValue: string;
    attributes: Record<string, string>;
    // We store the element reference for filling later
    element: HTMLElement;
    // Position for grouping/ordering
    rect: { x: number; y: number; width: number; height: number };
}

// ─── Main Scanner ───

export function scanAllFormFields(): ScannedField[] {
    const elements = collectFormElements(document);
    const fields: ScannedField[] = [];
    let index = 0;

    for (const el of elements) {
        if (!isVisible(el)) continue;
        if (isAlreadyFilled(el)) continue;

        const field = extractFieldMetadata(el, index);
        if (field) {
            fields.push(field);
            index++;
        }
    }

    console.log(`[PMHNP-Scanner] Found ${fields.length} form fields`);
    return fields;
}

// ─── Element Collection (with Shadow DOM) ───

function collectFormElements(root: Document | ShadowRoot | Element): HTMLElement[] {
    const elements: HTMLElement[] = [];
    const selectors = [
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"])',
        'select',
        'textarea',
        '[role="combobox"]',
        '[role="listbox"]',
        '[contenteditable="true"]',
    ].join(', ');

    // Query in main DOM
    try {
        const found = root.querySelectorAll<HTMLElement>(selectors);
        elements.push(...Array.from(found));
    } catch { /* ignore */ }

    // Traverse Shadow DOMs
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
        if (el.shadowRoot) {
            elements.push(...collectFormElements(el.shadowRoot));
        }
    }

    // Traverse same-origin iframes
    if (root === document || root instanceof Element) {
        const iframes = (root === document ? root : root).querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                if (iframe.contentDocument) {
                    elements.push(...collectFormElements(iframe.contentDocument));
                }
            } catch { /* cross-origin, skip */ }
        }
    }

    // Deduplicate
    return [...new Set(elements)];
}

// ─── Field Metadata Extraction ───

function extractFieldMetadata(el: HTMLElement, index: number): ScannedField | null {
    const tagName = el.tagName.toLowerCase();
    const inputEl = el as HTMLInputElement;

    // Determine type
    let type = 'text';
    if (tagName === 'select') type = 'select';
    else if (tagName === 'textarea') type = 'textarea';
    else if (el.getAttribute('role') === 'combobox') type = 'custom-dropdown';
    else if (el.getAttribute('role') === 'listbox') type = 'custom-dropdown';
    else if (el.getAttribute('contenteditable') === 'true') type = 'textarea';
    else if (tagName === 'input') {
        const inputType = inputEl.type?.toLowerCase() || 'text';
        type = inputType; // text, email, tel, file, radio, checkbox, date, number, url, etc.
    }

    // Skip file inputs (handled separately as uploads)
    // but include them in the scan so AI knows they exist
    // Skip radio/checkbox elements that are part of a group we already captured
    if (type === 'radio') {
        const name = inputEl.name;
        if (!name) return null;
        // For radio groups, only capture the first one and include all options
        const group = document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`);
        if (group[0] !== inputEl) return null; // skip duplicates in same group
    }

    // Get label
    const label = getLabel(el);

    // Get options
    const options = getOptions(el, type);

    // Get rect
    const rect = el.getBoundingClientRect();

    // Collect useful attributes
    const attributes: Record<string, string> = {};
    for (const attr of ['name', 'id', 'aria-label', 'aria-labelledby', 'data-automation-id',
        'data-testid', 'autocomplete', 'data-field', 'data-qa', 'class']) {
        const val = el.getAttribute(attr);
        if (val) attributes[attr] = val;
    }

    return {
        index,
        tagName,
        type,
        label,
        placeholder: inputEl.placeholder || el.getAttribute('placeholder') || '',
        name: inputEl.name || '',
        id: el.id || '',
        options,
        isRequired: inputEl.required || el.getAttribute('aria-required') === 'true' || !!el.closest('[required]'),
        currentValue: getCurrentValue(el, type),
        attributes,
        element: el,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
}

// ─── Label Extraction ───

function getLabel(el: HTMLElement): string {
    // 1. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    // 2. aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.textContent?.trim() || '';
    }

    // 3. <label for="id">
    if (el.id) {
        const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
        if (label) return label.textContent?.trim() || '';
    }

    // 4. Wrapping <label>
    const parentLabel = el.closest('label');
    if (parentLabel) {
        const text = parentLabel.textContent?.replace(el.textContent || '', '').trim();
        if (text) return text;
    }

    // 5. Previous sibling text or parent text
    const parent = el.parentElement;
    if (parent) {
        // Look for a label-like element near the input
        const previous = el.previousElementSibling;
        if (previous && previous.tagName !== 'INPUT' && previous.tagName !== 'SELECT') {
            const text = previous.textContent?.trim();
            if (text && text.length < 100) return text;
        }

        // Check parent's direct text
        const parentText = Array.from(parent.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent?.trim())
            .filter(Boolean)
            .join(' ')
            .trim();
        if (parentText && parentText.length < 100) return parentText;
    }

    // 6. Placeholder fallback
    return (el as HTMLInputElement).placeholder || '';
}

// ─── Options Extraction ───

function getOptions(el: HTMLElement, type: string): string[] {
    if (type === 'select') {
        const select = el as HTMLSelectElement;
        return Array.from(select.options)
            .map(o => o.textContent?.trim() || o.value)
            .filter(Boolean)
            .filter(v => v !== '' && v !== 'Select' && v !== 'Choose' && v !== '--');
    }

    if (type === 'radio') {
        const name = (el as HTMLInputElement).name;
        if (!name) return [];
        const radios = document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`);
        return Array.from(radios).map(r => {
            // Get the label for each radio
            const label = r.closest('label')?.textContent?.trim()
                || document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(r.id)}"]`)?.textContent?.trim()
                || r.value;
            return label || r.value;
        }).filter(Boolean);
    }

    return [];
}

// ─── Value Extraction ───

function getCurrentValue(el: HTMLElement, type: string): string {
    if (type === 'select') return (el as HTMLSelectElement).value;
    if (type === 'checkbox') return (el as HTMLInputElement).checked ? 'true' : 'false';
    if (type === 'radio') return (el as HTMLInputElement).checked ? (el as HTMLInputElement).value : '';
    if (type === 'textarea' || el.getAttribute('contenteditable') === 'true') return el.textContent?.trim() || '';
    return (el as HTMLInputElement).value || '';
}

// ─── Visibility Check ───

function isVisible(el: HTMLElement): boolean {
    if (!el.offsetParent && el.tagName !== 'BODY' && getComputedStyle(el).position !== 'fixed') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
    return true;
}

// ─── Already Filled Check ───

function isAlreadyFilled(el: HTMLElement): boolean {
    const tagName = el.tagName.toLowerCase();
    if (tagName === 'input') {
        const input = el as HTMLInputElement;
        const type = input.type?.toLowerCase();
        if (type === 'file') return false; // always scan file inputs
        if (type === 'checkbox' || type === 'radio') return false; // always scan checkboxes/radios
        return input.value.trim().length > 0;
    }
    if (tagName === 'textarea') return (el as HTMLTextAreaElement).value.trim().length > 0;
    if (tagName === 'select') {
        const select = el as HTMLSelectElement;
        return select.selectedIndex > 0; // 0 is typically "Select..."
    }
    return false;
}

// ─── Serialization (for sending to background/API) ───

export interface SerializedField {
    index: number;
    tagName: string;
    type: string;
    label: string;
    placeholder: string;
    name: string;
    id: string;
    options: string[];
    isRequired: boolean;
    currentValue: string;
    attributes: Record<string, string>;
}

export function serializeFields(fields: ScannedField[]): SerializedField[] {
    return fields.map(f => ({
        index: f.index,
        tagName: f.tagName,
        type: f.type,
        label: f.label,
        placeholder: f.placeholder,
        name: f.name,
        id: f.id,
        options: f.options,
        isRequired: f.isRequired,
        currentValue: f.currentValue,
        attributes: f.attributes,
    }));
}
