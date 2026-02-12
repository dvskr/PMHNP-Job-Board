"use client"

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  User, Mail, Phone, Building, Save, Loader2, Lock, CheckCircle,
  AlertTriangle, X, Eye, EyeOff, Briefcase, Award, MapPin, Linkedin,
  Calendar, DollarSign, FileText, Shield
} from 'lucide-react'
import AvatarUpload from '@/components/auth/AvatarUpload'
import ResumeUpload from '@/components/auth/ResumeUpload'
import ChipSelector from '@/components/profile/ChipSelector'
import PillSelector from '@/components/profile/PillSelector'
import { calculateCompleteness } from '@/lib/profile-completeness'

// ── Preset data ──
const CERT_PRESETS = ['PMHNP-BC', 'ANCC', 'DEA', 'BLS/ACLS', 'CAQ-Psych']
const SPECIALTY_PRESETS = [
  'ADHD', 'Anxiety/Depression', 'PTSD', 'Addiction',
  'Child & Adolescent', 'Geriatric', 'Eating Disorders',
  'OCD', 'Bipolar', 'Schizophrenia', 'General Adult',
]
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]
const WORK_MODES = ['Remote', 'On-site', 'Hybrid', 'Telehealth', 'Any']
const JOB_TYPES = ['Full-Time', 'Part-Time', 'Contract', 'Per Diem', 'Any']
const EXPERIENCE_OPTIONS = [
  { label: 'New Grad', value: 0 },
  { label: '1-2 years', value: 1 },
  { label: '3-5 years', value: 3 },
  { label: '5-10 years', value: 5 },
  { label: '10-15 years', value: 10 },
  { label: '15-20 years', value: 15 },
  { label: '20+ years', value: 20 },
]
const AVAILABILITY_OPTIONS = ['Immediately', '2 Weeks', '1 Month', '3 Months', 'Custom']

// ── Types ──
interface Profile {
  firstName: string | null
  lastName: string | null
  email: string
  phone: string | null
  company: string | null
  role: string
  avatarUrl: string | null
  resumeUrl: string | null
  headline: string | null
  yearsExperience: number | null
  certifications: string | null
  licenseStates: string | null
  specialties: string | null
  preferredWorkMode: string | null
  preferredJobType: string | null
  desiredSalaryMin: number | null
  desiredSalaryMax: number | null
  bio: string | null
  linkedinUrl: string | null
  availableDate: string | null
  openToOffers: boolean
  profileVisible: boolean
  createdAt?: string
}

// ── Shared card styles ──
const cardStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '16px',
  padding: '28px',
  marginBottom: '20px',
}
const cardTitle: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 700,
  color: 'var(--text-primary)',
  marginBottom: '20px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
}
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '10px',
  borderWidth: '1.5px',
  borderStyle: 'solid',
  borderColor: 'var(--border-color)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
  transition: 'border-color 0.2s',
}
const labelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '14px',
  fontWeight: 500,
  marginBottom: '6px',
  display: 'block',
}

