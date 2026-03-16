/**
 * Universal Screening Question Filler
 *
 * Finds screening questions on any ATS page using visual text scanning,
 * resolves answers via the screening-resolver, and fills them using
 * DOM interaction (clicking radio options, filling dropdowns/text inputs).
 *
 * Works across all ATS platforms — not tied to any specific one.
 */

import { resolveScreeningAnswer, matchesDegree } from './screening-resolver';
import { triggerReactChange } from './filler';
import { log, warn } from '@/shared/logger';

// ─── Shadow DOM Traversal ───

function deepQueryAll<T extends Element = Element>(selector: string, root: ParentNode = document): T[] {
    const results: T[] = [];
    results.push(...Array.from(root.querySelectorAll<T>(selector)));
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) results.push(...deepQueryAll<T>(selector, el.shadowRoot));
    }
    return results;
}

// ─── Text Helpers ───

/** Get direct text content of an element (excluding deeply nested children) */
function getDirectTextContent(el: HTMLElement): string {
    let text = '';
    for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const child = node as HTMLElement;
            if (['SPAN', 'STRONG', 'EM', 'B', 'I', 'A', 'LABEL'].includes(child.tagName)) {
                text += child.textContent || '';
            }
        }
    }
    return text.trim() || el.textContent?.trim() || '';
}

/** Find all visible elements containing the given text */
function findAllVisibleByText(searchText: string): HTMLElement[] {
    const results: HTMLElement[] = [];
    const all = deepQueryAll<HTMLElement>('label, span, div, p, a, button, li, td');
    const needle = searchText.toLowerCase();

    for (const el of all) {
        const text = el.textContent?.trim().toLowerCase() || '';
        if (!text) continue;
        // Short text that matches (e.g., "Yes", "No")
        if (text.length <= 10 && text.includes(needle)) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                results.push(el);
            }
        }
    }
    return results;
}

/** Get the label text for a radio input */
function getRadioLabel(radio: HTMLInputElement): string {
    // 1. <label for="id">
    if (radio.id) {
        const label = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
        if (label) return label.textContent?.trim() || '';
    }

    // 2. Parent label
    const parentLabel = radio.closest('label');
    if (parentLabel) {
        const clone = parentLabel.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('input').forEach(el => el.remove());
        return clone.textContent?.trim() || '';
    }

    // 3. Adjacent sibling
    const next = radio.nextElementSibling || radio.nextSibling;
    if (next) {
        const text = (next as HTMLElement).textContent?.trim() || '';
        if (text) return text;
    }

    // 4. Value attribute
    return radio.value || '';
}

// ─── DOM Interaction Helpers ───

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Find clickable "Yes" or "No" element near a question using visual proximity */
function findClickableOption(questionEl: HTMLElement, questionY: number, answer: string): HTMLElement | null {
    const candidates = findAllVisibleByText(answer);
    let best: HTMLElement | null = null;
    let bestDist = 300;

    for (const el of candidates) {
        const text = el.textContent?.trim() || '';
        if (text.length > 10) continue;

        const rect = el.getBoundingClientRect();
        const dist = rect.top - questionY;
        if (dist < -20 || dist > bestDist) continue;

        if (dist < bestDist) {
            bestDist = dist;
            best = el;
        }
    }

    // Backup: standard radio inputs
    if (!best) {
        const radioEls = deepQueryAll<HTMLElement>('input[type="radio"], [role="radio"], [role="option"]');
        for (const el of radioEls) {
            const label = getRadioLabel(el as HTMLInputElement);
            if (label.toLowerCase() !== answer.toLowerCase()) continue;
            const rect = el.getBoundingClientRect();
            const dist = rect.top - questionY;
            if (dist >= -20 && dist < bestDist) {
                bestDist = dist;
                best = el;
            }
        }
    }

    return best;
}

/** Find the nearest visible input field below a question */
function findNearestInput(questionY: number, _questionEl: HTMLElement): HTMLInputElement | null {
    const allInputs = deepQueryAll<HTMLInputElement>('input');
    let best: HTMLInputElement | null = null;
    let bestDist = 200;

    // Standard form field identifiers — screening-filler should never touch these
    const STANDARD_FIELD_RE = /first|last|name|email|phone|zip|postal|city|state|address|street|country|password|username|login|company|employer/i;

    for (const input of allInputs) {
        const type = input.type?.toLowerCase();
        if (type === 'hidden' || type === 'file' || type === 'checkbox' || type === 'radio' || type === 'submit') continue;

        const rect = input.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        // Skip inputs that belong to standard form fields (by name, id, or aria-label)
        const fieldId = `${input.name || ''} ${input.id || ''} ${input.getAttribute('aria-label') || ''}`;
        if (STANDARD_FIELD_RE.test(fieldId)) continue;

        // Skip inputs that already have a value
        if (input.value && input.value.trim().length > 0) continue;

        const dist = rect.top - questionY;
        if (dist > 0 && dist < bestDist) {
            bestDist = dist;
            best = input;
        }
    }

    return best;
}

/** Click a Yes/No radio-like option near a question */
async function clickRadioAnswer(
    question: { text: string; el: HTMLElement; y: number },
    answer: string,
    label: string
): Promise<boolean> {
    log(`[PMHNP]   → ${label}: ${answer}`);
    const clickTarget = findClickableOption(question.el, question.y, answer);
    if (clickTarget) {
        clickTarget.click();
        clickTarget.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(200);
        log(`[PMHNP]   ✅ Clicked "${answer}" for "${question.text.substring(0, 50)}..."`);
        return true;
    } else {
        log(`[PMHNP]   ❌ Could not find "${answer}" option for "${question.text.substring(0, 50)}..."`);
        return false;
    }
}

