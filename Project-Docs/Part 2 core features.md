# PMHNP Job Board - PART 2: Core Features
## View Jobs, Search, Filters, Job Aggregation (Slices 1-6)

**Prerequisites:** Complete PART 1 (Setup & Foundation)

---

## 📖 What You'll Build in Part 2

- **Slice 1:** View Jobs List (2 hours) - See jobs on screen!
- **Slice 2:** Job Details Page (1 hour) - Click job → full details
- **Slice 3:** Search & Filters (2 hours) - Search bar, location, remote, salary
- **Slice 4:** Job Aggregation - Adzuna (2 hours) - **100+ real jobs!**
- **Slice 5:** Multiple Job Sources (2 hours) - **200+ total jobs!**
- **Slice 6:** Post Job Form (2 hours) - Employer form (payment in Part 3)

**Total Time:** ~11 hours

---

## SLICE 1: View Jobs - First Working Feature! (2 hours)

**Goal:** See your 5 test jobs displayed beautifully on screen.

### Step 1.1: Create Type Definitions

**Cursor Prompt:**

```
Create types/job.ts with these TypeScript interfaces:

1. Job interface (export type from Prisma):
   - Import { Job } from '@prisma/client'
   - Export type { Job }

2. JobFilters interface:
   - search?: string
   - location?: string
   - jobType?: string
   - mode?: string
   - minSalary?: number
   - maxSalary?: number

3. JobListResponse interface:
   - jobs: Job[]
   - total: number

Export all types.

DO NOT modify any other files.
```

### Step 1.2: Create Utility Functions

**Cursor Prompt:**

```
Create lib/utils.ts with these utility functions:

1. cn(...inputs: ClassValue[]): string
   - Merges Tailwind classes using clsx and twMerge
   - Import { type ClassValue, clsx } from 'clsx'
   - Import { twMerge } from 'tailwind-merge'
   - Implementation: return twMerge(clsx(inputs))

2. formatDate(date: string | Date): string
   - Formats to "2 days ago" style using date-fns
   - Import { formatDistanceToNow } from 'date-fns'
   - Returns "Just posted" if less than 1 hour
   - Add "ago" suffix

3. formatSalary(min?: number | null, max?: number | null, period?: string | null): string
   - If both min and max: "$120k-150k/year" or "$50-65/hour"
   - If only min: "$120k+/year"
   - If neither: returns empty string
   - Divide by 1000 and add 'k' for annual salaries

4. slugify(title: string, id: string): string
   - Converts "PMHNP Remote California" to "pmhnp-remote-california-abc123"
   - Lowercase, replace spaces with hyphens, remove special chars
   - Append last 8 chars of id

Export all functions with proper TypeScript types.

DO NOT modify any other files.
```

### Step 1.3: Create Jobs API Endpoint

**Cursor Prompt:**

```
Create app/api/jobs/route.ts that handles GET requests with Prisma:

1. Import prisma from '@/lib/prisma'
2. Import { NextRequest, NextResponse } from 'next/server'
3. Import { Job } from '@prisma/client'

4. Export async function GET(request: NextRequest)

5. Read these query params from URL:
   - search, location, jobType, mode, minSalary, maxSalary, page (default '1')

6. Build Prisma where clause:
   - Always: isPublished: true
   - If search: OR conditions on title, employer, description (contains, case insensitive)
   - If location: location contains (case insensitive)
   - If jobType: jobType equals
   - If mode: mode equals
   - If minSalary: minSalary >= minSalary
   - If maxSalary: maxSalary <= maxSalary

7. Query with Prisma:
   const [jobs, total] = await prisma.$transaction([
     prisma.job.findMany({
       where: whereClause,
       orderBy: [
         { isFeatured: 'desc' },
         { createdAt: 'desc' }
       ],
       take: 20,
       skip: (page - 1) * 20
     }),
     prisma.job.count({ where: whereClause })
   ])

8. Return NextResponse.json({ jobs, total })

9. Error handling with try/catch, return 500 on error

Use TypeScript with proper types.

DO NOT modify any other files.
```