export default function SettingsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [availabilityMode, setAvailabilityMode] = useState('Immediately')

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/auth/profile')
        if (res.status === 401) { router.push('/login'); return }
        if (!res.ok) throw new Error('Failed to fetch profile')
        const data = await res.json()
        setProfile(data)

        // Determine availability mode from stored date
        if (data.availableDate) {
          const d = new Date(data.availableDate)
          const now = new Date()
          const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          if (diffDays <= 1) setAvailabilityMode('Immediately')
          else if (diffDays <= 16) setAvailabilityMode('2 Weeks')
          else if (diffDays <= 35) setAvailabilityMode('1 Month')
          else if (diffDays <= 95) setAvailabilityMode('3 Months')
          else setAvailabilityMode('Custom')
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [router])

  // ── Handlers ──
  const handleAvatarUpload = async (url: string) => {
    if (!profile) return
    setProfile({ ...profile, avatarUrl: url })
    try {
      await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: url }),
      })
      showMsg('success', 'Avatar updated!')
    } catch { showMsg('error', 'Failed to update avatar') }
  }

  const handleAvatarRemove = async () => {
    if (!profile) return
    setProfile({ ...profile, avatarUrl: null })
    try {
      await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: null }),
      })
      showMsg('success', 'Avatar removed!')
    } catch { showMsg('error', 'Failed to remove avatar') }
  }

  const handleResumeUpload = async (url: string) => {
    if (!profile) return
    setProfile({ ...profile, resumeUrl: url })
    try {
      await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeUrl: url }),
      })
      showMsg('success', 'Resume uploaded!')
    } catch { showMsg('error', 'Failed to upload resume') }
  }

  const handleResumeRemove = async () => {
    if (!profile) return
    setProfile({ ...profile, resumeUrl: null })
    try {
      await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeUrl: null }),
      })
      showMsg('success', 'Resume removed!')
    } catch { showMsg('error', 'Failed to remove resume') }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'DELETE' })
      if (res.ok) {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/')
      } else {
        showMsg('error', 'Failed to delete account')
        setDeleting(false)
      }
    } catch {
      showMsg('error', 'Failed to delete account')
      setDeleting(false)
    }
    setShowDeleteModal(false)
  }

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    setMessage(null)

    // Compute availableDate from mode
    let availableDate: string | null = profile.availableDate
    if (availabilityMode === 'Immediately') {
      availableDate = new Date().toISOString()
    } else if (availabilityMode === '2 Weeks') {
      const d = new Date(); d.setDate(d.getDate() + 14)
      availableDate = d.toISOString()
    } else if (availabilityMode === '1 Month') {
      const d = new Date(); d.setMonth(d.getMonth() + 1)
      availableDate = d.toISOString()
    } else if (availabilityMode === '3 Months') {
      const d = new Date(); d.setMonth(d.getMonth() + 3)
      availableDate = d.toISOString()
    }
    // 'Custom' keeps existing value

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone,
          company: profile.company,
          avatarUrl: profile.avatarUrl,
          resumeUrl: profile.resumeUrl,
          headline: profile.headline,
          bio: profile.bio,
          yearsExperience: profile.yearsExperience,
          certifications: profile.certifications,
          licenseStates: profile.licenseStates,
          specialties: profile.specialties,
          preferredWorkMode: profile.preferredWorkMode,
          preferredJobType: profile.preferredJobType,
          desiredSalaryMin: profile.desiredSalaryMin,
          desiredSalaryMax: profile.desiredSalaryMax,
          linkedinUrl: profile.linkedinUrl,
          availableDate,
          openToOffers: profile.openToOffers,
          profileVisible: profile.profileVisible,
        }),
      })
      if (!res.ok) throw new Error('Failed to update profile')
      const updated = await res.json()
      setProfile(updated)
      showMsg('success', 'Profile updated!')
    } catch {
      showMsg('error', 'Failed to update profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordReset = async () => {
    if (!profile) return
    setSendingReset(true)
    setMessage(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })
      if (error) {
        if (error.message?.includes('seconds') || error.message?.includes('rate limit')) {
          showMsg('error', 'Please wait before requesting another reset email.')
        } else throw error
        return
      }
      showMsg('success', 'Password reset email sent! Check your inbox.')
    } catch (error: unknown) {
      showMsg('error', error instanceof Error ? error.message : 'Failed to send reset email.')
    } finally {
      setSendingReset(false)
    }
  }

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const updateProfile = (patch: Partial<Profile>) => {
    if (profile) setProfile({ ...profile, ...patch })
  }

  // ── Loading / null guards ──
  if (loading) {
    return (
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#2DD4BF' }} />
        </div>
      </div>
    )
  }
  if (!profile) return null

  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Your Name'
  const initials = (profile.firstName?.[0] || '') + (profile.lastName?.[0] || '') || profile.email[0].toUpperCase()

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 16px' }}>

      {/* ── Toast message ── */}
      {message && (
        <div
          style={{
            position: 'fixed', top: '80px', right: '20px', zIndex: 100,
            padding: '14px 20px', borderRadius: '12px',
            display: 'flex', alignItems: 'center', gap: '10px',
            background: message.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: message.type === 'success' ? '#10B981' : '#EF4444',
            fontSize: '14px', fontWeight: 500,
            backdropFilter: 'blur(12px)',
            animation: 'fadeIn 0.3s',
          }}
        >
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {message.text}
        </div>
      )}

      <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '24px' }}>
        Profile Settings
      </h1>

      {/* ═══ Profile Completeness Bar ═══ */}
      {profile.role === 'job_seeker' && (() => {
        const { percentage, color, missingItems } = calculateCompleteness(profile)
        return (
          <div style={{ ...cardStyle, padding: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Profile Completeness
              </span>
              <span style={{ fontSize: '22px', fontWeight: 800, color }}>
                {percentage}%
              </span>
            </div>
            {/* Progress bar */}
            <div style={{
              width: '100%', height: '10px', borderRadius: '5px',
              background: 'var(--bg-tertiary)', overflow: 'hidden',
            }}>
              <div style={{
                width: `${percentage}%`, height: '100%', borderRadius: '5px',
                background: color,
                transition: 'width 0.5s ease, background 0.5s ease',
              }} />
            </div>
            {/* Missing items or celebration */}
            {percentage >= 100 ? (
              <p style={{
                marginTop: '14px', fontSize: '14px', fontWeight: 600,
                color: '#22C55E', display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                🎉 Profile complete! Employers can now find you.
              </p>
            ) : (
              <div style={{ marginTop: '14px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {missingItems.map((item) => (
                  <button
                    key={item.fieldId + item.label}
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(item.fieldId)
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }}
                    style={{
                      padding: '6px 14px', borderRadius: '20px',
                      fontSize: '12px', fontWeight: 600,
                      background: `${color}18`, color,
                      border: `1px solid ${color}30`,
                      cursor: 'pointer', transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.label} (+{item.weight}%)
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* ═════════════════════════════════════════════
          SECTION 1 — Profile Header
         ═════════════════════════════════════════════ */}
      <div id="section-name" style={cardStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <AvatarUpload
            currentAvatarUrl={profile.avatarUrl}
            userEmail={profile.email}
            onUploadComplete={handleAvatarUpload}
            onRemove={handleAvatarRemove}
          />
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {displayName}
            </h2>
            {profile.headline && (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
                {profile.headline}
              </p>
            )}
          </div>
        </div>

        {/* Toggles — job seekers only */}
        {profile.role === 'job_seeker' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <ToggleRow
              label="Open to offers"
              description="Let employers know you're available"
              icon={<Briefcase size={16} style={{ color: '#2DD4BF' }} />}
              checked={profile.openToOffers}
              onChange={(v) => updateProfile({ openToOffers: v })}
            />
            <ToggleRow
              label="Profile visible to employers"
              description="Hide your profile from employer searches"
              icon={<Eye size={16} style={{ color: '#818CF8' }} />}
              checked={profile.profileVisible}
              onChange={(v) => updateProfile({ profileVisible: v })}
            />
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════
          SECTION 2 — Professional Info (job seekers only)
         ═════════════════════════════════════════════ */}
      {profile.role === 'job_seeker' && (
        <div id="section-headline" style={cardStyle}>
          <div id="section-bio" />
          <div id="section-experience" />
          <div id="section-certifications" />
          <div id="section-states" />
          <div id="section-specialties" />
          <h3 style={cardTitle}>
            <Award size={20} style={{ color: '#2DD4BF' }} />
            Professional Info
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Headline */}
            <div>
              <label style={labelStyle}>Professional Headline</label>
              <input
                type="text"
                value={profile.headline || ''}
                onChange={(e) => updateProfile({ headline: e.target.value })}
                placeholder="e.g. PMHNP-BC | 5 Years Telehealth"
                maxLength={120}
                style={inputStyle}
              />
            </div>

            {/* Bio / Summary */}
            <div>
              <label style={labelStyle}>Professional Summary</label>
              <textarea
                value={profile.bio || ''}
                onChange={(e) => {
                  if (e.target.value.length <= 500) updateProfile({ bio: e.target.value })
                }}
                placeholder="Brief summary of your experience and goals..."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '100px' }}
              />
              <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {(profile.bio || '').length}/500
              </div>
            </div>

            {/* Years of Experience */}
            <div>
              <label style={labelStyle}>Years of Experience</label>
              <select
                value={profile.yearsExperience ?? ''}
                onChange={(e) => updateProfile({
                  yearsExperience: e.target.value ? parseInt(e.target.value, 10) : null,
                })}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Select experience level</option>
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Certifications */}
            <ChipSelector
              label="Certifications"
              presets={CERT_PRESETS}
              value={profile.certifications || ''}
              onChange={(v) => updateProfile({ certifications: v })}
              customPlaceholder="Add certification..."
            />

            {/* Licensed States */}
            <ChipSelector
              label="Licensed States"
              presets={US_STATES}
              value={profile.licenseStates || ''}
              onChange={(v) => updateProfile({ licenseStates: v })}
              allowCustom={false}
            />

            {/* Specialties */}
            <ChipSelector
              label="Specialties"
              presets={SPECIALTY_PRESETS}
              value={profile.specialties || ''}
              onChange={(v) => updateProfile({ specialties: v })}
              customPlaceholder="Add specialty..."
            />
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════
          SECTION 3 — Job Preferences (job seekers only)
         ═════════════════════════════════════════════ */}
      {profile.role === 'job_seeker' && (
        <div id="section-workmode" style={cardStyle}>
          <h3 style={cardTitle}>
            <Briefcase size={20} style={{ color: '#E86C2C' }} />
            Job Preferences
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {/* Work Mode */}
            <PillSelector
              label="Preferred Work Mode"
              options={WORK_MODES}
              value={profile.preferredWorkMode || ''}
              onChange={(v) => updateProfile({ preferredWorkMode: v })}
            />

            {/* Job Type */}
            <PillSelector
              label="Preferred Job Type"
              options={JOB_TYPES}
              value={profile.preferredJobType || ''}
              onChange={(v) => updateProfile({ preferredJobType: v })}
            />

            {/* Salary Range */}
            <div>
              <label style={labelStyle}>Desired Salary Range</label>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <DollarSign
                    size={16}
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                  />
                  <input
                    type="number"
                    value={profile.desiredSalaryMin ?? ''}
                    onChange={(e) => updateProfile({ desiredSalaryMin: e.target.value ? parseInt(e.target.value, 10) : null })}
                    placeholder="Min"
                    style={{ ...inputStyle, paddingLeft: '32px' }}
                  />
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>to</span>
                <div style={{ position: 'relative', flex: 1 }}>
                  <DollarSign
                    size={16}
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                  />
                  <input
                    type="number"
                    value={profile.desiredSalaryMax ?? ''}
                    onChange={(e) => updateProfile({ desiredSalaryMax: e.target.value ? parseInt(e.target.value, 10) : null })}
                    placeholder="Max"
                    style={{ ...inputStyle, paddingLeft: '32px' }}
                  />
                </div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                <Shield size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                Private — employers see a range, not exact numbers
              </p>
            </div>

            {/* Available Start Date */}
            <div>
              <label style={labelStyle}>Available to Start</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {AVAILABILITY_OPTIONS.map((opt) => {
                  const isSelected = availabilityMode === opt
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAvailabilityMode(opt)}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '24px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: isSelected ? '1.5px solid #2DD4BF' : '1.5px solid var(--border-color)',
                        background: isSelected ? 'rgba(45,212,191,0.12)' : 'var(--bg-primary)',
                        color: isSelected ? '#2DD4BF' : 'var(--text-secondary)',
                      }}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
              {availabilityMode === 'Custom' && (
                <input
                  type="date"
                  value={profile.availableDate ? new Date(profile.availableDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => updateProfile({ availableDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  style={{ ...inputStyle, marginTop: '10px', maxWidth: '220px' }}
                />
              )}
            </div>

            {/* LinkedIn */}
            <div>
              <label style={labelStyle}>LinkedIn Profile</label>
              <div style={{ position: 'relative' }}>
                <Linkedin
                  size={16}
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  type="url"
                  value={profile.linkedinUrl || ''}
                  onChange={(e) => updateProfile({ linkedinUrl: e.target.value })}
                  placeholder="https://linkedin.com/in/yourprofile"
                  style={{ ...inputStyle, paddingLeft: '36px' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════
          SECTION 3b — Resume (job seekers only)
         ═════════════════════════════════════════════ */}
      {profile.role === 'job_seeker' && (
        <div id="section-resume">
          <ResumeUpload
            currentResumeUrl={profile.resumeUrl}
            onUploadComplete={(url) => updateProfile({ resumeUrl: url })}
            onRemove={() => updateProfile({ resumeUrl: null })}
          />
        </div>
      )}

      {/* ═════════════════════════════════════════════
          SECTION 4 — Personal Info
         ═════════════════════════════════════════════ */}
      <div id="section-contact" style={cardStyle}>
        <h3 style={cardTitle}>
          <User size={20} style={{ color: '#818CF8' }} />
          Personal Info
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>First Name</label>
            <input
              type="text"
              value={profile.firstName || ''}
              onChange={(e) => updateProfile({ firstName: e.target.value })}
              placeholder="First name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Last Name</label>
            <input
              type="text"
              value={profile.lastName || ''}
              onChange={(e) => updateProfile({ lastName: e.target.value })}
              placeholder="Last name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Phone <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>(optional)</span></label>
            <div style={{ position: 'relative' }}>
              <Phone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="tel"
                value={profile.phone || ''}
                onChange={(e) => updateProfile({ phone: e.target.value })}
                placeholder="555-1234"
                style={{ ...inputStyle, paddingLeft: '36px' }}
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="email"
                value={profile.email}
                disabled
                style={{
                  ...inputStyle,
                  paddingLeft: '36px',
                  opacity: 0.6,
                  cursor: 'not-allowed',
                }}
              />
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Email cannot be changed</p>
          </div>

          {/* Company (only for employers) */}
          {profile.role === 'employer' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Company</label>
              <div style={{ position: 'relative' }}>
                <Building size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={profile.company || ''}
                  onChange={(e) => updateProfile({ company: e.target.value })}
                  placeholder="Your company name"
                  style={{ ...inputStyle, paddingLeft: '36px' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═════════════════════════════════════════════
          SECTION 5 — Resume
         ═════════════════════════════════════════════ */}
      {profile.role === 'job_seeker' && (
        <div id="section-resume" style={cardStyle}>
          <h3 style={cardTitle}>
            <FileText size={20} style={{ color: '#F59E0B' }} />
            Resume
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
            Upload your resume to quickly apply to jobs
          </p>
          <ResumeUpload
            currentResumeUrl={profile.resumeUrl}
            onUploadComplete={handleResumeUpload}
            onRemove={handleResumeRemove}
          />
        </div>
      )}

      {/* ═════════════════════════════════════════════
          SECTION 6 — Account
         ═════════════════════════════════════════════ */}
      <div style={cardStyle}>
        <h3 style={cardTitle}>
          <Lock size={20} style={{ color: 'var(--text-muted)' }} />
          Account
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Account type */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Account Type</span>
            <span style={{
              padding: '4px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'capitalize',
              background: profile.role === 'admin' ? 'rgba(168,85,247,0.15)' : profile.role === 'employer' ? 'rgba(16,185,129,0.15)' : 'rgba(45,212,191,0.15)',
              color: profile.role === 'admin' ? '#A855F7' : profile.role === 'employer' ? '#10B981' : '#2DD4BF',
            }}>
              {profile.role.replace('_', ' ')}
            </span>
          </div>

          {/* Member since */}
          {profile.createdAt && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Member Since</span>
              <span style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                {new Date(profile.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>
          )}

          {/* Password reset */}
          <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '10px' }}>
              We&apos;ll send you an email with a link to reset your password.
            </p>
            <button
              onClick={handlePasswordReset}
              disabled={sendingReset}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 18px', borderRadius: '10px',
                border: '1.5px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
                fontSize: '13px', fontWeight: 500,
                cursor: sendingReset ? 'not-allowed' : 'pointer',
                opacity: sendingReset ? 0.6 : 1,
                transition: 'all 0.2s',
              }}
            >
              {sendingReset ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              {sendingReset ? 'Sending...' : 'Send Reset Email'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Danger Zone ── */}
      <div style={{ ...cardStyle, borderColor: 'rgba(239,68,68,0.3)' }}>
        <h3 style={{ ...cardTitle, color: '#EF4444' }}>
          <AlertTriangle size={20} />
          Danger Zone
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px' }}>
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          style={{
            padding: '8px 20px', borderRadius: '10px',
            background: 'rgba(239,68,68,0.1)',
            border: '1.5px solid rgba(239,68,68,0.3)',
            color: '#EF4444',
            fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          Delete Account
        </button>
      </div>

      {/* ── Save Button (sticky) ── */}
      <div style={{
        position: 'sticky', bottom: '20px', zIndex: 50,
        padding: '16px', marginTop: '8px',
        display: 'flex', justifyContent: 'center',
      }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '14px 48px',
            borderRadius: '14px',
            background: saving ? 'rgba(45,212,191,0.3)' : 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
            color: '#fff',
            fontSize: '15px',
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            border: 'none',
            display: 'flex', alignItems: 'center', gap: '10px',
            boxShadow: '0 4px 20px rgba(45,212,191,0.3)',
            transition: 'all 0.3s',
          }}
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, padding: '16px',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '20px',
            maxWidth: '420px',
            width: '100%',
            padding: '32px',
            position: 'relative',
          }}>
            <button
              onClick={() => setShowDeleteModal(false)}
              disabled={deleting}
              style={{
                position: 'absolute', top: '16px', right: '16px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
            >
              <X size={20} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'rgba(239,68,68,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <AlertTriangle size={32} style={{ color: '#EF4444' }} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Delete Account?
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                This action cannot be undone.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px',
                  border: '1.5px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-secondary)',
                  fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px',
                  border: 'none',
                  background: '#EF4444',
                  color: '#fff',
                  fontSize: '14px', fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : null}
                {deleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Toggle row component ──
function ToggleRow({
  label,
  description,
  icon,
  checked,
  onChange,
}: {
  label: string
  description: string
  icon: React.ReactNode
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px',
      borderRadius: '12px',
      background: 'var(--bg-primary)',
      border: '1px solid var(--border-color)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {icon}
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{description}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: '44px', height: '24px',
          borderRadius: '12px',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          transition: 'background 0.3s',
          background: checked ? '#2DD4BF' : 'var(--border-color)',
          flexShrink: 0,
        }}
      >
        <div style={{
          width: '18px', height: '18px',
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: '3px',
          left: checked ? '23px' : '3px',
          transition: 'left 0.3s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  )
}
