# Environment Variables Setup Guide

This guide explains all the environment variables needed for the PMHNP Job Board application.

## Required Variables

Create a `.env.local` file in the root of your project with the following variables:

### 1. Database Connection (Supabase/PostgreSQL)

```bash
DATABASE_URL="postgresql://user:password@host:6543/database?pgbouncer=true"
DIRECT_URL="postgresql://user:password@host:5432/database"
```

**Where to get these:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **Database** → **Connection string**
4. Copy both the **Session pooler** (DATABASE_URL) and **Direct connection** (DIRECT_URL)

### 2. Supabase Client (for Auth)

```bash
NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGci..."
```

**Where to get these:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Copy the **Project URL** and **anon public** key

**Note:** The `NEXT_PUBLIC_` prefix means these are exposed to the browser (safe for the anon key).

### 3. AWS S3 (for File Uploads) - OPTIONAL

```bash
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
AWS_REGION="us-east-1"
S3_BUCKET_NAME="pmhnp-uploads"
S3_UPLOAD_PREFIX="local"  # Options: local, dev, prod
```

**Where to get these:**
1. Log in to AWS Console
2. Go to IAM → Users → Create User (or use existing)
3. Attach policy: `AmazonS3FullAccess` (or create custom policy)
4. Create Access Key
5. Create an S3 bucket named `pmhnp-uploads` (or your choice)

**Environment-based prefixes:**
- `local` - for local development
- `dev` - for development environment
- `prod` - for production environment

This keeps files organized in S3:
```
pmhnp-uploads/
├── local/
│   ├── resumes/
│   └── avatars/
├── dev/
│   ├── resumes/
│   └── avatars/
└── prod/
    ├── resumes/
    └── avatars/
```

### 4. Email Service (Resend)

```bash
RESEND_API_KEY="re_your_api_key"
SUPPORT_EMAIL="support@pmhnpjobs.com"
```

**Where to get these:**
1. Sign up at https://resend.com
2. Get your API key from the dashboard
3. Set your support email address

### 5. Cron Job Secret

```bash
CRON_SECRET="your-secure-random-string"
```

Generate a secure random string:
```bash
# On Mac/Linux
openssl rand -base64 32

# On Windows PowerShell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
```

### 6. Job Aggregator APIs

```bash
ADZUNA_APP_ID="your-adzuna-app-id"
ADZUNA_APP_KEY="your-adzuna-api-key"
USAJOBS_API_KEY="your-usajobs-api-key"
JOOBLE_API_KEY="your-jooble-api-key"
CAREERJET_AFFID="your-careerjet-affiliate-id"
```

**Where to get these:**
- **Adzuna**: https://developer.adzuna.com/
- **USAJobs**: https://developer.usajobs.gov/
- **Jooble**: https://jooble.org/api/about
- **CareerJet**: https://www.careerjet.com/partners/api/

### 7. Application Settings

```bash
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
NODE_ENV="development"
```

**For production:**
```bash
NEXT_PUBLIC_BASE_URL="https://yourdomain.com"
NODE_ENV="production"
S3_UPLOAD_PREFIX="prod"
```

## Complete .env.local Template

```bash
# Database
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Supabase Client
NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGci..."

# AWS S3 (Optional - for file uploads)
AWS_ACCESS_KEY_ID="your-key"
AWS_SECRET_ACCESS_KEY="your-secret"
AWS_REGION="us-east-1"
S3_BUCKET_NAME="pmhnp-uploads"
S3_UPLOAD_PREFIX="local"

# Email
RESEND_API_KEY="re_your_key"
SUPPORT_EMAIL="support@pmhnpjobs.com"

# Security
CRON_SECRET="your-secure-random-string"

# Job APIs
ADZUNA_APP_ID="your-id"
ADZUNA_APP_KEY="your-key"
USAJOBS_API_KEY="your-key"
JOOBLE_API_KEY="your-key"
CAREERJET_AFFID="your-id"

# App
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
NODE_ENV="development"
```

## Priority Setup (Minimum to run the app)

**Must have:**
1. ✅ `DATABASE_URL` and `DIRECT_URL` (database connection)
2. ✅ `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (auth)
3. ✅ `CRON_SECRET` (for cron jobs)

**Nice to have:**
4. Email service (for notifications)
5. Job aggregator APIs (for fetching jobs)
6. AWS S3 (for file uploads)

## After Setup

1. Restart your dev server: `npm run dev`
2. Run migrations: `npx prisma migrate deploy`
3. Test the connection: Visit http://localhost:3000

## Troubleshooting

### Error: "Can't reach database server"
- Check your `DATABASE_URL` and `DIRECT_URL`
- Make sure your Supabase project is not paused
- Verify the connection strings are correct

### Error: "Your project's URL and Key are required"
- Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Make sure they have the `NEXT_PUBLIC_` prefix
- Restart your dev server after adding them

### Error: "CRON_SECRET not configured"
- Add `CRON_SECRET` to your `.env.local`
- Generate a secure random string
- Restart your dev server

## Security Notes

- ✅ **NEVER** commit `.env.local` to version control
- ✅ Add `.env.local` to your `.gitignore`
- ✅ Use different values for development and production
- ✅ Rotate secrets regularly in production
- ✅ Use environment-specific S3 prefixes (`local`, `dev`, `prod`)