**Test API:**

Visit `http://localhost:3000/api/jobs`

Should return JSON with your 5 test jobs.

**✅ CHECKPOINT:** API returns `{"jobs":[...5 jobs...],"total":5}`

### Step 1.4: Create Layout Components

**Cursor Prompt 1:**

```
Create components/Header.tsx:

A Next.js client component ("use client" at top) with:
- Logo text "PMHNP Jobs" on left (Link to "/")
- Navigation: Links to "/jobs", "/post-job", "/salary-guide"
- "Sign up for alerts" button on right (Link to "/#subscribe")
- Mobile: Hamburger menu that shows nav items (useState for open/close)
- Styling: Blue accent (#3b82f6), white background, shadow
- Use Tailwind CSS only
- Use lucide-react Menu and X icons for hamburger
- Responsive: Desktop (flex row), Mobile (hamburger menu)

Import Link from 'next/link'
Import { Menu, X } from 'lucide-react'
Import { useState } from 'react'

Export as default.
DO NOT modify any other files.
```

**Cursor Prompt 2:**

```
Create components/Footer.tsx:

A Next.js functional component with:
- Three columns: About, Resources, Legal
- About: 
  - Heading "PMHNP Jobs"
  - Text: "The #1 job board for psychiatric nurse practitioners"
- Resources:
  - Links: "Browse Jobs" (/jobs), "Post a Job" (/post-job), "Salary Guide" (/salary-guide)
- Legal:
  - Links: "Privacy", "Terms", "Contact" (can be # for now)
- Bottom: Copyright text "© 2024 PMHNP Jobs. All rights reserved."
- Styling: Gray background (bg-gray-50), text-sm, padding
- Mobile: Stack columns vertically

Use Tailwind CSS only.
Import Link from 'next/link'

Export as default.
DO NOT modify any other files.
```

**Cursor Prompt 3:**

```
Update app/layout.tsx:

1. Import Header from '@/components/Header'
2. Import Footer from '@/components/Footer'
3. Wrap {children} with Header and Footer
4. Update metadata:
   - title: "PMHNP Jobs - Find Remote & Local Psychiatric NP Jobs"
   - description: "The #1 job board for psychiatric mental health nurse practitioners. 200+ remote and in-person PMHNP jobs updated daily."
5. Keep existing font (Inter) and className

Structure:
<body className={inter.className}>
  <Header />
  <main className="min-h-screen">{children}</main>
  <Footer />
</body>

ONLY modify app/layout.tsx.
DO NOT change any other files.
```

**Test:** Visit `http://localhost:3000` - should see header and footer.

### Step 1.5: Create Job Card Component

**Cursor Prompt:**

```
Create components/JobCard.tsx:

A Next.js functional component that displays a job listing card.

Props:
- job: Job (import Job type from '@prisma/client')

Display:
1. Job title (text-lg font-semibold, text-gray-900)
2. Company name below title (text-gray-600)
3. Location with MapPin icon from lucide-react (text-gray-500, text-sm, flex items-center gap-1)
4. Job type and mode as badges IF they exist (inline-flex, px-2 py-1, rounded, bg-blue-100, text-blue-700, text-xs)
5. Salary range IF available (use formatSalary from utils, text-green-600, font-semibold)
6. "Featured" badge IF isFeatured (bg-blue-600, text-white, text-xs, px-2 py-1, rounded)
7. "Verified" badge IF isVerifiedEmployer (bg-green-600, text-white, with CheckCircle icon, text-xs)
8. Created date at bottom (use formatDate from utils, text-gray-400, text-sm)

Make entire card a Link to `/jobs/${slugify(job.title, job.id)}`

Styling:
- White background, rounded-lg, shadow, p-6
- Hover: shadow-lg transition-shadow duration-200
- Mobile: Full width
- Desktop: Flex column, gap-3 between elements

Import Link from 'next/link'
Import { MapPin, CheckCircle } from 'lucide-react'
Import { formatDate, formatSalary, slugify } from '@/lib/utils'
Import { Job } from '@prisma/client'
Use Tailwind CSS only.

Export as default.
DO NOT modify any other files.
```

