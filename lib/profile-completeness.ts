/**
 * Profile completeness scoring utility — v2
 * Section-based scoring with per-section breakdown.
 * Works on both client and server.
 */


export interface ProfileDataV2 {
    // Personal Info
    firstName?: string | null
    lastName?: string | null
    phone?: string | null
    headline?: string | null
    addressLine1?: string | null
    city?: string | null
    state?: string | null
    zipCode?: string | null
    // Credentials
    npiNumber?: string | null
    deaNumber?: string | null
    // Resume
    resumeUrl?: string | null
    // Profile Detail — the fields that drive the candidate-embedding text
    // and therefore whether the profile is reachable by employer AI search.
    // See lib/ai/vector-search.ts:buildCandidateEmbeddingText. Without these
    // the embedder skips the profile entirely (text < 20 chars), so it is
    // invisible to /api/employer/talent/search regardless of how complete
    // the rest of the profile is.
    bio?: string | null
    specialties?: string | null
    yearsExperience?: number | null
    skills?: string[] | null
    // Counts (from includes or separate queries)
    _count?: {
        licenses?: number
        certificationRecords?: number
        education?: number
        workExperience?: number
        screeningAnswers?: number
        openEndedResponses?: number
        candidateReferences?: number
    }
}

/** @deprecated Use ProfileDataV2 instead */
export type ProfileData = ProfileDataV2

export interface SectionScore {
    label: string
    earned: number
    total: number
    missing: string[]
}

export interface CompletenessResult {
    percentage: number
    color: string
    sections: SectionScore[]
    missingItems: { label: string; weight: number; fieldId: string }[]
}

const hasText = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0

