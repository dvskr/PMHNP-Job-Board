import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  // Clear existing data
  await prisma.job.deleteMany()

  // Create test jobs
  await prisma.job.createMany({
    data: [
      {
        title: 'Remote PMHNP - Telepsychiatry',
        employer: 'Talkiatry',
        location: 'Remote',
        jobType: 'Full-Time',
        mode: 'Remote',
        description: 'Join our growing team of psychiatric providers offering virtual mental health care. We provide comprehensive support and competitive compensation.',
        descriptionSummary: 'Remote PMHNP position with leading telepsychiatry company',
        minSalary: 130000,
        maxSalary: 160000,
        salaryPeriod: 'annual',
        salaryRange: '$130k-160k',
        applyLink: 'https://example.com/apply/1',
        isFeatured: true,
        sourceType: 'external',
        sourceProvider: 'manual',
      },
      {
        title: 'PMHNP - Outpatient Mental Health',
        employer: 'LifeStance Health',
        location: 'New York, NY',
        jobType: 'Full-Time',
        mode: 'Hybrid',
        description: 'Seeking experienced PMHNP for outpatient psychiatry clinic. Flexible schedule, supportive team environment.',
        minSalary: 120000,
        maxSalary: 150000,
        salaryPeriod: 'annual',
        salaryRange: '$120k-150k',
        applyLink: 'https://example.com/apply/2',
        sourceType: 'external',
      },
      {
        title: 'Part-Time PMHNP',
        employer: 'SonderMind',
        location: 'Remote',
        jobType: 'Part-Time',
        mode: 'Remote',
        description: 'Flexible part-time opportunity for licensed PMHNP. Set your own schedule.',
        applyLink: 'https://example.com/apply/3',
        sourceType: 'external',
      },
      {
        title: 'Psychiatric Nurse Practitioner - VA Hospital',
        employer: 'Department of Veterans Affairs',
        location: 'Los Angeles, CA',
        jobType: 'Full-Time',
        mode: 'In-Person',
        description: 'Provide mental health services to veterans. Excellent federal benefits.',
        minSalary: 110000,
        maxSalary: 140000,
        salaryPeriod: 'annual',
        applyLink: 'https://example.com/apply/4',
        sourceType: 'external',
        isFeatured: true,
      },
      {
        title: 'PMHNP - College Health Services',
        employer: 'University Health Center',
        location: 'Boston, MA',
        jobType: 'Full-Time',
        mode: 'In-Person',
        description: 'Support college students mental health. Academic calendar schedule.',
        applyLink: 'https://example.com/apply/5',
        sourceType: 'external',
      },
    ],
  })

  // Initialize site stats
  await prisma.siteStat.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      totalJobs: 5,
      totalSubscribers: 0,
      totalCompanies: 5,
    },
  })

  console.log('✓ Database seeded with test jobs')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
