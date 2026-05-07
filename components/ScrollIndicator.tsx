'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Custom page-scroll indicator.
 *
 * Why: native browser scrollbars are inconsistently visible across browsers
 * and OS settings — Chrome's overlay-scrollbar flag, Windows "auto-hide"
 * preference, macOS overlay-by-default behavior — all hide the bar despite
 * the CSS rules in globals.css trying to force it visible. This is a real
 * DOM element styled in our brand palette, so visibility is guaranteed.
 *
 * Behavior:
 *   - Fixed-position track on the right edge of the viewport.
 *   - Thumb height reflects the visible-fraction of the page.
 *   - Thumb position reflects the current scroll progress.
 *   - Click anywhere on the track to jump-scroll there.
 *   - Drag the thumb to scroll (mouse + touch).
 *   - Hidden on mobile (< 768px) where touch scrolling is the norm.
 *   - Hidden when the page doesn't overflow (nothing to indicate).
 *   - Sits at z-index 200 so it floats above the floating header (z-100).
 */

const TRACK_WIDTH = 12;
const TRACK_RIGHT = 4;
const TRACK_TOP = 96; // sits below the floating header
const TRACK_BOTTOM = 16;

export default function ScrollIndicator() {
    const [thumbHeight, setThumbHeight] = useState(40);
    const [thumbTop, setThumbTop] = useState(0);
    const [trackHeight, setTrackHeight] = useState(0);
    const [visible, setVisible] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const draggingRef = useRef(false);
    const dragStartRef = useRef<{ y: number; scrollY: number } | null>(null);
    const trackRef = useRef<HTMLDivElement>(null);

    const recompute = useCallback(() => {
        if (typeof window === 'undefined') return;

        // Mobile: hide entirely. Touch scrolling doesn't need a visual indicator.
        if (window.innerWidth < 768) {
            setVisible(false);
            return;
        }

        const doc = document.documentElement;
        const scrollHeight = doc.scrollHeight;
        const clientHeight = doc.clientHeight;
        const scrollTop = window.scrollY;

        // No overflow → no indicator.
        if (scrollHeight <= clientHeight + 4) {
            setVisible(false);
            return;
        }

        const availableTrackHeight = clientHeight - TRACK_TOP - TRACK_BOTTOM;
        if (availableTrackHeight < 80) {
            setVisible(false);
            return;
        }

        // Thumb height proportional to visible fraction. Floor at 32px so
        // long pages still have a clickable target.
        const visibleFraction = clientHeight / scrollHeight;
        const computedThumbHeight = Math.max(
            32,
            Math.floor(availableTrackHeight * visibleFraction),
        );

        // Thumb top within track, scaled to scroll progress.
        const scrollProgress = scrollTop / (scrollHeight - clientHeight);
        const computedThumbTop = Math.floor(
            (availableTrackHeight - computedThumbHeight) * scrollProgress,
        );

        setThumbHeight(computedThumbHeight);
        setThumbTop(computedThumbTop);
        setTrackHeight(availableTrackHeight);
        setVisible(true);
    }, []);

    useEffect(() => {
        // First measurement after layout has settled.
        const id = requestAnimationFrame(recompute);

        const onScroll = () => recompute();
        const onResize = () => recompute();

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onResize);
        // Re-measure when DOM grows (lazy-loaded job cards, etc.)
        const observer = new ResizeObserver(recompute);
        observer.observe(document.body);

        return () => {
            cancelAnimationFrame(id);
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onResize);
            observer.disconnect();
        };
    }, [recompute]);

    // Click on the track jumps to that scroll position.
    const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (draggingRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const doc = document.documentElement;
        const targetProgress = Math.max(
            0,
            Math.min(1, (clickY - thumbHeight / 2) / (trackHeight - thumbHeight)),
        );
        const targetScrollY = targetProgress * (doc.scrollHeight - doc.clientHeight);
        window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
    };

    // Drag the thumb to scroll.
    const handleThumbMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        draggingRef.current = true;
        dragStartRef.current = { y: e.clientY, scrollY: window.scrollY };
        document.body.style.userSelect = 'none';
    };

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!draggingRef.current || !dragStartRef.current) return;
            const dy = e.clientY - dragStartRef.current.y;
            const doc = document.documentElement;
            const scrollableDistance = doc.scrollHeight - doc.clientHeight;
            const trackScrollableDistance = trackHeight - thumbHeight;
            if (trackScrollableDistance <= 0) return;
            const dyScroll = (dy / trackScrollableDistance) * scrollableDistance;
            window.scrollTo({
                top: dragStartRef.current.scrollY + dyScroll,
                behavior: 'auto',
            });
        };
        const onUp = () => {
            if (draggingRef.current) {
                draggingRef.current = false;
                dragStartRef.current = null;
                document.body.style.userSelect = '';
            }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [trackHeight, thumbHeight]);

    if (!visible) return null;

    return (
        <div
            ref={trackRef}
            onClick={handleTrackClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            aria-hidden="true"
            style={{
                position: 'fixed',
                top: TRACK_TOP,
                right: TRACK_RIGHT,
                bottom: TRACK_BOTTOM,
                width: TRACK_WIDTH,
                borderRadius: TRACK_WIDTH / 2,
                background: isHovered
                    ? 'rgba(213, 232, 224, 0.85)'
                    : 'rgba(213, 232, 224, 0.55)',
                border: '1px solid rgba(13, 148, 136, 0.12)',
                cursor: 'pointer',
                zIndex: 200,
                transition: 'background 0.15s ease',
                boxShadow:
                    'inset 1px 1px 2px rgba(0, 60, 50, 0.06), 1px 1px 3px rgba(0, 60, 50, 0.04)',
            }}
        >
            <div
                onMouseDown={handleThumbMouseDown}
                style={{
                    position: 'absolute',
                    top: thumbTop,
                    left: 1,
                    right: 1,
                    height: thumbHeight,
                    borderRadius: (TRACK_WIDTH - 2) / 2,
                    background: isHovered
                        ? 'linear-gradient(180deg, rgba(13, 148, 136, 0.95), rgba(15, 118, 110, 1))'
                        : 'linear-gradient(180deg, rgba(13, 148, 136, 0.75), rgba(15, 118, 110, 0.85))',
                    boxShadow:
                        '0 1px 3px rgba(13, 148, 136, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
                    cursor: 'grab',
                    transition:
                        draggingRef.current
                            ? 'none'
                            : 'background 0.15s ease',
                }}
            />
        </div>
    );
}
