'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import { useTranslate } from '@/i18n';
import { useTabRename } from '@/hooks/useTabRename';
import { useTabScroll } from '@/hooks/useTabScroll';
import { useSortableSensors } from '@/hooks/useDndSensors';
import { useLayoutFileImport } from '@/hooks/useLayoutFileImport';
import type { LayoutExport } from '@/types/layout-export';
import LayoutExportModal from './LayoutExportModal';
import LayoutImportModal from './LayoutImportModal';
import TemplateFlow from './TemplateFlow';
import ScreenTab from './ScreenTab';


/* ─── Main component ────────────────────────── */

export default function ScreenTabs() {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { config, selectedDisplayId, selectedScreenId, selectScreen, addScreen, removeScreen, duplicateScreen, reorderScreens, updateScreen } = useEditorStore();
  // Screen operations target the currently-selected display's screens.
  // In legacy single-display mode this resolves to the global screen pool.
  const screens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const { editingId, editValue, setEditValue, beginEditing, commitRename, cancelEditing } =
    useTabRename(screens, updateScreen);

  // Dropdown & context menu state
  const [addMenuPos, setAddMenuPos] = useState<{ top: number; right: number } | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [contextMenu, setContextMenu] = useState<{ screenId: string; x: number; y: number } | null>(null);

  // Modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScreenId, setExportScreenId] = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [importLayout, setImportLayout] = useState<LayoutExport | null>(null);
  const { inputRef: layoutInputRef, openFilePicker, handleFileChange } =
    useLayoutFileImport(setImportLayout);

  const screenSignature = screens.map((screen) => `${screen.id}:${screen.name}`).join('|');
  const { scrollContainerRef, canScrollLeft, canScrollRight, scrollTabs } = useTabScroll({
    screenSignature,
    selectedScreenId,
    editingId,
  });

  // DnD sensors — 8px distance constraint prevents drag from interfering with click/scroll
  const sensors = useSortableSensors(8);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!addMenuPos && !contextMenu) return;
    const handler = () => {
      setAddMenuPos(null);
      setContextMenu(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [addMenuPos, contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, screenId: string) => {
    e.preventDefault();
    setContextMenu({ screenId, x: e.clientX, y: e.clientY });
  }, [setContextMenu]);

  if (!config) return null;

  const handleExportScreen = (screenId: string) => {
    setExportScreenId(screenId);
    setShowExportModal(true);
    setContextMenu(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = screens.findIndex((s) => s.id === active.id);
    const toIndex = screens.findIndex((s) => s.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderScreens(fromIndex, toIndex);
    }
  };

  const handleMoveScreen = (screenId: string, direction: 'left' | 'right') => {
    const fromIndex = screens.findIndex((s) => s.id === screenId);
    if (fromIndex === -1) return;
    const toIndex = direction === 'left' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= screens.length) return;
    reorderScreens(fromIndex, toIndex);
    setContextMenu(null);
  };

  const contextScreenIndex = contextMenu
    ? screens.findIndex((s) => s.id === contextMenu.screenId)
    : -1;

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={screens.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
              <div
                ref={scrollContainerRef}
                className="scrollbar-none flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden px-9"
              >
                {screens.map((screen) => (
                  <ScreenTab
                    key={screen.id}
                    screen={screen}
                    isSelected={screen.id === selectedScreenId}
                    isEditing={editingId === screen.id}
                    editValue={editValue}
                    onSelect={() => selectScreen(screen.id)}
                    onStartEditing={() => beginEditing(screen.id, screen.name)}
                    onEditChange={setEditValue}
                    onCommitRename={() => commitRename(screen.id)}
                    onCancelEditing={cancelEditing}
                    onDelete={async (e) => {
                      e.stopPropagation();
                      if (await useConfirmStore.getState().confirm({
                        message: t('screenTabs.removeConfirmMessage', { name: screen.name }),
                        confirmLabel: tCore('actions.remove'),
                        variant: 'danger',
                      })) {
                        removeScreen(screen.id);
                      }
                    }}
                    onContextMenu={(e) => handleContextMenu(e, screen.id)}
                    canDelete={screens.length > 1}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div
            className={clsx(
              'pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-hs-panel via-hs-panel/95 to-transparent transition-opacity',
              canScrollLeft ? 'opacity-100' : 'opacity-0',
            )}
          />
          <button
            type="button"
            onClick={() => scrollTabs('left')}
            disabled={!canScrollLeft}
            aria-label={t('screenTabs.scrollLeftAriaLabel')}
            title={t('screenTabs.scrollLeftTitle')}
            className={clsx(
              'absolute left-1 top-1/2 -translate-y-1/2 rounded-full border border-hs-border-strong/80 bg-hs-body/90 p-1 text-hs-text-secondary shadow-sm transition-all',
              canScrollLeft ? 'opacity-100 hover:border-hs-border-strong hover:text-hs-text-primary' : 'pointer-events-none opacity-0',
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div
            className={clsx(
              'pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-hs-panel via-hs-panel/95 to-transparent transition-opacity',
              canScrollRight ? 'opacity-100' : 'opacity-0',
            )}
          />
          <button
            type="button"
            onClick={() => scrollTabs('right')}
            disabled={!canScrollRight}
            aria-label={t('screenTabs.scrollRightAriaLabel')}
            title={t('screenTabs.scrollRightTitle')}
            className={clsx(
              'absolute right-1 top-1/2 -translate-y-1/2 rounded-full border border-hs-border-strong/80 bg-hs-body/90 p-1 text-hs-text-secondary shadow-sm transition-all',
              canScrollRight ? 'opacity-100 hover:border-hs-border-strong hover:text-hs-text-primary' : 'pointer-events-none opacity-0',
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Add screen dropdown */}
        <div className="shrink-0">
          <button
            ref={addBtnRef}
            aria-label={t('screenTabs.addScreenAriaLabel')}
            className="flex items-center gap-0.5 rounded-md bg-hs-card px-2 py-1 text-xs font-medium text-hs-text-body transition-colors hover:bg-hs-hover"
            onClick={(e) => {
              e.stopPropagation();
              if (addMenuPos) {
                setAddMenuPos(null);
              } else {
                const rect = addBtnRef.current?.getBoundingClientRect();
                if (rect) {
                  setAddMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                }
              }
            }}
          >
            +
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Add screen dropdown — fixed position to escape overflow-hidden parents */}
      {addMenuPos && (
        <div
          className="fixed z-50 w-44 rounded-lg border border-hs-border-strong bg-hs-panel py-1 shadow-xl"
          style={{ top: addMenuPos.top, right: addMenuPos.right }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card"
            onClick={() => {
              addScreen();
              setAddMenuPos(null);
            }}
          >
            {t('screenTabs.addMenu.blank')}
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card"
            onClick={() => {
              setShowTemplatePicker(true);
              setAddMenuPos(null);
            }}
          >
            {t('screenTabs.addMenu.fromTemplate')}
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card"
            onClick={() => {
              openFilePicker();
              setAddMenuPos(null);
            }}
          >
            {t('screenTabs.addMenu.fromFile')}
          </button>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 w-44 rounded-lg border border-hs-border-strong bg-hs-panel py-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card disabled:text-hs-text-faint disabled:cursor-default"
            disabled={contextScreenIndex <= 0}
            onClick={() => handleMoveScreen(contextMenu.screenId, 'left')}
          >
            {t('screenTabs.contextMenu.moveLeft')}
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card disabled:text-hs-text-faint disabled:cursor-default"
            disabled={contextScreenIndex >= screens.length - 1}
            onClick={() => handleMoveScreen(contextMenu.screenId, 'right')}
          >
            {t('screenTabs.contextMenu.moveRight')}
          </button>
          <div className="my-1 border-t border-hs-border-strong/60" />
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card"
            onClick={() => handleExportScreen(contextMenu.screenId)}
          >
            {t('screenTabs.contextMenu.exportThisScreen')}
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card"
            onClick={() => {
              const screen = screens.find((s) => s.id === contextMenu.screenId);
              if (screen) {
                updateScreen(contextMenu.screenId, {
                  enabled: screen.enabled === false ? undefined : false,
                });
              }
              setContextMenu(null);
            }}
          >
            {screens.find((s) => s.id === contextMenu.screenId)?.enabled === false
              ? t('screenTabs.contextMenu.enable')
              : t('screenTabs.contextMenu.disable')}
          </button>
          <div className="my-1 border-t border-hs-border-strong/60" />
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card"
            onClick={() => {
              beginEditing(contextMenu.screenId, screens.find((s) => s.id === contextMenu.screenId)?.name ?? '');
              setContextMenu(null);
            }}
          >
            {t('screenTabs.contextMenu.rename')}
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card"
            onClick={() => {
              duplicateScreen(contextMenu.screenId);
              setContextMenu(null);
            }}
          >
            {t('screenTabs.contextMenu.duplicate')}
          </button>
          {screens.length > 1 && (
            <button
              className="w-full px-3 py-1.5 text-left text-sm text-hs-danger hover:bg-hs-card"
              onClick={async () => {
                const screenName = screens.find((s) => s.id === contextMenu.screenId)?.name ?? '';
                setContextMenu(null);
                if (await useConfirmStore.getState().confirm({
                  message: t('screenTabs.removeConfirmMessage', { name: screenName }),
                  confirmLabel: tCore('actions.delete'),
                  variant: 'danger',
                })) {
                  removeScreen(contextMenu.screenId);
                }
              }}
            >
              {t('screenTabs.contextMenu.delete')}
            </button>
          )}
        </div>
      )}

      {/* Hidden file input backing "From File…" */}
      <input
        ref={layoutInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Modals */}
      {showExportModal && (
        <LayoutExportModal
          preSelectedScreenId={exportScreenId ?? undefined}
          onClose={() => {
            setShowExportModal(false);
            setExportScreenId(null);
          }}
        />
      )}
      {importLayout && (
        <LayoutImportModal
          layout={importLayout}
          onClose={() => setImportLayout(null)}
        />
      )}
      {/* The screen being looked at is replaced if it is still empty, so
          "add a screen from a template" on a blank screen does not leave the
          blank one in rotation. */}
      <TemplateFlow
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        replaceEmptyScreenId={selectedScreenId ?? undefined}
      />
    </>
  );
}
