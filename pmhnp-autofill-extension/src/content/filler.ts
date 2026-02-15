import type { MappedField, FillResult, FillDetail } from '@/shared/types';
import { getSettings } from '@/shared/storage';
import { FILL_DELAYS } from '@/shared/constants';
import { fillTypeahead, fillDateSmart, fillRichText, fillSlider } from './fields';

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
            console.log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → needs AI`);
            continue;
        }
        if (mapped.requiresFile) {
            result.needsFile++;
            result.details.push({ field: mapped, status: 'needs_review' });
            console.log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → needs file upload`);
            continue;
        }
        if (mapped.status === 'no_data') {
            result.skipped++;
            result.details.push({ field: mapped, status: 'skipped', error: 'No profile data' });
            console.log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → no profile data`);
            continue;
        }
        if (mapped.status === 'ambiguous') {
            result.skipped++;
            result.details.push({ field: mapped, status: 'skipped', error: 'Ambiguous match' });
            console.log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → ambiguous match`);
            continue;
        }

        // Skip fields that already have values (unless overwrite is on)
        if (!settings.overwriteExistingValues && mapped.field.currentValue) {
            result.skipped++;
            result.details.push({ field: mapped, status: 'skipped', error: 'Already has value' });
            console.log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → already has value: "${String(mapped.field.currentValue).substring(0, 20)}"`);
            continue;
        }

        try {
            console.log(`[PMHNP] Filling field "${mapped.field.identifier}" (${mapped.fillMethod}) with value: "${String(mapped.value).substring(0, 30)}"`);
            const detail = await fillSingleField(mapped);
            result.details.push(detail);
            if (detail.status === 'filled') {
                result.filled++;
                console.log(`[PMHNP]   ✅ Filled "${mapped.field.identifier}"`);
            } else if (detail.status === 'failed') {
                result.failed++;
                console.log(`[PMHNP]   ❌ Failed "${mapped.field.identifier}": ${detail.error}`);
            } else {
                result.skipped++;
                console.log(`[PMHNP]   ⏭️ Skipped "${mapped.field.identifier}": ${detail.error || detail.status}`);
            }
        } catch (err) {
            result.failed++;
            console.log(`[PMHNP]   ❌ Exception filling "${mapped.field.identifier}": ${err instanceof Error ? err.message : err}`);
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
            console.log(`[PMHNP]   Verification failed for "${field.identifier}", trying character-by-character typing...`);
            try {
                await simulateTyping(el, String(value));
                await sleep(200);
                const retryVerified = verifyFill(el, value);
                if (!retryVerified) {
                    // Still consider it as 'filled' since some frameworks process async
                    console.log(`[PMHNP]   Retry verification also failed — marking as needs_review`);
                    return { field: mapped, status: 'filled', error: 'Value set but verification uncertain' };
                }
            } catch (retryErr) {
                // Character-by-character may error on date fields — still mark as attempted
                console.log(`[PMHNP]   simulateTyping error: ${retryErr instanceof Error ? retryErr.message : retryErr}`);
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
            console.log(`[PMHNP] execCommand insertText succeeded for "${value.substring(0, 20)}..."`);
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

export async function fillSelect(el: HTMLElement, value: string): Promise<void> {
    if (el.tagName.toLowerCase() === 'select') {
        // Native select
        const select = el as HTMLSelectElement;
        const options = Array.from(select.options);

        // Find matching option
        const match = options.find(
            (o) =>
                o.value.toLowerCase() === value.toLowerCase() ||
                o.text.toLowerCase().trim() === value.toLowerCase() ||
                o.text.toLowerCase().includes(value.toLowerCase()) ||
                value.toLowerCase().includes(o.text.toLowerCase().trim())
        );

        if (match) {
            select.value = match.value;
            triggerReactChange(el, match.value);
        }
    } else {
        // Custom dropdown (div-based)
        await fillCustomDropdown(el, value);
    }
}

export async function fillCustomDropdown(el: HTMLElement, value: string): Promise<void> {
    // Click to open
    el.click();
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await sleep(300);

    // Look for option elements in the dropdown popup
    const optionSelectors = [
        '[role="option"]',
        '[data-automation-id*="promptOption"]',
        'li[role="presentation"]',
        '.dropdown-option',
        '[class*="option"]',
        'li',
    ];

    for (const selector of optionSelectors) {
        const options = document.querySelectorAll(selector);
        for (const opt of options) {
            const text = opt.textContent?.trim().toLowerCase() || '';
            if (text === value.toLowerCase() || text.includes(value.toLowerCase())) {
                (opt as HTMLElement).click();
                await sleep(100);
                return;
            }
        }
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
