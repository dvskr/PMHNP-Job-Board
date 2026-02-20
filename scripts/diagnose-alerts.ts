import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { Prisma } from '@prisma/client'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

dotenv.config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)

const STATE_TO_CODE: Record<string, string> = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN',
    'mississippi': 'MS', 'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE',
    'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
    'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
    'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK', 'oregon': 'OR',
    'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
    'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
    'district of columbia': 'DC',
}

const out: string[] = []
function log(s: string) { out.push(s) }

async function main() {
    const alerts = await prisma.jobAlert.findMany({
        where: { isActive: true },
        select: {
            id: true, email: true, keyword: true, location: true,
            mode: true, jobType: true, minSalary: true, maxSalary: true,
            frequency: true, lastSentAt: true, createdAt: true
        },
        orderBy: { createdAt: 'desc' }
    })
    log(`ACTIVE ALERTS: ${alerts.length}`)
    log(``)

    const noFilters = alerts.filter(a => !a.keyword && !a.location && !a.mode && !a.jobType && !a.minSalary && !a.maxSalary).length
    const daily = alerts.filter(a => a.frequency === 'daily').length
    const weekly = alerts.filter(a => a.frequency === 'weekly').length

    log(`No-filter: ${noFilters}  |  Daily: ${daily}  |  Weekly: ${weekly}`)
    log(``)

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const newJobs24h = await prisma.job.count({ where: { isPublished: true, createdAt: { gt: oneDayAgo } } })
    const totalActive = await prisma.job.count({ where: { isPublished: true } })

    log(`Total active: ${totalActive}  |  New (24h): ${newJobs24h}`)
    log(``)
    log(`--- PER-ALERT RESULTS (with location fix) ---`)

    const now = new Date()

    for (const alert of alerts) {
        const sinceDate = alert.lastSentAt || alert.createdAt
        const whereClause: Prisma.JobWhereInput = {
            isPublished: true,
            createdAt: { gt: sinceDate },
            AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }]
        }
        if (alert.keyword) {
            ; (whereClause.AND as Prisma.JobWhereInput[]).push({
                OR: [
                    { title: { contains: alert.keyword, mode: 'insensitive' } },
                    { description: { contains: alert.keyword, mode: 'insensitive' } },
                    { employer: { contains: alert.keyword, mode: 'insensitive' } },
                ]
            })
        }
        if (alert.location) {
            const stateCode = STATE_TO_CODE[alert.location.toLowerCase().trim()]
            if (stateCode) {
                ; (whereClause.AND as Prisma.JobWhereInput[]).push({
                    OR: [
                        { location: { contains: alert.location, mode: 'insensitive' } },
                        { location: { contains: `, ${stateCode}`, mode: 'insensitive' } },
                        { location: { contains: `${stateCode} `, mode: 'insensitive' } },
                    ]
                })
            } else {
                whereClause.location = { contains: alert.location, mode: 'insensitive' }
            }
        }
        if (alert.mode) whereClause.mode = alert.mode
        if (alert.jobType) whereClause.jobType = alert.jobType
        if (alert.minSalary) whereClause.normalizedMaxSalary = { gte: alert.minSalary }
        if (alert.maxSalary) whereClause.normalizedMinSalary = { lte: alert.maxSalary }

        const count = await prisma.job.count({ where: whereClause })
        const lastSent = alert.lastSentAt ? alert.lastSentAt.toISOString().slice(0, 16) : 'NEVER'

        const filterParts: string[] = []
        if (alert.keyword) filterParts.push(`kw="${alert.keyword}"`)
        if (alert.location) filterParts.push(`loc="${alert.location}"`)
        if (alert.mode) filterParts.push(`mode="${alert.mode}"`)
        if (alert.jobType) filterParts.push(`type="${alert.jobType}"`)

        log(``)
        log(`  ${alert.email}`)
        log(`    matches=${count} freq=${alert.frequency} lastSent=${lastSent}`)
        log(`    filters: ${filterParts.length > 0 ? filterParts.join(', ') : 'NONE'}`)
    }

    fs.writeFileSync('scripts/alert-report.txt', out.join('\n'), 'utf8')
    console.log('Done! Report at scripts/alert-report.txt')

    await prisma.$disconnect()
    await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
