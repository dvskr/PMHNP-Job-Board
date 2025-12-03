# PMHNP Job Board - Product Requirements

## Product Goal
A specialized job board for Psychiatric Mental Health Nurse Practitioners that aggregates jobs from multiple sources and allows employers to post paid listings.

## Core Value Proposition
- **For PMHNPs:** Find remote & local psych NP jobs with salary transparency
- **For Employers:** Access targeted audience of qualified candidates
- **For Us:** Build owned email list, generate revenue from job posts

## Technical Architecture

### Database (Supabase PostgreSQL)
- jobs: All job listings (external + employer-posted)
- email_leads: Email subscribers
- employer_jobs: Paid job posts with edit tokens
- site_stats: Social proof counters

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
- Database: Supabase (PostgreSQL)
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