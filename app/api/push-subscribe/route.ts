import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

// POST: Subscribe to push notifications
export async function POST(request: NextRequest) {
    try {
        const { subscription } = await request.json()
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
        }

        // Get user ID if logged in (optional — guests can subscribe too)
        let userId: string | null = null
        try {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            userId = user?.id || null
        } catch { /* guest user */ }

        await prisma.pushSubscription.upsert({
            where: { endpoint: subscription.endpoint },
            create: {
                userId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
            },
            update: {
                userId,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
            },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Push subscribe error:', error)
        return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
    }
}

// DELETE: Unsubscribe from push notifications
export async function DELETE(request: NextRequest) {
    try {
        const { endpoint } = await request.json()
        if (!endpoint) return NextResponse.json({ error: 'Endpoint required' }, { status: 400 })

        await prisma.pushSubscription.deleteMany({
            where: { endpoint },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Push unsubscribe error:', error)
        return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
    }
}
