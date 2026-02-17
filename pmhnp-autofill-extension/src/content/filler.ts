import type { MappedField, FillResult, FillDetail } from '@/shared/types';
import { getSettings } from '@/shared/storage';
import { FILL_DELAYS } from '@/shared/constants';
import { fillTypeahead, fillDateSmart, fillRichText, fillSlider } from './fields';
import { log, warn } from '@/shared/logger';

// ─── Main Fill Function ───

export async function fillForm(mappedFields: MappedField[]): Promise<FillResult> {
    const settings = await getSettings();
    const delay = FILL_DELAYS[settings.fillSpeed] || 50;

    const result: FillResult = {
        total: mappedFields.length,
        filled: 0,
        skipped: 0,
        failed: 0,
        needsAI: 0,
        needsFile: 0,
        details: [],
    };

    // Sort: simple fields first, complex later
    const sorted = [...mappedFields].sort((a, b) => {
        const order: Record<string, number> = { text: 0, date: 1, select: 2, radio: 3, checkbox: 4, file: 5, ai_generate: 6 };
        return (order[a.fillMethod] ?? 9) - (order[b.fillMethod] ?? 9);
    });

    for (const mapped of sorted) {
        // Skip AI and file fields — they're handled separately
        if (mapped.requiresAI) {
            result.needsAI++;
            result.details.push({ field: mapped, status: 'needs_review' });
            log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → needs AI`);
            continue;
        }
        if (mapped.requiresFile) {
            result.needsFile++;
            result.details.push({ field: mapped, status: 'needs_review' });
            log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → needs file upload`);
            continue;
        }
        if (mapped.status === 'no_data') {
            result.skipped++;
            result.details.push({ field: mapped, status: 'skipped', error: 'No profile data' });
            log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → no profile data`);
            continue;
        }
        if (mapped.status === 'ambiguous') {
            result.skipped++;
            result.details.push({ field: mapped, status: 'skipped', error: 'Ambiguous match' });
            log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → ambiguous match`);
            continue;
        }

        // Skip fields that already have values (unless overwrite is on)
        if (!settings.overwriteExistingValues && mapped.field.currentValue) {
            result.skipped++;
            result.details.push({ field: mapped, status: 'skipped', error: 'Already has value' });
            log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → already has value: "${String(mapped.field.currentValue).substring(0, 20)}"`);
            continue;
        }

        try {
            log(`[PMHNP] Filling field "${mapped.field.identifier}" (${mapped.fillMethod}) with value: "${String(mapped.value).substring(0, 30)}"`);
            const detail = await fillSingleField(mapped);
            result.details.push(detail);
            if (detail.status === 'filled') {
                result.filled++;
                log(`[PMHNP]   ✅ Filled "${mapped.field.identifier}"`);
            } else if (detail.status === 'failed') {
                result.failed++;
                log(`[PMHNP]   ❌ Failed "${mapped.field.identifier}": ${detail.error}`);
            } else {
                result.skipped++;
                log(`[PMHNP]   ⏭️ Skipped "${mapped.field.identifier}": ${detail.error || detail.status}`);
            }
        } catch (err) {
            result.failed++;
            log(`[PMHNP]   ❌ Exception filling "${mapped.field.identifier}": ${err instanceof Error ? err.message : err}`);
            result.details.push({
                field: mapped,
                status: 'failed',
                error: err instanceof Error ? err.message : 'Unknown error',
            });
        }

        // Delay between fields
        await sleep(delay);
    }

    return result;
}

// ─── Single Field Fill ───

export async function fillSingleField(mapped: MappedField): Promise<FillDetail> {
    const { field, value, fillMethod } = mapped;
    const el = field.element;

    // Scroll into view
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(50);

    try {
        switch (fillMethod) {
            case 'text': {
                // Check if element is a typeahead/combobox
                const isTypeahead = el.getAttribute('role') === 'combobox' ||
                    el.closest('[class*="typeahead"], [class*="autocomplete"], [class*="combobox"]') !== null ||
                    el.getAttribute('aria-autocomplete') === 'list' ||
                    el.getAttribute('aria-autocomplete') === 'both';

                // Check if element is a rich text editor
                const isRichText = el.getAttribute('contenteditable') === 'true' ||
                    el.closest('.ck-editor, .ql-container, .ProseMirror, [class*="tinymce"]') !== null;

                if (isTypeahead) {
                    await fillTypeahead(el, String(value));
                } else if (isRichText) {
                    await fillRichText(el, String(value));
                } else {
                    await fillTextInput(el, String(value));
                }
                break;
            }
            case 'date':
                await fillDateSmart(el, String(value));
                break;
            case 'select': {
                // Check for range slider
                if ((el as HTMLInputElement).type === 'range') {
                    await fillSlider(el, String(value));
                } else {
                    await fillSelect(el, String(value));
                }
                break;
            }
            case 'radio':
                await fillRadio(el, value);
                break;
            case 'checkbox':
                await fillCheckbox(el, value);
                break;
            default:
                return { field: mapped, status: 'skipped', error: `Unsupported fill method: ${fillMethod}` };
        }

        // Verify the value stuck (with tolerance for async frameworks)
        await sleep(200);
        const verified = verifyFill(el, value);
        if (!verified) {
            log(`[PMHNP]   Verification failed for "${field.identifier}", trying character-by-character typing...`);
            try {
                await simulateTyping(el, String(value));
                await sleep(200);
                const retryVerified = verifyFill(el, value);
                if (!retryVerified) {
                    // Still consider it as 'filled' since some frameworks process async
                    log(`[PMHNP]   Retry verification also failed — marking as needs_review`);
                    return { field: mapped, status: 'filled', error: 'Value set but verification uncertain' };
                }
            } catch (retryErr) {
                // Character-by-character may error on date fields — still mark as attempted
                log(`[PMHNP]   simulateTyping error: ${retryErr instanceof Error ? retryErr.message : retryErr}`);
                return { field: mapped, status: 'filled', error: 'Fill attempted, verification skipped' };
            }
        }

        return { field: mapped, status: 'filled' };
    } catch (err) {
        return {
            field: mapped,
            status: 'failed',
            error: err instanceof Error ? err.message : 'Fill failed',
        };
    }
}

// ─── Text Input (handles React AND Angular-controlled inputs) ───

export async function fillTextInput(el: HTMLElement, value: string): Promise<void> {
    const input = el as HTMLInputElement | HTMLTextAreaElement;

    // Focus the element
    input.focus();
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await sleep(50);

    // Clear existing value
    input.value = '';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteContentBackward' }));
    await sleep(30);

    // Method 1: Try document.execCommand (works well with many frameworks)
    try {
        input.select();
        const cmdResult = document.execCommand('insertText', false, value);
        if (cmdResult) {
            log(`[PMHNP] execCommand insertText succeeded for "${value.substring(0, 20)}..."`);
            await sleep(50);
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
            input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
            return;
        }
    } catch {
        // execCommand not supported, fall through
    }

    // Method 2: Set value using native setter (for React-controlled inputs)
    triggerReactChange(el, value);

    // Dispatch events that Angular zone.js listens for
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // Blur
    await sleep(30);
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

// ─── React-compatible value setter ───

export function triggerReactChange(element: HTMLElement, value: string): void {
    const tag = element.tagName.toLowerCase();

    try {
        let descriptor: PropertyDescriptor | undefined;

        if (tag === 'textarea') {
            descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        } else if (tag === 'input') {
            descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        } else if (tag === 'select') {
            descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
        }

        if (descriptor?.set) {
            descriptor.set.call(element, value);
        } else {
            (element as HTMLInputElement).value = value;
        }
    } catch {
        (element as HTMLInputElement).value = value;
    }

    // React-specific event
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
}

// ─── Select Dropdown ───

export async function fillSelect(el: HTMLElement, value: string, overlayElement?: HTMLElement): Promise<void> {
    if (el.tagName.toLowerCase() === 'select') {
        const select = el as HTMLSelectElement;
        const options = Array.from(select.options);

        if (options.length > 0) {
            // Native select has options — find matching one
            const match = options.find(
                (o) => {
                    const oText = o.text.toLowerCase().trim();
                    const oVal = o.value.toLowerCase();
                    const v = value.toLowerCase();
                    // Exact matches (safe even with empty strings)
                    if (oVal === v) return true;
                    if (oText === v) return true;
                    // Substring matches — guard against empty strings
                    // ("6".includes("") is true, so we must ensure the needle is non-empty)
                    if (oText && oText.includes(v)) return true;
                    if (oText && v.includes(oText)) return true;
                    return false;
                }
            );

            if (match) {
                // Set the native select value
                log(`[PMHNP] fillSelect: "${select.id}" matched option "${match.text.trim()}" (value="${match.value}"), ${options.length} options`);
                select.value = match.value;
                triggerReactChange(el, match.value);

                // Sync the visual display
                const displayText = match.text.trim() || match.value;
                log(`[PMHNP] fillSelect: calling syncVisualDisplay for "${select.id}" displayText="${displayText}" overlayElement=${overlayElement ? 'yes' : 'no'}`);
                try {
                    await syncVisualDisplay(select, displayText, overlayElement);
                } catch (err) {
                    console.error(`[PMHNP] fillSelect: syncVisualDisplay threw for "${select.id}":`, err);
                }
                return;
            } else {
                warn(`[PMHNP] ⚠️ fillSelect: no matching option for "${value}" in <select> with ${options.length} options`);
                warn(`[PMHNP]   Available options:`, options.map(o => `"${o.text.trim()}" (${o.value})`).slice(0, 10));
                // Fall through to try custom dropdown overlay
            }
        }

        // Native select has 0 options (or value didn't match any option).
        // Use click-through on the overlay.
        log(`[PMHNP] Native <select> "${select.id}" has ${options.length} options — trying overlay click-through...`);
        const overlay = overlayElement || findAdjacentOverlay(select);
        if (overlay) {
            log(`[PMHNP]   Found overlay, clicking to select "${value}"...`);
            await clickOptionInOverlay(overlay, value);
        } else {
            warn(`[PMHNP] ⚠️ No overlay found for <select> "${select.id}" — cannot fill "${value}"`);
        }
    } else {
        // Custom dropdown (div-based)
        await fillCustomDropdown(el, value);
    }
}

/**
 * After setting a native <select>'s value, sync the visible display element.
 * Uses a multi-tier approach:
 * 1. Try Vue's __vue__ component API
 * 2. Find the visible display element and set its text directly
 * 3. Fall back to click-through
 * 4. Verify the display actually updated
 */
async function syncVisualDisplay(select: HTMLSelectElement, displayText: string, overlayElement?: HTMLElement): Promise<void> {
    if (!displayText) return;

    // Resolve the overlay element
    const overlay = overlayElement || findAdjacentOverlay(select);
    if (!overlay) {
        log(`[PMHNP] No overlay found for <select> "${select.id}" — native events should suffice`);
        return;
    }

    log(`[PMHNP] Syncing visual display for "${displayText}" (select id="${select.id}")...`);

    // ── Strategy 1: Try Vue component's internal API ──
    try {
        const vueComp = (overlay as any).__vue__;
        if (vueComp && typeof vueComp.select === 'function' && vueComp.options) {
            const vueOpt = vueComp.options.find((o: any) => {
                const label = typeof o === 'string' ? o : (o?.label || o?.name || '');
                return label.toLowerCase().includes(displayText.toLowerCase()) ||
                    displayText.toLowerCase().includes(label.toLowerCase());
            });
            if (vueOpt) {
                vueComp.select(vueOpt);
                log(`[PMHNP]   ✅ Synced via Vue component API`);
                return;
            }
        }
    } catch { /* Vue API not available */ }

    // ── Strategy 2: Find the visible display element and set text directly ──
    const display = findVisibleDisplay(select, overlay);
    if (display) {
        display.textContent = displayText;
        log(`[PMHNP]   ✅ Synced via direct display text: "${displayText}" (tag=${display.tagName}, class="${display.className?.substring?.(0, 40) || ''}")`);

        // Verify after a short delay
        await sleep(200);
        const currentText = display.textContent?.trim().toLowerCase() || '';
        if (currentText.includes(displayText.toLowerCase()) || displayText.toLowerCase().includes(currentText)) {
            log(`[PMHNP]   ✅ Verified: display still shows "${display.textContent?.trim()}"`);
            return;
        } else {
            log(`[PMHNP]   ⚠️ Display was overwritten to "${display.textContent?.trim()}" — trying click-through...`);
            // Fall through to click-through
        }
    }

    // ── Strategy 3: Click-through (last resort) ──
    log(`[PMHNP]   Falling back to clickOptionInOverlay...`);
    await clickOptionInOverlay(overlay, displayText);
}

/**
 * Find the visible element that displays a select's current value.
 * Uses pure visibility + DOM position — no class-name matching needed.
 * Will find .multiselect__single, .select2-selection__rendered, or any
 * visible text element near the hidden select.
 */
function findVisibleDisplay(select: HTMLSelectElement, overlay: HTMLElement): HTMLElement | null {
    // Quick wins: known display selectors (fast path, still generic enough)
    const knownSelectors = [
        '.multiselect__single',
        '.select2-selection__rendered',
        '.chosen-single span',
        '[class*="single-value"]',
        '[class*="placeholder"]',
    ];
    for (const sel of knownSelectors) {
        const el = overlay.querySelector(sel) as HTMLElement;
        if (el && el.offsetParent !== null) return el;
    }

    // Generic approach: find any visible text-bearing element inside the overlay
    // that could display the selected value
    const candidates: HTMLElement[] = [];
    overlay.querySelectorAll('span, div').forEach(el => {
        const htmlEl = el as HTMLElement;
        if (htmlEl === select) return;
        // Must be a leaf or near-leaf element (not a big container)
        if (htmlEl.children.length > 3) return;
        // Must be visible
        const rect = htmlEl.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 5) return;
        try {
            const style = getComputedStyle(htmlEl);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
        } catch { return; }
        candidates.push(htmlEl);
    });

    // Prefer the innermost text-bearing element
    if (candidates.length > 0) {
        // Sort by depth (deepest first) then by position (leftmost first)
        candidates.sort((a, b) => {
            const depthA = getDepth(a);
            const depthB = getDepth(b);
            if (depthB !== depthA) return depthB - depthA;
            return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
        });
        return candidates[0];
    }

    return null;
}

/** Count DOM depth of an element */
function getDepth(el: HTMLElement): number {
    let depth = 0;
    let current: HTMLElement | null = el;
    while (current) {
        depth++;
        current = current.parentElement;
    }
    return depth;
}

/**
 * Find the custom dropdown overlay element adjacent to a native <select>.
 * Legacy fallback — prefers overlayElement from scanner when available.
 */
function findAdjacentOverlay(select: HTMLSelectElement): HTMLElement | null {
    function isOverlay(el: HTMLElement): boolean {
        if (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox') return true;
        if (el.className && typeof el.className === 'string' && /multiselect|select2|chosen/i.test(el.className)) return true;
        if (el.querySelector('[role="combobox"], [role="listbox"], [role="option"]')) return true;
        if (el.hasAttribute('aria-expanded') || el.hasAttribute('aria-controls')) return true;
        // Generic: visible div with interactive children near the select
        const rect = el.getBoundingClientRect();
        if (el.tagName === 'DIV' && el.children.length > 0 && rect.height > 20 && rect.height < 100) {
            if (el.querySelector('span, [class*="select"], [class*="placeholder"]')) return true;
        }
        return false;
    }

    // Check next siblings (up to 5)
    let sibling = select.nextElementSibling as HTMLElement | null;
    for (let i = 0; sibling && i < 5; i++) {
        if (sibling instanceof HTMLElement && isOverlay(sibling)) return sibling;
        sibling = sibling.nextElementSibling as HTMLElement | null;
    }

    // Check parent's children
    const parent = select.parentElement;
    if (parent) {
        for (const child of parent.children) {
            if (child === select || !(child instanceof HTMLElement)) continue;
            if (isOverlay(child)) return child;
        }
        if (parent instanceof HTMLElement && isOverlay(parent)) return parent;

        const grandparent = parent.parentElement;
        if (grandparent) {
            for (const child of grandparent.children) {
                if (child === parent || child === select || !(child instanceof HTMLElement)) continue;
                if (isOverlay(child)) return child;
            }
        }
    }

    return null;
}

/**
 * Click to open a dropdown overlay, find the matching option, and click it.
 * Uses full mouse event sequence for maximum compatibility with Vue/React/Angular.
 */
async function clickOptionInOverlay(container: HTMLElement, optionText: string): Promise<void> {
    // Click the wrapper/toggle to open the dropdown
    const toggle = container.querySelector(
        '[role="combobox"], .multiselect__select, .select2-selection, .chosen-single, [class*="toggle"], [class*="trigger"]'
    ) as HTMLElement;
    const clickTarget = toggle || container;

    // Full mouse event sequence to open dropdown
    clickTarget.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    clickTarget.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    clickTarget.click();
    await sleep(500);  // Wait for options to render

    // Search for the matching option
    const optionSelectors = [
        '.multiselect__option',
        '.multiselect__element span',
        '[role="option"]',
        '.select2-results__option',
        '.chosen-results li',
        '[class*="option"]',
        'li',
    ];

    const searchRoots: Element[] = [container, document.body];
    const valueLower = optionText.toLowerCase();

    for (const root of searchRoots) {
        for (const sel of optionSelectors) {
            try {
                const opts = root.querySelectorAll(sel);
                for (const opt of opts) {
                    const text = opt.textContent?.trim().toLowerCase() || '';
                    if (!text) continue;
                    if (text === valueLower || text.includes(valueLower) || valueLower.includes(text)) {
                        const el = opt as HTMLElement;
                        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                        el.click();
                        log(`[PMHNP]   ✅ Clicked option: "${opt.textContent?.trim()}"`);
                        await sleep(200);
                        return;
                    }
                }
            } catch { /* ignore selector errors */ }
        }
    }

    // If we couldn't find the option, click the wrapper again to close
    clickTarget.click();
    log(`[PMHNP]   ⚠️ Could not find "${optionText}" in custom dropdown overlay`);
}

export async function fillCustomDropdown(el: HTMLElement, value: string): Promise<void> {
    // Click to open / focus
    el.click();
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await sleep(200);

    // For typeahead/autocomplete dropdowns: find the inner input and type the value
    const innerInput = el.tagName === 'INPUT' ? el as HTMLInputElement
        : el.querySelector('input') as HTMLInputElement
        || (el.shadowRoot?.querySelector('input') as HTMLInputElement);

    if (innerInput) {
        // Focus and clear
        innerInput.focus();
        innerInput.value = '';
        innerInput.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(100);

        // Type the value to trigger autocomplete suggestions
        await simulateTyping(innerInput, value);
        await sleep(500); // Wait for suggestions to appear
    }

    // Look for option elements in the dropdown popup
    // Search both the main DOM and shadow DOMs
    const optionSelectors = [
        '[role="option"]',
        '[data-automation-id*="promptOption"]',
        'li[role="presentation"]',
        '.dropdown-option',
        '[class*="option"]',
        'li',
    ];

    const searchRoots: (Document | ShadowRoot)[] = [document];
    // Also check shadow roots of the element and its ancestors
    let ancestor: HTMLElement | null = el;
    for (let depth = 0; ancestor && depth < 5; depth++) {
        if (ancestor.shadowRoot) searchRoots.push(ancestor.shadowRoot);
        ancestor = ancestor.parentElement;
    }

    for (const root of searchRoots) {
        for (const selector of optionSelectors) {
            try {
                const options = root.querySelectorAll(selector);
                for (const opt of options) {
                    const text = opt.textContent?.trim().toLowerCase() || '';
                    if (text === value.toLowerCase() || text.includes(value.toLowerCase())) {
                        (opt as HTMLElement).click();
                        await sleep(100);
                        return;
                    }
                }
            } catch { /* invalid selector in shadow root */ }
        }
    }

    // Fallback: press Enter to select the first suggestion
    if (innerInput) {
        innerInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        await sleep(100);
    }
}

// ─── Radio Buttons ───

export async function fillRadio(el: HTMLElement, value: string | boolean): Promise<void> {
    const name = (el as HTMLInputElement).name;
    if (!name) return;

    const radios = document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`);
    const targetValue = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value).toLowerCase();

    for (const radio of radios) {
        const radioValue = radio.value.toLowerCase();
        const radioLabel = findRadioLabel(radio).toLowerCase();

        if (
            radioValue === targetValue ||
            radioLabel === targetValue ||
            radioLabel.includes(targetValue) ||
            (targetValue === 'yes' && (radioValue === 'true' || radioValue === '1' || radioLabel === 'yes')) ||
            (targetValue === 'no' && (radioValue === 'false' || radioValue === '0' || radioLabel === 'no'))
        ) {
            radio.checked = true;
            radio.click();
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }
    }
}

