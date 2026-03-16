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
            addressLine1,
            addressLine2,
            city,
            state,
            zipCode,
            country,
        } = body

        const updatedProfile = await prisma.userProfile.update({
            where: { supabaseId: user.id },
            data: {
                ...(addressLine1 !== undefined && {
                    addressLine1: addressLine1 ? sanitizeText(addressLine1, 200) : null,
                }),
                ...(addressLine2 !== undefined && {
                    addressLine2: addressLine2 ? sanitizeText(addressLine2, 200) : null,
                }),
                ...(city !== undefined && {
                    city: city ? sanitizeText(city, 100) : null,
                }),
                ...(state !== undefined && {
                    state: state ? sanitizeText(state, 50) : null,
                }),
                ...(zipCode !== undefined && {
                    zipCode: zipCode ? sanitizeText(zipCode, 10) : null,
                }),
                ...(country !== undefined && {
                    country: country ? sanitizeText(country, 100) : null,
                }),
            },
        })

        return NextResponse.json(updatedProfile)
    } catch (err) {
        console.error('Address update error:', err)
        return NextResponse.json(
            { error: 'Failed to update address' },
            { status: 500 }
        )
    }
}
