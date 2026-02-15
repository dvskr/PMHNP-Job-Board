'use client'

import { useState } from 'react'
import { Save, Loader2, ShieldAlert, Check } from 'lucide-react'

interface Props {
    profile: {
        malpracticeCarrier?: string | null
        malpracticePolicyNumber?: string | null
        malpracticeExpirationDate?: string | null
        malpracticeCoverageAmount?: string | null
        malpracticeClaimsHistory?: boolean | null
        malpracticeClaimsDetails?: string | null
    }
    updateProfile: (patch: Record<string, unknown>) => void
    showMsg: (type: 'success' | 'error', text: string) => void
}

const cardStyle: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '28px' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }

export default function MalpracticeSection({ profile, updateProfile, showMsg }: Props) {
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        try {
            const res = await fetch('/api/profile/malpractice', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    malpracticeCarrier: profile.malpracticeCarrier,
                    malpracticePolicyNumber: profile.malpracticePolicyNumber,
                    malpracticeExpirationDate: profile.malpracticeExpirationDate,
                    malpracticeCoverageAmount: profile.malpracticeCoverageAmount,
                    malpracticeClaimsHistory: profile.malpracticeClaimsHistory,
                    malpracticeClaimsDetails: profile.malpracticeClaimsDetails,
                }),
            })
            if (!res.ok) throw new Error('Failed')
            showMsg('success', 'Malpractice insurance saved!')
        } catch { showMsg('error', 'Failed to save.') }
        finally { setSaving(false) }
    }

    return (
        <div style={cardStyle}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <ShieldAlert size={20} style={{ color: '#F43F5E' }} /> Malpractice Insurance
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div><label style={labelStyle}>Insurance Carrier</label><input type="text" value={profile.malpracticeCarrier || ''} onChange={(e) => updateProfile({ malpracticeCarrier: e.target.value })} placeholder="e.g. NSO, HPSO, CM&F" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Policy Number</label><input type="text" value={profile.malpracticePolicyNumber || ''} onChange={(e) => updateProfile({ malpracticePolicyNumber: e.target.value })} style={inputStyle} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div><label style={labelStyle}>Expiration Date</label><input type="date" value={profile.malpracticeExpirationDate ? new Date(profile.malpracticeExpirationDate).toISOString().slice(0, 10) : ''} onChange={(e) => updateProfile({ malpracticeExpirationDate: e.target.value || null })} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Coverage Amount</label><input type="text" value={profile.malpracticeCoverageAmount || ''} onChange={(e) => updateProfile({ malpracticeCoverageAmount: e.target.value })} placeholder="e.g. $1M/$6M" style={inputStyle} /></div>
                </div>
                <div>
                    <label style={labelStyle}>Any prior malpractice claims?</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {[true, false].map((v) => (
                            <button key={String(v)} type="button" onClick={() => updateProfile({ malpracticeClaimsHistory: v })} style={{
                                padding: '6px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
                                border: profile.malpracticeClaimsHistory === v ? '1.5px solid #2DD4BF' : '1.5px solid var(--border-color)',
                                background: profile.malpracticeClaimsHistory === v ? 'rgba(45,212,191,0.1)' : 'var(--bg-primary)',
                                color: profile.malpracticeClaimsHistory === v ? '#2DD4BF' : 'var(--text-secondary)',
                            }}>{v ? 'Yes' : 'No'}</button>
                        ))}
                    </div>
                </div>
                {profile.malpracticeClaimsHistory && (
                    <div>
                        <label style={labelStyle}>Claims Details</label>
                        <textarea value={profile.malpracticeClaimsDetails || ''} onChange={(e) => { if (e.target.value.length <= 1000) updateProfile({ malpracticeClaimsDetails: e.target.value }) }}
                            rows={3} placeholder="Please describe..." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                        <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{(profile.malpracticeClaimsDetails || '').length}/1000</div>
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <button onClick={handleSave} disabled={saving} style={{
                        padding: '10px 28px', borderRadius: '10px', background: saving ? 'rgba(45,212,191,0.3)' : 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
                        color: '#fff', fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: '8px',
                    }}>
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {saving ? 'Saving...' : 'Save Insurance'}
                    </button>
                </div>
            </div>
        </div>
    )
}
