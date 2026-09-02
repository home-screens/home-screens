'use client';

import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { LayoutDashboard } from 'lucide-react';
import { useEditorStore, getActiveScreens, getActiveDimensions } from '@/stores/editor-store';
import {
  GRID_SIZE,
  MAX_PAGINATION_DOTS,
  PAGINATION_DOT_PX,
  PAGINATION_HIT_PX,
  PAGINATION_GAP_PX,
  PAGINATION_BOTTOM_PX,
  PAGINATION_COMPACT_W_PX,
} from '@/lib/constants';
import { resolveDragPosition, type AlignmentGuide } from '@/lib/alignment-guides';
import { getLocation } from '@/lib/location';
import { useEditorSharedState } from '@/hooks/useEditorSharedState';
import { useTZClock } from '@/hooks/useTZClock';
import { useCanvasZoom } from '@/hooks/useCanvasZoom';
import { useCanvasBaseScale, CANVAS_TOOLBAR_RESERVE_PX } from '@/hooks/useCanvasBaseScale';
import { useCanvasDragState } from '@/hooks/useCanvasDragState';
import { useActiveBackground } from '@/hooks/useActiveBackground';
import { useTranslate, type TranslateFn } from '@/i18n';
import type { ModuleInstance } from '@/types/config';
import { stackOrder } from '@/lib/module-utils';
import { isScreenEmpty, getDisplayProfiles, getActiveProfileId } from '@/lib/display-filter';
import { resolveProfileScreens } from '@/lib/schedule';
import { usePreviewData } from './usePreviewData';
import DraggableModule from './DraggableModule';
import ModuleContextMenu, { type ModuleMenuState } from './ModuleContextMenu';
import SelectionOverlay from './SelectionOverlay';
import { toEditorSource, type PreviewSettings } from '@/lib/module-props';
import { hasAnyCalendarSource } from '@/lib/calendar-sources';
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

/**
 * Where the display draws its pagination dots (geometry shared with
 * PaginationDots via lib/constants), so nobody parks a progress bar or a QR
 * code under them. Drawn in canvas pixels on the assumption that the kiosk
 * runs at the display's native resolution, above the modules because overlap
 * is the thing it exists to show. No label: it would take canvas room of its
 * own. The dot shapes carry a tooltip instead and are the only part that
 * takes the pointer.
 */
