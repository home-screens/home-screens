'use client';

import { useRef, useState, useEffect } from 'react';

interface UseTabScrollArgs {
  /** Stable signature of the tab list so observers re-sync when tabs change. */
  screenSignature: string;
  selectedScreenId: string | null;
  editingId: string | null;
}

/**
 * Owns the horizontal scroll affordances for the screen-tab strip: tracks
 * whether the left/right chevrons should show, keeps the active tab in view,
 * and exposes a smooth-scroll helper. The 8px thresholds hide the chevrons
 * once the strip is within a hair of either edge.
 */
export function useTabScroll({ screenSignature, selectedScreenId, editingId }: UseTabScrollArgs) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    setCanScrollLeft(container.scrollLeft > 8);
    setCanScrollRight(maxScrollLeft > 8 && container.scrollLeft < maxScrollLeft - 8);
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    updateScrollState();

    const handleScroll = () => updateScrollState();
    const resizeObserver = new ResizeObserver(() => updateScrollState());

    resizeObserver.observe(container);
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('scroll', handleScroll);
    };
  }, [screenSignature]);

  useEffect(() => {
    const activeTab = scrollContainerRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    updateScrollState();
  }, [selectedScreenId, editingId, screenSignature]);

  const scrollTabs = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollBy({
      left: direction === 'left' ? -220 : 220,
      behavior: 'smooth',
    });
  };

  return { scrollContainerRef, canScrollLeft, canScrollRight, scrollTabs };
}