### Step 1.6: Create Jobs List Page

**Cursor Prompt:**

```
Create app/jobs/page.tsx:

A Next.js client component that lists all jobs.

1. "use client" at top
2. Import useState, useEffect from 'react'
3. Import JobCard from '@/components/JobCard'
4. Import { Job } from '@prisma/client'

State:
- jobs: Job[] = []
- loading: boolean = true
- error: string | null = null

On mount (useEffect):
- Fetch GET from '/api/jobs'
- Parse JSON as { jobs: Job[], total: number }
- Set jobs state
- Set loading = false
- Handle errors in catch block

Display:
- Page title: "PMHNP Jobs" (text-3xl md:text-4xl, font-bold, mb-2)
- Subtitle: "Find your next psychiatric nurse practitioner role" (text-gray-600, mb-8)
- If loading: Show "Loading jobs..." with animated spinner
- If error: Show error message in red
- If no jobs: Show "No jobs found" message
- If jobs: Display in grid:
  - grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
  - Map over jobs, render <JobCard key={job.id} job={job} />

Styling:
- Container: max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8
- Mobile responsive

Export as default.
DO NOT modify any other files.
```

**✅ CHECKPOINT - HUGE MOMENT:**

Visit `http://localhost:3000/jobs`

**You should see 5 job cards beautifully displayed!** 🎉

This is your first complete vertical slice:
- ✅ Database has jobs (via Prisma)
- ✅ API returns jobs as JSON (type-safe with Prisma)
- ✅ UI fetches and displays jobs
- ✅ You can SEE it working!