function DotsGuide({ screenCount, scale, t }: { screenCount: number; scale: number; t: TranslateFn }) {
  const compact = screenCount > MAX_PAGINATION_DOTS;
  const title = t('canvas.dotsGuide');
  return (
    <div
      data-testid="dots-guide"
      className="absolute inset-x-0 flex items-center justify-center pointer-events-none"
      style={{ bottom: PAGINATION_BOTTOM_PX * scale, height: PAGINATION_HIT_PX * scale, gap: PAGINATION_GAP_PX * scale, zIndex: 9990 }}
      aria-hidden
    >
      {compact ? (
        <span
          className="pointer-events-auto rounded-full border border-dashed border-white/30"
          style={{ width: PAGINATION_COMPACT_W_PX * scale, height: PAGINATION_HIT_PX * scale }}
          title={title}
        />
      ) : (
        Array.from({ length: screenCount }, (_, i) => (
          <span
            key={i}
            className="flex items-center justify-center"
            style={{ width: PAGINATION_HIT_PX * scale, height: PAGINATION_HIT_PX * scale }}
          >
            <span
              className="pointer-events-auto rounded-full border border-white/40 bg-white/15"
              style={{ width: PAGINATION_DOT_PX * scale, height: PAGINATION_DOT_PX * scale }}
              title={title}
            />
          </span>
        ))
      )}
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
  x,
  y,
  guides,
  t,
}: {
  mod: ModuleInstance;
  scale: number;
  x: number;
  y: number;
  guides: AlignmentGuide[];
  t: TranslateFn;
}) {
  return (
    <>
      {/* Alignment guides: a line across the canvas for each neighbour edge
          or center the ghost is currently snapped to. */}
      {guides.map((g) => (
        <div
          key={`${g.axis}-${g.value}`}
          className="absolute pointer-events-none bg-pink-500"
          style={
            g.axis === 'x'
              ? { left: g.value * scale - 0.5, top: 0, width: 1, height: '100%', zIndex: 9998 }
              : { top: g.value * scale - 0.5, left: 0, height: 1, width: '100%', zIndex: 9998 }
          }
        />
      ))}
      <div
        className="absolute border-2 border-hs-accent border-dashed rounded pointer-events-none"
        style={{
          left: x * scale,
          top: y * scale,
          width: mod.size.w * scale,
          height: mod.size.h * scale,
          zIndex: 9999,
          backgroundColor: 'var(--hs-accent-soft)',
        }}
        aria-label={t('canvas.ghostCoordinatesAriaLabel', { x, y })}
      >
        <div className="absolute -top-5 left-0 text-[10px] text-hs-accent-hover whitespace-nowrap font-mono">
          {x}, {y}
        </div>
      </div>
    </>
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
      calendarConfigured: hasAnyCalendarSource(settings.calendar),
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
  const activeScreens = useMemo(
    () => (config ? getActiveScreens(config, selectedDisplayId) : []),
    [config, selectedDisplayId],
  );
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

  // Module right-click menu. Closed whenever the screen changes underneath it.
  const [moduleMenu, setModuleMenu] = useState<ModuleMenuState | null>(null);
  useEffect(() => { setModuleMenu(null); }, [selectedScreenId, selectedDisplayId]);

  // The display only draws pagination dots when more than one screen rotates,
  // and what rotates is the active profile's slice of the enabled screens —
  // the same resolution the kiosk runs (schedule windows aside).
  const rotatingScreenCount = useMemo(() => {
    if (!config) return 0;
    const enabled = activeScreens.filter((s) => s.enabled !== false);
    const display = selectedDisplayId ? config.displays?.find((d) => d.id === selectedDisplayId) : undefined;
    const profiles = display ? getDisplayProfiles(display, config.profiles) : config.profiles;
    return resolveProfileScreens(enabled, profiles, getActiveProfileId(config, selectedDisplayId), now).length;
  }, [config, activeScreens, selectedDisplayId, now]);

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

  const toCanvasPoint = (e: React.MouseEvent) => {
    const rect = innerCanvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: (e.clientX - rect.left) / effectiveScale, y: (e.clientY - rect.top) / effectiveScale };
  };

  // A plain click selects what was clicked, and clicking a selected module
  // again keeps it selected. DOM hit-testing only ever reaches the topmost
  // module, which would make anything behind a covering module (worst case:
  // a fillsCanvas module) unreachable, so Alt/Option+click resolves the
  // click geometrically and cycles through everything under the cursor,
  // wrapping around; the right-click menu's "select behind" is the same
  // thing for people who never learn the modifier. A drag's trailing click
  // keeps the dragged module selected.
  const handleModuleClick = (clickedId: string, e: React.MouseEvent, movedSinceDown: boolean) => {
    const point = !movedSinceDown && e.altKey && currentScreen ? toCanvasPoint(e) : null;
    if (!point) {
      selectModule(clickedId);
      return;
    }
    const { x, y } = point;
    const hits = stackOrder(currentScreen!.modules)
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

  const handleModuleContextMenu = (moduleId: string, e: React.MouseEvent) => {
    const point = toCanvasPoint(e);
    if (!point) return;
    selectModule(moduleId);
    setModuleMenu({ moduleId, x: e.clientX, y: e.clientY, canvasX: point.x, canvasY: point.y });
  };

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden bg-hs-canvas">
      {/* Scrollable canvas area. A click anywhere in it that no module
          claimed — the grey workspace around the frame as much as an empty
          patch inside it — clears the selection, so the screen settings are
          never more than one click away. */}
      <div
        ref={scrollRef}
        data-testid="editor-workspace"
        className="flex-1"
        style={{ overflow: isDragging && userZoom <= 1 ? 'hidden' : 'auto', scrollbarGutter: 'stable' }}
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
        {/* Spacer: centers canvas when it fits, expands when zoomed in.
            width: max-content is what makes the expansion symmetric: a block's
            width never grows to fit content (its height does), so an oversized
            canvas used to overflow the spacer leftward under justify-center —
            negative-direction overflow the scroll container can't reach,
            hiding the canvas's left edge at scrollLeft 0. The extra bottom
            padding keeps the frame's bottom edge clear of the floating
            toolbar (matched by useCanvasBaseScale's reserve). */}
        <div
          className="flex items-center justify-center"
          style={{ width: 'max-content', minWidth: '100%', minHeight: '100%', padding: 16, paddingBottom: 16 + CANVAS_TOOLBAR_RESERVE_PX }}
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
                  onContextMenu={(e) => handleModuleContextMenu(mod.id, e)}
                  dataSource={previewSource}
                  now={now}
                  verdictStates={verdictStates}
                  source={liveState.source}
                />
              ))}
              {rotatingScreenCount > 1 && (
                <DotsGuide screenCount={rotatingScreenCount} scale={effectiveScale} t={t} />
              )}
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
                if (!mod) return null;
                const dragScale = scaleAtDragStartRef.current;
                // Same resolver the drop handler uses, so the ghost previews
                // exactly where the module will land (incl. alignment snap).
                const { x, y, guides } = resolveDragPosition(
                  mod.size,
                  mod.position.x + dragState.deltaX / dragScale,
                  mod.position.y + dragState.deltaY / dragScale,
                  currentScreen.modules.filter((m) => m.id !== mod.id),
                  { width: displayWidth, height: displayHeight },
                  snapEnabled,
                );
                return (
                  <DragGhost
                    mod={mod}
                    scale={dragScale}
                    x={x}
                    y={y}
                    guides={guides}
                    t={t}
                  />
                );
              })()}
            </PageBackgroundProvider>
          </div>
        </div>
      </div>

      {moduleMenu && selectedScreenId && (
        <ModuleContextMenu
          menu={moduleMenu}
          screenId={selectedScreenId}
          modules={currentScreen.modules}
          onClose={() => setModuleMenu(null)}
        />
      )}

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
  // A missing file falls back to the solid color, the same as on the wall;
  // the screen settings panel is where the missing path is reported.
  const [broken, setBroken] = useState<string | null>(null);
  if (!bg || broken === bg) return null;
  return (
    <img
      src={bg}
      alt=""
      onError={() => setBroken(bg)}
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}