export function calculateCompleteness(profile: ProfileDataV2 | null | undefined): CompletenessResult {
    if (!profile) {
        return {
            percentage: 0,
            color: '#EF4444',
            sections: [
                { label: 'Personal Info', earned: 0, total: 20, missing: ['All fields'] },
                { label: 'Profile Detail', earned: 0, total: 16, missing: ['Headline, bio, specialties, experience'] },
                { label: 'Credentials', earned: 0, total: 19, missing: ['All fields'] },
                { label: 'Education', earned: 0, total: 15, missing: ['Add education'] },
                { label: 'Work Experience', earned: 0, total: 15, missing: ['Add work experience'] },
                { label: 'Resume', earned: 0, total: 5, missing: ['Upload resume'] },
                { label: 'Screening & Responses', earned: 0, total: 5, missing: ['Answer screening questions'] },
                { label: 'References', earned: 0, total: 5, missing: ['Add 3 references'] },
            ],
            missingItems: [],
        }
    }

    const c = profile._count || {}
    const sections: SectionScore[] = []
    const missingItems: { label: string; weight: number; fieldId: string }[] = []

    // ── Personal Info (20%) — 5 items × 4% ──
    {
        let earned = 0
        const missing: string[] = []
        if (hasText(profile.firstName)) earned += 4; else { missing.push('First name'); missingItems.push({ label: 'Add first name', weight: 4, fieldId: 'tab-personal' }) }
        if (hasText(profile.lastName)) earned += 4; else { missing.push('Last name'); missingItems.push({ label: 'Add last name', weight: 4, fieldId: 'tab-personal' }) }
        if (hasText(profile.phone)) earned += 4; else { missing.push('Phone'); missingItems.push({ label: 'Add phone', weight: 4, fieldId: 'tab-personal' }) }
        if (hasText(profile.addressLine1) && hasText(profile.city) && hasText(profile.state) && hasText(profile.zipCode)) earned += 4; else { missing.push('Complete address'); missingItems.push({ label: 'Complete address', weight: 4, fieldId: 'tab-personal' }) }
        if (hasText(profile.headline)) earned += 4; else { missing.push('Headline'); missingItems.push({ label: 'Add headline', weight: 4, fieldId: 'tab-personal' }) }
        sections.push({ label: 'Personal Info', earned, total: 20, missing })
    }

    // ── Profile Detail (16%) — the fields that make this profile reachable
    // by employer AI search. Without bio + specialties + a meaningful
    // yearsExperience the embedder skips the row (text < 20 chars), so
    // pressure to fill these is what unblocks the AI-Match feature for the
    // candidate. See lib/ai/vector-search.ts:buildCandidateEmbeddingText.
    {
        let earned = 0
        const missing: string[] = []
        // Bio is the heaviest signal in the embedding text (up to 1500 chars
        // passed verbatim) — credit a meaningful bio more than a 1-word one.
        const bioLen = (profile.bio ?? '').trim().length
        if (bioLen >= 50) earned += 5
        else if (bioLen > 0) {
            earned += 2
            missing.push('Expand professional summary'); missingItems.push({ label: 'Expand professional summary', weight: 3, fieldId: 'tab-personal' })
        } else {
            missing.push('Professional summary'); missingItems.push({ label: 'Add professional summary', weight: 5, fieldId: 'tab-personal' })
        }
        const specialtyCount = (profile.specialties ?? '').split(',').map((s) => s.trim()).filter(Boolean).length
        if (specialtyCount >= 1) earned += 5
        else { missing.push('Specialties'); missingItems.push({ label: 'Add specialties', weight: 5, fieldId: 'tab-personal' }) }
        if (typeof profile.yearsExperience === 'number' && profile.yearsExperience >= 0) earned += 3
        else { missing.push('Years of experience'); missingItems.push({ label: 'Set years of experience', weight: 3, fieldId: 'tab-personal' }) }
        if ((profile.skills?.length ?? 0) >= 1) earned += 3
        else { missing.push('Skills'); missingItems.push({ label: 'Add a few skills', weight: 3, fieldId: 'tab-personal' }) }
        sections.push({ label: 'Profile Detail', earned, total: 16, missing })
    }

    // ── Professional Credentials (19%) — license 6, cert 6, npi 4, dea 3
    // (slimmed from 25% to make room for Profile Detail). License + cert
    // stay the heaviest because employer filters still rely on them. ──
    {
        let earned = 0
        const missing: string[] = []
        if ((c.licenses || 0) >= 1) earned += 6; else { missing.push('License'); missingItems.push({ label: 'Add a license', weight: 6, fieldId: 'tab-credentials' }) }
        if ((c.certificationRecords || 0) >= 1) earned += 6; else { missing.push('Certification'); missingItems.push({ label: 'Add a certification', weight: 6, fieldId: 'tab-credentials' }) }
        if (hasText(profile.npiNumber)) earned += 4; else { missing.push('NPI number'); missingItems.push({ label: 'Add NPI number', weight: 4, fieldId: 'tab-credentials' }) }
        if (hasText(profile.deaNumber)) earned += 3; else { missing.push('DEA number'); missingItems.push({ label: 'Add DEA number', weight: 3, fieldId: 'tab-credentials' }) }
        sections.push({ label: 'Credentials', earned, total: 19, missing })
    }

    // ── Education (15%) ──
    {
        let earned = 0
        const missing: string[] = []
        if ((c.education || 0) >= 1) earned += 15; else { missing.push('Add education'); missingItems.push({ label: 'Add education entry', weight: 15, fieldId: 'tab-education' }) }
        sections.push({ label: 'Education', earned, total: 15, missing })
    }

    // ── Work Experience (15%) — was 20%, dropped 5% into Profile Detail. ──
    {
        let earned = 0
        const missing: string[] = []
        if ((c.workExperience || 0) >= 1) earned += 15; else { missing.push('Add work experience'); missingItems.push({ label: 'Add work experience', weight: 15, fieldId: 'tab-experience' }) }
        sections.push({ label: 'Work Experience', earned, total: 15, missing })
    }

    // ── Resume (5%) ──
    {
        let earned = 0
        const missing: string[] = []
        if (hasText(profile.resumeUrl)) earned += 5; else { missing.push('Resume'); missingItems.push({ label: 'Upload resume', weight: 5, fieldId: 'tab-personal' }) }
        sections.push({ label: 'Resume', earned, total: 5, missing })
    }

    // ── Screening & Responses (5%) — was 10%, dropped 5% into Profile
    // Detail. The remaining 5% still rewards engagement without blocking
    // the 80% threshold that drives the dashboard nag. ──
    {
        let earned = 0
        const missing: string[] = []
        if ((c.screeningAnswers || 0) >= 5) earned += 3; else { missing.push('Screening answers'); missingItems.push({ label: 'Answer 5+ screening questions', weight: 3, fieldId: 'tab-screening' }) }
        if ((c.openEndedResponses || 0) >= 3) earned += 2; else { missing.push('Application responses'); missingItems.push({ label: 'Write 3+ application responses', weight: 2, fieldId: 'tab-responses' }) }
        sections.push({ label: 'Screening & Responses', earned, total: 5, missing })
    }

    // ── References (5%) ──
    {
        let earned = 0
        const missing: string[] = []
        if ((c.candidateReferences || 0) >= 3) earned += 5; else { missing.push(`${Math.max(0, 3 - (c.candidateReferences || 0))} more reference(s)`); missingItems.push({ label: 'Add 3 references', weight: 5, fieldId: 'tab-references' }) }
        sections.push({ label: 'References', earned, total: 5, missing })
    }

    const percentage = Math.min(sections.reduce((s, sec) => s + sec.earned, 0), 100)

    let color: string
    if (percentage <= 30) color = '#EF4444'
    else if (percentage <= 60) color = '#F59E0B'
    else color = '#22C55E'

    return { percentage, color, sections, missingItems }
}
