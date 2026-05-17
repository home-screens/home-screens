'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Check, AlertCircle } from 'lucide-react';
import { useEditorStore, getActiveScreens, getActiveDimensions } from '@/stores/editor-store';
import { usePluginStore } from '@/stores/plugin-store';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useUndoRedoShortcuts } from '@/hooks/useUndoRedoShortcuts';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT, snapToGrid } from '@/lib/constants';
import { getModuleDefinition } from '@/lib/module-registry';
import type { ModuleType } from '@/types/config';

import ScreenTabs from '@/components/editor/ScreenTabs';
import DisplaySwitcher from '@/components/editor/DisplaySwitcher';
import ModulePalette from '@/components/editor/ModulePalette';
import EditorCanvas from '@/components/editor/EditorCanvas';
import PropertyPanel from '@/components/editor/PropertyPanel';
import HomeScreensLogo from '@/components/brand/HomeScreensLogo';
import PluginStorePanel from '@/components/editor/PluginStorePanel';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

const MIN_EDITOR_WIDTH = 768;

export default function EditorPage() {
  const t = useTranslate('editor');
  const {
    config,
    selectedDisplayId,
    selectedScreenId,
    loadConfig,
    addModule,
    moveModule,
  } = useEditorStore();

  const { isDirty, isSaving, saveError, saveConfig } = useAutoSave();
  useUndoRedoShortcuts();

  const [activePaletteType, setActivePaletteType] = useState<string | null>(null);
  const [showPluginStore, setShowPluginStore] = useState(false);
  const [tooNarrow, setTooNarrow] = useState(false);

  useEffect(() => {
    function check() { setTooNarrow(window.innerWidth < MIN_EDITOR_WIDTH); }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const router = useRouter();
  const canvasScaleRef = useRef(0.4);
  const canvasElRef = useRef<HTMLDivElement | null>(null);
  // dnd-kit's event.delta on a DragEndEvent is the translate applied to the
  // active node (including scroll-offset compensation), NOT the raw pointer
  // delta. Adding it to activatorEvent.clientXY yields the wrong drop point
  // whenever a scrollable ancestor (e.g., the palette's own scroller, or any
  // layout-shift compensation dnd-kit performs) changes scroll during the
  // drag. So we track the live pointer ourselves while the drag is active.
  const livePointerRef = useRef<{ x: number; y: number } | null>(null);
  const handleScaleChange = useCallback((s: number) => { canvasScaleRef.current = s; }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const pluginLoading = usePluginStore((s) => s.loading);
  const loadPlugins = usePluginStore((s) => s.loadPlugins);

  useEffect(() => {
    // Zustand is a module-level singleton, so if the user is navigating
    // here from /editor/settings the config is already in memory. Skip
    // loadConfig in that case to preserve the undo/redo history (which
    // would otherwise get reset to []), and also to avoid a needless
    // /api/config fetch on every display switch from the Displays tab.
    if (!useEditorStore.getState().config) loadConfig();
    loadPlugins();
  }, [loadConfig, loadPlugins]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.source === 'palette') {
      setActivePaletteType(data.moduleType as string);
    }
  }, []);

  useEffect(() => {
    // Always-on pointer tracker. Cheap (one ref write per move) and avoids
    // the install/remove dance that would otherwise have to thread through
    // every drag-cancel / drag-end / unmount path. Pointer position is only
    // read inside drag handlers, so the ref outside a drag is harmless.
    function track(e: PointerEvent) {
      livePointerRef.current = { x: e.clientX, y: e.clientY };
    }
    document.addEventListener('pointermove', track, { passive: true });
    return () => document.removeEventListener('pointermove', track);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActivePaletteType(null);
      const { active, over, delta, activatorEvent } = event;
      if (!selectedScreenId || !over) return;

      const data = active.data.current;
      const snap = useEditorStore.getState().snapEnabled;
      const align = snap ? snapToGrid : Math.round;

      // Canvas dimensions match the currently-selected display.
      const dims = config
        ? getActiveDimensions(config, selectedDisplayId)
        : { width: DEFAULT_DISPLAY_WIDTH, height: DEFAULT_DISPLAY_HEIGHT };
      const displayW = dims.width;
      const displayH = dims.height;

      if (data?.source === 'palette' && over.id === 'canvas-drop') {
        const scale = canvasScaleRef.current;
        const moduleType = data.moduleType as ModuleType;
        // Resolve through the registry so plugin-registered modules use their
        // own declared `defaultSize` instead of falling through to the generic
        // 200×200 guard. The fallback only kicks in for truly unregistered
        // types (e.g. a stale palette entry).
        const defaultSize = getModuleDefinition(moduleType)?.defaultSize ?? { w: 200, h: 200 };
        // dnd-kit's event.delta is the translate applied to the active node
        // (with scroll-offset compensation baked in), not the raw pointer
        // delta — using it for drop position breaks whenever a scrollable
        // ancestor of the palette item changes scroll during the drag. We
        // track the real pointer in livePointerRef and fall back to the
        // activator + delta heuristic only if the pointer was never tracked
        // (e.g., keyboard-driven drag).
        const ae = activatorEvent as PointerEvent | undefined;
        const fallbackX = (ae?.clientX ?? 0) + delta.x;
        const fallbackY = (ae?.clientY ?? 0) + delta.y;
        const pointerX = livePointerRef.current?.x ?? fallbackX;
        const pointerY = livePointerRef.current?.y ?? fallbackY;
        // Use a live DOM rect instead of over.rect, which can be stale after
        // window resize (dnd-kit caches droppable rects with optimized frequency)
        const canvasRect = canvasElRef.current?.getBoundingClientRect() ?? over.rect;
        const rawX = (pointerX - canvasRect.left) / scale - defaultSize.w / 2;
        const rawY = (pointerY - canvasRect.top) / scale - defaultSize.h / 2;
        const dropX = align(Math.max(0, Math.min(displayW - defaultSize.w, rawX)));
        const dropY = align(Math.max(0, Math.min(displayH - defaultSize.h, rawY)));
        addModule(selectedScreenId, data.moduleType as ModuleType, { x: dropX, y: dropY });
      } else if (data?.source === 'canvas') {
        const moduleId = data.moduleId as string;
        const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
        const screen = activeScreens.find((s) => s.id === selectedScreenId);
        const mod = screen?.modules.find((m) => m.id === moduleId);
        if (!mod) return;

        const scale = canvasScaleRef.current;
        // Same dnd-kit `delta` caveat as the palette branch: derive the true
        // pointer delta from (livePointer - activator) so any scrollable
        // ancestor scrolling during the drag doesn't poison the result.
        const ae = activatorEvent as PointerEvent | undefined;
        const movedX = livePointerRef.current && ae
          ? livePointerRef.current.x - ae.clientX
          : delta.x;
        const movedY = livePointerRef.current && ae
          ? livePointerRef.current.y - ae.clientY
          : delta.y;
        const rawX = mod.position.x + movedX / scale;
        const rawY = mod.position.y + movedY / scale;
        const newX = align(Math.max(0, Math.min(displayW - mod.size.w, rawX)));
        const newY = align(Math.max(0, Math.min(displayH - mod.size.h, rawY)));
        moveModule(selectedScreenId, moduleId, { x: newX, y: newY });
      }
    },
    [selectedScreenId, selectedDisplayId, config, addModule, moveModule],
  );

  if (!config || pluginLoading) {
    return (
      <div className="h-screen flex items-center justify-center text-hs-text-faint">
        {t('page.loading')}
      </div>
    );
  }

  if (tooNarrow) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 px-6 text-center bg-hs-body">
        <HomeScreensLogo />
        <p className="text-hs-text-secondary text-sm">
          {t('page.tooNarrowMessage', { minWidth: MIN_EDITOR_WIDTH })}
        </p>
        <p className="text-hs-text-faint text-xs">
          {t('page.tooNarrowHint')}
        </p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} autoScroll={false} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActivePaletteType(null)}>
      <div className="h-screen flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-4 overflow-hidden border-b border-hs-border-strong bg-hs-panel px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
            <HomeScreensLogo />
            <div className="h-8 w-px bg-hs-card" />
            <DisplaySwitcher />
            <ScreenTabs />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowPluginStore(true)}
            >
              {t('page.toolbar.pluginsButton')}
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                if (isDirty) await saveConfig();
                router.push('/editor/settings');
              }}
            >
              {t('page.toolbar.settingsButton')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const displays = config?.displays ?? [];
                const active = displays.find((d) => d.id === selectedDisplayId) ?? displays[0];
                const url = active ? `/display/${active.id}` : '/display';
                window.open(url, '_blank');
              }}
            >
              {t('page.toolbar.previewButton')}
            </Button>
            <div className="min-w-24 flex items-center justify-end gap-1.5" aria-live="polite">
              {saveError ? (
                <span role="alert" className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-hs-danger" />
                  <span className="text-xs text-hs-danger">{t('common.saveFailed')}</span>
                  <Button variant="secondary" size="sm" onClick={saveConfig}>
                    {t('page.toolbar.retryButton')}
                  </Button>
                </span>
              ) : isSaving ? (
                <span className="text-xs text-hs-text-faint">{t('common.saving')}</span>
              ) : !isDirty ? (
                <>
                  <Check className="w-3.5 h-3.5 text-hs-success" />
                  <span className="text-xs text-hs-success">{t('common.saved')}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Main area */}
        <div className="flex flex-1 overflow-hidden">
          <ModulePalette />
          <EditorCanvas onScaleChange={handleScaleChange} canvasRef={canvasElRef} />
          <PropertyPanel />
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activePaletteType && (() => {
          const def = getModuleDefinition(activePaletteType as ModuleType);
          if (!def) return null;
          // Mirror ModulePalette: built-in module types resolve through the
          // editor.registry.types.* dictionary; plugin-registered modules
          // keep their manifest-supplied label verbatim (translated by the
          // plugin author or intentionally English).
          const label = activePaletteType.startsWith('plugin:')
            ? def.label
            : t(`registry.types.${activePaletteType}`);
          return (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-hs-card border border-hs-accent shadow-lg shadow-hs-accent/20 cursor-grabbing">
              <def.icon className="w-5 h-5 text-hs-accent-hover" />
              <span className="text-sm text-hs-text-body">{label}</span>
            </div>
          );
        })()}
      </DragOverlay>
      {showPluginStore && <PluginStorePanel onClose={() => setShowPluginStore(false)} />}
    </DndContext>
  );
}
