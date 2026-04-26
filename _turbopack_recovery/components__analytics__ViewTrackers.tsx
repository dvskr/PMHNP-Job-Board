'use client';

import { useEffect } from 'react';
import { trackJobView, trackJobListView, buildJobItem, type JobItem } from '@/lib/analytics';

/**
 * Fires `view_item` (GA4) when the job detail page mounts.
 * Drop this into any server-rendered job page â€” it's a zero-UI component.
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
 * Pass a slim array of job data â€” it will track the first 20 items.
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
