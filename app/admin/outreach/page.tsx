'use client';

import { useState, useEffect } from 'react';
import { Plus, Mail, Copy, Check } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

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

const STATUS_COLORS: Record<string, string> = {
  prospect: 'bg-gray-100 text-gray-700',
  contacted: 'bg-teal-100 text-teal-700',
  responded: 'bg-purple-100 text-purple-700',
  converted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
};

export default function OutreachPage() {
  const [leads, setLeads] = useState<EmployerLead[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<string>('prospect');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    companyName: '',
    contactName: '',
    contactEmail: '',
    notes: '',
    source: 'manual',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch all leads
      const leadsRes = await fetch('/api/outreach');
      const leadsData = await leadsRes.json();
      
      // Fetch suggestions
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

    if (!dataToSubmit.companyName) {
      alert('Company name is required');
      return;
    }

    try {
      const res = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          ...dataToSubmit,
        }),
      });

      const data = await res.json();
      
      if (data.success) {
        await fetchData();
        setShowAddForm(false);
        setFormData({
          companyName: '',
          contactName: '',
          contactEmail: '',
          notes: '',
          source: 'manual',
        });
        
        // Remove from suggestions if added from there
        if (companyName) {
          setSuggestions((prev: string[]) => prev.filter((s: string) => s !== companyName));
        }
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
        body: JSON.stringify({
          action: 'update',
          id: leadId,
          status: newStatus,
        }),
      });

      const data = await res.json();
      
      if (data.success) {
        await fetchData();
      }
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
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading outreach data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Employer Outreach</h1>
        <p className="text-gray-600">Manage your employer leads and outreach campaigns</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        <Card padding="md" variant="bordered">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600">Total Leads</div>
          </div>
        </Card>
        <Card padding="md" variant="bordered" className="bg-gray-50">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-700">{stats.prospects}</div>
            <div className="text-sm text-gray-600">Prospects</div>
          </div>
        </Card>
        <Card padding="md" variant="bordered" className="bg-teal-50">
          <div className="text-center">
            <div className="text-2xl font-bold text-teal-700">{stats.contacted}</div>
            <div className="text-sm text-teal-600">Contacted</div>
          </div>
        </Card>
        <Card padding="md" variant="bordered" className="bg-purple-50">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-700">{stats.responded}</div>
            <div className="text-sm text-purple-600">Responded</div>
          </div>
        </Card>
        <Card padding="md" variant="bordered" className="bg-green-50">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-700">{stats.converted}</div>
            <div className="text-sm text-green-600">Converted</div>
          </div>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Button
          variant="primary"
          size="md"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus size={18} />
          Add New Lead
        </Button>
        <Button
          variant="outline"
          size="md"
          onClick={() => setShowTemplates(!showTemplates)}
        >
          <Mail size={18} />
          Email Templates
        </Button>
      </div>

      {/* Add Lead Form */}
      {showAddForm && (
        <Card padding="lg" variant="bordered" className="mb-6">
          <h3 className="text-lg font-semibold mb-4">Add New Lead</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name *
              </label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="e.g., Talkiatry"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Name
              </label>
              <input
                type="text"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="e.g., Sarah Johnson"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Email
              </label>
              <input
                type="email"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="e.g., hr@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source
              </label>
              <input
                type="text"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="e.g., LinkedIn"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              rows={3}
              placeholder="Any additional notes..."
            />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="md" onClick={() => handleAddLead()}>
              Add Lead
            </Button>
            <Button variant="outline" size="md" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Email Templates */}
      {showTemplates && (
        <Card padding="lg" variant="bordered" className="mb-6">
          <h3 className="text-lg font-semibold mb-4">Email Templates</h3>
          <div className="space-y-4">
            {(['initial', 'followUp', 'freeOffer'] as const).map((template: 'initial' | 'followUp' | 'freeOffer') => (
              <div key={template} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900 capitalize">
                    {template === 'followUp' ? 'Follow Up' : template === 'freeOffer' ? 'Free Offer' : 'Initial Outreach'}
                  </h4>
                  <button
                    onClick={() => handleCopyTemplate(template)}
                    className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"
                  >
                    {copiedTemplate === template ? (
                      <>
                        <Check size={16} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        Copy Template
                      </>
                    )}
                  </button>
                </div>
                <p className="text-sm text-gray-600">
                  {template === 'initial' && 'First outreach to potential employers'}
                  {template === 'followUp' && 'Follow-up for non-responders'}
                  {template === 'freeOffer' && 'Special free posting offer'}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Suggested Targets */}
      {suggestions.length > 0 && (
        <Card padding="lg" variant="bordered" className="mb-6">
          <h3 className="text-lg font-semibold mb-4">Companies to Reach Out To</h3>
          <p className="text-sm text-gray-600 mb-4">
            Top companies actively hiring PMHNPs (3+ job postings)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggestions.slice(0, 12).map((company: string) => (
              <div
                key={company}
                className="flex items-center justify-between border border-gray-200 rounded-lg p-3"
              >
                <span className="font-medium text-gray-900 text-sm">{company}</span>
                <button
                  onClick={() => handleAddLead(company)}
                  className="text-primary-600 hover:text-primary-700 text-sm"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Lead Pipeline - Tabs */}
      <Card padding="none" variant="bordered">
        {/* Tab Headers */}
        <div className="border-b border-gray-200 overflow-x-auto">
          <div className="flex min-w-max">
            {STATUS_OPTIONS.map((status: string) => {
              const count = leads.filter((l: EmployerLead) => l.status === status).length;
              return (
                <button
                  key={status}
                  onClick={() => setActiveStatus(status)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors capitalize ${
                    activeStatus === status
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {status} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {filteredLeads.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No leads in this status</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredLeads.map((lead: EmployerLead) => (
                <div
                  key={lead.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-gray-900 text-lg">
                        {lead.companyName}
                      </h4>
                      {lead.contactName && (
                        <p className="text-sm text-gray-600">{lead.contactName}</p>
                      )}
                      {lead.contactEmail && (
                        <p className="text-sm text-gray-500">{lead.contactEmail}</p>
                      )}
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        STATUS_COLORS[lead.status]
                      }`}
                    >
                      {lead.status}
                    </span>
                  </div>

                  {lead.lastContactedAt && (
                    <p className="text-xs text-gray-500 mb-2">
                      Last contacted: {new Date(lead.lastContactedAt).toLocaleDateString()}
                    </p>
                  )}

                  {lead.notes && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {lead.notes}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <select
                      value={lead.status}
                      onChange={(e) => handleUpdateStatus(lead.id, e.target.value)}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      {STATUS_OPTIONS.map((status: string) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleCopyTemplate('initial', lead)}
                      className="text-sm text-primary-600 hover:text-primary-700 px-2 py-1"
                    >
                      Copy Email
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

