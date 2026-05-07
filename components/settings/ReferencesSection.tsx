'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit3, Trash2, Save, Loader2, X, Users } from 'lucide-react'
import {
    clayCard, clayInnerCard, clayFormPanel, clayTitle, claySubTitle,
    clayInput, clayLabel, clayBtnPrimary, clayBtnOutlineSmall, clayPalette,
} from './clay-tokens'

const RELATIONSHIPS = ['Direct Supervisor', 'Colleague', 'Professor / Faculty', 'Clinical Preceptor', 'Collaborating Physician', 'Other']

interface Reference {
    id: string; fullName: string; title: string | null; organization: string | null
    phone: string | null; email: string | null; relationship: string | null; yearsKnown: number | null
}

interface RefForm {
    fullName: string; title: string; organization: string; phone: string
    email: string; relationship: string; yearsKnown: string
}

const emptyForm: RefForm = { fullName: '', title: '', organization: '', phone: '', email: '', relationship: '', yearsKnown: '' }

const cardStyle = clayCard
const labelStyle = clayLabel
const inputStyle = clayInput
const btnPrimary = clayBtnPrimary
const btnOutline = clayBtnOutlineSmall

interface Props { showMsg: (type: 'success' | 'error', text: string) => void }

export default function ReferencesSection({ showMsg }: Props) {
    const [refs, setRefs] = useState<Reference[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState<RefForm>({ ...emptyForm })
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    const fetchRefs = useCallback(async () => {
        try { const r = await fetch('/api/profile/references'); if (r.ok) setRefs(await r.json()) }
        catch { /* silent */ } finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchRefs() }, [fetchRefs])

    const handleSave = async () => {
        if (!form.fullName) { showMsg('error', 'Full name is required.'); return }
        setSaving(true)
        try {
            const isEdit = editingId !== null
            const res = await fetch(isEdit ? `/api/profile/references/${editingId}` : '/api/profile/references', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, yearsKnown: form.yearsKnown || null }),
            })
            if (!res.ok) throw new Error('Failed')
            showMsg('success', isEdit ? 'Reference updated!' : 'Reference added!')
            cancelForm(); await fetchRefs()
        } catch { showMsg('error', 'Failed to save reference.') }
        finally { setSaving(false) }
    }

    const handleDelete = async (id: string) => {
        setDeletingId(id)
        try {
            const res = await fetch(`/api/profile/references/${id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed')
            showMsg('success', 'Reference deleted.'); setConfirmDeleteId(null); await fetchRefs()
        } catch { showMsg('error', 'Failed to delete.') }
        finally { setDeletingId(null) }
    }

    const startEdit = (r: Reference) => {
        setEditingId(r.id)
        setForm({
            fullName: r.fullName, title: r.title || '', organization: r.organization || '',
            phone: r.phone || '', email: r.email || '', relationship: r.relationship || '',
            yearsKnown: r.yearsKnown ? String(r.yearsKnown) : '',
        })
        setShowForm(true)
    }

    const cancelForm = () => { setShowForm(false); setEditingId(null); setForm({ ...emptyForm }) }

    const refCount = refs.length
    const progressPct = Math.min((refCount / 3) * 100, 100)

    // Inline form: rendered under the active edit row, or at the
    // bottom in add mode. See WorkExperienceSection for the same pattern.
    const renderForm = () => (
        <div style={clayFormPanel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={claySubTitle}>{editingId ? 'Edit Reference' : 'Add Reference'}</h4>
                <button onClick={cancelForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: clayPalette.textMuted }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div><label style={labelStyle}>Full Name *</label><input type="text" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Dr. Jane Smith" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Title / Position</label><input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Medical Director" style={inputStyle} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div><label style={labelStyle}>Organization</label><input type="text" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} placeholder="ABC Hospital" style={inputStyle} /></div>
                    <div>
                        <label style={labelStyle}>Relationship</label>
                        <select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                            <option value="">Select relationship</option>
                            {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                    <div><label style={labelStyle}>Phone</label><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@hospital.com" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Years Known</label><input type="number" min="0" value={form.yearsKnown} onChange={(e) => setForm({ ...form, yearsKnown: e.target.value })} placeholder="5" style={inputStyle} /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                    <button onClick={cancelForm} disabled={saving} style={{ ...btnOutline, opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, ...(saving ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}>
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div style={cardStyle}>
            <h3 style={{ ...clayTitle, marginBottom: '8px' }}>
                <Users size={20} style={{ color: clayPalette.warning }} /> Professional References
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', color: clayPalette.textMuted, margin: 0 }}>
                    Most applications require 3 professional references — <strong style={{ color: refCount >= 3 ? clayPalette.accentLight : '#FB923C' }}>{refCount} of 3 added</strong>
                </p>
                <div style={{ flex: 1, maxWidth: '120px', height: '6px', borderRadius: '3px', background: clayPalette.border, overflow: 'hidden' }}>
                    <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: '3px', background: refCount >= 3 ? clayPalette.accentLight : '#FB923C', transition: 'width 0.3s' }} />
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '24px' }}><Loader2 size={20} className="animate-spin" style={{ display: 'inline', color: clayPalette.textMuted }} /></div>
            ) : (
                <>
                    {refs.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: showForm ? '20px' : '16px' }}>
                            {refs.map((r) => (
                                <div key={r.id}>
                                    <div style={{ ...clayInnerCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontWeight: 700, fontSize: '14px', color: clayPalette.textPrimary }}>{r.fullName}</span>
                                            <div style={{ fontSize: '13px', color: clayPalette.textSecondary, marginTop: '2px' }}>
                                                {r.title && <>{r.title}</>}{r.organization && <> · {r.organization}</>}{r.relationship && <> · {r.relationship}</>}
                                                {r.yearsKnown && <> · {r.yearsKnown} yrs</>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', marginLeft: '12px', flexShrink: 0 }}>
                                            <button onClick={() => startEdit(r)} style={btnOutline}><Edit3 size={14} /> Edit</button>
                                            {confirmDeleteId === r.id ? (
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button onClick={() => handleDelete(r.id)} disabled={deletingId === r.id} style={{ ...btnOutline, borderColor: 'rgba(239,68,68,0.4)', color: clayPalette.dangerLight }}>
                                                        {deletingId === r.id ? <Loader2 size={14} className="animate-spin" /> : 'Yes'}
                                                    </button>
                                                    <button onClick={() => setConfirmDeleteId(null)} style={btnOutline}>No</button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setConfirmDeleteId(r.id)} style={{ ...btnOutline, color: clayPalette.dangerLight }}><Trash2 size={14} /></button>
                                            )}
                                        </div>
                                    </div>
                                    {showForm && editingId === r.id && (
                                        <div style={{ marginTop: '10px' }}>{renderForm()}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {refs.length === 0 && !showForm && <p style={{ color: clayPalette.textMuted, fontSize: '13px', marginBottom: '16px' }}>No references added yet.</p>}

                    {showForm && editingId === null && renderForm()}

                    {!showForm && (
                        <button onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setShowForm(true) }}
                            style={{ ...btnOutline, borderStyle: 'dashed', width: '100%', justifyContent: 'center', padding: '12px', color: clayPalette.accentLight, borderColor: 'rgba(45,212,191,0.4)' }}>
                            <Plus size={16} /> Add Reference
                        </button>
                    )}
                </>
            )}
        </div>
    )
}
