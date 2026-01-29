# 🏥 PMHNP Job Board

> **The #1 Job Board for Psychiatric Mental Health Nurse Practitioners**  
> A comprehensive platform connecting PMHNPs with their ideal career opportunities through intelligent job aggregation and seamless employer-candidate matching.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-cyan?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-teal?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635bff?style=flat-square&logo=stripe)](https://stripe.com/)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel&style=flat-square)](https://vercel.com)

🔗 **Live Site:** [pmhnpjobs.com](https://pmhnpjobs.com)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Database Schema](#-database-schema)
- [API Endpoints](#-api-endpoints)
- [Job Aggregation](#-job-aggregation)
- [Environment Variables](#-environment-variables)
- [Deployment](#-deployment)
- [Scripts & Maintenance](#-scripts--maintenance)
- [Contributing](#-contributing)

---

## 📖 Overview

**PMHNP Job Board** is a specialized, full-stack platform designed to streamline the job search process for Psychiatric Mental Health Nurse Practitioners. The platform aggregates job listings from multiple sources, normalizes data, and provides a seamless experience for both job seekers and employers.

### 🎯 Mission

To be the most comprehensive and user-friendly job board specifically tailored for psychiatric mental health professionals, making it easier for PMHNPs to find their ideal positions and for employers to connect with qualified candidates.

### 📊 Platform Statistics

- **8,500+** Active job listings
- **1,700+** Hiring companies
- **200+** Jobs added daily
- **Multi-source aggregation** from 6+ job APIs
- **50+ US states** covered

---

## 🌟 Key Features

### For Job Seekers 🔍

| Feature | Description |
|---------|-------------|
| **Advanced Search & Filters** | Filter by work mode (Remote, Hybrid, In-Person), job type, salary range, location, and keywords |
| **Saved Jobs** | Bookmark jobs and access them later across devices |
| **Job Alerts** | Create custom alerts with filters; receive daily or weekly email notifications |
| **One-Click Apply** | Direct application links to employer websites |
| **Salary Insights** | Normalized salary data (hourly ↔ annual conversion) with estimated ranges |
| **Location-Based Search** | Search by city, state, or remote-only positions |
| **Fresh Content** | Jobs updated daily from multiple trusted sources |

### For Employers 💼

| Feature | Description |
|---------|-------------|
| **Free Job Posting** | Post jobs for free with 30-day visibility |
| **Premium Listings** | Featured placement ($99) and extended duration options |
| **Employer Dashboard** | Track views, clicks, and application metrics in real-time |
| **Easy Management** | Edit or renew jobs with unique dashboard tokens (no account required) |
| **Stripe Integration** | Secure payment processing with automatic invoicing |
| **Email Notifications** | Alerts for job expiration and renewal opportunities |

### Technical Excellence 🛠️

| Feature | Description |
|---------|-------------|
| **Multi-Source Aggregation** | Automatically fetches from Adzuna, Jooble, Greenhouse, Lever, and more |
| **Smart Deduplication** | Advanced algorithms prevent duplicate listings |
| **Salary Normalization** | Converts hourly/weekly/monthly to annual for accurate comparisons |
| **Location Parsing** | Extracts city, state, country from various location formats |
| **Company Normalization** | Deduplicates company names (e.g., "Kaiser" = "Kaiser Permanente") |
| **SEO Optimized** | Dynamic sitemaps, structured data, and optimized meta tags |
| **High Performance** | Server-side rendering, edge caching, and optimized database queries |

---

## 🛠 Tech Stack

### Core Technologies

- **Framework:** [Next.js 15](https://nextjs.org/) (App Router with Server Components)
- **Language:** [TypeScript 5](https://www.typescriptlang.org/)
- **Database:** [PostgreSQL](https://www.postgresql.org/) hosted on [Supabase](https://supabase.com/)
- **ORM:** [Prisma 6](https://www.prisma.io/) with PgBouncer connection pooling
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com/)
- **Authentication:** [Supabase Auth](https://supabase.com/auth)
- **Payments:** [Stripe](https://stripe.com/) (Checkout, Invoices, Webhooks)
- **Email Service:** [Resend](https://resend.com/)
- **Deployment:** [Vercel](https://vercel.com) (Edge Network + Serverless Functions)
- **Cron Jobs:** Vercel Cron for scheduled tasks

### Developer Tools

- **Linting:** ESLint with TypeScript rules
- **Code Quality:** Prettier for formatting
- **Git Hooks:** Husky (optional)
- **Testing:** Vitest for unit tests
- **Database GUI:** Prisma Studio

### External APIs

- **Adzuna** - Job search API
- **Jooble** - Job aggregation
- **Careerjet** - International jobs
- **Greenhouse** - ATS integration
- **Lever** - ATS integration
- **LinkedIn** - Job postings

---

## 🚀 Getting Started

Follow these steps to run the project locally.

### Prerequisites

Ensure you have the following installed:

- **Node.js** 20.x or higher
- **npm** or **pnpm**
- **PostgreSQL** database (Supabase recommended)
- **Git**

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/pmhnp-job-board.git
   cd pmhnp-job-board
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   
   Copy the example file and configure:
   ```bash
   cp .env.example .env.local
   ```
   
   Fill in your credentials (see [Environment Variables](#-environment-variables) section)

4. **Set up the database:**
   
   ```bash
   # Generate Prisma Client
   npx prisma generate
   
   # Push schema to database
   npx prisma db push
   
   # (Optional) Seed with sample data
   npx prisma db seed
   ```

5. **Run the development server:**
   ```bash
   npm run dev
   ```
   
   Open [http://localhost:3000](http://localhost:3000) in your browser.

6. **Open Prisma Studio (optional):**
   ```bash
   npx prisma studio
   ```
   
   View and edit your database at [http://localhost:5555](http://localhost:5555)

---

## 🏗 Project Structure

```bash
pmhnp-job-board/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Authentication pages (grouped route)
│   │   ├── login/
│   │   ├── signup/
│   │   └── forgot-password/
│   ├── api/                      # API Routes
│   │   ├── admin/                # Admin endpoints
│   │   ├── analytics/            # Analytics tracking
│   │   ├── auth/                 # Auth callbacks
│   │   ├── companies/            # Company management
│   │   ├── cron/                 # Scheduled jobs
│   │   │   ├── aggregate-jobs/
│   │   │   ├── check-expired/
│   │   │   └── send-job-alerts/
│   │   ├── email/                # Email endpoints
│   │   ├── employer/             # Employer dashboard API
│   │   ├── jobs/                 # Job listings & filters
│   │   ├── job-alerts/           # Alert management
│   │   ├── outreach/             # Employer outreach
│   │   ├── stats/                # Site statistics
│   │   └── webhooks/             # Stripe webhooks
│   ├── admin/                    # Admin panel
│   │   ├── jobs/
│   │   └── outreach/
│   ├── dashboard/                # User dashboard
│   ├── employer/                 # Employer-specific pages
│   │   ├── dashboard/
│   │   └── renewal-success/
│   ├── jobs/                     # Job listing pages
│   │   ├── [slug]/               # Individual job page
│   │   ├── city/                 # City-specific jobs
│   │   ├── state/                # State-specific jobs
│   │   ├── remote/               # Remote jobs
│   │   └── edit/                 # Edit job
│   ├── post-job/                 # Job posting flow
│   │   ├── preview/
│   │   └── checkout/
│   ├── page.tsx                  # Homepage
│   ├── layout.tsx                # Root layout
│   └── globals.css               # Global styles
├── components/                   # Reusable React components
│   ├── auth/                     # Auth-related components
│   ├── jobs/                     # Job card, filters, etc.
│   ├── ui/                       # Base UI components
│   ├── Header.tsx
│   ├── Footer.tsx
│   └── StatsSection.tsx
├── lib/                          # Business logic & utilities
│   ├── aggregators/              # Job aggregation sources
│   │   ├── adzuna.ts
│   │   ├── jooble.ts
│   │   ├── careerjet.ts
│   │   ├── greenhouse.ts
│   │   └── lever.ts
│   ├── auth/                     # Auth helpers
│   │   └── protect.ts            # Route protection
│   ├── supabase/                 # Supabase clients
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client
│   │   └── admin.ts              # Admin client
│   ├── alert-sender.ts           # Job alerts
│   ├── company-normalizer.ts     # Company deduplication
│   ├── deduplicator.ts           # Job deduplication
│   ├── email-service.ts          # Email sending
│   ├── expiry-checker.ts         # Job expiration
│   ├── ingestion-service.ts      # Job ingestion
│   ├── job-normalizer.ts         # Job data normalization
│   ├── location-parser.ts        # Location extraction
│   ├── salary-normalizer.ts      # Salary conversion
│   ├── prisma.ts                 # Prisma client
│   └── utils.ts                  # Utility functions
├── prisma/                       # Database
│   ├── schema.prisma             # Database schema
│   ├── seed.ts                   # Seed data
│   └── migrations/               # Migration history
├── public/                       # Static assets
│   ├── favicon.svg
│   └── logo.svg
├── scripts/                      # Maintenance scripts
│   ├── fetch-company-data.ts     # Export company data
│   ├── link-all-jobs.ts          # Link jobs to companies
│   ├── check-companies.ts        # Company stats
│   └── audit-salaries.ts         # Salary data audit
├── types/                        # TypeScript type definitions
│   ├── filters.ts
│   └── job.ts
├── .env.local                    # Environment variables (not in git)
├── .env.example                  # Example env file
├── next.config.ts                # Next.js configuration
├── tailwind.config.ts            # Tailwind configuration
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Dependencies
└── README.md                     # This file
```

---

## 💾 Database Schema

The database uses **PostgreSQL** with **Prisma ORM**. Here's an overview of the main tables:

### Core Tables

#### `jobs`
Main job listings table with 30+ fields:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `title` | String | Job title |
| `slug` | String | SEO-friendly URL |
| `employer` | String | Company/employer name |
| `description` | Text | Full job description |
| `location` | String | Original location string |
| `city`, `state`, `stateCode` | String | Parsed location |
| `country` | String | Country code (default: US) |
| `isRemote`, `isHybrid` | Boolean | Work mode flags |
| `jobType` | String | Full-Time, Part-Time, Contract, Per Diem |
| `mode` | String | Remote, Hybrid, In-Person |
| `salaryRange` | String | Original salary text |
| `minSalary`, `maxSalary` | Int | Parsed salary values |
| `normalizedMinSalary`, `normalizedMaxSalary` | Int | Annual salary |
| `displaySalary` | String | User-friendly format |
| `applyLink` | String | Application URL |
| `isFeatured` | Boolean | Premium listing |
| `isPublished` | Boolean | Visibility status |
| `sourceType` | String | aggregated, employer, manual |
| `sourceProvider` | String | adzuna, jooble, etc. |
| `externalId` | String | Source's job ID |
| `viewCount` | Int | Page views |
| `applyClickCount` | Int | Apply button clicks |
| `companyId` | UUID | Link to companies table |
| `createdAt`, `updatedAt` | Timestamp | Dates |
| `expiresAt` | Timestamp | Expiration date |

**Indexes:** `isPublished`, `isFeatured`, `location`, `state`, `isRemote`, `companyId`, `slug`, `createdAt`

#### `companies`
Normalized company directory:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | String | Canonical company name (unique) |
| `normalizedName` | String | Lowercase for matching (unique) |
| `aliases` | String[] | Alternative name variations |
| `logoUrl` | String | Company logo |
| `website` | String | Company website |
| `description` | Text | Company description |
| `jobCount` | Int | Number of active jobs |
| `isVerified` | Boolean | Verified employer |
| `createdAt`, `updatedAt` | Timestamp | Dates |

**Purpose:** Deduplicate company names (e.g., "Kaiser" = "Kaiser Permanente")

#### `employer_jobs`
Paid job postings metadata:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `jobId` | UUID | Link to jobs table (unique) |
| `employerName` | String | Employer name |
| `contactEmail` | String | Contact email |
| `companyLogoUrl` | String | Logo URL |
| `companyDescription` | Text | Description |
| `companyWebsite` | String | Website |
| `editToken` | String | For editing (unique) |
| `dashboardToken` | String | For dashboard access (unique) |
| `paymentStatus` | String | pending, paid, free, etc. |
| `expiryWarningSentAt` | Timestamp | Warning email sent |
| `createdAt`, `updatedAt` | Timestamp | Dates |

#### `email_leads`
Newsletter subscribers:

| Column | Type | Description |
|--------|------|-------------|
| `id` | CUID | Primary key |
| `email` | String | Email address (unique) |
| `preferences` | JSON | Email preferences |
| `source` | String | Signup source |
| `isSubscribed` | Boolean | Active subscription |
| `unsubscribeToken` | String | Unsubscribe link token (unique) |
| `createdAt`, `updatedAt` | Timestamp | Dates |

#### `job_alerts`
Custom job search alerts:

| Column | Type | Description |
|--------|------|-------------|
| `id` | CUID | Primary key |
| `email` | String | User email |
| `name` | String | Alert name |
| `keyword` | String | Search keyword |
| `location` | String | Location filter |
| `mode` | String | Remote, Hybrid, In-Person |
| `jobType` | String | Full-Time, Part-Time, etc. |
| `minSalary`, `maxSalary` | Int | Salary range |
| `frequency` | String | daily, weekly |
| `isActive` | Boolean | Alert enabled |
| `lastSentAt` | Timestamp | Last email sent |
| `token` | String | Manage/delete token (unique) |
| `createdAt`, `updatedAt` | Timestamp | Dates |

#### `employer_leads`
Outreach & sales pipeline:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `companyName` | String | Company name |
| `contactName` | String | Contact person |
| `contactEmail` | String | Email |
| `contactTitle` | String | Job title |
| `website` | String | Company website |
| `linkedInUrl` | String | LinkedIn profile |
| `notes` | Text | Internal notes |
| `status` | String | prospect, contacted, etc. |
| `source` | String | Lead source |
| `lastContactedAt` | Timestamp | Last contact |
| `nextFollowUpAt` | Timestamp | Next follow-up |
| `jobsPosted` | Int | Jobs posted count |
| `createdAt`, `updatedAt` | Timestamp | Dates |

#### `user_profiles`
User account data:

| Column | Type | Description |
|--------|------|-------------|
| `id` | CUID | Primary key |
| `supabaseId` | String | Supabase Auth ID (unique) |
| `email` | String | Email (unique) |
| `role` | String | job_seeker, employer, admin |
| `firstName`, `lastName` | String | Name |
| `phone` | String | Phone number |
| `company` | String | Company name |
| `resumeUrl` | String | Resume file URL |
| `avatarUrl` | String | Profile picture |
| `createdAt`, `updatedAt` | Timestamp | Dates |

### Analytics Tables

- **`apply_clicks`** - Track apply button clicks
- **`source_stats`** - Performance metrics per source
- **`site_stats`** - Overall platform statistics

### Other Tables

- **`job_drafts`** - Temporary saved job posts
- **`saved_jobs`** - User bookmarks (in user_profiles relation)

---

## 🔌 API Endpoints

### Public Endpoints

#### Jobs
- `GET /api/jobs` - List all jobs (with filters)
- `GET /api/jobs/[id]` - Get single job
- `GET /api/jobs/categories` - Category counts
- `POST /api/jobs/filter-counts` - Get filter counts

#### Stats
- `GET /api/stats` - Platform statistics
- `GET /api/analytics/track-view` - Track job view
- `GET /api/analytics/track-apply` - Track apply click

#### Job Alerts
- `POST /api/job-alerts/create` - Create alert
- `GET /api/job-alerts/manage` - Manage alerts
- `DELETE /api/job-alerts/[id]` - Delete alert

#### Email
- `POST /api/subscribe` - Newsletter signup
- `POST /api/contact` - Contact form

### Employer Endpoints

- `POST /api/employer/jobs` - Create free job post
- `GET /api/employer/dashboard` - Dashboard data
- `PATCH /api/employer/jobs/[id]` - Edit job
- `POST /api/create-checkout` - Stripe checkout session
- `POST /api/create-renewal-checkout` - Renewal checkout
- `POST /api/create-upgrade-checkout` - Upgrade to featured

### Admin Endpoints 🔒

Require authentication with `admin` role:

- `GET /api/admin/jobs` - All jobs with management
- `GET /api/admin/stats` - Detailed analytics
- `POST /api/admin/jobs/feature` - Feature a job
- `DELETE /api/admin/jobs/[id]` - Delete job
- `GET /api/admin/outreach` - Employer leads
- `POST /api/admin/outreach` - Create lead

### Cron Endpoints 🕐

Protected by `CRON_SECRET`:

- `POST /api/cron/aggregate-jobs` - Fetch from all sources
- `POST /api/cron/aggregate-adzuna` - Adzuna only
- `POST /api/cron/aggregate-jooble` - Jooble only
- `POST /api/cron/check-expired-jobs` - Mark expired jobs
- `POST /api/cron/send-job-alerts` - Send email alerts
- `POST /api/cron/cleanup-descriptions` - Clean HTML
- `POST /api/cron/send-expiry-warnings` - Warn employers

### Webhooks

- `POST /api/webhooks/stripe` - Stripe payment webhooks

---

## 🤖 Job Aggregation

The platform automatically fetches jobs from multiple sources using scheduled cron jobs.

### Supported Sources

| Source | API | Update Frequency | Jobs/Day |
|--------|-----|------------------|----------|
| **Adzuna** | REST API | Every 4 hours | ~500 |
| **Jooble** | REST API | Every 6 hours | ~300 |
| **Careerjet** | REST API | Daily | ~200 |
| **Greenhouse** | ATS Scraper | Daily | ~50 |
| **Lever** | ATS Scraper | Daily | ~50 |
| **LinkedIn** | API | Weekly | ~100 |

### Aggregation Pipeline

```
┌─────────────┐
│  Cron Job   │  Runs every 4-6 hours
└──────┬──────┘
       │
       ├──────────────────────────────────────┐
       │                                      │
┌──────▼──────┐                      ┌───────▼──────┐
│  Fetch Jobs │                      │ Process Jobs │
│  from APIs  │─────────────────────▶│  Normalize   │
│             │   Raw job data       │  Clean       │
└─────────────┘                      └──────┬───────┘
                                            │
                        ┌───────────────────┼───────────────────┐
                        │                   │                   │
                 ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
                 │ Deduplicate │    │  Parse      │    │  Normalize  │
                 │  Check if   │    │  Locations  │    │  Salaries   │
                 │  exists     │    │  City/State │    │  → Annual   │
                 └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
                        │                   │                   │
                        └───────────────────┼───────────────────┘
                                            │
                                     ┌──────▼──────┐
                                     │   Link to   │
                                     │  Companies  │
                                     │   Table     │
                                     └──────┬──────┘
                                            │
                                     ┌──────▼──────┐
                                     │  Save to    │
                                     │  Database   │
                                     └─────────────┘
```

### Data Normalization

**Salary Conversion:**
- Hourly → Annual: `hourly * 40 * 52`
- Monthly → Annual: `monthly * 12`
- Weekly → Annual: `weekly * 52`

**Location Parsing:**
- Extract city, state, country from free-text
- Standardize state codes (e.g., "California" → "CA")
- Flag remote/hybrid positions

**Company Normalization:**
- Match variations: "Kaiser" = "Kaiser Permanente"
- Create canonical company records
- Link jobs to companies table

---

## 🔐 Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```bash
# ============================================================================
# DATABASE
# ============================================================================
DATABASE_URL="postgresql://user:password@host:6543/database?pgbouncer=true"
DIRECT_URL="postgresql://user:password@host:5432/database"

# ============================================================================
# SUPABASE
# ============================================================================
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# ============================================================================
# STRIPE
# ============================================================================
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_ID="price_..." # Product price ID for job posts

# ============================================================================
# EMAIL (RESEND)
# ============================================================================
RESEND_API_KEY="re_..."
FROM_EMAIL="noreply@yourdomain.com"
ADMIN_EMAIL="admin@yourdomain.com"

# ============================================================================
# JOB AGGREGATION APIs
# ============================================================================
ADZUNA_APP_ID="your-app-id"
ADZUNA_API_KEY="your-api-key"
JOOBLE_API_KEY="your-api-key"
CAREERJET_AFFID="your-affiliate-id"

# ============================================================================
# AUTHENTICATION & SECURITY
# ============================================================================
CRON_SECRET="your-secure-random-string" # Protect cron endpoints

# ============================================================================
# APPLICATION
# ============================================================================
NEXT_PUBLIC_BASE_URL="http://localhost:3000" # or production URL
NODE_ENV="development" # or "production"
```

---

## 🚢 Deployment

### Deploy to Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Configure environment variables
4. Deploy!

Full deployment guide available in the project wiki.

---

## 🔧 Scripts & Maintenance

### Development
```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run lint         # Run linter
npx prisma studio    # Open database GUI
```

### Database
```bash
npx prisma generate  # Generate Prisma Client
npx prisma db push   # Push schema changes
npx prisma migrate deploy  # Deploy migrations
```

### Maintenance Scripts
```bash
npx tsx scripts/fetch-company-data.ts  # Export company data
npx tsx scripts/link-all-jobs.ts       # Link jobs to companies
npx tsx scripts/audit-salaries.ts      # Audit salary data
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (use [Conventional Commits](https://www.conventionalcommits.org/))
4. Push to the branch
5. Open a Pull Request

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/pmhnp-job-board/issues)
- **Email:** support@pmhnpjobs.com

---

## 📄 License

This project is licensed under the **MIT License**.

---

**Built with ❤️ for the PMHNP community**
