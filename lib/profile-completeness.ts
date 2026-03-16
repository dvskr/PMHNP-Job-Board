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
                { label: 'Credentials', earned: 0, total: 25, missing: ['All fields'] },
                { label: 'Education', earned: 0, total: 15, missing: ['Add education'] },
                { label: 'Work Experience', earned: 0, total: 20, missing: ['Add work experience'] },
                { label: 'Documents', earned: 0, total: 5, missing: ['Upload resume'] },
                { label: 'Screening & Responses', earned: 0, total: 10, missing: ['Answer screening questions'] },
                { label: 'References', earned: 0, total: 5, missing: ['Add 3 references'] },
            ],
            missingItems: [],
        }
    }

    const c = profile._count || {}
    const sections: SectionScore[] = []
    const missingItems: { label: string; weight: number; fieldId: string }[] = []

    // ── Personal Info (20%) ──
    {
        let earned = 0
        const missing: string[] = []
        if (hasText(profile.firstName)) earned += 4; else { missing.push('First name'); missingItems.push({ label: 'Add first name', weight: 4, fieldId: 'tab-personal' }) }
        if (hasText(profile.lastName)) earned += 4; else { missing.push('Last name'); missingItems.push({ label: 'Add last name', weight: 4, fieldId: 'tab-personal' }) }
        if (hasText(profile.phone)) earned += 3; else { missing.push('Phone'); missingItems.push({ label: 'Add phone', weight: 3, fieldId: 'tab-personal' }) }
        if (hasText(profile.addressLine1) && hasText(profile.city) && hasText(profile.state) && hasText(profile.zipCode)) earned += 5; else { missing.push('Complete address'); missingItems.push({ label: 'Complete address', weight: 5, fieldId: 'tab-personal' }) }
        if (hasText(profile.headline)) earned += 4; else { missing.push('Headline'); missingItems.push({ label: 'Add headline', weight: 4, fieldId: 'tab-personal' }) }
        sections.push({ label: 'Personal Info', earned, total: 20, missing })
    }

    // ── Professional Credentials (25%) ──
    {
        let earned = 0
        const missing: string[] = []
        if ((c.licenses || 0) >= 1) earned += 8; else { missing.push('License'); missingItems.push({ label: 'Add a license', weight: 8, fieldId: 'tab-credentials' }) }
        if ((c.certificationRecords || 0) >= 1) earned += 7; else { missing.push('Certification'); missingItems.push({ label: 'Add a certification', weight: 7, fieldId: 'tab-credentials' }) }
        if (hasText(profile.npiNumber)) earned += 5; else { missing.push('NPI number'); missingItems.push({ label: 'Add NPI number', weight: 5, fieldId: 'tab-credentials' }) }
        if (hasText(profile.deaNumber)) earned += 5; else { missing.push('DEA number'); missingItems.push({ label: 'Add DEA number', weight: 5, fieldId: 'tab-credentials' }) }
        sections.push({ label: 'Credentials', earned, total: 25, missing })
    }

    // ── Education (15%) ──
    {
        let earned = 0
        const missing: string[] = []
        if ((c.education || 0) >= 1) earned += 15; else { missing.push('Add education'); missingItems.push({ label: 'Add education entry', weight: 15, fieldId: 'tab-education' }) }
        sections.push({ label: 'Education', earned, total: 15, missing })
    }

    // ── Work Experience (20%) ──
    {
        let earned = 0
        const missing: string[] = []
        if ((c.workExperience || 0) >= 1) earned += 20; else { missing.push('Add work experience'); missingItems.push({ label: 'Add work experience', weight: 20, fieldId: 'tab-experience' }) }
        sections.push({ label: 'Work Experience', earned, total: 20, missing })
    }

    // ── Resume (5%) ──
    {
        let earned = 0
        const missing: string[] = []
        if (hasText(profile.resumeUrl)) earned += 5; else { missing.push('Resume'); missingItems.push({ label: 'Upload resume', weight: 5, fieldId: 'tab-personal' }) }
        sections.push({ label: 'Resume', earned, total: 5, missing })
    }

    // ── Screening & Responses (10%) ──
    {
        let earned = 0
        const missing: string[] = []
        if ((c.screeningAnswers || 0) >= 5) earned += 5; else { missing.push('Screening answers'); missingItems.push({ label: 'Answer 5+ screening questions', weight: 5, fieldId: 'tab-screening' }) }
        if ((c.openEndedResponses || 0) >= 3) earned += 5; else { missing.push('Application responses'); missingItems.push({ label: 'Write 3+ application responses', weight: 5, fieldId: 'tab-responses' }) }
        sections.push({ label: 'Screening & Responses', earned, total: 10, missing })
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
