# Clean Codebase Maintenance Guide

## 📋 Overview
This guide helps you maintain a clean, professional codebase for the PMHNP Job Board.

---

## ✅ PHASE 1: Immediate Fixes (1-2 Hours)

### 1. Fix Linter Errors

Your codebase has **linter errors** that need fixing. Run:

```bash
# See all errors
npm run lint

# Auto-fix what can be fixed
npm run lint:fix
```

**Common Issues Found:**
- **React unescaped entities** - Replace `'` with `&apos;` in JSX
- **TypeScript `any` types** - Replace with proper types
- **Unused variables** - Remove or use them
- **React hooks issues** - Fix useEffect patterns

### 2. Fix Top Priority Files

Based on the lint report, fix these files first:

#### High Priority (Breaks Production):
```
- app/employer/renewal-success/page.tsx (React hooks issue)
- app/auth/callback/route.ts (use const instead of let)
```

#### Medium Priority (Code Quality):
```
- app/admin/page.tsx (4 `any` types)
- app/api/admin/renormalize-salaries/route.ts (3 `any` types)
- app/api/analytics/clicks/route.ts (1 `any` type)
```

#### Low Priority (Polish):
```
- All pages with unescaped quotes/apostrophes
- Unused variable warnings
```

### 3. Install Missing Dev Dependencies

```bash
npm install --save-dev prettier rimraf
```

---

## 🔧 PHASE 2: Code Quality Setup (30 Minutes)

### 1. Type Checking

Run TypeScript compiler to catch type errors:

```bash
npm run type-check
```

Fix any errors before deploying.

### 2. Format Code

```bash
# Check formatting
npm run format:check

# Auto-format all files
npm run format
```

### 3. Pre-Commit Validation

Before every commit, run:

```bash
npm run validate
```

This runs both type-check and lint.

---

## 📁 PHASE 3: File Organization (Ongoing)

### Current Structure ✅
Your structure is already good! Keep it:

```
app/               # Next.js pages & API routes
components/        # Reusable UI components
lib/              # Business logic & utilities
prisma/           # Database schema
scripts/          # Maintenance scripts
public/           # Static assets
```

### Keep This Organization:

1. **API Routes** - All in `app/api/`
2. **Components** - Organized by feature/type
3. **Library Code** - Pure functions in `lib/`
4. **Types** - Centralized in `types/`

### Files to Clean Up:

```bash
# Remove if you have these:
- Any `.test.ts` files not being used
- Unused components
- Commented-out code blocks
- Console.log statements
```

---

## 🗑️ PHASE 4: Remove Dead Code (1 Hour)

### 1. Find Unused Exports

Search for exports that are never imported:

```bash
# Use your IDE's "Find References" feature
# Or manually check:
```

### 2. Remove Console Logs

Before production:

```bash
# Search for console statements
grep -r "console\\.log" app/ components/ lib/
```

Replace with proper logging:
```typescript
// Bad
console.log('User data:', user);

// Good
if (process.env.NODE_ENV === 'development') {
  console.log('User data:', user);
}
```

### 3. Remove Commented Code

Search for:
- `// TODO:` comments without plans
- Large blocks of commented code
- Old implementation attempts

---

## 📊 PHASE 5: Documentation (Ongoing)

### 1. Add JSDoc Comments for Complex Functions

```typescript
/**
 * Normalizes job salary data from various sources
 * @param salary - Raw salary string or object
 * @param source - Job board source identifier
 * @returns Normalized salary object with min/max/period
 */
export function normalizeSalary(salary: any, source: string) {
  // ...
}
```

### 2. Update README Sections

Keep these sections current:
- ✅ Environment variables list
- ✅ Setup instructions
- ✅ Deployment steps
- ✅ API documentation

---

## 🔒 PHASE 6: Security & Best Practices

### 1. Environment Variables

Never commit:
- API keys
- Database URLs
- Stripe secrets
- Email credentials

Check `.env` is in `.gitignore` ✅

### 2. Validate All User Inputs

Your code already does this well! Keep using:
- ✅ Zod schemas for validation
- ✅ Server-side validation on all API routes
- ✅ Sanitization of user content

### 3. Rate Limiting

Consider adding rate limiting to:
- `/api/jobs/post-free` (prevent spam)
- `/api/contact` (prevent abuse)
- `/api/job-alerts` (prevent mass signups)

---

## 🚀 PHASE 7: Performance Optimization

### 1. Database Queries

