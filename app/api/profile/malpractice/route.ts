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
            malpracticeCarrier,
            malpracticePolicyNumber,
            malpracticeCoverage,
            malpracticeClaimsHistory,
            malpracticeClaimsDetails,
        } = body

        const updatedProfile = await prisma.userProfile.update({
            where: { supabaseId: user.id },
            data: {
                ...(malpracticeCarrier !== undefined && {
                    malpracticeCarrier: malpracticeCarrier
                        ? sanitizeText(malpracticeCarrier, 200)
                        : null,
                }),
                ...(malpracticePolicyNumber !== undefined && {
                    malpracticePolicyNumber: malpracticePolicyNumber
                        ? sanitizeText(malpracticePolicyNumber, 100)
                        : null,
                }),
                ...(malpracticeCoverage !== undefined && {
                    malpracticeCoverage: malpracticeCoverage
                        ? sanitizeText(malpracticeCoverage, 100)
                        : null,
                }),
                ...(malpracticeClaimsHistory !== undefined && {
                    malpracticeClaimsHistory:
                        typeof malpracticeClaimsHistory === 'boolean'
                            ? malpracticeClaimsHistory
                            : null,
                }),
                ...(malpracticeClaimsDetails !== undefined && {
                    malpracticeClaimsDetails: malpracticeClaimsDetails
                        ? sanitizeText(malpracticeClaimsDetails, 1000)
                        : null,
                }),
            },
        })

        return NextResponse.json(updatedProfile)
    } catch (err) {
        console.error('Malpractice update error:', err)
        return NextResponse.json(
            { error: 'Failed to update malpractice insurance info' },
            { status: 500 }
        )
    }
}
