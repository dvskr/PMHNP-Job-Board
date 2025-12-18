# Deployment Error Prevention Guide

## What Caused the Deployment Loop?

We experienced a frustrating loop where **local builds passed** but **Vercel deployments failed** repeatedly. Here's what went wrong and how to prevent it.

---

## Root Causes

### 1. **TypeScript Strictness Mismatch** ⚠️ (Main Culprit)
- **Local Environment**: Had `"strict": true` but wasn't enforcing all strict checks
- **Vercel Environment**: Runs with stricter TypeScript settings or different configuration
- **Result**: Local builds ✅ → Deployment builds ❌

### 2. **Missing Prisma Client Generation** 🔧
- **Local**: Prisma Client was already generated from previous runs
- **Vercel**: Fresh environment every deploy → No Prisma Client → TypeScript can't find types
- **Missing**: `postinstall` script to auto-generate Prisma Client after `npm install`

### 3. **Hundreds of Implicit Any Errors** 📝
- Callbacks without type annotations: `.map(item => ...)`
- Array access without null checks: `arr[0]` could be undefined
- Object indexing: `obj[key]` where key might not exist
- All hidden locally but caught in deployment

---

## Prevention: Setup Checklist for New Projects

Follow these steps when starting ANY Next.js + Prisma + TypeScript project to avoid deployment loops:

---

## ✅ 1. Configure Maximally Strict TypeScript

**File: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    
    // ⭐ CRITICAL: Enable ALL strict flags
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    
    // ⭐ Additional strict checks
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    
    // Optional but recommended:
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

**Why?** This ensures your local TypeScript is AS STRICT as deployment environments.

---

## ✅ 2. Add Prisma Generation Scripts

**File: `package.json`**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "eslint",
    "postinstall": "prisma generate"
  }
}
```

**Key Scripts:**
- **`postinstall`**: Auto-generates Prisma Client after `npm install` (Vercel runs this)
- **`build`**: Ensures Prisma Client is generated before Next.js build

**Why?** Guarantees Prisma Client is always available in fresh environments.

---

## ✅ 3. Type ALL Callbacks Explicitly

### ❌ Bad (Causes Implicit Any Errors)

```typescript
// Will fail in strict mode
items.map(item => item.name)
jobs.filter(job => job.isActive)
Object.keys(obj).forEach(key => console.log(key))
```

### ✅ Good (Explicit Types)

```typescript
// Type parameters explicitly
items.map((item: Item) => item.name)
jobs.filter((job: Job) => job.isActive)
Object.keys(obj).forEach((key: string) => console.log(key))

// Or use type inference with interfaces
const items: Item[] = getItems()
items.map(item => item.name) // TypeScript infers 'item' is Item
```

**Why?** Prevents 90% of the implicit any errors we spent hours fixing.

---

## ✅ 4. Handle Array Access Safely

### ❌ Bad (Can Be Undefined)

```typescript
const first = array[0]
const last = array[array.length - 1]
```

### ✅ Good (With Null Checks)

```typescript
// Option 1: Optional chaining
const first = array[0]?.name

// Option 2: Guard checks
const last = array.length > 0 ? array[array.length - 1] : null

// Option 3: Non-null assertion (only if you're 100% sure)
const first = array[0]!
```

**Why?** `noUncheckedIndexedAccess` flag requires explicit handling of potentially undefined array access.

---

## ✅ 5. Setup Pre-Commit Hooks with Husky

**Install Husky:**

```bash
npm install -D husky
npx husky init
```

**File: `.husky/pre-commit`**

```bash
#!/bin/sh
# Run type checking before commit
npm run build

# Or just type-check without building:
# npx tsc --noEmit
```

**Why?** Prevents pushing code with type errors that will fail in deployment.

---

## ✅ 6. Configure ESLint with TypeScript Rules

**Install Dependencies:**

```bash
npm install -D @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

**File: `.eslintrc.json`**

```json
{
  "extends": [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "./tsconfig.json"
  },
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-return": "error"
  }
}
```

