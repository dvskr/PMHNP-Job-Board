# PMHNP Job Board - PART 3: Revenue Features
## Stripe Payments, Email System, Polish (Slices 7-9)

**Prerequisites:** Complete PART 2 (Core Features with 200+ jobs)

---

## 📖 What You'll Build in Part 3

- **Slice 7:** Stripe Payments (2 hours) - **Accept real money!**
- **Slice 8:** Email System (1.5 hours) - Welcome & confirmation emails
- **Slice 9:** Polish & Features (2 hours) - Saved jobs, stats, salary guide, edit

**Total Time:** ~5.5 hours

---

## SLICE 7: Stripe Payments (2 hours)

**Goal:** Accept real payments, create jobs in Prisma, send to database.

### Step 7.1: Setup Stripe

1. Go to **stripe.com** → Create account
2. Dashboard → **Developers** → **API Keys**
3. **Use TEST mode** (toggle in sidebar)
4. Copy to `.env`:
```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

### Step 7.2: Create Checkout Session API

**Cursor Prompt:**

```
Create app/api/create-checkout/route.ts:

Export async function POST(request: NextRequest)

1. Import Stripe from 'stripe'
2. Initialize Stripe: new Stripe(process.env.STRIPE_SECRET_KEY!)
3. Import { NextRequest, NextResponse } from 'next/server'

4. Parse request body (job form data from post-job page)

5. Validate required fields:
   - title, employer, location, mode, jobType, description, applyLink, contactEmail, pricing

6. Calculate price:
   - If pricing === 'standard': 9900 (cents = $99)
   - If pricing === 'featured': 19900 (cents = $199)

