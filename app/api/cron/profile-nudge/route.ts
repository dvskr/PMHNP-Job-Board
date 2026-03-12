import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendProfileIncompleteEmail } from '@/lib/email-service'

export const maxDuration = 120 // 2 minutes — profile nudge emails

// Fields that count toward profile completeness
const PROFILE_FIELDS = [
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'headline', label: 'Professional Headline' },
    { key: 'yearsExperience', label: 'Years of Experience' },
    { key: 'certifications', label: 'Certifications' },
    { key: 'licenseStates', label: 'License States' },
    { key: 'specialties', label: 'Specialties' },
    { key: 'bio', label: 'Bio / Summary' },
    { key: 'resumeUrl', label: 'Resume Upload' },
    { key: 'preferredWorkMode', label: 'Work Mode Preference' },
] as const

function computeCompleteness(profile: Record<string, unknown>) {
    const missing: string[] = []
    let filled = 0
    for (const f of PROFILE_FIELDS) {
        const val = profile[f.key]
        if (val !== null && val !== undefined && val !== '' && val !== 0) {
            filled++
        } else {
            missing.push(f.label)
        }
    }
    return { percentage: Math.round((filled / PROFILE_FIELDS.length) * 100), missing }
}

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Find job_seeker profiles created 3+ days ago with < 60% completeness
        const threeDaysAgo = new Date()
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

        const profiles = await prisma.userProfile.findMany({
            where: {
                role: 'job_seeker',
                createdAt: { lte: threeDaysAgo },
                // Only nudge once — check that we haven't sent recently
                // We'll use updatedAt isn't very recent as a proxy
            },
            select: {
                email: true,
                firstName: true,
                lastName: true,
                headline: true,
                yearsExperience: true,
                certifications: true,
                licenseStates: true,
                specialties: true,
                bio: true,
                resumeUrl: true,
                preferredWorkMode: true,
            },
        })

        let sentCount = 0
        const errors: string[] = []

        for (const profile of profiles) {
            const { percentage, missing } = computeCompleteness(profile as unknown as Record<string, unknown>)

            if (percentage >= 60 || missing.length === 0) continue

            try {
                await sendProfileIncompleteEmail(
                    profile.email,
                    profile.firstName,
                    percentage,
                    missing
                )
                sentCount++
            } catch (e) {
                errors.push(`${profile.email}: ${e}`)
            }

            // Rate limit: pause between emails
            if (sentCount % 10 === 0) {
                await new Promise(r => setTimeout(r, 1000))
            }
        }

        return NextResponse.json({
            success: true,
            profilesChecked: profiles.length,
            nudgesSent: sentCount,
            errors,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Profile nudge cron error:', error)
        return NextResponse.json({ error: 'Profile nudge failed' }, { status: 500 })
    }
}
