# PMHNP Job Board - PART 1: Setup & Foundation
## Build a Real, Revenue-Generating Business with Prisma

**This is NOT a demo. This is a REAL BUSINESS.**

---

## 📖 Guide Structure

**PART 1 (This Document):** Setup & Foundation
- Prerequisites & accounts
- Next.js project setup
- Prisma schema & database
- Foundation files (.cursorrules, instructions.md)
- Testing setup

**PART 2:** Core Features (Slices 1-6)
- View jobs list
- Job details page
- Search & filters
- Job aggregation from APIs

**PART 3:** Revenue Features (Slices 7-9)
- Post job form
- Stripe payments
- Email system
- Polish features

**PART 4:** Deploy & Launch (Slices 10-12)
- Production deployment
- SEO setup
- Launch strategy

---

## 🎯 What You're Building

**A production-ready PMHNP job board with:**
- 200-500+ real jobs from API aggregation
- Stripe payments ($99-$199 per post)
- Email alerts system
- Type-safe database with Prisma
- Deployed live on the internet

**Timeline:** 16-20 hours over 2-3 days

**Approach:** Vertical Slice Architecture
- Each slice = complete working feature (DB → API → UI)
- Test after every slice
- See progress every 1-2 hours

---

## 🛠️ Prerequisites (30 minutes)

### 1. Install Required Tools

**Node.js (v18+):**
```bash
node --version
# If not installed: nodejs.org
```

### 2. Create Accounts (All Free Tiers)

- [ ] **Supabase** (supabase.com) - PostgreSQL database host
- [ ] **Vercel** (vercel.com) - Deployment hosting
- [ ] **Stripe** (stripe.com) - Payment processing
- [ ] **Resend** (resend.com) - Email service
- [ ] **Adzuna** (developer.adzuna.com) - Job API

### 3. Prepare API Keys Document

