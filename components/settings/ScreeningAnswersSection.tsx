'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Loader2, ShieldCheck } from 'lucide-react'

interface Question {
    questionKey: string; questionText: string; answerType: 'boolean' | 'boolean_with_details' | 'text'; category: string
}

const QUESTIONS: Question[] = [
    { questionKey: 'felony_conviction', questionText: 'Have you ever been convicted of a felony?', answerType: 'boolean_with_details', category: 'Background' },
    { questionKey: 'license_revoked', questionText: 'Have you ever had a professional license revoked, suspended, or restricted?', answerType: 'boolean_with_details', category: 'Background' },
    { questionKey: 'malpractice_lawsuit', questionText: 'Have you ever been named in a malpractice lawsuit?', answerType: 'boolean_with_details', category: 'Background' },
    { questionKey: 'board_disciplinary', questionText: 'Have you ever been subject to disciplinary action by any licensing board?', answerType: 'boolean_with_details', category: 'Background' },
    { questionKey: 'consent_background_check', questionText: 'Do you consent to a background check?', answerType: 'boolean', category: 'Background' },
    { questionKey: 'consent_drug_screen', questionText: 'Do you consent to a drug screen?', answerType: 'boolean', category: 'Background' },
    { questionKey: 'telehealth_comfortable', questionText: 'Are you comfortable providing care via telehealth?', answerType: 'boolean', category: 'Logistics' },
    { questionKey: 'willing_to_relocate', questionText: 'Are you willing to relocate?', answerType: 'boolean', category: 'Logistics' },
    { questionKey: 'currently_employed', questionText: 'Are you currently employed?', answerType: 'boolean', category: 'Logistics' },
    { questionKey: 'notice_period', questionText: 'Notice period required at current job', answerType: 'text', category: 'Logistics' },
]

const CATEGORIES = ['Background', 'Logistics']

interface AnswerMap { [key: string]: { answerBool: boolean | null; answerText: string } }

const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
const btnPrimary: React.CSSProperties = { padding: '10px 28px', borderRadius: '10px', background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }

interface Props { showMsg: (type: 'success' | 'error', text: string) => void }

export default function ScreeningAnswersSection({ showMsg }: Props) {
    const [answers, setAnswers] = useState<AnswerMap>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const fetchAnswers = useCallback(async () => {
        try {
            const res = await fetch('/api/profile/screening-answers')
            if (res.ok) {
                const data = await res.json()
                const map: AnswerMap = {}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data.forEach((a: any) => { map[a.questionKey] = { answerBool: a.answerBool, answerText: a.answerText || '' } })
                setAnswers(map)
            }
        } catch { /* silent */ } finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchAnswers() }, [fetchAnswers])

    const getAnswer = (key: string) => answers[key] || { answerBool: null, answerText: '' }
    const setAnswer = (key: string, val: Partial<{ answerBool: boolean | null; answerText: string }>) => {
        setAnswers((prev) => ({ ...prev, [key]: { ...getAnswer(key), ...val } }))
    }

    const handleSaveAll = async () => {
        setSaving(true)
        try {
            const payloadAnswers = QUESTIONS.filter((q) => {
                const a = answers[q.questionKey]
                return a && (a.answerBool !== null || a.answerText)
            }).map((q) => {
                const a = answers[q.questionKey]
                return {
                    questionKey: q.questionKey, questionText: q.questionText,
                    answerType: q.answerType, answerBool: a.answerBool,
                    answerText: a.answerText || null, category: q.category,
                }
            })
            const res = await fetch('/api/profile/screening-answers', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers: payloadAnswers }),
            })
            if (!res.ok) throw new Error('Failed')
            showMsg('success', 'Screening answers saved!')
        } catch { showMsg('error', 'Failed to save screening answers.') }
        finally { setSaving(false) }
    }

    const validKeys = new Set(QUESTIONS.map((q) => q.questionKey))
    const answeredCount = Object.entries(answers).filter(([key, a]) => validKeys.has(key) && (a.answerBool !== null || a.answerText)).length

    return (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '28px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <ShieldCheck size={20} style={{ color: '#10B981' }} /> Pre-filled Screening Answers
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', marginTop: 0 }}>
                {answeredCount} of {QUESTIONS.length} answered — these auto-fill screening questions on job applications
            </p>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '24px' }}><Loader2 size={20} className="animate-spin" style={{ display: 'inline', color: 'var(--text-muted)' }} /></div>
            ) : (
                <>
                    {CATEGORIES.map((cat) => {
                        const qs = QUESTIONS.filter((q) => q.category === cat)
                        return (
                            <div key={cat} style={{ marginBottom: '24px' }}>
                                <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '14px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>{cat}</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {qs.map((q) => {
                                        const a = getAnswer(q.questionKey)
                                        const showDetails = q.answerType === 'boolean_with_details' && a.answerBool === true
                                        return (
                                            <div key={q.questionKey}>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>{q.questionText}</label>
                                                {q.answerType === 'text' ? (
                                                    <input type="text" value={a.answerText} onChange={(e) => setAnswer(q.questionKey, { answerText: e.target.value })} placeholder="Enter your answer" style={inputStyle} />
                                                ) : (
                                                    <>
                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                            {[true, false].map((v) => (
                                                                <button key={String(v)} type="button" onClick={() => setAnswer(q.questionKey, { answerBool: v })} style={{
                                                                    padding: '6px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
                                                                    border: a.answerBool === v ? '1.5px solid #2DD4BF' : '1.5px solid var(--border-color)',
                                                                    background: a.answerBool === v ? 'rgba(45,212,191,0.1)' : 'var(--bg-primary)',
                                                                    color: a.answerBool === v ? '#2DD4BF' : 'var(--text-secondary)',
                                                                }}>{v ? 'Yes' : 'No'}</button>
                                                            ))}
                                                        </div>
                                                        {showDetails && (
                                                            <textarea value={a.answerText} onChange={(e) => setAnswer(q.questionKey, { answerText: e.target.value })}
                                                                rows={2} placeholder="Please provide details..." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', marginTop: '8px' }} />
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                        <button onClick={handleSaveAll} disabled={saving} style={{ ...btnPrimary, ...(saving ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}>
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {saving ? 'Saving...' : 'Save All Screening Answers'}
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}
