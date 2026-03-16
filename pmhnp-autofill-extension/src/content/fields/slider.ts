/**
 * Range slider handler.
 * Fills <input type="range"> elements by setting value and dispatching events.
 */
import { triggerReactChange } from '../filler';

/**
 * Fill a range slider (<input type="range">) with the given value.
 * Maps string values like "1-3 years" to numeric values within the slider range.
 */
export async function fillSlider(
    element: HTMLElement,
    value: string | number
): Promise<boolean> {
    const input = element as HTMLInputElement;
    if (input.type !== 'range') return false;

    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const step = parseFloat(input.step) || 1;

    let numericValue: number;

    if (typeof value === 'number') {
        numericValue = value;
    } else {
        // Try to extract a number from string values
        numericValue = extractNumericValue(value, min, max);
    }

    // Clamp to valid range
    numericValue = Math.max(min, Math.min(max, numericValue));

    // Snap to nearest step
    numericValue = Math.round((numericValue - min) / step) * step + min;

    // Set the value
    input.value = String(numericValue);

    // Dispatch input and change events
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    triggerReactChange(input, String(numericValue));

    return true;
}

/**
 * Extract a numeric value from a string description.
 * Handles values like "3-5 years", "$50k", "75%", etc.
 */
function extractNumericValue(value: string, min: number, max: number): number {
    // Direct number
    const direct = parseFloat(value);
    if (!isNaN(direct)) return direct;

    // Range like "3-5"
    const rangeMatch = value.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (rangeMatch) {
        return (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2;
    }

    // Just extract first number
    const numMatch = value.match(/(\d+)/);
    if (numMatch) return parseInt(numMatch[1]);

    // No number found — use midpoint
    return (min + max) / 2;
}
