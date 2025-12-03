# PMHNP Job Board - PART 4: Deploy & Launch
## Production Deployment, SEO, Launch Strategy (Slices 10-12)

**Prerequisites:** Complete PART 3 (Revenue Features with Stripe & Email)

---

## 📖 What You'll Build in Part 4

- **Slice 10:** Production Deployment (1 hour) - **Live on internet!**
- **Slice 11:** SEO Setup (30 minutes) - Google can find you
- **Slice 12:** Launch Strategy (2 hours) - First users & revenue

**Total Time:** ~3.5 hours

---

## SLICE 10: Deploy to Production (1 hour)

**Goal:** Site live on the internet with Vercel.

### Step 10.1: Add SEO Metadata

**Cursor Prompt:**

```
Update app/layout.tsx metadata:

Enhance the metadata export with comprehensive SEO:

export const metadata: Metadata = {
  title: 'PMHNP Jobs - Find Remote & Local Psychiatric Nurse Practitioner Jobs',
  description: 'The #1 job board for psychiatric mental health nurse practitioners. 200+ remote and in-person PMHNP jobs updated daily. Free job alerts.',
  keywords: ['PMHNP jobs', 'psychiatric nurse practitioner', 'mental health jobs', 'telepsychiatry', 'remote nursing'],
  openGraph: {
    title: 'PMHNP Jobs - Find Remote & Local Psychiatric NP Jobs',
    description: 'The #1 job board for psychiatric mental health nurse practitioners. 200+ jobs updated daily.',
    type: 'website',
    url: process.env.NEXT_PUBLIC_BASE_URL,
    siteName: 'PMHNP Jobs',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PMHNP Jobs - Find Remote & Local Psychiatric NP Jobs',
    description: '200+ PMHNP jobs updated daily. Free job alerts.',
  },
  robots: {
    index: true,
    follow: true,
  }
}

ONLY update metadata export.
DO NOT change layout structure.
```

### Step 10.2: Create Sitemap

**Cursor Prompt:**

```
Create app/sitemap.ts:

Import prisma from '@/lib/prisma'
Import { slugify } from '@/lib/utils'

Export default async function sitemap() {
  
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  
  // Static pages
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1.0,
    },
    {
      url: `${baseUrl}/jobs`,
      lastModified: new Date(),
      changeFrequency: 'hourly' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/post-job`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/salary-guide`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
  ]
  
  // Dynamic job pages
  const jobs = await prisma.job.findMany({
    where: { isPublished: true },
    select: { id: true, title: true, updatedAt: true },
    take: 1000, // Limit to prevent huge sitemaps
  })
  
  const jobPages = jobs.map((job) => ({
    url: `${baseUrl}/jobs/${slugify(job.title, job.id)}`,
    lastModified: job.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))
  
  return [...staticPages, ...jobPages]
}

Use TypeScript.
Export as default.

DO NOT modify any other files.
```

### Step 10.3: Create robots.txt

**Cursor Prompt:**

```
Create app/robots.ts:

Export default function robots() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/jobs/edit/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}

Use TypeScript.
Export as default.

DO NOT modify any other files.
```

### Step 10.4: Test Production Build

**Test locally:**

```bash
# Build for production
npm run build
```

**Should complete with 0 errors.**

**If errors:**
- TypeScript errors → Fix type mismatches
- Missing modules → `npm install`
- Prisma errors → `npx prisma generate`
- Environment variables → Check .env has all required vars

**Test production locally:**

```bash
npm start
```

Visit `http://localhost:3000` and test all features.

**✅ Pre-Deploy Checklist:**
- [ ] `npm run build` succeeds
- [ ] Homepage loads
- [ ] Jobs page shows jobs
- [ ] Search works
- [ ] Job details work
- [ ] Post job form loads
- [ ] No console errors

### Step 10.5: Prepare for Deployment

**Update `.env` for production:**

