import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireApiAdmin } from '@/lib/auth/require-api-admin'
import { ACTIVE_CAMPAIGN } from '@/lib/shortlinks'

/**
 * Admin: short-link click aggregates for the dashboard.
 *
 * Query params:
 *   campaign  defaults to the active campaign slug
 *   from      ISO date (inclusive); defaults to campaign-start (90d back)
 *   to        ISO date (exclusive); defaults to now
 *   includeBots boolean; defaults to false (the dashboard wants
 *              real-click totals)
 *
 * Response shape is the canonical contract for the admin UI:
 *   {
 *     campaign,
 *     window: { from, to },
 *     totals: { clicks, uniqueIpHashes, bots },
 *     byPlatform: [{ platform, clicks, uniqueIpHashes }],
 *     byContent:  [{ content, code, clicks, uniqueIpHashes }],
 *     daily:      [{ day, clicks }]
 *   }
 *
 * Each query runs through Prisma against indexed columns; the heaviest
 * aggregation is bound to one campaign and one rolling window.
 */

const QUERY_SCHEMA = z.object({
  campaign: z.string().min(1).max(64).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  includeBots: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
})

const DEFAULT_WINDOW_DAYS = 90

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = await requireApiAdmin(req)
  if (authError) return authError

  const url = new URL(req.url)
  const parsed = QUERY_SCHEMA.safeParse({
    campaign: url.searchParams.get('campaign') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    includeBots: url.searchParams.get('includeBots') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid query', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const campaign = parsed.data.campaign ?? ACTIVE_CAMPAIGN.campaign
  const to = parsed.data.to ? new Date(parsed.data.to) : new Date()
  const from = parsed.data.from
    ? new Date(parsed.data.from)
    : new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const includeBots = parsed.data.includeBots ?? false

  if (from >= to) {
    return NextResponse.json({ error: 'from must be earlier than to' }, { status: 400 })
  }

  const where = {
    campaign,
    createdAt: { gte: from, lt: to },
    ...(includeBots ? {} : { isBot: false }),
  }

  const botFilter = includeBots ? prismaTrue() : prismaIsBotFalse()

  try {
    const [totalClicks, botCount, byPlatform, byContent, dailyRows, uniqueIpRows] =
      await Promise.all([
        prisma.shortLinkClick.count({ where }),
        prisma.shortLinkClick.count({
          where: { campaign, createdAt: { gte: from, lt: to }, isBot: true },
        }),
        prisma.shortLinkClick.groupBy({
          by: ['platform'],
          where,
          _count: { _all: true },
          orderBy: { _count: { platform: 'desc' } },
        }),
        prisma.shortLinkClick.groupBy({
          by: ['content', 'code'],
          where,
          _count: { _all: true },
          orderBy: { _count: { content: 'desc' } },
        }),
        prisma.$queryRaw<Array<{ day: Date; clicks: bigint }>>`
          SELECT
            date_trunc('day', "created_at") AT TIME ZONE 'UTC' AS day,
            COUNT(*)::bigint AS clicks
          FROM "shortlink_clicks"
          WHERE "campaign" = ${campaign}
            AND "created_at" >= ${from}
            AND "created_at" <  ${to}
            ${botFilter}
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        prisma.$queryRaw<Array<{ unique_ips: bigint }>>`
          SELECT COUNT(DISTINCT "ip_hash")::bigint AS unique_ips
          FROM "shortlink_clicks"
          WHERE "campaign" = ${campaign}
            AND "created_at" >= ${from}
            AND "created_at" <  ${to}
            AND "ip_hash" IS NOT NULL
            ${botFilter}
        `,
      ])

    const uniqueIpHashCount = Number(uniqueIpRows[0]?.unique_ips ?? 0)

    return NextResponse.json({
      campaign,
      window: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        clicks: totalClicks,
        uniqueIpHashes: uniqueIpHashCount,
        bots: botCount,
      },
      byPlatform: byPlatform.map((row) => ({
        platform: row.platform,
        clicks: row._count._all,
      })),
      byContent: byContent.map((row) => ({
        content: row.content,
        code: row.code,
        clicks: row._count._all,
      })),
      daily: dailyRows.map((row) => ({
        day: row.day.toISOString().slice(0, 10),
        clicks: Number(row.clicks),
      })),
    })
  } catch (err) {
    logger.error('[admin:shortlinks/stats] query failed', err, {
      campaign,
      from: from.toISOString(),
      to: to.toISOString(),
    })
    return NextResponse.json({ error: 'stats query failed' }, { status: 500 })
  }
}

// Empty vs `AND "is_bot" = false` SQL fragments. Kept as helpers so the
// raw-SQL block above stays readable.
function prismaTrue() {
  return Prisma.sql``
}

function prismaIsBotFalse() {
  return Prisma.sql`AND "is_bot" = false`
}
