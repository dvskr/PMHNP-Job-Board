/**
 * AI Field Classifier
 * 
 * Handles "surprise" fields that our static pattern dictionary doesn't recognize.
 * Batches unknown fields, sends them to the backend classify-fields endpoint,
 * and returns MappedField entries ready for the filler pipeline.
 * 
 * v2: Sends surrounding HTML context for better accuracy.
 *     Caches AI mappings per-domain to skip repeated API calls.
 */

import type { DetectedField, MappedField, ProfileData } from '@/shared/types';
import { classifyFields } from '@/shared/api';
import { extractJobContext } from './ai';
import { log, warn } from '@/shared/logger';

export interface ClassifiedResult {
    index: number;
    identifier: string;
    profileKey: string | null;
    value: string;
    confidence: number;
    isQuestion: boolean;
}

// ─── Domain-Level AI Cache ───

const CACHE_PREFIX = 'ai_cache_';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedMapping {
    identifier: string;
    profileKey: string | null;
    confidence: number;
    isQuestion: boolean;
    cachedAt: number;
}

/** Build a stable cache key for a field based on its attributes (not value) */
function fieldCacheKey(field: DetectedField): string {
    return [
        field.label || '',
        field.element.getAttribute('name') || '',
        field.element.id || '',
        field.fieldType,
    ].join('|').toLowerCase();
}

/** Load cached AI mappings for the current domain */
async function loadDomainCache(): Promise<Record<string, CachedMapping>> {
    const domain = window.location.hostname;
    const key = `${CACHE_PREFIX}${domain}`;
    try {
        const result = await chrome.storage.local.get(key);
        const cache = result[key] as Record<string, CachedMapping> | undefined;
        if (!cache) return {};
        // Prune expired entries
        const now = Date.now();
        const pruned: Record<string, CachedMapping> = {};
        for (const [k, v] of Object.entries(cache)) {
            if (now - v.cachedAt < CACHE_TTL_MS) pruned[k] = v;
        }
        return pruned;
    } catch {
        return {};
    }
}

/** Save AI mappings to domain cache */
async function saveDomainCache(cache: Record<string, CachedMapping>): Promise<void> {
    const domain = window.location.hostname;
    const key = `${CACHE_PREFIX}${domain}`;
    try {
        await chrome.storage.local.set({ [key]: cache });
    } catch {
        // Storage full or unavailable — silently skip
    }
}

// ─── HTML Context Extraction ───

/** Extract surrounding HTML context for a field to help AI classification */
function extractFieldContext(el: HTMLElement): string {
    const parts: string[] = [];

    // 1. Fieldset legend (section context)
    const fieldset = el.closest('fieldset');
    if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend) parts.push(`section: ${legend.textContent?.trim()}`);
    }

    // 2. Closest heading above the field
    let ancestor = el.parentElement;
    for (let i = 0; ancestor && i < 6; i++) {
        const heading = ancestor.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading && !heading.contains(el)) {
            parts.push(`heading: ${heading.textContent?.trim()}`);
            break;
        }
        ancestor = ancestor.parentElement;
    }

    // 3. Adjacent text (prev sibling or parent text nodes)
    const prev = el.previousElementSibling;
    if (prev && prev.textContent) {
        const text = prev.textContent.trim();
        if (text.length > 0 && text.length < 150) {
            parts.push(`adjacent: ${text}`);
        }
    }

    // 4. data-* attributes that might hint at field purpose
    for (const attr of el.attributes) {
        if (attr.name.startsWith('data-') && attr.value && attr.name !== 'data-reactid') {
            parts.push(`${attr.name}: ${attr.value}`);
        }
    }

    return parts.join(' | ');
}

/**
 * Takes fields that the detector tagged as "unknown" or low-confidence,
 * sends them to the AI classifier, and returns filled MappedField entries.
 * Uses domain-level caching to avoid repeat API calls.
 */
