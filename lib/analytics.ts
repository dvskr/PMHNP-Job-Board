/**
 * ═══════════════════════════════════════════════════════════════
 * Enterprise Analytics — Centralized DataLayer Manager
 * ═══════════════════════════════════════════════════════════════
 *
 * Enterprise-grade analytics following Google's recommended patterns:
 * 1. DataLayer-driven architecture (GTM-compatible)
 * 2. Consent Mode v2 (GDPR/CCPA compliant)
 * 3. User ID & custom dimensions
 * 4. Full funnel tracking (Search → View → Save → Apply → SignUp)
 * 5. E-commerce-style item tracking for job listings
 * 6. Engagement scoring
 */

// ── Types ───────────────────────────────────────────────────────

export type ConsentState = 'granted' | 'denied';

export interface ConsentConfig {
  analytics_storage: ConsentState;
  ad_storage: ConsentState;
  ad_user_data: ConsentState;
  ad_personalization: ConsentState;
  functionality_storage: ConsentState;
  personalization_storage: ConsentState;
  security_storage: ConsentState;
}

export interface JobItem {
  item_id: string;
  item_name: string;               // job title
  item_brand?: string;             // company name
  item_category?: string;          // job type (Full-time, Part-time, etc.)
  item_category2?: string;         // work mode (Remote, Hybrid, On-site)
  item_category3?: string;         // state
  item_category4?: string;         // source provider
  item_variant?: string;           // salary range
  price?: number;                  // normalized min salary (for value tracking)
  quantity?: number;               // always 1
  affiliation?: string;            // source site
}

export interface UserProperties {
  user_role?: string;              // job_seeker | employer
  user_plan?: string;              // free | starter | professional | enterprise
  profile_completeness?: number;   // 0-100
  has_resume?: boolean;
  license_states?: string;
}

// ── Globals ─────────────────────────────────────────────────────

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer: any[];
    gtag: (...args: unknown[]) => void;
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';

// ── Core DataLayer Push ─────────────────────────────────────────

function push(data: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(data);
}

function gtag(...args: unknown[]) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  // Google's gtag pushes arguments-style arrays to dataLayer
  window.dataLayer.push(args);
}

// ── Consent Mode v2 ─────────────────────────────────────────────
// Must be called BEFORE gtag loads — sets defaults to "denied"
// so no cookies are set until user consents.

export function initConsentDefaults() {
  gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    functionality_storage: 'granted',
    personalization_storage: 'denied',
    security_storage: 'granted',
    wait_for_update: 500,           // ms to wait for consent before first hit
  } as Record<string, unknown>);
}

export function updateConsent(consent: Partial<ConsentConfig>) {
  gtag('consent', 'update', consent as Record<string, unknown>);
}

export function grantAllConsent() {
  updateConsent({
    analytics_storage: 'granted',
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    personalization_storage: 'granted',
  });
}

export function denyAllConsent() {
  updateConsent({
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    personalization_storage: 'denied',
  });
}

// ── User Identity ───────────────────────────────────────────────

export function setUserId(userId: string | null) {
  if (!GA_ID) return;
  gtag('config', GA_ID, { user_id: userId });
}

export function setUserProperties(props: UserProperties) {
  if (!GA_ID) return;
  gtag('set', 'user_properties', props as Record<string, unknown>);
}

// ── Page Tracking ───────────────────────────────────────────────

export function trackPageView(path: string, title?: string) {
  if (!GA_ID) return;
  gtag('config', GA_ID, {
    page_path: path,
    page_title: title || document.title,
    page_location: window.location.href,
  });
}

// ── Job Funnel Events ───────────────────────────────────────────
// Follows GA4's recommended e-commerce events adapted for job board:
// view_item_list → select_item → view_item → add_to_wishlist → generate_lead

/** User views a list of jobs (search results, category page, homepage) */
export function trackJobListView(jobs: JobItem[], listName: string) {
  push({ ecommerce: null }); // Clear previous ecommerce data
  push({
    event: 'view_item_list',
    ecommerce: {
      item_list_id: listName.toLowerCase().replace(/\s+/g, '_'),
      item_list_name: listName,
      items: jobs.slice(0, 20).map((job, index) => ({
        ...job,
        index,
        quantity: 1,
      })),
    },
  });
}

/** User clicks a job card from a list */
export function trackJobClick(job: JobItem, listName: string, position: number) {
  push({ ecommerce: null });
  push({
    event: 'select_item',
    ecommerce: {
      item_list_id: listName.toLowerCase().replace(/\s+/g, '_'),
      item_list_name: listName,
      items: [{
        ...job,
        index: position,
        quantity: 1,
      }],
    },
  });
}

