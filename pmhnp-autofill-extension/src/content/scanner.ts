import { log, warn } from '@/shared/logger';
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
    // For hidden selects: the visible overlay element that displays the value
    overlayElement?: HTMLElement;
}

// ─── Main Scanner ───

export function scanAllFormFields(): ScannedField[] {
    const elements = collectFormElements(document);
    const rawFields: ScannedField[] = [];
    // Track which elements are overlays of hidden selects (skip them)
    const overlayElements = new Set<HTMLElement>();
    let index = 0;

    // ─── First pass: collect all elements and detect hidden selects ───
    for (const el of elements) {
        // File inputs are often hidden behind styled drop zones — always include them
        const isFileInput = el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'file';
        if (!isFileInput && !isVisible(el)) {
            // Special case: hidden <select> elements may have a visible overlay
            if (el.tagName === 'SELECT' && isHiddenSelect(el as HTMLSelectElement)) {
                const overlay = findVisibleOverlayNear(el as HTMLSelectElement);
                const field = extractFieldMetadata(el, index);
                if (field) {
                    if (overlay) {
                        field.overlayElement = overlay;
                        overlayElements.add(overlay);
                        log(`[PMHNP-Scanner] Hidden <select> [${index}] "${field.label || field.name}" → overlay found (${overlay.className.substring(0, 50)})`);
                    } else {
                        log(`[PMHNP-Scanner] Hidden <select> [${index}] "${field.label || field.name}" id="${el.id}" → NO overlay found, including anyway`);
                    }
                    rawFields.push(field);
                    index++;
                }
            } else {
                // Log invisible selects that aren't detected as hidden selects
                if (el.tagName === 'SELECT') {
                    log(`[PMHNP-Scanner] Invisible <select> skipped: id="${el.id}" (not hidden-select pattern)`);
                }
            }
            continue;
        }
        if (!isFileInput && isAlreadyFilled(el)) continue;

        // Skip elements that are overlays of hidden selects
        if (overlayElements.has(el)) {
            log(`[PMHNP-Scanner] Skipping overlay element (already linked to hidden select)`);
            continue;
        }

        const field = extractFieldMetadata(el, index);
        if (field) {
            rawFields.push(field);
            index++;
        }
    }

    // ─── Second pass: dedup remaining custom-dropdown/search overlays ───
    // Even after hidden-select detection, some overlays might still slip through
    // (e.g., if the select is technically visible but has 0 height).
    // Use a conservative approach: skip custom-dropdown/search fields with no name/id.
    const hasNativeSelects = rawFields.some(f => f.type === 'select' && f.tagName === 'SELECT');
    const fields: ScannedField[] = [];
    let finalIndex = 0;
    for (const f of rawFields) {
        if (hasNativeSelects && (f.type === 'custom-dropdown' || f.type === 'search')) {
            const hasFormIdentity = !!(f.name && f.name.trim()) || !!(f.id && f.id.trim());
            if (!hasFormIdentity) {
                log(`[PMHNP-Scanner] Dedup: skipping ${f.type} [${f.index}] "${f.label}" (no name/id, likely overlay)`);
                continue;
            }
        }
        f.index = finalIndex;
        fields.push(f);
        finalIndex++;
    }

    if (rawFields.length !== fields.length) {
        log(`[PMHNP-Scanner] Deduplicated: ${rawFields.length} → ${fields.length} fields (removed ${rawFields.length - fields.length} overlays)`);
    }
    log(`[PMHNP-Scanner] Found ${fields.length} form fields`);
    return fields;
}

// ─── Element Collection (with Shadow DOM) ───

