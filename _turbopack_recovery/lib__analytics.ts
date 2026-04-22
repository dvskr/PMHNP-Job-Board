/**
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * Enterprise Analytics â€” Centralized DataLayer Manager
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 *
 * Enterprise-grade analytics following Google's recommended patterns:
 * 1. DataLayer-driven architecture (GTM-compatible)
 * 2. Consent Mode v2 (GDPR/CCPA compliant)
 * 3. User ID & custom dimensions
 * 4. Full funnel tracking (Search â†’ View â†’ Save â†’ Apply â†’ SignUp)
 * 5. E-commerce-style item tracking for job listings
 * 6. Engagement scoring
 */

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Globals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer: any[];
    gtag: (...args: unknown[]) => void;
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';

// â”€â”€ Core DataLayer Push â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function push(data: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(data);
}

function gtag(...args: unknown[]) {
  if (typeof window === 'undefined') return;
  // Use the global gtag() function when available â€” it pushes Arguments
  // objects to dataLayer which GA4 processes. Plain arrays are ignored.
  if (typeof window.gtag === 'function') {
    window.gtag(...args);
  } else {
    // Fallback before gtag.js loads: push via dataLayer using the
    // standard gtag pattern. We create a wrapper function so that
    // `arguments` is the real Arguments object GA4 expects.
    window.dataLayer = window.dataLayer || [];
    // eslint-disable-next-line prefer-spread
    Function.prototype.apply.call(
      function() { window.dataLayer.push(arguments); },
      null,
      args
    );
  }
}

// â”€â”€ Consent Mode v2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// analytics_storage is 'granted' by default for US users.
// Ad-related consent stays 'denied' until cookie consent accepted.

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

// â”€â”€ User Identity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function setUserId(userId: string | null) {
  if (!GA_ID) return;
  gtag('config', GA_ID, { user_id: userId });
}

export function setUserProperties(props: UserProperties) {
  if (!GA_ID) return;
  gtag('set', 'user_properties', props as Record<string, unknown>);
}

// â”€â”€ Page Tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function trackPageView(path: string, title?: string) {
  if (!GA_ID) return;
  // Standard GA4 SPA page view tracking via gtag config call
  gtag('config', GA_ID, {
    page_path: path,
    page_title: title || (typeof document !== 'undefined' ? document.title : ''),
    page_location: typeof window !== 'undefined' ? window.location.href : '',
  });
}

// â”€â”€ Job Funnel Events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Follows GA4's recommended e-commerce events adapted for job board:
// view_item_list â†’ select_item â†’ view_item â†’ add_to_wishlist â†’ generate_lead
//
// IMPORTANT: All events use gtag('event', ...) NOT dataLayer.push().
// Without GTM, dataLayer.push() for custom events is silently ignored.

/** User views a list of jobs (search results, category page, homepage) */
export function trackJobListView(jobs: JobItem[], listName: string) {
  gtag('event', 'view_item_list', {
    item_list_id: listName.toLowerCase().replace(/\s+/g, '_'),
    item_list_name: listName,
    items: jobs.slice(0, 20).map((job, index) => ({
      ...job,
      index,
      quantity: 1,
    })),
  });
}

/** User clicks a job card from a list */
export function trackJobClick(job: JobItem, listName: string, position: number) {
  gtag('event', 'select_item', {
    item_list_id: listName.toLowerCase().replace(/\s+/g, '_'),
    item_list_name: listName,
    items: [{
      ...job,
      index: position,
      quantity: 1,
    }],
  });
}

/** User views a job detail page */
export function trackJobView(job: JobItem) {
  gtag('event', 'view_item', {
    currency: 'USD',
    value: job.price || 0,
    items: [{ ...job, quantity: 1 }],
  });
}

/** User saves a job */
export function trackJobSave(job: JobItem) {
  gtag('event', 'add_to_wishlist', {
    currency: 'USD',
    value: job.price || 0,
    items: [{ ...job, quantity: 1 }],
  });
}

/** User unsaves a job */
export function trackJobUnsave(job: JobItem) {
  gtag('event', 'remove_from_wishlist', {
    job_id: job.item_id,
    job_title: job.item_name,
  });
}

/** User clicks apply â€” PRIMARY CONVERSION */
export function trackJobApply(job: JobItem, method: 'external' | 'platform') {
  // Fire GA4 recommended event for lead generation
  gtag('event', 'generate_lead', {
    currency: 'USD',
    value: job.price || 1,
    items: [{ ...job, quantity: 1 }],
  });

  // Also fire as custom event for easier reporting
  gtag('event', 'job_apply', {
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

// â”€â”€ Search Tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function trackSearch(searchTerm: string, filters?: Record<string, string>, resultsCount?: number) {
  gtag('event', 'search', {
    search_term: searchTerm,
    results_count: resultsCount,
    ...filters,
  });
}

export function trackFilterChange(filterName: string, filterValue: string) {
  gtag('event', 'filter_change', {
    filter_name: filterName,
    filter_value: filterValue,
  });
}

// â”€â”€ Auth Events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function trackSignUp(method: 'email' | 'google', role: 'job_seeker' | 'employer') {
  gtag('event', 'sign_up', {
    method,
    user_role: role,
  });
}

export function trackLogin(method: 'email' | 'google', role?: string) {
  gtag('event', 'login', {
    method,
    user_role: role,
  });
}

// â”€â”€ Engagement Events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function trackShare(contentType: string, itemId: string, method: string) {
  gtag('event', 'share', {
    content_type: contentType,
    item_id: itemId,
    method,
  });
}

export function trackEmailSubscribe(source: string) {
  gtag('event', 'email_subscribe', {
    subscribe_source: source,
  });
}

export function trackResumeUpload() {
  gtag('event', 'resume_upload', {
    engagement_type: 'high_value',
  });
}

export function trackProfileComplete(completenessPercent: number) {
  gtag('event', 'profile_complete', {
    completeness: completenessPercent,
  });
}

// â”€â”€ Employer Events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function trackJobPost(jobId: string, tier: string) {
  gtag('event', 'post_job', {
    job_id: jobId,
    pricing_tier: tier,
  });
}

export function trackCandidateView(candidateId: string) {
  gtag('event', 'view_candidate', {
    candidate_id: candidateId,
  });
}

export function trackMessageSent(recipientType: 'candidate' | 'employer') {
  gtag('event', 'message_sent', {
    recipient_type: recipientType,
  });
}

// â”€â”€ Utility Events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function trackOutboundLink(url: string, linkText?: string) {
  gtag('event', 'click', {
    link_url: url,
    link_text: linkText,
    outbound: true,
  });
}

export function trackError(errorType: string, errorMessage: string, fatal: boolean = false) {
  gtag('event', 'exception', {
    description: `${errorType}: ${errorMessage}`,
    fatal,
  });
}

export function trackTiming(category: string, variable: string, valueMs: number) {
  gtag('event', 'timing_complete', {
    name: variable,
    value: valueMs,
    event_category: category,
  });
}

// â”€â”€ Job Item Builder Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
