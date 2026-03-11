'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Briefcase, Target, TrendingUp, ArrowRight, Users, BarChart3,
  Eye, MousePointerClick, FileCheck, Zap, UserPlus, Mail, Bell, Activity,
} from 'lucide-react';

/* ─── Types ─── */
interface Summary {
  totalViews: number; totalClicks: number; totalApplications: number;
  views24h: number; views7d: number; clicks24h: number; clicks7d: number;
  apps24h: number; apps7d: number;
  totalUsers: number; newUsers7d: number; totalSubscribers: number;
  newsletterOptIns: number;
  activeAlerts: number; dailyAlerts: number; weeklyAlerts: number;
  activeJobs: number; employerPostedJobs: number;
  totalEmployerLeads: number;
  roleBreakdown: Record<string, number>;
  jobSourceBreakdown: Record<string, number>;
  employerLeadStatuses: Record<string, number>;
  conversionRates: { viewToClick: number; clickToApply: number; viewToApply: number };
}
interface SparklinePoint { date: string; count: number }
interface TopJob {
  id: string; title: string; employer: string;
  views: number; clicks: number; applications: number;
  viewToClickRate: number; source: string | null;
}
interface RecentApp {
  id: string; appliedAt: string; status: string;
  user: { email: string; firstName: string | null; lastName: string | null };
  job: { title: string; employer: string };
}
interface RecentUser {
  id: string; email: string; firstName: string | null; lastName: string | null;
  role: string; createdAt: string;
}
interface RecentSub {
  id: string; email: string; source: string | null; createdAt: string;
}
interface AnalyticsData {
  summary: Summary;
  sparklines: { views: SparklinePoint[]; clicks: SparklinePoint[]; applications: SparklinePoint[] };
  topJobs: TopJob[];
  recentActivity: { applications: RecentApp[]; newUsers: RecentUser[]; newSubscribers: RecentSub[] };
  autofill: { totalUsage: number; uniqueUsers: number };
}

/* ─── Shared styles ─── */
const card: React.CSSProperties = {
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '14px',
  padding: '24px',
  transition: 'border-color 0.2s',
};
const heading: React.CSSProperties = { color: 'var(--text-primary)', fontWeight: 700 };
const sub: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px' };
const muted: React.CSSProperties = { color: 'var(--text-tertiary)', fontSize: '12px' };

