'use client';

import { useEffect } from 'react';

const VISIT_COUNT_KEY = 'pmhnp_visit_count';
const SESSION_GUARD_KEY = 'pmhnp_visit_counted';

/**
 * Increments the shared `pmhnp_visit_count` localStorage counter once per
 * browser session (sessionStorage guard) on every device. Renders nothing.
 *
 * The counter used to be incremented inside PWAInstallBanner, AFTER its
 * mobile-only early return — so desktop visits were never counted and
 * PushNotificationPrompt (which requires 3+ visits) could never fire on
 * desktop. Counting now lives here; the prompts only read the value.
 */
export default function VisitCounter() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_GUARD_KEY)) return;
      sessionStorage.setItem(SESSION_GUARD_KEY, '1');
      const visits = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10) + 1;
      localStorage.setItem(VISIT_COUNT_KEY, visits.toString());
    } catch {
      // Storage unavailable (private mode / blocked) — skip counting.
    }
  }, []);

  return null;
}
