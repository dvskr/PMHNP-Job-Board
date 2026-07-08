/**
 * Static regression guards for the 2026-07 UX fixes (overlays, visit
 * counting, bottom nav, contrast, filter drawer, error copy). Each reads the
 * real source so a future edit can't silently revert the fix.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

describe('exit-intent popup is fully removed', () => {
  it('components/ExitIntentPopup.tsx is deleted', () => {
    expect(exists('components/ExitIntentPopup.tsx')).toBe(false);
  });
  it('neither layout nor homepage mounts it (was double-mounted)', () => {
    expect(read('app/layout.tsx')).not.toContain('ExitIntentPopup');
    expect(read('app/page.tsx')).not.toContain('ExitIntentPopup');
  });
});

describe('visit counting is centralized in VisitCounter', () => {
  it('VisitCounter increments pmhnp_visit_count behind a per-session guard', () => {
    const src = read('components/VisitCounter.tsx');
    expect(src).toContain("'pmhnp_visit_count'");
    expect(src).toMatch(/sessionStorage\.getItem/);
    expect(src).toMatch(/sessionStorage\.setItem/);
  });
  it('VisitCounter is mounted in the root layout', () => {
    const src = read('app/layout.tsx');
    expect(src).toContain("from '@/components/VisitCounter'");
    expect(src).toContain('<VisitCounter />');
  });
  it('PWAInstallBanner only READS the counter (no increment after its mobile early-return)', () => {
    const src = read('components/PWAInstallBanner.tsx');
    expect(src).toContain("localStorage.getItem('pmhnp_visit_count')");
    expect(src).not.toMatch(/localStorage\.setItem\(\s*'pmhnp_visit_count'/);
  });
});

describe('push prompt: honest copy, no permanent dismiss on transient errors', () => {
  const src = () => read('components/PushNotificationPrompt.tsx');
  it('subscribe-error path only sets the dismiss key on explicit browser denial', () => {
    expect(src()).toMatch(/Notification\.permission === 'denied'/);
  });
  it('no longer promises per-user relevance the cron cannot deliver', () => {
    expect(src()).not.toContain('only notify you about relevant');
    expect(src()).toContain('Get a short daily update of new PMHNP jobs.');
  });
});

describe('BottomNav gives logged-out users Alerts instead of Messages', () => {
  const src = () => read('components/BottomNav.tsx');
  it('has a /job-alerts item with the Bell icon for the unauthenticated slot', () => {
    expect(src()).toContain("href: '/job-alerts'");
    expect(src()).toMatch(/icon:\s*Bell/);
  });
  it('authenticated seekers still get Messages', () => {
    expect(src()).toContain("href: '/messages'");
    expect(src()).toMatch(/isAuthed\s*\?\s*seekerMessagesItem\s*:\s*seekerAlertsItem/);
  });
});

describe('Footer dark-surface text clears WCAG AA on #1c1917', () => {
  it('failing grays #78716c (~3.7:1) and #57534e (~2.3:1) are gone', () => {
    const src = read('components/Footer.tsx');
    expect(src).not.toContain('#78716c');
    expect(src).not.toContain('#57534e');
    expect(src).toContain('#a8a29e');
    expect(src).toContain('#8a8580');
  });
});

describe('mobile filters: touch targets and honest drawer button', () => {
  it('LinkedInFilters checkbox rows use 12px vertical padding (>=44px target)', () => {
    const src = read('components/jobs/LinkedInFilters.tsx');
    expect(src).toContain("padding: '12px 6px'");
    expect(src).not.toContain("padding: '8px 6px'");
  });
  it('drawer button says "Show {n} jobs" (filters apply live), not "Apply Filters"', () => {
    const src = read('components/MobileFilterDrawer.tsx');
    expect(src).not.toContain('Apply Filters');
    expect(src).toMatch(/Show \$\{totalJobs\.toLocaleString\(\)\}/);
    expect(src).toContain('onTotalChange={setTotalJobs}');
  });
});

describe('error pages use plain language and make no false claims', () => {
  it('app/error.tsx: sci-fi copy and the fake "notified" claim are gone', () => {
    const src = read('app/error.tsx');
    expect(src).not.toContain('System Malfunction');
    expect(src).not.toContain('securely notified');
    expect(src).not.toContain('Reinitialize Request');
    expect(src).not.toContain('Abort to Safety');
    expect(src).toContain('Something went wrong');
    expect(src).toContain('Try again');
    expect(src).toContain('Browse jobs');
    expect(src).toContain('href="/jobs"');
    // The boundary still logs locally (allowed) but adds no tracking claim.
    expect(src).toContain('console.error');
  });
  it('app/global-error.tsx mirrors the plain tone', () => {
    const src = read('app/global-error.tsx');
    expect(src).not.toContain('Critical Global Failure');
    expect(src).not.toContain('Restart Engine');
    expect(src).not.toContain('Return Home');
    expect(src).toContain('Something went wrong');
    expect(src).toContain('Browse jobs');
    expect(src).toContain("window.location.href = '/jobs'");
  });
});
