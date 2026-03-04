'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Send, Mail, History, FileText, Eye, Users, ChevronDown,
    Plus, Trash2, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle,
} from 'lucide-react';

/* ─── Types ─── */
interface AudienceInfo { count: number; sample: Array<{ email: string; firstName?: string | null }> }
interface Broadcast {
    id: string; subject: string; audience: string; audienceCount: number;
    status: string; sentAt: string | null; sentCount: number; failedCount: number;
    scheduledFor: string | null; createdAt: string;
}
interface Template { id: string; name: string; subject: string; body: string; createdAt: string; updatedAt: string }

type Tab = 'compose' | 'history' | 'templates';
type Audience = 'all' | 'job_seekers' | 'employers' | 'subscribers' | 'newsletter' | 'custom';

/* ─── Styles ─── */
const card: React.CSSProperties = { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '14px', overflow: 'hidden' };
const heading: React.CSSProperties = { color: 'var(--text-primary)', fontWeight: 700 };
const sub: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px' };
const muted: React.CSSProperties = { color: 'var(--text-tertiary)', fontSize: '12px' };
const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: '10px', fontSize: '14px',
    backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
    color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
};
const btnPrimary: React.CSSProperties = {
    padding: '10px 22px', borderRadius: '10px', cursor: 'pointer',
    backgroundColor: '#2DD4BF', color: '#0F172A', border: 'none',
    fontWeight: 700, fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px',
};
const btnSecondary: React.CSSProperties = {
    padding: '10px 22px', borderRadius: '10px', cursor: 'pointer',
    backgroundColor: 'transparent', color: '#2DD4BF', border: '1px solid var(--border-color)',
    fontWeight: 600, fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px',
};
const btnDanger: React.CSSProperties = {
    padding: '6px 12px', borderRadius: '8px', cursor: 'pointer',
    backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.25)',
    fontWeight: 600, fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px',
};

const AUDIENCE_LABELS: Record<Audience, string> = {
    all: '📧 All Users (Accounts + Subscribers)',
    job_seekers: '🔍 Job Seekers',
    employers: '🏢 Employers',
    subscribers: '🔔 All Email Subscribers',
    newsletter: '📰 Newsletter Opt-Ins',
    custom: '✏️ Custom Email List',
};

const MERGE_TAGS = [
    { tag: '{{firstName}}', label: 'First Name', example: 'Sarah' },
    { tag: '{{email}}', label: 'Email', example: 'sarah@example.com' },
];

function statusBadge(status: string) {
    const map: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
        sent: { bg: 'rgba(34,197,94,0.12)', color: '#22C55E', icon: <CheckCircle2 size={12} /> },
        sending: { bg: 'rgba(59,130,246,0.12)', color: '#3B82F6', icon: <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> },
        scheduled: { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B', icon: <Clock size={12} /> },
        failed: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', icon: <XCircle size={12} /> },
        draft: { bg: 'rgba(148,163,184,0.12)', color: '#94A3B8', icon: <FileText size={12} /> },
    };
    const s = map[status] || map.draft;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
            backgroundColor: s.bg, color: s.color, textTransform: 'capitalize',
        }}>
            {s.icon} {status}
        </span>
    );
}

function audienceLabel(a: string) {
    return AUDIENCE_LABELS[a as Audience] || a;
}

