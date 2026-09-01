'use client';

import { useRef, useEffect, useMemo, useCallback } from 'react';
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
import { stackOrder } from '@/lib/module-utils';
import { isScreenEmpty } from '@/lib/display-filter';
import { usePreviewData } from './usePreviewData';
import DraggableModule from './DraggableModule';
import SelectionOverlay from './SelectionOverlay';
import { toEditorSource, type PreviewSettings } from '@/lib/module-props';
import CanvasToolbar from './CanvasToolbar';
import StartFromTemplateButton from './StartFromTemplateButton';
import { PageBackgroundProvider, usePageBackground } from '@/contexts/PageBackgroundContext';

/**
 * What an empty screen shows inside the display frame. The first editor visit
 * on a fresh install is exactly this: a dark rectangle with no hint that the
 * list on the left is draggable or that the rectangle is the TV. Sized in
 * canvas pixels and scaled with the frame so it reads the same at any zoom.
 * Text is click-through (the canvas click still clears the selection); only
 * the button takes the pointer.
 */
function EmptyScreenPlaceholder({ scale, screenId, t }: { scale: number; screenId: string; t: TranslateFn }) {
  return (
    <div
      data-testid="empty-screen-placeholder"
      className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none"
      style={{ padding: 80 * scale, gap: 18 * scale }}
    >
      <LayoutDashboard style={{ width: 96 * scale, height: 96 * scale }} strokeWidth={1.25} className="text-white/25" />
      <p className="text-white/80 font-medium" style={{ fontSize: 44 * scale }}>{t('canvas.emptyScreen.title')}</p>
      <p className="text-white/50" style={{ fontSize: 30 * scale, maxWidth: 760 * scale, lineHeight: 1.4 }}>
        {t('canvas.emptyScreen.body')}
      </p>
      <div className="pointer-events-auto" style={{ marginTop: 10 * scale }}>
        <StartFromTemplateButton
          replaceEmptyScreenId={screenId}
          label={t('canvas.emptyScreen.chooseTemplate')}
          className="inline-flex items-center gap-1.5"
        />
      </div>
    </div>
  );
}

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
      timeFormat: settings.timeFormat,
      calendarPeople: settings.calendar?.people,
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

  // Every finished resize drag is followed by a click: on the handle when
  // released there, or on the canvas div itself when released anywhere else
  // (the click targets the nearest common ancestor of the mousedown and
  // mouseup targets). Either way it bubbles here and would read as a
  // background click, dropping the selection the user just finished
  // resizing. Swallow exactly that one click; the next mousedown clears a
  // stale swallow (a resize that ended without a trailing click, e.g.
  // released outside the window) so it can never eat a later click.
  const swallowNextCanvasClickRef = useRef(false);
  const handleResizeEnd = useCallback(() => {
    swallowNextCanvasClickRef.current = true;
  }, []);

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

  // Click-through selection. DOM hit-testing only ever reaches the topmost
  // module, which would make anything sent behind a covering module (worst
  // case: a fillsCanvas module) permanently unselectable. Instead, resolve
  // the click geometrically: first click selects the topmost module under
  // the cursor; clicking again in the same spot cycles to the next one
  // beneath it, wrapping around. A drag's trailing click keeps the dragged
  // module selected instead of cycling away from it.
  const handleModuleClick = (clickedId: string, e: React.MouseEvent, movedSinceDown: boolean) => {
    const canvasEl = innerCanvasRef.current;
    if (movedSinceDown || !canvasEl || !currentScreen) {
      selectModule(clickedId);
      return;
    }
    const rect = canvasEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / effectiveScale;
    const y = (e.clientY - rect.top) / effectiveScale;
    const hits = stackOrder(currentScreen.modules)
      .filter((m) =>
        x >= m.position.x && x <= m.position.x + m.size.w &&
        y >= m.position.y && y <= m.position.y + m.size.h,
      )
      .reverse(); // topmost first
    if (hits.length === 0) {
      selectModule(clickedId);
      return;
    }
    const idx = hits.findIndex((m) => m.id === selectedModuleId);
    selectModule(idx === -1 ? hits[0].id : hits[(idx + 1) % hits.length].id);
  };

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden bg-hs-canvas">
      {/* Scrollable canvas area */}
      <div
        ref={scrollRef}
        className="flex-1"
        style={{ overflow: isDragging && userZoom <= 1 ? 'hidden' : 'auto', scrollbarGutter: 'stable' }}
      >
        {/* Spacer: centers canvas when it fits, expands when zoomed in.
            width: max-content is what makes the expansion symmetric: a block's
            width never grows to fit content (its height does), so an oversized
            canvas used to overflow the spacer leftward under justify-center —
            negative-direction overflow the scroll container can't reach,
            hiding the canvas's left edge at scrollLeft 0. */}
        <div
          className="flex items-center justify-center"
          style={{ width: 'max-content', minWidth: '100%', minHeight: '100%', padding: 16 }}
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
              // Contain module zIndexes (incl. the selected-module lift) so
              // they can't compete with editor chrome outside the canvas.
              isolation: 'isolate',
            }}
            onMouseDownCapture={() => {
              swallowNextCanvasClickRef.current = false;
            }}
            onClick={() => {
              if (swallowNextCanvasClickRef.current) {
                swallowNextCanvasClickRef.current = false;
                return;
              }
              selectModule(null);
            }}
          >
            <PageBackgroundProvider>
              <CanvasBackground
                screenBackground={activeBackground || currentScreen.backgroundImage}
              />
              {snapEnabled && <GridOverlay scale={effectiveScale} />}
              {isScreenEmpty(currentScreen) && (
                <EmptyScreenPlaceholder scale={effectiveScale} screenId={currentScreen.id} t={t} />
              )}
              {currentScreen.modules.map((mod) => (
                <DraggableModule
                  key={mod.id}
                  mod={mod}
                  scale={effectiveScale}
                  onSelect={(e, movedSinceDown) => handleModuleClick(mod.id, e, movedSinceDown)}
                  dataSource={previewSource}
                  now={now}
                  verdictStates={verdictStates}
                  source={liveState.source}
                />
              ))}
              {(() => {
                const sel = currentScreen.modules.find((m) => m.id === selectedModuleId);
                return sel ? (
                  <SelectionOverlay
                    mod={sel}
                    scale={effectiveScale}
                    displayWidth={displayWidth}
                    displayHeight={displayHeight}
                    onResize={(size) => resizeModule(selectedScreenId!, sel.id, size)}
                    onResizeEnd={handleResizeEnd}
                  />
                ) : null;
              })()}
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
