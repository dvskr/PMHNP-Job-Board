'use client';

import { useState, useEffect } from 'react';
import {
    FileText, Plus, Pencil, Trash2, Eye, Globe, GlobeLock,
    X, ChevronDown, Tag, Calendar,
} from 'lucide-react';

/* ─── Types ─── */
interface BlogPost {
    id: string; title: string; slug: string; category: string;
    status: string; metaDescription: string | null; targetKeyword: string | null;
    imageUrl: string | null; publishDate: string | null;
    createdAt: string; updatedAt: string;
    content?: string; // only loaded when editing
}

const CATEGORIES = [
    { value: 'job_seeker_attraction', label: 'Job Seeker Attraction' },
    { value: 'salary_negotiation', label: 'Salary Negotiation' },
    { value: 'career_myths', label: 'Career Myths' },
    { value: 'state_spotlight', label: 'State Spotlight' },
    { value: 'employer_facing', label: 'Employer Facing' },
    { value: 'community_lifestyle', label: 'Community & Lifestyle' },
    { value: 'industry_awareness', label: 'Industry Awareness' },
    { value: 'product_lead_gen', label: 'Product & Lead Gen' },
    { value: 'success_stories', label: 'Success Stories' },
];

/* ─── Styles ─── */
const card: React.CSSProperties = { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '14px', overflow: 'hidden' };
const heading: React.CSSProperties = { color: 'var(--text-primary)', fontWeight: 700 };
const sub: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px' };
const muted: React.CSSProperties = { color: 'var(--text-tertiary)', fontSize: '12px' };
const th: React.CSSProperties = { padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', textAlign: 'left', whiteSpace: 'nowrap', backgroundColor: 'var(--bg-tertiary)' };
const td: React.CSSProperties = { padding: '14px 16px', fontSize: '13px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' };
const inputStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: '10px', fontSize: '13px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', outline: 'none', width: '100%' };

