import type { AIGenerateRequest, AIFillResult, JobContext, MappedField } from '@/shared/types';
import { generateAnswer, generateBulkAnswers } from '@/shared/api';
import { AI_RESPONSE_LENGTHS } from '@/shared/constants';
import { getSettings } from '@/shared/storage';
import { triggerReactChange } from './filler';

/**
 * Extracts job context from the current page DOM.
 */
export function extractJobContext(): JobContext {
    // Try to find job title
    let jobTitle = '';
    const titleSelectors = [
        'h1', '.job-title', '[class*="job-title"]', '[class*="jobTitle"]',
        '[data-automation-id="jobTitle"]', '.posting-headline h2',
    ];
    for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
            jobTitle = el.textContent.trim();
            break;
        }
    }

    // Try to find employer name
    let employerName = '';
    const employerSelectors = [
        '.company-name', '[class*="company"]', '[class*="employer"]',
        '[data-automation-id="companyName"]', '.posting-categories .company',
    ];
    for (const selector of employerSelectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
            employerName = el.textContent.trim();
            break;
        }
    }

    // Try to find job description
    let jobDescription = '';
    const descSelectors = [
        '.job-description', '[class*="job-description"]', '[class*="jobDescription"]',
        '[data-automation-id="jobDescription"]', '.posting-page .content',
        '#job-description', 'article',
    ];
    for (const selector of descSelectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim() && el.textContent.trim().length > 100) {
            jobDescription = el.textContent.trim().substring(0, 3000); // Cap at 3k chars
            break;
        }
    }

    // Fallback: try meta tags
    if (!jobTitle) {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        jobTitle = ogTitle?.getAttribute('content') || document.title || '';
    }
    if (!employerName) {
        const ogSiteName = document.querySelector('meta[property="og:site_name"]');
        employerName = ogSiteName?.getAttribute('content') || '';
    }

    return {
        jobTitle,
        employerName,
        jobDescription,
        pageUrl: window.location.href,
    };
}

/**
 * Fills open-ended text fields using AI-generated answers.
 */
export async function fillWithAI(
    openEndedFields: MappedField[],
    jobContext: JobContext
): Promise<AIFillResult> {
    const settings = await getSettings();
    const maxLength = AI_RESPONSE_LENGTHS[settings.aiResponseLength] || 300;

    const result: AIFillResult = {
        total: openEndedFields.length,
        generated: 0,
        failed: 0,
        rateLimited: false,
        details: [],
    };

    if (openEndedFields.length === 0) return result;

    // Build requests
    const requests: AIGenerateRequest[] = openEndedFields.map((mapped) => ({
        questionText: mapped.field.label || mapped.field.placeholder || mapped.field.ariaLabel || 'Unknown question',
        questionKey: mapped.field.identifier,
        jobTitle: jobContext.jobTitle,
        jobDescription: jobContext.jobDescription,
        employerName: jobContext.employerName,
        maxLength,
    }));

    try {
        // Use bulk endpoint for efficiency if multiple questions
        let responses;
        if (requests.length > 1) {
            responses = await generateBulkAnswers(requests);
        } else {
            const single = await generateAnswer(requests[0]);
            responses = [single];
        }

        // Apply answers to form fields
        for (let i = 0; i < openEndedFields.length; i++) {
            const mapped = openEndedFields[i];
            const response = responses[i];

            if (!response?.answer) {
                result.failed++;
                result.details.push({
                    questionText: requests[i].questionText,
                    answer: null,
                    status: 'failed',
                });
                continue;
            }

            try {
                // Fill the textarea
                const el = mapped.field.element;
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await sleep(100);

                triggerReactChange(el, response.answer);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

                result.generated++;
                result.details.push({
                    questionText: requests[i].questionText,
                    answer: response.answer,
                    status: response.basedOnStoredResponse ? 'stored' : 'generated',
                });
            } catch {
                result.failed++;
                result.details.push({
                    questionText: requests[i].questionText,
                    answer: response.answer,
                    status: 'failed',
                });
            }

            await sleep(200);
        }
    } catch (err) {
        if (err instanceof Error && err.message.includes('Rate limited')) {
            result.rateLimited = true;
            for (const req of requests) {
                result.details.push({
                    questionText: req.questionText,
                    answer: null,
                    status: 'rate_limited',
                });
            }
        } else {
            for (const req of requests) {
                result.failed++;
                result.details.push({
                    questionText: req.questionText,
                    answer: null,
                    status: 'failed',
                });
            }
        }
    }

    return result;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
