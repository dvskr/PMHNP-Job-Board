'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import MessageEmployerModal from './MessageEmployerModal';

interface MessageEmployerButtonProps {
    jobId: string;
    jobTitle: string;
    employerName: string;
    disabled?: boolean;
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
}: MessageEmployerButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => !disabled && setIsOpen(true)}
                disabled={disabled}
                title={disabled ? 'This is your job posting' : `Send InMail to ${employerName}`}
                style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: disabled ? '1.5px solid var(--border-color)' : '1.5px solid rgba(45,212,191,0.3)',
                    backgroundColor: 'transparent',
                    color: disabled ? 'var(--text-tertiary)' : '#2DD4BF',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                    opacity: disabled ? 0.5 : 1,
                }}
                onMouseEnter={e => {
                    if (!disabled) {
                        e.currentTarget.style.backgroundColor = 'rgba(45,212,191,0.08)';
                        e.currentTarget.style.borderColor = 'rgba(45,212,191,0.5)';
                    }
                }}
                onMouseLeave={e => {
                    if (!disabled) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderColor = 'rgba(45,212,191,0.3)';
                    }
                }}
            >
                <MessageSquare size={16} />
                InMail Employer
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
