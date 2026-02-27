'use client';

import {
    Settings, Database, Globe, Zap, Bot, Bell, Sun, Moon, Clock, RefreshCw,
} from 'lucide-react';

/* ─── Styles ─── */
const card: React.CSSProperties = {
    backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
    borderRadius: '14px', padding: '24px',
};
const heading: React.CSSProperties = { color: 'var(--text-primary)', fontWeight: 700 };
const sub: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px' };
const muted: React.CSSProperties = { color: 'var(--text-tertiary)', fontSize: '12px' };

function ConfigRow({ icon, label, description, children }: {
    icon: React.ReactNode; label: string; description: string; children?: React.ReactNode;
}) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            padding: '16px 0', borderBottom: '1px solid var(--border-color)',
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1 }}>
                <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'var(--bg-tertiary)', marginTop: 2 }}>{icon}</div>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
                    <div style={muted}>{description}</div>
                </div>
            </div>
            <div style={{ flexShrink: 0 }}>{children}</div>
        </div>
    );
}

function StatusBadge({ status, label }: { status: 'active' | 'inactive' | 'warning'; label: string }) {
    const colors = {
        active: { bg: 'rgba(34,197,94,0.12)', text: '#22C55E' },
        inactive: { bg: 'rgba(148,163,184,0.12)', text: '#94A3B8' },
        warning: { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B' },
    };
    return (
        <span style={{
            padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
            backgroundColor: colors[status].bg, color: colors[status].text,
        }}>{label}</span>
    );
}

function EnvIndicator({ name }: { name: string }) {
    return (
        <span style={{
            display: 'inline-flex', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace',
            fontWeight: 600, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)',
        }}>{name}</span>
    );
}

export default function AdminSettingsPage() {
    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>
            <div style={{ marginBottom: 28 }}>
                <h1 style={{ ...heading, fontSize: 26 }}>Settings</h1>
                <p style={sub}>Platform configuration and system status</p>
            </div>

            {/* ─── Data Sources ─── */}
            <div style={{ ...card, marginBottom: 24 }}>
                <h2 style={{ ...heading, fontSize: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Database size={20} style={{ color: '#2DD4BF' }} /> Data Sources
                </h2>
                <ConfigRow
                    icon={<Globe size={18} style={{ color: '#3B82F6' }} />}
                    label="Job Aggregators"
                    description="Active job ingestion sources (Greenhouse, Lever, Workday, iCIMS, etc.)"
                >
                    <StatusBadge status="active" label="Active" />
                </ConfigRow>
                <ConfigRow
                    icon={<Clock size={18} style={{ color: '#A855F7' }} />}
                    label="Ingestion Schedule"
                    description="Automated job ingestion runs via Vercel CRON"
                >
                    <EnvIndicator name="CRON_SECRET" />
                </ConfigRow>
                <ConfigRow
                    icon={<RefreshCw size={18} style={{ color: '#F59E0B' }} />}
                    label="Deduplication"
                    description="Automatic dedup on slug, employer, and title similarity"
                >
                    <StatusBadge status="active" label="Enabled" />
                </ConfigRow>
            </div>

            {/* ─── Social Media ─── */}
            <div style={{ ...card, marginBottom: 24 }}>
                <h2 style={{ ...heading, fontSize: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Globe size={20} style={{ color: '#3B82F6' }} /> Social Media Integration
                </h2>
                <ConfigRow
                    icon={<Zap size={18} style={{ color: '#3B82F6' }} />}
                    label="Facebook Posting"
                    description="Daily job highlights posted via Graph API"
                >
                    <EnvIndicator name="FB_PAGE_ACCESS_TOKEN" />
                </ConfigRow>
                <ConfigRow
                    icon={<Zap size={18} style={{ color: '#E1306C' }} />}
                    label="Instagram Posting"
                    description="Daily image-based job posts via IG Graph API"
                >
                    <EnvIndicator name="IG_USER_ID" />
                </ConfigRow>
            </div>

            {/* ─── Notifications ─── */}
            <div style={{ ...card, marginBottom: 24 }}>
                <h2 style={{ ...heading, fontSize: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bell size={20} style={{ color: '#F59E0B' }} /> Notifications & Alerts
                </h2>
                <ConfigRow
                    icon={<Bell size={18} style={{ color: '#22C55E' }} />}
                    label="Job Alerts"
                    description="Automated email alerts for subscribers (daily/weekly)"
                >
                    <StatusBadge status="active" label="Active" />
                </ConfigRow>
                <ConfigRow
                    icon={<Globe size={18} style={{ color: '#3B82F6' }} />}
                    label="Search Indexing"
                    description="Auto-ping Google, Bing, and IndexNow on new content"
                >
                    <EnvIndicator name="INDEXNOW_KEY" />
                </ConfigRow>
            </div>

            {/* ─── AI & Extensions ─── */}
            <div style={{ ...card, marginBottom: 24 }}>
                <h2 style={{ ...heading, fontSize: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bot size={20} style={{ color: '#A855F7' }} /> AI & Extensions
                </h2>
                <ConfigRow
                    icon={<Bot size={18} style={{ color: '#A855F7' }} />}
                    label="Autofill Extension"
                    description="Chrome extension for automatic job application form filling"
                >
                    <StatusBadge status="active" label="Active" />
                </ConfigRow>
                <ConfigRow
                    icon={<Zap size={18} style={{ color: '#22C55E' }} />}
                    label="AI Description Summarization"
                    description="OpenAI-powered job description summarization"
                >
                    <EnvIndicator name="OPENAI_API_KEY" />
                </ConfigRow>
                <ConfigRow
                    icon={<Globe size={18} style={{ color: '#3B82F6' }} />}
                    label="Blog Generation"
                    description="AI-powered blog post creation via API"
                >
                    <EnvIndicator name="BLOG_API_KEY" />
                </ConfigRow>
            </div>

            {/* ─── Auth & Security ─── */}
            <div style={card}>
                <h2 style={{ ...heading, fontSize: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Settings size={20} style={{ color: '#EF4444' }} /> Authentication & Security
                </h2>
                <ConfigRow
                    icon={<Settings size={18} style={{ color: '#2DD4BF' }} />}
                    label="Auth Provider"
                    description="Supabase authentication with email + social login"
                >
                    <StatusBadge status="active" label="Supabase" />
                </ConfigRow>
                <ConfigRow
                    icon={<Settings size={18} style={{ color: '#F59E0B' }} />}
                    label="Admin Rate Limiting"
                    description="20 requests/minute per IP on admin endpoints"
                >
                    <StatusBadge status="active" label="20 req/min" />
                </ConfigRow>
                <ConfigRow
                    icon={<Settings size={18} style={{ color: '#94A3B8' }} />}
                    label="API Rate Limiting"
                    description="Rate limits on public API endpoints"
                >
                    <StatusBadge status="active" label="Enabled" />
                </ConfigRow>
            </div>
        </div>
    );
}
