'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Briefcase, Target, TrendingUp, ArrowRight, Users, Mail, Bell } from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalJobs: 0,
    publishedJobs: 0,
    featuredJobs: 0,
    totalLeads: 0,
    prospects: 0,
    converted: 0,
    totalUsers: 0,
    totalSubscribers: 0,
    totalAlerts: 0,
    newsletterOptIns: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const jobsRes = await fetch('/api/jobs?limit=1000');
      const jobsData = await jobsRes.json();

      const outreachRes = await fetch('/api/outreach');
      const outreachData = await outreachRes.json();

      if (jobsData.success) {
        const jobs = jobsData.jobs || [];
        setStats(prev => ({
          ...prev,
          totalJobs: jobs.length,
          publishedJobs: jobs.filter((j: { isPublished: boolean }) => j.isPublished).length,
          featuredJobs: jobs.filter((j: { isFeatured: boolean }) => j.isFeatured).length,
        }));
      }

      // Fetch user/subscriber stats
      try {
        const usersRes = await fetch('/api/admin/users');
        const usersData = await usersRes.json();
        if (usersData.success && usersData.summary) {
          setStats(prev => ({
            ...prev,
            totalUsers: usersData.summary.totalUsers,
            totalSubscribers: usersData.summary.activeSubscribers,
            totalAlerts: usersData.summary.activeAlerts,
            newsletterOptIns: usersData.summary.newsletterOptIns,
          }));
        }
      } catch (e) {
        console.error('Error fetching user stats:', e);
      }

      if (outreachData.success) {
        const leads = outreachData.data || [];
        setStats(prev => ({
          ...prev,
          totalLeads: leads.length,
          prospects: leads.filter((l: { status: string }) => l.status === 'prospect').length,
          converted: leads.filter((l: { status: string }) => l.status === 'converted').length,
        }));
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', paddingTop: '32px', paddingRight: '16px', paddingBottom: '32px', paddingLeft: '16px' }}>
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

  const convRate = stats.totalLeads > 0 ? Math.round((stats.converted / stats.totalLeads) * 100) : 0;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingTop: '32px', paddingRight: '16px', paddingBottom: '32px', paddingLeft: '16px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ ...heading, fontSize: '28px', marginBottom: '4px' }}>Dashboard</h1>
        <p style={sub}>Welcome to your PMHNP Hiring admin panel</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" style={{ marginBottom: '32px' }}>
        {/* Jobs */}
        <div style={card}>
          <div className="flex items-start justify-between" style={{ marginBottom: '16px' }}>
            <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(45, 212, 191, 0.12)' }}>
              <Briefcase size={22} style={{ color: '#2DD4BF' }} />
            </div>
            <span style={muted}>Jobs</span>
          </div>
          <div style={{ fontSize: '32px', ...heading }}>{stats.totalJobs}</div>
          <div style={sub}>Total Jobs</div>
          <div
            style={{
              display: 'flex', gap: '24px', marginTop: '14px', paddingTop: '14px',
              borderTop: '1px solid var(--border-color)', fontSize: '13px',
            }}
          >
            <div>
              <div style={{ ...heading, fontSize: '15px' }}>{stats.publishedJobs}</div>
              <div style={muted}>Published</div>
            </div>
            <div>
              <div style={{ ...heading, fontSize: '15px' }}>{stats.featuredJobs}</div>
              <div style={muted}>Featured</div>
            </div>
          </div>
        </div>

        {/* Outreach */}
        <div style={card}>
          <div className="flex items-start justify-between" style={{ marginBottom: '16px' }}>
            <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.12)' }}>
              <Target size={22} style={{ color: '#A855F7' }} />
            </div>
            <span style={muted}>Outreach</span>
          </div>
          <div style={{ fontSize: '32px', ...heading }}>{stats.totalLeads}</div>
          <div style={sub}>Total Leads</div>
          <div
            style={{
              display: 'flex', gap: '24px', marginTop: '14px', paddingTop: '14px',
              borderTop: '1px solid var(--border-color)', fontSize: '13px',
            }}
          >
            <div>
              <div style={{ ...heading, fontSize: '15px' }}>{stats.prospects}</div>
              <div style={muted}>Prospects</div>
            </div>
            <div>
              <div style={{ ...heading, fontSize: '15px', color: '#2DD4BF' }}>{stats.converted}</div>
              <div style={muted}>Converted</div>
            </div>
          </div>
        </div>

        {/* Conversion */}
        <div style={card}>
          <div className="flex items-start justify-between" style={{ marginBottom: '16px' }}>
            <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.12)' }}>
              <TrendingUp size={22} style={{ color: '#22C55E' }} />
            </div>
            <span style={muted}>Performance</span>
          </div>
          <div style={{ fontSize: '32px', ...heading }}>{convRate}%</div>
          <div style={sub}>Conversion Rate</div>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginTop: '14px', paddingTop: '14px',
              borderTop: '1px solid var(--border-color)', fontSize: '13px',
              color: '#22C55E',
            }}
          >
            <TrendingUp size={14} />
            <span>Lead to Customer</span>
          </div>
        </div>

        {/* Users & Subscribers */}
        <div style={card}>
          <div className="flex items-start justify-between" style={{ marginBottom: '16px' }}>
            <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.12)' }}>
              <Users size={22} style={{ color: '#3B82F6' }} />
            </div>
            <span style={muted}>Users</span>
          </div>
          <div style={{ fontSize: '32px', ...heading }}>{stats.totalUsers}</div>
          <div style={sub}>Registered Users</div>
          <div
            style={{
              display: 'flex', gap: '24px', marginTop: '14px', paddingTop: '14px',
              borderTop: '1px solid var(--border-color)', fontSize: '13px',
            }}
          >
            <div>
              <div style={{ ...heading, fontSize: '15px' }}>{stats.totalSubscribers}</div>
              <div style={muted}>Subscribers</div>
            </div>
            <div>
              <div style={{ ...heading, fontSize: '15px', color: '#F59E0B' }}>{stats.totalAlerts}</div>
              <div style={muted}>Active Alerts</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div style={card}>
          <div className="flex items-center gap-3" style={{ marginBottom: '14px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(45, 212, 191, 0.12)' }}>
              <Briefcase size={18} style={{ color: '#2DD4BF' }} />
            </div>
            <h2 style={{ ...heading, fontSize: '18px' }}>Jobs Management</h2>
          </div>
          <p style={{ ...sub, marginBottom: '16px' }}>
            Manage job postings, approve submissions, and update job statuses.
          </p>
          <Link href="/admin/jobs" style={{ textDecoration: 'none' }}>
            <button
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', borderRadius: '10px', cursor: 'pointer',
                backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px',
                transition: 'all 0.2s',
              }}
            >
              Go to Jobs
              <ArrowRight size={18} />
            </button>
          </Link>
        </div>

        <div style={card}>
          <div className="flex items-center gap-3" style={{ marginBottom: '14px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.12)' }}>
              <Users size={18} style={{ color: '#3B82F6' }} />
            </div>
            <h2 style={{ ...heading, fontSize: '18px' }}>Users & Subscribers</h2>
          </div>
          <p style={{ ...sub, marginBottom: '16px' }}>
            View user profiles, email subscribers, newsletters, and job alerts.
          </p>
          <Link href="/admin/users" style={{ textDecoration: 'none' }}>
            <button
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', borderRadius: '10px', cursor: 'pointer',
                backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px',
                transition: 'all 0.2s',
              }}
            >
              Go to Users
              <ArrowRight size={18} />
            </button>
          </Link>
        </div>

        <div style={card}>
          <div className="flex items-center gap-3" style={{ marginBottom: '14px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.12)' }}>
              <Target size={18} style={{ color: '#A855F7' }} />
            </div>
            <h2 style={{ ...heading, fontSize: '18px' }}>Employer Outreach</h2>
          </div>
          <p style={{ ...sub, marginBottom: '16px' }}>
            Track leads, send outreach emails, and manage your employer pipeline.
          </p>
          <Link href="/admin/outreach" style={{ textDecoration: 'none' }}>
            <button
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', borderRadius: '10px', cursor: 'pointer',
                backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px',
                transition: 'all 0.2s',
              }}
            >
              Go to Outreach
              <ArrowRight size={18} />
            </button>
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ ...card, marginTop: '24px' }}>
        <h2 style={{ ...heading, fontSize: '18px', marginBottom: '16px' }}>Quick Stats</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Active Jobs', value: stats.publishedJobs },
            { label: 'Featured', value: stats.featuredJobs },
            { label: 'Users', value: stats.totalUsers },
            { label: 'Subscribers', value: stats.totalSubscribers },
            { label: 'Alerts', value: stats.totalAlerts, accent: true },
            { label: 'Newsletter', value: stats.newsletterOptIns },
            { label: 'New Prospects', value: stats.prospects },
            { label: 'Customers', value: stats.converted, accent: true },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                textAlign: 'center', padding: '16px',
                backgroundColor: 'var(--bg-tertiary)', borderRadius: '10px',
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: 700, color: s.accent ? '#2DD4BF' : 'var(--text-primary)' }}>
                {s.value}
              </div>
              <div style={muted}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
