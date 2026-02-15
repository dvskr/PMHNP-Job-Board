import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

// GET — fetch all documents for current user
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id }, select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const docs = await prisma.candidateDocument.findMany({
            where: { userId: profile.id },
            orderBy: { createdAt: 'desc' },
        })

        return NextResponse.json(docs)
    } catch (err) {
        console.error('Documents GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST — upload a new document (multipart form)
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id }, select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const formData = await request.formData()
        const file = formData.get('file') as File | null
        const documentType = formData.get('documentType') as string
        const documentLabel = formData.get('documentLabel') as string
        const expirationDate = formData.get('expirationDate') as string | null

        if (!file || !documentType || !documentLabel) {
            return NextResponse.json({ error: 'File, document type, and label are required' }, { status: 400 })
        }

        // Validate file size (10 MB)
        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: 'File must be under 10 MB' }, { status: 400 })
        }

        // Validate file type
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
        ]
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ error: 'Unsupported file type. Allowed: PDF, DOC, DOCX, JPG, PNG' }, { status: 400 })
        }

        // Upload to Supabase Storage
        const filePath = `documents/${profile.id}/${documentType}/${Date.now()}_${file.name}`
        const arrayBuffer = await file.arrayBuffer()
        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, arrayBuffer, {
                contentType: file.type,
                upsert: false,
            })

        if (uploadError) {
            console.error('Storage upload error:', uploadError)
            return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(filePath)

        const doc = await prisma.candidateDocument.create({
            data: {
                userId: profile.id,
                documentType,
                documentLabel,
                fileUrl: urlData.publicUrl,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type,
                expirationDate: expirationDate ? new Date(expirationDate) : null,
            },
        })

        return NextResponse.json(doc, { status: 201 })
    } catch (err) {
        console.error('Document POST error:', err)
        return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 })
    }
}