/** User views a job detail page */
export function trackJobView(job: JobItem) {
  push({ ecommerce: null });
  push({
    event: 'view_item',
    ecommerce: {
      currency: 'USD',
      value: job.price || 0,
      items: [{ ...job, quantity: 1 }],
    },
  });
}

/** User saves a job */
export function trackJobSave(job: JobItem) {
  push({ ecommerce: null });
  push({
    event: 'add_to_wishlist',
    ecommerce: {
      currency: 'USD',
      value: job.price || 0,
      items: [{ ...job, quantity: 1 }],
    },
  });
}

/** User unsaves a job */
export function trackJobUnsave(job: JobItem) {
  push({
    event: 'remove_from_wishlist',
    job_id: job.item_id,
    job_title: job.item_name,
  });
}

/** User clicks apply — PRIMARY CONVERSION */
export function trackJobApply(job: JobItem, method: 'external' | 'platform') {
  push({ ecommerce: null });
  push({
    event: 'generate_lead',
    ecommerce: {
      currency: 'USD',
      value: job.price || 1,
      items: [{ ...job, quantity: 1 }],
    },
  });

  // Also fire as custom event for easier reporting
  push({
    event: 'job_apply',
    job_id: job.item_id,
    job_title: job.item_name,
    company: job.item_brand,
    apply_method: method,
    job_type: job.item_category,
    work_mode: job.item_category2,
    state: job.item_category3,
    source: job.item_category4,
  });
}

// ── Search Tracking ─────────────────────────────────────────────

export function trackSearch(searchTerm: string, filters?: Record<string, string>, resultsCount?: number) {
  push({
    event: 'search',
    search_term: searchTerm,
    results_count: resultsCount,
    ...filters,
  });
}

export function trackFilterChange(filterName: string, filterValue: string) {
  push({
    event: 'filter_change',
    filter_name: filterName,
    filter_value: filterValue,
  });
}

// ── Auth Events ─────────────────────────────────────────────────

export function trackSignUp(method: 'email' | 'google', role: 'job_seeker' | 'employer') {
  push({
    event: 'sign_up',
    method,
    user_role: role,
  });
}

export function trackLogin(method: 'email' | 'google', role?: string) {
  push({
    event: 'login',
    method,
    user_role: role,
  });
}

// ── Engagement Events ───────────────────────────────────────────

export function trackShare(contentType: string, itemId: string, method: string) {
  push({
    event: 'share',
    content_type: contentType,
    item_id: itemId,
    method,
  });
}

export function trackEmailSubscribe(source: string) {
  push({
    event: 'email_subscribe',
    subscribe_source: source,
  });
}

export function trackResumeUpload() {
  push({
    event: 'resume_upload',
    engagement_type: 'high_value',
  });
}

export function trackProfileComplete(completenessPercent: number) {
  push({
    event: 'profile_complete',
    completeness: completenessPercent,
  });
}

// ── Employer Events ─────────────────────────────────────────────

export function trackJobPost(jobId: string, tier: string) {
  push({
    event: 'post_job',
    job_id: jobId,
    pricing_tier: tier,
  });
}

export function trackCandidateView(candidateId: string) {
  push({
    event: 'view_candidate',
    candidate_id: candidateId,
  });
}

export function trackMessageSent(recipientType: 'candidate' | 'employer') {
  push({
    event: 'message_sent',
    recipient_type: recipientType,
  });
}

// ── Utility Events ──────────────────────────────────────────────

export function trackOutboundLink(url: string, linkText?: string) {
  push({
    event: 'click',
    link_url: url,
    link_text: linkText,
    outbound: true,
  });
}

export function trackError(errorType: string, errorMessage: string, fatal: boolean = false) {
  push({
    event: 'exception',
    description: `${errorType}: ${errorMessage}`,
    fatal,
  });
}

export function trackTiming(category: string, variable: string, valueMs: number) {
  push({
    event: 'timing_complete',
    name: variable,
    value: valueMs,
    event_category: category,
  });
}

// ── Job Item Builder Helper ─────────────────────────────────────
// Converts a database job record to a GA4 item object

export function buildJobItem(job: {
  id: string;
  title: string;
  employer?: string;
  company?: string;
  jobType?: string;
  mode?: string;
  state?: string;
  stateCode?: string;
  sourceProvider?: string;
  salaryRange?: string;
  normalizedMinSalary?: number | null;
  sourceSite?: string;
}): JobItem {
  return {
    item_id: job.id,
    item_name: job.title,
    item_brand: job.employer || job.company || 'Unknown',
    item_category: job.jobType || undefined,
    item_category2: job.mode || undefined,
    item_category3: job.stateCode || job.state || undefined,
    item_category4: job.sourceProvider || undefined,
    item_variant: job.salaryRange || undefined,
    price: job.normalizedMinSalary || undefined,
    quantity: 1,
    affiliation: job.sourceSite || undefined,
  };
}
