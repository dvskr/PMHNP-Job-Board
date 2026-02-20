/**
 * Profile Types — Shared type definitions for the profile config system.
 */

/** A single field pattern config for an industry or core profile. */
export interface FieldPatternConfig {
    /** Internal identifier (e.g., 'core', 'healthcare', 'tech') */
    name: string;

    /** User-facing name (e.g., 'Healthcare / Nursing') */
    displayName: string;

    /** Short description for the settings UI */
    description: string;

    /**
     * Standard field patterns — matched against id + name + label + placeholder.
     * Each entry: [regex, profileKey]
     */
    fieldMap: [RegExp, string][];

    /**
     * Strict field patterns — matched only against id + name (NOT label text).
     * Used for patterns prone to false positives in label text.
     */
    strictFieldMap?: [RegExp, string][];

    /**
     * ATS-specific data-automation-id → profile key mappings.
     * Only used when a specific ATS is detected.
     */
    dataAutomationMap?: Record<string, string>;

    /**
     * Exact field name → profile key mappings.
     * Used for ATS platforms that use fixed name attributes.
     */
    exactNameMap?: Record<string, string>;
}

/** Available industry profiles */
export type IndustryProfileId = 'healthcare' | 'tech' | 'none';

/** Profile registry entry */
export interface ProfileRegistryEntry {
    id: IndustryProfileId;
    config: FieldPatternConfig;
}
