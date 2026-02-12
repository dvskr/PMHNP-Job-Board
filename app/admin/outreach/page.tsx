'use client';

import { useState, useEffect } from 'react';
import { Plus, Mail, Copy, Check } from 'lucide-react';

interface EmployerLead {
  id: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactTitle: string | null;
  website: string | null;
  linkedInUrl: string | null;
  notes: string | null;
  status: string;
  source: string | null;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  jobsPosted: number;
  createdAt: Date;
  updatedAt: Date;
}

const STATUS_OPTIONS = ['prospect', 'contacted', 'responded', 'converted', 'declined'];

const STATUS_BADGE_STYLES: Record<string, React.CSSProperties> = {
  prospect: { backgroundColor: 'rgba(148, 163, 184, 0.15)', color: '#94A3B8' },
  contacted: { backgroundColor: 'rgba(45, 212, 191, 0.15)', color: '#2DD4BF' },
  responded: { backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#A855F7' },
  converted: { backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22C55E' },
  declined: { backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' },
};

/* ─── Shared styles ─── */
const card: React.CSSProperties = {
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '14px',
  overflow: 'hidden',
};
const heading: React.CSSProperties = { color: 'var(--text-primary)', fontWeight: 700 };
const sub: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px' };
const muted: React.CSSProperties = { color: 'var(--text-tertiary)', fontSize: '12px' };
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '10px',
  backgroundColor: 'var(--bg-tertiary)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
};
const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '8px',
  padding: '10px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
  backgroundColor: '#2DD4BF', color: '#0F172A', fontWeight: 700, fontSize: '13px',
  transition: 'opacity 0.2s',
};
const btnOutline: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '8px',
  padding: '10px 20px', borderRadius: '10px', cursor: 'pointer',
  backgroundColor: 'transparent', border: '1px solid var(--border-color)',
  color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px',
  transition: 'opacity 0.2s',
};

