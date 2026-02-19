# 🏥 PMHNP Job Board

> **The #1 Job Board for Psychiatric Mental Health Nurse Practitioners**  
> A comprehensive, production-ready platform connecting PMHNPs with their dream roles through intelligent multi-source job aggregation, strict relevance filtering, and modern web technologies.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-cyan?style=flat-square&logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-7-teal?style=flat-square&logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue?style=flat-square&logo=postgresql)
![Stripe](https://img.shields.io/badge/Stripe-Payments-635bff?style=flat-square&logo=stripe)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel&style=flat-square)

**Live:** [https://pmhnphiring.com](https://pmhnphiring.com)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Pages & Routes](#-pages--routes)
- [Components](#-components)
- [Core Libraries](#-core-libraries)
- [Job Aggregation System](#-job-aggregation-system)
- [Ingestion Pipeline](#-ingestion-pipeline)
- [API Documentation](#-api-documentation)
- [Database Schema](#-database-schema)
- [Cron Jobs](#-cron-jobs)
- [Custom React Hooks](#-custom-react-hooks)
- [Blog System](#-blog-system)
- [Autofill Browser Extension](#-autofill-browser-extension)
- [Scripts & Commands](#-scripts--commands)
- [Environment Variables](#-environment-variables)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [License](#-license)

---

## 📖 Overview

**PMHNP Job Board** is a specialized, full-stack job platform designed exclusively for Psychiatric Mental Health Nurse Practitioners. It aggregates jobs from **10 different sources** (1,674+ healthcare companies), applies strict PMHNP-relevance filtering, deduplicates, normalizes salaries, and serves them through a modern, SEO-optimized Next.js frontend.

### 🌟 Key Features

#### For Job Seekers
| Feature | Description |
|---------|-------------|
| **Advanced Filtering** | Filter by location, work mode (remote/hybrid/in-person), job type, salary range, posted date |
| **One-Click Apply** | Direct application links with click tracking |
| **Job Alerts** | Daily or weekly personalized email alerts matching search criteria |
| **Saved Jobs** | Bookmark jobs for later — persisted in localStorage |
| **Applied Jobs Tracking** | Track which jobs you've applied to |
| **Resume Upload** | Upload and manage resume via Supabase Storage |
| **Profile System** | Full candidate profile with licenses, certifications, education, work experience |
| **Location-Based Search** | Browse by city, state, or remote; dedicated pages for all 50 states + major cities |
| **Salary Display** | Normalized salary ranges with smart hourly ↔ annual conversion |
| **Category Pages** | Dedicated pages for Remote, Travel, Telehealth, New-Grad, and Per-Diem jobs |
| **Dark Mode** | Full dark/light theme support via CSS custom properties |
| **Mobile Optimized** | Responsive grid layout, bottom nav, mobile filter drawer |

#### For Employers
| Feature | Description |
|---------|-------------|
| **Free Job Posting** | Post jobs for free (configurable paid mode via Stripe) |
| **Featured Listings** | Premium featured jobs with enhanced visibility |
| **Dashboard Analytics** | Track views, clicks, and applicant engagement |
| **Job Management** | Edit, renew, or upgrade active job posts |
| **Stripe Invoices** | Automatic PDF invoice generation |
| **Draft Resumption** | Save incomplete job posts and resume later via email token |
| **Candidate Search** | Browse candidate profiles (when profile visibility enabled) |
| **Expiry Warnings** | Automated email reminders before jobs expire |

#### Smart Job Aggregation System
| Feature | Description |
|---------|-------------|
| **10 Data Sources** | Adzuna, Jooble, Greenhouse, Lever, USAJobs, Workday, Ashby, BambooHR, JSearch, ATS-Jobs-DB |
| **1,674+ Companies** | Master list from healthcare ATS CSV, distributed across aggregators |
| **Parallel Batch Processing** | Companies processed in concurrent batches (10/batch) with configurable delays |
| **Chunked Ingestion** | Large sources split into chunks across separate cron invocations |
| **240s Time Budget** | Graceful early-stop before Vercel's 300s hard limit |
| **Strict PMHNP Filter** | `isRelevantJob()` with 40+ negative keywords blocks non-psychiatric roles |
| **Auto-Deduplication** | Exact ID match → fuzzy title+company match → apply URL match |
| **Auto-Renewal** | Existing jobs found during re-ingestion get their freshness renewed |
| **Salary Normalization** | Converts all formats to standardized annual/hourly with display strings |
| **Location Parsing** | Extracts city, state, country, remote/hybrid status |
| **Company Linking** | Automatic company normalization and profile creation |
| **Quality Scoring** | Multi-factor confidence scores for data quality ranking |
| **Dead Link Detection** | Weekly cron validates apply links and unpublishes dead ones |

#### SEO & Performance
| Feature | Description |
|---------|-------------|
| **Dynamic Sitemap** | Auto-generated XML sitemap for all published jobs, states, cities, blog posts |
| **Structured Data** | Schema.org `JobPosting`, `Organization`, `BreadcrumbList` markup |
| **IndexNow** | Automatic search engine pinging for new jobs (Google, Bing, Yandex) |
| **Dynamic Meta Tags** | Context-aware meta tags based on search filters and page content |
| **ISR** | 60-second Incremental Static Regeneration for all job pages |
| **OG Image Generation** | Dynamic `/api/og` endpoint generates social sharing images |
| **Canonical Tags** | Proper canonical URLs on all pages |

---

## 🛠 Tech Stack

### Frontend
| Technology | Version | Role |
|-----------|---------|------|
| [Next.js](https://nextjs.org/) | 16 | React framework with App Router |
| [React](https://react.dev/) | 19 | UI library |
| [TypeScript](https://www.typescriptlang.org/) | 5 | Type safety |
| [Tailwind CSS](https://tailwindcss.com/) | 4 | Utility-first CSS |
| [Framer Motion](https://www.framer.com/motion/) | 12 | Animations (hero, scroll reveal, page transitions) |
| [Lucide React](https://lucide.dev/) | 0.555 | Icon library |
| [React Hook Form](https://react-hook-form.com/) | 7 | Form management |
| [Zod](https://zod.dev/) | 4 | Schema validation |

### Backend
| Technology | Version | Role |
|-----------|---------|------|
| [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction) | 16 | Serverless API (33 route groups) |
| [Prisma](https://www.prisma.io/) | 7 | Type-safe ORM with driver adapters |
| [PostgreSQL](https://www.postgresql.org/) | – | Relational database |
| [Supabase](https://supabase.com/) | – | Auth, Storage, and DB hosting |

### Integrations
| Service | Role |
|---------|------|
| [Stripe](https://stripe.com/) | Payment processing (checkout, webhooks, invoices) |
| [Resend](https://resend.com/) | Transactional emails (alerts, welcome, expiry warnings) |
| [Upstash Redis](https://upstash.com/) | API rate limiting |
| [@react-pdf/renderer](https://react-pdf.org/) | PDF invoice generation |
| [@vercel/og](https://vercel.com/docs/functions/og-image-generation) | Dynamic OG image generation |
| [sanitize-html](https://www.npmjs.com/package/sanitize-html) | HTML sanitization for descriptions |
| [gray-matter](https://www.npmjs.com/package/gray-matter) | Markdown frontmatter parsing for blog |
| [next-mdx-remote](https://github.com/hashicorp/next-mdx-remote) | MDX rendering for blog content |
| [jose](https://github.com/panva/jose) | JWT token handling for extension auth |
| [date-fns](https://date-fns.org/) | Date formatting and manipulation |

### DevOps
| Tool | Role |
|------|------|
| [Vercel](https://vercel.com/) | Hosting & deployment |
| [Vercel Cron](https://vercel.com/docs/cron-jobs) | 55 scheduled cron entries |
| [Vitest](https://vitest.dev/) | Unit testing |
| [ESLint](https://eslint.org/) | Code linting |
| [Prettier](https://prettier.io/) | Code formatting |

---

## 🏗 Architecture

### System Design

```text
┌──────────────────────────────────────────────────────────────────────┐
│                        PMHNP Job Board                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐          │
│  │   Next.js   │────▶│   Prisma 7   │────▶│ PostgreSQL   │          │
│  │  App Router │     │  (pg driver) │     │  (Supabase)  │          │
│  └──────┬──────┘     └──────────────┘     └──────────────┘          │
│         │                                                            │
│  ┌──────▼────────────────────────────────────────────────────────┐  │
│  │                   33 API Route Groups                          │  │
│  ├───────────┬──────────┬───────────┬──────────┬────────────────┤  │
│  │ Jobs API  │ Auth API │ Cron API  │ Employer │ Profile/Alerts │  │
│  │ (CRUD,    │(Supabase │(55 crons) │(Dashboard│ (Candidate     │  │
│  │ Filters)  │ OAuth)   │           │ Payments)│  Management)   │  │
│  └─────┬─────┴─────┬────┴─────┬─────┴────┬─────┴───────┬────────┘  │
│        │           │          │           │             │            │
│  ┌─────▼────┐ ┌───▼────┐ ┌──▼──────┐ ┌─▼──────┐ ┌───▼──────┐    │
│  │10-Source │ │Supabase│ │ Vercel  │ │ Stripe │ │ Resend   │    │
│  │Aggregator│ │Auth +  │ │ Cron   │ │Payments│ │ Emails   │    │
│  │ Engine   │ │Storage │ │ (55x)  │ │Webhooks│ │          │    │
│  └────┬─────┘ └────────┘ └────────┘ └────────┘ └──────────┘    │
│       │                                                           │
│  ┌────▼──────────────────────────────────────────────────────┐    │
│  │  External APIs                                             │    │
│  │  Adzuna · Jooble · Greenhouse · Lever · USAJobs ·          │    │
│  │  Workday · Ashby · BambooHR · JSearch · ATS-Jobs-DB        │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Job Ingestion** (Vercel Cron — 55 entries, twice daily)
   - Cron triggers `/api/cron/ingest?source=X&chunk=N`
   - Aggregator fetches companies in parallel batches (10/batch, 200ms delay)
   - Each job → Normalize → Filter (`isRelevantJob`) → Deduplicate → Insert → Location parse → Company link → Quality score
   - 240s time budget — stops gracefully before Vercel's 300s hard limit
   - Discord webhook notification on completion

2. **Job Search** (User-Facing)
   - Server Component fetches from DB via Prisma with ISR (60s revalidation)
   - Client-side hydration for filters, pagination, sorting
   - LinkedIn-style filter sidebar (desktop) or drawer (mobile)

3. **Job Posting** (Employer Flow)
   - Employer fills form → Zod validation
   - Draft saved with email resume token
   - Optional payment via Stripe Checkout
   - Webhook confirms payment → job published

4. **Job Alerts** (Automated)
   - Cron runs daily at 8 AM UTC
   - Queries active alerts, matches new jobs since last send
   - Sends personalized HTML emails via Resend

5. **Housekeeping** (Automated)
   - Freshness decay updates quality scores daily
   - Dead link checker validates apply URLs weekly
   - Expired jobs cleanup runs daily
   - Description cleanup strips malformed HTML daily
   - IndexNow pings search engines for new URLs daily

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 20+** ([Download](https://nodejs.org/))
- **PostgreSQL** (Supabase recommended)
- **Stripe Account** (optional, for paid posting)
- **Resend Account** (for transactional emails)

### Installation

1. **Clone and install:**
   ```bash
   git clone https://github.com/your-username/pmhnp-job-board.git
   cd pmhnp-job-board
   npm install
   ```

2. **Configure environment:**
   Copy `.env.local.example` to `.env.local` and fill in values (see [Environment Variables](#-environment-variables)).

3. **Setup database:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Run development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

5. **View database (optional):**
   ```bash
   npx prisma studio
   ```

---

## 📂 Project Structure

```text
pmhnp-job-board/
├── app/                          # Next.js 16 App Router
│   ├── page.tsx                  # Homepage (hero, stats, featured jobs, CTA)
│   ├── layout.tsx                # Root layout (header, footer, theme, analytics)
│   ├── globals.css               # Global styles + CSS custom properties
│   ├── robots.ts                 # Dynamic robots.txt generator
│   ├── sitemap.ts                # Dynamic XML sitemap (jobs, states, cities, blog)
│   ├── not-found.tsx             # Custom 404 page
│   ├── error.tsx                 # Error boundary
│   ├── global-error.tsx          # Global error boundary
│   │
│   ├── jobs/                     # Job listing & detail pages
│   │   ├── page.tsx              # Main jobs search page (SSR + client filters)
│   │   ├── JobsPageClient.tsx    # Client-side jobs page (30KB — filters, sort, pagination)
│   │   ├── [slug]/               # Dynamic job detail pages
│   │   ├── state/[state]/        # State-specific job pages (50 states)
│   │   ├── city/[city]/          # City-specific job pages
│   │   ├── remote/               # Remote-only jobs
│   │   ├── travel/               # Travel PMHNP jobs
│   │   ├── telehealth/           # Telehealth jobs
│   │   ├── new-grad/             # New graduate positions
│   │   ├── per-diem/             # Per diem jobs
│   │   ├── locations/            # Browse all locations
│   │   └── edit/                 # Edit job (employer)
│   │
│   ├── api/                      # 33 API Route Groups
│   │   ├── cron/                 # 8 cron endpoints (55 scheduled entries)
│   │   │   ├── ingest/           # Job ingestion (per-source, per-chunk)
│   │   │   ├── send-alerts/      # Daily job alert emails
│   │   │   ├── freshness-decay/  # Quality score decay
│   │   │   ├── expiry-warnings/  # Employer expiry emails
│   │   │   ├── check-dead-links/ # Weekly apply link validation
│   │   │   ├── cleanup-expired/  # Unpublish expired jobs
│   │   │   ├── cleanup-descriptions/ # Strip malformed HTML
│   │   │   └── index-urls/       # IndexNow search engine ping
│   │   ├── jobs/                 # Job CRUD, filtering, categories
│   │   ├── employer/             # Employer dashboard, candidates
│   │   ├── profile/              # User profile management (17 sub-routes)
│   │   ├── job-alerts/           # Alert CRUD + unsubscribe
│   │   ├── blog/                 # Blog post creation
│   │   ├── autofill/             # Chrome extension API (7 sub-routes)
│   │   ├── admin/                # Admin endpoints (stats, triggers)
│   │   ├── analytics/            # Click tracking
│   │   ├── webhooks/             # Stripe webhooks
│   │   ├── og/                   # Dynamic OG image generation
│   │   └── ...                   # 20+ more route groups
│   │
│   ├── admin/                    # Admin dashboard
│   ├── blog/                     # Blog listing + [slug] detail
│   ├── dashboard/                # User dashboard
│   ├── employer/                 # Employer pages (dashboard, candidates)
│   ├── post-job/                 # Job posting flow
│   ├── salary-guide/             # PMHNP salary guide
│   ├── resources/                # Career resources page
│   ├── about/                    # About page
│   ├── contact/                  # Contact page
│   ├── faq/                      # FAQ page
│   ├── for-employers/            # Employer landing page
│   ├── for-job-seekers/          # Job seeker landing page
│   ├── job-alerts/               # Alert management pages
│   ├── login/                    # Login page
│   ├── signup/                   # Signup page
│   ├── settings/                 # User settings
│   ├── saved/                    # Saved jobs page
│   ├── privacy/                  # Privacy policy
│   ├── terms/                    # Terms of service
│   └── ...                       # forgot-password, reset-password, etc.
│
├── components/                   # 66+ Reusable UI Components
│   ├── HomepageHero.tsx          # Animated hero with search bar + email capture
│   ├── Header.tsx                # Site header with navigation + auth
│   ├── Footer.tsx                # Site footer with links
│   ├── BottomNav.tsx             # Mobile bottom navigation bar
│   ├── JobCard.tsx               # Job listing card (grid/list modes)
│   ├── FeaturedJobs.tsx          # Homepage featured jobs carousel
│   ├── StatsCounter.tsx          # Animated stats counters
│   ├── EmployerMarquee.tsx       # Scrolling employer logos
│   ├── WhyUs.tsx                 # "Why Choose Us" section
│   ├── Comparison.tsx            # Platform comparison cards
│   ├── Testimonial.tsx           # User testimonial section
│   ├── BrowseByState.tsx         # State browsing grid
│   ├── StayConnected.tsx         # Salary guide + job alerts CTA
│   ├── EmployerCTA.tsx           # Employer call-to-action
│   ├── ThemeProvider.tsx         # Dark/light theme management
│   ├── ScrollReveal.tsx          # Scroll-triggered animations
│   ├── MobileFilterDrawer.tsx    # Mobile filter panel
│   ├── ShareButtons.tsx          # Social sharing (Twitter, LinkedIn, Facebook, Email)
│   ├── ReportJobButton.tsx       # Report problematic jobs
│   ├── FeedbackWidget.tsx        # Floating feedback form
│   ├── SalaryGuideSection.tsx    # Salary data visualization
│   ├── RelatedJobs.tsx           # Related job recommendations
│   ├── RelatedBlogPosts.tsx      # Related blog posts on job pages
│   ├── StateFAQ.tsx              # State-specific PMHNP FAQ
│   ├── auth/                     # Auth components (8 files)
│   │   ├── LoginForm.tsx
│   │   ├── SignUpForm.tsx
│   │   ├── GoogleSignInButton.tsx
│   │   ├── HeaderAuth.tsx
│   │   ├── UserMenu.tsx
│   │   ├── ResumeUpload.tsx
│   │   └── AvatarUpload.tsx
│   ├── employer/                 # Employer components (6 files)
│   ├── profile/                  # Profile components (4 files)
│   ├── settings/                 # Settings components (8 files)
│   ├── jobs/                     # Job-specific components (2 files)
│   │   └── LinkedInFilters.tsx   # LinkedIn-style filter sidebar
│   ├── ui/                       # Base UI primitives (7 files)
│   │   ├── AnimatedContainer.tsx
│   │   ├── Badge.tsx
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Skeleton.tsx
│   │   └── StaggeredList.tsx
│   └── ...                       # 30+ more components
│
├── lib/                          # Core Business Logic
│   ├── aggregators/              # 10 job source connectors + constants
│   ├── utils/                    # Job filter, quality score, URL resolver
│   ├── hooks/                    # 8 custom React hooks
│   ├── auth/                     # Auth utilities
│   ├── supabase/                 # Supabase client config
│   ├── ingestion-service.ts      # Main ingestion orchestrator
│   ├── job-normalizer.ts         # Job data normalization
│   ├── deduplicator.ts           # Deduplication engine
│   ├── salary-normalizer.ts      # Salary standardization
│   ├── location-parser.ts        # Location extraction
│   ├── company-normalizer.ts     # Company name normalization
│   ├── description-cleaner.ts    # HTML/text cleanup
│   ├── freshness-decay.ts        # Job ranking algorithm
│   ├── filters.ts                # Search filter builder
│   ├── email-service.ts          # Email templates (51KB — all transactional emails)
│   ├── alert-sender.ts           # Job alert matcher & sender
│   ├── blog.ts                   # Blog CRUD operations
│   ├── blog-formatter.ts         # Blog content formatting
│   ├── search-indexing.ts        # IndexNow integration
│   ├── invoice-generator.tsx     # PDF invoice generation
│   ├── rate-limit.ts             # Upstash Redis rate limiting
│   ├── state-practice-authority.ts  # State PMHNP practice authority data
│   └── ...                       # 15+ more modules
│
├── prisma/
│   └── schema.prisma             # 18 database models (531 lines)
│
├── content/
│   └── blog/                     # 11 markdown blog posts
│
├── scripts/                      # 75 maintenance/data scripts
├── tests/                        # 7 test files (Vitest)
├── types/                        # Shared TypeScript types
├── public/                       # Static assets (favicons, OG images, resume CSV)
├── pmhnp-autofill-extension/     # Chrome extension (90 files)
├── vercel.json                   # 55 cron entries + cache headers
└── package.json                  # Dependencies & scripts
```

---

## 🌐 Pages & Routes

### Public Pages

| Route | Description |
|-------|-------------|
| `/` | Homepage — animated hero, search bar, stats counter, employer marquee, featured jobs, "Why Us", testimonials, state browser, comparison cards, salary guide CTA, employer CTA |
| `/jobs` | Main job search — server-rendered + client-side filters, sort (Best/Newest/Salary), grid view, pagination (50/page) |
| `/jobs/[slug]` | Job detail — full description, salary, apply button, related jobs, employer info, structured data |
| `/jobs/state/[state]` | State pages — all 50 US states with practice authority info, state-specific FAQ, related resources |
| `/jobs/city/[city]` | City pages — city-specific job listings |
| `/jobs/locations` | Browse all locations |
| `/jobs/remote` | Remote-only PMHNP positions |
| `/jobs/travel` | Travel nursing PMHNP positions |
| `/jobs/telehealth` | Telehealth/virtual PMHNP positions |
| `/jobs/new-grad` | New graduate PMHNP positions |
| `/jobs/per-diem` | Per diem PMHNP positions |
| `/blog` | Blog listing — career advice, salary insights, state guides |
| `/blog/[slug]` | Individual blog post (MDX rendered) |
| `/salary-guide` | Interactive salary guide with state-by-state data |
| `/resources` | Career resources for PMHNPs |
| `/about` | About the platform |
| `/faq` | Frequently asked questions |
| `/contact` | Contact form |
| `/for-employers` | Employer landing page |
| `/for-job-seekers` | Job seeker landing page |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |

### Authenticated Pages

| Route | Description |
|-------|-------------|
| `/dashboard` | User dashboard (saved jobs, alerts, profile) |
| `/settings` | Account settings |
| `/saved` | Saved/bookmarked jobs |
| `/job-alerts` | Manage job alert subscriptions |
| `/post-job` | Create a new job posting |
| `/post-job/preview` | Preview before publishing |
| `/post-job/checkout` | Stripe payment page |
| `/employer/dashboard` | Employer analytics dashboard |
| `/employer/candidates` | Browse candidate profiles |
| `/admin` | Admin panel (role-gated) |

### Generated Routes

| Route | Description |
|-------|-------------|
| `/sitemap.xml` | Dynamic sitemap (all jobs, states, cities, blog posts) |
| `/robots.txt` | Dynamic robots.txt |
| `/api/og` | Dynamic OG image generation |

---

## 🧩 Components

### Homepage Components
| Component | File | Description |
|-----------|------|-------------|
| `HomepageHero` | `HomepageHero.tsx` (20KB) | Animated hero with gradient text, search bar, quick filter chips, email capture form. Uses Framer Motion for staggered animations. |
| `StatsSection` → `StatsCounter` | `StatsSection.tsx` + `StatsCounter.tsx` | Server-fetched stats (total jobs, companies, new today, states) displayed with animated counters |
| `EmployerMarqueeSection` → `EmployerMarquee` | Two files | Horizontally scrolling employer logos fetched from DB |
| `FeaturedJobsSection` → `FeaturedJobs` | Two files | 6 latest high-quality jobs (max 2 per employer, within 3 days) rendered in a card grid |
| `WhyUs` | `WhyUs.tsx` | Three USP cards (Shield, Zap, DollarSign icons) |
| `Testimonial` | `Testimonial.tsx` | User testimonial quote card |
| `BrowseByStateSection` → `BrowseByState` | Two files | State cards grid with live job counts |
| `Comparison` | `Comparison.tsx` | Side-by-side comparison vs Indeed, LinkedIn, ZipRecruiter |
| `StayConnected` | `StayConnected.tsx` (25KB) | Salary guide teaser + job alert signup form |
| `EmployerCTA` | `EmployerCTA.tsx` | Employer call-to-action section |

### Layout Components
| Component | Description |
|-----------|-------------|
| `Header` | Main navigation with logo, links, auth state, mobile hamburger menu |
| `Footer` | Site footer with navigation links, social media, copyright |
| `BottomNav` | Mobile-only bottom navigation bar |
| `ThemeProvider` | Dark/light theme with CSS custom properties, system preference detection |
| `ScrollReveal` | Intersection Observer wrapper for scroll-triggered animations |
| `GoogleAnalytics` | GA4 tracking script |

### Job Components
| Component | Description |
|-----------|-------------|
| `JobCard` (17KB) | Full job card — grid/list modes, salary display, bookmark, apply tracking, time ago |
| `JobFilters` (15KB) | Full filter panel — location, work mode, job type, salary, posted date |
| `LinkedInFilters` | LinkedIn-style sticky filter sidebar |
| `MobileFilterDrawer` | Slide-in filter drawer for mobile |
| `ApplyButton` | Apply click tracking with confirmation modal |
| `ApplyConfirmationModal` | Pre-apply confirmation with job details |
| `SaveJobButton` | Bookmark toggle (localStorage) |
| `ShareButtons` / `ShareModal` / `ShareMenu` | Social sharing (Twitter, LinkedIn, Facebook, email, copy link) |
| `ReportJobButton` | Report problematic/spam jobs |
| `EmailJobButton` | Email a job to someone |
| `RelatedJobs` | "More jobs like this" section |
| `SalaryInsights` | Salary context on job detail pages |
| `JobStructuredData` | Schema.org JobPosting JSON-LD |
| `JobNotFound` | Job not found / unpublished state |

### SEO Components
| Component | Description |
|-----------|-------------|
| `BreadcrumbSchema` | Schema.org BreadcrumbList JSON-LD |
| `OrganizationStructuredData` | Schema.org Organization JSON-LD |
| `InternalLinks` | Cross-linking section for category pages |
| `PopularCategories` | Category chip links |

### UI Primitives (`components/ui/`)
`AnimatedContainer`, `Badge`, `Button`, `Card`, `Input`, `Skeleton`, `StaggeredList`

---

## 📚 Core Libraries

### `lib/ingestion-service.ts` — Ingestion Orchestrator
The central pipeline that coordinates job ingestion:
1. Fetches raw jobs from an aggregator (via `fetchFromSource`)
2. Pre-loads existing jobs for fast deduplication (`externalId` → in-memory map)
3. For each raw job:
   - Normalize (`job-normalizer.ts`)
   - Filter (`isRelevantJob` from `job-filter.ts`)
   - Deduplicate: exact ID match → fuzzy match (`deduplicator.ts`)
   - Auto-renew existing duplicates (extend freshness)
   - Insert new jobs → generate slug → parse location → link company → quality score
4. Enforces 240s time budget (stops gracefully before Vercel's 300s limit)
5. Sends Discord notification with results
6. Pings search engines via IndexNow

### `lib/utils/job-filter.ts` — PMHNP Relevance Filter
Strict filter applied to ALL aggregator jobs at ingestion time:
- **Positive keywords**: `pmhnp`, `psychiatric`, `mental health nurse practitioner`, `psych np`, etc.
- **40+ negative keywords**: blocks non-psychiatric roles (pediatric, oncology, dermatology, orthopedic, etc.)
- **Generic NP handling**: titles like "Nurse Practitioner" require psychiatric context IN the title itself
- Returns `true` only for genuinely PMHNP-relevant positions

### `lib/job-normalizer.ts` — Data Normalization
Standardizes raw job data from all 10 sources into a consistent schema:
- Title cleaning + capitalization
- Description HTML sanitization
- Salary extraction and normalization
- Location standardization
- External ID and source tracking

### `lib/deduplicator.ts` — Deduplication Engine
Multi-strategy deduplication:
1. **Exact external ID** — fastest, in-memory lookup
2. **Apply URL match** — catches same job from different aggregators
3. **Fuzzy title + company** — Levenshtein distance on normalized strings
4. Returns confidence score (0–1)

### `lib/salary-normalizer.ts` — Salary Standardization
- Detects pay period (hourly, weekly, monthly, annual)
- Converts to annual equivalent (2,080 hours/year)
- Validates against PMHNP ranges ($80k–$250k annual, $30–$150 hourly)
- Generates display format: `$120k–$150k/yr` or `$55–$75/hr`

### `lib/location-parser.ts` — Location Extraction
- Parses freeform location strings into city, state, stateCode, country
- Detects remote/hybrid keywords
- Maps state abbreviations to full names and vice versa
- Geocoding fallback for ambiguous locations

### `lib/utils/quality-score.ts` — Quality Scoring
Multi-factor score (0–100) based on:
- Has salary data? (+points)
- Has description? (+points)
- Description length (+points)
- Has structured location? (+points)
- Apply link resolves? (+points)
- Freshness weighting (decays over time)

### `lib/freshness-decay.ts` — Job Ranking
Daily cron that:
- Applies time-based decay to quality scores
- Boosts recently active jobs
- Deprioritizes stale listings
- Used for "Best Match" sort order

### `lib/company-normalizer.ts` — Company Normalization
- Strips common suffixes (Inc., LLC, Corp.)
- Fuzzy matches against existing companies
- Creates new `Company` records
- Links jobs to their company profiles

### `lib/description-cleaner.ts` — HTML Cleanup
- Strips dangerous HTML tags
- Normalizes whitespace and formatting
- Removes tracking pixels and hidden content
- Generates plain-text summaries

### `lib/email-service.ts` — Email Templates (51KB)
All transactional email templates in one file:
- Welcome email
- Job alert digest (daily/weekly)
- Job posted confirmation
- Expiry warning
- Renewal confirmation
- Employer notifications
- Contact form submission

### `lib/state-practice-authority.ts` — Practice Authority Data
State-by-state PMHNP practice authority information:
- Full Practice Authority vs. Reduced vs. Restricted
- Prescriptive authority details
- Collaborative agreement requirements
- Used on state job pages for context

### `lib/search-indexing.ts` — IndexNow Integration
- Batch-pings Google, Bing, Yandex with new job URLs
- Triggered after each ingestion run
- Also has a dedicated daily cron for catch-ups

---

## 🤖 Job Aggregation System

### 10 Source Connectors

Each aggregator lives in `lib/aggregators/` and processes companies in **parallel batches** using `Promise.allSettled`:

| Source | File | Companies | Chunks | Batch Size | Delay | Description |
|--------|------|-----------|--------|------------|-------|-------------|
| **Greenhouse** | `greenhouse.ts` (36KB) | 764 | 8 | 10/batch | 200ms | ATS — public job board API. Largest source. |
| **Workday** | `workday.ts` (60KB) | 493 | 25 | 5/batch | 300ms | ATS — scrapes Workday career pages. Heaviest processing. |
| **BambooHR** | `bamboohr.ts` (15KB) | 193 | 1 | 10/batch | 300ms | ATS — public job feed API |
| **Ashby** | `ashby.ts` (13KB) | 107 | 1 | 10/batch | 200ms | ATS — public GraphQL API |
| **Lever** | `lever.ts` (10KB) | 104 | 1 | 10/batch | 200ms | ATS — public JSON API |
| **JSearch** | `jsearch.ts` (18KB) | N/A | 8 | N/A | N/A | RapidAPI job search (search-term based) |
| **Adzuna** | `adzuna.ts` (5KB) | N/A | 1 | N/A | N/A | REST API with app ID/key auth |
| **Jooble** | `jooble.ts` (6KB) | N/A | 1 | N/A | N/A | POST API with keywords |
| **USAJobs** | `usajobs.ts` (8KB) | N/A | 1 | N/A | N/A | Federal government jobs API |
| **ATS-Jobs-DB** | `ats-jobs-db.ts` (7KB) | N/A | 1 | N/A | N/A | Secondary job search aggregator |

**Total ATS companies tracked: 1,674** (from `public/resume/final_healthcare_ats_all_sources_2026.csv`)

### `lib/aggregators/constants.ts` — Shared Constants
Contains:
- `SEARCH_QUERIES` — PMHNP-specific search terms
- `STATES` — All 50 US states with codes
- `TOP_500_CITIES` — Major US cities for location parsing
- `TOP_EMPLOYERS` — Known healthcare employers

### Chunking Strategy
Large aggregators are split into chunks, each run as a separate cron invocation:
- **Greenhouse**: 8 chunks (~96 companies each)
- **Workday**: 25 chunks (~20 companies each, heavier processing)
- **JSearch**: 8 chunks (by search term groups)
- Other sources: 1 chunk (small enough to process in one run)

---

## 🔌 Ingestion Pipeline

### Per-Job Processing Steps

For each raw job returned by an aggregator:

```
Raw Job
  │
  ├─▶ 1. normalizeJob()           — Standardize fields, clean HTML
  ├─▶ 2. isRelevantJob()          — PMHNP relevance filter (40+ negative keywords)
  ├─▶ 3. existingJobsMap.has()    — Fast in-memory externalId lookup
  ├──▶ 4. checkDuplicate()        — Fuzzy matching (title + company + applyURL)
  │     └── If duplicate → renewJob() (extend freshness)
  ├──▶ 5. prisma.job.create()     — Insert new job
  ├──▶ 6. Generate slug           — SEO-friendly URL slug
  ├──▶ 7. parseJobLocation()      — Extract city/state/remote
  ├──▶ 8. linkJobToCompany()      — Normalize & link company
  └──▶ 9. computeQualityScore()   — Multi-factor quality rating
```

### Time Budget
- **MAX_INGESTION_MS** = 240,000ms (240s)
- Checked before each job; breaks gracefully if exceeded
- Leaves 60s buffer for post-processing (Discord notification, IndexNow ping)

### Auto-Renewal
When a duplicate is found during ingestion:
- The existing job's `lastSeenAt` is updated to `now()`
- `expiresAt` is extended by 30 days
- This keeps active positions fresh without creating duplicates

---

## 📡 API Documentation

### Public Endpoints

#### `GET /api/jobs`
Fetch jobs with filters.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Search keyword |
| `location` | string | City, state, or "Remote" |
| `workMode` | string[] | `remote`, `hybrid`, `in-person` |
| `jobType` | string[] | `Full-Time`, `Part-Time`, `Contract`, `Per Diem` |
| `salaryMin` | number | Minimum annual salary |
| `salaryMax` | number | Maximum annual salary |
| `postedWithin` | string | `24h`, `3d`, `7d`, `30d` |
| `sort` | string | `best`, `newest`, `salary` |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 50) |

#### `GET /api/jobs/[id]`
Get a single job by ID with full details.

#### `POST /api/jobs/post-free`
Create a free job posting. Requires: `title`, `employer`, `location`, `description`, `applyLink`, `contactEmail`.

#### `GET /api/jobs/categories`
Get job counts by category (remote, travel, telehealth, etc.).

#### `GET /api/jobs/filter-counts`
Get counts for each filter option (for displaying in sidebar).

#### `POST /api/job-alerts`
Create a new job alert subscription.

#### `POST /api/contact`
Submit contact form.

#### `POST /api/feedback`
Submit user feedback.

#### `POST /api/newsletter`
Subscribe to newsletter.

#### `GET /api/salary-guide`
Get salary data by state/region.

### Employer Endpoints

#### `GET /api/employer/dashboard?token=X`
Get employer dashboard data (requires `dashboardToken`).

#### `GET /api/employer/candidates`
Browse candidate profiles (requires employer auth).

#### `POST /api/create-checkout`
Create Stripe Checkout session for job posting payment.

#### `POST /api/create-renewal-checkout`
Create renewal Checkout session.

#### `POST /api/create-upgrade-checkout`
Create upgrade-to-featured Checkout session.

### Admin Endpoints (Role-gated)

#### `GET /api/admin/stats`
Dashboard statistics (total jobs, sources, alerts, employers).

#### `POST /api/admin/trigger-ingestion`
Manually trigger job ingestion for a specific source.

### Cron Endpoints (Bearer token auth)

All require `Authorization: Bearer <CRON_SECRET>`:

| Endpoint | Description |
|----------|-------------|
| `GET /api/cron/ingest?source=X&chunk=N` | Ingest jobs from source |
| `GET /api/cron/send-alerts` | Send job alert emails |
| `GET /api/cron/freshness-decay` | Update quality scores |
| `GET /api/cron/expiry-warnings` | Email employers about expiring jobs |
| `GET /api/cron/check-dead-links` | Validate apply URLs |
| `GET /api/cron/cleanup-expired` | Unpublish expired jobs |
| `GET /api/cron/cleanup-descriptions` | Clean description HTML |
| `GET /api/cron/index-urls` | Ping search engines with new URLs |

### Autofill Extension API

| Endpoint | Description |
|----------|-------------|
| `POST /api/autofill/login` | Extension login (returns JWT) |
| `GET /api/autofill/profile` | Get user profile for autofill |
| `POST /api/autofill/track-application` | Log an application |
| `GET /api/autofill/jobs` | Get relevant jobs for current page |

### Webhooks

#### `POST /api/webhooks/stripe`
Handles `checkout.session.completed` — publishes job and sends confirmation email.

---

## 🗄 Database Schema

18 Prisma models across 531 lines (`prisma/schema.prisma`):

### Core Models

| Model | Description | Key Fields |
|-------|-------------|------------|
| **Job** | Job listings | `title`, `slug`, `employer`, `location`, `city`, `state`, `isRemote`, `isHybrid`, `normalizedMinSalary`, `normalizedMaxSalary`, `displaySalary`, `applyLink`, `qualityScore`, `isFeatured`, `isPublished`, `sourceProvider`, `externalId`, `originalPostedAt`, `expiresAt`, `lastSeenAt` |
| **Company** | Normalized employer profiles | `name`, `normalizedName`, `logoUrl`, `website`, `jobCount`, `isVerified` |
| **EmailLead** | Newsletter/alert subscribers | `email`, `preferences`, `source`, `isSubscribed` |
| **JobAlert** | Saved search alerts | `email`, `keyword`, `location`, `mode`, `jobType`, `minSalary`, `frequency`, `isActive`, `lastSentAt`, `token` |
| **EmployerJob** | Employer-posted job metadata | `employerName`, `contactEmail`, `editToken`, `dashboardToken`, `paymentStatus`, `stripeSessionId` |
| **UserProfile** | User accounts | `supabaseId`, `email`, `role` (`job_seeker`/`employer`/`admin`), `resumeUrl`, `phone`, `npiNumber`, `licenseState`, `yearsExperience`, `specialties`, `openToOffers`, `profileVisible`, + address fields |
| **BlogPost** | Blog articles | `title`, `slug`, `content`, `excerpt`, `category`, `status`, `author`, `publishDate`, `metaTitle`, `metaDescription` |
| **JobApplication** | Application tracking | `userId`, `jobId`, `sourceUrl`, `appliedAt`, `status` |

### Analytics Models
| Model | Description |
|-------|-------------|
| **SiteStat** | Aggregated site statistics |
| **SourceStats** | Per-source ingestion statistics (daily) |
| **ApplyClick** | Individual apply click events with referrer/UA |
| **EmployerLead** | CRM for employer outreach |

### Candidate Profile Models
| Model | Description |
|-------|-------------|
| **CandidateLicense** | Professional licenses |
| **CandidateCertification** | Certifications |
| **CandidateEducation** | Education history |
| **CandidateWorkExperience** | Work history |
| **CandidateScreeningAnswer** | Screening question responses |
| **CandidateOpenEndedResponse** | Open-ended form responses |
| **CandidateReference** | Professional references |
| **AutofillUsage** | Chrome extension usage tracking |

### Database Indexes
Heavily indexed for query performance:
- `jobs`: indexes on `slug`, `isPublished`, `sourceProvider`, `state`, `isRemote`, `qualityScore`, `createdAt`, `externalId+sourceProvider`, `companyId`, `minSalary+maxSalary`
- Composite indexes for common filter combinations

---

## ⏰ Cron Jobs

**55 total cron entries** in `vercel.json` (within Vercel Pro's 64-entry limit).

### Ingestion Schedule (48 entries — twice daily)

All ingestion runs twice daily. Times shown are UTC:

| Source | Chunks | Schedule | Time Window |
|--------|--------|----------|-------------|
| Adzuna | 1 | `0 4,16 * * *` | 4:00 / 16:00 |
| Jooble | 1 | `5 4,16 * * *` | 4:05 / 16:05 |
| Greenhouse | 8 | `10-45/5 4,16 * * *` | 4:10–4:45 / 16:10–16:45 |
| Lever | 1 | `50 4,16 * * *` | 4:50 / 16:50 |
| USAJobs | 1 | `55 4,16 * * *` | 4:55 / 16:55 |
| JSearch | 8 | `0-35/5 5,17 * * *` | 5:00–5:35 / 17:00–17:35 |
| Ashby | 1 | `40 5,17 * * *` | 5:40 / 17:40 |
| Workday | 25 | `45 5–55 7,17–19 * * *` | 5:45–7:45 / 17:45–19:45 |
| ATS-Jobs-DB | 1 | `50 7,19 * * *` | 7:50 / 19:50 |
| BambooHR | 1 | `55 7,19 * * *` | 7:55 / 19:55 |

### Housekeeping Schedule (7 entries)

| Cron | Schedule | Description |
|------|----------|-------------|
| Freshness Decay | `0 10 * * *` (daily 10 AM) | Recompute quality scores with time decay |
| Send Alerts | `0 14 * * *` (daily 2 PM) | Send job alert digest emails |
| Expiry Warnings | `30 22 * * *` (daily 10:30 PM) | Email employers about expiring jobs |
| Check Dead Links | `0 3 * * 0` (weekly Sunday 3 AM) | Validate apply URLs, unpublish dead ones |
| Cleanup Expired | `0 2 * * *` (daily 2 AM) | Unpublish jobs past expiry date |
| Cleanup Descriptions | `30 2 * * *` (daily 2:30 AM) | Strip malformed HTML from descriptions |
| Index URLs | `0 11 * * *` (daily 11 AM) | Ping search engines with new job URLs |

**Security:** All cron endpoints require `Authorization: Bearer <CRON_SECRET>` header. Vercel automatically includes this header for scheduled cron invocations.

---

## 🪝 Custom React Hooks

| Hook | File | Description |
|------|------|-------------|
| `useAppliedJobs` | `useAppliedJobs.ts` | Track applied jobs in localStorage, provides `hasApplied()`, `markApplied()` |
| `useSavedJobs` | `useSavedJobs.ts` | Bookmark/unbookmark jobs in localStorage with sync |
| `useViewedJobs` | `useViewedJobs.ts` | Track which jobs the user has viewed |
| `useViewMode` | `useViewMode.ts` | Toggle grid/list view preference |
| `useFilterPersistence` | `useFilterPersistence.ts` | Persist filter selections across sessions |
| `useLocalStorage` | `useLocalStorage.ts` | Generic localStorage hook with SSR safety |
| `useInView` | `useInView.ts` | Intersection Observer hook for lazy loading |
| `usePullToRefresh` | `usePullToRefresh.ts` | Mobile pull-to-refresh gesture handler |

---

## 📝 Blog System

### Content
- 11 markdown blog posts in `content/blog/`
- Rendered via `next-mdx-remote` with `gray-matter` frontmatter parsing
- Categories: career advice, salary data, state guides, industry news

### API
- `POST /api/blog` — Create new blog posts (API key protected)
- `lib/blog.ts` — CRUD operations, slug generation, content formatting
- `lib/blog-formatter.ts` — Content processing and formatting

### Components
- `RelatedBlogPosts` — Shows related posts on job detail pages
- Blog listing page at `/blog`
- Blog detail page at `/blog/[slug]`

---

## 🔌 Autofill Browser Extension

Located in `pmhnp-autofill-extension/` (90 files):
- **Chrome Extension** for auto-filling job applications
- Communicates with the main app via `/api/autofill/*` endpoints
- JWT-based authentication (`jose` library)
- Tracks application submissions
- Provides relevant job suggestions based on current page

---

## 🔧 Scripts & Commands

### Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | `prisma generate && prisma db push && next build` |
| `npm start` | Start production server |
| `npm run lint` / `lint:fix` | Run/fix ESLint |
| `npm run type-check` | TypeScript compiler check (no emit) |
| `npm run format` | Format with Prettier |
| `npm run validate` | `type-check && lint` |
| `npm run clean` | Remove `.next`, `out`, `dist` |

### Database

| Command | Description |
|---------|-------------|
| `npx prisma generate` | Generate Prisma Client |
| `npx prisma db push` | Push schema to database |
| `npx prisma studio` | Open Prisma Studio (DB GUI) |
| `npx prisma migrate dev` | Create new migration |

### Testing

| Command | Description |
|---------|-------------|
| `npm test` | Run tests once (Vitest) |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Coverage report |

### Maintenance

| Command | Description |
|---------|-------------|
| `npm run audit:jobs` | Audit job data quality |
| `npm run audit:salaries` | Check salary normalization |
| `npm run fix:locations` | Backfill missing city/state |
| `npm run fix:salaries` | Fix salary normalization issues |
| `npm run populate:display-salaries` | Generate display salary strings |
| `npm run clean:descriptions` | Clean HTML in job descriptions |
| `npm run ingest` | Manual ingestion (`ts-node scripts/run-ingestion.ts`) |

---

## 🔐 Environment Variables

### Required

```env
# Database (Supabase PostgreSQL)
DATABASE_URL="postgresql://user:password@host:5432/database"

# Supabase Auth & Storage
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# App URL
NEXT_PUBLIC_BASE_URL="http://localhost:3000"  # or https://pmhnphiring.com
```

### Job Aggregator APIs

```env
ADZUNA_APP_ID="your-adzuna-app-id"
ADZUNA_APP_KEY="your-adzuna-app-key"
JOOBLE_API_KEY="your-jooble-api-key"
JSEARCH_API_KEY="your-rapidapi-key"        # RapidAPI JSearch
USAJOBS_AUTH_KEY="your-usajobs-auth-key"
USAJOBS_USER_AGENT="your-email@example.com"
```

### Email & Notifications

```env
RESEND_API_KEY="re_xxxxxxxxxxxxx"
EMAIL_FROM="PMHNP Hiring <noreply@pmhnphiring.com>"
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."  # Ingestion notifications
```

### Payments (Optional)

```env
STRIPE_SECRET_KEY="sk_test_xxxxxxxxxxxxx"
STRIPE_WEBHOOK_SECRET="whsec_xxxxxxxxxxxxx"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_xxxxxxxxxxxxx"
ENABLE_PAID_POSTING="false"  # Set "true" to require payment
```

### Security & Monitoring

```env
CRON_SECRET="your-random-secret-string"
BLOG_API_KEY="your-blog-api-key"  # For POST /api/blog
SENTRY_DSN="https://xxxxxxxxxxxxx@sentry.io/xxxxxxxxxxxxx"
```

### Rate Limiting (Optional)

```env
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."
```

---

## 🧪 Testing

```bash
npm test                # Run once
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

Tests in `tests/` using Vitest:
- Unit tests for library functions (normalizer, deduplicator, filter)
- API endpoint tests

---

## 🚢 Deployment

### Vercel (Production)

1. Push to `main` branch → auto-deploys to Vercel
2. **Environment Variables**: Set all required vars in Vercel Dashboard → Settings → Environment Variables
3. **Cron Jobs**: Auto-configured from `vercel.json` (55 entries)
4. **Stripe Webhook**: Set endpoint to `https://pmhnphiring.com/api/webhooks/stripe`
5. **Deployment Protection**: Set to "Standard Protection" (protects preview deploys, not production custom domain)

### Post-Deployment Checklist

- [ ] All environment variables configured
- [ ] Database schema pushed (`prisma db push` runs in build)
- [ ] Stripe webhook endpoint added
- [ ] `CRON_SECRET` matches between Vercel env and cron auth
- [ ] Discord webhook URL set for ingestion notifications
- [ ] Email service configured (Resend)
- [ ] Verify cron jobs running (Vercel Dashboard → Cron Jobs)
- [ ] Check first ingestion logs for errors
- [ ] Test job posting flow end-to-end
- [ ] Verify sitemap.xml generation

---

## 📄 License

This project is licensed under the MIT License.

---

**Built with ❤️ for the PMHNP community**
