/**
 * PATCH /api/admin/pd-campaign
 *
 * Updates a single ProgramDirectorLead's outreach_status from the admin
 * dashboard at /admin/pd-campaign. Auth: gated by requireAdmin() (same
 * as the page itself).
 *
 * Body:
 *   {
 *     id: string,                    // lead UUID
 *     status: 'replied' | 'booked' | 'installed' | 'declined' | 'bounced' | 'not_contacted',
 *     widgetInstalledUrl?: string    // required when status='installed'
 *   }
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/protect'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

// Statuses an admin can SET via this endpoint. Notably we do NOT include
// 'wave1_sent' / 'wave2_sent' — those are set by the send script only,
// and overriding them via the UI would mask reality.
const ADMIN_SETTABLE_STATUSES = [
  'not_contacted',
  'replied',
  'booked',
  'installed',
  'declined',
  'bounced',
  'no_response',
] as const

const BODY_SCHEMA = z
  .object({
    id: z.string().uuid(),
    status: z.enum(ADMIN_SETTABLE_STATUSES),
    widgetInstalledUrl: z.string().url().max(500).optional(),
  })
  .refine(
    (b) => b.status !== 'installed' || (b.widgetInstalledUrl && b.widgetInstalledUrl.length > 0),
    { message: 'widgetInstalledUrl is required when status="installed"', path: ['widgetInstalledUrl'] },
  )

export async function PATCH(req: Request): Promise<NextResponse> {
  await requireAdmin()

  let parsed: z.infer<typeof BODY_SCHEMA>
  try {
    const body = await req.json()
    parsed = BODY_SCHEMA.parse(body)
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : 'Invalid JSON body'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  try {
    const updated = await prisma.programDirectorLead.update({
      where: { id: parsed.id },
      data: {
        outreachStatus: parsed.status,
        // Stamp lastContactedAt on a reply so the funnel timeline shows
        // when we actually heard back. Other statuses don't update it.
        ...(parsed.status === 'replied' || parsed.status === 'booked'
          ? { lastContactedAt: new Date() }
          : {}),
        ...(parsed.status === 'installed'
          ? {
              widgetInstalled: true,
              widgetInstalledUrl: parsed.widgetInstalledUrl ?? null,
            }
          : {}),
        // Reset to not_contacted clears the widget flags too — useful
        // for fixing accidental clicks.
        ...(parsed.status === 'not_contacted'
          ? { widgetInstalled: false, widgetInstalledUrl: null, lastContactedAt: null }
          : {}),
      },
      select: { id: true, outreachStatus: true },
    })

    return NextResponse.json({ success: true, lead: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error('[pd-campaign] failed to update lead', err, { id: parsed.id, status: parsed.status })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
