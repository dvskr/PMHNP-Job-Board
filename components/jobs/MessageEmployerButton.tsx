'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import MessageEmployerModal from './MessageEmployerModal';

interface MessageEmployerButtonProps {
    jobId: string;
    jobTitle: string;
    employerName: string;
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
}: MessageEmployerButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: '1.5px solid rgba(45,212,191,0.3)',
                    backgroundColor: 'transparent',
                    color: '#2DD4BF',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = 'rgba(45,212,191,0.08)';
                    e.currentTarget.style.borderColor = 'rgba(45,212,191,0.5)';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = 'rgba(45,212,191,0.3)';
                }}
            >
                <MessageSquare size={16} />
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
