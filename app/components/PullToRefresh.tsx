'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

const THRESHOLD = 80;
const MAX_PULL = 120;

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isPulling = useRef(false);

  const isAtTop = useCallback(() => {
    const el = containerRef.current;
    if (!el) return false;
    return el.scrollTop <= 0;
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (isRefreshing) return;
    if (isAtTop()) {
      startY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, [isRefreshing, isAtTop]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    if (diff > 0 && isAtTop()) {
      const distance = Math.min(diff * 0.5, MAX_PULL);
      setPullDistance(distance);
      if (distance > 10) {
        e.preventDefault();
      }
    } else {
      setPullDistance(0);
    }
  }, [isRefreshing, isAtTop]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistance >= THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const showIndicator = pullDistance > 10;

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        overflow: 'auto',
        overscrollBehavior: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {showIndicator && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: `${pullDistance}px`,
          transition: isPulling.current ? 'none' : 'height 0.2s ease',
          overflow: 'hidden',
        }}>
          <div style={{
            width: '28px',
            height: '28px',
            border: '3px solid #e5e7eb',
            borderTopColor: progress >= 1 ? '#3b82f6' : '#9ca3af',
            borderRadius: '50%',
            animation: isRefreshing ? 'ptr-spin 0.6s linear infinite' : 'none',
            transform: `rotate(${progress * 360}deg)`,
            transition: isRefreshing ? 'none' : 'transform 0.1s ease',
            opacity: progress,
          }} />
        </div>
      )}
      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>
      {children}
    </div>
  );
}
