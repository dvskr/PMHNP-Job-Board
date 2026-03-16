/**
 * Profile Registry — Central hub for managing industry-specific field patterns.
 *
 * ## Architecture
 *
 * The profile system has two layers:
 * 1. **Core patterns** — Always active. Cover universal fields (name, email, etc.)
 * 2. **Industry patterns** — Optional overlay. Add profession-specific fields.
 *
 * When building the final pattern set:
 * - Industry patterns are prepended (higher priority)
 * - Core patterns serve as the fallback base
 * - This means industry-specific patterns (e.g., /npi/i → npiNumber)
 *   take precedence over any generic pattern that might also match.
 *
 * ## Usage
 *
 * ```ts
 * const patterns = getActiveFieldPatterns('healthcare');
 * // Returns: [...healthcareFieldMap, ...coreFieldMap]
 * ```
 */

import type { FieldPatternConfig, IndustryProfileId } from './types';
import { CORE_PATTERNS } from './core';
import { HEALTHCARE_PATTERNS } from './healthcare';
import { TECH_PATTERNS } from './tech';

export { CORE_PATTERNS } from './core';
export { HEALTHCARE_PATTERNS } from './healthcare';
export { TECH_PATTERNS } from './tech';
export type { FieldPatternConfig, IndustryProfileId, ProfileRegistryEntry } from './types';

// ─── Registry ───

const INDUSTRY_REGISTRY: Record<IndustryProfileId, FieldPatternConfig | null> = {
    healthcare: HEALTHCARE_PATTERNS,
    tech: TECH_PATTERNS,
    none: null,
};

/**
 * Get the merged field patterns for the given industry profile.
 *
 * Industry patterns are prepended (higher priority) to core patterns.
 * Returns just core patterns if industry is 'none' or unrecognized.
 */
export function getActiveFieldPatterns(industry: IndustryProfileId = 'none'): {
    fieldMap: [RegExp, string][];
    strictFieldMap: [RegExp, string][];
    dataAutomationMap: Record<string, string>;
    exactNameMap: Record<string, string>;
} {
    const industryConfig = INDUSTRY_REGISTRY[industry];

    const fieldMap: [RegExp, string][] = [
        ...(industryConfig?.fieldMap ?? []),
        ...CORE_PATTERNS.fieldMap,
    ];

    const strictFieldMap: [RegExp, string][] = [
        ...(industryConfig?.strictFieldMap ?? []),
        ...(CORE_PATTERNS.strictFieldMap ?? []),
    ];

    const dataAutomationMap: Record<string, string> = {
        ...(CORE_PATTERNS.dataAutomationMap ?? {}),
        ...(industryConfig?.dataAutomationMap ?? {}),
    };

    const exactNameMap: Record<string, string> = {
        ...(CORE_PATTERNS.exactNameMap ?? {}),
        ...(industryConfig?.exactNameMap ?? {}),
    };

    return { fieldMap, strictFieldMap, dataAutomationMap, exactNameMap };
}

/**
 * Get all available industry profiles for the settings UI.
 */
export function getAvailableProfiles(): { id: IndustryProfileId; displayName: string; description: string }[] {
    return [
        { id: 'none', displayName: 'Universal Only', description: 'Standard fields, no industry-specific additions' },
        { id: 'healthcare', displayName: HEALTHCARE_PATTERNS.displayName, description: HEALTHCARE_PATTERNS.description },
        { id: 'tech', displayName: TECH_PATTERNS.displayName, description: TECH_PATTERNS.description },
    ];
}
