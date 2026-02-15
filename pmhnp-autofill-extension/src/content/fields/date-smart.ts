/**
 * Smart date field handler.
 * Detects the expected date format and converts profile dates accordingly.
 * Handles date pickers, split date fields (month/day/year), and text inputs.
 */
import { triggerReactChange } from '../filler';

export type DateFormat = 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'MM-DD-YYYY' | 'YYYY/MM/DD' | 'M/D/YYYY' | 'MMM DD, YYYY';

/**
 * Fill a date field with intelligent format detection.
 */
export async function fillDateSmart(
    element: HTMLElement,
    dateValue: string
): Promise<boolean> {
    if (!dateValue) return false;

    const parsed = parseDate(dateValue);
    if (!parsed) return false;

    // Check if it's a native date input
    const input = element as HTMLInputElement;
    if (input.type === 'date') {
        return fillNativeDateInput(input, parsed);
    }

    if (input.type === 'month') {
        input.value = `${parsed.year}-${pad(parsed.month)}`;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        triggerReactChange(input, input.value);
        return true;
    }

    // Check for split date fields (separate month/day/year selects nearby)
    const splitResult = await fillSplitDateFields(element, parsed);
    if (splitResult) return true;

    // Check for date picker widgets
    const pickerResult = await fillDatePicker(element, parsed);
    if (pickerResult) return true;

    // Text input — detect expected format from placeholder, aria-label, or data attributes
    const format = detectExpectedFormat(element);
    const formatted = formatDate(parsed, format);

    input.value = formatted;
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    triggerReactChange(input, formatted);

    return true;
}

interface ParsedDate {
    year: number;
    month: number;
    day: number;
}

function parseDate(value: string): ParsedDate | null {
    // ISO format: YYYY-MM-DD
    const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
        return { year: parseInt(isoMatch[1]), month: parseInt(isoMatch[2]), day: parseInt(isoMatch[3]) };
    }

    // US format: MM/DD/YYYY or MM-DD-YYYY
    const usMatch = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (usMatch) {
        return { year: parseInt(usMatch[3]), month: parseInt(usMatch[1]), day: parseInt(usMatch[2]) };
    }

    // Try JavaScript Date
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
        return { year: parsed.getFullYear(), month: parsed.getMonth() + 1, day: parsed.getDate() };
    }

    return null;
}

function detectExpectedFormat(element: HTMLElement): DateFormat {
    const hints = [
        element.getAttribute('placeholder'),
        element.getAttribute('aria-label'),
        element.getAttribute('data-date-format'),
        element.getAttribute('data-format'),
        element.closest('[data-date-format]')?.getAttribute('data-date-format'),
        element.parentElement?.querySelector('label')?.textContent,
    ].filter(Boolean).join(' ').toLowerCase();

    if (hints.includes('mm/dd/yyyy') || hints.includes('mm/dd')) return 'MM/DD/YYYY';
    if (hints.includes('dd/mm/yyyy') || hints.includes('dd/mm')) return 'DD/MM/YYYY';
    if (hints.includes('yyyy-mm-dd') || hints.includes('iso')) return 'YYYY-MM-DD';
    if (hints.includes('mm-dd-yyyy')) return 'MM-DD-YYYY';
    if (hints.includes('yyyy/mm/dd')) return 'YYYY/MM/DD';
    if (hints.includes('mmm') || hints.includes('jan') || hints.includes('feb')) return 'MMM DD, YYYY';

    // Default to MM/DD/YYYY for US-focused healthcare apps
    return 'MM/DD/YYYY';
}