**Why?** Catches type issues in your editor WHILE you code, not during deployment.

---

## ✅ 7. Test Builds in Clean Environments

**Periodically run:**

```bash
# Delete build artifacts and dependencies
rm -rf .next node_modules

# Fresh install
npm install

# Test build
npm run build
```

**Or create a script in `package.json`:**

```json
{
  "scripts": {
    "clean:build": "rm -rf .next node_modules && npm install && npm run build"
  }
}
```

**Why?** Simulates Vercel's fresh environment and catches missing dependencies or generation steps.

---

## ✅ 8. Create Local Type Definitions for Prisma Models

**File: `lib/types.ts`**

Instead of relying solely on `@prisma/client`, create local type definitions:

```typescript
// Local type definitions (independent of Prisma generation)
export interface Job {
  id: string;
  title: string;
  employer: string;
  location: string;
  description: string;
  isPublished: boolean;
  createdAt: Date;
  // ... other fields
}

export interface JobAlert {
  id: string;
  email: string;
  keyword: string | null;
  // ... other fields
}
```

**Why?** Provides type safety even if Prisma Client generation fails or is delayed.

---

## Common Error Patterns We Fixed

### 1. **Implicit Any in Map/Filter/ForEach**

```typescript
// ❌ Before
items.map(item => item.name)

// ✅ After
items.map((item: Item) => item.name)
```

### 2. **Unsafe Array Access**

```typescript
// ❌ Before
const best = sorted[0]
best.name // Error: 'best' is possibly undefined

// ✅ After
const best = sorted[0]
if (!best) return <div>No data</div>
return <div>{best.name}</div>
```

### 3. **Object Indexing Without Guards**

```typescript
// ❌ Before
sourceBreakdown[source].after++

// ✅ After
if (sourceBreakdown[source]) {
  sourceBreakdown[source].after++
}
```

### 4. **UseEffect Without Return Type**

```typescript
// ❌ Before
useEffect(() => {
  if (condition) {
    const timer = setTimeout(...)
    return () => clearTimeout(timer)
  }
  // Missing return for other branches
}, [deps])

// ✅ After
useEffect(() => {
  if (condition) {
    const timer = setTimeout(...)
    return () => clearTimeout(timer)
  }
  return undefined // Explicit return
}, [deps])
```

---

## Quick Reference: Deployment Checklist

Before pushing to production, verify:

- [ ] `npm run build` passes locally
- [ ] All TypeScript strict flags enabled in `tsconfig.json`
- [ ] `postinstall` script includes `prisma generate`
- [ ] No implicit `any` types in callbacks
- [ ] Array access has null checks or optional chaining
- [ ] ESLint shows no errors
- [ ] Fresh build test passes: `rm -rf .next node_modules && npm install && npm run build`

---

## Environment Parity Checklist

Ensure your local and deployment environments match:

| Setting | Local | Vercel/Production |
|---------|-------|-------------------|
| TypeScript Strict Mode | ✅ All flags on | ✅ All flags on |
| Prisma Generation | ✅ Auto (postinstall) | ✅ Auto (postinstall) |
| Node Version | Same as production | Lock in `.nvmrc` |
| Environment Variables | `.env.local` | Vercel dashboard |

---

## Final Advice

> **"Make your local environment STRICTER than production, not looser."**

If your local build passes with maximum strictness, your deployment will succeed. The opposite approach (loose locally, strict in production) leads to the frustrating loop we just experienced.

---

## Additional Resources

- [TypeScript Strict Mode](https://www.typescriptlang.org/tsconfig#strict)
- [Next.js Deployment Best Practices](https://nextjs.org/docs/deployment)
- [Prisma Client Generation](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-prismaclient/generating-prisma-client)
- [React Hydration Errors](https://nextjs.org/docs/messages/react-hydration-error)

---

**Created:** December 2024  
**Last Updated:** After fixing the deployment loop  
**Status:** Active prevention guide

