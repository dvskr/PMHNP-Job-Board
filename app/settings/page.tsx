"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User, Mail, Phone, Building, Save, Loader2, Lock, CheckCircle, AlertTriangle, X } from 'lucide-react'
import AvatarUpload from '@/components/auth/AvatarUpload'
import ResumeUpload from '@/components/auth/ResumeUpload'

interface Profile {
  firstName: string | null
  lastName: string | null
  email: string
  phone: string | null
  company: string | null
  role: string
  avatarUrl: string | null
  resumeUrl: string | null
  createdAt?: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/auth/profile')

        if (res.status === 401) {
          router.push('/login')
          return
        }

        if (!res.ok) {
          throw new Error('Failed to fetch profile')
        }

        const data = await res.json()
        setProfile(data)
      } catch (error) {
        console.error('Error fetching profile:', error)
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [router])

  const handleAvatarUpload = async (url: string) => {
    if (!profile) return

    // Update profile state
    setProfile({ ...profile, avatarUrl: url })

    // Save to database
    try {
      await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: url }),
      })

      setMessage({ type: 'success', text: 'Avatar updated!' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Error updating avatar:', error)
      setMessage({ type: 'error', text: 'Failed to update avatar' })
    }
  }

  const handleAvatarRemove = async () => {
    if (!profile) return

    // Update profile state
    setProfile({ ...profile, avatarUrl: null })

    // Save to database
    try {
      await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: null }),
      })

      setMessage({ type: 'success', text: 'Avatar removed!' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Error removing avatar:', error)
      setMessage({ type: 'error', text: 'Failed to remove avatar' })
    }
  }

  const handleResumeUpload = async (url: string) => {
    if (!profile) return

    // Update profile state
    setProfile({ ...profile, resumeUrl: url })

    // Save to database
    try {
      await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeUrl: url }),
      })

      setMessage({ type: 'success', text: 'Resume uploaded!' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Error uploading resume:', error)
      setMessage({ type: 'error', text: 'Failed to upload resume' })
    }
  }

  const handleResumeRemove = async () => {
    if (!profile) return

    // Update profile state
    setProfile({ ...profile, resumeUrl: null })

    // Save to database
    try {
      await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeUrl: null }),
      })

      setMessage({ type: 'success', text: 'Resume removed!' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Error removing resume:', error)
      setMessage({ type: 'error', text: 'Failed to remove resume' })
    }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)

    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
      })

      if (res.ok) {
        // Sign out and redirect
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/')
      } else {
        setMessage({ type: 'error', text: 'Failed to delete account' })
        setDeleting(false)
      }
    } catch (error) {
      console.error('Error deleting account:', error)
      setMessage({ type: 'error', text: 'Failed to delete account' })
      setDeleting(false)
    }

    setShowDeleteModal(false)
  }

  const handleSave = async () => {
    if (!profile) return

    setSaving(true)
    setMessage(null)

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
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to update profile')
      }

      const updated = await res.json()
      setProfile(updated)
      setMessage({ type: 'success', text: 'Profile updated!' })

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Error updating profile:', error)
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' })
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
        // Handle rate limit error specifically
        if (error.message?.includes('seconds') || error.message?.includes('rate limit')) {
          setMessage({
            type: 'error',
            text: 'Please wait before requesting another reset email. For security, password resets are rate limited.'
          })
        } else {
          throw error
        }
        return
      }

      setMessage({ type: 'success', text: 'Password reset email sent! Check your inbox.' })

      // Clear message after 5 seconds
      setTimeout(() => setMessage(null), 5000)
    } catch (error: unknown) {
      console.error('Error sending reset email:', error)
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to send reset email. Please try again.'
      })
    } finally {
      setSendingReset(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      </div>
    )
  }

  if (!profile) {
    return null
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-700'
      case 'employer':
        return 'bg-green-100 text-green-700'
      default:
        return 'bg-teal-100 text-teal-700'
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Success/Error Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${message.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
            }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <div className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5">⚠️</div>
          )}
          <p
            className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'
              }`}
          >
            {message.text}
          </p>
        </div>
      )}

      {/* Profile Information */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Profile Information</h2>

        {/* Avatar Upload */}
        <div className="flex flex-col items-center mb-6">
          <AvatarUpload
            currentAvatarUrl={profile.avatarUrl}
            userEmail={profile.email}
            onUploadComplete={handleAvatarUpload}
            onRemove={handleAvatarRemove}
          />
          <p className="text-sm text-gray-500 mt-2">
            {profile.avatarUrl ? 'Click to change or remove photo' : 'Click to upload photo'}
          </p>
        </div>

        <div className="space-y-4">
          {/* First Name */}
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
              First Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="firstName"
                type="text"
                value={profile.firstName || ''}
                onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="Your first name"
              />
            </div>
          </div>

          {/* Last Name */}
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
              Last Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="lastName"
                type="text"
                value={profile.lastName || ''}
                onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="Your last name"
              />
            </div>
          </div>

          {/* Email (Disabled) */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="email"
                type="email"
                value={profile.email}
                disabled
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Phone <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="phone"
                type="tel"
                value={profile.phone || ''}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="555-1234"
              />
            </div>
          </div>

          {/* Company (only for employers) */}
          {profile.role === 'employer' && (
            <div>
              <label htmlFor="company" className="block text-sm font-medium text-gray-700 mb-1">
                Company
              </label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="company"
                  type="text"
                  value={profile.company || ''}
                  onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="Your company name"
                />
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto mt-6 bg-teal-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-teal-700 focus:ring-4 focus:ring-teal-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Change Password */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Change Password</h2>
        <p className="text-sm text-gray-600 mb-4">
          We&apos;ll send you an email with a link to reset your password.
        </p>
        <button
          onClick={handlePasswordReset}
          disabled={sendingReset}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sendingReset ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Send Reset Email
            </>
          )}
        </button>
      </div>

      {/* Resume Section - Only for Job Seekers */}
      {profile.role === 'job_seeker' && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Resume</h2>
          <p className="text-gray-600 text-sm mb-4">
            Upload your resume to quickly apply to jobs
          </p>
          <ResumeUpload
            currentResumeUrl={profile.resumeUrl}
            onUploadComplete={handleResumeUpload}
            onRemove={handleResumeRemove}
          />
        </div>
      )}

      {/* Account Info */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Account Information</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-500">Account Type</label>
            <div className="mt-1">
              <span
                className={`inline-block px-3 py-1 text-sm font-medium rounded-full capitalize ${getRoleBadgeColor(
                  profile.role
                )}`}
              >
                {profile.role.replace('_', ' ')}
              </span>
            </div>
          </div>
          {profile.createdAt && (
            <div>
              <label className="text-sm text-gray-500">Member Since</label>
              <p className="text-gray-900 mt-1">
                {new Date(profile.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white shadow-md rounded-lg p-6 mt-6 border border-red-200">
        <h2 className="text-xl font-semibold text-red-600 mb-4">Danger Zone</h2>
        <p className="text-gray-600 text-sm mb-4">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
        >
          Delete Account
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 relative">
            {/* Close button */}
            <button
              onClick={() => setShowDeleteModal(false)}
              disabled={deleting}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-50"
              aria-label="Close delete account modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Warning Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>

            {/* Modal Content */}
            <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Delete Account?
            </h3>
            <p className="text-gray-600 text-center mb-2">
              Are you sure you want to delete your account?
            </p>
            <p className="text-red-600 text-sm text-center font-medium mb-6">
              This action cannot be undone.
            </p>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete Account'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

