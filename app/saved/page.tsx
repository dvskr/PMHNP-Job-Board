'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import JobCard from '@/components/JobCard';
import JobsListSkeleton from '@/components/JobsListSkeleton';
import { Job } from '@/lib/types';
import { Bookmark, Trash2, FileCheck, Search, ArrowRight, SortAsc, Loader2 } from 'lucide-react';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import useAppliedJobs from '@/lib/hooks/useAppliedJobs';
import useSavedJobs from '@/lib/hooks/useSavedJobs';

type TabType = 'saved' | 'applied';
type SortOption = 'recent' | 'salary' | 'title';

/* ── Clay design tokens (matches dashboard) ── */
const cardBase: React.CSSProperties = {
    background: '#F7FBF8',
    border: '1px solid rgba(213, 232, 224, 0.5)',
    borderRadius: '20px',
    padding: '24px',
    boxShadow: '6px 6px 14px rgba(0, 60, 50, 0.06), -2px -2px 8px rgba(255, 255, 255, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
};

export default function SavedJobsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('saved');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  // Saved jobs hook - single source of truth
  const { savedJobs: savedIds, removeJob, clearAll: clearSavedJobs } = useSavedJobs();

  // Applied jobs hook
  const { appliedJobs, getAppliedDate } = useAppliedJobs();
  const [appliedJobsData, setAppliedJobsData] = useState<Job[]>([]);
  const [appliedLoading, setAppliedLoading] = useState(false);
  const [appliedError, setAppliedError] = useState<string | null>(null);
  const [appliedInitialized, setAppliedInitialized] = useState(false);
  const lastFetchedIds = useRef<string>('');

  const fetchSavedJobs = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setJobs([]);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/jobs?ids=${ids.join(',')}`);
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      const data: { jobs: Job[] } = await response.json();
      setJobs(data.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAppliedJobs = async (ids: string[]) => {
    if (ids.length === 0) {
      setAppliedJobsData([]);
      setAppliedLoading(false);
      return;
    }

    setAppliedLoading(true);
    setAppliedError(null);

    try {
      const response = await fetch(`/api/jobs?ids=${ids.join(',')}`);
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      const data: { jobs: Job[] } = await response.json();
      setAppliedJobsData(data.jobs);
    } catch (err) {
      setAppliedError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setAppliedLoading(false);
    }
  };

  useEffect(() => {
    // Fetch saved jobs whenever savedIds changes
    fetchSavedJobs(savedIds);
  }, [savedIds, fetchSavedJobs]);

  // Fetch applied jobs when tab changes or appliedJobs changes
  useEffect(() => {
    // Create a stable key from the applied job IDs
    const idsKey = appliedJobs.sort().join(',');

    // Only fetch if we're on the applied tab and IDs have actually changed
    if (activeTab === 'applied') {
      if (appliedJobs.length > 0) {
        // Only fetch if IDs changed since last fetch
        if (idsKey !== lastFetchedIds.current) {
          lastFetchedIds.current = idsKey;
          fetchAppliedJobs(appliedJobs);
        }
      } else if (!appliedInitialized) {
        // First render with empty array - wait a bit for localStorage to load
        setAppliedLoading(true);
        const timer = setTimeout(() => {
          setAppliedInitialized(true);
          setAppliedLoading(false);
        }, 100);
        return () => clearTimeout(timer);
      } else {
        setAppliedJobsData([]);
        setAppliedLoading(false);
      }
    }
    return undefined;
  }, [activeTab, appliedJobs, appliedInitialized]);

  const formatAppliedDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleClearAll = () => {
    clearSavedJobs();
    setJobs([]);
  };

  const handleClearApplied = () => {
    if (confirm('Are you sure you want to clear your application history? This cannot be undone.')) {
      localStorage.removeItem('appliedJobs');
      setAppliedJobsData([]);
      // Force a page reload to reset the hook state
      window.location.reload();
    }
  };

  const handleRemoveJob = (jobId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeJob(jobId);
    setJobs(jobs.filter((job: Job) => job.id !== jobId));
  };

  // Sort jobs based on selected option
  const getSortedJobs = (jobsToSort: Job[]): Job[] => {
    const sorted = [...jobsToSort];
    switch (sortBy) {
      case 'salary':
        return sorted.sort((a: Job, b: Job) => (b.maxSalary || b.minSalary || 0) - (a.maxSalary || a.minSalary || 0));
      case 'title':
        return sorted.sort((a: Job, b: Job) => a.title.localeCompare(b.title));
      case 'recent':
      default:
        // Keep original order (order saved)
        return sorted;
    }
  };

  const sortedJobs = getSortedJobs(jobs);

  const currentJobs = activeTab === 'saved' ? sortedJobs : appliedJobsData;
  const currentLoading = activeTab === 'saved' ? loading : appliedLoading;
  const currentError = activeTab === 'saved' ? error : appliedError;
  const currentCount = activeTab === 'saved' ? savedIds.length : appliedJobs.length;

  return (
    <>
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Saved Jobs', url: 'https://pmhnphiring.com/saved' },
      ]} />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 16px 80px' }}>

        {/* ═══ Page Header ═══ */}
        <div style={{ marginBottom: '28px' }}>
            <h1 style={{
                fontSize: '28px', fontWeight: 800,
                fontFamily: 'var(--font-lora), Georgia, serif',
                color: '#1A2E35', margin: '0 0 6px',
                letterSpacing: '-0.5px',
            }}>
                My Jobs
            </h1>
            <p style={{ fontSize: '15px', color: '#8A9BA6', margin: 0 }}>
                Jobs you&apos;ve saved and applications you&apos;ve submitted.
            </p>
        </div>

        {/* ═══ Clay Tab Bar ═══ */}
        <div style={{
            display: 'flex', gap: '8px', marginBottom: '28px',
            background: '#EDF5F0',
            borderRadius: '16px', padding: '6px',
            border: '1px solid #D5E8E0',
            boxShadow: 'inset 2px 2px 6px rgba(0, 60, 50, 0.06), inset -1px -1px 3px rgba(255,255,255,0.5)',
        }}>
            {[
                { key: 'saved' as TabType, label: 'Saved', icon: Bookmark, count: savedIds.length },
                { key: 'applied' as TabType, label: 'Applied', icon: FileCheck, count: appliedJobs.length },
            ].map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            padding: '12px 16px', borderRadius: '12px',
                            fontSize: '14px', fontWeight: isActive ? 700 : 500,
                            color: isActive ? '#1A2E35' : '#6B7F8A',
                            background: isActive ? '#F7FBF8' : 'transparent',
                            border: isActive ? '1px solid rgba(213,232,224,0.5)' : '1px solid transparent',
                            boxShadow: isActive
                                ? '4px 4px 10px rgba(0,60,50,0.06), -2px -2px 6px rgba(255,255,255,0.7), inset 0 1px 0 rgba(255,255,255,0.5)'
                                : 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <TabIcon size={16} style={{ color: isActive ? '#0D9488' : '#8A9BA6' }} />
                        {tab.label}
                        {tab.count > 0 && (
                            <span style={{
                                fontSize: '11px', fontWeight: 700,
                                padding: '2px 8px', borderRadius: '20px',
                                background: isActive ? '#0D9488' : '#D5E8E0',
                                color: isActive ? '#fff' : '#6B7F8A',
                            }}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>

        {/* ═══ Controls Bar (sort + clear) ═══ */}
        {!currentLoading && currentCount > 0 && (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '20px', flexWrap: 'wrap', gap: '12px',
            }}>
                <p style={{ fontSize: '14px', color: '#6B7F8A', margin: 0, fontWeight: 500 }}>
                    {currentCount} {activeTab === 'saved' ? 'saved' : 'applied'} job{currentCount !== 1 ? 's' : ''}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {activeTab === 'saved' && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: '#EDF5F0', borderRadius: '10px', padding: '6px 12px',
                            border: '1px solid #D5E8E0',
                        }}>
                            <SortAsc size={14} style={{ color: '#6B7F8A' }} />
                            <select
                                id="sort-saved"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as SortOption)}
                                style={{
                                    fontSize: '13px', fontWeight: 500,
                                    background: 'transparent', border: 'none',
                                    color: '#1A2E35', cursor: 'pointer',
                                    outline: 'none',
                                }}
                            >
                                <option value="recent">Recently Saved</option>
                                <option value="salary">Highest Salary</option>
                                <option value="title">Title A–Z</option>
                            </select>
                        </div>
                    )}
                    <button
                        onClick={activeTab === 'saved' ? handleClearAll : handleClearApplied}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            fontSize: '13px', fontWeight: 600, color: '#EF4444',
                            background: '#FEF2F2', border: '1px solid #FECACA',
                            borderRadius: '10px', padding: '6px 14px',
                            cursor: 'pointer', transition: 'all 0.2s',
                        }}
                    >
                        <Trash2 size={14} />
                        Clear {activeTab === 'saved' ? 'all' : 'history'}
                    </button>
                </div>
            </div>
        )}

        {/* ═══ Loading State — Skeleton Shimmer ═══ */}
        {currentLoading && (
            <>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '16px',
            }}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} style={{
                        ...cardBase, padding: '20px',
                        overflow: 'hidden', position: 'relative',
                    }}>
                        {/* Avatar + title block */}
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                            <div className="skeleton-shimmer" style={{
                                width: '44px', height: '44px', borderRadius: '12px',
                                background: '#E8F0EB', flexShrink: 0,
                            }} />
                            <div style={{ flex: 1 }}>
                                <div className="skeleton-shimmer" style={{
                                    height: '16px', width: '75%', borderRadius: '8px',
                                    background: '#E8F0EB', marginBottom: '8px',
                                }} />
                                <div className="skeleton-shimmer" style={{
                                    height: '12px', width: '50%', borderRadius: '6px',
                                    background: '#EDF5F0',
                                }} />
                            </div>
                        </div>
                        {/* Badge row */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            <div className="skeleton-shimmer" style={{
                                height: '28px', width: '90px', borderRadius: '8px',
                                background: '#EDF5F0',
                            }} />
                            <div className="skeleton-shimmer" style={{
                                height: '28px', width: '70px', borderRadius: '8px',
                                background: '#EDF5F0',
                            }} />
                            <div className="skeleton-shimmer" style={{
                                height: '28px', width: '60px', borderRadius: '8px',
                                background: '#EDF5F0',
                            }} />
                        </div>
                        {/* Footer row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="skeleton-shimmer" style={{
                                height: '12px', width: '100px', borderRadius: '6px',
                                background: '#EDF5F0',
                            }} />
                            <div className="skeleton-shimmer" style={{
                                height: '32px', width: '90px', borderRadius: '10px',
                                background: '#E8F0EB',
                            }} />
                        </div>
                    </div>
                ))}
            </div>
            <style>{`
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                .skeleton-shimmer {
                    background: linear-gradient(90deg, #EDF5F0 25%, #F7FBF8 50%, #EDF5F0 75%) !important;
                    background-size: 200% 100% !important;
                    animation: shimmer 1.5s ease-in-out infinite !important;
                }
            `}</style>
            </>
        )}

        {/* ═══ Error State ═══ */}
        {currentError && (
            <div style={{
                ...cardBase, textAlign: 'center', padding: '40px 24px',
                borderColor: '#FECACA', background: '#FEF7F7',
            }}>
                <p style={{ color: '#EF4444', fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>
                    {currentError}
                </p>
                <p style={{ color: '#6B7F8A', fontSize: '13px' }}>
                    Please try refreshing the page.
                </p>
            </div>
        )}

        {/* ═══ Empty State — Saved ═══ */}
        {!currentLoading && !currentError && activeTab === 'saved' && jobs.length === 0 && (
            <div style={{
                ...cardBase,
                textAlign: 'center', padding: '60px 24px',
            }}>
                <img src="/images/spot-saved.png" alt="" style={{ width: '120px', height: '120px', objectFit: 'contain', marginBottom: '16px', marginInline: 'auto', display: 'block' }} />
                <h2 style={{
                    fontSize: '18px', fontWeight: 700,
                    fontFamily: 'var(--font-lora), Georgia, serif',
                    color: '#1A2E35', marginBottom: '8px',
                }}>
                    No saved jobs yet
                </h2>
                <p style={{
                    color: '#8A9BA6', fontSize: '14px', marginBottom: '24px',
                    maxWidth: '340px', marginInline: 'auto', lineHeight: 1.6,
                }}>
                    Bookmark jobs you&apos;re interested in — they&apos;ll show up here.
                </p>
                <Link href="/jobs" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '10px 20px', borderRadius: '12px',
                    background: 'linear-gradient(145deg, #10B981, #0D9488)',
                    color: '#fff', fontSize: '13px', fontWeight: 600,
                    textDecoration: 'none',
                    boxShadow: '4px 4px 10px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                }}>
                    Browse Jobs
                    <ArrowRight size={14} />
                </Link>
            </div>
        )}

        {/* ═══ Empty State — Applied ═══ */}
        {!currentLoading && !currentError && activeTab === 'applied' && appliedJobs.length === 0 && (
            <div style={{
                ...cardBase,
                textAlign: 'center', padding: '60px 24px',
            }}>
                <img src="/images/spot-applied.png" alt="" style={{ width: '120px', height: '120px', objectFit: 'contain', marginBottom: '16px', marginInline: 'auto', display: 'block' }} />
                <h2 style={{
                    fontSize: '18px', fontWeight: 700,
                    fontFamily: 'var(--font-lora), Georgia, serif',
                    color: '#1A2E35', marginBottom: '8px',
                }}>
                    No applications yet
                </h2>
                <p style={{
                    color: '#8A9BA6', fontSize: '14px', marginBottom: '24px',
                    maxWidth: '340px', marginInline: 'auto', lineHeight: 1.6,
                }}>
                    Apply to jobs through the platform and track your progress here.
                </p>
                <Link href="/jobs" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '10px 20px', borderRadius: '12px',
                    background: 'linear-gradient(145deg, #10B981, #0D9488)',
                    color: '#fff', fontSize: '13px', fontWeight: 600,
                    textDecoration: 'none',
                    boxShadow: '4px 4px 10px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                }}>
                    Find Jobs
                    <ArrowRight size={14} />
                </Link>
            </div>
        )}

        {/* ═══ Saved Jobs Grid ═══ */}
        {!loading && !error && activeTab === 'saved' && sortedJobs.length > 0 && (
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '16px',
            }}>
                {sortedJobs.map((job: Job) => (
                    <div key={job.id} className="saved-job-wrapper" style={{ display: 'flex', flexDirection: 'column' }}>
                        <JobCard job={job} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', paddingRight: '4px' }}>
                            <button
                                onClick={(e) => handleRemoveJob(job.id, e)}
                                className="clay-remove-btn"
                                title="Remove from saved"
                                style={{
                                    width: '32px', height: '32px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: '10px',
                                    background: '#F7FBF8', border: '1px solid rgba(213,232,224,0.5)',
                                    boxShadow: '3px 3px 8px rgba(0,60,50,0.06), -1px -1px 4px rgba(255,255,255,0.7)',
                                    cursor: 'pointer', opacity: 0, transition: 'all 0.2s',
                                    color: '#EF4444',
                                }}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {/* ═══ Applied Jobs Grid ═══ */}
        {!appliedLoading && !appliedError && activeTab === 'applied' && appliedJobsData.length > 0 && (
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '16px',
            }}>
                {appliedJobsData.map((job: Job) => {
                    const appliedDate = getAppliedDate(job.id);
                    return (
                        <div key={job.id} style={{ display: 'flex', flexDirection: 'column' }}>
                            <JobCard job={job} />
                            {appliedDate && (
                                <div style={{
                                    fontSize: '12px', color: '#0D9488', fontWeight: 600,
                                    marginTop: '8px', marginLeft: '4px',
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                }}>
                                    <FileCheck size={12} />
                                    Applied on {formatAppliedDate(appliedDate)}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        )}

      </div>

      {/* ═══ Hover styles ═══ */}
      <style>{`
          .saved-job-wrapper:hover .clay-remove-btn {
              opacity: 1 !important;
          }
          .clay-remove-btn:hover {
              background: #FEF2F2 !important;
              border-color: #FECACA !important;
              transform: scale(1.05);
          }
      `}</style>
    </>
  );
}
