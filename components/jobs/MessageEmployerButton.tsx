'use client';

import { useState, useEffect } from 'react';
import MessageEmployerModal from './MessageEmployerModal';

interface MessageEmployerButtonProps {
    jobId: string;
    jobTitle: string;
    employerName: string;
    disabled?: boolean;
    /**
     * Supabase user id of the job's owner. Used to disable the button when the
     * viewer is the employer who posted this job (you can't message yourself).
     * Resolved CLIENT-SIDE so the parent job-detail page stays ISR-cached —
     * the server no longer reads cookies to compute an `isOwnJob` flag.
     */
    employerUserId?: string | null;
}

/**
 * Client component that renders a "Message Employer" button
 * and opens the MessageEmployerModal on click.
 * Only displayed for employer-posted jobs (parent controls visibility).
 */
export default function MessageEmployerButton({
    jobId,
    jobTitle,
    employerName,
    disabled = false,
    employerUserId = null,
}: MessageEmployerButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isOwnJob, setIsOwnJob] = useState(false);

    useEffect(() => {
        if (!employerUserId) return;
        let active = true;
        fetch('/api/auth/me')
            .then((r) => r.json())
            .then((d) => { if (active && d?.id) setIsOwnJob(d.id === employerUserId); })
            .catch(() => { });
        return () => { active = false; };
    }, [employerUserId]);

    const isDisabled = disabled || isOwnJob;

    const baseShadow = isDisabled
        ? '3px 3px 6px rgba(0,0,0,0.04), inset 1px 1px 3px rgba(255,255,255,0.5)'
        : '5px 5px 12px rgba(13,148,136,0.12), -3px -3px 8px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.5), inset -1px -1px 2px rgba(0,0,0,0.03)';

    return (
        <>
            <button
                onClick={() => !isDisabled && setIsOpen(true)}
                disabled={isDisabled}
                title={isDisabled ? 'This is your job posting' : `Send InMail to ${employerName}`}
                style={{
                    width: '100%',
                    padding: '10px 18px',
                    borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.5)',
                    backgroundColor: isDisabled ? '#F3F4F6' : '#D5F5F1',
                    color: isDisabled ? '#9CA3AF' : '#0D9488',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                    opacity: isDisabled ? 0.5 : 1,
                    boxShadow: baseShadow,
                }}
                onMouseEnter={e => {
                    if (!isDisabled) {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '7px 7px 16px rgba(13,148,136,0.15), -4px -4px 10px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.03)';
                    }
                }}
                onMouseLeave={e => {
                    if (!isDisabled) {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = baseShadow;
                    }
                }}
            >
                {/* Clay icon pebble */}
                <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: 10,
                    backgroundColor: '#B2F5EA',
                    boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.04), 2px 2px 4px rgba(0,0,0,0.06)',
                    border: '1px solid rgba(255,255,255,0.6)',
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
                    </svg>
                </span>
                Message Employer
            </button>

            <MessageEmployerModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                jobId={jobId}
                jobTitle={jobTitle}
                employerName={employerName}
            />
        </>
    );
}