export default function OutreachPage() {
  const [leads, setLeads] = useState<EmployerLead[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<string>('prospect');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    companyName: '',
    contactName: '',
    contactEmail: '',
    notes: '',
    source: 'manual',
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const leadsRes = await fetch('/api/outreach');
      const leadsData = await leadsRes.json();
      const suggestionsRes = await fetch('/api/outreach?suggestions=true');
      const suggestionsData = await suggestionsRes.json();
      if (leadsData.success) setLeads(leadsData.data);
      if (suggestionsData.success) setSuggestions(suggestionsData.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStats = () => {
    const prospects = leads.filter((l: EmployerLead) => l.status === 'prospect').length;
    const contacted = leads.filter((l: EmployerLead) => l.status === 'contacted').length;
    const converted = leads.filter((l: EmployerLead) => l.status === 'converted').length;
    const responded = leads.filter((l: EmployerLead) => l.status === 'responded').length;
    return { prospects, contacted, converted, responded, total: leads.length };
  };

  const handleAddLead = async (companyName?: string) => {
    const dataToSubmit = companyName
      ? { companyName, source: 'suggestions' }
      : formData;

    if (!dataToSubmit.companyName) { alert('Company name is required'); return; }

    try {
      const res = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', ...dataToSubmit }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchData();
        setShowAddForm(false);
        setFormData({ companyName: '', contactName: '', contactEmail: '', notes: '', source: 'manual' });
        if (companyName) setSuggestions((prev: string[]) => prev.filter((s: string) => s !== companyName));
      }
    } catch (error) {
      console.error('Error adding lead:', error);
      alert('Failed to add lead');
    }
  };

  const handleUpdateStatus = async (leadId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: leadId, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) await fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  const handleCopyTemplate = async (templateName: string, lead?: EmployerLead) => {
    try {
      const res = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'render-template',
          templateName,
          variables: {
            companyName: lead?.companyName || '[Company Name]',
            contactName: lead?.contactName,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        const text = `Subject: ${data.data.subject}\n\n${data.data.body}`;
        await navigator.clipboard.writeText(text);
        setCopiedTemplate(templateName);
        setTimeout(() => setCopiedTemplate(null), 2000);
      }
    } catch (error) {
      console.error('Error copying template:', error);
    }
  };

  const stats = getStats();
  const filteredLeads = leads.filter((l: EmployerLead) => l.status === activeStatus);

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', paddingTop: '80px', paddingRight: '16px', paddingBottom: '32px', paddingLeft: '16px', textAlign: 'center' }}>
        <div
          style={{
            width: 48, height: 48, border: '3px solid var(--border-color)',
            borderTop: '3px solid #2DD4BF', borderRadius: '50%',
            margin: '0 auto', animation: 'spin 0.8s linear infinite',
          }}
        />
        <p style={{ marginTop: '16px', ...sub }}>Loading outreach data…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingTop: '32px', paddingRight: '16px', paddingBottom: '32px', paddingLeft: '16px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ ...heading, fontSize: '28px', marginBottom: '4px' }}>Employer Outreach</h1>
        <p style={sub}>Manage your employer leads and outreach campaigns</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4" style={{ marginBottom: '28px' }}>
        {[
          { label: 'Total Leads', value: stats.total, color: 'var(--text-primary)' },
          { label: 'Prospects', value: stats.prospects, color: '#94A3B8' },
          { label: 'Contacted', value: stats.contacted, color: '#2DD4BF' },
          { label: 'Responded', value: stats.responded, color: '#A855F7' },
          { label: 'Converted', value: stats.converted, color: '#22C55E' },
        ].map((s) => (
          <div key={s.label} style={{ ...card, padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={muted}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
        <button style={btnPrimary} onClick={() => setShowAddForm(!showAddForm)}>
          <Plus size={18} /> Add New Lead
        </button>
        <button style={btnOutline} onClick={() => setShowTemplates(!showTemplates)}>
          <Mail size={18} /> Email Templates
        </button>
      </div>

      {/* Add Lead Form */}
      {showAddForm && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ ...heading, fontSize: '16px', marginBottom: '16px' }}>Add New Lead</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', ...muted, fontWeight: 600, marginBottom: '6px' }}>Company Name *</label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                style={inputStyle}
                placeholder="e.g., Talkiatry"
              />
            </div>
            <div>
              <label style={{ display: 'block', ...muted, fontWeight: 600, marginBottom: '6px' }}>Contact Name</label>
              <input
                type="text"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                style={inputStyle}
                placeholder="e.g., Sarah Johnson"
              />
            </div>
            <div>
              <label style={{ display: 'block', ...muted, fontWeight: 600, marginBottom: '6px' }}>Contact Email</label>
              <input
                type="email"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                style={inputStyle}
                placeholder="e.g., hr@company.com"
              />
            </div>
            <div>
              <label style={{ display: 'block', ...muted, fontWeight: 600, marginBottom: '6px' }}>Source</label>
              <input
                type="text"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                style={inputStyle}
                placeholder="e.g., LinkedIn"
              />
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', ...muted, fontWeight: 600, marginBottom: '6px' }}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              style={{ ...inputStyle, resize: 'vertical' }}
              rows={3}
              placeholder="Any additional notes..."
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={btnPrimary} onClick={() => handleAddLead()}>Add Lead</button>
            <button style={btnOutline} onClick={() => setShowAddForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Email Templates */}
      {showTemplates && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ ...heading, fontSize: '16px', marginBottom: '16px' }}>Email Templates</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(['initial', 'followUp', 'freeOffer'] as const).map((template) => (
              <div
                key={template}
                style={{
                  border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <h4 style={{ ...heading, fontSize: '14px', textTransform: 'capitalize' }}>
                    {template === 'followUp' ? 'Follow Up' : template === 'freeOffer' ? 'Free Offer' : 'Initial Outreach'}
                  </h4>
                  <button
                    onClick={() => handleCopyTemplate(template)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      fontSize: '13px', color: '#2DD4BF', background: 'none',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    {copiedTemplate === template ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Template</>}
                  </button>
                </div>
                <p style={sub}>
                  {template === 'initial' && 'First outreach to potential employers'}
                  {template === 'followUp' && 'Follow-up for non-responders'}
                  {template === 'freeOffer' && 'Special free posting offer'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Targets */}
      {suggestions.length > 0 && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ ...heading, fontSize: '16px', marginBottom: '6px' }}>Companies to Reach Out To</h3>
          <p style={{ ...sub, marginBottom: '16px' }}>Top companies actively hiring PMHNPs (3+ job postings)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggestions.slice(0, 12).map((company: string) => (
              <div
                key={company}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 16px',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{company}</span>
                <button
                  onClick={() => handleAddLead(company)}
                  style={{
                    fontSize: '13px', color: '#2DD4BF', background: 'none',
                    border: 'none', cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lead Pipeline - Tabs */}
      <div style={card}>
        {/* Tab Headers */}
        <div style={{ borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
          <div style={{ display: 'flex', minWidth: 'max-content' }}>
            {STATUS_OPTIONS.map((status: string) => {
              const count = leads.filter((l: EmployerLead) => l.status === status).length;
              const active = activeStatus === status;
              return (
                <button
                  key={status}
                  onClick={() => setActiveStatus(status)}
                  style={{
                    padding: '14px 24px', fontSize: '13px', fontWeight: active ? 700 : 500,
                    borderBottom: active ? '2px solid #2DD4BF' : '2px solid transparent',
                    color: active ? '#2DD4BF' : 'var(--text-tertiary)',
                    background: 'none', border: 'none', borderBottomWidth: '2px',
                    borderBottomStyle: 'solid', cursor: 'pointer',
                    textTransform: 'capitalize', transition: 'color 0.2s',
                  }}
                >
                  {status} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '24px' }}>
          {filteredLeads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={sub}>No leads in this status</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredLeads.map((lead: EmployerLead) => (
                <div
                  key={lead.id}
                  style={{
                    border: '1px solid var(--border-color)', borderRadius: '12px',
                    padding: '18px', transition: 'border-color 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ ...heading, fontSize: '16px' }}>{lead.companyName}</h4>
                      {lead.contactName && <p style={sub}>{lead.contactName}</p>}
                      {lead.contactEmail && <p style={muted}>{lead.contactEmail}</p>}
                    </div>
                    <span
                      style={{
                        padding: '4px 12px', borderRadius: '20px', fontSize: '11px',
                        fontWeight: 600, textTransform: 'capitalize',
                        ...(STATUS_BADGE_STYLES[lead.status] || {}),
                      }}
                    >
                      {lead.status}
                    </span>
                  </div>

                  {lead.lastContactedAt && (
                    <p style={{ ...muted, marginBottom: '8px' }}>
                      Last contacted: {new Date(lead.lastContactedAt).toLocaleDateString()}
                    </p>
                  )}

                  {lead.notes && (
                    <p style={{ ...sub, marginBottom: '12px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {lead.notes}
                    </p>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                    <select
                      value={lead.status}
                      onChange={(e) => handleUpdateStatus(lead.id, e.target.value)}
                      style={{
                        padding: '6px 12px', borderRadius: '8px', fontSize: '13px',
                        backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)', outline: 'none',
                      }}
                    >
                      {STATUS_OPTIONS.map((status: string) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleCopyTemplate('initial', lead)}
                      style={{
                        fontSize: '13px', color: '#2DD4BF', background: 'none',
                        border: 'none', cursor: 'pointer', fontWeight: 600,
                        padding: '6px 12px',
                      }}
                    >
                      Copy Email
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
