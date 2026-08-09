'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { LayoutDashboard } from 'lucide-react';
import { useEditorStore, getActiveScreens, getActiveDimensions } from '@/stores/editor-store';
import { GRID_SIZE, snapToGrid } from '@/lib/constants';
import { getLocation } from '@/lib/location';
import { useEditorSharedState } from '@/hooks/useEditorSharedState';
import { useTZClock } from '@/hooks/useTZClock';
import { useCanvasZoom } from '@/hooks/useCanvasZoom';
import { useCanvasBaseScale } from '@/hooks/useCanvasBaseScale';
import { useCanvasDragState } from '@/hooks/useCanvasDragState';
import { useActiveBackground } from '@/hooks/useActiveBackground';
import { useTranslate, type TranslateFn } from '@/i18n';
import type { ModuleInstance } from '@/types/config';
import { usePreviewData } from './usePreviewData';
import DraggableModule from './DraggableModule';
import { toEditorSource, type PreviewSettings } from '@/lib/module-props';
import CanvasToolbar from './CanvasToolbar';
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
  t,
}: {
  mod: ModuleInstance;
  scale: number;
  deltaX: number;
  deltaY: number;
  displayWidth: number;
  displayHeight: number;
  snap: boolean;
  t: TranslateFn;
}) {
  const rawX = mod.position.x + deltaX / scale;
  const rawY = mod.position.y + deltaY / scale;
  const clampedX = Math.max(0, Math.min(displayWidth - mod.size.w, rawX));
  const clampedY = Math.max(0, Math.min(displayHeight - mod.size.h, rawY));
  const snappedX = snap ? snapToGrid(clampedX) : Math.round(clampedX);
  const snappedY = snap ? snapToGrid(clampedY) : Math.round(clampedY);

  return (
    <div
      className="absolute border-2 border-hs-accent border-dashed rounded pointer-events-none"
      style={{
        left: snappedX * scale,
        top: snappedY * scale,
        width: mod.size.w * scale,
        height: mod.size.h * scale,
        zIndex: 9999,
        backgroundColor: 'var(--hs-accent-soft)',
      }}
      aria-label={t('canvas.ghostCoordinatesAriaLabel', { x: snappedX, y: snappedY })}
    >
      <div className="absolute -top-5 left-0 text-[10px] text-hs-accent-hover whitespace-nowrap font-mono">
        {snappedX}, {snappedY}
      </div>
    </div>
  );
}

export default function EditorCanvas({ onScaleChange, canvasRef }: { onScaleChange?: (scale: number) => void; canvasRef?: React.RefObject<HTMLDivElement | null> }) {
  const t = useTranslate('editor');
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerCanvasRef = useRef<HTMLDivElement>(null);
  const { config, selectedDisplayId, selectedScreenId, selectedModuleId, selectModule, resizeModule } = useEditorStore();
  const previewData = usePreviewData();

  // In multi-display mode, the canvas renders at the currently-selected
  // display's resolution so modules lay out against the actual target screen.
  const dims = config
    ? getActiveDimensions(config, selectedDisplayId)
    : { width: 1080, height: 1920 };
  const displayWidth = dims.width;
  const displayHeight = dims.height;

  const baseScale = useCanvasBaseScale(scrollRef, displayWidth, displayHeight);

  const { userZoom, effectiveScale, zoomIn, zoomOut, resetZoom } = useCanvasZoom(
    baseScale,
    scrollRef,
    innerCanvasRef,
  );

  const { setNodeRef } = useDroppable({ id: 'canvas-drop' });

  const { dragState, isDragging, scaleAtDragStartRef } = useCanvasDragState(effectiveScale);

  const now = useTZClock(config?.settings.timezone);

  // Notify parent of effective scale for drag calculations.
  // Skip during drags so the parent's ref keeps the drag-start scale.
  useEffect(() => {
    if (!isDragging) {
      onScaleChange?.(effectiveScale);
    }
  }, [effectiveScale, onScaleChange, isDragging]);

  // Stable identity while settings are untouched so the memoized module
  // previews don't re-render on unrelated canvas re-renders (polls, clock).
  const settings = config?.settings;
  const previewSettings: PreviewSettings | null = useMemo(() => {
    if (!settings) return null;
    const previewLocation = getLocation(settings);
    return {
      latitude: previewLocation?.lat,
      longitude: previewLocation?.lon,
      locationName: settings.locationName,
      timezone: settings.timezone,
      globalProvider: settings.weather.provider,
      units: settings.weather.units,
      fullscreenTheme: settings.fullscreenTheme,
    };
  }, [settings]);

  // One normalized source for every module preview, built with the same
  // adapter contract the display uses. Memoized because ModulePreview is
  // memoized: a fresh source object every render would defeat it and reset
  // module-internal state (video playback, animations) on each clock tick.
  const displaysForPicker = config?.displays;
  const previewSource = useMemo(
    () => toEditorSource(
      previewSettings,
      previewData,
      // TargetPicker footprint matters for sizing; empty here would hide the
      // picker behind isLegacyMode even when allowRetargeting is on.
      displaysForPicker?.map((d) => ({ id: d.id, name: d.name })) ?? [],
    ),
    [previewSettings, previewData, displaysForPicker],
  );
  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);

  // Live shared-state snapshot for the condition badges. Poll only while
  // something on this display is actually gated — the GET also arms the
  // display's fast re-reporting, so an idle editor shouldn't hold it open.
  const anyConditionGated = activeScreens.some((s) =>
    s.modules.some((m) => (m.visibility?.conditions?.length ?? 0) > 0),
  );
  const liveState = useEditorSharedState(selectedDisplayId, anyConditionGated);
  const verdictStates = liveState.states;

  // Poll the server-side background cache so the editor shows the same
  // rotating background that the display is using.
  const activeBackground = useActiveBackground(
    currentScreen?.id,
    currentScreen?.backgroundRotation?.enabled ?? false,
  );

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
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-hs-text-faint">
        <LayoutDashboard size={40} strokeWidth={1.5} className="opacity-30" />
        <p className="text-sm">{t('canvas.noScreenSelected')}</p>
      </div>
    );
  }

  const canvasW = displayWidth * effectiveScale;
  const canvasH = displayHeight * effectiveScale;

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden bg-hs-canvas">
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
          {/* Frame uses hardcoded dark colors to mimic the actual display appearance */}
          <div
            ref={(node) => {
              setNodeRef(node);
              innerCanvasRef.current = node;
              if (canvasRef) (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            }}
            data-testid="editor-canvas"
            className="relative bg-[#0f172a] ring-[6px] ring-[#1e293b] overflow-hidden shrink-0"
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
                  dataSource={previewSource}
                  now={now}
                  verdictStates={verdictStates}
                  source={liveState.source}
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
                    t={t}
                  />
                ) : null;
              })()}
            </PageBackgroundProvider>
          </div>
        </div>
      </div>

      <CanvasToolbar
        t={t}
        canUndo={canUndo}
        canRedo={canRedo}
        snapEnabled={snapEnabled}
        userZoom={userZoom}
        onUndo={() => useEditorStore.getState().undo()}
        onRedo={() => useEditorStore.getState().redo()}
        onToggleSnap={() => useEditorStore.getState().toggleSnap()}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
      />
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
