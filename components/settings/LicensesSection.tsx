'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit3, Trash2, Save, Loader2, X, Award } from 'lucide-react'
import {
    clayCard, clayInnerCard, clayFormPanel, clayTitle, claySubTitle,
    clayInput, clayLabel, clayBtnPrimary, clayBtnOutlineSmall, clayPalette,
} from './clay-tokens'

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

// ── Local aliases (clay-tokens.ts owns the values) ──
const cardStyle = clayCard
const cardTitle = clayTitle
const labelStyle = clayLabel
const inputStyle = clayInput
const btnPrimary = clayBtnPrimary
const btnOutline = clayBtnOutlineSmall

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

    // Inline form: rendered under the active edit row, or at the
    // bottom in add mode. See WorkExperienceSection for the same pattern.
    const renderForm = () => (
        <div style={clayFormPanel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={claySubTitle}>
                    {editingId ? 'Edit License' : 'Add License'}
                </h4>
                <button onClick={cancelForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: clayPalette.textMuted }}>
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
                    <button onClick={cancelForm} disabled={saving} style={{ ...btnOutline, opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>Cancel</button>
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
    );

    return (
        <div style={cardStyle}>
            <h3 style={cardTitle}>
                <Award size={20} style={{ color: clayPalette.warning }} />
                Licenses
            </h3>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '24px', color: clayPalette.textMuted }}>
                    <Loader2 size={20} className="animate-spin" style={{ display: 'inline' }} />
                </div>
            ) : (
                <>
                    {/* Existing licenses list */}
                    {licenses.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: showForm ? '20px' : '16px' }}>
                            {licenses.map((lic) => (
                                <div key={lic.id}>
                                    <div style={{ ...clayInnerCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 700, fontSize: '14px', color: clayPalette.textPrimary }}>
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
                                            <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px', color: clayPalette.textSecondary }}>
                                                <span>State: <strong>{lic.licenseState}</strong></span>
                                                <span>No: <strong>{maskNumber(lic.licenseNumber)}</strong></span>
                                                <span>Exp: <strong>{formatDate(lic.expirationDate)}</strong></span>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '6px', marginLeft: '12px', flexShrink: 0 }}>
                                            <button onClick={() => startEdit(lic)} style={btnOutline} title="Edit">
                                                <Edit3 size={14} /> Edit
                                            </button>

                                            {confirmDeleteId === lic.id ? (
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button
                                                        onClick={() => handleDelete(lic.id)}
                                                        disabled={deletingId === lic.id}
                                                        style={{ ...btnOutline, borderColor: 'rgba(239,68,68,0.4)', color: clayPalette.dangerLight }}
                                                    >
                                                        {deletingId === lic.id ? <Loader2 size={14} className="animate-spin" /> : 'Yes'}
                                                    </button>
                                                    <button onClick={() => setConfirmDeleteId(null)} style={btnOutline}>No</button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setConfirmDeleteId(lic.id)} style={{ ...btnOutline, color: clayPalette.dangerLight }} title="Delete">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {showForm && editingId === lic.id && (
                                        <div style={{ marginTop: '10px' }}>{renderForm()}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {licenses.length === 0 && !showForm && (
                        <p style={{ color: clayPalette.textMuted, fontSize: '13px', marginBottom: '16px' }}>
                            No licenses added yet. Add your professional licenses to autofill applications.
                        </p>
                    )}

                    {showForm && editingId === null && renderForm()}

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
                                color: clayPalette.accentLight,
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
