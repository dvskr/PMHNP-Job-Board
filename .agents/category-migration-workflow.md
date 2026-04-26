# Category Page V2 Migration Workflow

> **Gold Standard Reference**: `app/jobs/inpatient/page.tsx`
> **Design System**: "Warm Diorama" — claymorphic, warm, professional

---

## ⛔ HARD RULES — NEVER BREAK THESE

1. **NO emojis anywhere in bento cards** — always use clay icon Images (`48x48`, centered with `margin: '0 auto'`, `display: 'block'`)
2. **NO Lucide icons in bento ROW 2** — only claymorphic 3D Image icons
3. **Every image must contextually match its card** — if the card says "Career Growth", the image must depict career growth, NOT a random therapy room
4. **`clayCard` token MUST exist before any JSX** — define it right after imports, before `revalidate`
5. **Every page MUST have ALL 7 sections** in this exact order (see Section Order below)
6. **ROW 2 icons are `48x48`** with `objectFit: 'contain'`, `margin: '0 auto 14px'`, `display: 'block'` — this is what centers them
7. **NO `$$` double-dollar bugs** — salary lines use: `` `$${stats.avgSalary}k` ``
8. **Filters must be tight** — title-only matching preferred. Known pitfalls: `MAT` catches "Matawan" (use ` MAT ` with spaces), `contract` catches W2 roles, `description contains` catches unrelated jobs that just mention the term. NEVER use broad description-based filters.
9. **Hero CTA links to `/jobs?q={category}`** — NOT to the same category page. This pre-fills the search on the main jobs page.
10. **"Browse All" CTA under job listings is REQUIRED** — centered below job cards, links to `/jobs?q={category}`, uses `padding: '14px 32px'` style

---

## 📐 Section Order (all 7 required)

```
1. HERO              — category hero image + CTA
2. JOB LISTINGS      — 2-col job cards + sidebar (alerts, employers, salary)
3. BENTO GRID        — 12-column, 3 rows (see Bento Spec below)
4. BEFORE YOU APPLY  — 4 numbered clay cards with teal top border
5. EXPLORE MORE      — 3x2 grid of category links
6. FAQ               — inline clay cards with Q&A (NOT CategoryFAQ component)
7. RESPONSIVE CSS    — hover + mobile + tablet breakpoints
```

---

## 🧱 Clay Card Token (COPY EXACTLY)

```tsx
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};
```

**Placement**: After imports, BEFORE `export const revalidate = 3600;`

---

## 🧊 Bento Grid Specification (12-column)

### ROW 1: Hero Cards
| Position | Span | Content |
|----------|------|---------|
| Left | `span 8` | Text left + **contextual diorama image** right. `gridTemplateColumns: '1fr 1fr'` |
| Right | `span 4` | **Contextual diorama image** top + text bottom. `flexDirection: 'column'` |

### ROW 2: Icon Cards (4 x `span 3`)
| Property | Value |
|----------|-------|
| Icon type | **Clay 3D Image** — NOT emoji, NOT Lucide |
| Icon size | `width={48} height={48}` |
| Icon style | `width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block'` |
| Card padding | `padding: '24px 18px'` |
| Card align | `textAlign: 'center'` (NO flex needed when using margin auto on Image) |
| Title | `fontSize: '14px', fontWeight: 700` |
| Text | `fontSize: '12px', color: '#7A6A62'` |

### ROW 3: Feature + CTA
| Position | Span | Content |
|----------|------|---------|
| Left | `span 8` | Lucide icon (TrendingUp) + text left + **contextual diorama image** right |
| Right | `span 4` | Bell icon + CTA button. Green gradient bg. |

---

## 🎨 Image Generation Rules

### Bento Diorama Images (ROW 1, ROW 3)
- **Style**: Isometric 3D clay diorama, claymorphic rounded puffy edges
- **Size**: `280x200` (ROW 1 left, ROW 3) or `200x140` (ROW 1 right)
- **Background**: Solid edge-to-edge matching the gradient:
  - ROW 1 left bg: `#CCFBF1` (mint green)
  - ROW 1 right bg: `#FEF3C7` (warm cream)
  - ROW 3 left bg: `#FFEDD5` (warm peach)
- **MUST depict**: The EXACT concept of the card title (e.g., "Hospital Settings" = hospital ward, "Career Growth" = stepping stones going up)
- **NO text, NO white borders**

### Clay Icons (ROW 2)
- **Style**: Single 3D claymorphic object icon, minimal detail
- **Size**: Small, centered, 200x200px canvas
- **Background**: Solid `#CCFBF1` mint green
- **MUST depict**: A single recognizable object matching the card (e.g., "Structured Shifts" = hospital bed, "Crisis Expertise" = alert bell)
- **Naming**: `icon_{category}_{concept}.png`

### Naming Convention
```
Diorama:  bento_{category}_{concept}.png
Icons:    icon_{category}_{concept}.png
Hero:     hero_v2_{category}.png
```

