'use client';

import { useRef, useState, useEffect } from 'react';
import { useDroppable, useDndMonitor } from '@dnd-kit/core';
import { Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Grid3x3 } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT, GRID_SIZE, snapToGrid } from '@/lib/constants';
import { useTZClock } from '@/hooks/useTZClock';
import { useCanvasZoom } from '@/hooks/useCanvasZoom';
import type { ModuleInstance } from '@/types/config';
import { usePreviewData } from './usePreviewData';
import DraggableModule from './DraggableModule';
import type { PreviewSettings } from './DraggableModule';
import { PageBackgroundProvider, usePageBackground } from '@/contexts/PageBackgroundContext';

function GridOverlay({ scale }: { scale: number }) {
  const scaledGrid = GRID_SIZE * scale;
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
  snap,
}: {
  mod: ModuleInstance;
  scale: number;
  deltaX: number;
  deltaY: number;
  displayWidth: number;
  displayHeight: number;
  snap: boolean;
}) {
  const rawX = mod.position.x + deltaX / scale;
  const rawY = mod.position.y + deltaY / scale;
  const clampedX = Math.max(0, Math.min(displayWidth - mod.size.w, rawX));
  const clampedY = Math.max(0, Math.min(displayHeight - mod.size.h, rawY));
  const snappedX = snap ? snapToGrid(clampedX) : Math.round(clampedX);
  const snappedY = snap ? snapToGrid(clampedY) : Math.round(clampedY);

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerCanvasRef = useRef<HTMLDivElement>(null);
  const [baseScale, setBaseScale] = useState(0.4);
  const { config, selectedScreenId, selectedModuleId, selectModule, resizeModule } = useEditorStore();
  const previewData = usePreviewData();
  const [dragState, setDragState] = useState<{
    moduleId: string;
    deltaX: number;
    deltaY: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const scaleAtDragStartRef = useRef(0);

  const displayWidth = config?.settings.displayWidth || DEFAULT_DISPLAY_WIDTH;
  const displayHeight = config?.settings.displayHeight || DEFAULT_DISPLAY_HEIGHT;

  const { userZoom, effectiveScale, zoomIn, zoomOut, resetZoom } = useCanvasZoom(
    baseScale,
    scrollRef,
    innerCanvasRef,
  );

  const { setNodeRef } = useDroppable({ id: 'canvas-drop' });

  // Track dnd-kit drag state — freeze scale at drag start for consistent coordinates
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

  const now = useTZClock(config?.settings.timezone);

  // Notify parent of effective scale for drag calculations.
  // Skip during drags so the parent's ref keeps the drag-start scale.
  useEffect(() => {
    if (!isDragging) {
      onScaleChange?.(effectiveScale);
    }
  }, [effectiveScale, onScaleChange, isDragging]);

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
      } catch (err) {
        console.debug('Failed to fetch active background:', err);
      }
    }

    fetchActive();
    const id = setInterval(fetchActive, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when screen ID or rotation toggle changes
  }, [currentScreen?.id, currentScreen?.backgroundRotation?.enabled]);

  // Compute base scale from container size via ResizeObserver
  useEffect(() => {
    const updateScale = () => {
      if (!scrollRef.current) return;
      const { clientWidth, clientHeight } = scrollRef.current;
      const scaleX = (clientWidth - 32) / displayWidth;
      const scaleY = (clientHeight - 32) / displayHeight;
      const newBase = Math.min(scaleX, scaleY, 1);
      setBaseScale(newBase);
    };
    updateScale();
    const el = scrollRef.current;
    const ro = new ResizeObserver(updateScale);
    if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [displayWidth, displayHeight]);

  // Reset zoom when switching screens
  const prevScreenId = useRef(selectedScreenId);
  useEffect(() => {
    if (selectedScreenId !== prevScreenId.current) {
      prevScreenId.current = selectedScreenId;
      resetZoom();
    }
  }, [selectedScreenId, resetZoom]);

  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const canUndo = useEditorStore((s) => s._past.length > 0);
  const canRedo = useEditorStore((s) => s._future.length > 0);

  if (!currentScreen) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500">
        No screen selected
      </div>
    );
  }

  const canvasW = displayWidth * effectiveScale;
  const canvasH = displayHeight * effectiveScale;

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden bg-neutral-950">
      {/* Scrollable canvas area */}
      <div
        ref={scrollRef}
        className="flex-1"
        style={{ overflow: isDragging && userZoom <= 1 ? 'hidden' : 'auto', scrollbarGutter: 'stable' }}
      >
        {/* Spacer: centers canvas when it fits, expands when zoomed in */}
        <div
          className="flex items-center justify-center"
          style={{ minWidth: '100%', minHeight: '100%', padding: 16 }}
        >
          <div
            ref={(node) => {
              setNodeRef(node);
              innerCanvasRef.current = node;
              if (canvasRef) (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            }}
            className="relative bg-neutral-900 border border-neutral-700 overflow-hidden shrink-0"
            style={{
              width: canvasW,
              height: canvasH,
              borderRadius: 8,
            }}
            onClick={() => selectModule(null)}
          >
            <PageBackgroundProvider>
              <CanvasBackground
                screenBackground={activeBackground || currentScreen.backgroundImage}
              />
              {snapEnabled && <GridOverlay scale={effectiveScale} />}
              {currentScreen.modules.map((mod) => (
                <DraggableModule
                  key={mod.id}
                  mod={mod}
                  scale={effectiveScale}
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
                    scale={scaleAtDragStartRef.current}
                    deltaX={dragState.deltaX}
                    deltaY={dragState.deltaY}
                    displayWidth={displayWidth}
                    displayHeight={displayHeight}
                    snap={snapEnabled}
                  />
                ) : null;
              })()}
            </PageBackgroundProvider>
          </div>
        </div>
      </div>

      {/* Floating toolbar: undo/redo + zoom controls */}
      <div className="absolute bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-neutral-700 bg-neutral-900/90 px-1 py-0.5 backdrop-blur-sm">
        {/* Undo / Redo */}
        <button
          onClick={() => useEditorStore.getState().undo()}
          disabled={!canUndo}
          className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          title="Undo (Cmd+Z)"
          aria-label="Undo"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => useEditorStore.getState().redo()}
          disabled={!canRedo}
          className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          title="Redo (Cmd+Shift+Z)"
          aria-label="Redo"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>

        <div className="mx-0.5 h-4 w-px bg-neutral-700" />

        {/* Snap toggle */}
        <button
          onClick={() => useEditorStore.getState().toggleSnap()}
          className={`rounded p-1.5 transition-colors ${
            snapEnabled
              ? 'text-blue-400 hover:bg-neutral-800 hover:text-blue-300'
              : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
          }`}
          title={snapEnabled ? 'Snap to grid (on)' : 'Snap to grid (off)'}
          aria-label={snapEnabled ? 'Snap to grid (on)' : 'Snap to grid (off)'}
          aria-pressed={snapEnabled}
        >
          <Grid3x3 className="h-3.5 w-3.5" />
        </button>

        <div className="mx-0.5 h-4 w-px bg-neutral-700" />

        {/* Zoom controls */}
        <button
          onClick={zoomOut}
          disabled={userZoom <= 0.25}
          className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          title="Zoom out (Cmd+-)"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[3.25rem] select-none text-center text-xs tabular-nums text-neutral-400">
          {Math.round(userZoom * 100)}%
        </span>
        <button
          onClick={zoomIn}
          disabled={userZoom >= 3.0}
          className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          title="Zoom in (Cmd+=)"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>

        {userZoom !== 1.0 && (
          <>
            <div className="mx-0.5 h-4 w-px bg-neutral-700" />
            <button
              onClick={resetZoom}
              className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
              title="Fit to screen (Cmd+0)"
              aria-label="Fit to screen"
            >
              <Maximize className="h-3.5 w-3.5" />
            </button>
          </>
        )}
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
