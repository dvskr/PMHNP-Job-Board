"use client"

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileText, Upload, Loader2, Download, Trash2, CheckCircle, AlertCircle } from 'lucide-react'

interface ResumeUploadProps {
  currentResumeUrl: string | null
  onUploadComplete: (url: string) => void
  onRemove?: () => void
}

export default function ResumeUpload({ 
  currentResumeUrl, 
  onUploadComplete,
  onRemove 
}: ResumeUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleRemove = async () => {
    if (!currentResumeUrl || !onRemove) return

    setRemoving(true)
    setError(null)

    try {
      const supabase = createClient()
      
      // Extract filename from URL
      const urlParts = currentResumeUrl.split('/')
      const fileNameFromUrl = urlParts[urlParts.length - 1]?.split('?')[0] // Remove query params

      // Delete from storage
      if (fileNameFromUrl && currentResumeUrl.includes('supabase')) {
        await supabase.storage
          .from('resumes')
          .remove([fileNameFromUrl])
      }

      // Call callback to update database
      setFileName(null)
      onRemove()
    } catch (err: unknown) {
      console.error('Remove error:', err)
      setError(err instanceof Error ? err.message : 'Failed to remove resume')
    } finally {
      setRemoving(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    // Validate file type
    if (file.type !== 'application/pdf') {
      setError('Please select a PDF file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Resume must be less than 5MB')
      return
    }

    try {
      setUploading(true)

      // Upload via API endpoint (handles auth and RLS policies)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'resume')

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const { url } = await response.json()
      
      // Call callback with the URL
      setFileName(file.name)
      onUploadComplete(url)
    } catch (err: unknown) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload resume')
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDownload = async () => {
    if (!currentResumeUrl) return

    setDownloading(true)
    setError(null)

    try {
      // Extract filename from storage path
      const urlParts = currentResumeUrl.split('/')
      const fileName = urlParts[urlParts.length - 1]?.split('?')[0] // Remove query params

      if (!fileName) {
        throw new Error('Invalid resume URL')
      }

      // Create signed URL for private bucket
      const supabase = createClient()
      const { data, error: urlError } = await supabase.storage
        .from('resumes')
        .createSignedUrl(fileName, 3600) // Valid for 1 hour

      if (urlError) throw urlError
      if (!data?.signedUrl) throw new Error('Failed to generate download link')

      // Open in new tab
      window.open(data.signedUrl, '_blank')
    } catch (err: unknown) {
      console.error('Download error:', err)
      setError(err instanceof Error ? err.message : 'Failed to download resume')
    } finally {
      setDownloading(false)
    }
  }

  // No resume uploaded
  if (!currentResumeUrl) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-lg p-8 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-gray-50 hover:bg-blue-50"
        >
          {uploading ? (
            <>
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              <p className="text-sm font-medium text-gray-700">Uploading...</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                <Upload className="w-8 h-8 text-blue-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900">Upload Resume</p>
                <p className="text-xs text-gray-500 mt-1">PDF only, max 5MB</p>
              </div>
            </>
          )}
        </button>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading || downloading}
        />

        {/* Error Message */}
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
      </div>
    )
  }

  // Resume already uploaded
  return (
    <div className="space-y-3">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          {/* Icon with checkmark */}
          <div className="relative">
            <FileText className="w-10 h-10 text-green-600" />
            <div className="absolute -top-1 -right-1 bg-green-600 rounded-full p-0.5">
              <CheckCircle className="w-3 h-3 text-white" />
            </div>
          </div>

          {/* Resume Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-900">Resume uploaded</p>
            {fileName && (
              <p className="text-xs text-green-700 mt-0.5 truncate">{fileName}</p>
            )}
            <p className="text-xs text-green-600 mt-1">PDF document</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 mt-4">
          <button
            type="button"
            onClick={handleDownload}
            disabled={uploading || removing || downloading}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || removing || downloading}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-white text-green-700 text-sm font-medium rounded-lg border border-green-300 hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Replace'}
          </button>

          {onRemove && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading || removing || downloading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-300 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              {removing ? 'Removing...' : 'Remove'}
            </button>
          )}
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileChange}
        className="hidden"
        disabled={uploading || removing || downloading}
      />

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}

