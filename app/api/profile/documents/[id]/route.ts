import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

// PUT — update document metadata
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

        const existing = await prisma.candidateDocument.findFirst({
            where: { id, userId: profile.id },
        })
        if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

        const body = await request.json()
        const { documentLabel, expirationDate } = body

        const updated = await prisma.candidateDocument.update({
            where: { id },
            data: {
                ...(documentLabel !== undefined && { documentLabel }),
                ...(expirationDate !== undefined && {
                    expirationDate: expirationDate ? new Date(expirationDate) : null,
                }),
            },
        })

        return NextResponse.json(updated)
    } catch (err) {
        console.error('Document PUT error:', err)
        return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
    }
}

// DELETE — delete document from storage and database
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

        const existing = await prisma.candidateDocument.findFirst({
            where: { id, userId: profile.id },
        })
        if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

        // Delete from Supabase Storage — extract path from URL
        try {
            const url = new URL(existing.fileUrl)
            const pathParts = url.pathname.split('/storage/v1/object/public/documents/')
            if (pathParts[1]) {
                await supabase.storage.from('documents').remove([decodeURIComponent(pathParts[1])])
            }
        } catch {
            // Continue even if storage delete fails
        }

        await prisma.candidateDocument.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Document DELETE error:', err)
        return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }
}
