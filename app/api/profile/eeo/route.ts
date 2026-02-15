import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const {
            workAuthorized,
            requiresSponsorship,
            veteranStatus,
            disabilityStatus,
            raceEthnicity,
            gender,
        } = body

        const VALID_VETERAN = ['protected_veteran', 'not_a_veteran', 'decline']
        const VALID_DISABILITY = ['yes', 'no', 'decline']
        const VALID_RACE = [
            'american_indian_or_alaska_native', 'asian', 'black_or_african_american',
            'hispanic_or_latino', 'native_hawaiian_or_other_pacific_islander',
            'white', 'two_or_more_races', 'decline',
        ]
        const VALID_GENDER = ['male', 'female', 'non_binary', 'decline']

        const updatedProfile = await prisma.userProfile.update({
            where: { supabaseId: user.id },
            data: {
                ...(workAuthorized !== undefined && {
                    workAuthorized: typeof workAuthorized === 'boolean' ? workAuthorized : null,
                }),
                ...(requiresSponsorship !== undefined && {
                    requiresSponsorship: typeof requiresSponsorship === 'boolean' ? requiresSponsorship : null,
                }),
                ...(veteranStatus !== undefined && {
                    veteranStatus: veteranStatus && VALID_VETERAN.includes(veteranStatus)
                        ? sanitizeText(veteranStatus, 50) : null,
                }),
                ...(disabilityStatus !== undefined && {
                    disabilityStatus: disabilityStatus && VALID_DISABILITY.includes(disabilityStatus)
                        ? sanitizeText(disabilityStatus, 50) : null,
                }),
                ...(raceEthnicity !== undefined && {
                    raceEthnicity: raceEthnicity && VALID_RACE.includes(raceEthnicity)
                        ? sanitizeText(raceEthnicity, 100) : null,
                }),
                ...(gender !== undefined && {
                    gender: gender && VALID_GENDER.includes(gender)
                        ? sanitizeText(gender, 50) : null,
                }),
            },
        })

        return NextResponse.json(updatedProfile)
    } catch (err) {
        console.error('EEO update error:', err)
        return NextResponse.json(
            { error: 'Failed to update EEO information' },
            { status: 500 }
        )
    }
}