```bash
# You'll add these to Vercel, but prepare now

# Database - keep same DATABASE_URL (Supabase)
DATABASE_URL="your-supabase-connection-string"

# Stripe - SWITCH TO LIVE MODE (or keep test for now)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_... # or keep pk_test_
STRIPE_SECRET_KEY=sk_live_... # or keep sk_test_
STRIPE_WEBHOOK_SECRET= # Will get NEW secret from Stripe after deploy

# Resend - same key works in production
RESEND_API_KEY=re_...

# Adzuna - same keys
ADZUNA_APP_ID=...
ADZUNA_APP_KEY=...

# Cron - keep same or generate new
CRON_SECRET=your_secret_here

# Base URL - will be your Vercel URL
NEXT_PUBLIC_BASE_URL=https://your-site.vercel.app
```

### Step 10.6: Push to GitHub

```bash
# Make sure everything is committed
git add .
git commit -m "Ready for production deployment"

# Set main branch
git branch -M main

# Create GitHub repo (if using GitHub CLI)
gh repo create pmhnp-job-board --public --source=. --push

# Or manually:
# 1. Create repo on github.com
# 2. git remote add origin https://github.com/yourusername/pmhnp-job-board.git
# 3. git push -u origin main
```

### Step 10.7: Deploy to Vercel

**Step-by-step:**

1. Go to **vercel.com** → **New Project**

2. **Import Git Repository**
   - Connect GitHub
   - Select `pmhnp-job-board` repo

3. **Configure Project**
   - Framework Preset: **Next.js** (auto-detected)
   - Root Directory: `./` (default)
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)

4. **Environment Variables** (Click "Add")
   
   Add ALL variables from your `.env`:
   ```
   DATABASE_URL=postgresql://...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_... (update later)
   RESEND_API_KEY=re_...
   ADZUNA_APP_ID=...
   ADZUNA_APP_KEY=...
   CRON_SECRET=...
   NEXT_PUBLIC_BASE_URL=https://your-site.vercel.app
   ```
   
   **Note:** NEXT_PUBLIC_BASE_URL will be your actual Vercel URL (wait for deployment to get it)

5. **Click Deploy**

6. **Wait 2-3 minutes...**

**🎉 YOUR SITE IS LIVE!**

Vercel gives you a URL like: `https://pmhnp-job-board.vercel.app`

### Step 10.8: Update Base URL

1. Copy your Vercel URL
2. Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
3. Find `NEXT_PUBLIC_BASE_URL`
4. Click **Edit** → Update to your Vercel URL
5. **Redeploy:** Deployments → ⋯ → **Redeploy**

### Step 10.9: Setup Production Stripe Webhook

**Create webhook endpoint:**

1. **Stripe Dashboard** → **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Endpoint URL: `https://your-site.vercel.app/api/webhooks/stripe`
4. **Select events to listen to:** `checkout.session.completed`
5. Click **Add endpoint**
6. **Copy the Signing secret** (starts with `whsec_`)

**Update Vercel:**

1. Vercel → Your Project → **Settings** → **Environment Variables**
2. Find `STRIPE_WEBHOOK_SECRET`
3. Click **Edit** → Paste new production secret
4. **Redeploy**

**Test payment flow:**

1. Visit your production site
2. Post a test job
3. Use test card (even in production, Stripe test mode works)
4. Complete payment
5. Check Prisma Studio → job should appear!

### Step 10.10: Setup Cron Job for Job Ingestion

**Create `vercel.json` in project root:**

```json
{
  "crons": [
    {
      "path": "/api/ingest",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

This runs every 6 hours: 12am, 6am, 12pm, 6pm UTC.

**Push to GitHub:**

```bash
git add vercel.json
git commit -m "Add cron job for job ingestion"
git push
```

Vercel auto-deploys. Cron will be active.

### Step 10.11: Initial Production Job Ingestion

**Run manually to populate jobs:**

```bash
curl -X POST https://your-site.vercel.app/api/ingest \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Wait 2-3 minutes. Check your site → should have 200+ jobs!

