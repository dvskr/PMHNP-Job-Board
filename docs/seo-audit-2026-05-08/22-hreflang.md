# Audit 22 — Hreflang, Language Tags & International Targeting
**Date:** 2026-05-08  
**Auditor:** SEO specialist agent  
**Scope:** US-only site, English-only, PMHNP (state-licensed profession, non-transferable internationally)

---

## Summary verdict: VERIFIED CLEAN

No hreflang annotations exist, no locale-routing paths exist, and no broken international signals were found. All language and locale declarations are internally consistent and correctly scoped to US English. The one low-severity item below (lang="en" vs lang="en-US") is cosmetic but worth a one-word fix.

---

## Checklist results

| Check | Status | Location |
|---|---|---|
| `<html lang>` set | PASS — `lang="en"` | `app/layout.tsx:159` |
| `lang="en-US"` (preferred) | LOW — is `"en"` not `"en-US"` | `app/layout.tsx:159` |
| `alternates.languages` hreflang | PASS — none present | all page metadata |
| Sitemap `xhtml:link hreflang` | PASS — none present | `app/sitemap.ts` |
| Locale-path routing (`/en/`, `/es/`) | PASS — none | `next.config.ts` |
| `?lang=` URL params | PASS — none | all routes |
| `next.config.ts` i18n block | PASS — no i18n key | `next.config.ts` |
| OG `locale` | PASS — `en_US` | `app/layout.tsx:81` |
| OG `locale:alternate` | PASS — none | `app/layout.tsx` |
| Twitter card lang | INFO — not set (not required) | `app/layout.tsx:96-101` |
| Geo meta tags | PASS — none | all files |
| Currency USD-only | PASS — `$` prefix throughout | `lib/utils.ts:72-81` |
| Schema `addressCountry` | PASS — `"US"` | `app/layout.tsx:203` / `config/brand.ts:73` |
| Phone/contact format | PASS — email-only, no phone | `config/brand.ts:80-90` |
| `.htaccess` / geo-targeting config | PASS — none (Vercel) | project root |
| Vercel edge geo redirect | PASS — no geo-based redirects | `next.config.ts` |
| Accidental non-US redirect rules | PASS — none | `next.config.ts:132-199` |

---

## Findings

### [LOW] `lang="en"` should be `lang="en-US"`

**Location:** `app/layout.tsx:159`

**Issue:** The `<html>` element uses `lang="en"` (BCP 47 language subtag only). Google treats `en` and `en-US` as equivalent for ranking purposes, and the site will not be de-ranked for this. However, `en-US` is the precise BCP 47 tag that signals English as spoken in the United States — directly matching the addressCountry "US" in the Organization schema and the `og:locale` of `en_US`. Consistency across all three signals (html lang, og:locale, schema address) is cleaner and future-proofs against any Googlebot refinement that distinguishes `en` (generic) from `en-US` (US-specific audience).

**Fix:** One-character change.

```tsx
// app/layout.tsx:159
- <html lang="en" suppressHydrationWarning>
+ <html lang="en-US" suppressHydrationWarning>
```

---

### [INFO] Twitter card metadata has no explicit lang — not a defect

**Location:** `app/layout.tsx:96-101`

Twitter's card spec does not define a `twitter:lang` property. The `lang` of the rendered page is inherited from the `<html lang>` attribute at render time. No action required.

---

### [INFO] `og:locale:alternate` absent — correct behavior for a monolingual site

No alternate locales are present in the OpenGraph metadata. Adding `og:locale:alternate` for a US English-only site would be incorrect. The single `locale: 'en_US'` in the root metadata export is the right configuration.

---

### [INFO] Sitemap has no hreflang annotations — correct

`app/sitemap.ts` emits plain `<url>` entries with `<loc>`, `<lastmod>`, `<changefreq>`, and `<priority>`. No `<xhtml:link rel="alternate" hreflang="...">` is present. For a single-language, single-country site this is correct. Adding `x-default` or `en-US` self-referential hreflang would add noise without benefit.

---

### [INFO] No i18n routing block in `next.config.ts` — correct

The `next.config.ts` contains no `i18n:` key, no `locales` array, and no `defaultLocale`. No locale-prefixed URL paths (`/en/`, `/es/`, etc.) exist anywhere in the route tree. This is the correct configuration for a US-only site.

---

### [INFO] `addressCountry: "US"` in Organization schema — correctly set

`config/brand.ts:73` sets `addressCountry: 'US'` (ISO 3166-1 alpha-2). This is emitted into the JSON-LD Organization schema at `app/layout.tsx:203`. The value is correct. The legal address is Sheridan, WY 82801 — a US address with no international ambiguity.

---

### [INFO] Currency signalling is USD throughout — correct

`lib/utils.ts:72-81` formats all salary values with a `$` prefix and no explicit currency code. All salary data in the database is assumed to be USD (PMHNP is a US-licensed profession). No non-USD formatting or ambiguous currency symbols appear anywhere.

---

## What is not present (correct omissions)

- No geo meta tags (`geo.region`, `geo.placename`, `geo.position`, `ICBM`). These are deprecated and ignored by Google. Their absence is correct.
- No `.htaccess` or server-side geo-redirect logic. Vercel's edge network does not apply geo-based content serving by default; no custom middleware geo-branch was found.
- No `Content-Language` HTTP header declared. For a single-language site this is fine; the `<html lang>` tag is the canonical signal.

---

## One-line action required

Fix `app/layout.tsx:159`: change `lang="en"` to `lang="en-US"`.

All other international targeting signals are clean, absent where they should be absent, and present where they should be present.
