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
  const [leads, funnel, clickAgg] = await Promise.all([
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
    // Per-lead human-click counts. Bots/preview-fetches excluded so the
    // "did this PD actually click?" signal is honest. Joined client-side
    // via recipient_lead_id below.
    prisma.shortLinkClick.groupBy({
      by: ['recipientLeadId'],
      where: {
        platform: 'program-director',
        isBot: false,
        recipientLeadId: { not: null },
      },
      _count: true,
    }),
  ])

  const clicksByLead = new Map<string, number>()
  for (const c of clickAgg) {
    if (c.recipientLeadId) clicksByLead.set(c.recipientLeadId, c._count)
  }

  return {
    leads: leads.map((l) => ({
      ...l,
      lastContactedAt: l.lastContactedAt ? l.lastContactedAt.toISOString() : null,
      clickCount: clicksByLead.get(l.id) ?? 0,
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