Create a text file and save this (we'll fill it step by step):

```bash
# Database
DATABASE_URL=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Resend
RESEND_API_KEY=

# Adzuna
ADZUNA_APP_ID=
ADZUNA_APP_KEY=

# App
CRON_SECRET=
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## 📦 Project Setup (30 minutes)

### Step 1: Create Next.js Project

```bash
npx create-next-app@latest pmhnp-job-board
```

**Selections:**
- TypeScript: **Yes**
- ESLint: **Yes**
- Tailwind CSS: **Yes**
- `src/` directory: **No**
- App Router: **Yes**
- Import alias: **Yes** (@/*)

```bash
cd pmhnp-job-board
code .
```

### Step 2: Install Dependencies

```bash
# Core dependencies
npm install @prisma/client
npm install -D prisma

# UI & utilities
npm install lucide-react date-fns
npm install class-variance-authority clsx tailwind-merge
npm install react-hook-form @hookform/resolvers zod

# Payments & email
npm install stripe resend
```

### Step 3: Initialize Prisma

```bash
npx prisma init
```

This creates:
- `prisma/schema.prisma` - Your database schema
- `.env` - Environment variables (including DATABASE_URL)

---

## 🗄️ Database Setup with Prisma (45 minutes)

### Step 1: Create Supabase Project

1. Go to **supabase.com** → New Project
2. Name: `pmhnp-job-board`
3. Generate password → **SAVE IT**
4. Choose region (closest to you)
5. Wait 2 minutes

### Step 2: Get Database Connection String

1. Supabase Dashboard → **Project Settings** → **Database**
2. Scroll to **Connection String** → **URI** (not Transaction mode)
3. Copy the connection string
4. Replace `[YOUR-PASSWORD]` with your actual password

Example:
```
postgresql://postgres:[YOUR-PASSWORD]@db.abc123xyz.supabase.co:5432/postgres
```

### Step 3: Add to Environment Variables

**Update `.env` file:**

```bash
# Database
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.abc123xyz.supabase.co:5432/postgres"

# Stripe (leave empty for now)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Resend (leave empty for now)
RESEND_API_KEY=

# Adzuna (leave empty for now)
ADZUNA_APP_ID=
ADZUNA_APP_KEY=

# App
CRON_SECRET=random_secret_string_here
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**Add to `.gitignore`:**
```
.env
.env.local
```

### Step 4: Create Prisma Schema

**Replace contents of `prisma/schema.prisma`:**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Job {
  id                    String    @id @default(uuid())
  title                 String
  employer              String
  location              String
  jobType               String?   @map("job_type")
  mode                  String?
  description           String
  descriptionSummary    String?   @map("description_summary")
  salaryRange           String?   @map("salary_range")
  minSalary             Int?      @map("min_salary")
  maxSalary             Int?      @map("max_salary")
  salaryPeriod          String?   @map("salary_period")
  applyLink             String    @map("apply_link")
  isFeatured            Boolean   @default(false) @map("is_featured")
  isPublished           Boolean   @default(true) @map("is_published")
  isVerifiedEmployer    Boolean   @default(false) @map("is_verified_employer")
  sourceType            String?   @map("source_type")
  sourceProvider        String?   @map("source_provider")
  externalId            String?   @map("external_id")
  viewCount             Int       @default(0) @map("view_count")
  applyClickCount       Int       @default(0) @map("apply_click_count")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")
  expiresAt             DateTime? @map("expires_at")
  
  employerJobs          EmployerJob[]

  @@index([isPublished])
  @@index([isFeatured])
  @@index([location])
  @@index([createdAt(sort: Desc)])
  @@index([minSalary, maxSalary])
  @@map("jobs")
}

model EmailLead {
  id          String   @id @default(uuid())
  email       String   @unique
  preferences Json     @default("{}")
  source      String?
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([email])
  @@map("email_leads")
}

model EmployerJob {
  id                  String   @id @default(uuid())
  employerName        String   @map("employer_name")
  contactEmail        String   @map("contact_email")
  companyLogoUrl      String?  @map("company_logo_url")
  companyDescription  String?  @map("company_description")
  companyWebsite      String?  @map("company_website")
  jobId               String   @map("job_id")
  editToken           String   @unique @map("edit_token")
  paymentStatus       String   @map("payment_status")
  createdAt           DateTime @default(now()) @map("created_at")

  job                 Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@index([editToken])
  @@map("employer_jobs")
}

model SiteStat {
  id                String   @id @default(uuid())
  totalJobs         Int      @default(0) @map("total_jobs")
  totalSubscribers  Int      @default(0) @map("total_subscribers")
  totalCompanies    Int      @default(0) @map("total_companies")
  updatedAt         DateTime @updatedAt @map("updated_at")

  @@map("site_stats")
}
```

### Step 5: Push Schema to Database

```bash
npx prisma db push
```

This creates all tables in Supabase.

**You should see:**
```
✔ Generated Prisma Client
✔ The database is now in sync with the Prisma schema
```

### Step 6: Generate Prisma Client

```bash
npx prisma generate
```

This creates the TypeScript client for your database.

### Step 7: Create Prisma Client Instance

**Create `lib/prisma.ts`:**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

**Why this pattern?** Prevents multiple Prisma Client instances in development (hot reload issue).

### Step 8: Add Test Jobs

**Create `prisma/seed.ts`:**

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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
  })
```

**Add to `package.json`:**

```json
{
  "prisma": {
    "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
  }
}
```

**Install ts-node:**

```bash
npm install -D ts-node
```

**Run seed:**

```bash
npx prisma db seed
```

**Verify in Supabase:**
1. Supabase Dashboard → Table Editor
2. Select `jobs` table
3. Should see 5 test jobs

**✅ CHECKPOINT:**
- [ ] Prisma schema created
- [ ] Database pushed (`npx prisma db push` succeeded)
- [ ] Prisma Client generated
- [ ] `lib/prisma.ts` created
- [ ] 5 test jobs in database
- [ ] Can view jobs in Supabase dashboard

---

## 📁 Foundation Files (15 minutes)

These files prevent AI coding mistakes and define your product.

### Step 1: Create .cursorrules

**Create `.cursorrules` in project root:**

```
You are an expert full-stack developer building a PMHNP job board with Next.js, Prisma, and TypeScript.

CRITICAL RULES - NEVER BREAK THESE:
1. NEVER refactor working code unless explicitly asked
2. When I say "create X", create ONLY that file, don't touch others
3. NEVER replace code with comments or placeholders like "// rest of code here"
4. NEVER change unrelated code when fixing something
5. If something works, LEAVE IT ALONE

PRISMA RULES:
1. Always import prisma from '@/lib/prisma'
2. Use Prisma Client's type-safe queries (no raw SQL unless necessary)
3. Handle Prisma errors with try/catch
4. Use proper TypeScript types from Prisma

RESPONSE FORMAT:
- Always write complete, working code
- Show me what you're changing and why
- Ask for clarification if my request is ambiguous

TECH STACK:
- Next.js 14 with App Router
- TypeScript with strict types
- Prisma ORM for database
- Tailwind CSS (no separate CSS files)
- Stripe for payments
- Resend for emails

CODE STYLE:
- Functional components with hooks
- Server components by default, "use client" only when needed
- Async/await for all promises
- Try/catch for error handling
- Descriptive variable names (no single letters except i, j in loops)

CONSTRAINTS:
- Do NOT install new packages without asking
- Do NOT use UI libraries (no shadcn, no MUI, etc)
- Do NOT use experimental Next.js features
- Do NOT create separate CSS files (Tailwind only)

WORKFLOW:
1. I give you a specific task
2. You execute it exactly as stated
3. You show me the complete code
4. You tell me what to test
5. If I report an error, you fix ONLY that error

If you're unsure about something, ASK before making changes.
```

### Step 2: Create instructions.md

**Create `instructions.md` in project root:**

```markdown
# PMHNP Job Board - Product Requirements

## Product Goal
A specialized job board for Psychiatric Mental Health Nurse Practitioners that aggregates jobs from multiple sources and allows employers to post paid listings.

## Core Value Proposition
- **For PMHNPs:** Find remote & local psych NP jobs with salary transparency
- **For Employers:** Access targeted audience of qualified candidates
- **For Us:** Build owned email list, generate revenue from job posts

## Technical Architecture

### Database (Prisma + PostgreSQL)
- Job: All job listings (external + employer-posted)
- EmailLead: Email subscribers
- EmployerJob: Paid job posts with edit tokens
- SiteStat: Social proof counters

### Job Sources (200-500+ jobs)
- Adzuna API (100-300 healthcare jobs)
- USAJOBS API (5-30 federal positions)
- Greenhouse ATS (talkiatry, talkspace, sondermind)
- Lever ATS (headway)

### Revenue Model
- Standard Job Post: $99 (30-day listing)
- Featured Job Post: $199 (top placement + verified badge)
- Target: $5k+/month at scale

### Core Features
1. Job browsing with search & filters
2. Salary transparency (extraction from descriptions, state averages)
3. Job aggregation from 5+ sources (automated via cron)
4. Employer job posting with Stripe payment
5. Email signup & weekly digest
6. Mobile-responsive design (60%+ users browse on mobile)
7. Social proof counters (jobs, subscribers, companies)
8. Saved jobs (localStorage)
9. Edit job functionality for employers

### Quality Signals
- Verified employer badges
- View/apply click tracking
- Real salary ranges (not "competitive")
- Source attribution

### Tech Stack
- Frontend: Next.js 14, TypeScript, Tailwind CSS
- Database: Prisma ORM + PostgreSQL (hosted on Supabase)
- Payments: Stripe
- Email: Resend
- Hosting: Vercel
- Job APIs: Adzuna, USAJOBS, Greenhouse, Lever

### Non-Goals (V2 Features)
- User accounts with auth
- Resume database
- Application tracking through site
- Advanced analytics dashboard
- Mobile app
- Community forum

## Success Metrics
- Week 1: 200+ jobs, 50+ email signups, 2-3 paid posts
- Month 1: 500+ jobs, 300+ signups, 15+ paid posts, $1,500 revenue
- Month 3: 1,000+ jobs, $5,000/month revenue
```

---

## 🧪 Test Basic Setup (5 minutes)

### Step 1: Test Dev Server

```bash
npm run dev
```

Visit `http://localhost:3000`

Should see default Next.js page.

### Step 2: Test Prisma Connection

**Create `app/api/test/route.ts`:**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const jobCount = await prisma.job.count()
    return NextResponse.json({ 
      success: true, 
      jobCount,
      message: 'Prisma connected!' 
    })
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
```

Visit `http://localhost:3000/api/test`

Should see:
```json
{
  "success": true,
  "jobCount": 5,
  "message": "Prisma connected!"
}
```

**✅ CHECKPOINT - Foundation Complete:**
- [ ] Dev server runs (`npm run dev`)
- [ ] Prisma connected (test endpoint returns success)
- [ ] 5 jobs in database
- [ ] `.cursorrules` file exists
- [ ] `instructions.md` file exists
- [ ] No console errors

### Step 3: First Git Commit

```bash
git init
git add .
git commit -m "Initial setup: Next.js + Prisma + foundation files"
```

---

## 🎯 Next Steps

**You're ready for PART 2: Core Features!**

In Part 2, you'll build:
- **Slice 1:** View Jobs (see your 5 test jobs on screen!)
- **Slice 2:** Job Details page
- **Slice 3:** Search & Filters
- **Slice 4:** Job Aggregation - Adzuna (100+ real jobs!)
- **Slice 5:** Multiple Job Sources (200+ total jobs!)

Each slice takes 1-2 hours and gives you a complete working feature.

---

## 🔧 Troubleshooting

### "Prisma Client not generated"
```bash
npx prisma generate
```

### "Database connection failed"
- Check `DATABASE_URL` in `.env`
- Verify password has no special characters that need escaping
- Test connection in Supabase dashboard

### "Module not found"
```bash
npm install
npx prisma generate
```
Restart dev server.

### "Jobs not seeding"
```bash
# Check seed script
npx prisma db seed

# Or manually run
npx ts-node prisma/seed.ts
```

### Need to reset database
```bash
npx prisma db push --force-reset
npx prisma db seed
```

---

## 📚 Prisma Quick Reference

**Common commands:**
```bash
# View database in browser
npx prisma studio

# Push schema changes
npx prisma db push

# Generate client after schema changes
npx prisma generate

# Seed database
npx prisma db seed

# View/format schema
npx prisma format
```

**Common queries:**
```typescript
// Find many
const jobs = await prisma.job.findMany({
  where: { isPublished: true },
  orderBy: { createdAt: 'desc' },
  take: 20
})

// Find unique
const job = await prisma.job.findUnique({
  where: { id: jobId }
})

// Create
const job = await prisma.job.create({
  data: { title: 'PMHNP', employer: 'Company', ... }
})

// Update
await prisma.job.update({
  where: { id: jobId },
  data: { viewCount: { increment: 1 } }
})

// Count
const count = await prisma.job.count({
  where: { isPublished: true }
})
```

---

## 💪 You're Ready!

Foundation is complete. You have:
- ✅ Next.js project with TypeScript
- ✅ Prisma ORM connected to PostgreSQL
- ✅ Type-safe database schema
- ✅ 5 test jobs
- ✅ Foundation files to guide AI
- ✅ Working dev environment

**Time to build features!**

**Continue to PART 2: Core Features** 🚀