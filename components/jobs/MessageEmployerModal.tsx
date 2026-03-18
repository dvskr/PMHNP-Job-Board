'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Send, Loader2, CheckCircle, MessageSquare, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface MessageEmployerModalProps {
    isOpen: boolean;
    onClose: () => void;
    jobId: string;
    jobTitle: string;
    employerName: string;
}

export default function MessageEmployerModal({
    isOpen,
    onClose,
    jobId,
    jobTitle,
    employerName,
}: MessageEmployerModalProps) {
    const router = useRouter();
    const [subject, setSubject] = useState(`Question about ${jobTitle}`);
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const [success, setSuccess] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [profileIncomplete, setProfileIncomplete] = useState(false);
    const [missingFields, setMissingFields] = useState<string[]>([]);
    const [alreadyMessaged, setAlreadyMessaged] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

    // Check auth status on mount
    useEffect(() => {
        if (!isOpen) return;
        (async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            setIsAuthenticated(!!user);
        })();
    }, [isOpen]);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setSubject(`Question about ${jobTitle}`);
            setBody('');
            setSuccess(false);
            setConversationId(null);
            setError(null);
            setProfileIncomplete(false);
            setMissingFields([]);
            setAlreadyMessaged(false);
        }
    }, [isOpen, jobTitle]);

    const handleSend = async () => {
        if (!body.trim() || !subject.trim() || sending) return;

        setSending(true);
        setError(null);

        try {
            const res = await fetch('/api/candidate/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, subject: subject.trim(), body: body.trim() }),
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.profileIncomplete) {
                    setProfileIncomplete(true);
                    setMissingFields(data.missingFields || []);
                } else if (data.alreadyMessaged) {
                    setAlreadyMessaged(true);
                    setConversationId(data.conversationId);
                } else if (res.status === 401) {
                    setIsAuthenticated(false);
                } else {
                    setError(data.error || 'Failed to send message');
                }
                return;
            }

            setSuccess(true);
            setConversationId(data.conversationId);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setSending(false);
        }
    };

    if (!isOpen) return null;

    // Unauthenticated state
    if (isAuthenticated === false) {
        return (
            <div
                style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                }}
                onClick={onClose}
            >
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        backgroundColor: 'var(--bg-secondary)', borderRadius: '16px',
                        padding: '32px', maxWidth: '420px', width: '90%',
                        border: '1px solid var(--border-color)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    }}
                >
                    <div style={{ textAlign: 'center' }}>
                        <MessageSquare size={40} style={{ color: '#2DD4BF', margin: '0 auto 16px' }} />
                        <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                            Log in to message {employerName}
                        </h3>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 24px' }}>
                            Create a free account or log in to send a message about this position.
                        </p>
                        <button
                            onClick={() => router.push(`/login?redirect=/jobs/${encodeURIComponent(jobId)}`)}
                            style={{
                                width: '100%', padding: '12px', borderRadius: '10px',
                                border: 'none', backgroundColor: '#2DD4BF', color: 'white',
                                fontSize: '15px', fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            Log In / Sign Up
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                width: '100%', padding: '10px', marginTop: '8px',
                                borderRadius: '10px', border: '1px solid var(--border-color)',
                                backgroundColor: 'transparent', color: 'var(--text-secondary)',
                                fontSize: '14px', cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            }}
            onClick={onClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    backgroundColor: 'var(--bg-secondary)', borderRadius: '16px',
                    padding: '0', maxWidth: '520px', width: '90%',
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '20px 24px', borderBottom: '1px solid var(--border-color)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(59,130,246,0.05))',
                }}>
                    <div>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                            Message {employerName}
                        </h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
                            About: {jobTitle}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-secondary)', padding: '4px',
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '24px' }}>
                    {/* Success state */}
                    {success && (
                        <div style={{ textAlign: 'center', padding: '16px 0' }}>
                            <CheckCircle size={48} style={{ color: '#10B981', margin: '0 auto 16px' }} />
                            <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                                Message sent!
                            </h4>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
                                {employerName} will be notified by email. You can continue the conversation from your messages page.
                            </p>
                            <button
                                onClick={() => router.push('/messages')}
                                style={{
                                    padding: '10px 24px', borderRadius: '10px',
                                    border: 'none', backgroundColor: '#2DD4BF', color: 'white',
                                    fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                                }}
                            >
                                <MessageSquare size={16} />
                                View Conversation
                            </button>
                        </div>
                    )}

                    {/* Already messaged state */}
                    {alreadyMessaged && (
                        <div style={{ textAlign: 'center', padding: '16px 0' }}>
                            <MessageSquare size={48} style={{ color: '#60A5FA', margin: '0 auto 16px' }} />
                            <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                                Already messaged
                            </h4>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
                                You&apos;ve already sent a message about this job. Continue the conversation from your messages page.
                            </p>
                            <button
                                onClick={() => router.push('/messages')}
                                style={{
                                    padding: '10px 24px', borderRadius: '10px',
                                    border: 'none', backgroundColor: '#2DD4BF', color: 'white',
                                    fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                                }}
                            >
                                <MessageSquare size={16} />
                                Continue Conversation
                            </button>
                        </div>
                    )}

                    {/* Profile incomplete state */}
                    {profileIncomplete && (
                        <div style={{ textAlign: 'center', padding: '16px 0' }}>
                            <AlertTriangle size={48} style={{ color: '#F59E0B', margin: '0 auto 16px' }} />
                            <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                                Almost there!
                            </h4>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                                To message employers, please add your <strong>first name</strong> to your profile. It only takes a moment!
                            </p>
                            {missingFields.length > 0 && (
                                <ul style={{ textAlign: 'left', fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 20px', paddingLeft: '20px' }}>
                                    {missingFields.map(f => (
                                        <li key={f} style={{ textTransform: 'capitalize', margin: '4px 0' }}>{f}</li>
                                    ))}
                                </ul>
                            )}
                            <button
                                onClick={() => router.push('/profile?redirect=' + encodeURIComponent(window.location.pathname))}
                                style={{
                                    padding: '10px 24px', borderRadius: '10px',
                                    border: 'none', backgroundColor: '#F59E0B', color: 'white',
                                    fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                Update Profile
                            </button>
                        </div>
                    )}

                    {/* Compose state */}
                    {!success && !alreadyMessaged && !profileIncomplete && (
                        <>
                            {/* Subject */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{
                                    display: 'block', fontSize: '13px', fontWeight: 600,
                                    color: 'var(--text-secondary)', marginBottom: '6px',
                                }}>
                                    Subject
                                </label>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={e => setSubject(e.target.value)}
                                    maxLength={200}
                                    style={{
                                        width: '100%', padding: '10px 14px',
                                        borderRadius: '10px', border: '1.5px solid var(--border-color)',
                                        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
                                        fontSize: '14px', fontFamily: 'inherit', outline: 'none',
                                        transition: 'border-color 0.2s',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#2DD4BF'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                                />
                            </div>

                            {/* Message body */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{
                                    display: 'block', fontSize: '13px', fontWeight: 600,
                                    color: 'var(--text-secondary)', marginBottom: '6px',
                                }}>
                                    Message
                                </label>
                                <textarea
                                    value={body}
                                    onChange={e => setBody(e.target.value)}
                                    placeholder={`Hi, I'm interested in this position and had a question...`}
                                    maxLength={2000}
                                    rows={5}
                                    style={{
                                        width: '100%', padding: '10px 14px',
                                        borderRadius: '10px', border: '1.5px solid var(--border-color)',
                                        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
                                        fontSize: '14px', fontFamily: 'inherit', outline: 'none',
                                        resize: 'vertical', minHeight: '100px',
                                        transition: 'border-color 0.2s',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#2DD4BF'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                />
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px',
                                }}>
                                    <span>Ctrl+Enter to send</span>
                                    <span style={{ color: body.length > 1800 ? '#F59E0B' : 'var(--text-tertiary)' }}>
                                        {body.length}/2000
                                    </span>
                                </div>
                            </div>

                            {/* Error */}
                            {error && (
                                <div style={{
                                    padding: '10px 14px', borderRadius: '8px',
                                    backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                    color: '#EF4444', fontSize: '13px', marginBottom: '16px',
                                }}>
                                    {error}
                                </div>
                            )}

                            {/* Send button */}
                            <button
                                onClick={handleSend}
                                disabled={sending || !body.trim() || !subject.trim()}
                                style={{
                                    width: '100%', padding: '12px',
                                    borderRadius: '10px', border: 'none',
                                    background: sending || !body.trim() || !subject.trim()
                                        ? 'rgba(45,212,191,0.3)'
                                        : 'linear-gradient(135deg, #2DD4BF, #3B82F6)',
                                    color: 'white', fontSize: '15px', fontWeight: 600,
                                    cursor: sending || !body.trim() || !subject.trim() ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    transition: 'opacity 0.2s',
                                }}
                            >
                                {sending ? (
                                    <><Loader2 size={18} className="animate-spin" /> Sending...</>
                                ) : (
                                    <><Send size={18} /> Send Message</>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
