'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import ShareMenu from './ShareMenu';

interface ShareButtonProps {
  url: string;
  title: string;
  description?: string;
  variant?: 'icon' | 'button';
  className?: string;
}

export default function ShareButton({ 
  url, 
  title, 
  description,
  variant = 'icon',
  className = ''
}: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Use native share on mobile if available
  const handleShare = async () => {
    if (navigator.share && variant === 'icon') {
      try {
        await navigator.share({
          title,
          text: description,
          url,
        });
        return;
      } catch (err) {
        // User cancelled or not supported, fall back to menu
        if ((err as Error).name === 'AbortError') return;
      }
    }
    setIsOpen(true);
  };

  if (variant === 'icon') {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={handleShare}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-700"
          aria-label="Share this job"
          title="Share"
        >
          <Share2 size={18} />
        </button>
        
        {isOpen && (
          <ShareMenu
            url={url}
            title={title}
            description={description}
            onClose={() => setIsOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={handleShare}
        className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 rounded-lg text-gray-700 font-medium transition-colors"
      >
        <Share2 size={18} />
        Share Job
      </button>
      
      {isOpen && (
        <ShareMenu
          url={url}
          title={title}
          description={description}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

