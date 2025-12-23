# PMHNP Job Board

> A modern, full-featured job board platform specifically designed for Psychiatric Mental Health Nurse Practitioners (PMHNPs), built with Next.js 14, TypeScript, Prisma, Supabase, and Stripe.

[![Next.js](https://img.shields.io/badge/Next.js-16.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.1-2D3748)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38B2AC)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Database Schema](#-database-schema)
- [API Endpoints](#-api-endpoints)
- [Job Aggregation](#-job-aggregation)
- [Authentication System](#-authentication-system)
- [Payment Integration](#-payment-integration)
- [Email System](#-email-system)
- [Cron Jobs](#-cron-jobs)
- [Scripts & Utilities](#-scripts--utilities)
- [Deployment](#-deployment)
- [Project Structure](#-project-structure)
- [Configuration](#-configuration)
- [SEO & Metadata](#-seo--metadata)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

PMHNP Job Board is a comprehensive job listing platform that aggregates psychiatric nursing positions from multiple sources, allows employers to post paid/free job listings, enables candidates to create job alerts, and provides a full-featured dashboard experience.

### Project Status: **85-87% Complete** ✅

The application is **production-ready** with the following completion status:
- ✅ Core features fully implemented
- ✅ Payment processing (Stripe)
- ✅ Multi-source job aggregation
- ✅ Authentication & authorization
- ✅ Email system
- ✅ Job alerts & notifications
- ⚠️ Some nice-to-have features pending (analytics dashboard, quality scoring)

---

## ✨ Key Features

### For Job Seekers
- 🔍 **Advanced Job Search** - Search with filters (location, job type, mode, salary)
- 🔔 **Job Alerts** - Daily/weekly email notifications for matching jobs
- 💾 **Save Jobs** - Bookmark jobs for later review
- 📝 **Application Tracking** - Track applied jobs
- 🏷️ **Smart Badges** - "New" (< 24hrs), "Featured", "Verified Employer"
- 📱 **Responsive Design** - Mobile-optimized with bottom navigation
- 🔗 **Social Sharing** - Share jobs on LinkedIn, Twitter, email
- 📊 **Live Filter Counts** - See available jobs per filter in real-time
- 🌐 **Location-Based Browse** - Browse by state or city
- 👤 **User Profiles** - Manage profile, resume, and preferences

### For Employers
- 💼 **Job Posting** - Post jobs (free or paid tiers)
- 📊 **Employer Dashboard** - Track views, apply clicks, CTR
- ✏️ **Edit Jobs** - Update job listings with secure tokens
- 🔄 **Renewals & Upgrades** - Renew expired jobs or upgrade to featured
- 📧 **Email Notifications** - Confirmation, expiry warnings, draft saves
- 🎯 **Featured Listings** - Premium placement for better visibility
- 💳 **Stripe Integration** - Secure payment processing
- 📑 **Invoice Generation** - Downloadable PDF invoices
- 🔐 **Dashboard Tokens** - Secure, password-free dashboard access

### For Admins
- 📈 **Admin Dashboard** - Site statistics and job management
- 🔍 **Job Moderation** - Review and manage all listings
- 📊 **Outreach Tracking** - Employer lead management
- 🏢 **Company Management** - Track verified employers
- 📉 **Source Analytics** - Monitor aggregator performance

### Technical Features
- 🤖 **Multi-Source Aggregation** - 6 job sources (Adzuna, Jooble, Greenhouse, Lever, USAJobs, CareerJet)
- 🔄 **Smart Deduplication** - 4-strategy duplicate detection (exact ID, title+location, URL, fuzzy matching)
- 🧹 **Job Normalization** - Standardize salaries, locations, descriptions
- 💰 **Salary Intelligence** - Normalize to annual, estimate missing salaries
- 📍 **Location Parsing** - Extract city, state, country from text
- 🕒 **Freshness Decay** - Automatic job ranking based on age
- ⏰ **Automated Cron Jobs** - Ingestion, alerts, expiry warnings, cleanup
- 🔐 **Role-Based Access** - Job seeker, employer, admin roles
- 🌐 **SEO Optimized** - Dynamic sitemap, robots.txt, structured data
- 📧 **Transactional Emails** - Resend integration with 6 email types

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **UI Components**: Custom components with Lucide icons
- **Forms**: React Hook Form + Zod validation
- **State Management**: React hooks (useState, useEffect, useCallback)

### Backend
- **Runtime**: Node.js (server components)
- **Database**: PostgreSQL with Prisma ORM 7.1
- **Authentication**: Supabase Auth (with SSR)
- **Storage**: Supabase Storage (avatars, resumes)
- **Payments**: Stripe (checkouts, webhooks)
- **Emails**: Resend API
- **Cron Jobs**: Vercel Cron

### External APIs
- **Adzuna** - Job search API
- **Jooble** - Job aggregator API
- **Greenhouse** - ATS integration
- **Lever** - ATS integration
- **USAJobs** - Government job listings
- **CareerJet** - Job search API

### DevOps
- **Hosting**: Vercel (recommended)
- **Database**: Neon/Supabase PostgreSQL
- **Version Control**: Git
- **Package Manager**: npm

---

## 🏗️ Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Next.js App                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                    App Router Pages                     │  │
│  │  /jobs, /dashboard, /admin, /post-job, /settings, etc  │  │
│  └────────────────────────────────────────────────────────┘  │
│                            │                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                     API Routes                          │  │
│  │  /api/jobs, /api/auth, /api/cron, /api/webhooks, etc   │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    ┌───▼────┐      ┌───────▼────────┐   ┌────▼──────┐
    │Supabase│      │   PostgreSQL   │   │  Stripe   │
    │  Auth  │      │  (via Prisma)  │   │  Payment  │
    │Storage │      │                │   │           │
    └────────┘      └────────────────┘   └───────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    ┌───▼────┐      ┌───────▼────────┐   ┌────▼──────┐
    │ Resend │      │  Job Sources   │   │   Vercel  │
    │ Email  │      │  (6 APIs)      │   │   Cron    │
    └────────┘      └────────────────┘   └───────────┘
```

### Data Flow

1. **Job Aggregation Flow**:
   ```
   External APIs → Fetcher → Normalizer → Deduplicator → Database
   ```

2. **Job Posting Flow**:
   ```
   Form → Validation → [Stripe Payment] → Webhook → Database → Email
   ```

3. **Job Alert Flow**:
   ```
   Cron → Match Criteria → Filter Jobs → Send Emails → Update lastSentAt
   ```

4. **Authentication Flow**:
   ```
   Login/Signup → Supabase Auth → Server Helper → Profile Creation → Dashboard
   ```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+ and npm
- **PostgreSQL** database (local or hosted)
- **Supabase** account (for auth & storage)
- **Stripe** account (for payments)
- **Resend** account (for emails)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/pmhnp-job-board.git
   cd pmhnp-job-board
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

4. **Set up the database**:
   ```bash
   npx prisma generate
   npx prisma db push
   npx prisma db seed  # Optional: seed with sample data
   ```

5. **Run the development server**:
   ```bash
   npm run dev
   ```

6. **Open your browser**:
   ```
   http://localhost:3000
   ```

### Quick Setup Checklist

- [ ] PostgreSQL database created
- [ ] Supabase project created (auth & storage configured)
- [ ] Stripe account set up (test mode)
- [ ] Resend API key obtained
- [ ] All environment variables configured
- [ ] Database migrated and seeded
- [ ] Google OAuth configured (optional)
- [ ] Job aggregator API keys obtained (optional)

---

## 🔐 Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Database
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
DIRECT_URL="postgresql://user:password@host:5432/database?sslmode=require"

# Supabase (Auth & Storage)
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Stripe (Payments)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."

# Resend (Emails)
RESEND_API_KEY="re_..."

# App Configuration
NEXT_PUBLIC_APP_URL="http://localhost:3000"
ENABLE_PAID_POSTING="false"  # Set to "true" to enable paid postings
CRON_SECRET="your-random-secret-here"  # For securing cron endpoints

# Job Aggregator APIs (Optional)
ADZUNA_APP_ID="your-adzuna-app-id"
ADZUNA_APP_KEY="your-adzuna-app-key"
JOOBLE_API_KEY="your-jooble-key"
USAJOBS_API_KEY="your-usajobs-key"
# CareerJet, Greenhouse, Lever use public APIs

# Admin (Optional)
ADMIN_EMAIL="admin@yourdomain.com"  # Email for admin user
```

### Required vs Optional Variables

**Required for Basic Functionality**:
- `DATABASE_URL`, `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `RESEND_API_KEY`

**Required for Paid Postings**:
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `ENABLE_PAID_POSTING="true"`

**Optional (for job aggregation)**:
- Aggregator API keys

---

## 🗄️ Database Schema

### Core Models

#### **Job**
The main job listing model with comprehensive fields:
- Basic: `title`, `employer`, `location`, `description`
- Salary: `minSalary`, `maxSalary`, `normalizedMinSalary`, `displaySalary`
- Location: `city`, `state`, `stateCode`, `country`, `isRemote`, `isHybrid`
- Metadata: `jobType`, `mode`, `isFeatured`, `isPublished`, `expiresAt`
- Analytics: `viewCount`, `applyClickCount`
- Source: `sourceType`, `sourceProvider`, `externalId`

#### **EmailLead**
Email subscribers for newsletter and job alerts:
- `email`, `preferences`, `source`, `isSubscribed`
- `unsubscribeToken` (secure unsubscribe)

#### **JobAlert**
User-created job alert criteria:
- Search: `keyword`, `location`, `mode`, `jobType`, `minSalary`
- Settings: `frequency` (daily/weekly), `isActive`
- Tracking: `lastSentAt`, `totalSent`

#### **EmployerJob**
Employer-specific job metadata:
- `employerName`, `contactEmail`, `company`
- `editToken`, `dashboardToken` (secure access)
- `paymentStatus`, `stripeSessionId`
- `originalTier`, `wasRenewed`, `wasUpgraded`

#### **UserProfile**
User accounts linked to Supabase:
- `supabaseId`, `email`, `role` (job_seeker/employer/admin)
- `firstName`, `lastName`, `phone`, `company`
- `avatarUrl`, `resumeUrl` (Supabase Storage)

#### **Company**
Company information for verified employers:
- `name`, `slug`, `description`, `website`
- `logoUrl`, `isVerified`
- `jobCount` (denormalized)

#### Supporting Models
- `JobDraft` - Save job drafts before posting
- `ApplyClick` - Track apply button clicks by source
- `SourceStats` - Aggregator performance metrics
- `SiteStat` - Overall site statistics
- `EmployerLead` - Outreach tracking

### Relationships

```
Job ──┬─→ EmployerJob (1:many)
      ├─→ ApplyClick (1:many)
      └─→ Company (many:1)

EmailLead ──→ JobAlert (1:many)

UserProfile (linked to Supabase Auth)
```

### Indexes

Optimized for common queries:
- `jobs`: `isPublished`, `isFeatured`, `location`, `createdAt`, `minSalary`, `state`, `isRemote`
- `email_leads`: `email`, `unsubscribeToken`
- `job_alerts`: `email`, `isActive`

---

## 🌐 API Endpoints

### Public Endpoints

#### Jobs
- `GET /api/jobs` - List jobs with filters
  - Query params: `search`, `location`, `jobType`, `mode`, `minSalary`, `maxSalary`, `page`, `limit`
- `GET /api/jobs/[id]` - Get single job (increments view count)
- `GET /api/jobs/filter-counts` - Get job counts per filter
- `GET /api/jobs/locations` - Get unique locations
- `POST /api/jobs/post-free` - Post a free job (when paid posting disabled)

#### Authentication
- `POST /api/auth/callback` - Supabase callback handler
- `GET /api/auth/user` - Get current user
- `GET /api/auth/profile` - Get user profile
- `PATCH /api/auth/profile` - Update user profile
- `DELETE /api/auth/delete-account` - Delete user account

#### Job Alerts
- `POST /api/job-alerts/create` - Create job alert
- `GET /api/job-alerts/manage` - Get user's alerts
- `DELETE /api/job-alerts/[id]` - Delete alert
- `PATCH /api/job-alerts/[id]` - Update alert

#### Email
- `POST /api/subscribe` - Newsletter signup
- `GET /api/email/unsubscribe?token=xxx` - Unsubscribe from emails
- `GET /api/email/preferences?token=xxx` - Email preferences page

#### Stats
- `GET /api/stats` - Public site stats (total jobs, subscribers, companies)

#### Other
- `POST /api/contact` - Contact form submission
- `GET /api/companies/[slug]` - Get company details
- `POST /api/upload` - Upload file to Supabase Storage

### Employer Endpoints

- `POST /api/create-checkout` - Create Stripe checkout for new job
- `POST /api/create-renewal-checkout` - Renew expired job
- `POST /api/create-upgrade-checkout` - Upgrade standard to featured
- `GET /api/employer/dashboard?token=xxx` - Employer dashboard data
- `GET /api/employer/invoice?jobId=xxx&token=xxx` - Download PDF invoice
- `GET /api/jobs/edit/[token]` - Get job for editing
- `PUT /api/jobs/edit/[token]` - Update job
- `POST /api/job-draft` - Save job draft
- `GET /api/job-draft?email=xxx` - Get saved draft
- `DELETE /api/job-draft?email=xxx` - Delete draft

### Admin Endpoints (Protected)

- `GET /api/admin/stats` - Admin dashboard statistics
- `GET /api/admin/jobs` - All jobs (with filters)
- `PATCH /api/admin/jobs/[id]` - Update job (publish, feature, verify)
- `DELETE /api/admin/jobs/[id]` - Delete job
- `GET /api/admin/outreach` - Employer leads
- `GET /api/admin/companies` - Company management
- `GET /api/analytics/apply-clicks` - Apply click analytics
- `GET /api/analytics/source-performance` - Source comparison

### Webhook Endpoints

- `POST /api/webhooks/stripe` - Stripe webhook handler (checkout.session.completed)

### Cron Endpoints (Protected by CRON_SECRET)

- `POST /api/ingest?source=[source]` - Trigger job ingestion
- `POST /api/cron/send-alerts` - Send job alert emails
- `POST /api/cron/expiry-warnings` - Send expiry warning emails
- `POST /api/cron/freshness-decay` - Update job freshness scores
- `POST /api/cron/cleanup-descriptions` - Clean HTML from descriptions
- `POST /api/cron/parse-locations` - Parse location strings

---

## 🤖 Job Aggregation

### Supported Sources

| Source | Type | Frequency | Jobs/Run | Status |
|--------|------|-----------|----------|--------|
| **Adzuna** | Job Search API | Every 4 hours | ~1,400 | ✅ Active |
| **Jooble** | Job Search API | 4x daily | ~500 | ✅ Active |
| **Greenhouse** | ATS Scraper | Every 6 hours | ~200 | ✅ Active |
| **Lever** | ATS API | On-demand | ~100 | ✅ Active |
| **USAJobs** | Government API | On-demand | ~50 | ✅ Active |
| **CareerJet** | Job Search API | On-demand | ~300 | ✅ Active |

### Aggregation Pipeline

1. **Fetch** - Query external API with PMHNP-related keywords
2. **Normalize** - Standardize job data (see Job Normalizer)
3. **Deduplicate** - Check for existing jobs (see Deduplicator)
4. **Store** - Save to database with source tracking
5. **Cleanup** - Remove HTML, fix formatting

### Job Normalizer (`lib/job-normalizer.ts`)

**377 lines** of robust normalization logic:

- **HTML Cleaning**: Remove tags, decode entities (20+ types)
- **Salary Extraction**: Regex patterns for various formats
- **Salary Validation**: Reject fake/placeholder values
- **Job Type Detection**: Full-Time, Part-Time, Contract, Per Diem
- **Mode Detection**: Remote, Hybrid, On-Site
- **Location Parsing**: Extract city, state, country
- **Summary Generation**: Create 150-char description summary
- **Salary Normalization**: Convert all to annual rates

### Deduplicator (`lib/deduplicator.ts`)

**4-strategy duplicate detection** with confidence scores:

1. **Exact External ID** (100% confidence) - Same source ID
2. **Exact Match** (95% confidence) - Title + Company + Location
3. **Apply URL Match** (90% confidence) - Same application link
4. **Fuzzy Title Match** (85%+ confidence) - Levenshtein distance algorithm

**Normalization helpers**:
- Title normalization (remove special chars, lowercase)
- Company normalization (remove legal suffixes)
- Location normalization (remove state codes)
- URL normalization (strip query params, fragments)

### Salary Intelligence

**Salary Normalizer** (`lib/salary-normalizer.ts`):
- Converts hourly → annual (assumes 2,080 hours/year)
- Converts monthly → annual (× 12)
- Handles ranges ($50-$60/hr)
- Estimates missing salaries based on role/location
- Confidence scoring (0.0-1.0)

**Display Formatter** (`lib/salary-display.ts`):
- User-friendly formats: "$145-$200/hr" or "$150k-$180k/yr"
- Handles estimates with indicators
- Consistent formatting across app

### Location Parser (`lib/location-parser.ts`)

Extracts structured location data:
- City, State, State Code, Country
- Remote/Hybrid detection
- Handles various formats: "Remote - CA", "New York, NY", "Telehealth"

---

## 🔐 Authentication System

### Modern Server-Side Route Protection

**No traditional middleware.ts** - Using Next.js 14+ best practice with server-side helpers.

### Implementation (`lib/auth/protect.ts`)

**Helper Functions**:

1. **`requireAuth()`** - Require any authenticated user
   ```typescript
   const { user, profile } = await requireAuth()
   // Redirects to /login if not authenticated
   ```

2. **`requireRole(['employer', 'admin'])`** - Require specific role(s)
   ```typescript
   const { user, profile } = await requireRole(['admin'])
   // Redirects to /unauthorized if wrong role
   ```

3. **`requireAdmin()`** - Shorthand for admin-only
   ```typescript
   await requireAdmin()
   // Redirects if not admin
   ```

4. **`getCurrentUser()`** - Get user without requiring auth
   ```typescript
   const currentUser = await getCurrentUser()
   // Returns null if not logged in
   ```

### User Roles

- **`job_seeker`** (default) - Can save jobs, create alerts, apply
- **`employer`** - Can post jobs, access employer dashboard
- **`admin`** - Full system access, moderation, analytics

### Supabase Integration

**Client-side** (`lib/supabase/client.ts`):
```typescript
import { createBrowserClient } from '@supabase/ssr'
```

**Server-side** (`lib/supabase/server.ts`):
```typescript
import { createServerClient } from '@supabase/ssr'
// Cookie-based session management
```

### Authentication Flow

1. User signs up/logs in via Supabase Auth
2. Redirected to `/auth/callback`
3. Server helper checks auth status
4. Profile auto-created in database if doesn't exist
5. User redirected to dashboard

### Google OAuth

**Configured** in Supabase dashboard:
- Google Sign-In button on login/signup pages
- Automatic profile creation on first login
- Seamless integration with email/password auth

### Protected Routes

**Protected Pages** (require auth):
- `/dashboard`
- `/settings`
- `/job-alerts/manage`

**Protected Layouts**:
- `/admin/*` - Requires admin role
- Uses `requireAdmin()` in `app/admin/layout.tsx`

### Profile Management

**Fields**:
- Basic: `firstName`, `lastName`, `email` (non-editable)
- Contact: `phone`, `company`
- Files: `avatarUrl`, `resumeUrl` (Supabase Storage)

**Features**:
- Avatar upload/removal
- Resume upload/removal (job seekers only)
- Password reset via email
- Account deletion

---

## 💳 Payment Integration

### Stripe Setup

**Pricing** (configured in `lib/config.ts`):
- Standard Job Post: **$99** (30 days)
- Featured Job Post: **$199** (30 days)
- Job Renewal: **$99** (30 days)
- Upgrade to Featured: **$100**

### Feature Flag

Toggle paid posting on/off:
```bash
ENABLE_PAID_POSTING="false"  # Free mode (launch)
ENABLE_PAID_POSTING="true"   # Paid mode
```

**When disabled**: All jobs post for free via `/api/jobs/post-free`
**When enabled**: Jobs go through Stripe checkout

### Payment Flows

#### 1. New Job Posting
```
/post-job → Form → /post-job/checkout → Stripe → Webhook → Published
```

**Process**:
1. User fills job form
2. Data saved to localStorage
3. Redirected to checkout page
4. Click "Proceed to Payment"
5. Creates Stripe Checkout Session
6. Redirected to Stripe hosted page
7. Payment completed
8. Webhook fires: `checkout.session.completed`
9. Job published, email sent
10. Redirected to `/success`

#### 2. Job Renewal
```
Dashboard → Renew → Stripe → Webhook → Extended 30 days
```

**Metadata**:
```json
{
  "type": "renewal",
  "jobId": "abc123",
  "dashboardToken": "xyz789"
}
```

#### 3. Job Upgrade
```
Dashboard → Upgrade → Stripe → Webhook → Marked as Featured
```

**Metadata**:
```json
{
  "type": "upgrade",
  "jobId": "abc123",
  "dashboardToken": "xyz789"
}
```

### Webhook Handler (`/api/webhooks/stripe/route.ts`)

**Handles**:
- Signature verification (security)
- New job posting completion
- Job renewal completion
- Job upgrade completion

**Actions**:
- Updates job in database
- Marks as published/featured
- Extends expiry date
- Sends confirmation email
- Cleans up drafts

### Invoices

**PDF Generation** (`lib/invoice-generator.tsx`):
- Uses `@react-pdf/renderer`
- Professional invoice design
- Includes job details, pricing, transaction ID
- Download via employer dashboard

**Endpoint**: `GET /api/employer/invoice?jobId=xxx&token=xxx`

---

## 📧 Email System

### Resend Integration

**Configuration**: Set `RESEND_API_KEY` in `.env.local`

### Email Service (`lib/email-service.ts`)

**6 Email Templates**:

1. **`sendWelcomeEmail(email, name?)`**
   - Sent after newsletter signup
   - Welcome message, what to expect

2. **`sendConfirmationEmail(email, job, editLink, dashboardLink)`**
   - Sent after job posting
   - Includes edit & dashboard links
   - Receipt for paid postings

3. **`sendJobAlertEmail(email, jobs, alertCriteria)`**
   - Daily/weekly job matches
   - Up to 10 jobs per email
   - Criteria summary

4. **`sendRenewalConfirmationEmail(email, job, dashboardToken)`**
   - Sent after renewal
   - New expiry date
   - Dashboard link

5. **`sendExpiryWarningEmail(email, job, daysUntilExpiry, renewalLink)`**
   - Sent 5 days before expiry
   - Renewal call-to-action
   - Dashboard access

6. **`sendDraftSavedEmail(email, draftLink)`**
   - Sent when draft is saved
   - Resume posting link

### Unsubscribe System

**All emails include**:
- Unsubscribe link with token
- Preference management link

**Endpoints**:
- `GET /api/email/unsubscribe?token=xxx` - One-click unsubscribe
- `GET /api/email/preferences?token=xxx` - Manage preferences

**Token-based** (no login required):
- Secure `unsubscribeToken` per email lead
- Prevents unauthorized unsubscribes

### Email Frequency

**Job Alerts**:
- Daily: Sent at 8am (matches from last 24hrs)
- Weekly: Sent Mondays at 8am (matches from last 7 days)

**Expiry Warnings**:
- Sent 5 days before expiry (9am daily cron)

---

## ⏰ Cron Jobs

### Vercel Cron Configuration (`vercel.json`)

**7 Scheduled Jobs**:

| Job | Path | Schedule | Purpose |
|-----|------|----------|---------|
| **Adzuna Ingest** | `/api/cron/ingest?source=adzuna` | Every 4 hours | Fetch Adzuna jobs |
| **Jooble Ingest** | `/api/cron/ingest?source=jooble` | 4x daily (1,7,13,19h) | Fetch Jooble jobs |
| **Greenhouse Ingest** | `/api/cron/ingest?source=greenhouse` | Every 6 hours | Fetch Greenhouse jobs |
| **Freshness Decay** | `/api/cron/freshness-decay` | Daily at 3am | Update job rankings |
| **Send Alerts** | `/api/cron/send-alerts` | Daily at 8am | Send job alert emails |
| **Expiry Warnings** | `/api/cron/expiry-warnings` | Daily at 9am | Warn about expiring jobs |
| **Cleanup Descriptions** | `/api/cron/cleanup-descriptions` | Daily at 2am | Remove HTML from descriptions |

### Security

All cron endpoints require `CRON_SECRET`:
```typescript
const secret = request.headers.get('Authorization')?.replace('Bearer ', '')
if (secret !== process.env.CRON_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### Manual Triggering

For testing or one-off runs:
```bash
# Using curl
curl -X POST "http://localhost:3000/api/cron/send-alerts" \
  -H "Authorization: Bearer your-cron-secret"

# Using PowerShell
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/ingest?source=adzuna" -Headers @{"Authorization"="Bearer your-cron-secret"}
```

### Cron Job Details

**Job Ingestion** (`/api/ingest`):
- Fetches jobs from specified source
- Normalizes and deduplicates
- Returns stats (fetched, duplicates, saved, errors)

**Freshness Decay** (`/api/cron/freshness-decay`):
- Decreases older jobs' ranking
- Keeps feed fresh with recent posts

**Send Alerts** (`/api/cron/send-alerts`):
- Finds active alerts due to send
- Matches jobs to criteria
- Sends email for each matching alert
- Updates `lastSentAt`

**Expiry Warnings** (`/api/cron/expiry-warnings`):
- Finds jobs expiring in 5 days
- Sends warning email to employer
- Includes renewal link

**Cleanup Descriptions** (`/api/cron/cleanup-descriptions`):
- Removes remaining HTML tags
- Fixes formatting issues
- Batch processes 100 jobs at a time

---

## 🛠️ Scripts & Utilities

### Available Scripts

Located in `scripts/` directory:

**Job Management**:
- `audit-and-fix-jobs.ts` - Audit job data quality
- `audit-salaries.ts` - Audit salary data
- `fix-missing-locations.ts` - Parse and fix location fields
- `fix-all-salaries.ts` - Normalize all salary data
- `populate-display-salaries.ts` - Generate display salary strings
- `clean-job-descriptions.ts` - Remove HTML from descriptions

**Data Analysis**:
- `analyze-location-formats.ts` - Analyze location string patterns
- `analyze-salary-data.ts` - Analyze salary distributions
- `check-duplicate-jobs.ts` - Find potential duplicates

**Source Testing**:
- `test-aggregators.ts` - Test all job sources
- `test-adzuna.ts` - Test Adzuna API
- `test-jooble.ts` - Test Jooble API
- `test-greenhouse.ts` - Test Greenhouse scraper

**Run scripts**:
```bash
npm run audit:jobs
npm run audit:salaries
npm run fix:locations
npm run fix:salaries
npm run populate:display-salaries
npm run clean:descriptions
```

### PowerShell Test Scripts

Located in project root:

- `test-all-sources.ps1` - Test all aggregators
- `test-careerjet-api.ps1` - Test CareerJet
- `test-jooble-api.ps1` - Test Jooble
- `test-cron-endpoints.ps1` - Test all cron jobs
- `test-parse-locations-api.ps1` - Test location parser
- `test-cleanup-descriptions.ps1` - Test description cleaner

### Utility Libraries

**Location Parser** (`lib/location-parser.ts`):
- Extract city, state, country
- Detect remote/hybrid
- Handle various formats

**Salary Utils** (`lib/salary-utils.ts`):
- Parse salary strings
- Convert periods (hourly/monthly → annual)
- Validate ranges

**Company Normalizer** (`lib/company-normalizer.ts`):
- Remove legal suffixes (LLC, Inc, Corp)
- Standardize company names
- Merge similar companies

**Description Cleaner** (`lib/description-cleaner.ts`):
- Remove HTML tags
- Decode entities
- Fix whitespace
- Remove URLs (optional)

**Filters** (`lib/filters.ts`):
- Build Prisma queries from filter criteria
- Handle complex combinations

---

## 🚀 Deployment

### Recommended: Vercel

**Why Vercel**:
- Native Next.js support
- Automatic cron jobs
- Edge functions
- Zero-config deployment

**Steps**:

1. **Connect Repository**:
   - Import project to Vercel
   - Connect GitHub repo

2. **Configure Environment Variables**:
   - Add all variables from `.env.local`
   - Set `NEXT_PUBLIC_APP_URL` to your domain

3. **Configure Cron Jobs**:
   - Automatic from `vercel.json`
   - Verify in Vercel dashboard

4. **Set up Stripe Webhook**:
   ```
   https://yourdomain.com/api/webhooks/stripe
   ```
   - Add endpoint in Stripe dashboard
   - Select event: `checkout.session.completed`
   - Copy webhook secret to `STRIPE_WEBHOOK_SECRET`

5. **Deploy**:
   ```bash
   vercel --prod
   ```

### Database Setup

**Option 1: Neon** (recommended)
- PostgreSQL with connection pooling
- Free tier available
- Works with Prisma

**Option 2: Supabase**
- PostgreSQL + auth + storage
- All-in-one solution
- Generous free tier

**Option 3: Railway**
- PostgreSQL hosting
- Simple deployment
- Pay-as-you-go

### Post-Deployment Checklist

- [ ] All environment variables set
- [ ] Database migrated (`prisma db push`)
- [ ] Stripe webhook configured and tested
- [ ] Supabase redirect URLs configured
- [ ] Google OAuth redirect configured (if using)
- [ ] DNS configured (if custom domain)
- [ ] Test job posting flow
- [ ] Test payment flow
- [ ] Test job alerts
- [ ] Test email delivery
- [ ] Verify cron jobs running
- [ ] Set up error monitoring (Sentry, etc.)
- [ ] Configure analytics (GA, Plausible, etc.)

### Performance Optimizations

**Already Implemented**:
- Database indexes on common queries
- Connection pooling (Prisma + pg)
- Image optimization (Next.js)
- Static generation where possible
- Lazy loading components

**Additional Recommendations**:
- Enable Redis caching (for filter counts)
- CDN for static assets
- Compress API responses
- Add rate limiting

---

## 📁 Project Structure

```
pmhnp-job-board/
├── app/                          # Next.js App Router
│   ├── (routes)/                 # Route groups
│   │   ├── jobs/                 # Job listing & detail pages
│   │   ├── dashboard/            # User dashboard
│   │   ├── admin/                # Admin pages (protected)
│   │   ├── post-job/             # Job posting flow
│   │   ├── settings/             # User settings
│   │   └── ...                   # Other pages
│   ├── api/                      # API routes
│   │   ├── jobs/                 # Job endpoints
│   │   ├── auth/                 # Auth endpoints
│   │   ├── cron/                 # Cron job endpoints
│   │   ├── webhooks/             # Webhook handlers
│   │   └── ...                   # Other endpoints
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Homepage
│   ├── globals.css               # Global styles
│   ├── sitemap.ts                # Dynamic sitemap
│   └── robots.ts                 # Robots.txt
├── components/                   # React components
│   ├── auth/                     # Auth components
│   ├── jobs/                     # Job-related components
│   ├── ui/                       # UI primitives
│   ├── Header.tsx                # Site header
│   ├── Footer.tsx                # Site footer
│   ├── JobCard.tsx               # Job card component
│   └── ...                       # Other components
├── lib/                          # Utility libraries
│   ├── aggregators/              # Job source fetchers
│   │   ├── adzuna.ts
│   │   ├── jooble.ts
│   │   ├── greenhouse.ts
│   │   ├── lever.ts
│   │   ├── usajobs.ts
│   │   └── careerjet.ts
│   ├── auth/                     # Auth utilities
│   │   └── protect.ts            # Route protection
│   ├── supabase/                 # Supabase clients
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client
│   │   └── middleware.ts         # Session refresh
│   ├── config.ts                 # App configuration
│   ├── prisma.ts                 # Prisma client
│   ├── job-normalizer.ts         # Job data normalizer
│   ├── deduplicator.ts           # Duplicate detection
│   ├── salary-normalizer.ts      # Salary processing
│   ├── location-parser.ts        # Location extraction
│   ├── email-service.ts          # Email sender
│   ├── job-alerts-service.ts     # Alert matching
│   └── ...                       # Other utilities
├── prisma/                       # Database
│   ├── schema.prisma             # Database schema
│   ├── migrations/               # Migration history
│   └── seed.ts                   # Seed data
├── scripts/                      # Utility scripts
│   ├── audit-and-fix-jobs.ts
│   ├── fix-all-salaries.ts
│   └── ...
├── types/                        # TypeScript types
│   ├── job.ts
│   └── filters.ts
├── public/                       # Static assets
│   ├── logo.svg
│   └── ...
├── .env.local                    # Environment variables (not in repo)
├── .env.example                  # Example env file
├── next.config.ts                # Next.js config
├── tailwind.config.ts            # Tailwind config
├── vercel.json                   # Vercel config (cron jobs)
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
└── README.md                     # This file
```

---

## ⚙️ Configuration

### App Config (`lib/config.ts`)

**Feature Flags**:
```typescript
isPaidPostingEnabled: process.env.ENABLE_PAID_POSTING === 'true'
```

**Pricing**:
```typescript
pricing: {
  standard: 99,      // $99 for standard post
  featured: 199,     // $199 for featured post
  renewal: 99,       // $99 to renew
  upgrade: 100,      // $100 to upgrade
}
```

**Job Settings**:
```typescript
jobSettings: {
  durationDays: 30,           // Jobs expire after 30 days
  featuredDurationDays: 30,   // Featured jobs also 30 days
}
```

**Helper Functions**:
- `getPostingPrice(tier)` - Get price for tier
- `getRenewalPrice()` - Get renewal price
- `getUpgradePrice()` - Get upgrade price
- `formatPrice(amount)` - Format as currency
- `getPricingLabel(tier)` - Get display label

### Tailwind Config (`tailwind.config.ts`)

**Custom Design System**:

**Colors**:
```typescript
colors: {
  primary: { /* Blue shades */ },
  accent: { /* Purple shades */ },
  success: { /* Green */ },
  warning: { /* Yellow */ },
  error: { /* Red */ },
}
```

**Typography**:
- Custom font sizes
- Line heights
- Letter spacing

**Spacing**:
- Consistent spacing scale
- Custom padding/margin

**Border Radius**:
- `sm`, `md`, `lg`, `xl`, `2xl`, `full`

**Shadows**:
- `sm`, `md`, `lg`, `xl`, `2xl`

**Animations**:
- `fadeIn`, `slideIn`, `scaleIn`
- Custom keyframes

---

## 🔍 SEO & Metadata

### Dynamic Sitemap (`app/sitemap.ts`)

**Includes**:
- Static pages (home, about, jobs, etc.)
- All published job pages (last 1000)
- Dynamic landing pages (states, cities)

**Updates**: Regenerates on each build

### Robots.txt (`app/robots.ts`)

**Allows**: All pages except:
- `/api/*` - API routes
- `/admin/*` - Admin pages
- `/employer/*` - Employer dashboards
- `/jobs/edit/*` - Edit pages
- `/dashboard` - User dashboard
- `/settings` - User settings

**Sitemap**: Points to `/sitemap.xml`

### Structured Data

**Job Postings** (`components/JobStructuredData.tsx`):
```json
{
  "@type": "JobPosting",
  "title": "...",
  "description": "...",
  "datePosted": "...",
  "hiringOrganization": {...},
  "jobLocation": {...},
  "baseSalary": {...}
}
```

**Organization** (`components/OrganizationStructuredData.tsx`):
```json
{
  "@type": "Organization",
  "name": "PMHNP Jobs",
  "url": "...",
  "logo": "..."
}
```

### Meta Tags

**Every Page**:
- Title (SEO-optimized)
- Description
- OpenGraph tags (title, description, image, url)
- Twitter cards

**Job Detail Pages**:
- Dynamic title: "Job Title at Company | PMHNP Jobs"
- Dynamic description from job summary
- OpenGraph image (configured, needs `/public/og-image.png`)

### SEO Landing Pages

**State Pages** (`/jobs/state/[state]`):
- "PMHNP Jobs in [State]"
- State-specific job listings
- SEO-optimized titles/descriptions

**City Pages** (`/jobs/city/[city]`):
- "PMHNP Jobs in [City], [State]"
- City-specific listings
- Breadcrumb navigation

**Remote Page** (`/jobs/remote`):
- "Remote PMHNP Jobs"
- All remote positions

---

## 🎨 Design System

### Color Palette

**Primary (Blue)**:
- 50-900 scale
- Used for CTAs, links, focus states

**Accent (Purple)**:
- 50-900 scale
- Used for highlights, badges

**Semantic Colors**:
- Success (Green)
- Warning (Yellow)
- Error (Red)
- Info (Blue)

### Typography

**Headings**:
- H1: 3rem (48px), bold
- H2: 2.25rem (36px), semibold
- H3: 1.875rem (30px), semibold
- H4: 1.5rem (24px), medium

**Body**:
- Base: 1rem (16px)
- Small: 0.875rem (14px)
- Extra small: 0.75rem (12px)

### Components

**Buttons**:
- Primary: Blue background
- Secondary: White background, blue border
- Ghost: Transparent background

**Cards**:
- White background
- Border: gray-200
- Shadow: sm
- Hover: shadow-md transition

**Badges**:
- Rounded-full
- Padding: px-3 py-1
- Text: xs font-medium

**Inputs**:
- Border: gray-300
- Focus: blue-500 ring
- Rounded: md

---

## 🤝 Contributing

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Test thoroughly**:
   - Test UI changes
   - Test API endpoints
   - Test cron jobs (manually)
5. **Commit with descriptive messages**:
   ```bash
   git commit -m "Add: Feature description"
   ```
6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Create a Pull Request**

### Code Style

**Follow existing patterns**:
- TypeScript for all files
- Use arrow functions
- Destructure props
- Use async/await (not .then)
- Add comments for complex logic

**Naming Conventions**:
- Components: PascalCase (`JobCard.tsx`)
- Utilities: camelCase (`job-normalizer.ts`)
- Constants: UPPER_SNAKE_CASE
- Types: PascalCase with `I` prefix for interfaces

**Formatting**:
- 2 spaces indentation
- Single quotes for strings
- Semicolons required
- Trailing commas in objects/arrays

### Testing

**Before submitting PR**:
- [ ] Test in development mode
- [ ] Test in production build (`npm run build`)
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Responsive on mobile
- [ ] Accessible (keyboard navigation, screen readers)

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

**Built with**:
- [Next.js](https://nextjs.org/) - React framework
- [Prisma](https://www.prisma.io/) - Database ORM
- [Supabase](https://supabase.com/) - Auth & Storage
- [Stripe](https://stripe.com/) - Payment processing
- [Resend](https://resend.com/) - Email delivery
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Lucide](https://lucide.dev/) - Icons

**Job Sources**:
- Adzuna, Jooble, Greenhouse, Lever, USAJobs, CareerJet

---

## 📞 Support

**Issues**: [GitHub Issues](https://github.com/yourusername/pmhnp-job-board/issues)
**Email**: support@pmhnpjobs.com
**Website**: https://pmhnpjobs.com

---

## 🗺️ Roadmap

### Planned Features

**Short Term** (v1.1):
- [ ] Quality scoring system for jobs
- [ ] Admin analytics dashboard frontend
- [ ] Company pages (`/company/[slug]`)
- [ ] Employer logos on job cards
- [ ] Job comparison tool
- [ ] Dark mode support

**Medium Term** (v1.5):
- [ ] Advanced search (Boolean operators)
- [ ] Salary insights page
- [ ] Resume parsing
- [ ] One-click apply
- [ ] Employer verification process
- [ ] Job recommendation engine

**Long Term** (v2.0):
- [ ] Mobile app (React Native)
- [ ] API for third-party integrations
- [ ] Bulk job posting
- [ ] Video job descriptions
- [ ] Live chat support
- [ ] Recruiter accounts

---

## 📊 Stats

- **Lines of Code**: ~25,000+
- **Components**: 50+
- **API Routes**: 40+
- **Database Models**: 11
- **Job Sources**: 6
- **Email Templates**: 6
- **Cron Jobs**: 7
- **Scripts**: 35+

---

**Built with ❤️ for the PMHNP community**

_Last updated: December 23, 2025_
