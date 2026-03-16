/**
 * Universal Screening Question Resolver
 * 
 * Given a question text and a full profile object, resolves the best answer.
 * This module contains NO DOM interaction — just pure data logic.
 * Used by screening-filler.ts for all ATS platforms.
 */

// ─── Resume Education Cache ───
// Populated by runSmartRecruitersSections (or any ATS that extracts education from resume)
// Used as a fallback when profile.education is empty

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _cachedResumeEducation: any[] | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCachedResumeEducation(eduEntries: any[]): void {
    _cachedResumeEducation = eduEntries;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getCachedResumeEducation(): any[] | null {
    return _cachedResumeEducation;
}

// ─── Answer Resolution ───

export type ScreeningAnswer = {
    /** The resolved answer string (e.g., "Yes", "No", "Master's", "6") or null if unknown */
    answer: string | null;
    /** The field category (for logging) */
    field: string;
    /** How to interact with the DOM element */
    interaction: 'radio' | 'dropdown' | 'text';
};

/**
 * Resolve the answer to a screening question based on profile data.
 * Pure logic — no DOM interaction.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveScreeningAnswer(questionText: string, profile: any): ScreeningAnswer {
    const p = profile?.personal || profile || {};
    const eeo = profile?.eeo || {};
    const screening = profile?.screeningAnswers || {};
    const allScreening = { ...(screening.background || {}), ...(screening.logistics || {}) };
    const specialties: string[] = p.specialties || [];

    // ── Radio-type questions (Yes/No) ──

    if (/authorized.*work|work.*auth/i.test(questionText)) {
        const answer = eeo.workAuthorized != null ? (eeo.workAuthorized ? 'Yes' : 'No') : null;
        return { answer, field: 'workAuthorized', interaction: 'radio' };
    }

    if (/license|certification/i.test(questionText)) {
        const creds = profile?.credentials || {};
        const hasLicense = (creds.licenses || []).length > 0;
        const answer = hasLicense ? 'Yes' : null;
        return { answer, field: 'license/cert', interaction: 'radio' };
    }

    if (/experience.*(?:children|adolescent|pediatric)/i.test(questionText)) {
        let answer: string | null = null;
        if (allScreening.experience_children?.answer != null) {
            answer = allScreening.experience_children.answer ? 'Yes' : 'No';
        } else {
            const hasChildSpecialty = specialties.some((s: string) =>
                /child|adolescent|pediatric/i.test(s)
            );
            answer = hasChildSpecialty ? 'Yes' : 'No';
        }
        return { answer, field: 'experience_children', interaction: 'radio' };
    }

    if (/sponsor/i.test(questionText)) {
        const answer = eeo.requiresSponsorship != null ? (eeo.requiresSponsorship ? 'Yes' : 'No') : null;
        return { answer, field: 'sponsorship', interaction: 'radio' };
    }

    if (/felony|conviction/i.test(questionText)) {
        const answer = allScreening.felony_conviction?.answer != null
            ? (allScreening.felony_conviction.answer ? 'Yes' : 'No') : null;
        return { answer, field: 'felony', interaction: 'radio' };
    }

    if (/background.*check/i.test(questionText)) {
        const answer = allScreening.consent_background_check?.answer != null
            ? (allScreening.consent_background_check.answer ? 'Yes' : 'No') : null;
        return { answer, field: 'background_check', interaction: 'radio' };
    }

    if (/drug.*(?:screen|test)|(?:screen|test).*drug/i.test(questionText)) {
        const answer = allScreening.consent_drug_screen?.answer != null
            ? (allScreening.consent_drug_screen.answer ? 'Yes' : 'No') : null;
        return { answer, field: 'drug_screen', interaction: 'radio' };
    }

    // ── Dropdown/text questions ──

    if (/highest.*level.*education|education.*completed/i.test(questionText)) {
        let eduArr = profile?.education || [];
        if (eduArr.length === 0 && _cachedResumeEducation?.length) {
            eduArr = _cachedResumeEducation;
        }
        const edu = eduArr[0] || {};
        const degreeType = edu.degreeType || '';
        return { answer: degreeType || null, field: 'education_level', interaction: 'dropdown' };
    }

    if (/years.*(?:relevant\s+)?experience|experience.*years/i.test(questionText)) {
        const yearsExp = p.yearsExperience ? String(p.yearsExperience) : '';
        const numOnly = yearsExp ? (yearsExp.replace(/[^0-9]/g, '') || yearsExp) : '';
        return { answer: numOnly || null, field: 'years_experience', interaction: 'text' };
    }

    if (/salary|compensation|pay.*(?:expect|requir|desir)/i.test(questionText)) {
        const prefs = profile?.preferences || {};
        const salary = prefs.desiredSalaryMin ? `${prefs.desiredSalaryMin}` : '';
        return { answer: salary || null, field: 'salary', interaction: 'text' };
    }

    if (/(?:start|available|earliest).*date|when.*(?:start|available|begin)/i.test(questionText)) {
        const prefs = profile?.preferences || {};
        const date = prefs.availableDate || '';
        return { answer: date || null, field: 'available_date', interaction: 'text' };
    }

    // No match — return null
    return { answer: null, field: 'unknown', interaction: 'text' };
}


// ─── Degree Matching ───

/** Check if a dropdown option matches a degree type (handles abbreviations like MSN, BSN, DNP) */
export function matchesDegree(optionText: string, degreeType: string): boolean {
    const opt = optionText.toLowerCase();
    const deg = degreeType.toLowerCase().trim();

    // Exact match
    if (opt === deg) return true;

    // Degree abbreviation → level keywords mapping
    const degreeMap: Record<string, string[]> = {
        'msn': ['master'],
        'bsn': ['bachelor'],
        'dnp': ['doctor', 'doctorate'],
        'phd': ['doctor', 'doctorate', 'ph.d'],
        'md': ['doctor', 'doctorate', 'medical'],
        'adn': ['associate'],
        'asn': ['associate'],
        'lpn': ['certificate', 'diploma', 'vocational'],
        'ged': ['high school', 'ged'],
    };

    // Check abbreviation mapping first
    const levelKeywords = degreeMap[deg];
    if (levelKeywords) {
        return levelKeywords.some(kw => opt.includes(kw));
    }

    // Also check if the degree contains a level word (e.g., "Master of Science in Nursing")
    if (/master/i.test(deg) && opt.includes('master')) return true;
    if (/bachelor/i.test(deg) && opt.includes('bachelor')) return true;
    if (/doctor|phd|dnp/i.test(deg) && (opt.includes('doctor') || opt.includes('doctorate'))) return true;
    if (/associate/i.test(deg) && opt.includes('associate')) return true;

    // Key words from degree type
    const keywords = deg.split(/\s+/).filter(w => w.length > 2);
    const matchCount = keywords.filter(k => opt.includes(k)).length;
    return matchCount >= Math.ceil(keywords.length / 2);
}
