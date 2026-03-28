'use client';

import { useRef, useState, useEffect } from 'react';
import { useDroppable, useDndMonitor } from '@dnd-kit/core';
import { Undo2, Redo2 } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT, GRID_SIZE, snapToGrid } from '@/lib/constants';
import { useTZClock } from '@/hooks/useTZClock';
import type { ModuleInstance } from '@/types/config';
import { usePreviewData } from './usePreviewData';
import DraggableModule from './DraggableModule';
import type { PreviewSettings } from './DraggableModule';
import { PageBackgroundProvider, usePageBackground } from '@/contexts/PageBackgroundContext';

function GridOverlay({ scale }: { scale: number }) {
  const scaledGrid = GRID_SIZE * scale;
  // Only show grid if cells are large enough to be visible
  if (scaledGrid < 6) return null;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <defs>
        <pattern
          id="editor-grid"
          width={scaledGrid}
          height={scaledGrid}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={scaledGrid} cy={scaledGrid} r={0.5} fill="rgba(255,255,255,0.45)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#editor-grid)" />
    </svg>
  );
}

function DragGhost({
  mod,
  scale,
  deltaX,
  deltaY,
  displayWidth,
  displayHeight,
}: {
  mod: ModuleInstance;
  scale: number;
  deltaX: number;
  deltaY: number;
  displayWidth: number;
  displayHeight: number;
}) {
  const rawX = mod.position.x + deltaX / scale;
  const rawY = mod.position.y + deltaY / scale;
  const snappedX = snapToGrid(Math.max(0, Math.min(displayWidth - mod.size.w, rawX)));
  const snappedY = snapToGrid(Math.max(0, Math.min(displayHeight - mod.size.h, rawY)));

  return (
    <div
      className="absolute border-2 border-blue-400 border-dashed rounded pointer-events-none"
      style={{
        left: snappedX * scale,
        top: snappedY * scale,
        width: mod.size.w * scale,
        height: mod.size.h * scale,
        zIndex: 9999,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
      }}
    >
      <div className="absolute -top-5 left-0 text-[10px] text-blue-400 whitespace-nowrap font-mono">
        {snappedX}, {snappedY}
      </div>
    </div>
  );
}

