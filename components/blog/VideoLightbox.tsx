'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, X } from 'lucide-react';

interface VideoLightboxProps {
  videoUrl: string;
  title: string;
}

export default function VideoLightbox({ videoUrl, title }: VideoLightboxProps) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => {
    setOpen(false);
    // Pause video when closing
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }, []);

  // Close on Escape key, lock body scroll
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, handleClose]);

  return (
    <>
      {/* Play button overlay on hero image */}
      <button
        className="ed-video-play-btn"
        onClick={handleOpen}
        aria-label={`Watch video: ${title}`}
      >
        <Play size={28} fill="white" strokeWidth={0} />
        <span>Watch Video</span>
      </button>

      {/* Lightbox modal */}
      {open && (
        <div className="ed-video-overlay" onClick={handleClose}>
          <div className="ed-video-modal" onClick={(e) => e.stopPropagation()}>
            <button className="ed-video-close" onClick={handleClose} aria-label="Close video">
              <X size={20} />
            </button>
            <div className="ed-video-wrapper">
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                autoPlay
                playsInline
                preload="metadata"
              >
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
