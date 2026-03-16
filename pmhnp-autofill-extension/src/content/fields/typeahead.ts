/**
 * Typeahead / Autocomplete field handler.
 * Handles fields where you type to search and then select from a dropdown.
 * Common in: Workday (location, job title), Greenhouse (school name), ADP.
 */
import { triggerReactChange } from '../filler';

export interface TypeaheadConfig {
    /** Delay after typing before checking for dropdown */
    typingDelay: number;
    /** Maximum time to wait for dropdown to appear */
    dropdownTimeout: number;
    /** Selector for dropdown options */
    optionSelector: string;
    /** Whether to clear existing value before typing */
    clearFirst: boolean;
}

const DEFAULT_CONFIG: TypeaheadConfig = {
    typingDelay: 100,
    dropdownTimeout: 3000,
    optionSelector: '[role="option"], [role="listbox"] li, .autocomplete-option, .typeahead-option, .suggestions li, .dropdown-item, ul[class*="suggest"] li, [class*="menu-item"], [class*="option"]',
    clearFirst: true,
};

/**
 * Fill a typeahead/autocomplete field by simulating user input and selecting
 * the best matching option from the dropdown.
 */
export async function fillTypeahead(
    element: HTMLElement,
    value: string,
    config: Partial<TypeaheadConfig> = {}
): Promise<boolean> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const input = element as HTMLInputElement;

    if (!value) return false;

    // 1. Focus and clear
    input.focus();
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    if (cfg.clearFirst) {
        input.value = '';
        triggerReactChange(input, '');
    }

    // 2. Type character by character (first few chars to trigger search)
    const searchText = value.substring(0, Math.min(value.length, 5));
    for (const char of searchText) {
        input.value += char;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: char }));
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: char }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: char }));
        triggerReactChange(input, input.value);
        await sleep(cfg.typingDelay);
    }

    // 3. Wait for dropdown to appear
    const dropdown = await waitForDropdown(element, cfg);
    if (!dropdown) {
        // No dropdown appeared — try full value and hope for the best
        input.value = value;
        triggerReactChange(input, value);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    // 4. Find best matching option
    const best = findBestMatch(dropdown, value);
    if (best) {
        // Click the option
        best.scrollIntoView({ block: 'nearest' });
        best.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        best.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        best.click();
        await sleep(100);
        return true;
    }

    // 5. Fallback: press Enter to accept top suggestion
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
    await sleep(100);
    return true;
}

async function waitForDropdown(
    element: HTMLElement,
    config: TypeaheadConfig
): Promise<HTMLElement[] | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < config.dropdownTimeout) {
        // Search near the element and in the document body
        const options = findDropdownOptions(element, config.optionSelector);
        if (options.length > 0) return options;
        await sleep(200);
    }

    return null;
}

function findDropdownOptions(element: HTMLElement, selector: string): HTMLElement[] {
    const options: HTMLElement[] = [];

    // Check siblings and nearby containers
    const parent = element.closest('[class*="typeahead"], [class*="autocomplete"], [class*="combobox"], [role="combobox"], [class*="search"]');
    if (parent) {
        const found = parent.querySelectorAll(selector);
        for (const opt of found) {
            if (opt instanceof HTMLElement && isVisible(opt)) {
                options.push(opt);
            }
        }
    }

    // Also check document-level popover/portal dropdowns
    const portals = document.querySelectorAll('[role="listbox"], [class*="dropdown-menu"], [class*="suggestions"], [class*="popover"], [class*="portal"]');
    for (const portal of portals) {
        if (portal instanceof HTMLElement && isVisible(portal)) {
            const found = portal.querySelectorAll(selector);
            for (const opt of found) {
                if (opt instanceof HTMLElement && isVisible(opt)) {
                    options.push(opt);
                }
            }

            // If the portal itself matches, add its children
            if (options.length === 0) {
                const children = portal.children;
                for (const child of children) {
                    if (child instanceof HTMLElement && isVisible(child)) {
                        options.push(child);
                    }
                }
            }
        }
    }

    return options;
}

function findBestMatch(options: HTMLElement[], value: string): HTMLElement | null {
    const normalizedValue = value.toLowerCase().trim();
    let bestMatch: HTMLElement | null = null;
    let bestScore = 0;

    for (const option of options) {
        const text = (option.textContent || '').toLowerCase().trim();
        if (!text) continue;

        // Exact match
        if (text === normalizedValue) return option;

        // Starts with
        if (text.startsWith(normalizedValue)) {
            const score = normalizedValue.length / text.length + 0.5;
            if (score > bestScore) {
                bestScore = score;
                bestMatch = option;
            }
            continue;
        }

        // Contains
        if (text.includes(normalizedValue)) {
            const score = normalizedValue.length / text.length + 0.3;
            if (score > bestScore) {
                bestScore = score;
                bestMatch = option;
            }
            continue;
        }

        // Value contains option text
        if (normalizedValue.includes(text)) {
            const score = text.length / normalizedValue.length + 0.2;
            if (score > bestScore) {
                bestScore = score;
                bestMatch = option;
            }
        }
    }

    return bestMatch;
}

function isVisible(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
