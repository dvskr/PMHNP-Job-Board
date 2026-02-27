'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search, Filter, ChevronLeft, ChevronRight, Eye, MousePointerClick,
  FileCheck, MoreHorizontal, Trash2, Star, StarOff, Globe, GlobeLock,
  RefreshCw, X, Check, Pencil, Plus,
} from 'lucide-react';

/* ─── Types ─── */
interface AdminJob {
  id: string; title: string; slug: string | null; employer: string;
  location: string; city: string | null; state: string | null;
  jobType: string | null; mode: string | null;
  displaySalary: string | null; sourceProvider: string | null;
  isPublished: boolean; isFeatured: boolean; isVerifiedEmployer: boolean;
  viewCount: number; applyClickCount: number; applications: number;
  qualityScore: number; createdAt: string; updatedAt: string;
  expiresAt: string | null; applyLink: string;
}
interface SourceOption { source: string; count: number }

/* ─── Shared styles ─── */
const s = {
  card: {
    backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
    borderRadius: '14px', overflow: 'hidden' as const,
  },
  heading: { color: 'var(--text-primary)', fontWeight: 700 as const },
  sub: { color: 'var(--text-secondary)', fontSize: '14px' },
  muted: { color: 'var(--text-tertiary)', fontSize: '12px' },
  th: {
    padding: '12px 14px', textAlign: 'left' as const, fontSize: '11px',
    fontWeight: 600 as const, textTransform: 'uppercase' as const,
    letterSpacing: '0.05em', color: 'var(--text-tertiary)',
    backgroundColor: 'var(--bg-tertiary)', whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '12px 14px', fontSize: '13px', color: 'var(--text-secondary)',
    borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' as const,
  },
  tdBold: {
    padding: '12px 14px', fontSize: '13px', color: 'var(--text-primary)',
    fontWeight: 600 as const, borderBottom: '1px solid var(--border-color)',
  },
};

const inputStyle: React.CSSProperties = {
  padding: '9px 14px', borderRadius: '10px', fontSize: '13px',
  backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
  color: 'var(--text-primary)', outline: 'none',
};