function collectFormElements(root: Document | ShadowRoot | Element): HTMLElement[] {
    const elements: HTMLElement[] = [];
    // Include [role="combobox"] and [role="listbox"] — Workday and other ATS use these for
    // typeahead/autocomplete fields (e.g. School or University, Field of Study).
    // Overlays linked to hidden selects are filtered out via the overlay dedup logic.
    const selectors = [
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"])',
        'select',
        'textarea',
        '[contenteditable="true"]',
        '[role="combobox"]',
        '[role="listbox"]',
        '[aria-haspopup="listbox"]',
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
    else if (el.getAttribute('aria-haspopup') === 'listbox') type = 'custom-dropdown';
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
        isRequired: inputEl.required
            || el.getAttribute('aria-required') === 'true'
            || !!el.closest('[required]')
            || /\*\s*$/.test(label)
            || !!el.closest('[data-required="true"]')
            || !!el.closest('.required')
            || !!document.querySelector(`label[for="${CSS.escape(el.id || '__NONE__')}"] .required, label[for="${CSS.escape(el.id || '__NONE__')}"] abbr[title*="required"]`),
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

    // 2.5 aria-describedby — use description text as label if no other label found
    const describedBy = el.getAttribute('aria-describedby');
    if (describedBy) {
        const descEl = document.getElementById(describedBy);
        if (descEl) {
            const descText = descEl.textContent?.trim();
            // Only use if it looks like a label (short, not a help/error message)
            if (descText && descText.length < 80 && !/error|invalid|required/i.test(descText)) {
                return descText;
            }
        }
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

    // 5. Previous sibling text or label-like element
    const parent = el.parentElement;
    if (parent) {
        const previous = el.previousElementSibling;
        if (previous && previous.tagName !== 'INPUT' && previous.tagName !== 'SELECT') {
            const text = previous.textContent?.trim();
            if (text && text.length < 100) return text;
        }

        // Check parent's direct text nodes
        const parentText = Array.from(parent.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent?.trim())
            .filter(Boolean)
            .join(' ')
            .trim();
        if (parentText && parentText.length < 100) return parentText;
    }

    // 6. Walk up ancestors (SmartRecruiters wraps inputs deep in divs)
    let ancestor = el.parentElement;
    for (let depth = 0; ancestor && depth < 4; depth++) {
        // Check for a label/heading/span sibling above the input container
        const labelSibling = ancestor.querySelector('label, h3, h4, h5, .label, [class*="label"], [class*="Label"]');
        if (labelSibling && !labelSibling.contains(el)) {
            const text = labelSibling.textContent?.trim();
            if (text && text.length < 100) return text;
        }

        // Check previous sibling of ancestor
        const prevSib = ancestor.previousElementSibling;
        if (prevSib) {
            const tag = prevSib.tagName;
            if (['LABEL', 'SPAN', 'DIV', 'P', 'H3', 'H4', 'H5'].includes(tag)) {
                const text = prevSib.textContent?.trim();
                if (text && text.length < 80 && text.length > 1) return text;
            }
        }

        ancestor = ancestor.parentElement;
    }

    // 7. Placeholder fallback
    const placeholder = (el as HTMLInputElement).placeholder;
    if (placeholder) return placeholder;

    // 8. Extended ancestor walk for deep Angular DOMs (e.g., SmartRecruiters)
    // Go up to 8 levels (not just 4) and look for text above the input
    let deepAncestor = el.parentElement;
    for (let depth = 0; deepAncestor && depth < 8; depth++) {
        // Look for preceding siblings with question text
        const prevSibling = deepAncestor.previousElementSibling;
        if (prevSibling) {
            const text = prevSibling.textContent?.trim() || '';
            // Must be question-length text (not too short, not too long)
            if (text.length > 10 && text.length < 200) return text;
        }
        deepAncestor = deepAncestor.parentElement;
    }

    // 9. Visual proximity: find text directly above the input using coordinates
    try {
        const inputRect = el.getBoundingClientRect();
        if (inputRect.width > 0 && inputRect.height > 0) {
            // Look for text elements within 150px above the input
            const candidates = document.querySelectorAll('label, p, span, div, h1, h2, h3, h4, h5, h6');
            let bestLabel = '';
            let bestDist = 150;
            for (const candidate of candidates) {
                if (candidate.contains(el) || el.contains(candidate)) continue;
                const text = candidate.textContent?.trim() || '';
                if (text.length < 10 || text.length > 200) continue;
                // Skip if this element has many children (it's a container, not a label)
                if (candidate.children.length > 3) continue;
                const cRect = candidate.getBoundingClientRect();
                if (cRect.width === 0 || cRect.height === 0) continue;
                // Must be above or at the same level as the input
                const vertDist = inputRect.top - cRect.bottom;
                const horizOverlap = Math.min(inputRect.right, cRect.right) - Math.max(inputRect.left, cRect.left);
                // Must have horizontal overlap (same column) and be above (0-150px)
                if (vertDist >= 0 && vertDist < bestDist && horizOverlap > 50) {
                    bestDist = vertDist;
                    bestLabel = text;
                }
            }
            if (bestLabel) return bestLabel;
        }
    } catch { /* getBoundingClientRect may fail in some contexts */ }

    // 10. Humanize the id as last resort (skip UUID-like patterns)
    if (el.id) {
        // Check if id looks like a UUID (contains hex segments separated by hyphens)
        if (/^(question[-_]?)?[0-9a-f]{4,}/i.test(el.id.replace(/[-_]/g, ''))) {
            // UUID-like id — not useful as a label
            return '';
        }
        const humanized = el.id
            .replace(/[-_]+/g, ' ')
            .replace(/input|field|element|spl[-_]?form/gi, '')
            .trim();
        if (humanized.length > 1) return humanized;
    }

    // 10.5 Prepend fieldset <legend> context for disambiguation
    // e.g., "Education → Degree" vs just "Degree"
    // This runs on whatever label we found (or empty), adding section context
    const fieldset = el.closest('fieldset');
    if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend) {
            const legendText = legend.textContent?.trim();
            if (legendText && legendText.length < 60) {
                // Store legend context in the element's dataset for matcher use
                el.dataset.sectionContext = legendText;
            }
        }
    }

    return '';
}

