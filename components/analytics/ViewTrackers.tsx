'use client';

import { useEffect } from 'react';
import { trackJobView, trackJobListView, buildJobItem, type JobItem } from '@/lib/analytics';

/**
 * Fires `view_item` (GA4) when the job detail page mounts.
 * Drop this into any server-rendered job page — it's a zero-UI component.
 */
export function JobViewTracker({ job }: {
  job: { id: string; title: string; employer?: string; jobType?: string; stateCode?: string; sourceProvider?: string; normalizedMinSalary?: number | null };
}) {
  useEffect(() => {
    trackJobView(buildJobItem(job));
  }, [job]);

  return null;
}

/**
 * Fires `view_item_list` (GA4) when a job list page mounts.
 * Pass a slim array of job data — it will track the first 20 items.
 */
export function JobListViewTracker({ jobs, listName }: {
  jobs: { id: string; title: string; employer?: string; jobType?: string; stateCode?: string; sourceProvider?: string; normalizedMinSalary?: number | null }[];
  listName: string;
}) {
  useEffect(() => {
    if (jobs.length === 0) return;
    const items: JobItem[] = jobs.map(j => buildJobItem(j));
    trackJobListView(items, listName);
  }, [jobs, listName]);

  return null;
}

/**
 * Fires a custom `pseo_page_view` event with pSEO dimensions.
 * Drop into any pSEO template to tag views with page_type, category, city, state.
 * This enables GA4 segmentation: "show me only category×city page traffic".
 */
export function PseoPageViewTracker({ pageType, category, city, state, jobCount }: {
  pageType: 'category_city' | 'setting_state' | 'state_hub' | 'metro' | 'enterprise' | 'locations';
  category?: string;
  city?: string;
  state?: string;
  jobCount?: number;
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dataLayer = window.dataLayer || [];
    // Use gtag for GA4 custom event
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'pseo_page_view', {
        pseo_page_type: pageType,
        pseo_category: category || '(all)',
        pseo_city: city || '(none)',
        pseo_state: state || '(none)',
        pseo_job_count: jobCount || 0,
      });
    }
  }, [pageType, category, city, state, jobCount]);

  return null;
}
