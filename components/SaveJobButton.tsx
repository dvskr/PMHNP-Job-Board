'use client';

import { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import { trackJobSave, trackJobUnsave, buildJobItem } from '@/lib/analytics';

interface SaveJobButtonProps {
  jobId: string;
}

export default function SaveJobButton({ jobId }: SaveJobButtonProps) {
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    // Read saved jobs from localStorage
    const timer = setTimeout(() => {
      try {
        const raw = JSON.parse(localStorage.getItem('savedJobs') || '[]');
        const savedJobs = Array.isArray(raw) ? raw : [];
        setIsSaved(savedJobs.includes(jobId));
      } catch {
        setIsSaved(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [jobId]);

  const toggleSave = () => {
    const raw = JSON.parse(localStorage.getItem('savedJobs') || '[]');
    const savedJobs: string[] = Array.isArray(raw) ? raw : [];

    if (isSaved) {
      // Remove from saved
      const updatedJobs = savedJobs.filter((id: string) => id !== jobId);
      localStorage.setItem('savedJobs', JSON.stringify(updatedJobs));
      setIsSaved(false);
      trackJobUnsave(buildJobItem({ id: jobId, title: '' }));
    } else {
      // Add to saved
      savedJobs.push(jobId);
      localStorage.setItem('savedJobs', JSON.stringify(savedJobs));
      setIsSaved(true);
      trackJobSave(buildJobItem({ id: jobId, title: '' }));
    }
  };

  return (
    <button
      onClick={toggleSave}
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${isSaved
          ? 'bg-teal-50 border-teal-500 text-teal-600 hover:bg-teal-100'
          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
        }`}
    >
      <Bookmark
        size={15}
        className={isSaved ? 'fill-teal-600' : ''}
      />
      {isSaved ? 'Saved' : 'Save'}
    </button>
  );
}

