# 🏥 PMHNP Job Board

> **The #1 Job Board for Psychiatric Mental Health Nurse Practitioners**  
> A comprehensive, production-ready platform connecting PMHNPs with their dream roles through intelligent job aggregation and modern web technologies.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-cyan?style=flat-square&logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-ORM-teal?style=flat-square&logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue?style=flat-square&logo=postgresql)
![Stripe](https://img.shields.io/badge/Stripe-Payments-635bff?style=flat-square&logo=stripe)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel&style=flat-square)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Features Deep Dive](#-features-deep-dive)
- [API Documentation](#-api-documentation)
- [Database Schema](#-database-schema)
- [Job Aggregation System](#-job-aggregation-system)
- [Scripts & Commands](#-scripts--commands)
- [Cron Jobs](#-cron-jobs)
- [Environment Variables](#-environment-variables)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## 📖 Overview

**PMHNP Job Board** is a specialized, full-stack job platform designed exclusively for Psychiatric Mental Health Nurse Practitioners. The platform features:

- **Multi-source job aggregation** from 6+ major job APIs
- **Smart deduplication** and data normalization
- **Real-time job alerts** with customizable filters
- **Employer dashboard** with analytics and applicant tracking
- **Payment processing** via Stripe for premium job posts
- **SEO-optimized** with dynamic sitemaps and structured data
- **Admin panel** for job and lead management
- **Responsive design** optimized for all devices

### 🌟 Key Features

#### For Job Seekers
| Feature | Description |
|---------|-------------|
| **Advanced Filtering** | Filter by location, work mode (remote/hybrid/in-person), job type, salary range |
| **One-Click Apply** | Direct application links with apply tracking |
| **Job Alerts** | Daily or weekly email alerts matching search criteria |
| **Saved Jobs** | Bookmark jobs for later review |
| **Resume Upload** | Upload and manage resume via Supabase Storage |
| **Location-Based Search** | Search by city, state, or remote |
| **Salary Display** | Normalized salary ranges with hourly ↔ annual conversion |

#### For Employers
| Feature | Description |
|---------|-------------|
| **Free Job Posting** | Post jobs for free during launch period |
| **Featured Listings** | Premium featured jobs with enhanced visibility |
| **Dashboard Analytics** | Track views, clicks, and applicant engagement |
| **Job Management** | Edit, renew, or upgrade active job posts |
| **Stripe Invoices** | Automatic PDF invoice generation |
| **Save Draft** | Save incomplete job posts and resume later via email |
| **Email Notifications** | Expiry warnings and renewal reminders |

#### Smart Job Aggregation System
| Feature | Description |
|---------|-------------|
| **6+ Data Sources** | Adzuna, Jooble, Greenhouse, Lever, CareerJet, USAJobs |
| **Auto-Deduplication** | Fuzzy matching on title, company, and apply URL |
| **Salary Normalization** | Converts all salary formats to standardized annual/hourly |
| **Location Parsing** | Extracts city, state, country, remote/hybrid status |
| **Company Linking** | Automatic company normalization and profile creation |
| **Quality Scoring** | Calculates confidence scores for data quality |
| **Freshness Decay** | Prioritizes recent jobs in search results |

#### SEO & Performance
| Feature | Description |
|---------|-------------|
| **Dynamic Sitemap** | Auto-generated XML sitemap for all jobs |
| **Structured Data** | Schema.org JobPosting and Organization markup |
| **Meta Tags** | Dynamic meta tags based on search filters |
| **ISR (Incremental Static Regeneration)** | 60-second revalidation for job pages |
| **Image Optimization** | Next.js Image component with AVIF/WebP |
| **Code Splitting** | Dynamic imports for non-critical components |

---

## 🛠 Tech Stack

### Frontend
- **[Next.js 16](https://nextjs.org/)** - React framework with App Router
- **[React 19](https://react.dev/)** - UI library
- **[TypeScript 5](https://www.typescriptlang.org/)** - Type safety
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Utility-first CSS
- **[Lucide React](https://lucide.dev/)** - Icon library
- **[React Hook Form](https://react-hook-form.com/)** - Form management
- **[Zod](https://zod.dev/)** - Schema validation

### Backend
- **[Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)** - Serverless API
- **[Prisma 7](https://www.prisma.io/)** - Type-safe ORM
- **[PostgreSQL](https://www.postgresql.org/)** - Relational database
- **[Supabase](https://supabase.com/)** - Auth & Storage

### Integrations
- **[Stripe](https://stripe.com/)** - Payment processing
- **[Resend](https://resend.com/)** - Transactional emails
- **[Upstash Redis](https://upstash.com/)** - Rate limiting
- **[@react-pdf/renderer](https://react-pdf.org/)** - Invoice generation

### Job Aggregation APIs
- **Adzuna API** - Job search aggregator
- **Jooble API** - International job search
- **Greenhouse API** - ATS integration
- **Lever API** - ATS integration
- **CareerJet API** - Job board aggregator
- **USAJobs API** - Federal jobs

### DevOps
- **[Vercel](https://vercel.com/)** - Hosting & deployment
- **[Vercel Cron](https://vercel.com/docs/cron-jobs)** - Scheduled tasks
- **[Vitest](https://vitest.dev/)** - Unit testing
- **[ESLint](https://eslint.org/)** - Code linting
- **[Prettier](https://prettier.io/)** - Code formatting

---

## 🏗 Architecture

### System Design

```text
┌─────────────────────────────────────────────────────────────┐
│                     PMHNP Job Board                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐ │
│  │   Next.js   │────▶│   Prisma     │────▶│ PostgreSQL   │ │
│  │  Frontend   │     │     ORM      │     │   Database   │ │
│  └─────────────┘     └──────────────┘     └──────────────┘ │
│         │                                                     │
│         │                                                     │
│  ┌─────▼─────────────────────────────────────────────────┐ │
│  │           Next.js API Routes                           │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │  Jobs API  │  Auth API  │  Cron API  │  Webhooks API  │ │
│  └────────────────────────────────────────────────────────┘ │
│         │            │            │            │             │
│  ┌──────▼────┐  ┌───▼────┐  ┌───▼─────┐  ┌──▼──────┐      │
│  │ Job Agg.  │  │Supabase│  │ Vercel  │  │ Stripe  │      │
│  │  Engine   │  │  Auth  │  │  Cron   │  │Webhooks │      │
│  └───────────┘  └────────┘  └─────────┘  └─────────┘      │
│         │                                                     │
│  ┌──────▼──────────────────────────────────────────┐        │
│  │  External Job APIs (Adzuna, Jooble, etc.)      │        │
│  └─────────────────────────────────────────────────┘        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Job Ingestion** (Cron Jobs)
   - Vercel Cron triggers `/api/cron/ingest`
   - Fetches jobs from multiple sources
   - Normalizes data (salary, location, company)
   - Deduplicates using fuzzy matching
   - Links to company profiles
   - Stores in PostgreSQL via Prisma

2. **Job Search** (User-Facing)
   - User applies filters
   - Next.js Server Component fetches from DB
   - Results rendered with ISR (60s revalidation)
   - Client-side hydration for interactivity

3. **Job Posting** (Employer Flow)
   - Employer fills form
   - Validation via Zod schema
   - Draft saved with email resume token
   - Payment via Stripe Checkout
   - Webhook confirms payment
   - Job published to database

4. **Job Alerts** (Automated)
   - Cron runs daily at 8 AM
   - Queries alerts with matching criteria
   - Fetches new jobs since last send
   - Sends personalized emails via Resend

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 20+** ([Download](https://nodejs.org/))
- **PostgreSQL Database** (Supabase recommended)
- **Stripe Account** (for payments)
- **Resend Account** (for emails)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/pmhnp-job-board.git
   cd pmhnp-job-board
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   
   Create a `.env.local` file in the root directory:

   ```env
   # Database
   DATABASE_URL="postgresql://user:password@host:5432/database"

   # Supabase (Auth & Storage)
   NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
   SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

   # App URL
   NEXT_PUBLIC_BASE_URL="http://localhost:3000"

   # Email (Resend)
   RESEND_API_KEY="re_xxxxxxxxxxxxx"
   EMAIL_FROM="PMHNP Hiring <noreply@pmhnphiring.com>"

   # Stripe (Optional - for paid posting)
   STRIPE_SECRET_KEY="sk_test_xxxxxxxxxxxxx"
   STRIPE_WEBHOOK_SECRET="whsec_xxxxxxxxxxxxx"
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_xxxxxxxxxxxxx"

   # Feature Flags
   ENABLE_PAID_POSTING="false"

   # Cron Security
   CRON_SECRET="your-random-secret-string"

   # Job Aggregator APIs (Optional)
   ADZUNA_APP_ID="your-adzuna-app-id"
   ADZUNA_APP_KEY="your-adzuna-app-key"
   JOOBLE_API_KEY="your-jooble-api-key"

   # Monitoring (Optional)
   SENTRY_DSN="https://xxxxxxxxxxxxx@sentry.io/xxxxxxxxxxxxx"
   ```

4. **Setup Database:**
   ```bash
   # Generate Prisma Client
   npx prisma generate

   # Push schema to database
   npx prisma db push

   # (Optional) Seed database with test data
   npx prisma db seed
   ```

5. **Run Development Server:**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) to view the app.

6. **View Database (Optional):**
   ```bash
   npx prisma studio
   ```

---

## 📂 Project Structure

```text
pmhnp-job-board/
├── app/                      # Next.js 15+ App Router
│   ├── (auth)/               # Auth pages (login, signup, etc.)
│   ├── admin/                # Admin dashboard & management
│   │   ├── jobs/             # Admin job management
│   │   └── outreach/         # Employer lead management
│   ├── api/                  # API Routes
│   │   ├── admin/            # Admin endpoints
│   │   ├── analytics/        # Click tracking & stats
│   │   ├── auth/             # Auth endpoints
│   │   ├── cron/             # Scheduled job ingestion
│   │   ├── email/            # Email preferences
│   │   ├── employer/         # Employer dashboard API
│   │   ├── job-alerts/       # Job alert management
│   │   ├── jobs/             # Job CRUD operations
│   │   ├── outreach/         # Employer outreach API
│   │   ├── stats/            # Site statistics
│   │   └── webhooks/         # Stripe webhooks
│   ├── dashboard/            # User dashboard
│   ├── employer/             # Employer-specific pages
│   ├── jobs/                 # Job listing & detail pages
│   │   ├── [slug]/           # Dynamic job detail
│   │   ├── city/             # City-based search
│   │   ├── state/            # State-based search
│   │   ├── remote/           # Remote jobs
│   │   └── edit/             # Edit job (employer)
│   ├── post-job/             # Job posting flow
│   │   ├── checkout/         # Stripe checkout
│   │   └── preview/          # Preview before payment
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Homepage
│   ├── globals.css           # Global styles
│   ├── robots.ts             # Robots.txt generator
│   └── sitemap.ts            # Dynamic sitemap
│
├── components/               # Reusable UI Components
│   ├── auth/                 # Auth components
│   │   ├── LoginForm.tsx
│   │   ├── SignUpForm.tsx
│   │   ├── HeaderAuth.tsx
│   │   └── UserMenu.tsx
│   ├── jobs/                 # Job-related components
│   ├── ui/                   # Base UI components
│   │   ├── Badge.tsx
│   │   ├── Button.tsx
│   │   └── Card.tsx
│   ├── ApplyButton.tsx
│   ├── EmailSignupForm.tsx
│   ├── FAQAccordion.tsx
│   ├── Footer.tsx
│   ├── Header.tsx
│   ├── JobCard.tsx
│   ├── JobFilters.tsx
│   ├── SaveJobButton.tsx
│   ├── ShareButtons.tsx
│   └── StatsSection.tsx
│
├── lib/                      # Core Business Logic
│   ├── aggregators/          # Job source integrations
│   │   ├── adzuna.ts         # Adzuna API client
│   │   ├── jooble.ts         # Jooble API client
│   │   ├── greenhouse.ts     # Greenhouse ATS client
│   │   ├── lever.ts          # Lever ATS client
│   │   ├── careerjet.ts      # CareerJet API client
│   │   └── usajobs.ts        # USAJobs API client
│   ├── auth/                 # Auth utilities
│   │   └── protect.ts        # Route protection
│   ├── hooks/                # React hooks
│   ├── supabase/             # Supabase clients
│   ├── alert-sender.ts       # Job alert email service
│   ├── company-normalizer.ts # Company name normalization
│   ├── config.ts             # App configuration
│   ├── deduplicator.ts       # Job deduplication logic
│   ├── description-cleaner.ts# HTML/text cleanup
│   ├── email-service.ts      # Email sending (Resend)
│   ├── env.ts                # Environment validation
│   ├── expiry-checker.ts     # Job expiry warnings
│   ├── filters.ts            # Search filter logic
│   ├── freshness-decay.ts    # Job ranking algorithm
│   ├── ingestion-service.ts  # Main ingestion orchestrator
│   ├── invoice-generator.tsx # PDF invoice generation
│   ├── job-alerts-service.ts # Alert matching & sending
│   ├── job-normalizer.ts     # Job data normalization
│   ├── location-parser.ts    # Location extraction & parsing
│   ├── logger.ts             # Logging utility
│   ├── outreach-service.ts   # Employer outreach logic
│   ├── prisma.ts             # Prisma client singleton
│   ├── rate-limit.ts         # API rate limiting
│   ├── salary-display.ts     # Salary formatting
│   ├── salary-normalizer.ts  # Salary standardization
│   ├── sanitize.ts           # Input sanitization
│   ├── sentry.ts             # Error tracking
│   ├── source-analytics.ts   # Source performance tracking
│   ├── supabase-storage.ts   # File upload utilities
│   ├── types.ts              # Shared TypeScript types
│   └── utils.ts              # General utilities
│
├── prisma/                   # Database
│   ├── migrations/           # SQL migration files
│   ├── schema.prisma         # Database schema
│   └── seed.ts               # Seed data script
│
├── scripts/                  # Maintenance Scripts
│   ├── audit-and-fix-jobs.ts # Data quality audit
│   ├── audit-salaries.ts     # Salary validation
│   ├── backfill-locations.ts # Backfill location data
│   ├── clean-job-descriptions.ts
│   ├── fix-all-salaries.ts   # Salary fixes
│   ├── populate-display-salaries.ts
│   ├── run-ingestion.ts      # Manual ingestion trigger
│   ├── test-*.ts             # API testing scripts
│   └── tsconfig.json         # Scripts TypeScript config
│
├── tests/                    # Test Files
│   ├── api/                  # API tests
│   ├── lib/                  # Library tests
│   └── setup.ts              # Test configuration
│
├── types/                    # Type Definitions
│   ├── filters.ts
│   └── job.ts
│
├── public/                   # Static Assets
│   ├── favicon.svg
│   ├── logo.svg
│   ├── og-image.svg
│   └── *.svg
│
├── .env.local                # Environment variables (create this)
├── .gitignore
├── eslint.config.mjs         # ESLint configuration
├── next.config.ts            # Next.js configuration
├── package.json              # Dependencies
├── postcss.config.mjs        # PostCSS config
├── tailwind.config.ts        # Tailwind configuration
├── tsconfig.json             # TypeScript configuration
├── vercel.json               # Vercel deployment config
├── vitest.config.ts          # Vitest test config
└── README.md                 # This file
```

---

## 🎯 Features Deep Dive

### 1. Job Aggregation Engine

The heart of the platform is a sophisticated job ingestion system that:

**Sources Integrated:**
- **Adzuna** - Major job search aggregator (UK/US)
- **Jooble** - International job search engine
- **Greenhouse** - ATS for tech companies
- **Lever** - Modern ATS platform
- **CareerJet** - Job board aggregator
- **USAJobs** - Federal government jobs

**Ingestion Process:**
1. Fetch raw jobs from each source API
2. Normalize job data (title, company, location, salary)
3. Parse and structure location data (city, state, remote)
4. Normalize salaries to annual equivalent
5. Check for duplicates using fuzzy matching
6. Link to existing or create new company profiles
7. Store in database with source tracking

**Deduplication Logic:**
- Exact match on external ID
- Exact match on apply URL
- Fuzzy match on title + company + location
- Confidence scoring (0-1)

**Salary Normalization:**
- Detects period (hourly, weekly, monthly, annual)
- Converts all to annual equivalent
- Validates against PMHNP salary ranges ($80k-$250k)
- Confidence scoring for estimated salaries

### 2. Job Alerts System

**Features:**
- User-defined search criteria (location, mode, salary, type)
- Daily or weekly frequency options
- Email delivery via Resend
- Personalized job recommendations
- Unsubscribe/manage preferences links

**Implementation:**
- Cron job runs daily at 8 AM
- Queries active alerts not sent in last 24h/7d
- Matches new jobs against alert criteria
- Sends HTML emails with job cards
- Updates `lastSentAt` timestamp

### 3. Employer Dashboard

**Features:**
- View all posted jobs
- Analytics: views, clicks, applicant count
- Edit active job posts
- Renew expiring jobs
- Upgrade to featured
- Download Stripe invoices

**Access Control:**
- Token-based authentication
- Dashboard token in email
- Edit token for modifications

### 4. Admin Panel

**Capabilities:**
- Job management (approve, edit, delete)
- Employer lead tracking
- Outreach campaign management
- Source performance analytics
- Manual ingestion triggers

**Protected Routes:**
- Role-based access control
- Supabase Auth integration

### 5. Payment System

**Stripe Integration:**
- Checkout Sessions for job posts
- Webhook handling for payment confirmation
- Invoice generation via @react-pdf/renderer
- Renewal and upgrade flows
- Metadata tracking (job ID, tier)

**Pricing:**
- Standard: $99 (30 days)
- Featured: $199 (30 days, enhanced visibility)
- Renewals: $99
- Upgrades: $100 (standard → featured)
- **Free Mode:** Can disable payments via `ENABLE_PAID_POSTING=false`

---

## 📡 API Documentation

### Public Endpoints

#### `GET /api/jobs`
Fetch jobs with filters.

**Query Parameters:**
- `keyword` - Search term
- `location` - City/State
- `mode` - Remote, Hybrid, In-Person
- `jobType` - Full-Time, Part-Time, Contract, Per Diem
- `minSalary` - Minimum salary (annual)
- `maxSalary` - Maximum salary (annual)
- `page` - Pagination (default: 1)
- `limit` - Results per page (default: 50)

**Response:**
```json
{
  "success": true,
  "jobs": [...],
  "total": 245,
  "page": 1,
  "totalPages": 5
}
```

#### `POST /api/jobs/post-free`
Create a free job posting.

**Body:**
```json
{
  "title": "Remote PMHNP",
  "employer": "HealthCo",
  "location": "Remote",
  "mode": "Remote",
  "jobType": "Full-Time",
  "description": "...",
  "applyLink": "https://...",
  "contactEmail": "hiring@healthco.com",
  "minSalary": 120000,
  "maxSalary": 150000,
  "salaryPeriod": "annual"
}
```

#### `GET /api/job-alerts`
Fetch job alerts for email.

#### `POST /api/job-alerts`
Create a new job alert.

### Admin Endpoints

#### `GET /api/admin/stats`
Get dashboard statistics.

#### `POST /api/admin/trigger-ingestion`
Manually trigger job ingestion.

### Cron Endpoints (Protected)

#### `GET /api/cron/ingest?source=adzuna`
Ingest jobs from specified source.

**Auth:** `Authorization: Bearer <CRON_SECRET>`

#### `GET /api/cron/send-alerts`
Send job alert emails.

#### `GET /api/cron/expiry-warnings`
Send expiry warning emails to employers.

#### `GET /api/cron/freshness-decay`
Update job rankings based on age.

### Webhooks

#### `POST /api/webhooks/stripe`
Handle Stripe payment webhooks.

**Events:**
- `checkout.session.completed`
- Payment confirmation and job publication

---

## 🗄 Database Schema

### Core Models

#### Job
```prisma
model Job {
  id                  String   @id @default(uuid())
  title               String
  slug                String?  @unique
  employer            String
  location            String
  jobType             String?  // Full-Time, Part-Time, etc.
  mode                String?  // Remote, Hybrid, In-Person
  description         String
  descriptionSummary  String?
  
  // Parsed location
  city                String?
  state               String?
  stateCode           String?
  country             String?  @default("US")
  isRemote            Boolean  @default(false)
  isHybrid            Boolean  @default(false)
  
  // Salary (normalized to annual)
  normalizedMinSalary Int?
  normalizedMaxSalary Int?
  salaryPeriod        String?
  displaySalary       String?  // User-friendly format
  
  applyLink           String
  isFeatured          Boolean  @default(false)
  isPublished         Boolean  @default(true)
  sourceType          String?
  sourceProvider      String?
  
  viewCount           Int      @default(0)
  applyClickCount     Int      @default(0)
  
  createdAt           DateTime @default(now())
  expiresAt           DateTime?
  
  companyId           String?
  company             Company? @relation(fields: [companyId], references: [id])
}
```

#### JobAlert
```prisma
model JobAlert {
  id         String   @id @default(cuid())
  email      String
  keyword    String?
  location   String?
  mode       String?
  jobType    String?
  minSalary  Int?
  frequency  String   @default("weekly") // daily, weekly
  isActive   Boolean  @default(true)
  lastSentAt DateTime?
  token      String   @unique
}
```

#### EmployerJob
```prisma
model EmployerJob {
  id                  String   @id @default(uuid())
  employerName        String
  contactEmail        String
  jobId               String   @unique
  editToken           String   @unique
  dashboardToken      String   @unique
  paymentStatus       String   // pending, paid, free
  expiryWarningSentAt DateTime?
}
```

#### Company
```prisma
model Company {
  id             String   @id @default(uuid())
  name           String   @unique
  normalizedName String   @unique
  logoUrl        String?
  website        String?
  jobCount       Int      @default(0)
  isVerified     Boolean  @default(false)
}
```

#### UserProfile
```prisma
model UserProfile {
  id         String   @id @default(cuid())
  supabaseId String   @unique
  email      String   @unique
  role       String   @default("job_seeker") // job_seeker, employer, admin
  resumeUrl  String?
}
```

#### EmployerLead
```prisma
model EmployerLead {
  id              String    @id @default(uuid())
  companyName     String
  contactEmail    String?
  status          String    @default("prospect")
  lastContactedAt DateTime?
  jobsPosted      Int       @default(0)
}
```

---

## 🤖 Job Aggregation System

### Source Connectors

Each aggregator in `lib/aggregators/` implements:

```typescript
export async function fetchSourceJobs(): Promise<RawJob[]> {
  // API call logic
  // Data transformation
  // Error handling
}
```

**Adzuna** (`adzuna.ts`)
- REST API with app ID/key auth
- Supports US and UK regions
- Returns: title, company, location, salary, description, URL

**Jooble** (`jooble.ts`)
- POST API with JSON body
- Keywords: "psychiatric nurse practitioner", "PMHNP"
- Returns: structured job data with salary

**Greenhouse** (`greenhouse.ts`)
- Public job board scraping
- Filters for healthcare companies
- ATS data format

**Lever** (`lever.ts`)
- Public API endpoint
- Company-specific job feeds
- ATS data format

### Normalization Pipeline

**1. Job Normalizer** (`lib/job-normalizer.ts`)
- Standardizes field names across sources
- Cleans HTML/special characters
- Generates SEO-friendly slugs

**2. Location Parser** (`lib/location-parser.ts`)
- Extracts city, state, country
- Detects remote/hybrid keywords
- Maps state codes (NY → New York)
- Confidence scoring

**3. Salary Normalizer** (`lib/salary-normalizer.ts`)
- Detects pay period (hourly, weekly, monthly, annual)
- Converts to annual equivalent
- Validates against PMHNP ranges
- Generates display format ("$120k-$150k/yr")

**4. Deduplicator** (`lib/deduplicator.ts`)
- Checks external ID
- Fuzzy match on title + company
- Apply URL comparison
- Confidence-based matching

**5. Company Normalizer** (`lib/company-normalizer.ts`)
- Normalizes company names
- Links to existing Company records
- Creates new company profiles
- Maintains aliases

### Data Quality

**Quality Checks:**
- Salary within valid range
- Required fields present (title, employer, location, applyLink)
- Description length > 100 characters
- Valid URL format for apply link

**Confidence Scores:**
- Location: 0.0-1.0 based on parsing success
- Salary: 0.0-1.0 based on validation
- Overall job quality score

---

## 🔧 Scripts & Commands

### Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors |
| `npm run type-check` | Run TypeScript compiler (no emit) |
| `npm run format` | Format code with Prettier |
| `npm run validate` | Run type-check + lint |

### Database

| Command | Description |
|---------|-------------|
| `npx prisma generate` | Generate Prisma Client |
| `npx prisma db push` | Push schema to database |
| `npx prisma db seed` | Seed database with test data |
| `npx prisma studio` | Open Prisma Studio (DB GUI) |
| `npx prisma migrate dev` | Create new migration |

### Testing

| Command | Description |
|---------|-------------|
| `npm test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Generate coverage report |

### Maintenance Scripts

| Command | Description |
|---------|-------------|
| `npm run audit:jobs` | Audit job data quality |
| `npm run audit:salaries` | Check salary normalization |
| `npm run fix:locations` | Backfill missing locations |
| `npm run fix:salaries` | Fix salary normalization issues |
| `npm run populate:display-salaries` | Generate display salary strings |
| `npm run clean:descriptions` | Clean job descriptions (HTML) |

### Manual Ingestion

```bash
# Run ingestion for specific source
ts-node scripts/run-ingestion.ts adzuna

# Test API connections
ts-node scripts/test-jooble.ts
ts-node scripts/test-greenhouse.ts
```

---

## ⏰ Cron Jobs

Configured in `vercel.json`:

| Cron | Schedule | Endpoint | Description |
|------|----------|----------|-------------|
| Adzuna Ingestion | Every 4 hours | `/api/cron/ingest?source=adzuna` | Fetch Adzuna jobs |
| Jooble Ingestion | 1,7,13,19 (UTC) | `/api/cron/ingest?source=jooble` | Fetch Jooble jobs |
| Greenhouse Ingestion | Every 6 hours | `/api/cron/ingest?source=greenhouse` | Fetch Greenhouse jobs |
| Freshness Decay | Daily 3 AM | `/api/cron/freshness-decay` | Update job rankings |
| Send Alerts | Daily 8 AM | `/api/cron/send-alerts` | Send job alert emails |
| Expiry Warnings | Daily 9 AM | `/api/cron/expiry-warnings` | Email employers about expiring jobs |
| Cleanup Descriptions | Daily 2 AM | `/api/cron/cleanup-descriptions` | Clean HTML from descriptions |

**Security:** All cron endpoints require `Authorization: Bearer <CRON_SECRET>` header.

---

## 🔐 Environment Variables

### Required

```env
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
```

### Optional (Recommended)

```env
# Email
RESEND_API_KEY="re_..."
EMAIL_FROM="PMHNP Hiring <noreply@pmhnphiring.com>"

# Stripe (for paid posting)
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_..."

# Job APIs
ADZUNA_APP_ID="..."
ADZUNA_APP_KEY="..."
JOOBLE_API_KEY="..."

# Security
CRON_SECRET="your-random-secret"
SUPABASE_SERVICE_ROLE_KEY="..."

# Feature Flags
ENABLE_PAID_POSTING="false"
```

### Development Defaults

If optional variables are missing in development, the app will continue with:
- Free posting mode (no Stripe required)
- Limited job sources (only APIs with keys)
- Console logging instead of external services

---

## 🧪 Testing

### Unit Tests

```bash
npm test                # Run once
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

Tests located in `tests/`:
- `tests/lib/` - Library function tests
- `tests/api/` - API endpoint tests

### Manual API Testing

PowerShell scripts for testing:
- `test-all-sources.ps1` - Test all job source APIs
- `test-cron-endpoints.ps1` - Test cron endpoints
- `test-jooble-api.ps1` - Test Jooble specifically

### Browser Testing

1. Start dev server: `npm run dev`
2. Navigate to pages and test:
   - Jobs listing with filters
   - Job detail page
   - Post job flow
   - Employer dashboard
   - Admin panel

---

## 🚢 Deployment

### Vercel (Recommended)

1. **Push to GitHub:**
   ```bash
   git push origin main
   ```

2. **Connect to Vercel:**
   - Import project from GitHub
   - Configure environment variables
   - Deploy

3. **Configure Webhooks:**
   - Get Stripe webhook endpoint: `https://your-domain.com/api/webhooks/stripe`
   - Add to Stripe Dashboard → Webhooks
   - Copy signing secret to `STRIPE_WEBHOOK_SECRET`

4. **Setup Cron Jobs:**
   - Cron jobs auto-configured from `vercel.json`
   - Ensure `CRON_SECRET` is set

### Database Setup

**Supabase:**
1. Create project at [supabase.com](https://supabase.com)
2. Copy connection string to `DATABASE_URL`
3. Enable Auth providers (Email/Google)
4. Setup Storage bucket for resumes

**Manual PostgreSQL:**
1. Create database
2. Set `DATABASE_URL`
3. Run `npx prisma db push`

### Post-Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrated
- [ ] Stripe webhook configured
- [ ] Cron secret set
- [ ] Email service configured (Resend)
- [ ] Test job posting flow
- [ ] Test payment flow (if enabled)
- [ ] Verify cron jobs running
- [ ] Check job ingestion logs

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch:**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Run tests and linting:**
   ```bash
   npm run validate
   npm test
   ```
5. **Commit your changes:**
   ```bash
   git commit -m "Add amazing feature"
   ```
6. **Push to your fork:**
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for functions
- Write tests for new features
- Keep components small and focused

---

## 📄 License

This project is licensed under the MIT License.

---

## 🙏 Acknowledgments

- **Next.js** - Amazing React framework
- **Prisma** - Best-in-class ORM
- **Supabase** - Powerful backend platform
- **Vercel** - Seamless deployment
- **Stripe** - Reliable payments
- **Resend** - Modern email service

---

## 📞 Support

For questions or issues:
- Open a GitHub issue
- Email: support@pmhnphiring.com
- Documentation: [Full Docs](https://docs.pmhnphiring.com)

---

## 💙 Built with Love

**Built with ❤️ for the PMHNP community**
