import { useEffect, useState, useCallback, useRef } from 'react';

interface UsePullToRefreshOptions {
  threshold?: number; // Distance in pixels to trigger refresh (default: 80)
  resistance?: number; // Resistance factor for pull (default: 2.5)
  enabled?: boolean; // Enable/disable the hook (default: true)
}

/**
 * Custom hook for pull-to-refresh on mobile
 * 
 * @param onRefresh - Callback function to execute when refresh is triggered
 * @param options - Configuration options
 * @returns Object with isRefreshing state and pullDistance
 * 
 * @example
 * ```tsx
 * const { isRefreshing, pullDistance } = usePullToRefresh(async () => {
 *   await fetchNewData();
 * });
 * 
 * return (
 *   <div>
 *     {isRefreshing && <Spinner />}
 *     {pullDistance > 0 && <div style={{ height: pullDistance }}>Pull to refresh...</div>}
 *     <YourContent />
 *   </div>
 * );
 * ```
 */
export default function usePullToRefresh(
  onRefresh: () => void | Promise<void>,
  options: UsePullToRefreshOptions = {}
) {
  const {
    threshold = 80,
    resistance = 2.5,
    enabled = true,
  } = options;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  
  const touchStartY = useRef<number>(0);
  const isPulling = useRef<boolean>(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only activate if:
    // 1. User is at the top of the page
    // 2. Hook is enabled
    // 3. Not already refreshing
    if (window.scrollY === 0 && enabled && !isRefreshing) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, [enabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;

    const touchY = e.touches[0].clientY;
    const distance = touchY - touchStartY.current;

    // Only allow pulling down (positive distance)
    if (distance > 0) {
      // Apply resistance to make it feel natural
      const adjustedDistance = distance / resistance;
      setPullDistance(adjustedDistance);

      // Prevent default scroll behavior when pulling
      // (Only after a small threshold to avoid interfering with normal scrolling)
      if (adjustedDistance > 10) {
        e.preventDefault();
      }
    }
  }, [isRefreshing, resistance]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;

    isPulling.current = false;

    // Trigger refresh if threshold is met
    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(0);

      try {
        await onRefresh();
      } catch (error) {
        console.error('Pull to refresh error:', error);
      } finally {
        setIsRefreshing(false);
      }
    } else {
      // Reset pull distance if threshold not met
      setPullDistance(0);
    }
  }, [pullDistance, threshold, onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    // Add event listeners
    // touchmove needs { passive: false } to allow preventDefault
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Cleanup
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    isRefreshing,
    pullDistance,
  };
}

