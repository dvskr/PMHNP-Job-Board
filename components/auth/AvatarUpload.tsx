"use client"

import { useState, useRef } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Camera, Loader2, User, AlertCircle, Trash2 } from 'lucide-react'

interface AvatarUploadProps {
  currentAvatarUrl: string | null
  userEmail: string
  onUploadComplete: (url: string) => void
  onRemove?: () => void
}

export default function AvatarUpload({ 
  currentAvatarUrl, 
  onUploadComplete,
  onRemove 
}: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleRemove = async () => {
    if (!currentAvatarUrl || !onRemove) return

    setRemoving(true)
    setError(null)

    try {
      const supabase = createClient()
      
      // Extract filename from URL
      const urlParts = currentAvatarUrl.split('/')
      const fileName = urlParts[urlParts.length - 1]

      // Delete from storage (optional - you may want to keep old files)
      if (fileName && currentAvatarUrl.includes('supabase')) {
        await supabase.storage
          .from('avatars')
          .remove([fileName])
      }

      // Call callback to update database
      onRemove()
    } catch (err: unknown) {
      console.error('Remove error:', err)
      setError(err instanceof Error ? err.message : 'Failed to remove avatar')
    } finally {
      setRemoving(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be less than 2MB')
      return
    }

    try {
      // Show preview
      const previewUrl = URL.createObjectURL(file)
      setPreview(previewUrl)
      setUploading(true)

      // Upload via API endpoint (handles auth and RLS policies)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'avatar')

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const { url } = await response.json()

      // Call callback with new URL
      onUploadComplete(url)
      
      // Clean up preview
      URL.revokeObjectURL(previewUrl)
      setPreview(null)
    } catch (err: unknown) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload image')
      setPreview(null)
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const displayUrl = preview || currentAvatarUrl

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Avatar Container */}
      <div className="relative group">
        <div className="w-24 h-24 rounded-full border-2 border-gray-300 overflow-hidden bg-gray-100 flex items-center justify-center">
          {uploading ? (
            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
          ) : displayUrl ? (
            <Image 
              src={displayUrl} 
              alt="Profile" 
              width={128}
              height={128}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-teal-100 flex items-center justify-center">
              <User className="w-10 h-10 text-teal-600" />
            </div>
          )}
        </div>

        {/* Hover Overlay */}
        {!uploading && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 rounded-full bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <Camera className="w-6 h-6 text-white" />
          </button>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || removing}
          className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Camera className="w-4 h-4" />
          {uploading ? 'Uploading...' : currentAvatarUrl ? 'Change' : 'Upload Photo'}
        </button>

        {currentAvatarUrl && onRemove && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={uploading || removing}
            className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            {removing ? 'Removing...' : 'Remove'}
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg max-w-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Info Text */}
      <p className="text-xs text-gray-500 text-center max-w-xs">
        JPG, PNG or GIF. Max 2MB.
      </p>
    </div>
  )
}

