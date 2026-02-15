'use client'

import { useState } from 'react'
import { Save, Loader2, Stethoscope } from 'lucide-react'

interface Props {
    profile: {
        practiceAuthorityType?: string | null
        collaboratingPhysician?: string | null
        collaboratingPhysicianNpi?: string | null
        prescriptiveAuthorityStatus?: string | null
        stateProtocolRequirements?: string | null
    }
    updateProfile: (patch: Record<string, unknown>) => void
    showMsg: (type: 'success' | 'error', text: string) => void
}

const cardStyle: React.CSSProperties = { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '28px' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }

const AUTH_TYPES = ['Full Practice Authority', 'Reduced Practice', 'Restricted Practice', 'Supervisory Required']
const RX_STATUSES = ['Active & Unrestricted', 'Active with Limitations', 'Pending', 'Not Yet Obtained']

export default function PracticeAuthoritySection({ profile, updateProfile, showMsg }: Props) {
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        try {
            const res = await fetch('/api/profile/practice-authority', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    practiceAuthorityType: profile.practiceAuthorityType,
                    collaboratingPhysician: profile.collaboratingPhysician,
                    collaboratingPhysicianNpi: profile.collaboratingPhysicianNpi,
                    prescriptiveAuthorityStatus: profile.prescriptiveAuthorityStatus,
                    stateProtocolRequirements: profile.stateProtocolRequirements,
                }),
            })
            if (!res.ok) throw new Error('Failed')
            showMsg('success', 'Practice authority saved!')
        } catch { showMsg('error', 'Failed to save.') }
        finally { setSaving(false) }
    }

    const needsCollab = profile.practiceAuthorityType && profile.practiceAuthorityType !== 'Full Practice Authority'

    return (
        <div style={cardStyle}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <Stethoscope size={20} style={{ color: '#06B6D4' }} /> Practice Authority
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label style={labelStyle}>Practice Authority Type</label>
                    <select value={profile.practiceAuthorityType || ''} onChange={(e) => updateProfile({ practiceAuthorityType: e.target.value || null })} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">Select type</option>
                        {AUTH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                {needsCollab && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div><label style={labelStyle}>Collaborating Physician</label><input type="text" value={profile.collaboratingPhysician || ''} onChange={(e) => updateProfile({ collaboratingPhysician: e.target.value })} placeholder="Dr. John Smith" style={inputStyle} /></div>
                        <div><label style={labelStyle}>Physician NPI</label><input type="text" value={profile.collaboratingPhysicianNpi || ''} onChange={(e) => updateProfile({ collaboratingPhysicianNpi: e.target.value })} style={inputStyle} /></div>
                    </div>
                )}
                <div>
                    <label style={labelStyle}>Prescriptive Authority Status</label>
                    <select value={profile.prescriptiveAuthorityStatus || ''} onChange={(e) => updateProfile({ prescriptiveAuthorityStatus: e.target.value || null })} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">Select status</option>
                        {RX_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>State Protocol Requirements</label>
                    <textarea value={profile.stateProtocolRequirements || ''} onChange={(e) => { if (e.target.value.length <= 500) updateProfile({ stateProtocolRequirements: e.target.value }) }}
                        rows={3} placeholder="Optional: describe any state-specific protocol requirements" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <button onClick={handleSave} disabled={saving} style={{
                        padding: '10px 28px', borderRadius: '10px', background: saving ? 'rgba(45,212,191,0.3)' : 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
                        color: '#fff', fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: '8px',
                    }}>
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {saving ? 'Saving...' : 'Save Practice Authority'}
                    </button>
                </div>
            </div>
        </div>
    )
}
