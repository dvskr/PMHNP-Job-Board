'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit3, Trash2, Save, Loader2, X, GraduationCap, Check } from 'lucide-react'

const DEGREE_TYPES = ['DNP', 'PhD', 'MSN', 'EdD', "Post-Master's Certificate", 'BSN', 'ADN']
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

interface Education {
    id: string
    degreeType: string
    fieldOfStudy: string | null
    schoolName: string
    startDate: string | null
    graduationDate: string | null
    gpa: string | null
    isHighestDegree: boolean
}

interface EduForm {
    degreeType: string
    fieldOfStudy: string
    schoolName: string
    startMonth: string
    startYear: string
    gradMonth: string
    gradYear: string
    gpa: string
    isHighestDegree: boolean
}

const emptyForm: EduForm = {
    degreeType: '', fieldOfStudy: '', schoolName: '',
    startMonth: '', startYear: '', gradMonth: '', gradYear: '', gpa: '', isHighestDegree: false,
}

const cardStyle: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '28px' }
const cardTitle: React.CSSProperties = { fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
const btnPrimary: React.CSSProperties = { padding: '10px 28px', borderRadius: '10px', background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }
const btnOutline: React.CSSProperties = { padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }

function formatGradDate(iso: string | null): string {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function toMonthYear(iso: string | null): { month: string; year: string } {
    if (!iso) return { month: '', year: '' }
    const d = new Date(iso)
    return { month: String(d.getMonth() + 1), year: String(d.getFullYear()) }
}

interface Props { showMsg: (type: 'success' | 'error', text: string) => void }

export default function EducationSection({ showMsg }: Props) {
    const [entries, setEntries] = useState<Education[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState<EduForm>({ ...emptyForm })
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    const fetchEntries = useCallback(async () => {
        try {
            const res = await fetch('/api/profile/education')
            if (res.ok) setEntries(await res.json())
        } catch { /* silent */ } finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchEntries() }, [fetchEntries])

    const handleSave = async () => {
        if (!form.degreeType || !form.schoolName) {
            showMsg('error', 'Degree type and school are required.')
            return
        }
        setSaving(true)
        try {
            const isEdit = editingId !== null
            const startDate = form.startMonth && form.startYear
                ? new Date(parseInt(form.startYear), parseInt(form.startMonth) - 1, 1).toISOString()
                : null
            const gradDate = form.gradMonth && form.gradYear
                ? new Date(parseInt(form.gradYear), parseInt(form.gradMonth) - 1, 1).toISOString()
                : null

            const res = await fetch(
                isEdit ? `/api/profile/education/${editingId}` : '/api/profile/education',
                {
                    method: isEdit ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        degreeType: form.degreeType,
                        fieldOfStudy: form.fieldOfStudy || null,
                        schoolName: form.schoolName,
                        startDate,
                        graduationDate: gradDate,
                        gpa: form.gpa || null,
                        isHighestDegree: form.isHighestDegree,
                    }),
                }
            )
            if (!res.ok) throw new Error('Failed')
            showMsg('success', isEdit ? 'Education updated!' : 'Education added!')
            cancelForm()
            await fetchEntries()
        } catch { showMsg('error', 'Failed to save education entry.') }
        finally { setSaving(false) }
    }

    const handleDelete = async (id: string) => {
        setDeletingId(id)
        try {
            const res = await fetch(`/api/profile/education/${id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed')
            showMsg('success', 'Education entry deleted.')
            setConfirmDeleteId(null)
            await fetchEntries()
        } catch { showMsg('error', 'Failed to delete.') }
        finally { setDeletingId(null) }
    }

    const startEdit = (e: Education) => {
        const my = toMonthYear(e.graduationDate)
        const sy = toMonthYear(e.startDate)
        setEditingId(e.id)
        setForm({
            degreeType: e.degreeType, fieldOfStudy: e.fieldOfStudy || '',
            schoolName: e.schoolName, startMonth: sy.month, startYear: sy.year,
            gradMonth: my.month, gradYear: my.year,
            gpa: e.gpa || '', isHighestDegree: e.isHighestDegree,
        })
        setShowForm(true)
    }

    const cancelForm = () => { setShowForm(false); setEditingId(null); setForm({ ...emptyForm }) }

    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: 60 }, (_, i) => currentYear + 5 - i)

    return (
        <div style={cardStyle}>
            <h3 style={cardTitle}><GraduationCap size={20} style={{ color: '#818CF8' }} /> Education</h3>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '24px' }}><Loader2 size={20} className="animate-spin" style={{ display: 'inline', color: 'var(--text-muted)' }} /></div>
            ) : (
                <>
                    {entries.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: showForm ? '20px' : '16px' }}>
                            {entries.map((e) => (
                                <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{e.degreeType}</span>
                                            {e.isHighestDegree && (
                                                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: 'rgba(129,140,248,0.12)', color: '#818CF8' }}>Highest</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                            {e.fieldOfStudy && <>{e.fieldOfStudy} · </>}{e.schoolName}
                                            {e.startDate && <> · {formatGradDate(e.startDate)}</>}
                                            {e.startDate && e.graduationDate && ' – '}
                                            {!e.startDate && e.graduationDate && ' · '}
                                            {e.graduationDate && <>{formatGradDate(e.graduationDate)}</>}
                                            {e.gpa && <> · GPA: {e.gpa}</>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', marginLeft: '12px', flexShrink: 0 }}>
                                        <button onClick={() => startEdit(e)} style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px' }}><Edit3 size={14} /> Edit</button>
                                        {confirmDeleteId === e.id ? (
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button onClick={() => handleDelete(e.id)} disabled={deletingId === e.id} style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px', borderColor: '#EF4444', color: '#EF4444' }}>
                                                    {deletingId === e.id ? <Loader2 size={14} className="animate-spin" /> : 'Yes'}
                                                </button>
                                                <button onClick={() => setConfirmDeleteId(null)} style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px' }}>No</button>
                                            </div>
                                        ) : (
                                            <button onClick={() => setConfirmDeleteId(e.id)} style={{ ...btnOutline, padding: '6px 10px', fontSize: '12px', color: '#EF4444' }}><Trash2 size={14} /></button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {entries.length === 0 && !showForm && (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>No education entries yet.</p>
                    )}

                    {showForm && (
                        <div style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{editingId ? 'Edit Education' : 'Add Education'}</h4>
                                <button onClick={cancelForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                    <div>
                                        <label style={labelStyle}>Degree Type *</label>
                                        <select value={form.degreeType} onChange={(e) => setForm({ ...form, degreeType: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                                            <option value="">Select degree</option>
                                            {DEGREE_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>School / University *</label>
                                        <input type="text" value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} placeholder="Enter school name" style={inputStyle} />
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Field of Study / Program</label>
                                    <input type="text" value={form.fieldOfStudy} onChange={(e) => setForm({ ...form, fieldOfStudy: e.target.value })} placeholder="e.g. Psychiatric Mental Health Nurse Practitioner" style={inputStyle} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                                    <div>
                                        <label style={labelStyle}>From</label>
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
                                        <label style={labelStyle}>Graduated</label>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <select value={form.gradMonth} onChange={(e) => setForm({ ...form, gradMonth: e.target.value })} style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}>
                                                <option value="">Month</option>
                                                {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                                            </select>
                                            <select value={form.gradYear} onChange={(e) => setForm({ ...form, gradYear: e.target.value })} style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}>
                                                <option value="">Year</option>
                                                {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>GPA (optional)</label>
                                        <input type="text" value={form.gpa} onChange={(e) => setForm({ ...form, gpa: e.target.value })} placeholder="e.g. 3.85" style={inputStyle} />
                                    </div>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    <div onClick={() => setForm({ ...form, isHighestDegree: !form.isHighestDegree })} style={{
                                        width: '18px', height: '18px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                        border: form.isHighestDegree ? '1.5px solid #2DD4BF' : '1.5px solid var(--border-color)',
                                        background: form.isHighestDegree ? 'rgba(45,212,191,0.12)' : 'var(--bg-primary)',
                                    }}>
                                        {form.isHighestDegree && <Check size={12} style={{ color: '#2DD4BF' }} />}
                                    </div>
                                    This is my highest degree
                                </label>
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
                            <Plus size={16} /> Add Education
                        </button>
                    )}
                </>
            )}
        </div>
    )
}
