"use client"

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  FileText, Loader2, Eye, Trash2, CheckCircle,
  AlertCircle, RefreshCw, Shield, X
} from 'lucide-react'

/* ── Allowed MIME types (must match lib/supabase-storage.ts) ── */
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const ALLOWED_EXTENSIONS = '.pdf,.doc,.docx'
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

/* ── Helpers ── */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function friendlyType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'PDF Document'
  if (ext === 'doc' || ext === 'docx') return 'Word Document'
  return 'Document'
}

/* ── Shared inline styles (dark‑mode‑ready via CSS vars) ── */
const sectionCard: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '16px',
  padding: '28px',
}

/* ──────────────────────────────────────────────────────── */
interface ResumeUploadProps {
  currentResumeUrl: string | null
  /** stored file metadata (optional — enriches the "uploaded" state) */
  resumeMeta?: { name?: string; size?: number; uploadedAt?: string }
  onUploadComplete: (url: string, meta: { name: string; size: number }) => void
  onRemove?: () => void
}

export default function ResumeUpload({
  currentResumeUrl,
  resumeMeta,
  onUploadComplete,
  onRemove,
}: ResumeUploadProps) {
  /* state */
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [viewing, setViewing] = useState(false)
  /* locally‑tracked meta (fallback when resumeMeta isn't provided) */
  const [localMeta, setLocalMeta] = useState<{ name: string; size: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  /* derived */
  const meta = resumeMeta
    ? { name: resumeMeta.name ?? 'Resume', size: resumeMeta.size ?? 0, uploadedAt: resumeMeta.uploadedAt }
    : localMeta
      ? { name: localMeta.name, size: localMeta.size, uploadedAt: new Date().toISOString() }
      : null

  /* ─────── Upload flow ─────── */
  const processFile = useCallback(async (file: File) => {
    setError(null)

    /* client‑side validation */
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Invalid file type. Please upload a PDF or Word document (.pdf, .doc, .docx)')
      return
    }
    if (file.size > MAX_SIZE) {
      setError(`File is too large (${formatBytes(file.size)}). Maximum size is 5 MB.`)
      return
    }

    /* start upload */
    setUploading(true)
    setProgress(0)

    /* fake progress 0 → 90 % while fetch is in‑flight */
    let p = 0
    progressTimer.current = setInterval(() => {
      p = Math.min(p + Math.random() * 12, 90)
      setProgress(Math.round(p))
    }, 200)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'resume')

      const res = await fetch('/api/upload', { method: 'POST', body: formData })

      if (progressTimer.current) clearInterval(progressTimer.current)

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      const { url } = await res.json()
      setProgress(100)
      setLocalMeta({ name: file.name, size: file.size })
      onUploadComplete(url, { name: file.name, size: file.size })

      /* toast */
      setToast(true)
      setTimeout(() => setToast(false), 3500)
    } catch (err: unknown) {
      if (progressTimer.current) clearInterval(progressTimer.current)
      setProgress(0)
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [onUploadComplete])

  /* drag events */
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true) }, [])
  const onDragLeave = useCallback(() => setDragging(false), [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  /* file input */
  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  /* view resume (signed URL) */
  const handleView = async () => {
    if (!currentResumeUrl) return
    setViewing(true)
    try {
      const urlParts = currentResumeUrl.split('/')
      const storagePath = urlParts[urlParts.length - 1]?.split('?')[0]
      if (!storagePath) throw new Error('Invalid URL')

      const supabase = createClient()
      const { data, error: urlErr } = await supabase.storage
        .from('resumes')
        .createSignedUrl(storagePath, 3600)

      if (urlErr) throw urlErr
      if (!data?.signedUrl) throw new Error('Could not generate link')
      window.open(data.signedUrl, '_blank')
    } catch {
      /* fallback: try opening the stored URL directly */
      window.open(currentResumeUrl, '_blank')
    } finally {
      setViewing(false)
    }
  }

  /* delete */
  const handleDelete = async () => {
    if (!currentResumeUrl || !onRemove) return
    setRemoving(true)
    try {
      const supabase = createClient()
      const urlParts = currentResumeUrl.split('/')
      const storagePath = urlParts[urlParts.length - 1]?.split('?')[0]
      if (storagePath && currentResumeUrl.includes('supabase')) {
        await supabase.storage.from('resumes').remove([storagePath])
      }
      setLocalMeta(null)
      setConfirmDelete(false)
      onRemove()
    } catch {
      setError('Failed to delete resume. Please try again.')
    } finally {
      setRemoving(false)
    }
  }

  /* ─────── RENDER: success toast ─────── */
  const toastEl = toast && (
    <div style={{
      position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '14px 22px', borderRadius: '12px',
      background: 'linear-gradient(135deg, #065F46, #047857)',
      color: '#ECFDF5', fontSize: '14px', fontWeight: 600,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      animation: 'fadeIn 0.3s ease',
    }}>
      <CheckCircle size={18} /> Resume uploaded ✓
    </div>
  )

  /* ─────── RENDER: error message ─────── */
  const errorEl = error && (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      marginTop: '12px', padding: '12px 16px', borderRadius: '10px',
      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
      color: '#EF4444', fontSize: '13px',
    }}>
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
      <span style={{ flex: 1 }}>{error}</span>
      <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0 }}>
        <X size={14} />
      </button>
    </div>
  )

  /* ─────── RENDER: progress bar ─────── */
  const progressBar = uploading && (
    <div style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Uploading…</span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#2DD4BF' }}>{progress}%</span>
      </div>
      <div style={{
        width: '100%', height: '6px', borderRadius: '3px',
        background: 'var(--bg-tertiary)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${progress}%`, height: '100%', borderRadius: '3px',
          background: 'linear-gradient(90deg, #2DD4BF, #14B8A6)',
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )

  /* ─────── Hidden file input (shared) ─────── */
  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ALLOWED_EXTENSIONS}
      onChange={onFileChange}
      style={{ display: 'none' }}
      disabled={uploading || removing}
    />
  )

  /* ─────── BEFORE UPLOAD STATE ─────── */
  if (!currentResumeUrl) {
    return (
      <div style={sectionCard}>
        {toastEl}
        {hiddenInput}

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => !uploading && fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragging ? '#2DD4BF' : 'var(--border-color)'}`,
            borderRadius: '14px',
            padding: '36px 24px',
            textAlign: 'center',
            cursor: uploading ? 'default' : 'pointer',
            transition: 'all 0.25s ease',
            background: dragging ? 'rgba(45,212,191,0.06)' : 'var(--bg-primary)',
          }}
        >
          {uploading ? (
            <Loader2 size={40} style={{ color: '#2DD4BF', margin: '0 auto' }} className="animate-spin" />
          ) : (
            <>
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                background: 'rgba(45,212,191,0.12)', margin: '0 auto 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FileText size={26} style={{ color: '#2DD4BF' }} />
              </div>
              <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Upload Your Resume
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                PDF or Word doc, max 5 MB — drag & drop or click to browse
              </p>
            </>
          )}

          {progressBar}
        </div>

        {/* Value props */}
        <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            'Quick Apply to jobs with one click',
            'Get matched with relevant positions',
            'Let employers discover your profile',
          ].map((text) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <CheckCircle size={15} style={{ color: '#2DD4BF', flexShrink: 0 }} />
              {text}
            </div>
          ))}
        </div>

        {/* Privacy note */}
        <p style={{
          marginTop: '14px', fontSize: '11px', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}>
          <Shield size={12} style={{ flexShrink: 0 }} />
          Your resume is only shared when you apply or if you enable &ldquo;Profile visible to employers&rdquo;
        </p>

        {errorEl}
      </div>
    )
  }

  /* ─────── AFTER UPLOAD STATE ─────── */
  return (
    <div style={sectionCard}>
      {toastEl}
      {hiddenInput}

      {/* File info row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* icon */}
        <div style={{
          width: '48px', height: '48px', borderRadius: '12px',
          background: 'rgba(45,212,191,0.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <FileText size={24} style={{ color: '#2DD4BF' }} />
        </div>

        {/* name + details */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {meta?.name || 'Resume'}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {meta?.size ? formatBytes(meta.size) : ''}{meta?.size ? ' · ' : ''}
            {friendlyType(meta?.name || 'resume.pdf')}
            {meta?.uploadedAt ? ` · Uploaded ${new Date(meta.uploadedAt).toLocaleDateString()}` : ''}
          </p>
        </div>

        {/* green badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          background: 'rgba(34,197,94,0.10)', color: '#22C55E',
          padding: '5px 12px', borderRadius: '20px',
          fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          <CheckCircle size={13} /> Uploaded
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '18px', flexWrap: 'wrap' }}>
        {/* View */}
        <button
          onClick={handleView}
          disabled={viewing}
          style={{
            flex: '1 1 0', minWidth: '120px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            padding: '10px 18px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
            color: '#FFFFFF', fontSize: '13px', fontWeight: 600,
            border: 'none', cursor: 'pointer', transition: 'opacity 0.2s',
            opacity: viewing ? 0.6 : 1,
          }}
        >
          {viewing ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
          View Resume
        </button>

        {/* Replace */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || removing}
          style={{
            flex: '1 1 0', minWidth: '120px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            padding: '10px 18px', borderRadius: '10px',
            background: 'var(--bg-primary)',
            color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600,
            border: '1.5px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          <RefreshCw size={15} />
          Replace Resume
        </button>
      </div>

      {/* Delete link */}
      {onRemove && !confirmDelete && (
        <button
          onClick={() => setConfirmDelete(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            marginTop: '14px', background: 'none', border: 'none',
            color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer',
            transition: 'color 0.2s', padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <Trash2 size={13} /> Delete Resume
        </button>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{
          marginTop: '14px', padding: '14px 16px', borderRadius: '10px',
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
          display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        }}>
          <p style={{ flex: 1, fontSize: '13px', color: '#EF4444', fontWeight: 500, minWidth: '180px' }}>
            Delete your resume? This can&apos;t be undone.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleDelete}
              disabled={removing}
              style={{
                padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer',
                opacity: removing ? 0.6 : 1,
              }}
            >
              {removing ? 'Deleting…' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                background: 'var(--bg-primary)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Progress bar (during replace upload) */}
      {progressBar}

      {/* Privacy note */}
      <p style={{
        marginTop: '16px', fontSize: '11px', color: 'var(--text-muted)',
        display: 'flex', alignItems: 'center', gap: '5px',
      }}>
        <Shield size={12} style={{ flexShrink: 0 }} />
        Your resume is only shared when you apply or if you enable &ldquo;Profile visible to employers&rdquo;
      </p>

      {errorEl}
    </div>
  )
}