function badge(text: string, color: string, bg: string) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '20px', fontSize: '11px',
      fontWeight: 600, backgroundColor: bg, color, whiteSpace: 'nowrap',
    }}>{text}</span>
  );
}

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [publishedFilter, setPublishedFilter] = useState('');
  const [featuredFilter, setFeaturedFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Edit modal
  const [editingJob, setEditingJob] = useState<AdminJob | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editLoading, setEditLoading] = useState(false);

  // Action feedback
  const [actionMsg, setActionMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '25');
      params.set('sort', sortBy);
      if (search) params.set('search', search);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      if (publishedFilter) params.set('published', publishedFilter);
      if (featuredFilter) params.set('featured', featuredFilter);

      const res = await fetch(`/api/admin/jobs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        if (data.sources) setSources(data.sources);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, sourceFilter, publishedFilter, featuredFilter, sortBy]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timeout = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  // Toggle helpers
  const toggleField = async (jobId: string, field: string, value: boolean) => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, [field]: value } : j));
        showMsg(`${field === 'isPublished' ? (value ? 'Published' : 'Unpublished') : (value ? 'Featured' : 'Unfeatured')}`, false);
      }
    } catch { showMsg('Failed to update', true); }
  };

  const deleteJob = async (jobId: string, hard = false) => {
    if (!confirm(hard ? 'Permanently delete this job? This cannot be undone.' : 'Unpublish this job?')) return;
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}?hard=${hard}`, { method: 'DELETE' });
      if (res.ok) {
        if (hard) setJobs(prev => prev.filter(j => j.id !== jobId));
        else setJobs(prev => prev.map(j => j.id === jobId ? { ...j, isPublished: false } : j));
        showMsg(hard ? 'Job permanently deleted' : 'Job unpublished', false);
      }
    } catch { showMsg('Failed to delete', true); }
  };

  // Bulk actions
  const handleBulk = async (action: string) => {
    if (selected.size === 0) return;
    const label = action === 'hard_delete' ? 'permanently delete' : action;
    if (action.includes('delete') && !confirm(`${label} ${selected.size} job(s)?`)) return;

    try {
      setBulkLoading(true);
      const res = await fetch('/api/admin/jobs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, jobIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg(`${data.action}: ${data.affected} job(s)`, false);
        setSelected(new Set());
        fetchJobs();
      }
    } catch { showMsg('Bulk action failed', true); }
    finally { setBulkLoading(false); }
  };

  // Edit modal
  const openEdit = (job: AdminJob) => {
    setEditingJob(job);
    setEditForm({
      title: job.title,
      employer: job.employer,
      location: job.location,
      displaySalary: job.displaySalary || '',
      jobType: job.jobType || '',
      mode: job.mode || '',
      applyLink: job.applyLink,
    });
  };

  const saveEdit = async () => {
    if (!editingJob) return;
    try {
      setEditLoading(true);
      const res = await fetch(`/api/admin/jobs/${editingJob.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        showMsg('Job updated', false);
        setEditingJob(null);
        fetchJobs();
      }
    } catch { showMsg('Failed to update', true); }
    finally { setEditLoading(false); }
  };

  const showMsg = (text: string, isError: boolean) => {
    setActionMsg({ text, isError });
    setTimeout(() => setActionMsg(null), 3000);
  };

  const selectAll = () => {
    if (selected.size === jobs.length) setSelected(new Set());
    else setSelected(new Set(jobs.map(j => j.id)));
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ ...s.heading, fontSize: '26px' }}>Jobs Management</h1>
          <p style={s.muted}>{total.toLocaleString()} total jobs</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={fetchJobs} style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div style={{
          marginBottom: '16px', padding: '12px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
          backgroundColor: actionMsg.isError ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
          color: actionMsg.isError ? '#F87171' : '#22C55E',
        }}>{actionMsg.text}</div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder="Search title or employer..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{ ...inputStyle, width: '100%', paddingLeft: '36px' }}
          />
        </div>
        <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="all">All Sources</option>
          {sources.map(s => (
            <option key={s.source} value={s.source}>{s.source} ({s.count})</option>
          ))}
        </select>
        <select value={publishedFilter} onChange={e => { setPublishedFilter(e.target.value); setPage(1); }} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">All Status</option>
          <option value="true">Published</option>
          <option value="false">Unpublished</option>
        </select>
        <select value={featuredFilter} onChange={e => { setFeaturedFilter(e.target.value); setPage(1); }} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">All Featured</option>
          <option value="true">Featured</option>
          <option value="false">Not Featured</option>
        </select>
        <select value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="views">Most Views</option>
          <option value="clicks">Most Clicks</option>
          <option value="title">Title A-Z</option>
        </select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px',
          padding: '12px 18px', borderRadius: '10px',
          backgroundColor: 'rgba(45, 212, 191, 0.08)', border: '1px solid rgba(45, 212, 191, 0.2)',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#2DD4BF' }}>{selected.size} selected</span>
          {[
            { label: 'Publish', action: 'publish', color: '#22C55E' },
            { label: 'Unpublish', action: 'unpublish', color: '#F59E0B' },
            { label: 'Feature', action: 'feature', color: '#A855F7' },
            { label: 'Unfeature', action: 'unfeature', color: '#94A3B8' },
            { label: 'Delete', action: 'delete', color: '#EF4444' },
          ].map(b => (
            <button key={b.action} onClick={() => handleBulk(b.action)} disabled={bulkLoading}
              style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, backgroundColor: `${b.color}15`, color: b.color }}>
              {b.label}
            </button>
          ))}
          <button onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Jobs Table */}
      <div style={s.card}>
        {loading && jobs.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, border: '3px solid var(--border-color)', borderTop: '3px solid #2DD4BF', borderRadius: '50%', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ ...s.sub, marginTop: '12px' }}>Loading jobs…</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: '36px' }}>
                    <input type="checkbox" checked={selected.size === jobs.length && jobs.length > 0} onChange={selectAll} style={{ cursor: 'pointer' }} />
                  </th>
                  <th style={s.th}>Title</th>
                  <th style={s.th}>Employer</th>
                  <th style={s.th}>Source</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Status</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Featured</th>
                  <th style={{ ...s.th, textAlign: 'right' }}><Eye size={13} /></th>
                  <th style={{ ...s.th, textAlign: 'right' }}><MousePointerClick size={13} /></th>
                  <th style={{ ...s.th, textAlign: 'right' }}><FileCheck size={13} /></th>
                  <th style={s.th}>Created</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id} style={{ backgroundColor: selected.has(job.id) ? 'rgba(45,212,191,0.04)' : undefined }}>
                    <td style={s.td}>
                      <input type="checkbox" checked={selected.has(job.id)} onChange={() => toggleSelect(job.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ ...s.tdBold, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={job.title}>
                      {job.title}
                    </td>
                    <td style={s.td}>{job.employer}</td>
                    <td style={s.td}>
                      <span style={{ textTransform: 'capitalize' }}>{job.sourceProvider || '—'}</span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <button onClick={() => toggleField(job.id, 'isPublished', !job.isPublished)}
                        title={job.isPublished ? 'Click to unpublish' : 'Click to publish'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                        {job.isPublished
                          ? <Globe size={16} style={{ color: '#22C55E' }} />
                          : <GlobeLock size={16} style={{ color: '#94A3B8' }} />}
                      </button>
                    </td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <button onClick={() => toggleField(job.id, 'isFeatured', !job.isFeatured)}
                        title={job.isFeatured ? 'Click to unfeature' : 'Click to feature'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                        {job.isFeatured
                          ? <Star size={16} style={{ color: '#F59E0B', fill: '#F59E0B' }} />
                          : <StarOff size={16} style={{ color: '#94A3B8' }} />}
                      </button>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{job.viewCount.toLocaleString()}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{job.applyClickCount.toLocaleString()}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{job.applications}</td>
                    <td style={s.td}>
                      {new Date(job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                    </td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button onClick={() => openEdit(job)} title="Edit"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#3B82F6' }}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => deleteJob(job.id)} title="Unpublish"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#EF4444' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr><td colSpan={11} style={{ ...s.td, textAlign: 'center', padding: '40px' }}>No jobs found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', borderTop: '1px solid var(--border-color)',
          }}>
            <span style={s.muted}>Page {page} of {totalPages} · {total.toLocaleString()} jobs</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ ...inputStyle, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ChevronLeft size={14} /> Prev
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ ...inputStyle, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingJob && (
        <>
          <div onClick={() => setEditingJob(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 51, width: '90%', maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto',
            backgroundColor: 'var(--bg-secondary)', borderRadius: '16px',
            border: '1px solid var(--border-color)', padding: '28px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ ...s.heading, fontSize: '20px' }}>Edit Job</h2>
              <button onClick={() => setEditingJob(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { key: 'title', label: 'Title' },
                { key: 'employer', label: 'Employer' },
                { key: 'location', label: 'Location' },
                { key: 'displaySalary', label: 'Salary Display' },
                { key: 'jobType', label: 'Job Type' },
                { key: 'mode', label: 'Mode (remote/onsite/hybrid)' },
                { key: 'applyLink', label: 'Apply Link' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', ...s.muted, fontWeight: 600, marginBottom: '6px' }}>{f.label}</label>
                  <input
                    type="text"
                    value={editForm[f.key] || ''}
                    onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingJob(null)}
                style={{ padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px' }}>
                Cancel
              </button>
              <button onClick={saveEdit} disabled={editLoading}
                style={{ padding: '10px 24px', borderRadius: '10px', cursor: 'pointer', backgroundColor: '#2DD4BF', color: '#0F172A', border: 'none', fontWeight: 700, fontSize: '13px', opacity: editLoading ? 0.5 : 1 }}>
                {editLoading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