**✅ CHECKPOINT - SITE IS LIVE:**

Visit your production URL:
- [ ] Homepage loads with stats
- [ ] Jobs page shows 200+ jobs
- [ ] Search works
- [ ] Filters work
- [ ] Job details load
- [ ] Email signup works (check you receive email)
- [ ] Post job form loads
- [ ] Can complete test payment
- [ ] Mobile responsive
- [ ] No console errors

**YOUR JOB BOARD IS LIVE ON THE INTERNET!** 🚀🎉

**Commit:**
```bash
git add .
git commit -m "Deployed to production with cron!"
git push
```

**If errors:**
- **Build fails:** Check Vercel build logs, fix TypeScript errors
- **Database connection fails:** Check DATABASE_URL is correct
- **Prisma error:** Add Prisma postinstall script to package.json: `"postinstall": "prisma generate"`
- **Env vars missing:** Double-check all vars in Vercel settings

---

## SLICE 11: SEO Setup (30 minutes)

**Goal:** Optimize for Google search.

### Step 11.1: Verify Sitemap & Robots

Visit:
- `https://your-site.vercel.app/sitemap.xml`
- `https://your-site.vercel.app/robots.txt`

Should load correctly.

### Step 11.2: Submit to Google Search Console

1. Go to **search.google.com/search-console**
2. Click **Add Property**
3. Enter your URL: `https://your-site.vercel.app`
4. **Verify ownership:**
   - Choose "HTML tag" method
   - Copy meta tag
   - Add to app/layout.tsx in <head> (via metadata)
   - Redeploy
   - Click "Verify"

5. **Submit sitemap:**
   - Left sidebar → **Sitemaps**
   - Enter: `sitemap.xml`
   - Click **Submit**

**Google will now index your site!** (Takes 1-3 days)

### Step 11.3: Add Schema Markup for Jobs

**Cursor Prompt:**

```
Update app/jobs/[slug]/page.tsx to add JSON-LD schema:

After the job display content, add a script tag with JobPosting schema:

<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: job.title,
      description: job.description,
      datePosted: job.createdAt,
      validThrough: job.expiresAt,
      employmentType: job.jobType,
      hiringOrganization: {
        '@type': 'Organization',
        name: job.employer,
      },
      jobLocation: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: job.location,
        },
      },
      baseSalary: job.minSalary ? {
        '@type': 'MonetaryAmount',
        currency: 'USD',
        value: {
          '@type': 'QuantitativeValue',
          minValue: job.minSalary,
          maxValue: job.maxSalary,
          unitText: job.salaryPeriod === 'annual' ? 'YEAR' : 'HOUR',
        },
      } : undefined,
    }),
  }}
/>

This helps Google show rich job results in search.

ONLY add schema script.
DO NOT change other page content.
```

**Commit and deploy:**
```bash
git add .
git commit -m "Add SEO improvements: schema markup"
git push
```

---

## SLICE 12: Launch & Get First Users (2 hours)

**Goal:** First real users, signups, paid posts.

### Step 12.1: Pre-Launch Quality Check (15 minutes)

**Final testing:**
- [ ] All links work (no 404s)
- [ ] Forms work (job post, email signup)
- [ ] Payment flow complete
- [ ] Emails send successfully
- [ ] Mobile experience smooth
- [ ] Page load speed good (test with Google PageSpeed)
- [ ] 200+ jobs visible

**Polish:**
- [ ] Typos fixed
- [ ] Images optimized (if any)
- [ ] Error messages user-friendly
- [ ] Success messages clear

### Step 12.2: Employer Outreach (1 hour)

**Email 10-20 telepsychiatry companies:**

**Subject:** Free featured PMHNP job listing - PMHNPJobs.com launch

