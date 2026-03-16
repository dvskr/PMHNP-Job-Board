'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit3, Trash2, Save, Loader2, X, Briefcase, ChevronDown, ChevronUp, Check } from 'lucide-react'

const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN',
    'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
    'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT',
    'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const PRACTICE_SETTINGS = [
    'Outpatient Clinic', 'Inpatient Hospital', 'Residential Treatment', 'Community Mental Health Center',
    'Private Practice', 'Telehealth Only', 'Correctional Facility', 'School-Based',
    'Integrated Primary Care', 'Crisis Center', 'VA/Military', 'Nursing Home/Long-Term Care', 'Home Health',
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface WExp { id: string;[key: string]: any }

interface WForm {
    jobTitle: string; employerName: string; employerCity: string; employerState: string
    startMonth: string; startYear: string; endMonth: string; endYear: string; isCurrent: boolean
    supervisorName: string; supervisorPhone: string; supervisorEmail: string
    mayContact: boolean | null; reasonForLeaving: string; description: string
    practiceSetting: string
}

const emptyForm: WForm = {
    jobTitle: '', employerName: '', employerCity: '', employerState: '',
    startMonth: '', startYear: '', endMonth: '', endYear: '', isCurrent: false,
    supervisorName: '', supervisorPhone: '', supervisorEmail: '',
    mayContact: null, reasonForLeaving: '', description: '',
    practiceSetting: '',
}

const cardStyle: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '28px' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
const btnPrimary: React.CSSProperties = { padding: '10px 28px', borderRadius: '10px', background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }
const btnOutline: React.CSSProperties = { padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }

function toMY(iso: string | null): { month: string; year: string } {
    if (!iso) return { month: '', year: '' }
    const d = new Date(iso)
    return { month: String(d.getMonth() + 1), year: String(d.getFullYear()) }
}

