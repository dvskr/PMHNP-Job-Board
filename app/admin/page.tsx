'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Briefcase, Target, TrendingUp, ArrowRight, Users, BarChart3,
  Eye, MousePointerClick, FileCheck, Zap, UserPlus, Mail, Bell, Activity,
} from 'lucide-react';

/* â”€â”€â”€ Types â”€â”€â”€ */
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

/* ─── Claymorphism Design Tokens ─── */
const clayCard: React.CSSProperties = {
  backgroundColor: '#FAFBF9',
  border: '1px solid rgba(255,255,255,0.7)',
  borderRadius: '22px',
  padding: '24px',
  boxShadow:
    '8px 8px 20px rgba(0,0,0,0.06), ' +
    '-6px -6px 16px rgba(255,255,255,0.9), ' +
    'inset 3px 3px 6px rgba(255,255,255,0.7), ' +
    'inset -2px -2px 4px rgba(0,0,0,0.03)',
  transition: 'transform 0.2s, box-shadow 0.2s',
};
const card = clayCard;
const heading: React.CSSProperties = { color: '#1A2E35', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif' };
const sub: React.CSSProperties = { color: '#6B7F8A', fontSize: '14px' };
const muted: React.CSSProperties = { color: '#94A3B8', fontSize: '12px' };
const clayItemRow: React.CSSProperties = {
  padding: '12px 16px', borderRadius: '16px',
  backgroundColor: '#F0F3F2',
  border: '1px solid rgba(255,255,255,0.6)',
  boxShadow:
    'inset 2px 2px 5px rgba(255,255,255,0.7), ' +
    'inset -1px -1px 3px rgba(0,0,0,0.03), ' +
    '3px 3px 8px rgba(0,0,0,0.03)',
};

/* â”€â”€â”€ Mini sparkline component (pure CSS bars) â”€â”€â”€ */
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
            borderRadius: '4px',
            backgroundColor: color,
            opacity: 0.3 + (d.count / max) * 0.7,
            height: `${Math.max(4, (d.count / max) * 36)}px`,
            transition: 'height 0.3s ease',
            boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.3)',
          }}
        />
      ))}
    </div>
  );
}