---

## 📦 Required Imports

```tsx
import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { TrendingUp, Building2, Bell, ArrowRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
```

Only import Lucide icons actually used (TrendingUp for ROW 3 salary, Building2 for sidebar employers, Bell for sidebar/CTA, ArrowRight for buttons).

---

## 📱 Responsive CSS (COPY EXACTLY)

```css
.cat-cta-primary { transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease; }
.cat-cta-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(13,148,136,0.35) !important; filter: brightness(1.05); }
.cat-bento-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
.cat-bento-card:hover { transform: translateY(-4px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
.cat-stat-pill { transition: transform 0.2s ease, box-shadow 0.2s ease; }
.cat-stat-pill:hover { transform: translateY(-2px) scale(1.02); box-shadow: 6px 6px 20px rgba(0,0,0,0.1), -3px -3px 10px rgba(255,255,255,0.9) !important; }
@media (max-width: 768px) {
  .cat-hero-grid { grid-template-columns: 1fr !important; }
  .cat-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
  .cat-bento-grid { grid-template-columns: 1fr !important; }
  .cat-bento-hero-1, .cat-bento-hero-2, .cat-bento-hero-3, .cat-bento-cta { grid-column: span 1 !important; }
  .cat-bento-hero-1, .cat-bento-hero-3 { grid-template-columns: 1fr !important; }
  .cat-bento-grid > div { grid-column: span 1 !important; }
  .cat-explore-grid { grid-template-columns: repeat(2, 1fr) !important; }
}
@media (min-width: 769px) and (max-width: 1024px) {
  .cat-bento-grid { grid-template-columns: repeat(6, 1fr) !important; }
  .cat-bento-hero-1, .cat-bento-hero-3 { grid-column: span 6 !important; }
  .cat-bento-hero-2, .cat-bento-cta { grid-column: span 6 !important; }
  .cat-bento-grid > div:not(.cat-bento-hero-1):not(.cat-bento-hero-2):not(.cat-bento-hero-3):not(.cat-bento-cta) { grid-column: span 3 !important; }
}
```

---

## ✅ Pre-Flight Checklist (run before marking page "done")

- [ ] `clayCard` token defined before `revalidate`
- [ ] All 7 sections present in correct order
- [ ] Bento grid uses `repeat(12, 1fr)` — NOT `repeat(4, 1fr)`
- [ ] ROW 2 icons are `<Image>` components at 48x48 — NOT emojis, NOT Lucide
- [ ] ROW 2 icons centered via `margin: '0 auto 14px', display: 'block'`
- [ ] All 3 bento diorama images contextually match their card titles
- [ ] All 4 clay icons contextually match their card titles
- [ ] Salary line uses `` `$${stats.avgSalary}k` `` — no double $$
- [ ] Job listings section has sidebar (alerts + employers + salary)
- [ ] FAQ section uses inline clay cards — NOT `<CategoryFAQ>` component
- [ ] Responsive CSS includes BOTH mobile AND tablet breakpoints
- [ ] Filter keywords are tight — no false positives
- [ ] Hero CTA links to `/jobs?q={category}` (NOT to same page)
- [ ] "Browse All" CTA button exists below job listings → `/jobs?q={category}`
- [ ] Images deployed to `public/images/categories/`
- [ ] Hard-refresh tested in browser

---

## 🗂️ Migration Status

| Page | Status | Notes |
|------|--------|-------|
| remote | ✅ Complete | Master template |
| inpatient | ✅ Complete | Gold standard reference |
| 1099 | 🔧 Needs visual audit | Icons fixed to 48x48, CTAs fixed, needs browser check |
| addiction | 🔧 Needs visual audit | Icons fixed to 48x48, CTAs fixed, needs browser check |
| behavioral-health | 🔧 Needs visual audit | Icons fixed to 48x48, CTAs fixed, needs browser check |
| correctional | ❌ Not started | |
| locum-tenens | ❌ Not started | |
| outpatient | ❌ Not started | |
| per-diem | ❌ Not started | |
| telehealth | ❌ Not started | |
| va | ❌ Not started | |

---

## 🔧 Migration Steps (for each page)

### Step 1: Prep
1. View current page file
2. Identify missing sections
3. Plan category-specific content (titles, descriptions, FAQ answers)

### Step 2: Generate Assets (BEFORE writing code)
Generate ALL images first:
- 3 diorama images for ROW 1 left, ROW 1 right, ROW 3 left
- 4 clay icons for ROW 2 cards
- Deploy all to `public/images/categories/`

### Step 3: Write Code
Apply template using migration script:
1. Add `clayCard` token
2. Add Hero section
3. Add Job Listings + Sidebar
4. Add 12-col Bento Grid (with generated images)
5. Add Before You Apply
6. Add Explore More
7. Add inline FAQ
8. Add Responsive CSS (both mobile + tablet)

### Step 4: Validate
Run pre-flight checklist. Hard-refresh browser. Visual audit.
