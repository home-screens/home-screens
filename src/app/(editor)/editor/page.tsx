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
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT, DEFAULT_MODULE_SIZES, snapToGrid } from '@/lib/constants';
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

const MIN_EDITOR_WIDTH = 768;

export default function EditorPage() {
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
        const moduleType = data.moduleType as string;
        const defaultSize = DEFAULT_MODULE_SIZES[moduleType] || { w: 200, h: 200 };
        // Use a live DOM rect instead of over.rect, which can be stale after
        // window resize (dnd-kit caches droppable rects with optimized frequency)
        const pointerEvent = activatorEvent as PointerEvent;
        const pointerX = pointerEvent.clientX + delta.x;
        const pointerY = pointerEvent.clientY + delta.y;
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

        const rawX = mod.position.x + delta.x / scale;
        const rawY = mod.position.y + delta.y / scale;
        const newX = align(Math.max(0, Math.min(displayW - mod.size.w, rawX)));
        const newY = align(Math.max(0, Math.min(displayH - mod.size.h, rawY)));
        moveModule(selectedScreenId, moduleId, { x: newX, y: newY });
      }
    },
    [selectedScreenId, selectedDisplayId, config, addModule, moveModule],
  );

  if (!config || pluginLoading) {
    return (
      <div className="h-screen flex items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  if (tooNarrow) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 px-6 text-center bg-neutral-950">
        <HomeScreensLogo />
        <p className="text-neutral-300 text-sm">
          The editor requires a screen at least {MIN_EDITOR_WIDTH}px wide.
        </p>
        <p className="text-neutral-500 text-xs">
          Please use a desktop browser or widen your window.
        </p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} autoScroll={false} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActivePaletteType(null)}>
      <div className="h-screen flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-4 overflow-hidden border-b border-neutral-700 bg-neutral-900 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
            <HomeScreensLogo contextLabel="Editor" />
            <div className="h-8 w-px bg-neutral-800" />
            <DisplaySwitcher />
            <ScreenTabs />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowPluginStore(true)}
            >
              Plugins
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                if (isDirty) await saveConfig();
                router.push('/editor/settings');
              }}
            >
              Settings
            </Button>
            <Button
              variant="secondary"
              onClick={() => window.open('/display', '_blank')}
            >
              Preview
            </Button>
            <div className="min-w-24 flex items-center justify-end gap-1.5" aria-live="polite">
              {saveError ? (
                <span role="alert" className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs text-red-400">Save failed</span>
                  <Button variant="secondary" size="sm" onClick={saveConfig}>
                    Retry
                  </Button>
                </span>
              ) : isSaving ? (
                <span className="text-xs text-neutral-500">Saving...</span>
              ) : !isDirty ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-xs text-green-500">Saved</span>
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
          return (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-neutral-800 border border-blue-500 shadow-lg shadow-blue-500/20 cursor-grabbing">
              <def.icon className="w-5 h-5 text-blue-400" />
              <span className="text-sm text-neutral-200">{def.label}</span>
            </div>
          );
        })()}
      </DragOverlay>
      {showPluginStore && <PluginStorePanel onClose={() => setShowPluginStore(false)} />}
    </DndContext>
  );
}