Review these files for N+1 queries:
```
- app/jobs/page.tsx
- app/dashboard/page.tsx
- app/admin/jobs/page.tsx
```

Use Prisma includes/selects to reduce queries.

### 2. Image Optimization

Your logo and OG images are SVG ✅ - That's good!

For user-uploaded images:
- Use Next.js Image component
- Set proper width/height
- Use webp format

### 3. Bundle Size

Check your bundle:
```bash
npm run build
```

Look for:
- Large dependencies
- Duplicate code
- Unused imports

---

## 📝 PHASE 8: Testing Strategy

### 1. Manual Testing Checklist

Test these flows before production:

**Auth Flows:**
- [ ] Sign up
- [ ] Login
- [ ] Logout
- [ ] Password reset
- [ ] Email verification

**Job Flows:**
- [ ] Post free job
- [ ] Post paid job
- [ ] Edit job
- [ ] Delete job
- [ ] Job expiration

**Payment Flows:**
- [ ] Checkout (test mode)
- [ ] Webhook handling
- [ ] Renewal
- [ ] Upgrade

**Email Flows:**
- [ ] Welcome email
- [ ] Job alerts
- [ ] Confirmation emails

### 2. API Testing

Test all critical endpoints:
```bash
# Test job posting
curl -X POST http://localhost:3000/api/jobs/post-free \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","company":"Test Co"}'

# Test aggregation
curl http://localhost:3000/api/cron/aggregate-jobs
```

---

## 🔄 PHASE 9: Regular Maintenance Tasks

### Daily:
- Check error logs
- Monitor Stripe webhooks
- Review new job postings

### Weekly:
- Run `npm run lint`
- Check for dependency updates
- Review database performance
- Clean old job listings

### Monthly:
- Update dependencies
- Review analytics
- Audit security
- Backup database

---

## 📦 PHASE 10: Dependency Management

### 1. Keep Dependencies Updated

```bash
# Check for outdated packages
npm outdated

# Update safely
npm update

# For major updates, test carefully
```

### 2. Remove Unused Dependencies

```bash
# Check bundle
npx depcheck
```

---

## 🎯 Quick Commands Reference

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run start            # Start production server

# Code Quality
npm run lint             # Check for errors
npm run lint:fix         # Auto-fix errors
npm run type-check       # Check TypeScript
npm run format           # Format code
npm run validate         # Run all checks

# Database
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open database GUI

# Maintenance
npm run audit:jobs       # Audit job data
npm run clean:descriptions  # Clean job descriptions
npm run fix:locations    # Fix location data
```

---

## ✅ Completion Checklist

Before considering your codebase "clean":

### Code Quality:
- [ ] No linter errors
- [ ] No TypeScript errors
- [ ] All code formatted
- [ ] No console.logs in production code
- [ ] No commented-out code blocks

### Documentation:
- [ ] README is up to date
- [ ] Environment variables documented
- [ ] Complex functions have comments
- [ ] API endpoints documented

### Security:
- [ ] No secrets in code
- [ ] All inputs validated
- [ ] Rate limiting on public endpoints
- [ ] HTTPS enforced in production

### Performance:
- [ ] Images optimized
- [ ] No N+1 queries
- [ ] Bundle size reasonable
- [ ] Database indexes set

### Testing:
- [ ] All auth flows tested
- [ ] Payment flows tested
- [ ] Email system tested
- [ ] Error handling tested

---

## 🚨 Red Flags to Watch For

Stop and fix immediately if you see:

1. **Any API keys or secrets in code**
2. **SQL injection vulnerabilities**
3. **Unvalidated user input**
4. **Infinite loops or memory leaks**
5. **Unhandled promise rejections**
6. **Missing error boundaries**
7. **Exposed admin endpoints**
8. **Missing authentication checks**

---

## 📚 Resources

- [Next.js Best Practices](https://nextjs.org/docs/app/building-your-application/routing/defining-routes)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [TypeScript Do's and Don'ts](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [React Best Practices](https://react.dev/learn)

---

## 🎉 Your Current Status

Based on the audit report, your codebase is **85-87% complete** with:

✅ **Excellent**: Auth system, deduplication, normalization, filters  
✅ **Good**: Stripe integration, email system, job posting  
⚠️ **Needs Work**: Linter errors, some TypeScript `any` types  
❌ **Missing**: OG image (now created!), quality scoring

**You're ready to launch after fixing the linter errors!**

---

**Last Updated:** December 23, 2025  
**Maintenance Level:** Production-Ready with Minor Cleanup Needed