export default function AdminBlogPage() {
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionMsg, setActionMsg] = useState<{ text: string; isError: boolean } | null>(null);

    // Editor state
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
    const [form, setForm] = useState({
        title: '', content: '', category: 'job_seeker_attraction', status: 'draft',
        metaDescription: '', targetKeyword: '', imageUrl: '',
    });
    const [saving, setSaving] = useState(false);

    // Filter
    const [statusFilter, setStatusFilter] = useState('all');
    const [catFilter, setCatFilter] = useState('all');

    useEffect(() => { fetchPosts(); }, []);

    const fetchPosts = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/blog');
            const data = await res.json();
            if (data.success) setPosts(data.posts);
        } catch { showMsg('Failed to load posts', true); }
        finally { setLoading(false); }
    };

    const showMsg = (text: string, isError: boolean) => {
        setActionMsg({ text, isError });
        setTimeout(() => setActionMsg(null), 3000);
    };

    const openNew = () => {
        setEditingPost(null);
        setForm({ title: '', content: '', category: 'job_seeker_attraction', status: 'draft', metaDescription: '', targetKeyword: '', imageUrl: '' });
        setEditorOpen(true);
    };

    const openEdit = async (post: BlogPost) => {
        try {
            const res = await fetch(`/api/admin/blog/${post.id}`);
            const data = await res.json();
            if (data.success) {
                setEditingPost(data.post);
                setForm({
                    title: data.post.title || '',
                    content: data.post.content || '',
                    category: data.post.category || 'job_seeker_attraction',
                    status: data.post.status || 'draft',
                    metaDescription: data.post.metaDescription || '',
                    targetKeyword: data.post.targetKeyword || '',
                    imageUrl: data.post.imageUrl || '',
                });
                setEditorOpen(true);
            }
        } catch { showMsg('Failed to load post', true); }
    };

    const savePost = async () => {
        if (!form.title || !form.content || !form.category) {
            showMsg('Title, content, and category are required', true);
            return;
        }
        try {
            setSaving(true);
            const url = editingPost ? `/api/admin/blog/${editingPost.id}` : '/api/admin/blog';
            const method = editingPost ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.success) {
                showMsg(editingPost ? 'Post updated' : 'Post created', false);
                setEditorOpen(false);
                fetchPosts();
            } else {
                showMsg(data.error || 'Failed', true);
            }
        } catch { showMsg('Failed to save', true); }
        finally { setSaving(false); }
    };

    const toggleStatus = async (post: BlogPost) => {
        const newStatus = post.status === 'published' ? 'draft' : 'published';
        try {
            const res = await fetch(`/api/admin/blog/${post.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: newStatus } : p));
                showMsg(newStatus === 'published' ? 'Published!' : 'Unpublished', false);
            }
        } catch { showMsg('Failed', true); }
    };

    const deletePost = async (id: string) => {
        if (!confirm('Delete this blog post permanently?')) return;
        try {
            const res = await fetch(`/api/admin/blog/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setPosts(prev => prev.filter(p => p.id !== id));
                showMsg('Post deleted', false);
            }
        } catch { showMsg('Failed to delete', true); }
    };

    const filteredPosts = posts.filter(p => {
        if (statusFilter !== 'all' && p.status !== statusFilter) return false;
        if (catFilter !== 'all' && p.category !== catFilter) return false;
        return true;
    });

    const catLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ ...heading, fontSize: 26 }}>Blog Management</h1>
                    <p style={muted}>{posts.length} total posts · {posts.filter(p => p.status === 'published').length} published</p>
                </div>
                <button onClick={openNew} style={{
                    padding: '10px 20px', borderRadius: '10px', cursor: 'pointer',
                    backgroundColor: '#2DD4BF', color: '#0F172A', border: 'none',
                    fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    <Plus size={16} /> New Post
                </button>
            </div>

            {actionMsg && (
                <div style={{
                    marginBottom: 16, padding: '12px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    backgroundColor: actionMsg.isError ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                    color: actionMsg.isError ? '#F87171' : '#22C55E',
                }}>{actionMsg.text}</div>
            )}

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
                    <option value="all">All Status</option>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                </select>
                <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
                    <option value="all">All Categories</option>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
            </div>

            {/* Posts Table */}
            <div style={card}>
                {loading ? (
                    <div style={{ padding: 60, textAlign: 'center' }}>
                        <div style={{ width: 40, height: 40, border: '3px solid var(--border-color)', borderTop: '3px solid #2DD4BF', borderRadius: '50%', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr>
                                <th style={th}>Title</th>
                                <th style={th}>Category</th>
                                <th style={{ ...th, textAlign: 'center' }}>Status</th>
                                <th style={th}>Keyword</th>
                                <th style={th}>Published</th>
                                <th style={th}>Created</th>
                                <th style={{ ...th, textAlign: 'center' }}>Actions</th>
                            </tr></thead>
                            <tbody>
                                {filteredPosts.map(post => (
                                    <tr key={post.id}>
                                        <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {post.title}
                                        </td>
                                        <td style={td}>
                                            <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>
                                                {catLabel(post.category)}
                                            </span>
                                        </td>
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            <button onClick={() => toggleStatus(post)} title={post.status === 'published' ? 'Click to unpublish' : 'Click to publish'}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                                                {post.status === 'published'
                                                    ? <Globe size={16} style={{ color: '#22C55E' }} />
                                                    : <GlobeLock size={16} style={{ color: '#94A3B8' }} />}
                                            </button>
                                        </td>
                                        <td style={td}>{post.targetKeyword || '—'}</td>
                                        <td style={td}>
                                            {post.publishDate ? new Date(post.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                        </td>
                                        <td style={td}>{new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                                <button onClick={() => openEdit(post)} title="Edit"
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#3B82F6' }}>
                                                    <Pencil size={14} />
                                                </button>
                                                <a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer" title="Preview"
                                                    style={{ padding: 4, color: '#2DD4BF' }}>
                                                    <Eye size={14} />
                                                </a>
                                                <button onClick={() => deletePost(post.id)} title="Delete"
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#EF4444' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredPosts.length === 0 && (
                                    <tr><td colSpan={7} style={{ ...td, textAlign: 'center', padding: 40 }}>No posts found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ═══ EDITOR MODAL ═══ */}
            {editorOpen && (
                <>
                    <div onClick={() => setEditorOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        zIndex: 51, width: '95%', maxWidth: 800, maxHeight: '90vh', overflowY: 'auto',
                        backgroundColor: 'var(--bg-secondary)', borderRadius: 16, border: '1px solid var(--border-color)', padding: 28,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ ...heading, fontSize: 20 }}>{editingPost ? 'Edit Post' : 'New Blog Post'}</h2>
                            <button onClick={() => setEditorOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Title */}
                            <div>
                                <label style={{ ...muted, fontWeight: 600, display: 'block', marginBottom: 6 }}>Title *</label>
                                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} placeholder="Blog post title..." />
                            </div>

                            {/* Category + Status */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label style={{ ...muted, fontWeight: 600, display: 'block', marginBottom: 6 }}>Category *</label>
                                    <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                                        {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ ...muted, fontWeight: 600, display: 'block', marginBottom: 6 }}>Status</label>
                                    <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                                        <option value="draft">Draft</option>
                                        <option value="published">Published</option>
                                    </select>
                                </div>
                            </div>

                            {/* SEO Fields */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label style={{ ...muted, fontWeight: 600, display: 'block', marginBottom: 6 }}>Meta Description</label>
                                    <input type="text" value={form.metaDescription} onChange={e => setForm(p => ({ ...p, metaDescription: e.target.value }))} style={inputStyle} placeholder="Brief description for SEO..." />
                                </div>
                                <div>
                                    <label style={{ ...muted, fontWeight: 600, display: 'block', marginBottom: 6 }}>Target Keyword</label>
                                    <input type="text" value={form.targetKeyword} onChange={e => setForm(p => ({ ...p, targetKeyword: e.target.value }))} style={inputStyle} placeholder="Primary keyword..." />
                                </div>
                            </div>

                            {/* Image URL */}
                            <div>
                                <label style={{ ...muted, fontWeight: 600, display: 'block', marginBottom: 6 }}>Image URL</label>
                                <input type="text" value={form.imageUrl} onChange={e => setForm(p => ({ ...p, imageUrl: e.target.value }))} style={inputStyle} placeholder="https://..." />
                            </div>

                            {/* Content */}
                            <div>
                                <label style={{ ...muted, fontWeight: 600, display: 'block', marginBottom: 6 }}>Content (Markdown) *</label>
                                <textarea
                                    value={form.content}
                                    onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                                    style={{
                                        ...inputStyle, minHeight: 300, fontFamily: 'monospace', fontSize: '13px',
                                        lineHeight: '1.7', resize: 'vertical',
                                    }}
                                    placeholder="Write your blog post content in markdown..."
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
                            <button onClick={() => setEditorOpen(false)}
                                style={{ padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px' }}>
                                Cancel
                            </button>
                            <button onClick={savePost} disabled={saving}
                                style={{ padding: '10px 24px', borderRadius: '10px', cursor: 'pointer', backgroundColor: '#2DD4BF', color: '#0F172A', border: 'none', fontWeight: 700, fontSize: '13px', opacity: saving ? 0.5 : 1 }}>
                                {saving ? 'Saving…' : (editingPost ? 'Update Post' : 'Create Post')}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
