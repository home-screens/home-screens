'use client';

import { useRef, useState } from 'react';
import { useDndMonitor } from '@dnd-kit/core';

export interface CanvasDragState {
  moduleId: string;
  deltaX: number;
  deltaY: number;
}

/**
 * Tracks the in-progress canvas drag via dnd-kit's monitor. Scale is frozen at
 * drag start (in a ref) so the drag ghost keeps consistent coordinates even if
 * the effective scale changes mid-drag.
 */
export function useCanvasDragState(effectiveScale: number) {
  const [dragState, setDragState] = useState<CanvasDragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const scaleAtDragStartRef = useRef(0);

  useDndMonitor({
    onDragStart(event) {
      setIsDragging(true);
      scaleAtDragStartRef.current = effectiveScale;
      const data = event.active.data.current;
      if (data?.source === 'canvas') {
        setDragState({ moduleId: data.moduleId as string, deltaX: 0, deltaY: 0 });
      }
    },
    onDragMove(event) {
      const data = event.active.data.current;
      if (data?.source === 'canvas') {
        setDragState({
          moduleId: data.moduleId as string,
          deltaX: event.delta.x,
          deltaY: event.delta.y,
        });
      }
    },
    onDragEnd() {
      setDragState(null);
      setIsDragging(false);
    },
    onDragCancel() {
      setDragState(null);
      setIsDragging(false);
    },
  });

  return { dragState, isDragging, scaleAtDragStartRef };
}
