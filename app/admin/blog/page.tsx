'use client';

import { useState, useEffect } from 'react';
import { formatCT } from '@/lib/format-ct';
import { adminFetch } from '@/lib/admin/admin-fetch';
import { BLOG_CATEGORY_OPTIONS, blogCategoryLabel } from '@/lib/blog-categories';
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

const DEFAULT_CATEGORY = BLOG_CATEGORY_OPTIONS[0].id;

/* ─── Styles ─── */
const card: React.CSSProperties = { backgroundColor: '#FAFBF9', border: '1px solid rgba(255,255,255,0.7)', borderRadius: '18px', boxShadow: '8px 8px 20px rgba(0,0,0,0.05), -6px -6px 16px rgba(255,255,255,0.9), inset 3px 3px 6px rgba(255,255,255,0.7), inset -2px -2px 4px rgba(0,0,0,0.02)', overflow: 'hidden' };
const heading: React.CSSProperties = { color: '#1A2E35', fontWeight: 700 };
const sub: React.CSSProperties = { color: '#6B7F8A', fontSize: '14px' };
const muted: React.CSSProperties = { color: '#94A3B8', fontSize: '12px' };
const th: React.CSSProperties = { padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', textAlign: 'left', whiteSpace: 'nowrap', backgroundColor: '#F8FAF9' };
const td: React.CSSProperties = { padding: '14px 16px', fontSize: '13px', color: '#6B7F8A', borderBottom: '1px solid #E8ECF0', whiteSpace: 'nowrap' };
const inputStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: '10px', fontSize: '13px', backgroundColor: '#F8FAF9', border: '1px solid rgba(255,255,255,0.5)', color: '#1A2E35', outline: 'none', width: '100%' };

