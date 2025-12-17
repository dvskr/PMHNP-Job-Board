This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Environment Variables

Create a `.env.local` file in the root directory and add the following variables:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"

# Supabase (if using)
NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"

# API Keys
ADZUNA_APP_ID="your-adzuna-app-id"
ADZUNA_API_KEY="your-adzuna-api-key"

# Email (Resend)
RESEND_API_KEY="your-resend-api-key"

# Stripe (for paid postings)
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."

# Application Settings
NEXT_PUBLIC_BASE_URL="http://localhost:3000"

# Google Analytics 4
NEXT_PUBLIC_GA_MEASUREMENT_ID="G-H1GR7E8QYB"
```

**Note on Google Analytics:**
- GA4 component only renders in production (not on localhost)
- Uses Next.js Script component for optimal performance
- Tracks page views automatically
- To test locally, temporarily change `process.env.NODE_ENV !== 'production'` check in `components/GoogleAnalytics.tsx`

### Run the Development Server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
