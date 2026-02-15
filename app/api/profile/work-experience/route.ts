import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

// GET — fetch all work experience for current user
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const entries = await prisma.candidateWorkExperience.findMany({
            where: { userId: profile.id },
            orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
        })

        return NextResponse.json(entries)
    } catch (err) {
        console.error('Work experience GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST — create a new work experience entry
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const body = await request.json()
        const {
            jobTitle, employerName, employerCity, employerState,
            startDate, endDate, isCurrent, supervisorName, supervisorPhone,
            supervisorEmail, mayContact, reasonForLeaving, description,
            patientVolume, patientPopulations, treatmentModalities, disordersTreated,
            practiceSetting, telehealthExperience, telehealthPlatforms, ehrSystems,
            prescribingExp, prescribingSchedules, assessmentTools, supervisoryRole,
            supervisoryDetails,
        } = body

        if (!jobTitle || !employerName || !startDate) {
            return NextResponse.json(
                { error: 'Job title, employer name, and start date are required' },
                { status: 400 }
            )
        }

        const entry = await prisma.candidateWorkExperience.create({
            data: {
                userId: profile.id,
                jobTitle: sanitizeText(jobTitle, 200),
                employerName: sanitizeText(employerName, 200),
                employerCity: employerCity ? sanitizeText(employerCity, 100) : null,
                employerState: employerState ? sanitizeText(employerState, 10) : null,
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
                isCurrent: isCurrent ?? false,
                supervisorName: supervisorName ? sanitizeText(supervisorName, 200) : null,
                supervisorPhone: supervisorPhone ? sanitizeText(supervisorPhone, 30) : null,
                supervisorEmail: supervisorEmail ? sanitizeText(supervisorEmail, 200) : null,
                mayContact: mayContact ?? null,
                reasonForLeaving: reasonForLeaving ? sanitizeText(reasonForLeaving, 500) : null,
                description: description ? sanitizeText(description, 2000) : null,
                patientVolume: patientVolume ? sanitizeText(patientVolume, 50) : null,
                patientPopulations: patientPopulations ?? null,
                treatmentModalities: treatmentModalities ?? null,
                disordersTreated: disordersTreated ?? null,
                practiceSetting: practiceSetting ? sanitizeText(practiceSetting, 100) : null,
                telehealthExperience: telehealthExperience ?? null,
                telehealthPlatforms: telehealthPlatforms ?? null,
                ehrSystems: ehrSystems ?? null,
                prescribingExp: prescribingExp ?? null,
                prescribingSchedules: prescribingSchedules ? sanitizeText(prescribingSchedules, 50) : null,
                assessmentTools: assessmentTools ?? null,
                supervisoryRole: supervisoryRole ?? null,
                supervisoryDetails: supervisoryDetails ? sanitizeText(supervisoryDetails, 500) : null,
            },
        })

        return NextResponse.json(entry, { status: 201 })
    } catch (err) {
        console.error('Work experience POST error:', err)
        return NextResponse.json({ error: 'Failed to create work experience' }, { status: 500 })
    }
}