// ─── Options Extraction ───

function getOptions(el: HTMLElement, type: string): string[] {
    if (type === 'select') {
        const select = el as HTMLSelectElement;
        const nativeOpts = Array.from(select.options)
            .map(o => o.textContent?.trim() || o.value)
            .filter(Boolean)
            .filter(v => v !== '' && v !== 'Select' && v !== 'Choose' && v !== '--');

        if (nativeOpts.length > 0) return nativeOpts;

        // Native select has 0 options — look for options in adjacent custom dropdown overlay
        // Common pattern: <select style="display:none"> followed by <div class="multiselect">
        const overlayOpts = getOptionsFromOverlay(select);
        if (overlayOpts.length > 0) {
            log(`[PMHNP-Scanner] Captured ${overlayOpts.length} options from overlay for "${el.id || el.getAttribute('name') || 'unknown'}"`);
        }
        return overlayOpts;
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

/**
 * When a native <select> has 0 options, search for them in adjacent custom dropdown overlays.
 * Common patterns: Vue Multiselect, Select2, Chosen, etc. render options in separate divs.
 */
function getOptionsFromOverlay(select: HTMLSelectElement): string[] {
    const optionTexts: string[] = [];

    // Strategy 1: Check next sibling (most common — custom dropdown div right after select)
    let sibling = select.nextElementSibling;
    for (let i = 0; sibling && i < 3; i++) {
        const opts = sibling.querySelectorAll('[role="option"], .multiselect__element span, li[data-value], li.option');
        if (opts.length > 0) {
            opts.forEach(opt => {
                const text = opt.textContent?.trim();
                if (text && text !== '' && text !== '--' && text !== 'Select') {
                    optionTexts.push(text);
                }
            });
            if (optionTexts.length > 0) return [...new Set(optionTexts)];
        }
        sibling = sibling.nextElementSibling;
    }

    // Strategy 2: Check parent's children for a listbox/combobox with options
    const parent = select.parentElement;
    if (parent) {
        for (const child of parent.children) {
            if (child === select) continue;
            const listbox = child.querySelector('[role="listbox"]') || child;
            const opts = listbox.querySelectorAll('[role="option"], .multiselect__element span, li');
            if (opts.length > 1) {  // at least 2 real options
                opts.forEach(opt => {
                    const text = opt.textContent?.trim();
                    if (text && text.length > 0 && text.length < 200 && text !== '--') {
                        optionTexts.push(text);
                    }
                });
                if (optionTexts.length > 0) return [...new Set(optionTexts)];
            }
        }
    }

    // Strategy 3: Walk up to grandparent and look for listbox
    const grandparent = parent?.parentElement;
    if (grandparent) {
        const listbox = grandparent.querySelector('[role="listbox"]');
        if (listbox) {
            const opts = listbox.querySelectorAll('[role="option"]');
            opts.forEach(opt => {
                const text = opt.textContent?.trim();
                if (text && text.length > 0 && text.length < 200) {
                    optionTexts.push(text);
                }
            });
        }
    }

    return [...new Set(optionTexts)];
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

// ─── Hidden Select Detection ───

/**
 * Detects if a <select> is hidden behind a custom dropdown overlay.
 * Uses multiple signals: offsetParent, opacity, dimensions, tabindex, aria-hidden.
 */
function isHiddenSelect(select: HTMLSelectElement): boolean {
    const style = getComputedStyle(select);
    // Explicitly hidden
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    // Invisible but still in layout (common pattern: opacity: 0, position: absolute)
    if (style.opacity === '0') return true;
    // Zero dimensions
    const rect = select.getBoundingClientRect();
    if (rect.width === 0 || rect.height < 2) return true;
    // Moved offscreen
    if (rect.left < -100 || rect.top < -100) return true;
    // tabindex=-1 with aria-hidden (framework hides it)
    if (select.tabIndex === -1 && select.getAttribute('aria-hidden') === 'true') return true;
    // No offsetParent and not fixed
    if (!select.offsetParent && style.position !== 'fixed') return true;
    return false;
}

/**
 * Find the visible overlay element near a hidden <select>.
 * Uses pure visibility/structure detection — no class-name matching needed.
 * Walks: siblings, parent children, parent itself, grandparent children.
 */
function findVisibleOverlayNear(select: HTMLSelectElement): HTMLElement | null {
    function isLikelyOverlay(el: HTMLElement): boolean {
        if (el === select) return false;
        if (el.tagName === 'SELECT' || el.tagName === 'LABEL' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return false;
        // Must be visible
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return false;
        // Should be a block-level element (div, span wrapper, etc.)
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return false;
        // Check signals: has child text, clickable role, dropdown-like attributes
        if (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox') return true;
        if (el.querySelector('[role="combobox"], [role="listbox"], [role="option"]')) return true;
        // Has aria-expanded or aria-controls (dropdown toggle)
        if (el.hasAttribute('aria-expanded') || el.hasAttribute('aria-controls')) return true;
        // Contains visible interactive text display (generic signal)
        if (el.querySelector('span, [class*="select"], [class*="placeholder"], [class*="single"]')) return true;
        // Fallback: any div with child elements that looks like it wraps an input
        if (el.children.length > 0 && el.tagName === 'DIV' && rect.height > 20 && rect.height < 100) return true;
        return false;
    }

    // Strategy 1: Next siblings
    let sibling = select.nextElementSibling as HTMLElement | null;
    for (let i = 0; sibling && i < 5; i++) {
        if (sibling instanceof HTMLElement && isLikelyOverlay(sibling)) return sibling;
        sibling = sibling.nextElementSibling as HTMLElement | null;
    }

    // Strategy 2: Parent's children
    const parent = select.parentElement;
    if (parent) {
        for (const child of parent.children) {
            if (!(child instanceof HTMLElement)) continue;
            if (isLikelyOverlay(child)) return child;
        }

        // Strategy 3: Parent itself
        if (parent instanceof HTMLElement && isLikelyOverlay(parent)) return parent;

        // Strategy 4: Grandparent's children
        const grandparent = parent.parentElement;
        if (grandparent) {
            for (const child of grandparent.children) {
                if (child === parent || !(child instanceof HTMLElement)) continue;
                if (isLikelyOverlay(child)) return child;
            }

            // Strategy 5: Grandparent itself
            if (grandparent instanceof HTMLElement && isLikelyOverlay(grandparent)) return grandparent;
        }
    }

    return null;
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
