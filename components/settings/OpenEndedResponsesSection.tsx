'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Loader2, MessageSquare, Sparkles } from 'lucide-react'
import { clayCard, clayInnerCard, clayTitle, clayInput, clayBtnPrimary, clayPalette } from './clay-tokens'

interface OEQuestion { questionKey: string; questionText: string }

const QUESTIONS: OEQuestion[] = [
    { questionKey: 'why_interested', questionText: 'Why are you interested in this position?' },
    { questionKey: 'clinical_approach', questionText: 'Describe your clinical approach to psychiatric evaluation and treatment' },
    { questionKey: 'challenging_case', questionText: 'Tell us about a challenging case you\'ve managed' },
    { questionKey: 'reason_leaving', questionText: 'Why are you leaving your current position?' },
    { questionKey: 'career_goals', questionText: 'What are your long-term career goals?' },
    { questionKey: 'anything_else', questionText: 'Is there anything else you\'d like us to know?' },
]

interface ResponseMap { [key: string]: { response: string; isAIGenerated: boolean } }

const inputStyle: React.CSSProperties = { ...clayInput, resize: 'vertical', fontFamily: 'inherit' }

interface Props { showMsg: (type: 'success' | 'error', text: string) => void }

export default function OpenEndedResponsesSection({ showMsg }: Props) {
    const [responses, setResponses] = useState<ResponseMap>({})
    const [loading, setLoading] = useState(true)
    const [savingKey, setSavingKey] = useState<string | null>(null)

    const fetchResponses = useCallback(async () => {
        try {
            const res = await fetch('/api/profile/open-ended-responses')
            if (res.ok) {
                const data = await res.json()
                const map: ResponseMap = {}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data.forEach((r: { questionKey: string; response?: string; isAIGenerated?: boolean }) => { map[r.questionKey] = { response: r.response || '', isAIGenerated: r.isAIGenerated || false } })
                setResponses(map)
            }
        } catch { /* silent */ } finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchResponses() }, [fetchResponses])

    const getResp = (key: string) => responses[key] || { response: '', isAIGenerated: false }
    const setResp = (key: string, val: string) => {
        setResponses((prev) => ({ ...prev, [key]: { response: val, isAIGenerated: false } }))
    }

    const handleSave = async (q: OEQuestion) => {
        setSavingKey(q.questionKey)
        try {
            const r = getResp(q.questionKey)
            const res = await fetch(`/api/profile/open-ended-responses/${q.questionKey}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questionText: q.questionText, response: r.response }),
            })
            if (!res.ok) throw new Error('Failed')
            showMsg('success', 'Response saved!')
        } catch { showMsg('error', 'Failed to save response.') }
        finally { setSavingKey(null) }
    }

    const filledCount = Object.values(responses).filter((r) => r.response.trim()).length

    return (
        <div style={clayCard}>
            <h3 style={{ ...clayTitle, marginBottom: '4px' }}>
                <MessageSquare size={20} style={{ color: clayPalette.purple }} /> Saved Application Responses
            </h3>
            <p style={{ fontSize: '13px', color: clayPalette.textMuted, marginBottom: '24px', marginTop: 0 }}>
                {filledCount} of {QUESTIONS.length} written — these auto-fill on job applications
            </p>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '24px' }}><Loader2 size={20} className="animate-spin" style={{ display: 'inline', color: clayPalette.textMuted }} /></div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {QUESTIONS.map((q) => {
                        const r = getResp(q.questionKey)
                        const isSaving = savingKey === q.questionKey
                        return (
                            <div key={q.questionKey} style={{ ...clayInnerCard, padding: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: clayPalette.textPrimary, flex: 1 }}>{q.questionText}</label>

                                    {r.isAIGenerated && (
                                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: 'rgba(45,212,191,0.12)', color: clayPalette.accentLight }}>AI Generated</span>
                                    )}
                                </div>
                                <textarea value={r.response} onChange={(e) => { if (e.target.value.length <= 2000) setResp(q.questionKey, e.target.value) }}
                                    rows={3} placeholder="Write your response..." style={inputStyle} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                                    <span style={{ fontSize: '11px', color: clayPalette.textMuted }}>{r.response.length}/2000</span>
                                    <button onClick={() => handleSave(q)} disabled={isSaving} style={{
                                        ...clayBtnPrimary,
                                        padding: '6px 16px',
                                        fontSize: '12px',
                                        opacity: isSaving ? 0.6 : 1,
                                        cursor: isSaving ? 'not-allowed' : 'pointer',
                                    }}>
                                        {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                        {isSaving ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
