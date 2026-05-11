/**
 * Profile searchability — a binary "will this profile appear in employer AI
 * Match results?" signal that mirrors the embedder's actual gate at
 * lib/ai/vector-search.ts:buildCandidateEmbeddingText (length >= 20 after
 * concatenating headline/yearsExperience/certifications/licenseStates/
 * specialties/skills/bio).
 *
 * Distinct from lib/profile-completeness — that's a 0..100 score the user
 * "completes" by filling more fields. Searchability is binary: below the
 * threshold, the profile is invisible to employer AI search entirely,
 * regardless of how many credentials or education entries are filled.
 *
 * Keep the field list IN SYNC with buildCandidateEmbeddingText. If the
 * embedder's input shape ever changes, update this util in the same change.
 */

const EMBED_MIN_CHARS = 20;

export interface SearchableProfileInput {
    headline?: string | null;
    yearsExperience?: number | null;
    certifications?: string | null;
    licenseStates?: string | null;
    specialties?: string | null;
    skills?: string[] | null;
    bio?: string | null;
}

export interface SearchableResult {
    searchable: boolean;
    embedTextLength: number;
    /** Fields the embedder would use, in priority order, that are still empty. */
    missingHighValueFields: Array<'headline' | 'specialties' | 'bio' | 'yearsExperience'>;
}

function buildEmbedText(p: SearchableProfileInput): string {
    const parts: string[] = [];
    if (p.headline) parts.push(`Headline: ${p.headline}`);
    if (p.yearsExperience) parts.push(`Years of Experience: ${p.yearsExperience}`);
    if (p.certifications) parts.push(`Certifications: ${p.certifications}`);
    if (p.licenseStates) parts.push(`Licensed States: ${p.licenseStates}`);
    if (p.specialties) parts.push(`Specialties: ${p.specialties}`);
    if (p.skills?.length) parts.push(`Skills: ${p.skills.join(', ')}`);
    if (p.bio) parts.push(`Bio: ${p.bio.slice(0, 1500)}`);
    return parts.join('\n');
}

export function isProfileSearchable(profile: SearchableProfileInput | null | undefined): SearchableResult {
    if (!profile) {
        return {
            searchable: false,
            embedTextLength: 0,
            missingHighValueFields: ['headline', 'specialties', 'bio', 'yearsExperience'],
        };
    }
    const text = buildEmbedText(profile).trim();
    const searchable = text.length >= EMBED_MIN_CHARS;

    // The high-value fields are the ones that produce embedding signal beyond
    // what credentials/license-state already encode. We surface them in the
    // order they appear in the embedder so the dashboard nag points at the
    // most impactful gap first.
    const missingHighValueFields: SearchableResult['missingHighValueFields'] = [];
    if (!profile.headline || !profile.headline.trim()) missingHighValueFields.push('headline');
    const specialtyCount = (profile.specialties ?? '').split(',').map((s) => s.trim()).filter(Boolean).length;
    if (specialtyCount === 0) missingHighValueFields.push('specialties');
    if (!profile.bio || profile.bio.trim().length < 50) missingHighValueFields.push('bio');
    if (typeof profile.yearsExperience !== 'number') missingHighValueFields.push('yearsExperience');

    return { searchable, embedTextLength: text.length, missingHighValueFields };
}