**Body:**
```
Hi [Company/Hiring Manager],

I just launched PMHNPJobs.com - a specialized job board for psychiatric nurse practitioners.

To help build our initial listings, I'd like to offer [Company] 3 free featured job postings (normally $199 each) in exchange for your feedback on the platform.

We currently have:
- 200+ active PMHNP jobs from multiple sources
- Growing email list of qualified PMHNPs
- Specialized filters (remote, salary range, location)
- Mobile-optimized search

If you're hiring PMHNPs, I'd love to feature your positions. Just reply with job details and I'll get them posted within 24 hours.

Thanks,
[Your name]
PMHNPJobs.com
[Your email]
```

**Companies to contact:**
- Talkiatry (careers@talkiatry.com)
- Talkspace (careers@talkspace.com)
- SonderMind (hiring@sondermind.com)
- Headway (careers@headway.co)
- Mindpath Health
- LifeStance Health
- Geode Health
- Array Behavioral Care
- Path Mental Health
- Aligned Telehealth
- Brightside Health
- Bicycle Health
- Grow Therapy
- Two Chairs
- Charlie Health
- Spring Health
- Modern Health
- Lyra Health
- Ginger
- AbleTo

**Goal:** Get 2-3 companies to post + testimonials.

### Step 12.3: Social Media Launch (30 minutes)

**Facebook Groups:**

Search: "PMHNP", "Psychiatric Nurse Practitioner", "APRN", "Mental Health Nursing"

Join 5-10 groups, then post:

```
🎉 Just launched PMHNPJobs.com - the first job board specifically for psychiatric nurse practitioners!

✅ 200+ remote & in-person PMHNP jobs
✅ Daily updates from top telepsych companies
✅ Salary transparency for all listings
✅ Free weekly job email alerts
✅ Mobile-optimized search

Been searching for your next PMHNP role? Check it out!

https://your-site.vercel.app

(I'm a [your background] who built this because I saw how scattered PMHNP job postings are across the internet. Would love feedback from the community!)
```

**LinkedIn Post:**

```
After seeing how difficult it is for PMHNPs to find quality job listings in one place, I built something to solve it.

PMHNPJobs.com is now live with 200+ positions from:
- Telepsychiatry companies (Talkiatry, Headway, SonderMind, etc.)
- Federal agencies (VA, IHS, USAJOBS)
- Traditional psychiatric practices
- Plus direct employer postings

Key features:
• Daily job updates from multiple sources
• Real salary ranges (no "competitive" BS)
• Remote/hybrid/in-person filters
• Free weekly job alerts via email
• Mobile-optimized experience

For my PMHNP colleagues: What other features would make your job search easier? Drop your thoughts in the comments!

https://your-site.vercel.app

#PMHNP #NursePractitioner #PsychiatricNursing #MentalHealth #Healthcare #Telepsychiatry #JobSearch
```

**Reddit Posts:**

Post in r/nursing and r/nursepractitioner:

```
[Website] I built a job board specifically for PMHNPs

After struggling to find a centralized place for psychiatric NP jobs (scattered across Indeed, hospital sites, random boards), I built PMHNPJobs.com.

It aggregates PMHNP positions from multiple sources:
- Telepsychiatry companies (Talkiatry, Headway, SonderMind, etc.)
- Federal jobs (VA, IHS, USAJOBS)
- Traditional practices
- Plus employers can post directly ($99-199)

Currently 200+ active listings with daily automated updates. Completely free for job seekers - I make money from employer postings.

Built with Next.js, Prisma, and deployed on Vercel. Happy to answer tech questions too.

Would love feedback from the NP community! What features would make it more useful?

Link: https://your-site.vercel.app
```

**Twitter/X:**

```
🚀 Just launched PMHNPJobs.com

The first specialized job board for psychiatric nurse practitioners.

✅ 200+ jobs
✅ Daily updates
✅ Salary transparency
✅ Free alerts

Built in 3 days with @vercel @nextjs @prisma

Check it out: [your-site.vercel.app]

#buildinpublic #PMHNP #telepsychiatry
```

### Step 12.4: Monitor & Respond (24-48 hours)

**Tools to set up:**