**Test:**
- [ ] All 5 jobs display
- [ ] Job cards show title, company, location
- [ ] Salary displays for jobs that have it
- [ ] "Featured" badge shows on featured jobs
- [ ] Cards are clickable (will 404 - that's OK for now)
- [ ] Mobile view works
- [ ] No console errors

**Commit:**
```bash
git add .
git commit -m "Slice 1 complete: View jobs working end-to-end with Prisma!"
```

**Take a 5 minute break. You just built your first feature!** 🚀

---

## SLICE 2: Job Details Page (1 hour)

**Goal:** Click a job → see full details → apply button.

### Step 2.1: Create Job Detail API

**Cursor Prompt:**

```
Create app/api/jobs/[id]/route.ts with Prisma:

1. Import prisma from '@/lib/prisma'
2. Import { NextRequest, NextResponse } from 'next/server'

3. Export async function GET(
     request: NextRequest,
     { params }: { params: { id: string } }
   )

4. Inside function:
   - Get job by ID: await prisma.job.findUnique({ where: { id: params.id } })
   - If not found: return NextResponse.json({ error: 'Job not found' }, { status: 404 })
   - If found: 
     - Increment view count: await prisma.job.update({
         where: { id: params.id },
         data: { viewCount: { increment: 1 } }
       })
     - Return NextResponse.json(job)

5. Error handling with try/catch, return 500 on error

Use TypeScript with proper types.

DO NOT modify any other files.
```

### Step 2.2: Create Job Detail Page

**Cursor Prompt:**

```
Create app/jobs/[slug]/page.tsx:

A Next.js Server Component that shows full job details.

1. NO "use client" (this is a Server Component)
2. Import { notFound } from 'next/navigation'
3. Import { formatSalary, formatDate } from '@/lib/utils'
4. Import icons from lucide-react: MapPin, Briefcase, Monitor, DollarSign, ExternalLink, Bookmark, CheckCircle
5. Import { Job } from '@prisma/client'

Props: { params: { slug: string } }

Extract job ID from slug:
- Slug format: "title-words-ID"
- Split by '-' and take last part: const id = params.slug.split('-').pop()

Fetch job (server-side):
- Fetch from `http://localhost:3000/api/jobs/${id}` (use full URL for server component)
- Parse JSON
- If response.error, call notFound()

Display (in readable layout):
1. Header section:
   - Job title (text-3xl md:text-4xl font-bold mb-2)
   - Company name (text-xl text-gray-600 mb-4)
   - Metadata row (flex gap-4, text-gray-600):
     - Location with MapPin icon
     - Job type with Briefcase icon (if exists)
     - Mode with Monitor icon (if exists)
   - Salary prominently IF available (text-2xl md:text-3xl text-green-600 font-bold mt-4)

2. Badges row (flex gap-2 mt-4):
   - "Featured" badge IF isFeatured (bg-blue-600 text-white px-3 py-1 rounded-full text-sm)
   - "Verified Employer" IF isVerifiedEmployer (bg-green-600 text-white, CheckCircle icon)

3. Description section (mt-8):
   - "About this role" heading (text-2xl font-bold mb-4)
   - Full description (whitespace-pre-wrap to preserve line breaks, text-gray-700 leading-relaxed)

4. Apply section (mt-8, bg-gray-50 rounded-lg p-6):
   - Large "Apply Now" link/button
   - Opens applyLink in new tab (_blank, rel="noopener noreferrer")
   - ExternalLink icon
   - Styling: bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700

5. Footer info (mt-8, text-sm text-gray-500):
   - Posted date (use formatDate)
   - Source: "Posted via {sourceProvider}" IF sourceType is external

generateMetadata function:
- Export async function generateMetadata({ params })
- Return { 
    title: `${job.title} at ${job.employer} | PMHNP Jobs`,
    description: job.descriptionSummary || job.description.slice(0, 160) 
  }

Styling:
- max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8
- White background sections with shadow-md and rounded-lg
- Mobile responsive
- Apply button very prominent

Import Link from 'next/link'
Export default.
DO NOT modify any other files.
```

**✅ CHECKPOINT:**

- Visit `http://localhost:3000/jobs`
- Click any job card
- Should navigate to `/jobs/[slug]`
- See full job details page
- Apply button visible

**Test:**
- [ ] Job title, company, details display
- [ ] Salary shows if job has one
- [ ] Full description displays
- [ ] Apply button opens external link in new tab
- [ ] Mobile view works
- [ ] Try different jobs

**Commit:**
```bash
git add .
git commit -m "Slice 2 complete: Job details page working with Prisma"
```

---

## SLICE 3: Search & Filters (2 hours)

**Goal:** Search jobs, filter by location/remote/salary.

### Step 3.1: Update Jobs API with Better Filters

**Cursor Prompt:**

```
Update app/api/jobs/route.ts to enhance filtering with Prisma:

Keep everything working, but improve the where clause building:

For search param:
- Use Prisma OR with mode: 'insensitive'
- Example: {
    OR: [
      { title: { contains: search, mode: 'insensitive' } },
      { employer: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } }
    ]
  }

For location param:
- { location: { contains: location, mode: 'insensitive' } }

For jobType param:
- { jobType: { equals: jobType } }

For mode param:
- { mode: { equals: mode } }

For salary filters:
- If minSalary: { minSalary: { gte: parseInt(minSalary) } }
- If maxSalary: { maxSalary: { lte: parseInt(maxSalary) } }

Combine all conditions with AND (this is default in Prisma).

Keep existing:
- isPublished: true filter
- Featured first, then newest sorting
- Pagination (20 per page)
- Transaction for count

ONLY modify the where clause building logic.
DO NOT change the response structure.
DO NOT modify any other files.
```

**Test filters:**

Visit:
- `http://localhost:3000/api/jobs?search=remote`
- `http://localhost:3000/api/jobs?mode=Remote`
- `http://localhost:3000/api/jobs?minSalary=100000`

Should return filtered results.

**✅ CHECKPOINT:** API filtering works.

### Step 3.2: Create Filter Component

**Cursor Prompt:**

```
Create components/JobFilters.tsx:

A client component for job filtering.

Props:
- currentFilters: {
    search?: string
    location?: string
    jobType?: string
    mode?: string
    minSalary?: number
    maxSalary?: number
  }
- onFilterChange: (filters: typeof currentFilters) => void

UI sections:
1. Search input
   - Label: "Search"
   - Input with Search icon from lucide-react
   - Value from currentFilters.search

2. Location input
   - Label: "Location"
   - Placeholder: "Remote, New York, etc."

3. Mode checkboxes:
   - Label: "Work Mode"
   - Options: Remote, Hybrid, In-Person
   - Radio buttons (only one selection)

4. Job Type checkboxes:
   - Label: "Job Type"
   - Options: Full-Time, Part-Time, Contract, Per Diem
   - Radio buttons

5. Salary range:
   - Label: "Salary Range"
   - Two number inputs (min and max)
   - Placeholders: "Min $" and "Max $"

6. "Clear all filters" button at bottom
   - Calls onFilterChange({})

Behavior:
- When any input changes, call onFilterChange with updated filters object
- Use controlled inputs (value from currentFilters)

Desktop layout: 
- Vertical sidebar (w-64)
- Sticky positioning (sticky top-20)

Mobile layout: 
- Hidden by default
- Toggle with button
- Slide-over panel (fixed, z-50, with overlay)

Styling:
- Clean form inputs with Tailwind
- Labels with font-medium text-sm
- Inputs with border, rounded, px-3 py-2
- Primary blue color for buttons
- Use space-y-6 for spacing between sections

Import { useState } from 'react'
Import { Search, X } from 'lucide-react'
Use "use client"

Export as default.
DO NOT modify any other files.
```

### Step 3.3: Update Jobs Page with Filters

**Cursor Prompt:**

```
Update app/jobs/page.tsx to add filtering:

Keep everything working, but add:

1. Import JobFilters component
2. Import { useRouter, useSearchParams } from 'next/navigation'

3. Add filters state:
   const [filters, setFilters] = useState({
     search: '',
     location: '',
     jobType: '',
     mode: '',
     minSalary: undefined as number | undefined,
     maxSalary: undefined as number | undefined
   })

4. Read URL params on mount:
   const searchParams = useSearchParams()
   useEffect(() => {
     setFilters({
       search: searchParams.get('search') || '',
       location: searchParams.get('location') || '',
       jobType: searchParams.get('jobType') || '',
       mode: searchParams.get('mode') || '',
       minSalary: searchParams.get('minSalary') ? parseInt(searchParams.get('minSalary')!) : undefined,
       maxSalary: searchParams.get('maxSalary') ? parseInt(searchParams.get('maxSalary')!) : undefined
     })
   }, [searchParams])

5. When filters change:
   const handleFilterChange = (newFilters: typeof filters) => {
     setFilters(newFilters)
     
     // Build query string
     const params = new URLSearchParams()
     Object.entries(newFilters).forEach(([key, value]) => {
       if (value) params.set(key, value.toString())
     })
     
     // Update URL
     router.push(`/jobs?${params.toString()}`)
     
     // Re-fetch jobs with new filters
     fetchJobs(newFilters)
   }

6. Update fetchJobs to accept filters param and build query string

7. Show active filter count:
   - Count non-empty filters
   - Display "X filters active" badge if count > 0

8. Layout with filters:
   - Desktop: 
     - flex gap-8
     - JobFilters on left (w-64)
     - Jobs grid on right (flex-1)
   - Mobile:
     - Filters button at top
     - Opens JobFilters in modal/drawer

ONLY add filter functionality.
DO NOT break existing job display.
```

**✅ CHECKPOINT:**

Visit `http://localhost:3000/jobs`:
- [ ] Filters sidebar shows (desktop)
- [ ] Type in search → jobs filter
- [ ] Check "Remote" → only remote jobs show
- [ ] Enter min salary → filters work
- [ ] URL updates with params
- [ ] Clear filters → all jobs show

**Test:**
- All filter combinations
- Search + filters together
- Mobile filter drawer
- Copy URL, open in new tab → filters persist

**Commit:**
```bash
git add .
git commit -m "Slice 3 complete: Search and filters working with Prisma"
```

---

## SLICE 4: Job Aggregation - Adzuna (2 hours)

**Goal:** 100+ real PMHNP jobs automatically added via Prisma.

### Step 4.1: Get Adzuna API Key

1. Go to developer.adzuna.com
2. Sign up (free)
3. Create app
4. Add to `.env`:
```
ADZUNA_APP_ID=your_app_id
ADZUNA_APP_KEY=your_app_key
```

### Step 4.2-4.6: Create Aggregation System

**Cursor Prompt:**

```
Create the job aggregation system with these 5 files:

1. lib/aggregators/adzuna.ts:
   - Export async function fetchAdzunaJobs()
   - Calls https://api.adzuna.com/v1/api/jobs/us/search/1
   - Query params: app_id, app_key, what: "PMHNP OR Psychiatric Nurse Practitioner", results_per_page: 100
   - Returns array of raw job objects with: title, company, location, description, salary_min, salary_max, redirect_url, id

2. lib/job-normalizer.ts:
   - Export function normalizeJob(rawJob: any, source: string)
   - Maps raw to Prisma Job type (camelCase fields)
   - Cleans HTML from description
   - Extracts salary with regex
   - Generates descriptionSummary (first 300 chars)
   - Determines jobType and mode from description
   - Sets sourceType = 'external', sourceProvider = source
   - Sets expiresAt = 30 days from now
   - Returns normalized job object or null if invalid

3. lib/deduplicator.ts:
   - Export async function isDuplicate(job: Partial<Job>): Promise<boolean>
   - Uses Prisma to check: await prisma.job.findFirst({
       where: {
         OR: [
           { AND: [{ externalId: job.externalId }, { sourceProvider: job.sourceProvider }] },
           { AND: [{ title: job.title }, { employer: job.employer }, { location: job.location }] }
         ]
       }
     })
   - Returns true if found

4. lib/ingestion-service.ts:
   - Export async function ingestJobs(source: string)
   - If source === 'adzuna': call fetchAdzunaJobs()
   - For each: normalize, check duplicate, insert with Prisma if not duplicate
   - Use prisma.job.create({ data: normalizedJob })
   - Track: added, skipped, errors
   - Return { added, skipped, errors, total }

5. app/api/ingest/route.ts:
   - Export async function POST(request: NextRequest)
   - Verify Authorization header matches CRON_SECRET
   - Parse body: { sources: string[] }
   - Call ingestJobs() for each source
   - Return { success: true, results: [...] }

Use TypeScript with proper types.
Import prisma from '@/lib/prisma'
Import { Job } from '@prisma/client'

DO NOT modify any other files.
```

### Step 4.7: Test Ingestion

**Run:**
```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer random_secret_string_here" \
  -d '{"sources": ["adzuna"]}'
```

**✅ CHECKPOINT - HUGE:**

1. Terminal shows success
2. Prisma Studio: `npx prisma studio` → jobs table → **100+ jobs!**
3. Visit `/jobs` → **Real PMHNP jobs!** 🎉

**Commit:**
```bash
git add .
git commit -m "Slice 4 complete: Adzuna aggregation with Prisma - 100+ real jobs!"
```

---

## SLICE 5: Multiple Job Sources (2 hours)

**Goal:** Add USAJOBS, Greenhouse, Lever = 200+ total jobs.

### Step 5.1-5.3: Create Additional Aggregators

**Cursor Prompt:**

```
Create 3 additional aggregators:

1. lib/aggregators/usajobs.ts:
   - Export async function fetchUSAJobs()
   - Fetch from https://data.usajobs.gov/api/search?Keyword=Psychiatric%20Nurse%20Practitioner&ResultsPerPage=100
   - Parse SearchResult.MatchedObjectDescriptor
   - Return array of raw jobs

2. lib/aggregators/greenhouse.ts:
   - Export async function fetchGreenhouseJobs()
   - Fetch from 3 companies: talkiatry, talkspace, sondermind
   - URL: https://boards-api.greenhouse.io/v1/boards/{company}/jobs
   - Filter titles containing PMHNP/Psychiatric
   - Return combined array

3. lib/aggregators/lever.ts:
   - Export async function fetchLeverJobs()
   - Fetch from https://api.lever.co/v0/postings/headway
   - Filter postings with PMHNP/Psychiatric
   - Return array

All use fetch API, TypeScript, error handling.

DO NOT modify any other files.
```

### Step 5.4-5.5: Update Ingestion

**Cursor Prompt:**

```
Update these 2 files:

1. lib/ingestion-service.ts:
   - Import all aggregators
   - Add cases for 'usajobs', 'greenhouse', 'lever'
   - Keep same processing logic

2. app/api/ingest/route.ts:
   - If body.sources is empty: default to ['adzuna', 'usajobs', 'greenhouse', 'lever']

ONLY add new source handling.
```

### Step 5.6: Run Full Ingestion

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Authorization: Bearer random_secret_string_here" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**✅ CHECKPOINT:**

1. Prisma Studio → **200-500+ jobs!**
2. `/jobs` page → Real jobs from all sources
3. Search/filter → Works across all sources

**Commit:**
```bash
git add .
git commit -m "Slice 5 complete: Multiple sources with Prisma - 200+ jobs!"
```

---

## SLICE 6: Post Job Form (2 hours)

**Goal:** Employer form (payment in Part 3).

**Cursor Prompt:**

```
Create app/post-job/page.tsx:

A client component with job posting form using react-hook-form and zod.

Form fields:
1. Job title (required, min 10 chars)
2. Company name (required)
3. Company website (url, optional)
4. Contact email (email, required)
5. Location (required, e.g. "Remote, New York NY")
6. Work mode (radio: Remote, Hybrid, In-Person)
7. Job type (radio: Full-Time, Part-Time, Contract, Per Diem)
8. Salary range (min/max numbers, optional, OR "Competitive" checkbox)
9. Job description (textarea, required, min 200 chars)
10. How to apply URL (required)

Pricing section (radio):
- Standard Job - $99 (default)
- Featured Job - $199

On submit:
- Store form data in localStorage as 'jobFormData'
- Navigate to /post-job/checkout

Use Tailwind for styling.
Mobile responsive.

Import { useForm } from 'react-hook-form'
Import { zodResolver } from '@hookform/resolvers/zod'
Import { z } from 'zod'
Import { useRouter } from 'next/navigation'

Export as default.
DO NOT modify any other files.
```

**✅ CHECKPOINT:**

- Visit `/post-job`
- Fill form
- Submit
- Redirects to `/post-job/checkout` (404 OK)
- Check localStorage has data

**Commit:**
```bash
git add .
git commit -m "Slice 6 complete: Post job form with Prisma types"
```

---

## 🎉 Part 2 Complete!

**You've built:**
- ✅ View jobs with Prisma queries
- ✅ Job details page
- ✅ Search & filters (type-safe)
- ✅ Job aggregation from Adzuna
- ✅ Multiple job sources
- ✅ Post job form
- ✅ **200+ real jobs in database!**

**Continue to PART 3: Revenue Features** (Stripe payments, emails, polish)