function fmtDate(iso: string | null): string {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

interface Props { showMsg: (type: 'success' | 'error', text: string) => void }

export default function WorkExperienceSection({ showMsg }: Props) {
    const [entries, setEntries] = useState<WExp[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState<WForm>({ ...emptyForm })
    const [expandedCard, setExpandedCard] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    const fetchEntries = useCallback(async () => {
        try { const r = await fetch('/api/profile/work-experience'); if (r.ok) setEntries(await r.json()) }
        catch { /* silent */ } finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchEntries() }, [fetchEntries])

    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: 60 }, (_, i) => currentYear + 2 - i)

    const buildPayload = () => {
        const startDate = form.startMonth && form.startYear
            ? new Date(parseInt(form.startYear), parseInt(form.startMonth) - 1, 1).toISOString() : null
        const endDate = !form.isCurrent && form.endMonth && form.endYear
            ? new Date(parseInt(form.endYear), parseInt(form.endMonth) - 1, 1).toISOString() : null

        return {
            jobTitle: form.jobTitle, employerName: form.employerName,
            employerCity: form.employerCity || null, employerState: form.employerState || null,
            startDate, endDate: form.isCurrent ? null : endDate, isCurrent: form.isCurrent,
            supervisorName: form.supervisorName || null, supervisorPhone: form.supervisorPhone || null,
            supervisorEmail: form.supervisorEmail || null, mayContact: form.mayContact,
            reasonForLeaving: form.isCurrent ? null : (form.reasonForLeaving || null),
            description: form.description || null,
            practiceSetting: form.practiceSetting || null,
        }
    }

    const handleSave = async () => {
        if (!form.jobTitle || !form.employerName || !form.startMonth || !form.startYear) {
            showMsg('error', 'Job title, employer, and start date are required.'); return
        }
        setSaving(true)
        try {
            const isEdit = editingId !== null
            const res = await fetch(isEdit ? `/api/profile/work-experience/${editingId}` : '/api/profile/work-experience', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPayload()),
            })
            if (!res.ok) throw new Error('Failed')
            showMsg('success', isEdit ? 'Work experience updated!' : 'Work experience added!')
            cancelForm(); await fetchEntries()
        } catch { showMsg('error', 'Failed to save.') }
        finally { setSaving(false) }
    }

    const handleDelete = async (id: string) => {
        setDeletingId(id)
        try {
            const res = await fetch(`/api/profile/work-experience/${id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed')
            showMsg('success', 'Entry deleted.'); setConfirmDeleteId(null); await fetchEntries()
        } catch { showMsg('error', 'Failed to delete.') }
        finally { setDeletingId(null) }
    }

    const startEdit = (w: WExp) => {
        const sm = toMY(w.startDate); const em = toMY(w.endDate)
        setEditingId(w.id)
        setForm({
            jobTitle: w.jobTitle || '', employerName: w.employerName || '',
            employerCity: w.employerCity || '', employerState: w.employerState || '',
            startMonth: sm.month, startYear: sm.year, endMonth: em.month, endYear: em.year,
            isCurrent: w.isCurrent || false, supervisorName: w.supervisorName || '',
            supervisorPhone: w.supervisorPhone || '', supervisorEmail: w.supervisorEmail || '',
            mayContact: w.mayContact, reasonForLeaving: w.reasonForLeaving || '',
            description: w.description || '', practiceSetting: w.practiceSetting || '',
        })
        setShowForm(true)
    }

    const cancelForm = () => { setShowForm(false); setEditingId(null); setForm({ ...emptyForm }) }

    const RadioPill = ({ current, onChange, labels }: { value: boolean | null; current: boolean | null; onChange: (v: boolean) => void; labels: [string, string] }) => (
        <div style={{ display: 'flex', gap: '6px' }}>
            {[true, false].map((v, i) => (
                <button key={String(v)} type="button" onClick={() => onChange(v)} style={{
                    padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
                    border: current === v ? '1.5px solid #2DD4BF' : '1.5px solid var(--border-color)',
                    background: current === v ? 'rgba(45,212,191,0.1)' : 'var(--bg-primary)',
                    color: current === v ? '#2DD4BF' : 'var(--text-secondary)',
                }}>{labels[i]}</button>
            ))}
        </div>
    )

    return (
        <div style={cardStyle}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <Briefcase size={20} style={{ color: '#3B82F6' }} /> Work Experience
            </h3>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '24px' }}><Loader2 size={20} className="animate-spin" style={{ display: 'inline', color: 'var(--text-muted)' }} /></div>
            ) : (
                <>
                    {entries.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: showForm ? '20px' : '16px' }}>
                            {entries.map((w) => (
                                <div key={w.id} style={{ borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer' }}
                                        onClick={() => setExpandedCard(expandedCard === w.id ? null : w.id)}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{w.jobTitle}</span>
                                                {w.isCurrent && <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: 'rgba(45,212,191,0.12)', color: '#2DD4BF' }}>Current</span>}
                                            </div>
                                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                {w.employerName}{w.practiceSetting && <> · {w.practiceSetting}</>} · {fmtDate(w.startDate)} — {w.isCurrent ? 'Present' : fmtDate(w.endDate)}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', marginLeft: '12px', flexShrink: 0 }}>
                                            <button onClick={(e) => { e.stopPropagation(); startEdit(w) }} style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px' }}><Edit3 size={14} /> Edit</button>
                                            {confirmDeleteId === w.id ? (
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(w.id) }} disabled={deletingId === w.id}
                                                        style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px', borderColor: '#EF4444', color: '#EF4444' }}>
                                                        {deletingId === w.id ? <Loader2 size={14} className="animate-spin" /> : 'Yes'}
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }} style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px' }}>No</button>
                                                </div>
                                            ) : (
                                                <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(w.id) }} style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px', color: '#EF4444' }}><Trash2 size={14} /></button>
                                            )}
                                        </div>
                                    </div>
                                    {expandedCard === w.id && (
                                        <div style={{ padding: '0 18px 14px', borderTop: '1px solid var(--border-color)', paddingTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                            {w.description && <p style={{ margin: '0 0 8px', lineHeight: 1.5 }}>{w.description}</p>}
                                            {w.employerCity && <div><strong>Location:</strong> {w.employerCity}{w.employerState && `, ${w.employerState}`}</div>}
                                            {w.supervisorName && <div><strong>Supervisor:</strong> {w.supervisorName}</div>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {entries.length === 0 && !showForm && <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>No work experience added yet.</p>}

                    {showForm && (
                        <div style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{editingId ? 'Edit Work Experience' : 'Add Work Experience'}</h4>
                                <button onClick={cancelForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                    <div><label style={labelStyle}>Job Title *</label><input type="text" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="Psychiatric NP" style={inputStyle} /></div>
                                    <div><label style={labelStyle}>Employer *</label><input type="text" value={form.employerName} onChange={(e) => setForm({ ...form, employerName: e.target.value })} placeholder="ABC Health System" style={inputStyle} /></div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: '14px' }}>
                                    <div><label style={labelStyle}>City</label><input type="text" value={form.employerCity} onChange={(e) => setForm({ ...form, employerCity: e.target.value })} style={inputStyle} /></div>
                                    <div>
                                        <label style={labelStyle}>State</label>
                                        <select value={form.employerState} onChange={(e) => setForm({ ...form, employerState: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                                            <option value="">Select</option>
                                            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Practice Setting</label>
                                        <select value={form.practiceSetting} onChange={(e) => setForm({ ...form, practiceSetting: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                                            <option value="">Select setting</option>
                                            {PRACTICE_SETTINGS.map((s) => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Dates */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                    <div>
                                        <label style={labelStyle}>Start Date *</label>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <select value={form.startMonth} onChange={(e) => setForm({ ...form, startMonth: e.target.value })} style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}>
                                                <option value="">Month</option>
                                                {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                                            </select>
                                            <select value={form.startYear} onChange={(e) => setForm({ ...form, startYear: e.target.value })} style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}>
                                                <option value="">Year</option>
                                                {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>End Date</label>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <select value={form.endMonth} onChange={(e) => setForm({ ...form, endMonth: e.target.value })} disabled={form.isCurrent} style={{ ...inputStyle, cursor: form.isCurrent ? 'not-allowed' : 'pointer', opacity: form.isCurrent ? 0.5 : 1, flex: 1 }}>
                                                <option value="">Month</option>
                                                {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                                            </select>
                                            <select value={form.endYear} onChange={(e) => setForm({ ...form, endYear: e.target.value })} disabled={form.isCurrent} style={{ ...inputStyle, cursor: form.isCurrent ? 'not-allowed' : 'pointer', opacity: form.isCurrent ? 0.5 : 1, flex: 1 }}>
                                                <option value="">Year</option>
                                                {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    <div onClick={() => setForm({ ...form, isCurrent: !form.isCurrent })} style={{
                                        width: '18px', height: '18px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                        border: form.isCurrent ? '1.5px solid #2DD4BF' : '1.5px solid var(--border-color)',
                                        background: form.isCurrent ? 'rgba(45,212,191,0.12)' : 'var(--bg-primary)',
                                    }}>
                                        {form.isCurrent && <Check size={12} style={{ color: '#2DD4BF' }} />}
                                    </div>
                                    I currently work here
                                </label>

                                {/* Supervisor Info */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                                    <div><label style={labelStyle}>Supervisor Name</label><input type="text" value={form.supervisorName} onChange={(e) => setForm({ ...form, supervisorName: e.target.value })} style={inputStyle} /></div>
                                    <div><label style={labelStyle}>Supervisor Phone</label><input type="tel" value={form.supervisorPhone} onChange={(e) => setForm({ ...form, supervisorPhone: e.target.value })} style={inputStyle} /></div>
                                    <div><label style={labelStyle}>Supervisor Email</label><input type="email" value={form.supervisorEmail} onChange={(e) => setForm({ ...form, supervisorEmail: e.target.value })} style={inputStyle} /></div>
                                </div>

                                <div><label style={labelStyle}>May we contact this supervisor?</label><RadioPill value={form.mayContact} current={form.mayContact} onChange={(v) => setForm({ ...form, mayContact: v })} labels={['Yes', 'No']} /></div>

                                {!form.isCurrent && (
                                    <div><label style={labelStyle}>Reason for Leaving</label><input type="text" value={form.reasonForLeaving} onChange={(e) => setForm({ ...form, reasonForLeaving: e.target.value })} style={inputStyle} /></div>
                                )}

                                <div>
                                    <label style={labelStyle}>Job Duties & Responsibilities</label>
                                    <textarea value={form.description} onChange={(e) => { if (e.target.value.length <= 2000) setForm({ ...form, description: e.target.value }) }}
                                        rows={4} placeholder="Describe your duties and responsibilities..." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                                    <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{form.description.length}/2000</div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                                    <button onClick={cancelForm} style={btnOutline}>Cancel</button>
                                    <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, ...(saving ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}>
                                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {!showForm && (
                        <button onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setShowForm(true) }}
                            style={{ ...btnOutline, borderStyle: 'dashed', width: '100%', justifyContent: 'center', padding: '12px', color: '#2DD4BF', borderColor: 'rgba(45,212,191,0.4)' }}>
                            <Plus size={16} /> Add Work Experience
                        </button>
                    )}
                </>
            )}
        </div>
    )
}
