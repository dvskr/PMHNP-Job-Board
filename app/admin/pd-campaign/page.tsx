/**
 * /admin/pd-campaign
 *
 * Operational dashboard for the Program Directors campaign. Lets admin
 * mark each PD lead with their reply status without dropping into SQL.
 *
 * The send script (scripts/send-pd-wave.ts) flips outreach_status to
 * 'wave1_sent' / 'wave2_sent' automatically — this page is for the
 * everything-else state changes that the script can't observe:
 *   - replied, declined, booked, installed, bounced, no_response
 *
 * Auth: gated by app/admin/layout.tsx's requireAdmin().
 */
import { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import PdCampaignClient, { type PdLead } from './PdCampaignClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'PD Campaign — Admin',
  robots: { index: false, follow: false },
}

interface FunnelStat {
  readonly status: string
  readonly count: number
}

async function loadLeads(): Promise<{
  leads: PdLead[]
  funnel: FunnelStat[]
  total: number
}> {
  const [leads, funnel] = await Promise.all([
    prisma.programDirectorLead.findMany({
      orderBy: [{ tier: 'asc' }, { state: 'asc' }, { universityName: 'asc' }],
      select: {
        id: true,
        tier: true,
        state: true,
        universityName: true,
        directorName: true,
        email: true,
        emailStatus: true,
        outreachStatus: true,
        lastContactedAt: true,
        widgetInstalled: true,
        widgetInstalledUrl: true,
        notes: true,
      },
    }),
    prisma.programDirectorLead.groupBy({
      by: ['outreachStatus'],
      _count: true,
    }),
  ])

  return {
    leads: leads.map((l) => ({
      ...l,
      lastContactedAt: l.lastContactedAt ? l.lastContactedAt.toISOString() : null,
    })),
    funnel: funnel.map((f) => ({
      status: f.outreachStatus,
      count: f._count,
    })),
    total: leads.length,
  }
}

export default async function PdCampaignAdminPage() {
  const { leads, funnel, total } = await loadLeads()
  return <PdCampaignClient leads={leads} funnel={funnel} total={total} />
}