function formatDate(date: ParsedDate, format: DateFormat): string {
    switch (format) {
        case 'YYYY-MM-DD':
            return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
        case 'MM/DD/YYYY':
            return `${pad(date.month)}/${pad(date.day)}/${date.year}`;
        case 'DD/MM/YYYY':
            return `${pad(date.day)}/${pad(date.month)}/${date.year}`;
        case 'MM-DD-YYYY':
            return `${pad(date.month)}-${pad(date.day)}-${date.year}`;
        case 'YYYY/MM/DD':
            return `${date.year}/${pad(date.month)}/${pad(date.day)}`;
        case 'M/D/YYYY':
            return `${date.month}/${date.day}/${date.year}`;
        case 'MMM DD, YYYY': {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${months[date.month - 1]} ${pad(date.day)}, ${date.year}`;
        }
        default:
            return `${pad(date.month)}/${pad(date.day)}/${date.year}`;
    }
}

function pad(n: number): string {
    return n.toString().padStart(2, '0');
}

function fillNativeDateInput(input: HTMLInputElement, date: ParsedDate): boolean {
    // Native <input type="date"> expects YYYY-MM-DD
    const value = `${date.year}-${pad(date.month)}-${pad(date.day)}`;
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    triggerReactChange(input, value);
    return true;
}

async function fillSplitDateFields(element: HTMLElement, date: ParsedDate): Promise<boolean> {
    // Look for nearby month/day/year fields
    const container = element.closest('fieldset, .form-group, .date-group, [class*="date"], [class*="birth"]') || element.parentElement?.parentElement;
    if (!container) return false;

    const fields = container.querySelectorAll('select, input[type="text"], input[type="number"]');
    if (fields.length < 2) return false;

    let monthField: HTMLElement | null = null;
    let dayField: HTMLElement | null = null;
    let yearField: HTMLElement | null = null;

    for (const field of fields) {
        const el = field as HTMLElement;
        const hint = getFieldHint(el);

        if (hint.includes('month') || hint.includes('mm')) monthField = el;
        else if (hint.includes('day') || hint.includes('dd')) dayField = el;
        else if (hint.includes('year') || hint.includes('yyyy') || hint.includes('yy')) yearField = el;
    }

    if (!monthField && !yearField) return false;

    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    if (monthField) {
        if (monthField.tagName === 'SELECT') {
            const select = monthField as HTMLSelectElement;
            // Try numeric first, then name
            for (const opt of select.options) {
                const val = opt.value;
                const text = opt.textContent || '';
                if (val === String(date.month) || val === pad(date.month) ||
                    text.includes(MONTHS[date.month - 1]) || text === pad(date.month)) {
                    select.value = opt.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                }
            }
        } else {
            (monthField as HTMLInputElement).value = pad(date.month);
            monthField.dispatchEvent(new Event('change', { bubbles: true }));
            triggerReactChange(monthField, pad(date.month));
        }
    }

    if (dayField) {
        if (dayField.tagName === 'SELECT') {
            const select = dayField as HTMLSelectElement;
            for (const opt of select.options) {
                if (opt.value === String(date.day) || opt.value === pad(date.day)) {
                    select.value = opt.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                }
            }
        } else {
            (dayField as HTMLInputElement).value = pad(date.day);
            dayField.dispatchEvent(new Event('change', { bubbles: true }));
            triggerReactChange(dayField, pad(date.day));
        }
    }

    if (yearField) {
        if (yearField.tagName === 'SELECT') {
            const select = yearField as HTMLSelectElement;
            for (const opt of select.options) {
                if (opt.value === String(date.year)) {
                    select.value = opt.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                }
            }
        } else {
            (yearField as HTMLInputElement).value = String(date.year);
            yearField.dispatchEvent(new Event('change', { bubbles: true }));
            triggerReactChange(yearField, String(date.year));
        }
    }

    return true;
}

async function fillDatePicker(element: HTMLElement, date: ParsedDate): Promise<boolean> {
    // Check for common date picker libraries
    const container = element.closest('[class*="datepicker"], [class*="date-picker"], [class*="flatpickr"], [class*="react-datepicker"]');
    if (!container) return false;

    // Most date pickers accept value setting on the hidden input
    const hiddenInput = container.querySelector('input[type="hidden"]') as HTMLInputElement;
    if (hiddenInput) {
        hiddenInput.value = `${date.year}-${pad(date.month)}-${pad(date.day)}`;
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Also set the visible input
    const visibleInput = container.querySelector('input:not([type="hidden"])') as HTMLInputElement;
    if (visibleInput) {
        const format = detectExpectedFormat(visibleInput);
        visibleInput.value = formatDate(date, format);
        visibleInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
        visibleInput.dispatchEvent(new Event('change', { bubbles: true }));
        triggerReactChange(visibleInput, visibleInput.value);
    }

    return true;
}

function getFieldHint(el: HTMLElement): string {
    return [
        el.getAttribute('name'),
        el.getAttribute('id'),
        el.getAttribute('aria-label'),
        el.getAttribute('placeholder'),
        el.closest('label')?.textContent,
    ].filter(Boolean).join(' ').toLowerCase();
}