export default function EditorCanvas({ onScaleChange, canvasRef }: { onScaleChange?: (scale: number) => void; canvasRef?: React.RefObject<HTMLDivElement | null> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const { config, selectedScreenId, selectedModuleId, selectModule, resizeModule } = useEditorStore();
  const previewData = usePreviewData();
  const [dragState, setDragState] = useState<{
    moduleId: string;
    deltaX: number;
    deltaY: number;
  } | null>(null);

  const { setNodeRef } = useDroppable({ id: 'canvas-drop' });

  useDndMonitor({
    onDragStart(event) {
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
    },
    onDragCancel() {
      setDragState(null);
    },
  });

  const now = useTZClock(config?.settings.timezone);

  const displayWidth = config?.settings.displayWidth || DEFAULT_DISPLAY_WIDTH;
  const displayHeight = config?.settings.displayHeight || DEFAULT_DISPLAY_HEIGHT;

  const previewSettings: PreviewSettings | null = config ? {
    latitude: config.settings.latitude ?? config.settings.weather.latitude,
    longitude: config.settings.longitude ?? config.settings.weather.longitude,
    timezone: config.settings.timezone,
    globalProvider: config.settings.weather.provider,
    units: config.settings.weather.units,
  } : null;
  const currentScreen = config?.screens.find((s) => s.id === selectedScreenId);
  // Poll the server-side background cache so the editor shows the same
  // rotating background that the display is using.
  const [activeBackground, setActiveBackground] = useState<string | null>(null);

  useEffect(() => {
    if (!currentScreen?.backgroundRotation?.enabled) {
      setActiveBackground(null);
      return;
    }

    async function fetchActive() {
      try {
        const res = await fetch(`/api/backgrounds/rotate?screenId=${encodeURIComponent(currentScreen!.id)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.path) setActiveBackground(data.path);
        }
      } catch {
        // ignore
      }
    }

    fetchActive();
    const id = setInterval(fetchActive, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when screen ID or rotation toggle changes
  }, [currentScreen?.id, currentScreen?.backgroundRotation?.enabled]);

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      const scaleX = (clientWidth - 32) / displayWidth;
      const scaleY = (clientHeight - 32) / displayHeight;
      const newScale = Math.min(scaleX, scaleY, 1);
      setScale(newScale);
      setContainerSize({ w: clientWidth, h: clientHeight });
      onScaleChange?.(newScale);
    };
    updateScale();
    const el = containerRef.current;
    const ro = new ResizeObserver(updateScale);
    if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [displayWidth, displayHeight, onScaleChange]);

  const canUndo = useEditorStore((s) => s._past.length > 0);
  const canRedo = useEditorStore((s) => s._future.length > 0);

  // Position the undo/redo box: below canvas, to its left, or overlaid on the canvas bottom-left
  const scaledH = displayHeight * scale;
  const scaledW = displayWidth * scale;
  const bottomGap = (containerSize.h - scaledH) / 2;
  const canvasLeftEdge = (containerSize.w - scaledW) / 2;
  const canvasBottomEdge = (containerSize.h + scaledH) / 2;
  const boxWidth = 80; // approximate width of the undo/redo box
  let undoBoxStyle: React.CSSProperties;
  if (bottomGap >= 48) {
    // Room below: center under the canvas
    undoBoxStyle = { left: '50%', bottom: 12, transform: 'translateX(-50%)' };
  } else if (canvasLeftEdge > boxWidth + 16) {
    // Room to the left: anchor to canvas left edge, aligned to bottom
    undoBoxStyle = { left: canvasLeftEdge - 8, top: canvasBottomEdge - 44, transform: 'translateX(-100%)' };
  } else {
    // No room outside: overlay on the canvas bottom-left corner
    undoBoxStyle = { left: canvasLeftEdge + 8, top: canvasBottomEdge - 44 };
  }

  if (!currentScreen) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500">
        No screen selected
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex-1 flex items-center justify-center bg-neutral-950 overflow-hidden p-4">
      <div
        ref={(node) => { setNodeRef(node); if (canvasRef) (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = node; }}
        className="relative bg-neutral-900 border border-neutral-700 overflow-hidden"
        style={{
          width: displayWidth * scale,
          height: displayHeight * scale,
          borderRadius: 8,
        }}
        onClick={() => selectModule(null)}
      >
        <PageBackgroundProvider>
          <CanvasBackground
            screenBackground={activeBackground || currentScreen.backgroundImage}
          />
          <GridOverlay scale={scale} />
          {currentScreen.modules.map((mod) => (
            <DraggableModule
              key={mod.id}
              mod={mod}
              scale={scale}
              isSelected={mod.id === selectedModuleId}
              onSelect={() => selectModule(mod.id)}
              onResize={(size) => resizeModule(selectedScreenId!, mod.id, size)}
              previewData={previewData}
              settings={previewSettings}
              now={now}
            />
          ))}
          {dragState && (() => {
            const mod = currentScreen.modules.find((m) => m.id === dragState.moduleId);
            return mod ? (
              <DragGhost
                mod={mod}
                scale={scale}
                deltaX={dragState.deltaX}
                deltaY={dragState.deltaY}
                displayWidth={displayWidth}
                displayHeight={displayHeight}
              />
            ) : null;
          })()}
        </PageBackgroundProvider>
      </div>
      {/* Undo / Redo controls */}
      <div
        className="absolute z-50 flex items-center gap-0.5 rounded-lg border border-neutral-700 bg-neutral-900/90 px-1 py-0.5 backdrop-blur-sm"
        style={undoBoxStyle}
      >
        <button
          onClick={() => useEditorStore.getState().undo()}
          disabled={!canUndo}
          className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          title="Undo (Cmd+Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <div className="h-4 w-px bg-neutral-700" />
        <button
          onClick={() => useEditorStore.getState().redo()}
          disabled={!canRedo}
          className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          title="Redo (Cmd+Shift+Z)"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Reads the PageBackgroundContext override and renders the appropriate background */
function CanvasBackground({ screenBackground }: { screenBackground: string | undefined }) {
  const { overrideBackground } = usePageBackground();
  const bg = overrideBackground || screenBackground;
  if (!bg) return null;
  return (
    <img
      src={bg}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}
