import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

const VALID_PRESCRIPTIVE = ['Active', 'Limited', 'Pending', 'Not Applicable']

export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const {
            fullPracticeAuthority,
            collaborativeAgreementReq,
            collaboratingPhysicianName,
            collaboratingPhysicianContact,
            prescriptiveAuthorityStatus,
        } = body

        const updatedProfile = await prisma.userProfile.update({
            where: { supabaseId: user.id },
            data: {
                ...(fullPracticeAuthority !== undefined && {
                    fullPracticeAuthority:
                        typeof fullPracticeAuthority === 'boolean' ? fullPracticeAuthority : null,
                }),
                ...(collaborativeAgreementReq !== undefined && {
                    collaborativeAgreementReq:
                        typeof collaborativeAgreementReq === 'boolean' ? collaborativeAgreementReq : null,
                }),
                ...(collaboratingPhysicianName !== undefined && {
                    collaboratingPhysicianName: collaboratingPhysicianName
                        ? sanitizeText(collaboratingPhysicianName, 200)
                        : null,
                }),
                ...(collaboratingPhysicianContact !== undefined && {
                    collaboratingPhysicianContact: collaboratingPhysicianContact
                        ? sanitizeText(collaboratingPhysicianContact, 200)
                        : null,
                }),
                ...(prescriptiveAuthorityStatus !== undefined && {
                    prescriptiveAuthorityStatus:
                        prescriptiveAuthorityStatus && VALID_PRESCRIPTIVE.includes(prescriptiveAuthorityStatus)
                            ? prescriptiveAuthorityStatus
                            : null,
                }),
            },
        })

        return NextResponse.json(updatedProfile)
    } catch (err) {
        console.error('Practice authority update error:', err)
        return NextResponse.json(
            { error: 'Failed to update practice authority' },
            { status: 500 }
        )
    }
}
