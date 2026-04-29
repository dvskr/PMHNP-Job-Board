'use client';

import { useEffect } from 'react';

/**
 * Fixes position: sticky on editorial blog pages by overriding
 * body/html overflow-x: hidden (set globally) with overflow-x: clip.
 * 
 * overflow-x: hidden creates a new scroll context that breaks sticky.
 * overflow-x: clip prevents horizontal scrollbar without breaking sticky.
 * 
 * This component is mounted on blog post pages only and cleans up on unmount.
 */
export default function EditorialStickyFix() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    // Save originals
    const origHtml = html.style.overflowX;
    const origBody = body.style.overflowX;

    // Apply fix
    html.style.overflowX = 'clip';
    body.style.overflowX = 'clip';

    return () => {
      // Restore originals on unmount
      html.style.overflowX = origHtml;
      body.style.overflowX = origBody;
    };
  }, []);

  return null;
}
