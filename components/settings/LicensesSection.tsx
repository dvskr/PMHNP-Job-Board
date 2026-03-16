'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit3, Trash2, Save, Loader2, X, Award } from 'lucide-react'

// ── Constants ──
const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]
const LICENSE_TYPES = ['RN', 'APRN', 'Compact (NLC)', 'Compact (APRN)']
const STATUSES = [
    { label: 'Active', value: 'active' },
    { label: 'Inactive', value: 'inactive' },
    { label: 'Restricted', value: 'restricted' },
]

interface License {
    id: string
    licenseType: string
    licenseNumber: string
    licenseState: string
    expirationDate: string | null
    status: string
}

type LicenseFormData = Omit<License, 'id'>

const emptyForm: LicenseFormData = {
    licenseType: '',
    licenseNumber: '',
    licenseState: '',
    expirationDate: '',
    status: 'active',
}

// ── Styles (matches settings page) ──
const cardStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '28px',
}
const cardTitle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '20px',
}
const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
}
const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
}
const btnPrimary: React.CSSProperties = {
    padding: '10px 28px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.3s',
}
const btnOutline: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: '8px',
    background: 'transparent',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s',
}

function maskNumber(num: string): string {
    if (num.length <= 4) return num
    return '•'.repeat(num.length - 4) + num.slice(-4)
}

function formatDate(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    })
}

function toInputDate(iso: string | null): string {
    if (!iso) return ''
    return new Date(iso).toISOString().slice(0, 10)
}

interface Props {
    showMsg: (type: 'success' | 'error', text: string) => void
}

