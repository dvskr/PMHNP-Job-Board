import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

// PUT — update work experience entry
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const { id } = await params

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id }, select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const existing = await prisma.candidateWorkExperience.findFirst({
            where: { id, userId: profile.id },
        })
        if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

        const body = await request.json()
        const {
            jobTitle, employerName, employerCity, employerState,
            startDate, endDate, isCurrent, supervisorName, supervisorPhone,
            supervisorEmail, mayContact, reasonForLeaving, description,
            practiceSetting,
        } = body

        const updated = await prisma.candidateWorkExperience.update({
            where: { id },
            data: {
                ...(jobTitle !== undefined && { jobTitle: sanitizeText(jobTitle, 200) }),
                ...(employerName !== undefined && { employerName: sanitizeText(employerName, 200) }),
                ...(employerCity !== undefined && { employerCity: employerCity ? sanitizeText(employerCity, 100) : null }),
                ...(employerState !== undefined && { employerState: employerState ? sanitizeText(employerState, 10) : null }),
                ...(startDate !== undefined && { startDate: new Date(startDate) }),
                ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
                ...(isCurrent !== undefined && { isCurrent }),
                ...(supervisorName !== undefined && { supervisorName: supervisorName ? sanitizeText(supervisorName, 200) : null }),
                ...(supervisorPhone !== undefined && { supervisorPhone: supervisorPhone ? sanitizeText(supervisorPhone, 30) : null }),
                ...(supervisorEmail !== undefined && { supervisorEmail: supervisorEmail ? sanitizeText(supervisorEmail, 200) : null }),
                ...(mayContact !== undefined && { mayContact }),
                ...(reasonForLeaving !== undefined && { reasonForLeaving: reasonForLeaving ? sanitizeText(reasonForLeaving, 500) : null }),
                ...(description !== undefined && { description: description ? sanitizeText(description, 2000) : null }),
                ...(practiceSetting !== undefined && { practiceSetting: practiceSetting ? sanitizeText(practiceSetting, 100) : null }),
            },
        })

        return NextResponse.json(updated)
    } catch (err) {
        console.error('Work experience PUT error:', err)
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }
}

// DELETE — delete work experience entry
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const { id } = await params

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id }, select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const existing = await prisma.candidateWorkExperience.findFirst({
            where: { id, userId: profile.id },
        })
        if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

        await prisma.candidateWorkExperience.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Work experience DELETE error:', err)
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    }
}