export default function AdminEmailPage() {
    const [tab, setTab] = useState<Tab>('compose');
    const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

    // ── Compose state ──
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [audience, setAudience] = useState<Audience>('all');
    const [customEmails, setCustomEmails] = useState('');
    const [audienceInfo, setAudienceInfo] = useState<AudienceInfo | null>(null);
    const [loadingAudience, setLoadingAudience] = useState(false);
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // ── History state ──
    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // ── Templates state ──
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [templateName, setTemplateName] = useState('');

    const showMsg = (text: string, isError = false) => {
        setMsg({ text, isError });
        setTimeout(() => setMsg(null), 5000);
    };

    // ── Fetch audience count ──
    const fetchAudience = useCallback(async (seg: Audience) => {
        if (seg === 'custom') {
            const emails = customEmails.split(/[\n,;]/).map(e => e.trim()).filter(Boolean);
            setAudienceInfo({ count: emails.length, sample: emails.slice(0, 5).map(e => ({ email: e })) });
            return;
        }
        setLoadingAudience(true);
        try {
            const res = await fetch(`/api/admin/email/audience?segment=${seg}`);
            const data = await res.json();
            if (data.success) setAudienceInfo(data);
        } catch { showMsg('Failed to fetch audience', true); }
        finally { setLoadingAudience(false); }
    }, [customEmails]);

    useEffect(() => { fetchAudience(audience); }, [audience, fetchAudience]);

    // ── Preview ──
    const handlePreview = async () => {
        if (!subject || !body) { showMsg('Subject and body are required', true); return; }
        try {
            const res = await fetch('/api/admin/email/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject, body }),
            });
            const data = await res.json();
            if (data.success) setPreviewHtml(data.html);
            else showMsg(data.error || 'Preview failed', true);
        } catch { showMsg('Preview failed', true); }
    };

    // ── Send ──
    const handleSend = async () => {
        setShowConfirm(false);
        setSending(true);
        try {
            const payload: Record<string, unknown> = { subject, body, audience };
            if (audience === 'custom') {
                payload.customEmails = customEmails.split(/[\n,;]/).map(e => e.trim()).filter(Boolean);
            }
            const res = await fetch('/api/admin/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                showMsg(`✅ Broadcast started! ${data.total || data.sent || 0} recipients. ${data.message || ''}`);
                setSubject(''); setBody(''); setPreviewHtml(null);
                fetchHistory();
            } else {
                showMsg(data.error || 'Send failed', true);
            }
        } catch { showMsg('Send failed', true); }
        finally { setSending(false); }
    };

    // ── Test send (to admin) ──
    const handleTestSend = async () => {
        if (!subject || !body) { showMsg('Subject and body are required', true); return; }
        setSending(true);
        try {
            const res = await fetch('/api/admin/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: `[TEST] ${subject}`,
                    body,
                    audience: 'custom',
                    customEmails: ['daggu@live.com'], // admin email
                }),
            });
            const data = await res.json();
            if (data.success) showMsg('✅ Test email sent to your inbox!');
            else showMsg(data.error || 'Test send failed', true);
        } catch { showMsg('Test send failed', true); }
        finally { setSending(false); }
    };

    // ── History ──
    const fetchHistory = useCallback(async () => {
        setLoadingHistory(true);
        try {
            const res = await fetch('/api/admin/email/history');
            const data = await res.json();
            if (data.success) setBroadcasts(data.broadcasts);
        } catch { /* silent */ }
        finally { setLoadingHistory(false); }
    }, []);

    // ── Templates ──
    const fetchTemplates = useCallback(async () => {
        setLoadingTemplates(true);
        try {
            const res = await fetch('/api/admin/email/templates');
            const data = await res.json();
            if (data.success) setTemplates(data.templates);
        } catch { /* silent */ }
        finally { setLoadingTemplates(false); }
    }, []);

    const saveTemplate = async () => {
        if (!templateName || !subject || !body) { showMsg('Name, subject, and body required', true); return; }
        try {
            const res = await fetch('/api/admin/email/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: templateName, subject, body }),
            });
            const data = await res.json();
            if (data.success) { showMsg('✅ Template saved!'); setTemplateName(''); fetchTemplates(); }
            else showMsg(data.error || 'Save failed', true);
        } catch { showMsg('Save failed', true); }
    };

    const deleteTemplate = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/email/templates?id=${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) { showMsg('Template deleted'); fetchTemplates(); }
            else showMsg(data.error || 'Delete failed', true);
        } catch { showMsg('Delete failed', true); }
    };

    const loadTemplate = (t: Template) => {
        setSubject(t.subject); setBody(t.body); setTab('compose');
        showMsg(`Loaded template "${t.name}"`);
    };

    useEffect(() => {
        if (tab === 'history') fetchHistory();
        if (tab === 'templates') fetchTemplates();
    }, [tab, fetchHistory, fetchTemplates]);

    const tabStyle = (active: boolean): React.CSSProperties => ({
        padding: '10px 20px', borderRadius: '10px', cursor: 'pointer',
        fontWeight: 600, fontSize: '13px', border: 'none',
        backgroundColor: active ? 'rgba(45, 212, 191, 0.12)' : 'transparent',
        color: active ? '#2DD4BF' : 'var(--text-tertiary)',
        display: 'flex', alignItems: 'center', gap: '6px',
        transition: 'all 0.2s',
    });

    return (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 16px' }}>
            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ ...heading, fontSize: '28px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Mail size={28} style={{ color: '#2DD4BF' }} /> Email Broadcasts
                </h1>
                <p style={sub}>Send personalized emails to your users</p>
            </div>

            {/* Toast */}
            {msg && (
                <div style={{
                    padding: '12px 18px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', fontWeight: 600,
                    backgroundColor: msg.isError ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                    color: msg.isError ? '#EF4444' : '#22C55E',
                    border: `1px solid ${msg.isError ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
                }}>
                    {msg.text}
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '4px', border: '1px solid var(--border-color)' }}>
                <button onClick={() => setTab('compose')} style={tabStyle(tab === 'compose')}><Send size={14} /> Compose</button>
                <button onClick={() => setTab('history')} style={tabStyle(tab === 'history')}><History size={14} /> History</button>
                <button onClick={() => setTab('templates')} style={tabStyle(tab === 'templates')}><FileText size={14} /> Templates</button>
            </div>

            {/* ═══ COMPOSE TAB ═══ */}
            {tab === 'compose' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', alignItems: 'start' }}>
                    {/* Left: Compose form */}
                    <div style={{ ...card, padding: '24px' }}>
                        <h2 style={{ ...heading, fontSize: '16px', marginBottom: '20px' }}>Compose Email</h2>

                        {/* Subject */}
                        <label style={{ ...muted, fontWeight: 600, display: 'block', marginBottom: '6px' }}>SUBJECT LINE</label>
                        <input
                            type="text"
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            placeholder="e.g. Exciting new features on PMHNP Hiring!"
                            style={{ ...inputStyle, marginBottom: '16px' }}
                        />

                        {/* Body */}
                        <label style={{ ...muted, fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                            EMAIL BODY <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(Markdown supported)</span>
                        </label>
                        <textarea
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            placeholder={`Hi {{firstName}},\n\nWe're excited to share some news with you...\n\n**Bold text** and *italic text* work.\n\nBest,\nThe PMHNP Hiring Team`}
                            style={{ ...inputStyle, minHeight: '260px', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' }}
                        />

                        {/* Merge Tags */}
                        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ ...muted, fontWeight: 600 }}>Insert:</span>
                            {MERGE_TAGS.map(mt => (
                                <button
                                    key={mt.tag}
                                    onClick={() => setBody(prev => prev + mt.tag)}
                                    title={`Inserts the recipient's ${mt.label} (e.g. "${mt.example}")`}
                                    style={{
                                        padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
                                        backgroundColor: 'rgba(45,212,191,0.08)', color: '#2DD4BF',
                                        border: '1px solid rgba(45,212,191,0.2)', fontSize: '12px', fontWeight: 600,
                                        fontFamily: 'monospace',
                                    }}
                                >
                                    {mt.tag}
                                </button>
                            ))}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', flexWrap: 'wrap' }}>
                            <button onClick={handlePreview} disabled={!subject || !body} style={{ ...btnSecondary, opacity: (!subject || !body) ? 0.4 : 1 }}>
                                <Eye size={14} /> Preview
                            </button>
                            <button onClick={handleTestSend} disabled={sending || !subject || !body} style={{ ...btnSecondary, opacity: (sending || !subject || !body) ? 0.4 : 1 }}>
                                {sending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} Test Send
                            </button>
                            <button
                                onClick={() => { if (subject && body) setShowConfirm(true); }}
                                disabled={sending || !subject || !body}
                                style={{ ...btnPrimary, opacity: (sending || !subject || !body) ? 0.4 : 1 }}
                            >
                                <Send size={14} /> Send to {audienceInfo ? audienceInfo.count.toLocaleString() : '...'} Recipients
                            </button>
                        </div>
                    </div>

                    {/* Right: Sidebar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Audience Selector */}
                        <div style={{ ...card, padding: '20px' }}>
                            <h3 style={{ ...heading, fontSize: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Users size={14} style={{ color: '#A855F7' }} /> Audience
                            </h3>
                            <div style={{ position: 'relative' }}>
                                <select
                                    value={audience}
                                    onChange={e => setAudience(e.target.value as Audience)}
                                    style={{ ...inputStyle, appearance: 'none', paddingRight: '32px', cursor: 'pointer' }}
                                >
                                    {Object.entries(AUDIENCE_LABELS).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
                            </div>

                            {audience === 'custom' && (
                                <textarea
                                    value={customEmails}
                                    onChange={e => { setCustomEmails(e.target.value); }}
                                    onBlur={() => fetchAudience('custom')}
                                    placeholder="one@example.com&#10;two@example.com"
                                    style={{ ...inputStyle, marginTop: '10px', minHeight: '80px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
                                />
                            )}

                            {/* Audience count */}
                            <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)' }}>
                                {loadingAudience ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', ...muted }}>
                                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Loading...
                                    </div>
                                ) : audienceInfo ? (
                                    <>
                                        <div style={{ fontSize: '22px', fontWeight: 800, color: '#2DD4BF' }}>
                                            {audienceInfo.count.toLocaleString()}
                                        </div>
                                        <div style={muted}>recipients</div>
                                        {audienceInfo.sample.length > 0 && (
                                            <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                                                <div style={{ ...muted, fontWeight: 600, marginBottom: '4px' }}>Sample:</div>
                                                {audienceInfo.sample.map((s, i) => (
                                                    <div key={i} style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {s.firstName ? `${s.firstName} · ` : ''}{s.email}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : null}
                            </div>
                        </div>

                        {/* Quick save as template */}
                        <div style={{ ...card, padding: '20px' }}>
                            <h3 style={{ ...heading, fontSize: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FileText size={14} style={{ color: '#F59E0B' }} /> Save as Template
                            </h3>
                            <input
                                type="text"
                                value={templateName}
                                onChange={e => setTemplateName(e.target.value)}
                                placeholder="Template name..."
                                style={{ ...inputStyle, marginBottom: '10px' }}
                            />
                            <button
                                onClick={saveTemplate}
                                disabled={!templateName || !subject || !body}
                                style={{ ...btnSecondary, width: '100%', justifyContent: 'center', opacity: (!templateName || !subject || !body) ? 0.4 : 1 }}
                            >
                                <Plus size={14} /> Save Template
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview Modal */}
            {previewHtml && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '24px',
                }}
                    onClick={() => setPreviewHtml(null)}
                >
                    <div
                        style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#0F1923', border: '1px solid var(--border-color)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ padding: '16px 20px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ ...heading, fontSize: '14px' }}>📧 Email Preview</span>
                            <button onClick={() => setPreviewHtml(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
                        </div>
                        <iframe
                            srcDoc={previewHtml}
                            style={{ width: '100%', height: '70vh', border: 'none', backgroundColor: '#060E18' }}
                            title="Email Preview"
                        />
                    </div>
                </div>
            )}

            {/* Confirm Modal */}
            {showConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '24px',
                }}>
                    <div style={{ maxWidth: '440px', width: '100%', ...card, padding: '28px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <AlertTriangle size={24} style={{ color: '#F59E0B' }} />
                            <h3 style={{ ...heading, fontSize: '18px' }}>Confirm Send</h3>
                        </div>
                        <p style={{ ...sub, lineHeight: '1.6', marginBottom: '8px' }}>
                            You are about to send <strong style={{ color: 'var(--text-primary)' }}>&quot;{subject}&quot;</strong> to{' '}
                            <strong style={{ color: '#2DD4BF' }}>{audienceInfo?.count.toLocaleString() || 0}</strong> recipients.
                        </p>
                        <p style={{ ...muted, marginBottom: '24px' }}>This action cannot be undone.</p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowConfirm(false)} style={btnSecondary}>Cancel</button>
                            <button onClick={handleSend} style={{ ...btnPrimary, backgroundColor: '#F59E0B' }}>
                                <Send size={14} /> Confirm & Send
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ HISTORY TAB ═══ */}
            {tab === 'history' && (
                <div style={{ ...card, padding: 0 }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ ...heading, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <History size={18} style={{ color: '#3B82F6' }} /> Send History
                        </h2>
                        <button onClick={fetchHistory} style={btnSecondary}>{loadingHistory ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Refresh'}</button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['Subject', 'Audience', 'Recipients', 'Sent', 'Failed', 'Status', 'Date'].map(h => (
                                        <th key={h} style={{
                                            padding: '12px 16px', textAlign: h === 'Subject' || h === 'Audience' || h === 'Status' || h === 'Date' ? 'left' : 'right',
                                            fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                                            letterSpacing: '0.05em', color: 'var(--text-tertiary)',
                                            backgroundColor: 'var(--bg-tertiary)',
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {broadcasts.map(b => (
                                    <tr key={b.id}>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {b.subject}
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                                            {b.audience.replace('_', ' ')}
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>
                                            {b.audienceCount.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#22C55E', fontWeight: 600, borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>
                                            {b.sentCount.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', color: b.failedCount > 0 ? '#EF4444' : 'var(--text-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>
                                            {b.failedCount}
                                        </td>
                                        <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
                                            {statusBadge(b.status)}
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                                            {new Date(b.sentAt || b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                        </td>
                                    </tr>
                                ))}
                                {broadcasts.length === 0 && (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '40px', textAlign: 'center', ...sub }}>
                                            No broadcasts sent yet. Go to the Compose tab to send your first email!
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══ TEMPLATES TAB ═══ */}
            {tab === 'templates' && (
                <div>
                    {loadingTemplates ? (
                        <div style={{ textAlign: 'center', padding: '60px' }}>
                            <Loader2 size={24} style={{ color: '#2DD4BF', animation: 'spin 1s linear infinite' }} />
                        </div>
                    ) : templates.length === 0 ? (
                        <div style={{ ...card, padding: '40px', textAlign: 'center' }}>
                            <FileText size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
                            <p style={sub}>No templates saved yet.</p>
                            <p style={muted}>Compose an email and save it as a template for reuse.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                            {templates.map(t => (
                                <div key={t.id} style={{ ...card, padding: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                        <div>
                                            <h3 style={{ ...heading, fontSize: '15px', marginBottom: '2px' }}>{t.name}</h3>
                                            <p style={{ ...muted, fontSize: '11px' }}>
                                                Updated {new Date(t.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </p>
                                        </div>
                                        <button onClick={() => deleteTemplate(t.id)} style={btnDanger}>
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                    <div style={{ ...inputStyle, backgroundColor: 'var(--bg-tertiary)', marginBottom: '10px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {t.subject}
                                    </div>
                                    <div style={{ ...muted, marginBottom: '14px', maxHeight: '60px', overflow: 'hidden', lineHeight: '1.5' }}>
                                        {t.body.substring(0, 120)}{t.body.length > 120 ? '...' : ''}
                                    </div>
                                    <button onClick={() => loadTemplate(t)} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', fontSize: '12px', padding: '8px' }}>
                                        Load Template
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Keyframe for spinner */}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