export default function LicensesSection({ showMsg }: Props) {
    const [licenses, setLicenses] = useState<License[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState<LicenseFormData>({ ...emptyForm })
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    const fetchLicenses = useCallback(async () => {
        try {
            const res = await fetch('/api/profile/licenses')
            if (res.ok) {
                setLicenses(await res.json())
            }
        } catch {
            // silent
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchLicenses()
    }, [fetchLicenses])

    const handleSave = async () => {
        if (!form.licenseType || !form.licenseNumber || !form.licenseState) {
            showMsg('error', 'License type, number, and state are required.')
            return
        }
        setSaving(true)
        try {
            const isEdit = editingId !== null
            const url = isEdit ? `/api/profile/licenses/${editingId}` : '/api/profile/licenses'
            const method = isEdit ? 'PUT' : 'POST'

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    expirationDate: form.expirationDate || null,
                }),
            })
            if (!res.ok) throw new Error('Failed')

            showMsg('success', isEdit ? 'License updated!' : 'License added!')
            setShowForm(false)
            setEditingId(null)
            setForm({ ...emptyForm })
            await fetchLicenses()
        } catch {
            showMsg('error', 'Failed to save license.')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        setDeletingId(id)
        try {
            const res = await fetch(`/api/profile/licenses/${id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed')
            showMsg('success', 'License deleted.')
            setConfirmDeleteId(null)
            await fetchLicenses()
        } catch {
            showMsg('error', 'Failed to delete license.')
        } finally {
            setDeletingId(null)
        }
    }

    const startEdit = (lic: License) => {
        setEditingId(lic.id)
        setForm({
            licenseType: lic.licenseType,
            licenseNumber: lic.licenseNumber,
            licenseState: lic.licenseState,
            expirationDate: toInputDate(lic.expirationDate),
            status: lic.status,
        })
        setShowForm(true)
    }

    const cancelForm = () => {
        setShowForm(false)
        setEditingId(null)
        setForm({ ...emptyForm })
    }

    const statusColor = (s: string) => {
        if (s === 'active') return { bg: 'rgba(45,212,191,0.12)', text: '#2DD4BF' }
        if (s === 'inactive') return { bg: 'rgba(156,163,175,0.15)', text: '#9CA3AF' }
        return { bg: 'rgba(251,146,60,0.12)', text: '#FB923C' }
    }

    return (
        <div style={cardStyle}>
            <h3 style={cardTitle}>
                <Award size={20} style={{ color: '#F59E0B' }} />
                Licenses
            </h3>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    <Loader2 size={20} className="animate-spin" style={{ display: 'inline' }} />
                </div>
            ) : (
                <>
                    {/* Existing licenses list */}
                    {licenses.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: showForm ? '20px' : '16px' }}>
                            {licenses.map((lic) => (
                                <div
                                    key={lic.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '14px 18px',
                                        borderRadius: '12px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-primary)',
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                                                {lic.licenseType}
                                            </span>
                                            <span style={{
                                                padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                                background: statusColor(lic.status).bg,
                                                color: statusColor(lic.status).text,
                                            }}>
                                                {lic.status.charAt(0).toUpperCase() + lic.status.slice(1)}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                            <span>State: <strong>{lic.licenseState}</strong></span>
                                            <span>No: <strong>{maskNumber(lic.licenseNumber)}</strong></span>
                                            <span>Exp: <strong>{formatDate(lic.expirationDate)}</strong></span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '6px', marginLeft: '12px', flexShrink: 0 }}>
                                        <button
                                            onClick={() => startEdit(lic)}
                                            style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px' }}
                                            title="Edit"
                                        >
                                            <Edit3 size={14} /> Edit
                                        </button>

                                        {confirmDeleteId === lic.id ? (
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button
                                                    onClick={() => handleDelete(lic.id)}
                                                    disabled={deletingId === lic.id}
                                                    style={{
                                                        ...btnOutline,
                                                        padding: '6px 10px',
                                                        fontSize: '12px',
                                                        borderColor: '#EF4444',
                                                        color: '#EF4444',
                                                    }}
                                                >
                                                    {deletingId === lic.id ? <Loader2 size={14} className="animate-spin" /> : 'Yes'}
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDeleteId(null)}
                                                    style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px' }}
                                                >
                                                    No
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmDeleteId(lic.id)}
                                                style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px', color: '#EF4444' }}
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {licenses.length === 0 && !showForm && (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
                            No licenses added yet. Add your professional licenses to autofill applications.
                        </p>
                    )}

                    {/* Inline form */}
                    {showForm && (
                        <div style={{
                            padding: '20px',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-primary)',
                            marginBottom: '16px',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                                    {editingId ? 'Edit License' : 'Add License'}
                                </h4>
                                <button onClick={cancelForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={18} />
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                    <div>
                                        <label style={labelStyle}>License Type *</label>
                                        <select
                                            value={form.licenseType}
                                            onChange={(e) => setForm({ ...form, licenseType: e.target.value })}
                                            style={{ ...inputStyle, cursor: 'pointer' }}
                                        >
                                            <option value="">Select type</option>
                                            {LICENSE_TYPES.map((t) => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>License State *</label>
                                        <select
                                            value={form.licenseState}
                                            onChange={(e) => setForm({ ...form, licenseState: e.target.value })}
                                            style={{ ...inputStyle, cursor: 'pointer' }}
                                        >
                                            <option value="">Select state</option>
                                            {US_STATES.map((s) => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label style={labelStyle}>License Number *</label>
                                    <input
                                        type="text"
                                        value={form.licenseNumber}
                                        onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                                        placeholder="Enter license number"
                                        style={inputStyle}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                    <div>
                                        <label style={labelStyle}>Expiration Date</label>
                                        <input
                                            type="date"
                                            value={form.expirationDate || ''}
                                            onChange={(e) => setForm({ ...form, expirationDate: e.target.value })}
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Status</label>
                                        <select
                                            value={form.status}
                                            onChange={(e) => setForm({ ...form, status: e.target.value })}
                                            style={{ ...inputStyle, cursor: 'pointer' }}
                                        >
                                            {STATUSES.map((s) => (
                                                <option key={s.value} value={s.value}>{s.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                                    <button onClick={cancelForm} style={btnOutline}>Cancel</button>
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        style={{
                                            ...btnPrimary,
                                            ...(saving ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                                        }}
                                    >
                                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        {saving ? 'Saving...' : editingId ? 'Update License' : 'Save License'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Add button */}
                    {!showForm && (
                        <button
                            onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setShowForm(true) }}
                            style={{
                                ...btnOutline,
                                borderStyle: 'dashed',
                                width: '100%',
                                justifyContent: 'center',
                                padding: '12px',
                                color: '#2DD4BF',
                                borderColor: 'rgba(45,212,191,0.4)',
                            }}
                        >
                            <Plus size={16} /> Add License
                        </button>
                    )}
                </>
            )}
        </div>
    )
}
