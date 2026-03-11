import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'

// Set VAPID details (must set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY env vars)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:contact@pmhnphiring.com',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    )
}

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
    }

    try {
        // Get top 3 new jobs from last 24 hours
        const oneDayAgo = new Date()
        oneDayAgo.setDate(oneDayAgo.getDate() - 1)

        const newJobs = await prisma.job.findMany({
            where: {
                isPublished: true,
                createdAt: { gt: oneDayAgo },
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } },
                ],
            },
            orderBy: [
                { isFeatured: 'desc' },
                { createdAt: 'desc' },
            ],
            take: 3,
            select: { id: true, title: true, employer: true, location: true },
        })

        if (newJobs.length === 0) {
            return NextResponse.json({ success: true, message: 'No new jobs', sent: 0 })
        }

        const payload = JSON.stringify({
            title: `${newJobs.length} New PMHNP Job${newJobs.length > 1 ? 's' : ''}`,
            body: newJobs.map(j => `${j.title} at ${j.employer}`).join('\n'),
            url: '/jobs',
            icon: '/icon-192x192.png',
            badge: '/favicon-48x48.png',
        })

        // Get all subscriptions
        const subscriptions = await prisma.pushSubscription.findMany()

        let sent = 0
        const staleIds: string[] = []

        for (const sub of subscriptions) {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth },
                    },
                    payload
                )
                sent++
            } catch (error: unknown) {
                const statusCode = (error as { statusCode?: number })?.statusCode
                // Remove expired/invalid subscriptions
                if (statusCode === 410 || statusCode === 404) {
                    staleIds.push(sub.id)
                }
            }
        }

        // Clean up stale subscriptions
        if (staleIds.length > 0) {
            await prisma.pushSubscription.deleteMany({
                where: { id: { in: staleIds } },
            })
        }

        return NextResponse.json({
            success: true,
            sent,
            staleRemoved: staleIds.length,
            totalSubscriptions: subscriptions.length,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Push notification cron error:', error)
        return NextResponse.json({ error: 'Push notification failed' }, { status: 500 })
    }
}