/* ─── Mini sparkline component (pure CSS bars) ─── */
function Sparkline({ data, color }: { data: SparklinePoint[]; color: string }) {
  if (!data.length) return <span style={muted}>No data</span>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '36px' }}>
      {data.slice(-7).map((d, i) => (
        <div
          key={i}
          title={`${d.date}: ${d.count}`}
          style={{
            width: '8px',
            borderRadius: '2px',
            backgroundColor: color,
            opacity: 0.3 + (d.count / max) * 0.7,
            height: `${Math.max(4, (d.count / max) * 36)}px`,
            transition: 'height 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

/* ─── Funnel step ─── */
function FunnelStep({
  icon, label, value, rate, color, isLast,
}: {
  icon: React.ReactNode; label: string; value: number; rate?: number; color: string; isLast?: boolean;
}) {
  return (
    <div style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '12px',
        background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 10px',
      }}>
        {icon}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
        {value.toLocaleString()}
      </div>
      <div style={muted}>{label}</div>
      {rate !== undefined && (
        <div style={{
          marginTop: '6px', fontSize: '12px', fontWeight: 600,
          color: rate >= 5 ? '#22C55E' : rate >= 2 ? '#F59E0B' : '#EF4444',
        }}>
          {rate}%
        </div>
      )}
      {!isLast && (
        <div style={{
          position: 'absolute', top: '24px', right: '-16px',
          color: 'var(--text-tertiary)', fontSize: '18px',
        }}>
          →
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchAnalytics(); }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/analytics?days=30');
      if (!res.ok) throw new Error('Failed to fetch analytics');
      const data = await res.json();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
        <div style={{ textAlign: 'center', paddingTop: '80px' }}>
          <div
            style={{
              width: 48, height: 48, border: '3px solid var(--border-color)',
              borderTop: '3px solid #2DD4BF', borderRadius: '50%',
              margin: '0 auto', animation: 'spin 0.8s linear infinite',
            }}
          />
          <p style={{ marginTop: '16px', ...sub }}>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '12px', padding: '24px',
        }}>
          <h2 style={{ color: '#EF4444', fontWeight: 700, marginBottom: '8px' }}>Error</h2>
          <p style={{ color: '#F87171', fontSize: '14px' }}>{error}</p>
          <button onClick={fetchAnalytics}
            style={{
              marginTop: '12px', padding: '10px 20px',
              background: '#EF4444', color: '#fff', border: 'none',
              borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
            }}>Retry</button>
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  const { summary: s, sparklines, topJobs, recentActivity, autofill } = analytics;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ ...heading, fontSize: '28px', marginBottom: '4px' }}>Dashboard</h1>
          <p style={sub}>PMHNP Hiring — Admin Overview (Last 30 days)</p>
        </div>
        <button onClick={fetchAnalytics} style={{
          padding: '10px 20px', borderRadius: '10px', cursor: 'pointer',
          backgroundColor: '#2DD4BF', color: '#0F172A', border: 'none',
          fontWeight: 700, fontSize: '13px',
        }}>Refresh</button>
      </div>

      {/* ─── Engagement Funnel ─── */}
      <div style={{ ...card, marginBottom: '24px' }}>
        <h2 style={{ ...heading, fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={20} style={{ color: '#2DD4BF' }} />
          Engagement Funnel (30 days)
        </h2>
        <div className="flex flex-col sm:flex-row items-center" style={{ gap: '16px', justifyContent: 'space-around' }}>
          <FunnelStep icon={<Eye size={22} style={{ color: '#3B82F6' }} />} label="Job Views" value={s.totalViews} color="#3B82F6" />
          <FunnelStep icon={<MousePointerClick size={22} style={{ color: '#A855F7' }} />} label="Apply Clicks" value={s.totalClicks} rate={s.conversionRates.viewToClick} color="#A855F7" />
          <FunnelStep icon={<FileCheck size={22} style={{ color: '#22C55E' }} />} label="Applications" value={s.totalApplications} rate={s.conversionRates.clickToApply} color="#22C55E" isLast />
        </div>
      </div>

      {/* ─── Hero Stat Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3" style={{ marginBottom: '24px' }}>
        {[
          { icon: <Briefcase size={16} />, label: 'Active Jobs', value: s.activeJobs, color: '#2DD4BF' },
          { icon: <Users size={16} />, label: 'Total Users', value: s.totalUsers, color: '#3B82F6', note: `+${s.newUsers7d} this week` },
          { icon: <Mail size={16} />, label: 'Newsletter', value: s.newsletterOptIns, color: '#F59E0B', note: `${s.totalSubscribers} leads` },
          { icon: <Bell size={16} />, label: 'Active Alerts', value: s.activeAlerts, color: '#22C55E', note: `${s.dailyAlerts}d / ${s.weeklyAlerts}w` },
          { icon: <Target size={16} />, label: 'Employer Leads', value: s.totalEmployerLeads, color: '#A855F7' },
          { icon: <BarChart3 size={16} />, label: 'Employer Jobs', value: s.employerPostedJobs, color: '#EC4899' },
          { icon: <FileCheck size={16} />, label: 'Apps (30d)', value: s.totalApplications, color: '#22C55E', note: `${s.apps24h} today` },
          { icon: <Zap size={16} />, label: 'Autofill', value: autofill.totalUsage, color: '#F97316', note: `${autofill.uniqueUsers} users` },
        ].map((c) => (
          <div key={c.label} style={{ ...card, padding: '16px' }}>
            <div style={{ color: c.color, marginBottom: '8px' }}>{c.icon}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{c.value.toLocaleString()}</div>
            <div style={{ ...muted, marginTop: '4px' }}>{c.label}</div>
            {c.note && <div style={{ fontSize: '10px', color: c.color, fontWeight: 600, marginTop: '3px' }}>{c.note}</div>}
          </div>
        ))}
      </div>

      {/* ─── 7-Day Sparklines Overview ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ marginBottom: '24px' }}>
        {[
          { label: 'Views (7 days)', data: sparklines.views, color: '#3B82F6', total: s.views7d },
          { label: 'Clicks (7 days)', data: sparklines.clicks, color: '#A855F7', total: s.clicks7d },
          { label: 'Applications (7 days)', data: sparklines.applications, color: '#22C55E', total: s.apps7d },
        ].map((c) => {
          const max = Math.max(...(c.data || []).map(d => d.count), 1);
          return (
            <div key={c.label} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ ...heading, fontSize: '14px' }}>{c.label}</span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: c.color }}>{c.total.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '48px' }}>
                {(c.data || []).slice(-7).map((d, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <div
                      title={`${d.date}: ${d.count}`}
                      style={{
                        width: '100%', maxWidth: '32px', borderRadius: '4px',
                        backgroundColor: c.color,
                        opacity: 0.25 + (d.count / max) * 0.75,
                        height: `${Math.max(4, (d.count / max) * 48)}px`,
                        transition: 'height 0.3s ease',
                      }}
                    />
                    <span style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>
                      {d.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Top Performing Jobs ─── */}
      <div style={{ ...card, marginBottom: '24px', padding: 0 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ ...heading, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={20} style={{ color: '#22C55E' }} /> Top Performing Jobs
          </h2>
          <Link href="/admin/analytics" style={{ fontSize: '13px', color: '#2DD4BF', textDecoration: 'none', fontWeight: 600 }}>
            View All →
          </Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Job Title', 'Employer', 'Views', 'Clicks', 'Apps', 'View→Click', 'Source'].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px', textAlign: h === 'Job Title' || h === 'Employer' || h === 'Source' ? 'left' : 'right',
                    fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.05em', color: 'var(--text-tertiary)',
                    backgroundColor: 'var(--bg-tertiary)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topJobs.slice(0, 8).map((job) => (
                <tr key={job.id}>
                  <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.title}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                    {job.employer}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>
                    {job.views.toLocaleString()}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>
                    {job.clicks.toLocaleString()}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>
                    {job.applications}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                      backgroundColor: job.viewToClickRate >= 5 ? 'rgba(34,197,94,0.12)' : job.viewToClickRate >= 2 ? 'rgba(234,179,8,0.12)' : 'rgba(148,163,184,0.12)',
                      color: job.viewToClickRate >= 5 ? '#22C55E' : job.viewToClickRate >= 2 ? '#EAB308' : '#94A3B8',
                    }}>
                      {job.viewToClickRate}%
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-color)', textTransform: 'capitalize' }}>
                    {job.source || '—'}
                  </td>
                </tr>
              ))}
              {topJobs.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', ...sub }}>No engagement data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Recent Activity ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ marginBottom: '24px' }}>
        {/* Recent Applications */}
        <div style={card}>
          <h3 style={{ ...heading, fontSize: '15px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileCheck size={16} style={{ color: '#22C55E' }} /> Recent Applications
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentActivity.applications.map(app => (
              <div key={app.id} style={{
                padding: '10px 14px', borderRadius: '10px',
                backgroundColor: 'var(--bg-tertiary)',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {app.user.firstName ? `${app.user.firstName} ${app.user.lastName || ''}` : app.user.email}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Applied to <strong>{app.job.title}</strong>
                </div>
                <div style={muted}>{new Date(app.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
              </div>
            ))}
            {recentActivity.applications.length === 0 && <p style={sub}>No recent applications</p>}
          </div>
        </div>

        {/* New Users */}
        <div style={card}>
          <h3 style={{ ...heading, fontSize: '15px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={16} style={{ color: '#3B82F6' }} /> New Users
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentActivity.newUsers.map(u => (
              <div key={u.id} style={{
                padding: '10px 14px', borderRadius: '10px',
                backgroundColor: 'var(--bg-tertiary)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: '8px', overflow: 'hidden',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.firstName ? `${u.firstName} ${u.lastName || ''}` : u.email}
                  </div>
                  <div style={muted}>{new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
                <span style={{
                  padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                  backgroundColor: u.role === 'employer' ? 'rgba(168,85,247,0.12)' : 'rgba(59,130,246,0.12)',
                  color: u.role === 'employer' ? '#A855F7' : '#3B82F6',
                  textTransform: 'capitalize',
                }}>
                  {u.role === 'job_seeker' ? 'Seeker' : u.role}
                </span>
              </div>
            ))}
            {recentActivity.newUsers.length === 0 && <p style={sub}>No recent users</p>}
          </div>
        </div>

        {/* New Subscribers */}
        <div style={card}>
          <h3 style={{ ...heading, fontSize: '15px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={16} style={{ color: '#F59E0B' }} /> New Subscribers
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentActivity.newSubscribers.map(s => (
              <div key={s.id} style={{
                padding: '10px 14px', borderRadius: '10px',
                backgroundColor: 'var(--bg-tertiary)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: '8px', overflow: 'hidden',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div>
                  <div style={muted}>{new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
                {s.source && (
                  <span style={{ ...muted, fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0 }}>{s.source}</span>
                )}
              </div>
            ))}
            {recentActivity.newSubscribers.length === 0 && <p style={sub}>No recent subscribers</p>}
          </div>
        </div>
      </div>

      {/* ─── Quick Actions ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: <Briefcase size={18} style={{ color: '#2DD4BF' }} />, title: 'Jobs', desc: 'Manage job postings & CRUD', href: '/admin/jobs', color: '#2DD4BF' },
          { icon: <BarChart3 size={18} style={{ color: '#3B82F6' }} />, title: 'Analytics', desc: 'Deep-dive engagement data', href: '/admin/analytics', color: '#3B82F6' },
          { icon: <Users size={18} style={{ color: '#A855F7' }} />, title: 'Users', desc: 'Manage users & subscribers', href: '/admin/users', color: '#A855F7' },
          { icon: <Mail size={18} style={{ color: '#EC4899' }} />, title: 'Email Broadcasts', desc: 'Send personalized emails', href: '/admin/email', color: '#EC4899' },
          { icon: <Target size={18} style={{ color: '#F59E0B' }} />, title: 'Outreach', desc: 'Employer lead pipeline', href: '/admin/outreach', color: '#F59E0B' },
        ].map((a) => (
          <Link key={a.href} href={a.href} style={{ textDecoration: 'none' }}>
            <div style={{ ...card, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '10px', borderRadius: '10px', background: `${a.color}18` }}>
                {a.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...heading, fontSize: '15px' }}>{a.title}</div>
                <div style={muted}>{a.desc}</div>
              </div>
              <ArrowRight size={16} style={{ color: 'var(--text-tertiary)' }} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