export default function AdminBlogPage() {
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionMsg, setActionMsg] = useState<{ text: string; isError: boolean } | null>(null);
    // Separate from actionMsg, which self-clears after three seconds. A list
    // that failed to load stays wrong until it is reloaded, and the empty
    // state reads as "there are no posts" rather than "the request failed".
    const [loadError, setLoadError] = useState<string | null>(null);

    // Editor state
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
    const [form, setForm] = useState({
        title: '', content: '', category: DEFAULT_CATEGORY, status: 'draft',
        metaDescription: '', targetKeyword: '', imageUrl: '',
    });
    const [saving, setSaving] = useState(false);

    // Filter
    const [statusFilter, setStatusFilter] = useState('all');
    const [catFilter, setCatFilter] = useState('all');

    useEffect(() => { fetchPosts(); }, []);

    const fetchPosts = async () => {
        setLoading(true);
        const result = await adminFetch<{ posts: BlogPost[] }>('/api/admin/blog');
        if (result.ok) {
            setPosts(result.data.posts ?? []);
            setLoadError(null);
        } else {
            setLoadError(result.error);
        }
        setLoading(false);
    };

    const showMsg = (text: string, isError: boolean) => {
        setActionMsg({ text, isError });
        setTimeout(() => setActionMsg(null), 3000);
    };

    const openNew = () => {
        setEditingPost(null);
        setForm({ title: '', content: '', category: DEFAULT_CATEGORY, status: 'draft', metaDescription: '', targetKeyword: '', imageUrl: '' });
        setEditorOpen(true);
    };

    const openEdit = async (post: BlogPost) => {
        const result = await adminFetch<{ post: BlogPost }>(`/api/admin/blog/${post.id}`);
        if (!result.ok) {
            // Never open an empty editor over a failed load: saving from it
            // would write blanks over the real post.
            showMsg(result.error, true);
            return;
        }
        const loaded = result.data.post;
        setEditingPost(loaded);
        setForm({
            title: loaded.title || '',
            content: loaded.content || '',
            category: loaded.category || DEFAULT_CATEGORY,
            status: loaded.status || 'draft',
            metaDescription: loaded.metaDescription || '',
            targetKeyword: loaded.targetKeyword || '',
            imageUrl: loaded.imageUrl || '',
        });
        setEditorOpen(true);
    };

    const savePost = async () => {
        if (!form.title || !form.content || !form.category) {
            showMsg('Title, content, and category are required', true);
            return;
        }
        setSaving(true);
        const url = editingPost ? `/api/admin/blog/${editingPost.id}` : '/api/admin/blog';
        const result = await adminFetch(url, {
            method: editingPost ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
        });
        if (result.ok) {
            showMsg(editingPost ? 'Post updated' : 'Post created', false);
            setEditorOpen(false);
            fetchPosts();
        } else {
            // Editor stays open so the draft is not lost to a failed save.
            showMsg(result.error, true);
        }
        setSaving(false);
    };

    const toggleStatus = async (post: BlogPost) => {
        const newStatus = post.status === 'published' ? 'draft' : 'published';
        const result = await adminFetch(`/api/admin/blog/${post.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
        });
        if (!result.ok) {
            // The row keeps its real status. Showing the new one over a failed
            // write is how an admin comes to believe a post is live when it is
            // still a draft.
            showMsg(result.error, true);
            return;
        }
        setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: newStatus } : p));
        showMsg(newStatus === 'published' ? 'Published!' : 'Unpublished', false);
    };

    const deletePost = async (id: string) => {
        if (!confirm('Delete this blog post permanently?')) return;
        const result = await adminFetch(`/api/admin/blog/${id}`, { method: 'DELETE' });
        if (!result.ok) {
            showMsg(result.error, true);
            return;
        }
        setPosts(prev => prev.filter(p => p.id !== id));
        showMsg('Post deleted', false);
    };

    const filteredPosts = posts.filter(p => {
        if (statusFilter !== 'all' && p.status !== statusFilter) return false;
        if (catFilter !== 'all' && p.category !== catFilter) return false;
        return true;
    });


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
                    backgroundColor: '#0D9488', color: '#0F172A', border: 'none',
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

            {loadError && (
                <div role="alert" style={{
                    marginBottom: 16, padding: '12px 18px', borderRadius: '10px', fontSize: '13px',
                    backgroundColor: 'rgba(239,68,68,0.1)', color: '#F87171',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                    <span><strong>The post list did not load.</strong> {loadError}</span>
                    <button onClick={fetchPosts} style={{
                        padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
                        backgroundColor: 'transparent', color: '#F87171',
                        border: '1px solid rgba(248,113,113,0.5)', fontWeight: 700, fontSize: '12px',
                    }}>Retry</button>
                </div>
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
                    {BLOG_CATEGORY_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
            </div>

            {/* Posts Table */}
            <div style={card}>
                {loading ? (
                    <div style={{ padding: 60, textAlign: 'center' }}>
                        <div style={{ width: 40, height: 40, border: '3px solid #E8ECF0', borderTop: '3px solid #0D9488', borderRadius: '50%', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
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
                                        <td style={{ ...td, fontWeight: 600, color: '#1A2E35', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {post.title}
                                        </td>
                                        <td style={td}>
                                            <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>
                                                {blogCategoryLabel(post.category)}
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
                                        <td style={td}>{post.targetKeyword || 'Not set'}</td>
                                        <td style={td}>
                                            {formatCT(post.publishDate, 'date')}
                                        </td>
                                        <td style={td}>{formatCT(post.createdAt, 'date')}</td>
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                                <button onClick={() => openEdit(post)} title="Edit"
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#3B82F6' }}>
                                                    <Pencil size={14} />
                                                </button>
                                                {/* A draft has no public page: /blog/<slug> filters on
                                                    status='published', so the live URL 404s until the post
                                                    is published. Drafts go to the admin-only preview. */}
                                                <a
                                                    href={post.status === 'published' ? `/blog/${post.slug}` : `/admin/blog/preview/${post.id}`}
                                                    target="_blank" rel="noopener noreferrer"
                                                    title={post.status === 'published' ? 'Open the live page' : 'Preview this draft'}
                                                    style={{ padding: 4, color: '#0D9488' }}>
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
                        backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid rgba(255,255,255,0.5)', padding: 28,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ ...heading, fontSize: 20 }}>{editingPost ? 'Edit Post' : 'New Blog Post'}</h2>
                            <button onClick={() => setEditorOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
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
                                        {/* A row predating the taxonomy keeps its own id as an option.
                                            Without it the <select> falls back to the first entry and the
                                            next save quietly reassigns the post to a category nobody chose. */}
                                        {form.category && !BLOG_CATEGORY_OPTIONS.some(c => c.id === form.category) && (
                                            <option value={form.category}>{form.category}</option>
                                        )}
                                        {BLOG_CATEGORY_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
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
                                style={{ padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', backgroundColor: '#F8FAF9', border: '1px solid rgba(255,255,255,0.5)', color: '#1A2E35', fontWeight: 600, fontSize: '13px' }}>
                                Cancel
                            </button>
                            <button onClick={savePost} disabled={saving}
                                style={{ padding: '10px 24px', borderRadius: '10px', cursor: 'pointer', backgroundColor: '#0D9488', color: '#0F172A', border: 'none', fontWeight: 700, fontSize: '13px', opacity: saving ? 0.5 : 1 }}>
                                {saving ? 'Saving…' : (editingPost ? 'Update Post' : 'Create Post')}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
