'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Clock, CheckCheck, Send } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Message {
    id: string;
    subject: string;
    body: string;
    sentAt: string;
    readAt: string | null;
    recipientName: string;
    jobTitle: string | null;
}

export default function MessagesTab() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const fetchMessages = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/employer/messages');
            if (!res.ok) { setMessages([]); return; }
            const text = await res.text();
            if (!text) { setMessages([]); return; }
            const data = JSON.parse(text);
            setMessages(data.messages || []);
        } catch (err) {
            console.error('Error fetching messages:', err);
            setMessages([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div className="text-center py-12 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <MessageSquare size={40} className="mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
                <p className="text-lg font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    No messages yet
                </p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    Messages you send to candidates will appear here. You can reach out to candidates from the Applicants tab.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {messages.map(msg => (
                <button
                    key={msg.id}
                    onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
                    className="block w-full text-left rounded-lg p-4 transition-shadow hover:shadow-md"
                    style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                    }}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <Send size={14} style={{ color: 'var(--text-tertiary)' }} />
                                <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                                    To: {msg.recipientName}
                                </span>
                                {msg.jobTitle && (
                                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>
                                        {msg.jobTitle}
                                    </span>
                                )}
                            </div>
                            <p className="font-medium text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                                {msg.subject}
                            </p>
                            {expandedId === msg.id && (
                                <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                                    {msg.body}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-xs flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                            {msg.readAt ? (
                                <span className="flex items-center gap-1" title={`Read ${formatDate(msg.readAt)}`}>
                                    <CheckCheck size={14} style={{ color: '#10B981' }} />
                                    Read
                                </span>
                            ) : (
                                <span className="flex items-center gap-1">
                                    <Clock size={14} />
                                    Sent
                                </span>
                            )}
                            <span>{formatDate(msg.sentAt)}</span>
                        </div>
                    </div>
                </button>
            ))}
        </div>
    );
}
