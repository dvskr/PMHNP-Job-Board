'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Clock, Building2, Briefcase,
    Loader2, Inbox, Send, MessageSquare, ChevronLeft,
    Paperclip, FileText, X, Trash2, MoreVertical, Pencil, Check,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/** Format date as actual date/time for messaging (not relative like "Just posted") */
function formatMessageDate(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    if (isToday) return `Today ${time}`;
    if (isYesterday) return `Yesterday ${time}`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${time}`;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  */
/*  Types                                                                 */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  */

interface OtherUser {
    id: string;
    supabaseId: string;
    name: string;
    company: string | null;
    role: string;
    avatarUrl: string | null;
    headline: string | null;
    specialties: string | null;
    licenseStates: string | null;
    initials: string;
}

interface Conversation {
    id: string;
    otherUser: OtherUser;
    subject: string;
    jobTitle: string | null;
    jobSlug: string | null;
    lastMessage: {
        preview: string;
        sentAt: string;
        isFromMe: boolean;
    } | null;
    unreadCount: number;
    lastMessageAt: string;
}

interface ThreadMessage {
    id: string;
    body: string;
    sentAt: string;
    isFromMe: boolean;
    readAt: string | null;
    editedAt: string | null;
    attachmentUrl: string | null;
    attachmentName: string | null;
    isDeleted?: boolean;
}

interface ConversationDetail {
    id: string;
    subject: string;
    jobTitle: string | null;
    jobSlug: string | null;
    otherUser: OtherUser;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  */
/*  Styles                                                                */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  */

const cardBg = 'var(--bg-secondary)';
const borderVal = '1px solid var(--border-color)';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  */
/*  Avatar                                                                */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  */

function Avatar({ user, size = 40 }: { user: OtherUser; size?: number }) {
    if (user.avatarUrl) {
        return (
            <img
                src={user.avatarUrl}
                alt={user.name}
                style={{
                    width: size, height: size, borderRadius: '50%', objectFit: 'cover',
                    flexShrink: 0, border: '2px solid var(--border-color)',
                }}
            />
        );
    }
    return (
        <div
            style={{
                width: size, height: size, borderRadius: '50%', flexShrink: 0,
                backgroundColor: 'rgba(45,212,191,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: size * 0.4, fontWeight: 700, color: '#2DD4BF',
                border: '2px solid rgba(45,212,191,0.25)',
            }}
        >
            {user.initials}
        </div>
    );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  */
/*  Main Page                                                             */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  */

export default function MessagesPage() {
    const router = useRouter();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalUnread, setTotalUnread] = useState(0);

    // Thread state
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [convDetail, setConvDetail] = useState<ConversationDetail | null>(null);
    const [thread, setThread] = useState<ThreadMessage[]>([]);
    const [threadLoading, setThreadLoading] = useState(false);

    // Reply state
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);
    const threadEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Attachment state (path = storage path for DB, url = temp signed URL for preview)
    const [pendingAttachment, setPendingAttachment] = useState<{ path: string; url: string; name: string } | null>(null);
    const [uploading, setUploading] = useState(false);

    // Delete state
    const [deleteModal, setDeleteModal] = useState<{
        type: 'conversation' | 'message';
        id: string;
        convId: string;
        isRead?: boolean;
    } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [convMenuId, setConvMenuId] = useState<string | null>(null);

    // Edit state
    const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [saving, setSaving] = useState(false);

    // Auth check
    useEffect(() => {
        (async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login?redirect=/messages');
            }
        })();
    }, [router]);

    // Fetch conversations
    const fetchConversations = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/conversations');
            if (!res.ok) { setConversations([]); return; }
            const data = await res.json();
            setConversations(data.conversations || []);
            setTotalUnread(data.totalUnread || 0);
        } catch (err) {
            console.error('Error fetching conversations:', err);
            setConversations([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    // Fetch thread messages
    const openConversation = useCallback(async (convId: string) => {
        setActiveConvId(convId);
        setThreadLoading(true);
        setReplyText('');
        try {
            const res = await fetch(`/api/conversations/${convId}`);
            if (!res.ok) return;
            const data = await res.json();
            setConvDetail(data.conversation);
            setThread(data.messages || []);

            // Update unread count in conversation list
            setConversations(prev => prev.map(c =>
                c.id === convId ? { ...c, unreadCount: 0 } : c
            ));
            setTotalUnread(prev => {
                const conv = conversations.find(c => c.id === convId);
                return Math.max(0, prev - (conv?.unreadCount || 0));
            });
        } catch (err) {
            console.error('Error fetching thread:', err);
        } finally {
            setThreadLoading(false);
        }
    }, [conversations]);

    useEffect(() => {
        if (threadEndRef.current) {
            const container = threadEndRef.current.parentElement;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }
    }, [thread]);

    // Handle file attachment upload
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = ''; // reset so same file can be re-selected

        const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowed.includes(file.type)) {
            alert('Only PDF, DOC, and DOCX files are allowed.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('File must be under 5MB.');
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/upload/message-attachment', { method: 'POST', body: formData });
            if (!res.ok) {
                const data = await res.json();
                alert(data.error || 'Upload failed');
                return;
            }
            const data = await res.json();
            setPendingAttachment({ path: data.path, url: data.url, name: data.name });
        } catch (err) {
            console.error('File upload error:', err);
            alert('Upload failed. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    // Send reply
    const handleSendReply = async () => {
        if ((!replyText.trim() && !pendingAttachment) || !activeConvId || sending) return;
        setSending(true);
        try {
            const payload: Record<string, string> = {};
            if (replyText.trim()) payload.body = replyText.trim();
            if (pendingAttachment) {
                payload.attachmentUrl = pendingAttachment.path; // Store storage path, not signed URL
                payload.attachmentName = pendingAttachment.name;
            }

            const res = await fetch(`/api/conversations/${activeConvId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const data = await res.json();
                alert(data.error || 'Failed to send');
                return;
            }
            const data = await res.json();
            setThread(prev => [...prev, data.message]);
            setReplyText('');
            setPendingAttachment(null);

            // Update conversation list
            const previewText = replyText.trim() || (pendingAttachment ? `📎 ${pendingAttachment.name}` : '');
            setConversations(prev => prev.map(c =>
                c.id === activeConvId ? {
                    ...c,
                    lastMessage: { preview: previewText.substring(0, 120), sentAt: new Date().toISOString(), isFromMe: true },
                    lastMessageAt: new Date().toISOString(),
                } : c
            ));
        } catch (err) {
            console.error('Error sending reply:', err);
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendReply();
        }
    };

    // Show toast briefly
    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    // Delete a message
    const handleDeleteMessage = async () => {
        if (!deleteModal || deleteModal.type !== 'message' || deleting) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/conversations/${deleteModal.convId}/messages/${deleteModal.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                alert(data.error || 'Failed to delete');
                return;
            }
            const data = await res.json();
            // Remove from thread (optimistic)
            setThread(prev => prev.filter(m => m.id !== deleteModal.id));
            showToast(data.deletedForBoth ? 'Message deleted for everyone' : 'Message removed from your view');
        } catch (err) {
            console.error('Delete message error:', err);
        } finally {
            setDeleting(false);
            setDeleteModal(null);
        }
    };

    // Delete a conversation
    const handleDeleteConversation = async () => {
        if (!deleteModal || deleteModal.type !== 'conversation' || deleting) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/conversations/${deleteModal.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                alert(data.error || 'Failed to delete');
                return;
            }
            // Remove from list
            setConversations(prev => prev.filter(c => c.id !== deleteModal.id));
            if (activeConvId === deleteModal.id) {
                setActiveConvId(null);
                setConvDetail(null);
                setThread([]);
            }
            showToast('Conversation deleted');
        } catch (err) {
            console.error('Delete conversation error:', err);
        } finally {
            setDeleting(false);
            setDeleteModal(null);
        }
    };

    // Edit a message
    const handleEditMessage = async (msgId: string) => {
        if (!activeConvId || saving || editText.trim().length === 0) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/conversations/${activeConvId}/messages/${msgId}/edit`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: editText.trim() }),
            });
            if (!res.ok) {
                const data = await res.json();
                alert(data.error || 'Failed to edit');
                return;
            }
            const data = await res.json();
            // Update thread optimistically
            setThread(prev => prev.map(m =>
                m.id === msgId
                    ? { ...m, body: data.message.body, editedAt: data.message.editedAt }
                    : m
            ));
            showToast(data.message.wasRead ? 'Message edited (recipient will see it was edited)' : 'Message edited');
        } catch (err) {
            console.error('Edit message error:', err);
        } finally {
            setSaving(false);
            setEditingMsgId(null);
            setEditText('');
        }
    };

    /* ──── Responsive: show list or thread on mobile ──── */
    const showMobileThread = activeConvId !== null;

    return (
        <div className="msg-page-container">
            {/* Header — hidden on mobile, shown on desktop */}
            <div className="msg-page-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    Messaging
                </h1>
                {totalUnread > 0 && (
                    <span style={{
                        backgroundColor: '#EF4444', color: '#fff',
                        fontSize: '12px', fontWeight: 700,
                        padding: '2px 8px', borderRadius: '12px',
                    }}>
                        {totalUnread}
                    </span>
                )}
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
                    <Loader2 size={32} className="animate-spin" style={{ color: '#2DD4BF' }} />
                </div>
            ) : conversations.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: '64px 24px',
                    backgroundColor: cardBg, border: borderVal, borderRadius: '16px',
                }}>
                    <Inbox size={48} style={{ color: 'var(--text-tertiary)', margin: '0 auto 16px' }} />
                    <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                        No messages yet
                    </h2>
                    <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', maxWidth: '380px', margin: '0 auto' }}>
                        Conversations with employers and candidates will appear here.
                    </p>
                </div>
            ) : (
                <div className="msg-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: '0',
                    overflow: 'hidden',
                    backgroundColor: cardBg,
                    flex: 1,
                    minHeight: 0,
                }}>
                    {/* ═══ Left Panel: Conversation List (LinkedIn-style) ═══ */}
                    <div style={{
                        borderRight: borderVal,
                        overflowY: 'auto',
                        display: showMobileThread ? 'none' : 'block',
                    }} className="messages-list-panel hide-scrollbar">
                        {conversations.map(conv => (
                            <div key={conv.id} style={{ position: 'relative' }}
                                onMouseEnter={(e) => { const btn = e.currentTarget.querySelector('.conv-menu-btn') as HTMLElement; if (btn) btn.style.opacity = '1'; }}
                                onMouseLeave={(e) => { const btn = e.currentTarget.querySelector('.conv-menu-btn') as HTMLElement; if (btn) btn.style.opacity = '0'; setConvMenuId(null); }}
                            >
                                <div
                                    onClick={() => openConversation(conv.id)}
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: '12px',
                                        width: '100%', textAlign: 'left',
                                        padding: '14px 16px',
                                        backgroundColor: activeConvId === conv.id
                                            ? 'rgba(45,212,191,0.08)'
                                            : 'transparent',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.15s',
                                        borderBottom: '1px solid var(--border-color)',
                                        borderLeft: activeConvId === conv.id ? '3px solid #2DD4BF' : '3px solid transparent',
                                    }}
                                >
                                    <Avatar user={conv.otherUser} size={48} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {/* Row 1: Name + Date */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{
                                                fontSize: '14px',
                                                fontWeight: conv.unreadCount > 0 ? 700 : 600,
                                                color: 'var(--text-primary)',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                                {conv.otherUser.name}
                                            </span>
                                            <div style={{
                                                display: 'flex', alignItems: 'center',
                                                flexShrink: 0, marginLeft: '8px', gap: '4px',
                                            }}>
                                                <span style={{
                                                    fontSize: '12px', color: 'var(--text-tertiary)',
                                                }}>
                                                    {formatMessageDate(conv.lastMessageAt)}
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setConvMenuId(convMenuId === conv.id ? null : conv.id); }}
                                                    style={{
                                                        background: 'none', border: 'none',
                                                        cursor: 'pointer', padding: '2px',
                                                        color: 'var(--text-secondary)',
                                                        display: 'flex', alignItems: 'center',
                                                    }}
                                                >
                                                    <MoreVertical size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Row 2: Subject line */}
                                        <div style={{
                                            fontSize: '13px',
                                            fontWeight: conv.unreadCount > 0 ? 600 : 500,
                                            color: conv.unreadCount > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            marginTop: '2px',
                                        }}>
                                            {conv.subject}
                                        </div>

                                        {/* Row 3: Last message preview */}
                                        {conv.lastMessage && (
                                            <div style={{
                                                fontSize: '12px', color: 'var(--text-tertiary)',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                marginTop: '2px',
                                            }}>
                                                {conv.lastMessage.isFromMe ? 'You: ' : ''}{conv.lastMessage.preview}
                                            </div>
                                        )}

                                        {/* Row 4: Job badge + unread dot */}
                                        {(conv.jobTitle || conv.unreadCount > 0) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                {conv.jobTitle && (
                                                    <span style={{
                                                        fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                                                        backgroundColor: 'rgba(59,130,246,0.08)', color: '#60A5FA',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        maxWidth: '180px',
                                                    }}>
                                                        {conv.jobTitle}
                                                    </span>
                                                )}
                                                {conv.unreadCount > 0 && (
                                                    <span style={{
                                                        width: '8px', height: '8px', borderRadius: '50%',
                                                        backgroundColor: '#2DD4BF', flexShrink: 0,
                                                    }} />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {convMenuId === conv.id && (
                                    <div
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                            position: 'absolute', top: '28px', right: '8px',
                                            backgroundColor: 'var(--bg-primary)',
                                            border: borderVal,
                                            borderRadius: '8px',
                                            padding: '4px 0',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                            zIndex: 10,
                                            minWidth: '160px',
                                        }}
                                    >
                                        <button
                                            onClick={() => {
                                                setConvMenuId(null);
                                                setDeleteModal({ type: 'conversation', id: conv.id, convId: conv.id });
                                            }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                width: '100%', padding: '8px 14px',
                                                background: 'none', border: 'none',
                                                cursor: 'pointer', fontSize: '13px',
                                                color: '#EF4444',
                                                textAlign: 'left',
                                            }}
                                        >
                                            <Trash2 size={14} /> Delete conversation
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* ═══ Right Panel: Thread View (LinkedIn-style) ═══ */}
                    <div style={{
                        display: showMobileThread ? 'flex' : 'none',
                        flexDirection: 'column', height: '100%',
                        overflow: 'hidden', minHeight: 0,
                    }} className="messages-thread-panel">
                        {!activeConvId ? (
                            <div style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                height: '100%', padding: '40px',
                                color: 'var(--text-tertiary)',
                            }}>
                                <MessageSquare size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
                                <p style={{ fontSize: '15px', fontWeight: 500 }}>Select a conversation to view</p>
                            </div>
                        ) : threadLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                <Loader2 size={28} className="animate-spin" style={{ color: '#2DD4BF' }} />
                            </div>
                        ) : convDetail ? (
                            <>
                                {/* Thread Header — LinkedIn style: name, title/company */}
                                <div style={{
                                    padding: '16px 20px',
                                    borderBottom: borderVal,
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    backgroundColor: cardBg,
                                    flexShrink: 0,
                                }}>
                                    <button
                                        onClick={() => { setActiveConvId(null); setConvDetail(null); setThread([]); }}
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: 'var(--text-tertiary)', padding: '4px',
                                        }}
                                        className="thread-back-btn"
                                    >
                                        <ChevronLeft size={20} />
                                    </button>
                                    <Avatar user={convDetail.otherUser} size={40} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {convDetail.otherUser.name}
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                                            {convDetail.otherUser.role === 'employer'
                                                ? (convDetail.otherUser.company || 'Employer')
                                                : (convDetail.otherUser.headline || convDetail.otherUser.specialties || 'Candidate')}
                                        </div>
                                        {convDetail.otherUser.role !== 'employer' && convDetail.otherUser.licenseStates && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                Licensed: {convDetail.otherUser.licenseStates}
                                            </div>
                                        )}
                                    </div>
                                    {convDetail.jobSlug && (
                                        <Link
                                            href={`/jobs/${convDetail.jobSlug}`}
                                            style={{
                                                fontSize: '12px', color: '#2DD4BF',
                                                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px',
                                                padding: '6px 12px', borderRadius: '8px',
                                                border: '1px solid rgba(45,212,191,0.3)',
                                            }}
                                        >
                                            <Briefcase size={12} /> View Job
                                        </Link>
                                    )}
                                </div>

                                {/* Thread Messages — Clean chat style */}
                                <div className="hide-scrollbar" style={{
                                    flex: 1, overflowY: 'auto',
                                    padding: '16px',
                                    display: 'flex', flexDirection: 'column', gap: '12px',
                                }}>
                                    {/* Subject header — shown once at top */}
                                    {convDetail.subject && (
                                        <div style={{
                                            fontSize: '14px', fontWeight: 600,
                                            color: 'var(--text-secondary)',
                                            padding: '0 0 12px',
                                            borderBottom: borderVal,
                                        }}>
                                            {convDetail.subject}
                                            {convDetail.jobTitle && (
                                                <span style={{
                                                    fontSize: '12px', fontWeight: 400,
                                                    color: '#60A5FA', marginLeft: '8px',
                                                }}>
                                                    · {convDetail.jobTitle}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Messages */}
                                    {thread.map(msg => {
                                        // Deleted message from other user → placeholder
                                        if (msg.isDeleted) {
                                            return (
                                                <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                                    <div style={{
                                                        maxWidth: '70%', padding: '10px 14px',
                                                        borderRadius: '14px 14px 14px 4px',
                                                        backgroundColor: 'var(--bg-tertiary, rgba(0,0,0,0.03))',
                                                        border: borderVal,
                                                    }}>
                                                        <p style={{
                                                            fontSize: '13px', fontStyle: 'italic',
                                                            color: 'var(--text-tertiary)', margin: 0,
                                                        }}>
                                                            🚫 This message was deleted
                                                        </p>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'block', marginTop: '4px' }}>
                                                            {formatMessageDate(msg.sentAt)}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div
                                                key={msg.id}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: msg.isFromMe ? 'flex-end' : 'flex-start',
                                                }}
                                                onMouseEnter={(e) => {
                                                    const btns = e.currentTarget.querySelectorAll('.msg-action-btn') as NodeListOf<HTMLElement>;
                                                    btns.forEach(btn => btn.style.opacity = '1');
                                                }}
                                                onMouseLeave={(e) => {
                                                    const btns = e.currentTarget.querySelectorAll('.msg-action-btn') as NodeListOf<HTMLElement>;
                                                    btns.forEach(btn => btn.style.opacity = '0');
                                                }}
                                            >
                                                <div style={{
                                                    maxWidth: '70%',
                                                    padding: '10px 14px',
                                                    borderRadius: msg.isFromMe
                                                        ? '14px 14px 4px 14px'
                                                        : '14px 14px 14px 4px',
                                                    backgroundColor: msg.isFromMe
                                                        ? 'rgba(45,212,191,0.12)'
                                                        : 'var(--bg-tertiary, rgba(0,0,0,0.03))',
                                                    border: msg.isFromMe
                                                        ? '1px solid rgba(45,212,191,0.2)'
                                                        : borderVal,
                                                }}>
                                                    {editingMsgId === msg.id ? (
                                                        <div>
                                                            <textarea
                                                                value={editText}
                                                                onChange={(e) => setEditText(e.target.value)}
                                                                style={{
                                                                    width: '100%', minHeight: '60px',
                                                                    fontSize: '14px', lineHeight: 1.6,
                                                                    color: 'var(--text-primary)',
                                                                    backgroundColor: 'var(--bg-primary)',
                                                                    border: '1px solid #2DD4BF',
                                                                    borderRadius: '8px',
                                                                    padding: '8px',
                                                                    resize: 'vertical',
                                                                    fontFamily: 'inherit',
                                                                    outline: 'none',
                                                                }}
                                                                autoFocus
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                                        e.preventDefault();
                                                                        handleEditMessage(msg.id);
                                                                    }
                                                                    if (e.key === 'Escape') {
                                                                        setEditingMsgId(null);
                                                                        setEditText('');
                                                                    }
                                                                }}
                                                            />
                                                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' }}>
                                                                <button
                                                                    onClick={() => { setEditingMsgId(null); setEditText(''); }}
                                                                    style={{
                                                                        background: 'none', border: borderVal,
                                                                        borderRadius: '6px', padding: '4px 10px',
                                                                        fontSize: '12px', cursor: 'pointer',
                                                                        color: 'var(--text-secondary)',
                                                                    }}
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    onClick={() => handleEditMessage(msg.id)}
                                                                    disabled={saving || editText.trim().length === 0}
                                                                    style={{
                                                                        background: '#2DD4BF', border: 'none',
                                                                        borderRadius: '6px', padding: '4px 10px',
                                                                        fontSize: '12px', cursor: saving ? 'not-allowed' : 'pointer',
                                                                        color: 'white', fontWeight: 600,
                                                                        opacity: saving ? 0.6 : 1,
                                                                        display: 'flex', alignItems: 'center', gap: '4px',
                                                                    }}
                                                                >
                                                                    {saving && <Loader2 size={12} className="animate-spin" />}
                                                                    <Check size={12} /> Save
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <p style={{
                                                            fontSize: '14px', lineHeight: 1.6,
                                                            color: 'var(--text-primary)',
                                                            whiteSpace: 'pre-wrap', margin: 0,
                                                            wordBreak: 'break-word',
                                                        }}>
                                                            {msg.body}
                                                        </p>
                                                    )}
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: '6px',
                                                        justifyContent: msg.isFromMe ? 'flex-end' : 'flex-start',
                                                        marginTop: '4px',
                                                    }}>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                                            {formatMessageDate(msg.sentAt)}
                                                        </span>
                                                        {msg.editedAt && (
                                                            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                                                                (edited)
                                                            </span>
                                                        )}
                                                        {msg.isFromMe && msg.readAt && (
                                                            <span style={{ fontSize: '10px', color: '#2DD4BF' }}>✓ Read</span>
                                                        )}
                                                    </div>
                                                    {msg.attachmentUrl && (
                                                        <a
                                                            href={msg.attachmentUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                                marginTop: '8px', padding: '8px 12px',
                                                                borderRadius: '8px',
                                                                backgroundColor: msg.isFromMe ? 'rgba(45,212,191,0.08)' : 'var(--bg-secondary, rgba(0,0,0,0.02))',
                                                                border: '1px solid var(--border-color)',
                                                                textDecoration: 'none',
                                                                fontSize: '13px',
                                                                color: 'var(--color-primary)',
                                                                transition: 'opacity 0.15s',
                                                            }}
                                                        >
                                                            <FileText size={14} />
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {msg.attachmentName || 'Attachment'}
                                                            </span>
                                                        </a>
                                                    )}
                                                </div>
                                                {/* Action icons — under the bubble */}
                                                {msg.isFromMe && activeConvId && editingMsgId !== msg.id && (
                                                    <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                                                        {!msg.readAt && (
                                                            <button
                                                                className="msg-action-btn"
                                                                onClick={() => { setEditingMsgId(msg.id); setEditText(msg.body); }}
                                                                style={{
                                                                    background: 'none', border: 'none',
                                                                    cursor: 'pointer', padding: '2px 4px',
                                                                    color: 'var(--text-tertiary)',
                                                                    opacity: 0, transition: 'opacity 0.15s',
                                                                    fontSize: '11px',
                                                                    display: 'flex', alignItems: 'center', gap: '3px',
                                                                }}
                                                                title="Edit message"
                                                            >
                                                                <Pencil size={11} /> Edit
                                                            </button>
                                                        )}
                                                        <button
                                                            className="msg-action-btn"
                                                            onClick={() => setDeleteModal({
                                                                type: 'message', id: msg.id,
                                                                convId: activeConvId,
                                                                isRead: !!msg.readAt,
                                                            })}
                                                            style={{
                                                                background: 'none', border: 'none',
                                                                cursor: 'pointer', padding: '2px 4px',
                                                                color: 'var(--text-tertiary)',
                                                                opacity: 0, transition: 'opacity 0.15s',
                                                                fontSize: '11px',
                                                                display: 'flex', alignItems: 'center', gap: '3px',
                                                            }}
                                                            title="Delete message"
                                                        >
                                                            <Trash2 size={11} /> Delete
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    <div ref={threadEndRef} />
                                </div>

                                {/* Reply Input — LinkedIn style "Write a message..." */}
                                <div className="msg-composer" style={{
                                    padding: '16px 20px',
                                    borderTop: borderVal,
                                    backgroundColor: cardBg,
                                    flexShrink: 0,
                                }}>
                                    {/* Pending attachment badge */}
                                    {pendingAttachment && (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '6px 12px', marginBottom: '8px',
                                            borderRadius: '8px',
                                            backgroundColor: 'rgba(45,212,191,0.08)',
                                            border: '1px solid rgba(45,212,191,0.2)',
                                            fontSize: '13px', color: 'var(--text-secondary)',
                                        }}>
                                            <FileText size={14} style={{ color: '#2DD4BF', flexShrink: 0 }} />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                                {pendingAttachment.name}
                                            </span>
                                            <button
                                                onClick={() => setPendingAttachment(null)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-tertiary)', flexShrink: 0 }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    )}

                                    <div style={{
                                        display: 'flex', gap: '8px', alignItems: 'flex-end',
                                    }}>
                                        {/* Hidden file input */}
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".pdf,.doc,.docx"
                                            style={{ display: 'none' }}
                                            onChange={handleFileSelect}
                                        />

                                        {/* Paperclip attach button */}
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploading}
                                            title="Attach document (PDF, DOC, DOCX)"
                                            style={{
                                                width: '44px', height: '44px',
                                                borderRadius: '50%',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                color: uploading ? '#2DD4BF' : 'var(--text-tertiary)',
                                                cursor: uploading ? 'wait' : 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'color 0.15s',
                                                flexShrink: 0,
                                            }}
                                        >
                                            {uploading ? (
                                                <Loader2 size={18} className="animate-spin" />
                                            ) : (
                                                <Paperclip size={18} />
                                            )}
                                        </button>

                                        <textarea
                                            value={replyText}
                                            onChange={e => setReplyText(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder="Write a message..."
                                            rows={1}
                                            style={{
                                                flex: 1, resize: 'none',
                                                padding: '12px 16px',
                                                borderRadius: '24px',
                                                border: borderVal,
                                                backgroundColor: 'var(--bg-primary)',
                                                color: 'var(--text-primary)',
                                                fontSize: '14px',
                                                fontFamily: 'inherit',
                                                outline: 'none',
                                                minHeight: '44px',
                                                maxHeight: '120px',
                                            }}
                                        />
                                        <button
                                            onClick={handleSendReply}
                                            disabled={(!replyText.trim() && !pendingAttachment) || sending}
                                            style={{
                                                width: '44px', height: '44px',
                                                borderRadius: '50%',
                                                border: 'none',
                                                backgroundColor: (replyText.trim() || pendingAttachment) ? '#2DD4BF' : 'var(--bg-tertiary, rgba(255,255,255,0.05))',
                                                color: (replyText.trim() || pendingAttachment) ? '#000' : 'var(--text-tertiary)',
                                                cursor: (replyText.trim() || pendingAttachment) ? 'pointer' : 'not-allowed',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.2s',
                                                flexShrink: 0,
                                            }}
                                        >
                                            {sending ? (
                                                <Loader2 size={16} className="animate-spin" />
                                            ) : (
                                                <Send size={16} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            )
            }

            {/* Delete Confirmation Modal */}
            {deleteModal && (
                <div
                    style={{
                        position: 'fixed', inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 9999,
                    }}
                    onClick={() => setDeleteModal(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: 'var(--bg-primary)',
                            borderRadius: '16px',
                            padding: '28px',
                            maxWidth: '420px',
                            width: '90%',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                            border: borderVal,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '50%',
                                backgroundColor: 'rgba(239,68,68,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Trash2 size={20} color="#EF4444" />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {deleteModal.type === 'conversation' ? 'Delete conversation?' : 'Delete message?'}
                            </h3>
                        </div>

                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>
                            {deleteModal.type === 'conversation'
                                ? 'This conversation will be removed from your inbox. The other person will still be able to see it.'
                                : deleteModal.isRead
                                    ? 'This message has already been read. It will only be removed from your view — the recipient will still see it.'
                                    : "This message hasn't been read yet. It will be deleted for everyone."
                            }
                        </p>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setDeleteModal(null)}
                                style={{
                                    padding: '10px 20px', borderRadius: '10px',
                                    border: borderVal, background: 'none',
                                    cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                                    color: 'var(--text-primary)',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={deleteModal.type === 'conversation' ? handleDeleteConversation : handleDeleteMessage}
                                disabled={deleting}
                                style={{
                                    padding: '10px 20px', borderRadius: '10px',
                                    border: 'none',
                                    backgroundColor: '#EF4444',
                                    color: 'white',
                                    cursor: deleting ? 'not-allowed' : 'pointer',
                                    fontSize: '14px', fontWeight: 600,
                                    opacity: deleting ? 0.6 : 1,
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                }}
                            >
                                {deleting && <Loader2 size={14} className="animate-spin" />}
                                {deleteModal.type === 'message' && !deleteModal.isRead ? 'Delete for everyone' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast notification */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: '24px', left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    padding: '12px 24px',
                    borderRadius: '12px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    border: borderVal,
                    fontSize: '14px', fontWeight: 500,
                    zIndex: 10000,
                    display: 'flex', alignItems: 'center', gap: '8px',
                    animation: 'slideUp 0.3s ease-out',
                }}>
                    <Trash2 size={14} color="#EF4444" />
                    {toast}
                </div>
            )}

            <style>{`
                @media (min-width: 768px) {
                    .messages-list-panel { display: block !important; }
                    .messages-thread-panel { display: flex !important; }
                    .thread-back-btn { display: none !important; }
                    .msg-page-container {
                        max-width: 1100px;
                        margin: 0 auto;
                        padding: 24px 16px 80px;
                    }
                    .msg-page-header { display: flex !important; }
                    .msg-grid {
                        grid-template-columns: minmax(260px, 340px) 1fr !important;
                        border-radius: 12px !important;
                        border: 1px solid var(--border-color) !important;
                        height: calc(100vh - 180px) !important;
                        max-height: calc(100vh - 180px) !important;
                    }
                }
                @media (max-width: 767px) {
                    .messages-list-panel { border-right: none !important; }
                    .msg-page-container {
                        position: fixed;
                        top: 94px;
                        left: 0;
                        right: 0;
                        bottom: 80px;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                        background: var(--bg-primary);
                        z-index: 30;
                        padding: 0;
                        margin: 0;
                    }
                    .msg-page-header { display: none !important; }
                    .msg-grid {
                        border: none !important;
                        border-radius: 0 !important;
                        flex: 1 !important;
                        min-height: 0 !important;
                        height: 100% !important;
                    }
                    .msg-composer {
                        padding: 8px 12px 4px !important;
                    }
                }
                @keyframes slideUp {
                    from { transform: translateX(-50%) translateY(20px); opacity: 0; }
                    to { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
                .hide-scrollbar {
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                }
                .hide-scrollbar::-webkit-scrollbar {
                    display: none;
                }
            `}</style>
        </div>
    );
}
