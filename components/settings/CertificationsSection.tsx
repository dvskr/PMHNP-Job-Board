'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit3, Trash2, Save, Loader2, X, ShieldCheck } from 'lucide-react'

// ── Constants ──
const CERT_NAME_OPTIONS = [
    'PMHNP-BC', 'FNP-BC', 'FNP-C', 'AGPCNP-BC', 'AGACNP-BC',
    'CAQ-Psych', 'BLS', 'ACLS', 'CPI/CPI-NV', 'CARN', 'Other',
]
const BODY_OPTIONS = ['ANCC', 'AANP', 'AHA', 'CPI', 'Other']

interface Certification {
    id: string
    certificationName: string
    certifyingBody: string | null
    certificationNumber: string | null
    expirationDate: string | null
}

interface CertFormData {
    certificationName: string
    certificationNameOther: string
    certifyingBody: string
    certifyingBodyOther: string
    certificationNumber: string
    expirationDate: string
}

const emptyForm: CertFormData = {
    certificationName: '',
    certificationNameOther: '',
    certifyingBody: '',
    certifyingBodyOther: '',
    certificationNumber: '',
    expirationDate: '',
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

function maskNumber(num: string | null): string {
    if (!num) return '—'
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

/** Determine if a stored name is a known preset or "Other" */
function resolveNameDropdown(name: string): { dropdown: string; other: string } {
    const known = CERT_NAME_OPTIONS.filter((o) => o !== 'Other')
    if (known.includes(name)) return { dropdown: name, other: '' }
    return { dropdown: 'Other', other: name }
}

function resolveBodyDropdown(body: string | null): { dropdown: string; other: string } {
    if (!body) return { dropdown: '', other: '' }
    const known = BODY_OPTIONS.filter((o) => o !== 'Other')
    if (known.includes(body)) return { dropdown: body, other: '' }
    return { dropdown: 'Other', other: body }
}

interface Props {
    showMsg: (type: 'success' | 'error', text: string) => void
}

export default function CertificationsSection({ showMsg }: Props) {
    const [certs, setCerts] = useState<Certification[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState<CertFormData>({ ...emptyForm })
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    const fetchCerts = useCallback(async () => {
        try {
            const res = await fetch('/api/profile/certifications')
            if (res.ok) setCerts(await res.json())
        } catch {
            // silent
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchCerts()
    }, [fetchCerts])

    const getPayloadName = (): string =>
        form.certificationName === 'Other' ? form.certificationNameOther : form.certificationName

    const getPayloadBody = (): string | null => {
        if (!form.certifyingBody) return null
        return form.certifyingBody === 'Other' ? form.certifyingBodyOther : form.certifyingBody
    }

    const handleSave = async () => {
        const name = getPayloadName()
        if (!name) {
            showMsg('error', 'Certification name is required.')
            return
        }
        setSaving(true)
        try {
            const isEdit = editingId !== null
            const url = isEdit ? `/api/profile/certifications/${editingId}` : '/api/profile/certifications'
            const method = isEdit ? 'PUT' : 'POST'

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    certificationName: name,
                    certifyingBody: getPayloadBody(),
                    certificationNumber: form.certificationNumber || null,
                    expirationDate: form.expirationDate || null,
                }),
            })
            if (!res.ok) throw new Error('Failed')

            showMsg('success', isEdit ? 'Certification updated!' : 'Certification added!')
            setShowForm(false)
            setEditingId(null)
            setForm({ ...emptyForm })
            await fetchCerts()
        } catch {
            showMsg('error', 'Failed to save certification.')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        setDeletingId(id)
        try {
            const res = await fetch(`/api/profile/certifications/${id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed')
            showMsg('success', 'Certification deleted.')
            setConfirmDeleteId(null)
            await fetchCerts()
        } catch {
            showMsg('error', 'Failed to delete certification.')
        } finally {
            setDeletingId(null)
        }
    }

    const startEdit = (c: Certification) => {
        const nameRes = resolveNameDropdown(c.certificationName)
        const bodyRes = resolveBodyDropdown(c.certifyingBody)
        setEditingId(c.id)
        setForm({
            certificationName: nameRes.dropdown,
            certificationNameOther: nameRes.other,
            certifyingBody: bodyRes.dropdown,
            certifyingBodyOther: bodyRes.other,
            certificationNumber: c.certificationNumber || '',
            expirationDate: toInputDate(c.expirationDate),
        })
        setShowForm(true)
    }

    const cancelForm = () => {
        setShowForm(false)
        setEditingId(null)
        setForm({ ...emptyForm })
    }

    return (
        <div style={cardStyle}>
            <h3 style={cardTitle}>
                <ShieldCheck size={20} style={{ color: '#818CF8' }} />
                Certifications
            </h3>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    <Loader2 size={20} className="animate-spin" style={{ display: 'inline' }} />
                </div>
            ) : (
                <>
                    {/* Existing certs list */}
                    {certs.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: showForm ? '20px' : '16px' }}>
                            {certs.map((c) => (
                                <div
                                    key={c.id}
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
                                        <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                                            {c.certificationName}
                                        </span>
                                        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                            {c.certifyingBody && <span>Body: <strong>{c.certifyingBody}</strong></span>}
                                            <span>No: <strong>{maskNumber(c.certificationNumber)}</strong></span>
                                            <span>Exp: <strong>{formatDate(c.expirationDate)}</strong></span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '6px', marginLeft: '12px', flexShrink: 0 }}>
                                        <button
                                            onClick={() => startEdit(c)}
                                            style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px' }}
                                        >
                                            <Edit3 size={14} /> Edit
                                        </button>

                                        {confirmDeleteId === c.id ? (
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button
                                                    onClick={() => handleDelete(c.id)}
                                                    disabled={deletingId === c.id}
                                                    style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px', borderColor: '#EF4444', color: '#EF4444' }}
                                                >
                                                    {deletingId === c.id ? <Loader2 size={14} className="animate-spin" /> : 'Yes'}
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
                                                onClick={() => setConfirmDeleteId(c.id)}
                                                style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px', color: '#EF4444' }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {certs.length === 0 && !showForm && (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
                            No certifications added yet. Add your professional certifications for autofilling applications.
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
                                    {editingId ? 'Edit Certification' : 'Add Certification'}
                                </h4>
                                <button onClick={cancelForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={18} />
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {/* Certification Name */}
                                <div>
                                    <label style={labelStyle}>Certification Name *</label>
                                    <select
                                        value={form.certificationName}
                                        onChange={(e) => setForm({ ...form, certificationName: e.target.value, certificationNameOther: '' })}
                                        style={{ ...inputStyle, cursor: 'pointer' }}
                                    >
                                        <option value="">Select certification</option>
                                        {CERT_NAME_OPTIONS.map((n) => (
                                            <option key={n} value={n}>{n}</option>
                                        ))}
                                    </select>
                                    {form.certificationName === 'Other' && (
                                        <input
                                            type="text"
                                            value={form.certificationNameOther}
                                            onChange={(e) => setForm({ ...form, certificationNameOther: e.target.value })}
                                            placeholder="Enter certification name"
                                            style={{ ...inputStyle, marginTop: '8px' }}
                                        />
                                    )}
                                </div>

                                {/* Certifying Body */}
                                <div>
                                    <label style={labelStyle}>Certifying Body</label>
                                    <select
                                        value={form.certifyingBody}
                                        onChange={(e) => setForm({ ...form, certifyingBody: e.target.value, certifyingBodyOther: '' })}
                                        style={{ ...inputStyle, cursor: 'pointer' }}
                                    >
                                        <option value="">Select body</option>
                                        {BODY_OPTIONS.map((b) => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                    {form.certifyingBody === 'Other' && (
                                        <input
                                            type="text"
                                            value={form.certifyingBodyOther}
                                            onChange={(e) => setForm({ ...form, certifyingBodyOther: e.target.value })}
                                            placeholder="Enter certifying body name"
                                            style={{ ...inputStyle, marginTop: '8px' }}
                                        />
                                    )}
                                </div>

                                {/* Number + Expiration row */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                    <div>
                                        <label style={labelStyle}>Certification Number</label>
                                        <input
                                            type="text"
                                            value={form.certificationNumber}
                                            onChange={(e) => setForm({ ...form, certificationNumber: e.target.value })}
                                            placeholder="Enter number"
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Expiration Date</label>
                                        <input
                                            type="date"
                                            value={form.expirationDate}
                                            onChange={(e) => setForm({ ...form, expirationDate: e.target.value })}
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                                    <button onClick={cancelForm} style={btnOutline}>Cancel</button>
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        style={{ ...btnPrimary, ...(saving ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
                                    >
                                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        {saving ? 'Saving...' : editingId ? 'Update' : 'Save Certification'}
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
                            <Plus size={16} /> Add Certification
                        </button>
                    )}
                </>
            )}
        </div>
    )
}
