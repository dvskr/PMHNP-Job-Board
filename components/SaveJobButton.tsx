'use client';

import { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';

interface SaveJobButtonProps {
  jobId: string;
}

export default function SaveJobButton({ jobId }: SaveJobButtonProps) {
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    // Read saved jobs from localStorage
    const savedJobs = JSON.parse(localStorage.getItem('savedJobs') || '[]');
    setIsSaved(savedJobs.includes(jobId));
  }, [jobId]);

  const toggleSave = () => {
    const savedJobs: string[] = JSON.parse(localStorage.getItem('savedJobs') || '[]');
    
    if (isSaved) {
      // Remove from saved
      const updatedJobs = savedJobs.filter((id: string) => id !== jobId);
      localStorage.setItem('savedJobs', JSON.stringify(updatedJobs));
      setIsSaved(false);
    } else {
      // Add to saved
      savedJobs.push(jobId);
      localStorage.setItem('savedJobs', JSON.stringify(savedJobs));
      setIsSaved(true);
    }
  };

  return (
    <button
      onClick={toggleSave}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
        isSaved
          ? 'bg-blue-50 border-blue-500 text-blue-600 hover:bg-blue-100'
          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
      }`}
    >
      <Bookmark
        size={20}
        className={isSaved ? 'fill-blue-600' : ''}
      />
      {isSaved ? 'Saved' : 'Save'}
    </button>
  );
}