/** Fill a dropdown by typing and clicking a matching option */
async function fillDropdown(
    input: HTMLInputElement,
    value: string
): Promise<boolean> {
    log(`[PMHNP]   Filling dropdown: "${value}"`);
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    triggerReactChange(input, value);
    await sleep(1000);

    // Click matching dropdown option
    const options = deepQueryAll<HTMLElement>('[role="option"], [role="listbox"] li, [class*="option"], [class*="suggestion"]');
    log(`[PMHNP]   → dropdown options found: ${options.length}`);

    for (const opt of options) {
        const optText = opt.textContent?.trim() || '';
        if (optText && matchesDegree(optText, value)) {
            opt.click();
            log(`[PMHNP]   ✅ Selected: "${optText}"`);
            return true;
        }
    }

    log(`[PMHNP]   ❌ No dropdown option matched "${value}"`);
    return false;
}

/** Fill a text input with a value */
async function fillTextInput(
    input: HTMLInputElement,
    value: string
): Promise<boolean> {
    log(`[PMHNP]   Filling text: "${value}"`);
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    triggerReactChange(input, value);
    log(`[PMHNP]   ✅ Set value: "${value}"`);
    return true;
}

// ─── Main: Universal Screening Question Filler ───

/**
 * Find and fill screening questions on the current page.
 * Works for any ATS — uses visual text scanning and proximity-based DOM interaction.
 *
 * @param profile - Raw profile response from the API (not the flat AutofillProfile)
 * @returns Number of fields successfully filled
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fillScreeningQuestions(profile: any): Promise<number> {
    log('[PMHNP] === Universal Screening Questions Fill ===');

    // Step 1: Find all visible question-like text blocks on the page
    const allElements = deepQueryAll<HTMLElement>('*');
    const questionBlocks: { text: string; el: HTMLElement; y: number }[] = [];

    for (const el of allElements) {
        if (el.children.length > 5) continue;
        const text = el.textContent?.trim() || '';
        if (text.length < 15 || text.length > 300) continue;
        if (!/\?|authorized|license|certification|experience|education|years|sponsor|felony|conviction|background|drug|salary|available/i.test(text)) continue;
        const directText = getDirectTextContent(el);
        if (directText.length < 10) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        questionBlocks.push({ text: directText, el, y: rect.top });
    }

    // Step 2: Deduplicate by text + y-position
    const uniqueQuestions: typeof questionBlocks = [];
    for (const q of questionBlocks) {
        const isDupe = uniqueQuestions.some(u =>
            u.text === q.text && Math.abs(u.y - q.y) < 40
        );
        if (!isDupe) uniqueQuestions.push(q);
    }

    if (uniqueQuestions.length === 0) {
        log('[PMHNP] No screening questions found on this page');
        return 0;
    }

    log(`[PMHNP] Found ${questionBlocks.length} raw → ${uniqueQuestions.length} unique question blocks`);
    for (const q of uniqueQuestions) {
        log(`[PMHNP]   Q: "${q.text.substring(0, 80)}..." at y=${Math.round(q.y)}`);
    }

    // Step 3: Debug log profile data available
    const p = profile?.personal || profile || {};
    const edu0 = (profile?.education || [])[0] || {};
    log(`[PMHNP] Screening profile data:`);
    log(`[PMHNP]   yearsExperience: "${p.yearsExperience}" (type: ${typeof p.yearsExperience})`);
    log(`[PMHNP]   specialties: [${(p.specialties || []).join(', ')}]`);
    log(`[PMHNP]   education[0].degreeType: "${edu0.degreeType || '(empty)'}"`);
    log(`[PMHNP]   education array length: ${(profile?.education || []).length}`);

    // Step 4: Resolve and fill each question
    let fixed = 0;
    const answeredYs: number[] = [];

    for (const question of uniqueQuestions) {
        // Skip already-answered questions (by y-position proximity)
        if (answeredYs.some(ay => Math.abs(ay - question.y) < 40)) continue;

        const { answer, field, interaction } = resolveScreeningAnswer(question.text, profile);

        if (field === 'unknown') {
            log(`[PMHNP]   → unmatched question: "${question.text.substring(0, 60)}"`);
            continue;
        }

        if (!answer) {
            log(`[PMHNP]   → ${field}: no answer available`);
            continue;
        }

        log(`[PMHNP]   → ${field}: "${answer}" (${interaction})`);

        if (interaction === 'radio') {
            if (await clickRadioAnswer(question, answer, field)) {
                fixed++;
                answeredYs.push(question.y);
            }
        } else if (interaction === 'dropdown') {
            const input = findNearestInput(question.y, question.el);
            if (input && !input.value) {
                if (await fillDropdown(input, answer)) {
                    fixed++;
                }
                answeredYs.push(question.y);
            } else {
                log(`[PMHNP]   → findNearestInput: ${input ? `already has value "${input.value}"` : 'not found'}`);
            }
        } else if (interaction === 'text') {
            const input = findNearestInput(question.y, question.el);
            if (input && !input.value) {
                if (await fillTextInput(input, answer)) {
                    fixed++;
                }
                answeredYs.push(question.y);
            } else {
                log(`[PMHNP]   → findNearestInput: ${input ? `already has value "${input.value}"` : 'not found'}`);
            }
        }
    }

    log(`[PMHNP] === Screening Questions: ${fixed} fields fixed ===`);
    return fixed;
}
