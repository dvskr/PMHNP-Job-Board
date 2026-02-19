import { log, warn } from '@/shared/logger';
/**
 * Pre-fill Hooks — expand hidden sections and prepare the form for scanning.
 * 
 * Detects and clicks "+Add" type buttons for experience, education, etc.
 * Uses generic selectors — no ATS-specific code.
 */

// ─── Main pre-fill function ───

export async function runPreFillHooks(): Promise<void> {
    log('[PMHNP-Hooks] Running pre-fill hooks...');

    // 1. Click all "+Add" buttons to expand repeatable sections
    await expandRepeatableSections();

    // 2. Wait for DOM to settle
    await sleep(500);

    // 3. Scroll down to make sure all lazy-loaded content is visible
    await triggerLazyLoad();

    log('[PMHNP-Hooks] Pre-fill hooks complete');
}

// ─── Expand repeatable sections (Experience, Education, etc.) ───

async function expandRepeatableSections(): Promise<void> {
    // Workday section expansion is handled by the Workday handler (expandWorkdaySections)
    // which knows how many entries to create per section type.
    const url = window.location.href.toLowerCase();
    if (url.includes('myworkdayjobs.com') || url.includes('myworkday.com') || url.includes('workday.com')) {
        log('[PMHNP-Hooks] Skipping generic Add expansion — Workday handler manages sections');
        return;
    }

    // Common patterns for "Add" buttons across job application sites
    const addButtonSelectors = [
        'button[data-test="add-section"]',
        'button[data-test="add-experience"]',
        'button[data-test="add-education"]',
        'a.add-section',
        'button.add-section',
        // SmartRecruiters
        '[class*="add-button"]',
        '[class*="AddButton"]',
        // Generic patterns
        'button[aria-label*="Add"]',
        'a[aria-label*="Add"]',
    ];

    // Also find buttons by text content
    const allButtons = document.querySelectorAll('button, a[role="button"], [class*="btn"]');
    const addButtons: HTMLElement[] = [];

    allButtons.forEach(btn => {
        const text = btn.textContent?.trim() || '';
        // Match buttons like "+ Add", "Add Experience", "Add Education", etc.
        if (/^\+?\s*add\b/i.test(text) && text.length < 40) {
            addButtons.push(btn as HTMLElement);
        }
    });

    // Also try CSS selector matches
    for (const selector of addButtonSelectors) {
        try {
            document.querySelectorAll(selector).forEach(el => {
                if (!addButtons.includes(el as HTMLElement)) {
                    addButtons.push(el as HTMLElement);
                }
            });
        } catch { /* invalid selector — skip */ }
    }

    if (addButtons.length === 0) {
        log('[PMHNP-Hooks] No "+Add" buttons found');
        return;
    }

    log(`[PMHNP-Hooks] Found ${addButtons.length} "+Add" buttons`);

    for (const btn of addButtons) {
        try {
            const text = btn.textContent?.trim() || '';
            log(`[PMHNP-Hooks] Clicking: "${text}"`);
            btn.click();
            // NOTE: Do NOT also dispatchEvent — that causes a double-click, creating 2 sections
            await sleep(300);
        } catch (err) {
            warn('[PMHNP-Hooks] Failed to click button:', err);
        }
    }
}

// ─── Trigger lazy-loaded content ───

async function triggerLazyLoad(): Promise<void> {
    // Scroll to bottom and back to trigger any lazy-loaded form sections
    const originalScroll = window.scrollY;

    // Scroll down in steps
    const maxScroll = document.body.scrollHeight;
    const step = window.innerHeight;
    for (let pos = 0; pos < maxScroll; pos += step) {
        window.scrollTo(0, pos);
        await sleep(100);
    }

    // Scroll back to top
    window.scrollTo(0, originalScroll);
    await sleep(200);
}

// ─── Utility ───

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
