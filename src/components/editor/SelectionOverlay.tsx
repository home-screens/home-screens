'use client';

import { useRef, useCallback } from 'react';
import { GRID_SIZE, snapToGrid } from '@/lib/constants';
import { useEditorStore } from '@/stores/editor-store';
import type { ModuleInstance } from '@/types/config';

/**
 * Selection chrome (ring + resize handle) for the selected module, rendered
 * as a canvas-level overlay above every module. Inside the module's own
 * wrapper the ring would be capped by that wrapper's zIndex stacking
 * context — invisible whenever the selected module sits beneath an
 * overlapping one — and lifting the module itself would visually mask the
 * very z-order changes the Bring to Front / Send to Back buttons make.
 * The overlay ignores pointer events; only the resize handle is interactive.
 */
export default function SelectionOverlay({
  mod,
  scale,
  displayWidth,
  displayHeight,
  onResize,
}: {
  mod: ModuleInstance;
  scale: number;
  displayWidth: number;
  displayHeight: number;
  onResize: (size: { w: number; h: number }) => void;
}) {
  // The store clamps every resize to the canvas, but a config can still
  // arrive with a module past the edge (an older save, a hand-edited file,
  // a display whose dimensions shrank). The canvas clips at its border, so
  // a ring drawn at the module's true size would put the handle outside it
  // where nothing can reach it. Draw the ring over the visible part instead:
  // the handle then sits at the visible corner, and one drag of it writes a
  // size the store brings back inside.
  const visibleW = Math.max(0, Math.min(mod.size.w, displayWidth - mod.position.x));
  const visibleH = Math.max(0, Math.min(mod.size.h, displayHeight - mod.position.y));
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: mod.size.w,
        startH: mod.size.h,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const dx = (ev.clientX - resizeRef.current.startX) / scale;
        const dy = (ev.clientY - resizeRef.current.startY) / scale;
        const snap = useEditorStore.getState().snapEnabled;
        const align = snap ? snapToGrid : Math.round;
        onResize({
          w: Math.max(GRID_SIZE * 2, align(resizeRef.current.startW + dx)),
          h: Math.max(GRID_SIZE * 2, align(resizeRef.current.startH + dy)),
        });
      };

      const handleMouseUp = () => {
        resizeRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [mod.size, scale, onResize],
  );

  return (
    <div
      data-testid="selection-overlay"
      data-selected-module={mod.id}
      className="absolute ring-2 ring-hs-accent ring-offset-1 ring-offset-transparent pointer-events-none"
      style={{
        left: mod.position.x * scale,
        top: mod.position.y * scale,
        width: visibleW * scale,
        height: visibleH * scale,
        borderRadius: mod.style.borderRadius * scale,
        // Above every module, below the drag ghost (z-9999).
        zIndex: 9000,
      }}
    >
      <div
        onMouseDown={handleResizeStart}
        className="absolute bottom-0 right-0 w-3 h-3 bg-hs-accent cursor-se-resize rounded-tl pointer-events-auto"
      />
    </div>
  );
}