1. **Vercel Analytics** (free)
   - Vercel Dashboard → Your Project → **Analytics**
   - View traffic, page views, user behavior

2. **Google Analytics** (optional, free)
   - Create GA4 property
   - Add tracking code to app/layout.tsx
   - Track conversions (email signups, job posts)

3. **Prisma Studio** (development only)
   - Run `npx prisma studio` locally
   - Connect to production database to check:
     - New jobs added by cron
     - Email signups
     - Employer job posts

**Daily checklist (first week):**
- [ ] Check Vercel logs for errors
- [ ] Respond to ALL comments on social posts
- [ ] Check email for employer inquiries
- [ ] Monitor Stripe dashboard for payments
- [ ] Fix any critical bugs within 24 hours
- [ ] Check Prisma Studio: email_leads count growing?

**First 24 hours goals:**
- [ ] Site stable (no 500 errors)
- [ ] 10+ email signups
- [ ] 100+ unique visitors
- [ ] 2-5 employer inquiries
- [ ] Answer all questions/comments

### Step 12.5: First Week Strategy

**Day 1-2: Launch & Monitor**
- Post on social media (done above)
- Email employers (done above)
- Fix any critical bugs immediately
- Respond to all feedback

**Day 3-4: Iteration**
- Implement 1-2 most requested features
- Fix reported issues
- Post "Week 1 update" on social media
- Share stats: "X jobs added, X signups"

**Day 5-7: Outreach Round 2**
- Email 20 more employers
- Post in more Facebook groups
- Share on relevant Slack/Discord communities
- Consider Reddit ads ($5/day test)

**✅ Week 1 Success Metrics:**

**Must-have:**
- [ ] Site online and stable (99%+ uptime)
- [ ] 50-200 email signups
- [ ] 500-2,000 unique visitors
- [ ] 5-10 employer inquiries

**Stretch goals:**
- [ ] 1-5 paid job posts ($99-$495 revenue)
- [ ] Mentioned in PMHNP Facebook groups
- [ ] Testimonial from 1-2 employers
- [ ] Google starts indexing pages

---

## 🎉 YOU DID IT! You're a Founder Now!

**What you built:**
- ✅ Full-stack job board (Next.js + Prisma)
- ✅ 200+ real jobs (automated with cron)
- ✅ Payment processing ($99-$199 per post)
- ✅ Email system (Resend)
- ✅ Type-safe database (Prisma ORM)
- ✅ Live on internet (Vercel)
- ✅ Mobile responsive
- ✅ SEO optimized
- ✅ Revenue-generating from day 1

**Business metrics:**
- Total build time: 16-20 hours
- Initial investment: $0 (free tiers)
- Revenue potential: $99-$199 per job post
- Owned asset: Email list
- Scalable: Automated job aggregation

---

## 📈 Scaling Path

### Month 1: Foundation ($500-1,500 revenue)
- Get 5-15 paid job posts
- Grow email list to 300-1,000
- Fix bugs, iterate on feedback
- Add 2-3 requested features
- Build employer testimonials page

### Month 2: Growth ($1,500-3,000 revenue)
- Add featured employers section
- Start SEO content (blog: "PMHNP salary guide by state")
- Improve email digest (weekly job roundup)
- Consider Google Ads ($100/month test)
- Reach out to PMHNP schools/programs

### Month 3: Scale ($3,000-5,000 revenue)
- Add premium packages ($299/month unlimited posts)
- Build basic employer dashboard
- Add job alerts (personalized by location/remote pref)
- Partner with 2-3 PMHNP schools
- Consider other nursing specialties (FNP, CRNA)

### Month 6: Exit or Expand ($5,000-10,000 revenue)
**Option A - Sell:**
- 12-24x monthly revenue
- At $5k/month = $60k-120k sale price
- Target: Job board aggregators, recruitment agencies

**Option B - Expand:**
- Add user accounts with profiles
- Add resume database
- Scale to all NP specialties
- Build mobile app
- Add video job postings

