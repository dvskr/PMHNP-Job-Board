'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import useAppliedJobs from '@/lib/hooks/useAppliedJobs';
import ApplyConfirmationModal from '@/components/ApplyConfirmationModal';

interface ApplyButtonProps {
  jobId: string;
  applyLink: string;
  jobTitle: string;
}

function formatAppliedDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function ApplyButton({ jobId, applyLink, jobTitle }: ApplyButtonProps) {
  const { isApplied, markApplied, getAppliedDate } = useAppliedJobs();
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const applied = isApplied(jobId);
  const appliedDate = getAppliedDate(jobId);

  const handleApply = () => {
    // Track apply click (fire and forget)
    try {
      fetch(`/api/jobs/${jobId}/track-apply`, {
        method: 'POST',
      }).catch(() => {
        // Silently fail - tracking is not critical
      });
    } catch {
      // Silently fail
    }

    // Open apply link in new tab
    window.open(applyLink, '_blank', 'noopener,noreferrer');

    // Show confirmation modal only if not already applied
    if (!isApplied(jobId)) {
      setShowConfirmModal(true);
    }
  };

  const handleConfirmApplied = () => {
    markApplied(jobId);
    setShowConfirmModal(false);
  };

  const handleNotApplied = () => {
    setShowConfirmModal(false);
  };

  return (
    <div className="flex flex-col w-full">
      <div className="flex items-center gap-3">
        <button
          onClick={handleApply}
          className="apply-btn inline-flex items-center justify-center gap-2 text-white px-8 py-4 lg:py-3 rounded-xl font-bold transition-all text-lg w-full lg:w-auto touch-manipulation"
          style={{
            minHeight: '52px',
            background: 'linear-gradient(135deg, #0d9488, #0f766e)',
            boxShadow: '0 4px 14px rgba(13,148,136,0.35)',
          }}
        >
          {applied ? 'Apply Again' : 'Apply Now'}
          <ExternalLink size={20} />
        </button>

        {applied && (
          <span className="hidden lg:inline-flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-full text-sm font-medium">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
            Applied
          </span>
        )}
      </div>

      {applied && appliedDate && (
        <p className="text-sm mt-2 text-center lg:text-left" style={{ color: 'var(--text-tertiary)' }}>
          Applied on {formatAppliedDate(appliedDate)}
        </p>
      )}

      {!applied && (
        <button
          onClick={() => markApplied(jobId)}
          className="text-sm hover:underline mt-2 text-center lg:text-left py-2 touch-manipulation"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Already applied? Mark as applied
        </button>
      )}

      <ApplyConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirmApplied={handleConfirmApplied}
        onNotApplied={handleNotApplied}
        jobTitle={jobTitle}
      />

      <style>{`
        .apply-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(13,148,136,0.45) !important;
        }
        .apply-btn:active {
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}
