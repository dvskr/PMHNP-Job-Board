'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Upload, Trash2, Loader2, Eye, FileText, Image as ImageIcon, File, FolderOpen, X } from 'lucide-react'

const DOC_TYPES = [
    { key: 'rn_license', label: 'RN License' },
    { key: 'aprn_license', label: 'APRN License' },
    { key: 'ancc_certification', label: 'ANCC Certification (PMHNP-BC)' },
    { key: 'dea_registration', label: 'DEA Registration' },
    { key: 'state_csr', label: 'State Controlled Substance Registration' },
    { key: 'malpractice_certificate', label: 'Malpractice Insurance Certificate' },
    { key: 'bls_certification', label: 'BLS Certification' },
    { key: 'acls_certification', label: 'ACLS Certification' },
    { key: 'npi_verification', label: 'NPI Verification' },
    { key: 'transcript', label: 'Transcripts / Diplomas' },
    { key: 'immunization_records', label: 'Immunization Records' },
    { key: 'collaborative_agreement', label: 'Collaborative Agreement' },
    { key: 'cme_proof', label: 'CME/CEU Completion Proof' },
    { key: 'headshot', label: 'Professional Headshot' },
]

interface Doc {
    id: string; documentType: string; documentLabel: string; fileUrl: string
    fileName: string; fileSize: number | null; mimeType: string | null
    expirationDate: string | null; createdAt: string
}

const ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png'
const MAX_SIZE = 10 * 1024 * 1024

