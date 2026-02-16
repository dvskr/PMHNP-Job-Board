/**
 * Conditional / Dependent field handler.
 * Handles fields that appear or change based on the value of another field.
 * Example: "Do you have a DEA number?" → Yes → DEA Number input appears.
 */

/**
 * Trigger a conditional field by setting a parent field value and waiting for
 * dependent fields to appear.
 */
export async function handleConditionalField(
    triggerElement: HTMLElement,
    triggerValue: string | boolean,
    waitForSelector?: string,
    timeoutMs: number = 3000
): Promise<HTMLElement[]> {
    // 1. Set the trigger value
    await setTriggerValue(triggerElement, triggerValue);

    // 2. Wait for dependent fields to appear
    if (waitForSelector) {
        return waitForElements(waitForSelector, timeoutMs);
    }

    // 3. If no selector provided, wait briefly and check for new elements
    await sleep(500);
    return [];
}

/**
 * Common conditional patterns in healthcare/PMHNP applications.
 * Maps trigger fields to their expected dependent fields.
 */
export const CONDITIONAL_PATTERNS: {
    triggerPattern: RegExp;
    yesValue: string;
    dependentSelectors: string[];
}[] = [
        {
            triggerPattern: /do you have a (?:dea|DEA)/i,
            yesValue: 'Yes',
            dependentSelectors: ['input[name*="dea" i]', 'input[id*="dea" i]'],
        },
        {
            triggerPattern: /do you require (?:visa |work )?sponsor/i,
            yesValue: 'Yes',
            dependentSelectors: ['select[name*="visa" i]', 'input[name*="visa" i]'],
        },
        {
            triggerPattern: /do you have (?:a )?(?:collaborative|collaborating)/i,
            yesValue: 'Yes',
            dependentSelectors: ['input[name*="physician" i]', 'input[name*="collaborat" i]'],
        },
        {
            triggerPattern: /(?:prescriptive|prescribing) authority/i,
            yesValue: 'Yes',
            dependentSelectors: ['input[name*="prescri" i]', 'select[name*="schedule" i]'],
        },
        {
            triggerPattern: /(?:malpractice|liability) (?:claim|history)/i,
            yesValue: 'No',
            dependentSelectors: ['textarea[name*="claim" i]', 'input[name*="details" i]'],
        },
        {
            triggerPattern: /are you (?:currently|legally) (?:authorized|eligible)/i,
            yesValue: 'Yes',
            dependentSelectors: [],
        },
        {
            triggerPattern: /have you (?:ever )?been (?:convicted|charged)/i,
            yesValue: 'No',
            dependentSelectors: ['textarea[name*="explain" i]', 'textarea[name*="details" i]'],
        },
        {
            triggerPattern: /do you have (?:a )?(?:disability|disabilities)/i,
            yesValue: 'I do not wish to answer',
            dependentSelectors: [],
        },
        {
            triggerPattern: /telehealth (?:experience|capable)/i,
            yesValue: 'Yes',
            dependentSelectors: ['input[name*="platform" i]', 'select[name*="platform" i]'],
        },
    ];

/**
 * Check if a field is a conditional trigger and return the appropriate pattern match.
 */
export function getConditionalPattern(fieldLabel: string): typeof CONDITIONAL_PATTERNS[number] | null {
    const normalizedLabel = fieldLabel.toLowerCase().trim();
    return CONDITIONAL_PATTERNS.find(p => p.triggerPattern.test(normalizedLabel)) || null;
}

// ─── Helpers ───

async function setTriggerValue(element: HTMLElement, value: string | boolean): Promise<void> {
    const tag = element.tagName.toLowerCase();

    if (tag === 'select') {
        const select = element as HTMLSelectElement;
        const targetValue = String(value);

        for (const option of select.options) {
            if (option.textContent?.trim().toLowerCase() === targetValue.toLowerCase() ||
                option.value.toLowerCase() === targetValue.toLowerCase()) {
                select.value = option.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                break;
            }
        }
        return;
    }

    if (tag === 'input') {
        const input = element as HTMLInputElement;

        if (input.type === 'radio' || input.type === 'checkbox') {
            const targetValue = typeof value === 'boolean' ? value : value.toLowerCase() === 'yes';
            input.checked = targetValue;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.click();
            return;
        }

        input.value = String(value);
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

async function waitForElements(selector: string, timeoutMs: number): Promise<HTMLElement[]> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        const elements = document.querySelectorAll(selector);
        const visible: HTMLElement[] = [];

        for (const el of elements) {
            if (el instanceof HTMLElement) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    visible.push(el);
                }
            }
        }

        if (visible.length > 0) return visible;
        await sleep(200);
    }

    return [];
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