/* â”€â”€â”€ Funnel step â”€â”€â”€ */
function FunnelStep({
  icon, label, value, rate, color, isLast,
}: {
  icon: React.ReactNode; label: string; value: number; rate?: number; color: string; isLast?: boolean;
}) {
  return (
    <div style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
      <div style={{
        width: '52px', height: '52px', borderRadius: '18px',
        background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 12px',
        border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: `5px 5px 12px rgba(0,0,0,0.05), -3px -3px 8px rgba(255,255,255,0.8), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 3px ${color}15`,
      }}>
        {icon}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 800, color: '#1A2E35' }}>
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
          color: '#94A3B8', fontSize: '18px',
        }}>
          â†’
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
              width: 48, height: 48, border: '3px solid #E2E8F0',
              borderTop: '3px solid #0D9488', borderRadius: '50%',
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
          borderRadius: '16px', padding: '24px',
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
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ ...heading, fontSize: '30px', marginBottom: '4px', letterSpacing: '-0.5px' }}>Admin Dashboard</h1>
          <p style={sub}>PMHNP Hiring — Overview · Last 30 days</p>
        </div>
        <button onClick={fetchAnalytics} style={{
          padding: '10px 22px', borderRadius: '20px', cursor: 'pointer',
          background: 'linear-gradient(145deg, #0D9488, #0F766E)',
          color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
          fontWeight: 700, fontSize: '13px',
          boxShadow: '4px 4px 12px rgba(13,148,136,0.25), -2px -2px 6px rgba(255,255,255,0.3), inset 2px 2px 4px rgba(255,255,255,0.15)',
          transition: 'transform 0.15s',
        }}>Refresh</button>
      </div>

      {/* â”€â”€â”€ Engagement Funnel â”€â”€â”€ */}
      <div style={{ ...card, marginBottom: '24px' }}>
        <h2 style={{ ...heading, fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={20} style={{ color: '#0D9488' }} />
          Engagement Funnel (30 days)
        </h2>
        <div className="flex flex-col sm:flex-row items-center" style={{ gap: '16px', justifyContent: 'space-around' }}>
          <FunnelStep icon={<Eye size={22} style={{ color: '#3B82F6' }} />} label="Job Views" value={s.totalViews} color="#3B82F6" />
          <FunnelStep icon={<MousePointerClick size={22} style={{ color: '#A855F7' }} />} label="Apply Clicks" value={s.totalClicks} rate={s.conversionRates.viewToClick} color="#A855F7" />
          <FunnelStep icon={<FileCheck size={22} style={{ color: '#22C55E' }} />} label="Applications" value={s.totalApplications} rate={s.conversionRates.clickToApply} color="#22C55E" isLast />
        </div>
      </div>

      {/* â”€â”€â”€ Hero Stat Cards â”€â”€â”€ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3" style={{ marginBottom: '24px' }}>
        {[
          { icon: <Briefcase size={16} />, label: 'Active Jobs', value: s.activeJobs, color: '#0D9488' },
          { icon: <Users size={16} />, label: 'Total Users', value: s.totalUsers, color: '#3B82F6', note: `+${s.newUsers7d} this week` },
          { icon: <Mail size={16} />, label: 'Newsletter', value: s.newsletterOptIns, color: '#F59E0B', note: `${s.totalSubscribers} leads` },
          { icon: <Bell size={16} />, label: 'Active Alerts', value: s.activeAlerts, color: '#22C55E', note: `${s.dailyAlerts}d / ${s.weeklyAlerts}w` },
          { icon: <Target size={16} />, label: 'Employer Leads', value: s.totalEmployerLeads, color: '#A855F7' },
          { icon: <BarChart3 size={16} />, label: 'Employer Jobs', value: s.employerPostedJobs, color: '#EC4899' },
          { icon: <FileCheck size={16} />, label: 'Apps (30d)', value: s.totalApplications, color: '#22C55E', note: `${s.apps24h} today` },
          { icon: <Zap size={16} />, label: 'Autofill', value: autofill.totalUsage, color: '#F97316', note: `${autofill.uniqueUsers} users` },
        ].map((c) => (
          <div key={c.label} style={{
            ...card, padding: '18px',
            background: `linear-gradient(145deg, #FAFBF9, ${c.color}08)`,
          }}>
            <div style={{
              color: c.color, marginBottom: '10px',
              width: '36px', height: '36px', borderRadius: '12px',
              background: `${c.color}12`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 3px ${c.color}15`,
            }}>{c.icon}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>{c.value.toLocaleString()}</div>
            <div style={{ ...muted, marginTop: '4px' }}>{c.label}</div>
            {c.note && <div style={{ fontSize: '10px', color: c.color, fontWeight: 600, marginTop: '3px' }}>{c.note}</div>}
          </div>
        ))}
      </div>

      {/* â”€â”€â”€ 7-Day Sparklines Overview â”€â”€â”€ */}
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
                        width: '100%', maxWidth: '32px', borderRadius: '6px',
                        backgroundColor: c.color,
                        opacity: 0.25 + (d.count / max) * 0.75,
                        height: `${Math.max(4, (d.count / max) * 48)}px`,
                        transition: 'height 0.3s ease',
                        boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.3)',
                      }}
                    />
                    <span style={{ fontSize: '9px', color: '#94A3B8' }}>
                      {d.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* â”€â”€â”€ Top Performing Jobs â”€â”€â”€ */}
      <div style={{ ...card, marginBottom: '24px', padding: 0 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E8ECF0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ ...heading, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={20} style={{ color: '#22C55E' }} /> Top Performing Jobs
          </h2>
          <Link href="/admin/analytics" style={{ fontSize: '13px', color: '#0D9488', textDecoration: 'none', fontWeight: 600 }}>
            View All â†’
          </Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Job Title', 'Employer', 'Views', 'Clicks', 'Apps', 'Viewâ†’Click', 'Source'].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px', textAlign: h === 'Job Title' || h === 'Employer' || h === 'Source' ? 'left' : 'right',
                    fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.05em', color: '#94A3B8',
                    backgroundColor: '#F8FAF9',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topJobs.slice(0, 8).map((job) => (
                <tr key={job.id}>
                  <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: '#1A2E35', borderBottom: '1px solid #F0F3F2', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.title}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6B7F8A', borderBottom: '1px solid #F0F3F2', whiteSpace: 'nowrap' }}>
                    {job.employer}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6B7F8A', borderBottom: '1px solid #F0F3F2', textAlign: 'right' }}>
                    {job.views.toLocaleString()}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6B7F8A', borderBottom: '1px solid #F0F3F2', textAlign: 'right' }}>
                    {job.clicks.toLocaleString()}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6B7F8A', borderBottom: '1px solid #F0F3F2', textAlign: 'right' }}>
                    {job.applications}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', borderBottom: '1px solid #F0F3F2', textAlign: 'right' }}>
                    <span style={{
                      padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                      backgroundColor: job.viewToClickRate >= 5 ? 'rgba(34,197,94,0.10)' : job.viewToClickRate >= 2 ? 'rgba(234,179,8,0.10)' : 'rgba(148,163,184,0.10)',
                      color: job.viewToClickRate >= 5 ? '#22C55E' : job.viewToClickRate >= 2 ? '#EAB308' : '#94A3B8',
                      boxShadow: 'inset 1px 1px 3px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.03)',
                    }}>
                      {job.viewToClickRate}%
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#94A3B8', borderBottom: '1px solid #F0F3F2', textTransform: 'capitalize' }}>
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

      {/* â”€â”€â”€ Recent Activity â”€â”€â”€ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ marginBottom: '24px' }}>
        {/* Recent Applications */}
        <div style={card}>
          <h3 style={{ ...heading, fontSize: '15px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileCheck size={16} style={{ color: '#22C55E' }} /> Recent Applications
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentActivity.applications.map(app => (
              <div key={app.id} style={clayItemRow}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1A2E35' }}>
                  {app.user.firstName ? `${app.user.firstName} ${app.user.lastName || ''}` : app.user.email}
                </div>
                <div style={{ fontSize: '12px', color: '#6B7F8A', marginTop: '2px' }}>
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
                ...clayItemRow,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: '8px', overflow: 'hidden',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1A2E35', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.firstName ? `${u.firstName} ${u.lastName || ''}` : u.email}
                  </div>
                  <div style={muted}>{new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
                <span style={{
                  padding: '4px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                  backgroundColor: u.role === 'employer' ? 'rgba(168,85,247,0.10)' : 'rgba(59,130,246,0.10)',
                  color: u.role === 'employer' ? '#A855F7' : '#3B82F6',
                  textTransform: 'capitalize',
                  boxShadow: 'inset 1px 1px 3px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.03)',
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
                ...clayItemRow,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: '8px', overflow: 'hidden',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1A2E35', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div>
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

      {/* â”€â”€â”€ Quick Actions â”€â”€â”€ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: <Briefcase size={18} style={{ color: '#0D9488' }} />, title: 'Jobs', desc: 'Manage job postings & CRUD', href: '/admin/jobs', color: '#0D9488' },
          { icon: <BarChart3 size={18} style={{ color: '#3B82F6' }} />, title: 'Analytics', desc: 'Deep-dive engagement data', href: '/admin/analytics', color: '#3B82F6' },
          { icon: <Users size={18} style={{ color: '#A855F7' }} />, title: 'Users', desc: 'Manage users & subscribers', href: '/admin/users', color: '#A855F7' },
          { icon: <Mail size={18} style={{ color: '#EC4899' }} />, title: 'Email Broadcasts', desc: 'Send personalized emails', href: '/admin/email', color: '#EC4899' },
          { icon: <Target size={18} style={{ color: '#F59E0B' }} />, title: 'Outreach', desc: 'Employer lead pipeline', href: '/admin/outreach', color: '#F59E0B' },
        ].map((a) => (
          <Link key={a.href} href={a.href} style={{ textDecoration: 'none' }}>
            <div style={{ ...card, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                padding: '12px', borderRadius: '16px',
                background: `${a.color}10`,
                border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: `inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 3px ${a.color}12, 3px 3px 8px rgba(0,0,0,0.03)`,
              }}>
                {a.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...heading, fontSize: '15px' }}>{a.title}</div>
                <div style={muted}>{a.desc}</div>
              </div>
              <ArrowRight size={16} style={{ color: '#94A3B8' }} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}