function fmtSize(bytes: number | null): string {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getIcon(mime: string | null) {
    if (!mime) return <File size={24} />
    if (mime.startsWith('image/')) return <ImageIcon size={24} style={{ color: '#A78BFA' }} />
    if (mime.includes('pdf')) return <FileText size={24} style={{ color: '#EF4444' }} />
    return <FileText size={24} style={{ color: '#3B82F6' }} />
}

interface Props { showMsg: (type: 'success' | 'error', text: string) => void }

export default function DocumentVaultSection({ showMsg }: Props) {
    const [docs, setDocs] = useState<Doc[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [otherDocs, setOtherDocs] = useState<Doc[]>([])
    const [showOtherForm, setShowOtherForm] = useState(false)
    const [otherLabel, setOtherLabel] = useState('')
    const otherFileRef = useRef<HTMLInputElement>(null)
    const fileRefs = useRef<{ [key: string]: HTMLInputElement | null }>({})

    const fetchDocs = useCallback(async () => {
        try {
            const res = await fetch('/api/profile/documents')
            if (res.ok) {
                const all = await res.json() as Doc[]
                setDocs(all.filter((d) => d.documentType !== 'other'))
                setOtherDocs(all.filter((d) => d.documentType === 'other'))
            }
        } catch { /* silent */ } finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchDocs() }, [fetchDocs])

    const handleUpload = async (file: File, documentType: string, documentLabel: string) => {
        if (file.size > MAX_SIZE) { showMsg('error', 'File must be under 10 MB.'); return }
        setUploading(documentType)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('documentType', documentType)
            formData.append('documentLabel', documentLabel)

            const res = await fetch('/api/profile/documents', { method: 'POST', body: formData })
            if (!res.ok) throw new Error('Failed')
            showMsg('success', `${documentLabel} uploaded!`)
            await fetchDocs()
        } catch { showMsg('error', 'Upload failed.') }
        finally { setUploading(null) }
    }

    const handleDelete = async (id: string) => {
        setDeletingId(id)
        try {
            const res = await fetch(`/api/profile/documents/${id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed')
            showMsg('success', 'Document deleted.')
            await fetchDocs()
        } catch { showMsg('error', 'Failed to delete.') }
        finally { setDeletingId(null) }
    }

    const handleOtherUpload = async () => {
        const file = otherFileRef.current?.files?.[0]
        if (!file || !otherLabel.trim()) { showMsg('error', 'Please provide a label and file.'); return }
        await handleUpload(file, 'other', otherLabel.trim())
        setOtherLabel(''); setShowOtherForm(false)
        if (otherFileRef.current) otherFileRef.current.value = ''
    }

    const getDocForType = (type: string): Doc | undefined => docs.find((d) => d.documentType === type)

    return (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '28px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <FolderOpen size={20} style={{ color: '#F59E0B' }} /> Document Vault
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', marginTop: 0 }}>
                {docs.length + otherDocs.length} document{docs.length + otherDocs.length !== 1 ? 's' : ''} uploaded — PDF, DOC, DOCX, JPG, PNG (max 10 MB)
            </p>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '24px' }}><Loader2 size={20} className="animate-spin" style={{ display: 'inline', color: 'var(--text-muted)' }} /></div>
            ) : (
                <>
                    {/* Document type grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                        {DOC_TYPES.map((dt) => {
                            const doc = getDocForType(dt.key)
                            const isUploading = uploading === dt.key
                            return (
                                <div key={dt.key} style={{
                                    padding: '16px', borderRadius: '12px', border: `1.5px ${doc ? 'solid' : 'dashed'} ${doc ? 'rgba(45,212,191,0.3)' : 'var(--border-color)'}`,
                                    background: doc ? 'rgba(45,212,191,0.04)' : 'var(--bg-primary)', transition: 'all 0.2s',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                        {doc ? getIcon(doc.mimeType) : <File size={24} style={{ color: 'var(--text-muted)' }} />}
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{dt.label}</span>
                                    </div>
                                    {doc ? (
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                                {doc.fileName} {doc.fileSize ? `· ${fmtSize(doc.fileSize)}` : ''}<br />
                                                Uploaded {fmtDate(doc.createdAt)}
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                                                    style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: 'rgba(45,212,191,0.1)', color: '#2DD4BF', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Eye size={12} /> View
                                                </a>
                                                <button onClick={() => { if (fileRefs.current[dt.key]) fileRefs.current[dt.key]!.click() }}
                                                    style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Upload size={12} /> Replace
                                                </button>
                                                <button onClick={() => handleDelete(doc.id)} disabled={deletingId === doc.id}
                                                    style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: 'none', cursor: deletingId === doc.id ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {deletingId === doc.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={() => { if (fileRefs.current[dt.key]) fileRefs.current[dt.key]!.click() }} disabled={isUploading}
                                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px dashed var(--border-color)', background: 'transparent', color: isUploading ? 'var(--text-muted)' : '#2DD4BF', fontSize: '12px', fontWeight: 600, cursor: isUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                            {isUploading ? <><Loader2 size={14} className="animate-spin" /> Uploading...</> : <><Upload size={14} /> Upload</>}
                                        </button>
                                    )}
                                    <input ref={(el) => { fileRefs.current[dt.key] = el }} type="file" accept={ACCEPT} style={{ display: 'none' }}
                                        onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (doc) handleDelete(doc.id).then(() => handleUpload(f, dt.key, dt.label)); else handleUpload(f, dt.key, dt.label) }; e.target.value = '' }} />
                                </div>
                            )
                        })}
                    </div>

                    {/* Other Documents */}
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px' }}>Other Documents</h4>
                        {otherDocs.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                                {otherDocs.map((d) => (
                                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
                                        {getIcon(d.mimeType)}
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{d.documentLabel}</span>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.fileName} {d.fileSize ? `· ${fmtSize(d.fileSize)}` : ''}</div>
                                        </div>
                                        <a href={d.fileUrl} target="_blank" rel="noopener noreferrer"
                                            style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: 'rgba(45,212,191,0.1)', color: '#2DD4BF', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Eye size={12} /> View
                                        </a>
                                        <button onClick={() => handleDelete(d.id)} disabled={deletingId === d.id}
                                            style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            {deletingId === d.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {showOtherForm ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Document Label</label>
                                    <input type="text" value={otherLabel} onChange={(e) => setOtherLabel(e.target.value)} placeholder="e.g. State License Verification"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <input ref={otherFileRef} type="file" accept={ACCEPT} style={{ fontSize: '12px', color: 'var(--text-secondary)' }} />
                                <button onClick={handleOtherUpload} disabled={uploading === 'other'}
                                    style={{ padding: '8px 16px', borderRadius: '8px', background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)', color: '#fff', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    {uploading === 'other' ? <Loader2 size={14} className="animate-spin" /> : 'Upload'}
                                </button>
                                <button onClick={() => setShowOtherForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                            </div>
                        ) : (
                            <button onClick={() => setShowOtherForm(true)}
                                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px dashed var(--border-color)', background: 'transparent', color: '#2DD4BF', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Upload size={14} /> Upload Other Document
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
