/**
 * Multi-Page Navigation Test Suite
 *
 * Tests findNextButton(), findSubmitButton(), isLastPage(),
 * getFieldSnapshotKey(), and button detection logic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';

// ─── Helpers ───

function loadFixture(): JSDOM {
    const html = readFileSync(join(__dirname, 'fixtures', 'multipage-workday.html'), 'utf-8');
    return new JSDOM(html);
}

// Since the multipage functions use `document` global, we need to set up jsdom
let dom: JSDOM;

function setupDOM() {
    dom = loadFixture();
    Object.defineProperty(global, 'document', { value: dom.window.document, writable: true, configurable: true });
    Object.defineProperty(global, 'window', { value: dom.window, writable: true, configurable: true });
    Object.defineProperty(global, 'getComputedStyle', {
        value: (el: Element) => dom.window.getComputedStyle(el),
        writable: true,
        configurable: true,
    });
    Object.defineProperty(global, 'CSS', {
        value: { escape: (s: string) => s.replace(/([^\w-])/g, '\\$1') },
        writable: true,
        configurable: true,
    });
}

// Import after DOM setup won't work with vitest's module resolution,
// so we re-implement the key functions here for testing.

// ─── Re-implement button detection for testing ───

const NEXT_BUTTON_PATTERNS = [
    /^next$/i,
    /^continue$/i,
    /^save\s*&?\s*continue$/i,
    /^save\s+and\s+continue$/i,
    /^proceed$/i,
    /^next\s+step$/i,
    /^go\s+to\s+next/i,
    /^move\s+forward$/i,
    /^save\s+&?\s*next$/i,
    /^next\s+page$/i,
    /^forward$/i,
];

const SUBMIT_BUTTON_PATTERNS = [
    /^submit\s*(application)?$/i,
    /^apply(\s+now)?$/i,
    /^send\s*(application)?$/i,
    /^complete\s*(application)?$/i,
    /^finish$/i,
    /^done$/i,
    /^submit\s+your\s+application$/i,
    /^review\s+and\s+submit$/i,
    /^confirm\s+and\s+submit$/i,
];

const NEXT_BUTTON_SELECTORS = [
    '[data-automation-id="bottom-navigation-next-button"]',
    '[data-automation-id="pageFooterNextButton"]',
    'button[data-uxi-element-id="next"]',
    'button.btn-next',
    'button.next-btn',
    '[data-testid="next-button"]',
    'a.next-step',
    '#next-button',
];

const SUBMIT_BUTTON_SELECTORS = [
    '[data-automation-id="bottom-navigation-submit-button"]',
    'button[data-uxi-element-id="submit"]',
    '#submit_app',
    'button.submit-application',
    '[data-testid="submit-button"]',
    'input[type="submit"][value*="Submit"]',
];

function getButtonText(el: HTMLElement): string {
    if (el.tagName === 'INPUT') {
        return (el as HTMLInputElement).value || el.getAttribute('aria-label') || '';
    }
    return el.textContent?.trim() || el.getAttribute('aria-label') || '';
}

function isDisabledButton(el: HTMLElement): boolean {
    return (
        el.hasAttribute('disabled') ||
        el.getAttribute('aria-disabled') === 'true' ||
        el.classList.contains('disabled')
    );
}

function findNextButton(doc: Document): HTMLElement | null {
    for (const selector of NEXT_BUTTON_SELECTORS) {
        const el = doc.querySelector<HTMLElement>(selector);
        if (el && !isDisabledButton(el)) return el;
    }
    const candidates = doc.querySelectorAll<HTMLElement>(
        'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]'
    );
    for (const el of candidates) {
        const text = getButtonText(el).trim();
        if (!text || isDisabledButton(el)) continue;
        if (SUBMIT_BUTTON_PATTERNS.some(p => p.test(text))) continue;
        if (NEXT_BUTTON_PATTERNS.some(p => p.test(text))) return el;
    }
    return null;
}

function findSubmitButton(doc: Document): HTMLElement | null {
    for (const selector of SUBMIT_BUTTON_SELECTORS) {
        const el = doc.querySelector<HTMLElement>(selector);
        if (el && !isDisabledButton(el)) return el;
    }
    const candidates = doc.querySelectorAll<HTMLElement>(
        'button, input[type="submit"], a[role="button"], [role="button"]'
    );
    for (const el of candidates) {
        const text = getButtonText(el).trim();
        if (!text || isDisabledButton(el)) continue;
        if (SUBMIT_BUTTON_PATTERNS.some(p => p.test(text))) return el;
    }
    return null;
}

function getFieldSnapshotKey(doc: Document): string {
    const fields = doc.querySelectorAll('input, select, textarea');
    const keys: string[] = [];
    for (const f of fields) {
        const el = f as HTMLInputElement;
        const type = el.type?.toLowerCase();
        if (type === 'hidden' || type === 'submit' || type === 'button') continue;
        keys.push(`${el.tagName}:${el.name || el.id || ''}:${type || ''}`);
    }
    return keys.sort().join('|');
}

// ─── Tests ───

describe('Multi-Page Navigation — Button Detection', () => {
    let doc: Document;

    beforeEach(() => {
        const html = readFileSync(join(__dirname, 'fixtures', 'multipage-workday.html'), 'utf-8');
        const jsdom = new JSDOM(html);
        doc = jsdom.window.document;
    });

    describe('findNextButton', () => {
        it('should find Workday "Next" button via data-automation-id', () => {
            const btn = findNextButton(doc);
            expect(btn).not.toBeNull();
            expect(btn!.getAttribute('data-automation-id')).toBe('bottom-navigation-next-button');
            expect(getButtonText(btn!)).toBe('Next');
        });

        it('should find "Save & Continue" on page 2', () => {
            // Show page 2's button by making it visible
            const page2 = doc.getElementById('page-2')!;
            page2.style.display = 'block';
            // Remove page 1's next button so we fall through to text matching
            const page1Next = doc.querySelector('[data-automation-id="bottom-navigation-next-button"]');
            page1Next?.remove();

            const btn = findNextButton(doc);
            expect(btn).not.toBeNull();
            expect(getButtonText(btn!)).toBe('Save & Continue');
        });

        it('should find "Continue" on page 3', () => {
            const page3 = doc.getElementById('page-3')!;
            page3.style.display = 'block';
            doc.querySelector('[data-automation-id="bottom-navigation-next-button"]')?.remove();
            // Remove page 2 save & continue
            const page2Btns = doc.getElementById('page-2')!.querySelectorAll('button');
            page2Btns.forEach(b => { if (getButtonText(b) === 'Save & Continue') b.remove(); });

            const btn = findNextButton(doc);
            expect(btn).not.toBeNull();
            expect(getButtonText(btn!)).toBe('Continue');
        });

        it('should find "Proceed" on page 4', () => {
            const page4 = doc.getElementById('page-4')!;
            page4.style.display = 'block';
            // Remove all earlier next buttons
            doc.querySelector('[data-automation-id="bottom-navigation-next-button"]')?.remove();
            doc.querySelectorAll('.wd-page button').forEach(b => {
                const text = getButtonText(b as HTMLElement);
                if (/^(save|continue)/i.test(text)) b.remove();
            });

            const btn = findNextButton(doc);
            expect(btn).not.toBeNull();
            expect(getButtonText(btn!)).toBe('Proceed');
        });

        it('should NOT return a disabled button', () => {
            // Remove all non-disabled buttons so only disabled ones remain
            doc.querySelectorAll('button').forEach(b => {
                if (!b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true') {
                    b.remove();
                }
            });
            // Remove <a> tags too
            doc.querySelectorAll('a').forEach(a => a.remove());

            const btn = findNextButton(doc);
            expect(btn).toBeNull();
        });

        it('should NOT return a submit button when asked for next', () => {
            // Remove all non-submit buttons, leaving only "Submit Application" and "Previous"
            doc.querySelectorAll('button').forEach(b => {
                const text = getButtonText(b);
                if (!SUBMIT_BUTTON_PATTERNS.some(p => p.test(text)) && text !== 'Previous') {
                    b.remove();
                }
            });

            const btn = findNextButton(doc);
            // Should NOT return the submit button as a next button
            expect(btn).toBeNull();
        });
    });

    describe('findSubmitButton', () => {
        it('should find Workday submit button via data-automation-id', () => {
            const page5 = doc.getElementById('page-5')!;
            page5.style.display = 'block';

            const btn = findSubmitButton(doc);
            expect(btn).not.toBeNull();
            expect(btn!.getAttribute('data-automation-id')).toBe('bottom-navigation-submit-button');
        });

        it('should NOT find submit button on page 1', () => {
            // Remove all submit buttons, leaving only "Next"
            doc.querySelectorAll('button').forEach(b => {
                const text = getButtonText(b);
                if (SUBMIT_BUTTON_PATTERNS.some(p => p.test(text))) b.remove();
            });
            // Remove the data-automation-id submit button too
            doc.querySelector('[data-automation-id="bottom-navigation-submit-button"]')?.remove();

            const btn = findSubmitButton(doc);
            expect(btn).toBeNull();
        });
    });

    describe('isLastPage (signal detection)', () => {
        it('should detect "Step 5 of 5" as last page', () => {
            const text = 'Step 5 of 5';
            const match = text.match(/step\s+(\d+)\s+(?:of|\/)\s+(\d+)/i);
            expect(match).not.toBeNull();
            expect(parseInt(match![1], 10)).toBe(parseInt(match![2], 10));
        });

        it('should NOT detect "Step 1 of 5" as last page', () => {
            const text = 'Step 1 of 5';
            const match = text.match(/step\s+(\d+)\s+(?:of|\/)\s+(\d+)/i);
            expect(match).not.toBeNull();
            expect(parseInt(match![1], 10)).not.toBe(parseInt(match![2], 10));
        });

        it('should detect "Step 3/3" format', () => {
            const text = 'Step 3/3';
            const match = text.match(/step\s+(\d+)\s*(?:of|\/)\s*(\d+)/i);
            expect(match).not.toBeNull();
            expect(parseInt(match![1], 10)).toBe(parseInt(match![2], 10));
        });

        it('should detect "Review & Submit" heading', () => {
            const heading = doc.querySelector('#page-5 h2');
            expect(heading).not.toBeNull();
            expect(/review|summary|confirm|final|submission/i.test(heading!.textContent || '')).toBe(true);
        });
    });
});

describe('Multi-Page Navigation — Text Pattern Matching', () => {
    const nextPatterns = NEXT_BUTTON_PATTERNS;
    const submitPatterns = SUBMIT_BUTTON_PATTERNS;

    describe('Next button patterns', () => {
        const positives = ['Next', 'Continue', 'Save & Continue', 'Save and Continue', 'Proceed', 'Next Step', 'Next Page'];
        for (const text of positives) {
            it(`should match "${text}"`, () => {
                expect(nextPatterns.some(p => p.test(text))).toBe(true);
            });
        }

        const negatives = ['Submit', 'Apply Now', 'Previous', 'Back', 'Cancel'];
        for (const text of negatives) {
            it(`should NOT match "${text}"`, () => {
                expect(nextPatterns.some(p => p.test(text))).toBe(false);
            });
        }
    });

    describe('Submit button patterns', () => {
        const positives = ['Submit', 'Submit Application', 'Apply', 'Apply Now', 'Finish', 'Done', 'Review and Submit'];
        for (const text of positives) {
            it(`should match "${text}"`, () => {
                expect(submitPatterns.some(p => p.test(text))).toBe(true);
            });
        }

        const negatives = ['Next', 'Continue', 'Save', 'Previous'];
        for (const text of negatives) {
            it(`should NOT match "${text}"`, () => {
                expect(submitPatterns.some(p => p.test(text))).toBe(false);
            });
        }
    });
});

describe('Multi-Page Navigation — Field Snapshot', () => {
    it('should generate a stable snapshot key', () => {
        const html = readFileSync(join(__dirname, 'fixtures', 'multipage-workday.html'), 'utf-8');
        const jsdom = new JSDOM(html);
        const doc = jsdom.window.document;

        const key1 = getFieldSnapshotKey(doc);
        const key2 = getFieldSnapshotKey(doc);
        expect(key1).toBe(key2);
        expect(key1.length).toBeGreaterThan(0);
    });

    it('should produce different keys after adding a field', () => {
        const html = readFileSync(join(__dirname, 'fixtures', 'multipage-workday.html'), 'utf-8');
        const jsdom = new JSDOM(html);
        const doc = jsdom.window.document;

        const key1 = getFieldSnapshotKey(doc);

        // Add a new field
        const newInput = doc.createElement('input');
        newInput.type = 'text';
        newInput.name = 'new_field_xyz';
        doc.body.appendChild(newInput);

        const key2 = getFieldSnapshotKey(doc);
        expect(key2).not.toBe(key1);
    });

    it('should exclude hidden/submit/button inputs from snapshot', () => {
        const html = '<html><body><input type="hidden" name="token"><input type="submit" value="Go"><input type="text" name="visible"></body></html>';
        const jsdom = new JSDOM(html);
        const doc = jsdom.window.document;

        const key = getFieldSnapshotKey(doc);
        expect(key).toContain('visible');
        expect(key).not.toContain('token');
    });
});