export async function classifyUnknownFields(
    unknownFields: DetectedField[],
    profile: ProfileData
): Promise<MappedField[]> {
    if (unknownFields.length === 0) return [];

    log(`[PMHNP-AI] Classifying ${unknownFields.length} unknown field(s)...`);

    // Load domain cache and check for hits
    const cache = await loadDomainCache();
    const cachedResults: MappedField[] = [];
    const uncachedFields: DetectedField[] = [];
    const uncachedIndices: number[] = [];

    for (let i = 0; i < unknownFields.length; i++) {
        const field = unknownFields[i];
        const cacheKey = fieldCacheKey(field);
        const cached = cache[cacheKey];

        if (cached && cached.confidence >= 0.3) {
            log(`[PMHNP-AI] Cache hit: "${cacheKey}" → ${cached.profileKey || cached.identifier}`);
            let fillMethod: MappedField['fillMethod'] = 'text';
            if (field.fieldType === 'select') fillMethod = 'select';
            else if (field.fieldType === 'radio') fillMethod = 'radio';
            else if (field.fieldType === 'checkbox') fillMethod = 'checkbox';

            cachedResults.push({
                field,
                profileKey: cached.profileKey || cached.identifier,
                value: '', // Will be resolved by the fill pipeline
                fillMethod,
                requiresAI: cached.isQuestion,
                requiresFile: false,
                documentType: null,
                confidence: cached.confidence,
                status: 'no_data', // Value needs resolution
            });
        } else {
            uncachedFields.push(field);
            uncachedIndices.push(i);
        }
    }

    if (uncachedFields.length === 0) {
        log(`[PMHNP-AI] All ${unknownFields.length} fields resolved from cache`);
        return cachedResults;
    }

    log(`[PMHNP-AI] ${cachedResults.length} cache hits, ${uncachedFields.length} need AI classification`);

    const jobContext = extractJobContext();

    // Prepare fields for the API — include surrounding HTML context
    const fieldsToClassify = uncachedFields.map((field) => ({
        label: field.label || '',
        placeholder: field.placeholder || '',
        attributes: {
            name: field.element.getAttribute('name') || '',
            id: field.element.id || '',
            'aria-label': field.element.getAttribute('aria-label') || '',
            'data-automation-id': field.element.getAttribute('data-automation-id') || '',
        },
        fieldType: field.fieldType,
        options: field.options || [],
        context: extractFieldContext(field.element), // NEW: surrounding HTML context
    }));

    try {
        const result = await classifyFields({
            fields: fieldsToClassify,
            jobTitle: jobContext.jobTitle,
            jobDescription: jobContext.jobDescription,
            employerName: jobContext.employerName,
        });

        log(`[PMHNP-AI] Classification complete: ${result.classified.length} fields classified${result.resumeUsed ? ' (resume used)' : ''}`);

        // Convert classified results back to MappedField entries + update cache
        const mappedFields: MappedField[] = [];

        for (const classified of result.classified) {
            const field = uncachedFields[classified.index];
            if (!field || classified.confidence < 0.2) continue;

            // Determine fill method
            let fillMethod: MappedField['fillMethod'] = 'text';
            if (field.fieldType === 'select') fillMethod = 'select';
            else if (field.fieldType === 'radio') fillMethod = 'radio';
            else if (field.fieldType === 'checkbox') fillMethod = 'checkbox';

            const mapped: MappedField = {
                field,
                profileKey: classified.profileKey || classified.identifier,
                value: classified.value || '',
                fillMethod,
                requiresAI: classified.isQuestion,
                requiresFile: false,
                documentType: null,
                confidence: classified.confidence,
                status: classified.value ? 'ready' : 'no_data',
            };

            mappedFields.push(mapped);

            // Cache this mapping for future visits
            const cacheKey = fieldCacheKey(field);
            cache[cacheKey] = {
                identifier: classified.identifier,
                profileKey: classified.profileKey,
                confidence: classified.confidence,
                isQuestion: classified.isQuestion,
                cachedAt: Date.now(),
            };
        }

        // Persist cache updates
        await saveDomainCache(cache);

        return [...cachedResults, ...mappedFields];
    } catch (err) {
        console.error('[PMHNP-AI] Classification failed:', err);
        return cachedResults; // Return cached results even if API fails
    }
}

