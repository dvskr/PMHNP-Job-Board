/**
 * Profile completeness scoring utility.
 * Pure function — no side effects, works on both client and server.
 */

export interface ProfileData {
    firstName?: string | null
    lastName?: string | null
    phone?: string | null
    headline?: string | null
    bio?: string | null
    yearsExperience?: number | null
    certifications?: string | null
    licenseStates?: string | null
    specialties?: string | null
    preferredWorkMode?: string | null
    resumeUrl?: string | null
}

export interface MissingItem {
    label: string
    weight: number
    fieldId: string
}

export interface CompletenessResult {
    percentage: number
    color: string
    missingItems: MissingItem[]
}

// ── Field definitions with weights ──

interface FieldDef {
    key: keyof ProfileData
    label: string
    weight: number
    fieldId: string
    check: (val: unknown) => boolean
}

const hasText = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0

const hasListData = (v: unknown): boolean => {
    if (typeof v !== 'string' || !v.trim()) return false
    // Try JSON array first
    try {
        const parsed = JSON.parse(v)
        if (Array.isArray(parsed) && parsed.length > 0) return true
    } catch { /* not JSON */ }
    // Comma-separated fallback
    return v.split(',').some((s) => s.trim().length > 0)
}

const FIELDS: FieldDef[] = [
    { key: 'firstName', label: 'Add your first name', weight: 10, fieldId: 'section-name', check: hasText },
    { key: 'lastName', label: 'Add your last name', weight: 10, fieldId: 'section-name', check: hasText },
    { key: 'phone', label: 'Add your phone number', weight: 5, fieldId: 'section-contact', check: hasText },
    { key: 'headline', label: 'Add your headline', weight: 15, fieldId: 'section-headline', check: hasText },
    { key: 'bio', label: 'Write a short bio', weight: 10, fieldId: 'section-bio', check: hasText },
    { key: 'yearsExperience', label: 'Set your experience level', weight: 10, fieldId: 'section-experience', check: (v) => v !== null && v !== undefined },
    { key: 'certifications', label: 'Add a certification', weight: 10, fieldId: 'section-certifications', check: hasListData },
    { key: 'licenseStates', label: 'Add a licensed state', weight: 10, fieldId: 'section-states', check: hasListData },
    { key: 'specialties', label: 'Add a specialty', weight: 5, fieldId: 'section-specialties', check: hasListData },
    { key: 'preferredWorkMode', label: 'Set your work mode', weight: 5, fieldId: 'section-workmode', check: hasText },
    { key: 'resumeUrl', label: 'Upload your resume', weight: 10, fieldId: 'section-resume', check: hasText },
]

// ── Main scoring function ──

export function calculateCompleteness(profile: ProfileData | null | undefined): CompletenessResult {
    if (!profile) {
        return {
            percentage: 0,
            color: '#EF4444', // red
            missingItems: FIELDS.map((f) => ({ label: f.label, weight: f.weight, fieldId: f.fieldId })),
        }
    }

    let earned = 0
    const missingItems: MissingItem[] = []

    for (const field of FIELDS) {
        const value = profile[field.key]
        if (field.check(value)) {
            earned += field.weight
        } else {
            missingItems.push({ label: field.label, weight: field.weight, fieldId: field.fieldId })
        }
    }

    const percentage = Math.min(earned, 100)

    let color: string
    if (percentage <= 30) {
        color = '#EF4444' // red
    } else if (percentage <= 60) {
        color = '#F59E0B' // yellow/amber
    } else {
        color = '#22C55E' // green
    }

    return { percentage, color, missingItems }
}