---

## 🔧 Troubleshooting Reference

### Vercel Deployment Issues

**Build fails:**
```bash
# Locally test build
npm run build

# Check logs
# Fix TypeScript errors shown
# Fix import paths
# Ensure all env vars present
```

**Prisma errors on Vercel:**

Add to `package.json`:
```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

**Database connection fails:**
- Check DATABASE_URL in Vercel env vars
- Ensure Supabase allows connections from Vercel IPs (should be allowed by default)
- Test connection locally with same URL

### Production Issues

**Jobs not showing:**
- Run manual ingestion: `curl -X POST https://your-site.vercel.app/api/ingest ...`
- Check Prisma Studio: are jobs in database?
- Check `isPublished = true`
- Check API response: `/api/jobs`

**Stripe webhook not firing:**
- Check webhook endpoint in Stripe Dashboard
- Verify `STRIPE_WEBHOOK_SECRET` matches
- Check Vercel function logs
- Test with Stripe CLI: `stripe listen --forward-to https://your-site.vercel.app/api/webhooks/stripe`

**Emails not sending:**
- Check `RESEND_API_KEY` in Vercel
- Check Resend dashboard logs
- Verify "from" email is `onboarding@resend.dev` or verified domain
- Check spam folder

**Cron job not running:**
- Check `vercel.json` is committed
- Verify cron path matches API route
- Check Vercel Dashboard → Settings → Cron Jobs
- Test manually with curl

### Performance Issues

**Slow page loads:**
- Enable Vercel Edge Caching
- Add database indexes (already have them)
- Implement job listing pagination
- Optimize images (use next/image)
- Consider Redis for stats caching

**Database queries slow:**
- Check Prisma Studio → Slow queries
- Add indexes to frequently queried fields
- Use Prisma query batching
- Consider Supabase connection pooling

---

## 💪 Final Reminders

**You built a REAL BUSINESS that:**
- Solves a real problem (PMHNP job search is scattered)
- Has paying customers (employers post jobs)
- Has a moat (owned email list)
- Can scale (automated job aggregation)
- Can be sold (12-24x monthly revenue)

**Success principles:**
1. **Ship > Perfect** - Done is better than perfect
2. **Listen to users** - They tell you what to build next
3. **Fix bugs fast** - Broken user experience kills growth
4. **Grow email list** - This is your owned asset
5. **Track metrics** - You can't improve what you don't measure

**Path forward:**
- Week 1: Stabilize, respond, iterate
- Month 1: Grow to $1k-2k revenue
- Month 3: Scale to $5k revenue
- Month 6: Exit or expand

**You've got this!** 🚀💰

---

## 📚 Resources

**Prisma:**
- Docs: prisma.io/docs
- Studio: `npx prisma studio`
- Migrations: Not needed with `db push` for MVP

**Vercel:**
- Dashboard: vercel.com
- Docs: vercel.com/docs
- Logs: Project → Logs tab

**Stripe:**
- Dashboard: dashboard.stripe.com
- Docs: stripe.com/docs
- Test cards: 4242 4242 4242 4242

**Resend:**
- Dashboard: resend.com
- Docs: resend.com/docs
- Logs: Check dashboard

**Next.js:**
- Docs: nextjs.org/docs
- App Router: nextjs.org/docs/app

---

## 🎯 What's Next?

**You have a complete, working, revenue-generating job board!**

**Immediate next steps (choose 1-2):**
1. Get first 3 paid employer posts
2. Grow email list to 100+ subscribers
3. Fix any reported bugs
4. Add most requested feature
5. Write first blog post for SEO

**Long-term (Month 2-3):**
1. Scale to $5k/month
2. Add more job sources
3. Build employer dashboard
4. Consider other specialties

**Remember:** Every successful founder started where you are now. The difference is they kept shipping.

**Keep going!** 🚀💪

---

**END OF GUIDE - GO BUILD YOUR BUSINESS! 🎉**