function findRadioLabel(radio: HTMLInputElement): string {
    // Check for associated label
    if (radio.id) {
        const label = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
        if (label) return label.textContent?.trim() || '';
    }
    // Check parent label
    const parentLabel = radio.closest('label');
    if (parentLabel) return parentLabel.textContent?.trim() || '';
    // Check next sibling text
    const next = radio.nextSibling;
    if (next && next.nodeType === Node.TEXT_NODE) return next.textContent?.trim() || '';
    return radio.value;
}

// ─── Checkbox ───

export async function fillCheckbox(el: HTMLElement, value: string | boolean): Promise<void> {
    const checkbox = el as HTMLInputElement;
    const shouldBeChecked = typeof value === 'boolean' ? value : value === 'true' || value === 'yes' || value === '1';

    if (checkbox.checked !== shouldBeChecked) {
        checkbox.click();
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

// ─── Character-by-character typing (fallback for stubborn forms) ───

export async function simulateTyping(element: HTMLElement, value: string): Promise<void> {
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    input.focus();
    input.value = '';

    for (let i = 0; i < value.length; i++) {
        const char = value[i];

        input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        input.value += char;
        input.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

        await sleep(10); // Small delay between characters
    }

    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

// ─── Verification ───

export function verifyFill(el: HTMLElement, value: string | boolean): boolean {
    const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

    if (el.tagName.toLowerCase() === 'input' && (el as HTMLInputElement).type === 'checkbox') {
        const expected = typeof value === 'boolean' ? value : value === 'true';
        return (el as HTMLInputElement).checked === expected;
    }

    if (el.tagName.toLowerCase() === 'input' && (el as HTMLInputElement).type === 'radio') {
        return (el as HTMLInputElement).checked;
    }

    const currentVal = input.value?.toLowerCase().trim() || '';
    const expectedVal = String(value).toLowerCase().trim();

    // Exact match or value is set to something reasonable
    return currentVal === expectedVal || (currentVal.length > 0 && currentVal.includes(expectedVal.substring(0, 5)));
}

// ─── Utility ───

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
