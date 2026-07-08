'use client';

import { useState, useEffect } from 'react';
import { trackJobSave, trackJobUnsave, buildJobItem } from '@/lib/analytics';
// Save/unsave goes through useSavedJobs so authenticated users get server
// persistence (POST/DELETE /api/saved-jobs) in addition to localStorage.
// The previous version wrote localStorage only, so a save made on the job
// detail page never reached the account and silently vanished on another
// device. The hook shares one module-level store with every JobCard
// bookmark, so all save UIs stay in sync on the same page too.
import useSavedJobs from '@/lib/hooks/useSavedJobs';

interface SaveJobButtonProps {
  jobId: string;
  /**
   * 'default' — labeled pill button (sidebar).
   * 'icon' — compact 52px square bookmark for the mobile sticky bar,
   * sized to match the Apply button height so the bar stays one row.
   */
  variant?: 'default' | 'icon';
}

export default function SaveJobButton({ jobId, variant = 'default' }: SaveJobButtonProps) {
  const { isSaved: isJobSaved, saveJob, removeJob } = useSavedJobs();

  // Mount-guard so SSR markup (unsaved) matches the first client paint;
  // the real saved state appears right after hydration. Same rationale as
  // the S5 hydration guards in JobCard.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const isSaved = mounted && isJobSaved(jobId);

  const toggleSave = () => {
    if (isSaved) {
      removeJob(jobId);
      trackJobUnsave(buildJobItem({ id: jobId, title: '' }));
    } else {
      saveJob(jobId);
      trackJobSave(buildJobItem({ id: jobId, title: '' }));
    }
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={toggleSave}
        aria-label={isSaved ? 'Remove saved job' : 'Save job'}
        aria-pressed={isSaved}
        data-icon-btn
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '52px', height: '52px', flexShrink: 0,
          borderRadius: '16px',
          backgroundColor: isSaved ? '#B2F5EA' : '#EDF2EE',
          color: isSaved ? '#0F766E' : '#374151',
          border: '1px solid rgba(255,255,255,0.5)',
          boxShadow: isSaved
            ? '5px 5px 12px rgba(13,148,136,0.18), -3px -3px 8px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.5), inset -1px -1px 2px rgba(0,0,0,0.04)'
            : '5px 5px 12px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.03)',
          cursor: 'pointer', transition: 'all 0.2s',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill={isSaved ? '#0F766E' : 'none'} stroke={isSaved ? '#0F766E' : 'currentColor'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={toggleSave}
      aria-label={isSaved ? 'Remove saved job' : 'Save job'}
      aria-pressed={isSaved}
      data-icon-btn
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        padding: '10px 18px',
        borderRadius: '16px',
        fontSize: '14px', fontWeight: 600,
        backgroundColor: isSaved ? '#B2F5EA' : '#EDF2EE',
        color: isSaved ? '#0F766E' : '#374151',
        border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: isSaved
          ? '5px 5px 12px rgba(13,148,136,0.18), -3px -3px 8px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.5), inset -1px -1px 2px rgba(0,0,0,0.04)'
          : '5px 5px 12px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.03)',
        cursor: 'pointer', transition: 'all 0.2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '7px 7px 16px rgba(0,0,0,0.10), -4px -4px 10px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = isSaved
          ? '5px 5px 12px rgba(13,148,136,0.18), -3px -3px 8px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.5), inset -1px -1px 2px rgba(0,0,0,0.04)'
          : '5px 5px 12px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.03)';
      }}
    >
      {/* Clay icon pebble */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 10,
        backgroundColor: isSaved ? '#CCFBF1' : '#DDE8DF',
        boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.04), 2px 2px 4px rgba(0,0,0,0.06)',
        border: '1px solid rgba(255,255,255,0.6)',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={isSaved ? '#0F766E' : 'none'} stroke={isSaved ? '#0F766E' : 'currentColor'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
        </svg>
      </span>
      {isSaved ? 'Saved' : 'Save'}
    </button>
  );
}
