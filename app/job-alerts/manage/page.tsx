'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bell, Plus, Trash2, Pause, Play, Clock, Calendar, MapPin, Briefcase, ChevronDown, ChevronUp, Loader2, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */
interface JobAlert {
  id: string;
  token: string;
  email: string;
  name: string | null;
  keyword: string | null;
  location: string | null;
  mode: string | null;
  jobType: string | null;
  minSalary: number | null;
  maxSalary: number | null;
  frequency: string;
  isActive: boolean;
  lastSentAt: string | null;
  createdAt: string;
}

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */
const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming'
];
const WORK_MODES = ['Remote', 'Hybrid', 'In-Person'];
const JOB_TYPES = ['Full-Time', 'Part-Time', 'Contract', 'Per Diem'];

/* ═══════════════════════════════════════════
   CLAY DESIGN TOKENS
   ═══════════════════════════════════════════ */
const cardBase: React.CSSProperties = {
  background: '#F7FBF8',
  borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)',
};

const cardRecessed: React.CSSProperties = {
  background: '#EDF5F0',
  borderRadius: '14px',
  border: '1px solid #D5E8E0',
  boxShadow: 'inset 2px 2px 6px rgba(0,60,50,0.06), inset -1px -1px 3px rgba(255,255,255,0.5)',
};

const clayInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: '13px',
  borderRadius: '12px',
  border: '1px solid #D5E8E0',
  background: '#EDF5F0',
  color: '#1A2E35',
  boxShadow: 'inset 2px 2px 6px rgba(0,60,50,0.06), inset -1px -1px 3px rgba(255,255,255,0.4)',
  outline: 'none',
  transition: 'all 0.2s',
};

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */
function buildCriteriaSummary(alert: JobAlert): string {
  const parts: string[] = [];
  if (alert.keyword) parts.push(`"${alert.keyword}"`);
  if (alert.mode) parts.push(alert.mode);
  if (alert.jobType) parts.push(alert.jobType);
  if (alert.location) parts.push(`in ${alert.location}`);
  if (alert.minSalary || alert.maxSalary) {
    if (alert.minSalary && alert.maxSalary) {
      parts.push(`$${(alert.minSalary / 1000).toFixed(0)}k-$${(alert.maxSalary / 1000).toFixed(0)}k`);
    } else if (alert.minSalary) {
      parts.push(`$${(alert.minSalary / 1000).toFixed(0)}k+`);
    } else if (alert.maxSalary) {
      parts.push(`up to $${(alert.maxSalary / 1000).toFixed(0)}k`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : 'All PMHNP jobs';
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/* ═══════════════════════════════════════════
   MAIN CONTENT
   ═══════════════════════════════════════════ */
function ManageAlertsContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const emailParam = searchParams.get('email');

  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [newMode, setNewMode] = useState('');
  const [newJobType, setNewJobType] = useState('');
  const [newFrequency, setNewFrequency] = useState('daily');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ type: 'success' | 'error' | ''; text: string }>({ type: '', text: '' });

  useEffect(() => {
    async function fetchAlerts() {
      try {
        setLoading(true);
        setError(null);

        let response;
        let resolvedEmail = emailParam || '';

        if (token) {
          response = await fetch(`/api/job-alerts?token=${encodeURIComponent(token)}`);
        } else if (emailParam) {
          response = await fetch(`/api/job-alerts/by-email?email=${encodeURIComponent(emailParam)}`);
          resolvedEmail = emailParam;
        } else {
          // Auto-detect from logged-in user
          try {
            const meRes = await fetch('/api/auth/me');
            if (meRes.ok) {
              const meData = await meRes.json();
              if (meData?.email) {
                resolvedEmail = meData.email;
                response = await fetch(`/api/job-alerts/by-email?email=${encodeURIComponent(meData.email)}`);
              }
            }
          } catch {
            // Not logged in
          }
          if (!response) {
            setError('Please sign in to manage your alerts.');
            setLoading(false);
            return;
          }
        }

        setUserEmail(resolvedEmail);
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to fetch alerts');
        }

        if (data.alert) {
          setAlerts([data.alert]);
          if (data.alert.email) setUserEmail(data.alert.email);
        } else if (data.alerts) {
          setAlerts(data.alerts);
          if (data.alerts.length > 0 && data.alerts[0].email) setUserEmail(data.alerts[0].email);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    }
    fetchAlerts();
  }, [token, emailParam]);

  const handleToggleActive = async (alert: JobAlert) => {
    setActionLoading(alert.id);
    try {
      const response = await fetch(`/api/job-alerts/${alert.token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !alert.isActive }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed');
      setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, isActive: !a.isActive } : a));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeFrequency = async (alert: JobAlert, newFreq: string) => {
    setActionLoading(alert.id);
    try {
      const response = await fetch(`/api/job-alerts/${alert.token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequency: newFreq }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed');
      setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, frequency: newFreq } : a));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (alert: JobAlert) => {
    setActionLoading(alert.id);
    try {
      const response = await fetch(`/api/job-alerts?token=${encodeURIComponent(alert.token)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed');
      setAlerts(prev => prev.filter(a => a.id !== alert.id));
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail) return;
    setCreating(true);
    setCreateMsg({ type: '', text: '' });

    try {
      const response = await fetch('/api/job-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          location: newLocation || undefined,
          mode: newMode || undefined,
          jobType: newJobType || undefined,
          frequency: newFrequency,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setCreateMsg({ type: 'success', text: 'Alert created!' });
        // Add to list immediately
        if (data.alert) {
          setAlerts(prev => [data.alert, ...prev]);
        } else {
          // Refetch
          const refetch = await fetch(`/api/job-alerts/by-email?email=${encodeURIComponent(userEmail)}`);
          const refetchData = await refetch.json();
          if (refetchData.alerts) setAlerts(refetchData.alerts);
        }
        // Reset form
        setNewLocation('');
        setNewMode('');
        setNewJobType('');
        setNewFrequency('daily');
        setShowCreate(false);
        setTimeout(() => setCreateMsg({ type: '', text: '' }), 3000);
      } else {
        setCreateMsg({ type: 'error', text: data.error || 'Failed to create alert.' });
      }
    } catch {
      setCreateMsg({ type: 'error', text: 'Network error.' });
    } finally {
      setCreating(false);
    }
  };

  const activeCount = alerts.filter(a => a.isActive).length;

  return (
    <div style={{ minHeight: '100vh', background: '#F0F5F2' }}>
      {/* ═══ Header ═══ */}
      <div style={{
        padding: '28px 16px 20px',
        background: 'linear-gradient(180deg, #E8F5EE 0%, #F0F5F2 100%)',
        borderBottom: '1px solid #D5E8E0',
      }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '46px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '14px', background: '#DCFCE7', color: '#0D9488', flexShrink: 0,
                border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '4px 4px 10px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 3px rgba(255,255,255,0.6)',
              }}>
                <Bell size={22} />
              </div>
              <div>
                <h1 style={{
                  fontSize: '22px', fontWeight: 800,
                  fontFamily: 'var(--font-lora), Georgia, serif',
                  color: '#1A2E35', margin: '0 0 2px',
                }}>Manage Job Alerts</h1>
                <p style={{ fontSize: '13px', color: '#6B7F8A', margin: 0 }}>
                  {activeCount} active alert{activeCount !== 1 ? 's' : ''}
                  {userEmail && <span> · {userEmail}</span>}
                </p>
              </div>
            </div>
            {/* Create New button */}
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="clay-create-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '9px 16px', borderRadius: '12px',
                background: 'linear-gradient(145deg, #10B981, #0D9488)',
                color: '#fff', fontSize: '13px', fontWeight: 600,
                border: 'none', cursor: 'pointer',
                boxShadow: '4px 4px 10px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                transition: 'all 0.2s',
              }}
            >
              {showCreate ? <ChevronUp size={14} /> : <Plus size={14} />}
              {showCreate ? 'Cancel' : 'New Alert'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* ═══ Create Form (collapsible) ═══ */}
        {showCreate && (
          <div style={{ ...cardBase, padding: '20px', marginBottom: '16px' }}>
            <h3 style={{
              fontSize: '15px', fontWeight: 700,
              fontFamily: 'var(--font-lora), Georgia, serif',
              color: '#1A2E35', marginBottom: '16px',
            }}>Create New Alert</h3>

            <form onSubmit={handleCreate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {/* Location */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B7F8A', marginBottom: '5px' }}>
                    <MapPin size={10} style={{ display: 'inline', marginRight: '3px' }} />Location
                  </label>
                  <select value={newLocation} onChange={e => setNewLocation(e.target.value)} style={clayInput}>
                    <option value="">Any Location</option>
                    <optgroup label="Work Arrangement">
                      <option value="Remote">Remote Only</option>
                    </optgroup>
                    <optgroup label="US States">
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </optgroup>
                  </select>
                </div>

                {/* Work Mode */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B7F8A', marginBottom: '5px' }}>
                    Work Mode
                  </label>
                  <select value={newMode} onChange={e => setNewMode(e.target.value)} style={clayInput}>
                    <option value="">Any Mode</option>
                    {WORK_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                {/* Job Type */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B7F8A', marginBottom: '5px' }}>
                    <Briefcase size={10} style={{ display: 'inline', marginRight: '3px' }} />Job Type
                  </label>
                  <select value={newJobType} onChange={e => setNewJobType(e.target.value)} style={clayInput}>
                    <option value="">Any Type</option>
                    {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Frequency */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B7F8A', marginBottom: '5px' }}>
                    <Clock size={10} style={{ display: 'inline', marginRight: '3px' }} />Frequency
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {['daily', 'weekly'].map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setNewFrequency(f)}
                        style={{
                          flex: 1, padding: '9px', borderRadius: '10px',
                          fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                          transition: 'all 0.15s',
                          background: newFrequency === f ? '#0D9488' : '#EDF5F0',
                          color: newFrequency === f ? '#fff' : '#6B7F8A',
                          border: `1px solid ${newFrequency === f ? 'rgba(255,255,255,0.3)' : '#D5E8E0'}`,
                          boxShadow: newFrequency === f
                            ? '3px 3px 8px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)'
                            : 'inset 2px 2px 5px rgba(0,60,50,0.05)',
                        }}
                      >
                        {f === 'daily' ? '📬 Daily' : '📅 Weekly'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={creating}
                className="clay-create-btn"
                style={{
                  marginTop: '14px', width: '100%', padding: '10px',
                  borderRadius: '12px', border: 'none',
                  background: 'linear-gradient(145deg, #10B981, #0D9488)',
                  color: '#fff', fontSize: '13px', fontWeight: 700,
                  cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: '4px 4px 10px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                  transition: 'all 0.2s',
                }}
              >
                {creating ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : <><Bell size={14} /> Create Alert</>}
              </button>
            </form>
          </div>
        )}

        {/* ═══ Messages ═══ */}
        {createMsg.type === 'success' && (
          <div style={{ ...cardRecessed, background: '#D1FAE5', border: '1px solid #A7F3D0', padding: '12px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={16} style={{ color: '#059669' }} />
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#059669', margin: 0 }}>{createMsg.text}</p>
          </div>
        )}
        {createMsg.type === 'error' && (
          <div style={{ ...cardRecessed, background: '#FEE2E2', border: '1px solid #FECACA', padding: '12px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} style={{ color: '#DC2626' }} />
            <p style={{ fontSize: '13px', color: '#DC2626', margin: 0 }}>{createMsg.text}</p>
          </div>
        )}
        {error && (
          <div style={{ ...cardRecessed, background: '#FEE2E2', border: '1px solid #FECACA', padding: '12px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} style={{ color: '#DC2626' }} />
            <p style={{ fontSize: '13px', color: '#DC2626', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* ═══ Loading Skeleton ═══ */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[1, 2].map(i => (
              <div key={i} style={{ ...cardBase, padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div className="skel-shimmer" style={{ height: '14px', width: '40%', borderRadius: '6px', background: '#E8F0EB', marginBottom: '8px' }} />
                    <div className="skel-shimmer" style={{ height: '12px', width: '55%', borderRadius: '6px', background: '#EDF5F0', marginBottom: '12px' }} />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div className="skel-shimmer" style={{ height: '24px', width: '80px', borderRadius: '12px', background: '#EDF5F0' }} />
                      <div className="skel-shimmer" style={{ height: '24px', width: '100px', borderRadius: '12px', background: '#EDF5F0' }} />
                    </div>
                  </div>
                  <div className="skel-shimmer" style={{ height: '26px', width: '60px', borderRadius: '14px', background: '#E8F0EB' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ Empty State ═══ */}
        {!loading && alerts.length === 0 && !error && (
          <div style={{ ...cardBase, padding: '48px 24px', textAlign: 'center' }}>
            <img src="/images/spot-alerts-empty.png" alt="" style={{ width: '120px', height: '120px', objectFit: 'contain', marginInline: 'auto', display: 'block', marginBottom: '16px' }} />
            <h2 style={{
              fontSize: '18px', fontWeight: 700,
              fontFamily: 'var(--font-lora), Georgia, serif',
              color: '#1A2E35', marginBottom: '6px',
            }}>No alerts yet</h2>
            <p style={{ fontSize: '13px', color: '#8A9BA6', marginBottom: '20px', maxWidth: '300px', marginInline: 'auto' }}>
              Create your first alert and never miss a new PMHNP position.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="clay-create-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 20px', borderRadius: '12px',
                background: 'linear-gradient(145deg, #10B981, #0D9488)',
                color: '#fff', fontSize: '13px', fontWeight: 600,
                border: 'none', cursor: 'pointer',
                boxShadow: '4px 4px 10px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              <Plus size={14} /> Create First Alert
            </button>
          </div>
        )}

        {/* ═══ Alerts List ═══ */}
        {!loading && alerts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {alerts.map(alert => {
              const isWithdrawn = !alert.isActive;
              return (
                <div
                  key={alert.id}
                  className="alert-card"
                  style={{
                    ...cardBase, padding: '18px 20px',
                    opacity: isWithdrawn ? 0.6 : 1,
                    transition: 'all 0.2s',
                  }}
                >
                  {/* Top: Name + Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {alert.name && (
                        <h3 style={{
                          fontSize: '15px', fontWeight: 700,
                          fontFamily: 'var(--font-lora), Georgia, serif',
                          color: '#1A2E35', margin: '0 0 3px',
                        }}>{alert.name}</h3>
                      )}
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#2A4A5A', margin: 0 }}>
                        {buildCriteriaSummary(alert)}
                      </p>
                    </div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '4px 12px', borderRadius: '20px',
                      fontSize: '11px', fontWeight: 700, flexShrink: 0,
                      background: alert.isActive ? '#D1FAE5' : '#EDF2EE',
                      color: alert.isActive ? '#059669' : '#8A9BA6',
                      border: '1px solid rgba(255,255,255,0.5)',
                      boxShadow: '2px 2px 6px rgba(0,0,0,0.04), -1px -1px 4px rgba(255,255,255,0.7)',
                    }}>
                      {alert.isActive ? '● Active' : '⏸ Paused'}
                    </span>
                  </div>

                  {/* Meta */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                    <span style={{ ...cardRecessed, padding: '3px 10px', fontSize: '11px', fontWeight: 600, color: '#6B7F8A', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={10} />
                      {alert.frequency === 'daily' ? 'Daily' : 'Weekly'}
                    </span>
                    <span style={{ ...cardRecessed, padding: '3px 10px', fontSize: '11px', fontWeight: 600, color: '#6B7F8A', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={10} />
                      Created {formatDate(alert.createdAt)}
                    </span>
                    {alert.lastSentAt && (
                      <span style={{ ...cardRecessed, padding: '3px 10px', fontSize: '11px', fontWeight: 600, color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        ✓ Last sent {formatDate(alert.lastSentAt)}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                    {/* Frequency toggle */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {['daily', 'weekly'].map(f => (
                        <button
                          key={f}
                          onClick={() => handleChangeFrequency(alert, f)}
                          disabled={actionLoading === alert.id}
                          style={{
                            padding: '5px 12px', borderRadius: '8px',
                            fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                            background: alert.frequency === f ? '#0D9488' : '#EDF5F0',
                            color: alert.frequency === f ? '#fff' : '#8A9BA6',
                            border: `1px solid ${alert.frequency === f ? 'rgba(255,255,255,0.3)' : '#D5E8E0'}`,
                            boxShadow: alert.frequency === f
                              ? '2px 2px 6px rgba(13,148,136,0.15)'
                              : 'inset 1px 1px 3px rgba(0,60,50,0.04)',
                            transition: 'all 0.15s',
                          }}
                        >
                          {f === 'daily' ? 'Daily' : 'Weekly'}
                        </button>
                      ))}
                    </div>

                    {/* Pause / Delete */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleToggleActive(alert)}
                        disabled={actionLoading === alert.id}
                        className="alert-action-btn"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                          padding: '6px 14px', borderRadius: '10px',
                          fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                          background: alert.isActive ? '#FEF3C7' : '#D1FAE5',
                          color: alert.isActive ? '#D97706' : '#059669',
                          border: '1px solid rgba(255,255,255,0.5)',
                          boxShadow: '2px 2px 6px rgba(0,0,0,0.04), -1px -1px 4px rgba(255,255,255,0.7)',
                          transition: 'all 0.15s',
                        }}
                      >
                        {actionLoading === alert.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : alert.isActive ? (
                          <><Pause size={12} /> Pause</>
                        ) : (
                          <><Play size={12} /> Resume</>
                        )}
                      </button>

                      {deleteConfirm === alert.id ? (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <button
                            onClick={() => handleDelete(alert)}
                            disabled={actionLoading === alert.id}
                            style={{
                              padding: '6px 12px', borderRadius: '10px', border: 'none',
                              background: '#DC2626', color: '#fff', fontSize: '12px', fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {actionLoading === alert.id ? '...' : 'Yes'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            style={{
                              padding: '6px 12px', borderRadius: '10px',
                              border: '1px solid #D5E8E0', background: '#EDF5F0',
                              color: '#6B7F8A', fontSize: '12px', fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(alert.id)}
                          className="alert-action-btn"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '6px 14px', borderRadius: '10px',
                            fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                            background: '#FEE2E2', color: '#DC2626',
                            border: '1px solid rgba(255,255,255,0.5)',
                            boxShadow: '2px 2px 6px rgba(0,0,0,0.04), -1px -1px 4px rgba(255,255,255,0.7)',
                            transition: 'all 0.15s',
                          }}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ Footer ═══ */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '24px' }}>
          <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#6B7F8A', textDecoration: 'none' }}>
            <ArrowLeft size={14} /> Dashboard
          </Link>
          <Link href="/jobs" style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textDecoration: 'none' }}>
            Browse Jobs
          </Link>
        </div>
      </div>

      {/* ═══ Styles ═══ */}
      <style>{`
        .alert-card:hover {
          box-shadow: 10px 10px 24px rgba(0,0,0,0.09), -5px -5px 14px rgba(255,255,255,0.95), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02) !important;
          transform: translateY(-1px);
        }
        .alert-action-btn:hover {
          transform: translateY(-1px);
          box-shadow: 3px 3px 8px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8) !important;
        }
        .clay-create-btn:hover {
          transform: translateY(-2px);
          box-shadow: 6px 6px 14px rgba(13,148,136,0.25), -3px -3px 8px rgba(255,255,255,0.3), inset 0 1px 0 rgba(255,255,255,0.2) !important;
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .skel-shimmer {
          background: linear-gradient(90deg, #EDF5F0 25%, #F7FBF8 50%, #EDF5F0 75%) !important;
          background-size: 200% 100% !important;
          animation: shimmer 1.5s ease-in-out infinite !important;
        }
      `}</style>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', background: '#F0F5F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={24} className="animate-spin" style={{ color: '#0D9488' }} />
    </div>
  );
}

export default function ManageAlertsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ManageAlertsContent />
    </Suspense>
  );
}