7. Create Stripe Checkout session:
   const session = await stripe.checkout.sessions.create({
     payment_method_types: ['card'],
     line_items: [{
       price_data: {
         currency: 'usd',
         product_data: {
           name: `Job Post: ${title}`,
           description: `${employer} - ${location}`
         },
         unit_amount: price
       },
       quantity: 1
     }],
     mode: 'payment',
     success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
     cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/post-job`,
     metadata: {
       // Store job data as JSON string
       jobData: JSON.stringify({
         title, employer, location, mode, jobType,
         description, applyLink, contactEmail,
         minSalary, maxSalary, salaryPeriod,
         companyWebsite, pricing
       })
     }
   })

8. Return NextResponse.json({ sessionId: session.id, url: session.url })

9. Error handling with try/catch

Use TypeScript.

DO NOT modify any other files.
```

### Step 7.3: Create Checkout Page

**Cursor Prompt:**

```
Create app/post-job/checkout/page.tsx:

A client component for payment confirmation.

On mount:
1. Read jobFormData from localStorage
2. If no data: redirect to /post-job using router.push

Display:
1. Job posting summary card:
   - Job title
   - Company
   - Location
   - Pricing tier ($99 or $199)
   - All form details

2. "Proceed to Payment" button:
   - On click:
     a. Set loading state
     b. POST to /api/create-checkout with jobFormData
     c. Get response { url }
     d. Redirect: window.location.href = url

Show loading spinner while creating session.
Show error if API call fails.

Styling:
- max-w-2xl mx-auto px-4 py-8
- Summary in white card with shadow
- Large blue payment button (w-full, py-3, font-semibold)
- "Back to edit" link to /post-job

Use TypeScript.
Import { useState, useEffect } from 'react'
Import { useRouter } from 'next/navigation'

Export as default.
DO NOT modify any other files.
```

### Step 7.4: Create Stripe Webhook Handler with Prisma

**Cursor Prompt:**

```
Create app/api/webhooks/stripe/route.ts:

This receives Stripe events when payment completes.

Export async function POST(request: NextRequest)

1. Import Stripe from 'stripe'
2. Import prisma from '@/lib/prisma'
3. Import { NextRequest, NextResponse } from 'next/server'
4. Import crypto from 'crypto'

5. Initialize Stripe with secret key

6. Get raw body for signature verification:
   const body = await request.text()
   const signature = request.headers.get('stripe-signature')!

7. Verify webhook signature:
   let event
   try {
     event = stripe.webhooks.constructEvent(
       body,
       signature,
       process.env.STRIPE_WEBHOOK_SECRET!
     )
   } catch (err) {
     return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
   }

8. Handle event type 'checkout.session.completed':
   const session = event.data.object
   const jobData = JSON.parse(session.metadata.jobData)
   
   // Generate unique edit token
   const editToken = crypto.randomBytes(32).toString('hex')
   
   // Calculate expiry date (30 days)
   const expiresAt = new Date()
   expiresAt.setDate(expiresAt.getDate() + 30)
   
   // Create job with Prisma
   const job = await prisma.job.create({
     data: {
       title: jobData.title,
       employer: jobData.employer,
       location: jobData.location,
       jobType: jobData.jobType,
       mode: jobData.mode,
       description: jobData.description,
       descriptionSummary: jobData.description.slice(0, 300),
       applyLink: jobData.applyLink,
       minSalary: jobData.minSalary ? parseInt(jobData.minSalary) : null,
       maxSalary: jobData.maxSalary ? parseInt(jobData.maxSalary) : null,
       salaryPeriod: jobData.salaryPeriod || null,
       isFeatured: jobData.pricing === 'featured',
       isPublished: true,
       sourceType: 'employer',
       expiresAt: expiresAt
     }
   })
   
   // Create employer job record
   await prisma.employerJob.create({
     data: {
       employerName: jobData.employer,
       contactEmail: jobData.contactEmail,
       companyWebsite: jobData.companyWebsite || null,
       jobId: job.id,
       editToken: editToken,
       paymentStatus: 'paid'
     }
   })
   
   // TODO: Send confirmation email (Slice 8)
   console.log('Job created:', job.id, 'Edit token:', editToken)

9. Return NextResponse.json({ received: true })

10. Error handling for Prisma operations

Use TypeScript.

DO NOT modify any other files.
```

### Step 7.5: Setup Stripe CLI for Local Testing

**New terminal tab:**

```bash
# Install Stripe CLI (Mac)
brew install stripe/stripe-cli/stripe

# Or download from: https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

**Copy the webhook signing secret** from output.

**Add to `.env`:**
```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Restart dev server** (original terminal):
```bash
# Press Ctrl+C
npm run dev
```

**Keep Stripe CLI running** in second terminal.

### Step 7.6: Create Success Page

**Cursor Prompt:**

```
Create app/success/page.tsx:

A client component for payment success.

On mount:
1. Get session_id from URL query params using useSearchParams
2. Clear jobFormData from localStorage

Display:
- Large CheckCircle icon from lucide-react (text-green-600, w-16 h-16)
- "Payment Successful!" heading (text-3xl font-bold text-gray-900)
- "Your job post will be live within 2 hours" message
- "We'll send you an email with an edit link" message
- "View All Jobs" button → /jobs (blue, large)

Styling:
- max-w-2xl mx-auto px-4 py-16
- Centered text (text-center)
- Celebratory colors (green for success)
- Mobile responsive

Use TypeScript.
Import { useEffect } from 'react'
Import { useSearchParams } from 'next/navigation'
Import { CheckCircle } from 'lucide-react'
Import Link from 'next/link'

Export as default.
DO NOT modify any other files.
```

**✅ CHECKPOINT - PAYMENT FLOW:**

**Test complete payment:**
1. Visit `http://localhost:3000/post-job`
2. Fill all required fields
3. Click "Continue to Payment"
4. Review on checkout page
5. Click "Proceed to Payment"
6. Stripe Checkout opens
7. Use test card: **4242 4242 4242 4242**
   - Expiry: 12/34
   - CVC: 123
   - ZIP: 12345
8. Click "Pay"
9. **Check Stripe CLI terminal** → webhook event received
10. **Prisma Studio:** `npx prisma studio` → jobs table → **NEW JOB!**
11. Check employer_jobs table → **edit token exists!**
12. Success page displays
13. Visit `/jobs` → **See your posted job!**

**This is HUGE! You can now accept real money!** 💰

**Commit:**
```bash
git add .
git commit -m "Slice 7 complete: Stripe payments with Prisma - can charge!"
```

**If errors:**
- Webhook fails → Check STRIPE_WEBHOOK_SECRET in .env
- Stripe CLI not receiving → Restart: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- Job not created → Check webhook handler console logs
- Prisma error → Check field names match schema

---

## SLICE 8: Email System (1.5 hours)

**Goal:** Welcome emails + confirmation emails with Resend.

### Step 8.1: Setup Resend

1. Go to **resend.com** → Sign up
2. Get API key
3. Add to `.env`:
```bash
RESEND_API_KEY=re_...
```
4. Use `onboarding@resend.dev` as sender (or verify your domain)

### Step 8.2: Create Email Service

**Cursor Prompt:**

```
Create lib/email-service.ts:

Import { Resend } from 'resend'

Initialize: const resend = new Resend(process.env.RESEND_API_KEY)

Export these functions:

1. async sendWelcomeEmail(email: string)
   Send to: email
   From: 'PMHNP Jobs <onboarding@resend.dev>'
   Subject: 'Welcome to PMHNP Jobs!'
   HTML body:
     - <h1>Welcome to PMHNP Jobs!</h1>
     - <p>Thanks for subscribing to job alerts.</p>
     - <p>We have 200+ psychiatric nurse practitioner jobs updated daily.</p>
     - <a href="${BASE_URL}/jobs" style="...button styles">Browse Jobs</a>
   
   Use await resend.emails.send({ from, to, subject, html })
   
2. async sendConfirmationEmail(
     employerEmail: string,
     jobTitle: string,
     jobId: string,
     editToken: string
   )
   Send to: employerEmail
   From: 'PMHNP Jobs <onboarding@resend.dev>'
   Subject: 'Your PMHNP job post is live!'
   HTML body:
     - <h1>Your job post is now live!</h1>
     - <p><strong>${jobTitle}</strong></p>
     - <p>Your listing will remain active for 30 days.</p>
     - <p><a href="${BASE_URL}/jobs/edit/${editToken}">Edit your job post</a></p>
     - <p><a href="${BASE_URL}/jobs/${slugify(jobTitle, jobId)}">View your job</a></p>
     - <p>Need help? Reply to this email.</p>
   
   Use resend.emails.send()

Both functions:
- Include try/catch
- Log success and errors
- Return { success: boolean, error?: string }

Use TypeScript.
Import slugify from '@/lib/utils'

DO NOT modify any other files.
```

### Step 8.3: Create Subscribe API with Prisma

**Cursor Prompt:**

```
Create app/api/subscribe/route.ts:

Export async function POST(request: NextRequest)

1. Import prisma from '@/lib/prisma'
2. Import sendWelcomeEmail from '@/lib/email-service'
3. Import { NextRequest, NextResponse } from 'next/server'

4. Parse body: { email: string, source?: string }

5. Validate email (basic regex: /\S+@\S+\.\S+/)

6. Try to insert with Prisma:
   try {
     await prisma.emailLead.create({
       data: {
         email: email.toLowerCase(),
         source: source || 'unknown'
       }
     })
     
     // Send welcome email
     await sendWelcomeEmail(email)
     
     return NextResponse.json({ 
       success: true, 
       message: 'Subscribed successfully!' 
     })
   } catch (error) {
     // If duplicate (unique constraint error)
     if (error.code === 'P2002') {
       return NextResponse.json({ 
         success: true, 
         message: "You're already subscribed!" 
       })
     }
     throw error
   }

7. Error handling for other errors

Use TypeScript.

DO NOT modify any other files.
```

### Step 8.4: Create Email Signup Form

**Cursor Prompt:**

```
Create components/EmailSignupForm.tsx:

A client component for email signups.

Props:
- source: string
- placeholder?: string (default: 'Enter your email')

State:
- email: string
- loading: boolean
- status: 'idle' | 'success' | 'error'
- message: string

On submit:
1. Set loading = true
2. POST to /api/subscribe with { email, source }
3. If success: 
   - Set status = 'success'
   - Show green success message with Check icon
   - Clear input after 3 seconds
4. If error:
   - Set status = 'error'
   - Show red error message

UI:
- Form with flex (flex-col sm:flex-row gap-2)
- Email input (flex-1, px-4 py-2, border rounded)
- Submit button ("Subscribe" or loading spinner)
- Success/error message below form

Styling:
- Clean, minimal
- Blue submit button (bg-blue-600 hover:bg-blue-700)
- Mobile: Stack vertically
- Desktop: Inline

Use TypeScript.
Import { useState, FormEvent } from 'react'
Import { Mail, Check, AlertCircle } from 'lucide-react'

Export as default.
DO NOT modify any other files.
```

### Step 8.5: Add Email Signups to Pages

**Cursor Prompt 1:**

```
Update app/page.tsx (homepage):

Add email signup section before footer:

<section className="bg-blue-50 py-16 px-4">
  <div className="max-w-3xl mx-auto text-center">
    <h2 className="text-3xl font-bold text-gray-900 mb-4">
      Get PMHNP Job Alerts
    </h2>
    <p className="text-gray-600 mb-8">
      New psychiatric nurse practitioner jobs delivered weekly
    </p>
    <EmailSignupForm source="homepage" />
  </div>
</section>

Import EmailSignupForm from '@/components/EmailSignupForm'

If app/page.tsx doesn't exist, create it with this section.

ONLY add signup section.
```

**Cursor Prompt 2:**

```
Update components/Footer.tsx:

At the top of footer content, add:

<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
  <div className="max-w-md">
    <h3 className="text-lg font-semibold text-gray-900 mb-4">
      Stay Updated
    </h3>
    <EmailSignupForm 
      source="footer" 
      placeholder="Your email address"
    />
  </div>
</div>

Import EmailSignupForm

ONLY add signup form.
DO NOT change existing footer columns.
```

### Step 8.6: Update Stripe Webhook to Send Email

**Cursor Prompt:**

```
Update app/api/webhooks/stripe/route.ts:

After creating job and employerJob records with Prisma:

1. Import sendConfirmationEmail from '@/lib/email-service'

2. Get data needed:
   - jobTitle (already have from jobData)
   - jobId (from created job: job.id)
   - editToken (already generated)
   - contactEmail (from jobData)

3. Send email (wrap in try/catch so it doesn't break webhook):
   try {
     await sendConfirmationEmail(
       jobData.contactEmail,
       jobData.title,
       job.id,
       editToken
     )
   } catch (emailError) {
     console.error('Failed to send email:', emailError)
     // Don't throw - job already created
   }

ONLY add email sending.
DO NOT change payment/job creation logic.
```

**✅ CHECKPOINT:**

**Test email signup:**
1. Visit homepage
2. Enter your email in signup form
3. Click subscribe
4. Should see success message
5. Prisma Studio → email_leads table → email appears
6. Check inbox → welcome email (or Resend dashboard)

**Test payment confirmation:**
1. Post a new test job
2. Complete Stripe payment
3. Check email → confirmation with edit link!

**Emails working!** 📧

**Commit:**
```bash
git add .
git commit -m "Slice 8 complete: Email system with Prisma"
```

**If errors:**
- Emails not sending → Check RESEND_API_KEY in .env
- Emails not arriving → Check spam, or Resend dashboard logs
- Prisma error in subscribe → Check emailLead schema

---

## SLICE 9: Polish & Features (2 hours)

**Goal:** Saved jobs, stats, salary guide, edit functionality.

### Step 9.1: Saved Jobs Feature

**Cursor Prompt:**

```
Create 3 files for saved jobs:

1. components/SaveJobButton.tsx:
   - Client component
   - Props: jobId: string
   - State: isSaved (read from localStorage 'savedJobs' array)
   - On click: toggle save/unsave, update localStorage
   - UI: Bookmark icon (lucide-react), "Save" or "Saved" text
   - Styling: Button with hover effect

2. Update app/jobs/[slug]/page.tsx:
   - Import SaveJobButton
   - Add below Apply button: <SaveJobButton jobId={job.id} />
   - ONLY add button, don't change other content

3. app/saved/page.tsx:
   - Client component
   - On mount: read savedJobs from localStorage
   - If has IDs: fetch jobs with Prisma query (can use API endpoint)
   - Display with JobCard component in grid
   - "Clear all" button (removes localStorage, updates display)
   - Empty state if no saved jobs

Use TypeScript.
Import necessary components.

DO NOT modify any other files.
```

### Step 9.2: Social Proof Stats with Prisma

**Cursor Prompt:**

```
Create stats feature:

1. app/api/stats/route.ts:
   - Export async function GET()
   - Query with Prisma:
     const [totalJobs, totalSubscribers, totalCompanies] = await Promise.all([
       prisma.job.count({ where: { isPublished: true } }),
       prisma.emailLead.count(),
       prisma.job.groupBy({
         by: ['employer'],
         where: { isPublished: true }
       }).then(groups => groups.length)
     ])
   - Return NextResponse.json({ totalJobs, totalSubscribers, totalCompanies })

2. Update app/page.tsx (homepage):
   - Add stats section below hero
   - Client component behavior to fetch /api/stats
   - Display 3 columns:
     - totalJobs - "Active Jobs"
     - totalSubscribers - "PMHNPs Subscribed"  
     - totalCompanies - "Companies Hiring"
   - Show loading skeleton while fetching
   - Format numbers with commas
   - Styling: Large numbers (text-4xl font-bold text-blue-600)

Use TypeScript.

ONLY add stats section to homepage.
```

### Step 9.3: Salary Guide Page with Prisma

**Cursor Prompt:**

```
Create app/salary-guide/page.tsx:

A client component showing salary data.

On mount:
1. Fetch jobs with salary data using Prisma API:
   - Can create endpoint: app/api/salary-stats/route.ts
   - Or fetch all jobs client-side and calculate

2. Calculate:
   - Average overall salary
   - Average by state (top 10)
   - Average Remote vs In-Person vs Hybrid
   - Top 5 highest paying employers

3. Display in clean tables:
   - "Average PMHNP Salary by State" (table with state, avg salary, job count)
   - "Remote vs In-Person" comparison (table)
   - "Top Paying Employers" (table with employer, salary range, location)

4. Add EmailSignupForm at bottom with source="salary_guide"

Export async function generateMetadata():
- title: "PMHNP Salary Guide 2024 | Average Pay by State"
- description: "Comprehensive salary data for psychiatric nurse practitioners."

Styling:
- max-w-6xl mx-auto px-4 py-8
- Tables with Tailwind (border, stripe rows)
- Mobile responsive (tables scroll horizontally)

Use TypeScript.

DO NOT modify any other files.
```

### Step 9.4: Edit Job Functionality with Prisma

**Cursor Prompt:**

```
Create edit job feature:

1. app/jobs/edit/[token]/page.tsx:
   - Client component
   - On mount: verify token with Prisma
     - Fetch from: app/api/jobs/edit/[token]/route.ts (create this)
   - If invalid: show error
   - If valid: show form pre-filled with job data
   - Same fields as post-job form
   - "Update Job" button
   - "Unpublish Job" button (red, with confirm dialog)

2. app/api/jobs/edit/[token]/route.ts:
   - Export async function GET(request, { params })
   - Query with Prisma:
     const employerJob = await prisma.employerJob.findUnique({
       where: { editToken: params.token },
       include: { job: true }
     })
   - If not found: 401
   - If found: return job data

3. app/api/jobs/update/route.ts:
   - Export async function POST(request)
   - Parse body: { token, jobData }
   - Verify token in employerJob
   - Update job with Prisma:
     await prisma.job.update({
       where: { id: employerJob.jobId },
       data: {
         title: jobData.title,
         // ... other fields
         updatedAt: new Date()
       }
     })
   - Return success

Use react-hook-form for edit form.
Use TypeScript with Prisma types.

DO NOT modify any other files.
```

**✅ CHECKPOINT:**

**Test all features:**
- [ ] Homepage shows real stats (jobs, subscribers, companies)
- [ ] Save a job → visit /saved → see saved jobs
- [ ] Visit /salary-guide → see salary tables with real data
- [ ] Post job → get confirmation email → click edit link → form pre-fills
- [ ] Update job → changes save in Prisma
- [ ] All features work on mobile

**Commit:**
```bash
git add .
git commit -m "Slice 9 complete: Polish features with Prisma"
```

---

## 🎉 Part 3 Complete!

**You've built:**
- ✅ Stripe payment processing (real revenue!)
- ✅ Email system with Resend
- ✅ Saved jobs (localStorage)
- ✅ Social proof stats (live from Prisma)
- ✅ Salary guide page
- ✅ Edit job functionality
- ✅ **Can accept payments and grow email list!**

**Revenue model working:**
- Standard posts: $99
- Featured posts: $199
- Email list growing
- Jobs stored in Prisma with type safety

**Continue to PART 4: Deploy & Launch** (Production deployment, SEO, launch strategy)