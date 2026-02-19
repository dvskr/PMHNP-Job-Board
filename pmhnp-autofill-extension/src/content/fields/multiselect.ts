/**
 * Multi-select / Chip input handler.
 * Handles fields where multiple values are selected as tagged chips.
 * Common in: Workday (skills), Greenhouse (tags), SmartRecruiters.
 */
import { triggerReactChange } from '../filler';
import { fillTypeahead } from './typeahead';

/**
 * Fill a multi-select chip input with an array of values.
 * Handles both native <select multiple> and custom chip UIs.
 */
export async function fillMultiSelect(
    element: HTMLElement,
    values: string[]
): Promise<boolean> {
    if (!values || values.length === 0) return false;

    // Native <select multiple>
    if (element.tagName === 'SELECT' && (element as HTMLSelectElement).multiple) {
        return fillNativeMultiSelect(element as HTMLSelectElement, values);
    }

    // Custom chip/tag input
    return fillChipInput(element, values);
}

function fillNativeMultiSelect(select: HTMLSelectElement, values: string[]): boolean {
    const normalizedValues = values.map(v => v.toLowerCase().trim());
    let matched = 0;

    for (const option of select.options) {
        const optText = option.textContent?.toLowerCase().trim() || '';
        const optValue = option.value.toLowerCase().trim();
        const shouldSelect = normalizedValues.some(v =>
            optText.includes(v) || optValue.includes(v) || v.includes(optText) || v.includes(optValue)
        );
        if (shouldSelect) {
            option.selected = true;
            matched++;
        }
    }

    if (matched > 0) {
        select.dispatchEvent(new Event('change', { bubbles: true }));
        triggerReactChange(select, select.value);
    }

    return matched > 0;
}

async function fillChipInput(element: HTMLElement, values: string[]): Promise<boolean> {
    // Find the actual text input within the chip container
    const input = findChipInput(element);
    if (!input) return false;

    let filled = 0;

    for (const value of values) {
        // Check if value already exists as a chip
        if (chipAlreadyExists(element, value)) continue;

        // Try typeahead-style insertion
        const success = await fillTypeahead(input, value, {
            typingDelay: 80,
            dropdownTimeout: 2000,
            clearFirst: true,
        });

        if (!success) {
            // Fallback: type and press Enter
            (input as HTMLInputElement).value = value;
            triggerReactChange(input, value);
            input.dispatchEvent(new KeyboardEvent('keydown', {
                bubbles: true, key: 'Enter', keyCode: 13,
            }));
            await sleep(200);
        }

        filled++;
        await sleep(300);
    }

    return filled > 0;
}

function findChipInput(container: HTMLElement): HTMLElement | null {
    // Common patterns for chip input containers
    const selectors = [
        'input[type="text"]',
        'input:not([type="hidden"])',
        '[contenteditable="true"]',
        'input[role="combobox"]',
        '.chip-input input',
        '[class*="tag-input"] input',
        '[class*="multi"] input',
    ];

    for (const sel of selectors) {
        const el = container.querySelector(sel) as HTMLElement;
        if (el) return el;
    }

    // Maybe the element itself is the input
    if (container.tagName === 'INPUT') return container;

    return null;
}

function chipAlreadyExists(container: HTMLElement, value: string): boolean {
    const chips = container.querySelectorAll(
        '.chip, .tag, [class*="chip"], [class*="tag"], [class*="badge"], [class*="pill"], [class*="token"]'
    );

    const normalizedValue = value.toLowerCase().trim();
    for (const chip of chips) {
        const text = (chip.textContent || '').toLowerCase().trim();
        if (text.includes(normalizedValue) || normalizedValue.includes(text)) {
            return true;
        }
    }

    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
