'use client';

import { useState } from 'react';
import ShareMenu from './ShareMenu';

interface ShareButtonProps {
  url: string;
  title: string;
  description?: string;
  variant?: 'icon' | 'button';
}

export default function ShareButton({ url, title, description = '', variant = 'button' }: ShareButtonProps) {
  const [showMenu, setShowMenu] = useState(false);

  // Try native share on mobile
  const handleShare = async () => {
    if (navigator.share && variant === 'button') {
      try {
        await navigator.share({ title, text: description, url });
        return;
      } catch {
        // User cancelled or not supported, fall through to menu
      }
    }
    setShowMenu(true);
  };

  if (variant === 'icon') {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={handleShare}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Share"
          aria-expanded={showMenu}
          aria-haspopup="menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>
        {showMenu && (
          <ShareMenu
            url={url}
            title={title}
            description={description}
            onClose={() => setShowMenu(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleShare}
        className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        aria-label="Share Job"
        aria-expanded={showMenu}
        aria-haspopup="menu"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Share Job
      </button>
      {showMenu && (
        <ShareMenu
          url={url}
          title={title}
          description={description}
          onClose={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}
