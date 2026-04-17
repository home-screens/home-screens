'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import type { LayoutExport } from '@/types/layout-export';
import type { Screen } from '@/types/config';
import LayoutExportModal from './LayoutExportModal';
import LayoutImportModal from './LayoutImportModal';
import TemplatePicker from './TemplatePicker';


/* ─── Sortable tab ──────────────────────────── */

function DurationBadge({ ms }: { ms: number }) {
  if (ms === 0) {
    return (
      <span
        className="ml-1 text-[9px] font-semibold tracking-wide text-hs-warning bg-hs-warning/15 border border-hs-warning/35 rounded-full px-1.5 py-[1px]"
        aria-hidden
      >
        0s
      </span>
    );
  }
  const sec = Math.round(ms / 1000);
  const label = sec < 1 ? `${ms}ms` : `${sec}s`;
  return (
    <span
      className="ml-1 text-[9px] font-semibold tracking-wide text-hs-accent-hover bg-hs-accent-soft border border-hs-accent/35 rounded-full px-1.5 py-[1px]"
      aria-hidden
    >
      {label}
    </span>
  );
}

interface SortableTabProps {
  screen: Screen;
  isSelected: boolean;
  isEditing: boolean;
  editValue: string;
  onSelect: () => void;
  onStartEditing: () => void;
  onEditChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelEditing: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  canDelete: boolean;
}

function SortableTab({
  screen,
  isSelected,
  isEditing,
  editValue,
  onSelect,
  onStartEditing,
  onEditChange,
  onCommitRename,
  onCancelEditing,
  onDelete,
  onContextMenu,
  canDelete,
}: SortableTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: screen.id });

  // Lock to horizontal axis (y: 0 prevents clipping by overflow-y-hidden)
  // and preserve original size (scaleX/Y: 1 prevents resizing to match target slot)
  const clampedTransform = transform ? { ...transform, y: 0, scaleX: 1, scaleY: 1 } : null;

  const isDisabled = screen.enabled === false;

  const style = {
    transform: CSS.Transform.toString(clampedTransform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : (isDisabled && !isSelected ? 0.45 : undefined),
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-active={isSelected}
      title={(() => {
        const parts: string[] = [screen.name];
        if (screen.rotationDurationMs === 0) parts.push('sticky — manual advance only');
        else if (screen.rotationDurationMs != null) parts.push(`${Math.round(screen.rotationDurationMs / 1000)}s`);
        if (isDisabled) parts.push('disabled — not shown on display');
        return parts.join(' · ');
      })()}
      className={`flex shrink-0 items-center gap-1 rounded-t-md px-3 py-1.5 text-sm cursor-pointer transition-colors ${
        isSelected
          ? 'bg-hs-card text-hs-text-primary'
          : 'bg-hs-panel text-hs-text-muted hover:text-hs-text-body'
      }`}
      onClick={onSelect}
      onDoubleClick={onStartEditing}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename();
            if (e.key === 'Escape') onCancelEditing();
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-28 border-b border-hs-border-strong bg-transparent text-sm text-hs-text-primary outline-none"
        />
      ) : (
        <>
          <span className="max-w-32 truncate">{screen.name}</span>
          {screen.rotationDurationMs != null && <DurationBadge ms={screen.rotationDurationMs} />}
          {isDisabled && <span className="ml-0.5 text-[10px] text-hs-text-faint">⊘</span>}
          {isSelected && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu(e);
              }}
              className="ml-1 text-xs text-hs-text-faint hover:text-hs-text-body"
              title="Screen options"
              aria-label={`Options for ${screen.name}`}
            >
              &#9998;
            </button>
          )}
        </>
      )}
      {canDelete && !isEditing && (
        <button
          onClick={onDelete}
          className="ml-1 text-xs text-hs-text-faint hover:text-hs-danger"
          aria-label={`Delete ${screen.name}`}
        >
          x
        </button>
      )}
    </div>
  );
}


/* ─── Main component ────────────────────────── */

export default function ScreenTabs() {
  const { config, selectedDisplayId, selectedScreenId, selectScreen, addScreen, removeScreen, reorderScreens, updateScreen } = useEditorStore();
  // Screen operations target the currently-selected display's screens.
  // In legacy single-display mode this resolves to the global screen pool.
  const screens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Dropdown & context menu state
  const [addMenuPos, setAddMenuPos] = useState<{ top: number; right: number } | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [contextMenu, setContextMenu] = useState<{ screenId: string; x: number; y: number } | null>(null);

  // Modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScreenId, setExportScreenId] = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [importLayout, setImportLayout] = useState<LayoutExport | null>(null);

  const screenSignature = screens.map((screen) => `${screen.id}:${screen.name}`).join('|');

  // DnD sensors — distance constraint prevents drag from interfering with click/scroll
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const updateScrollState = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    setCanScrollLeft(container.scrollLeft > 8);
    setCanScrollRight(maxScrollLeft > 8 && container.scrollLeft < maxScrollLeft - 8);
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    updateScrollState();

    const handleScroll = () => updateScrollState();
    const resizeObserver = new ResizeObserver(() => updateScrollState());

    resizeObserver.observe(container);
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('scroll', handleScroll);
    };
  }, [screenSignature]);

  useEffect(() => {
    const activeTab = scrollContainerRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    updateScrollState();
  }, [selectedScreenId, editingId, screenSignature]);

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

  const commitRename = (screenId: string) => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== screens.find((s) => s.id === screenId)?.name) {
      updateScreen(screenId, { name: trimmed });
    }
    setEditingId(null);
  };

  const scrollTabs = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollBy({
      left: direction === 'left' ? -220 : 220,
      behavior: 'smooth',
    });
  };

  const handleExportScreen = (screenId: string) => {
    setExportScreenId(screenId);
    setShowExportModal(true);
    setContextMenu(null);
  };

  const handleTemplateSelect = (layout: LayoutExport) => {
    setShowTemplatePicker(false);
    setImportLayout(layout);
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
                  <SortableTab
                    key={screen.id}
                    screen={screen}
                    isSelected={screen.id === selectedScreenId}
                    isEditing={editingId === screen.id}
                    editValue={editValue}
                    onSelect={() => selectScreen(screen.id)}
                    onStartEditing={() => {
                      setEditingId(screen.id);
                      setEditValue(screen.name);
                    }}
                    onEditChange={setEditValue}
                    onCommitRename={() => commitRename(screen.id)}
                    onCancelEditing={() => setEditingId(null)}
                    onDelete={async (e) => {
                      e.stopPropagation();
                      if (await useConfirmStore.getState().confirm(`Remove "${screen.name}"?`)) {
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
            aria-label="Scroll tabs left"
            title="Scroll tabs left"
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
            aria-label="Scroll tabs right"
            title="Scroll tabs right"
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
            aria-label="Add screen"
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
            Blank Screen
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card"
            onClick={() => {
              setShowTemplatePicker(true);
              setAddMenuPos(null);
            }}
          >
            From Template...
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
            Move Left
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card disabled:text-hs-text-faint disabled:cursor-default"
            disabled={contextScreenIndex >= screens.length - 1}
            onClick={() => handleMoveScreen(contextMenu.screenId, 'right')}
          >
            Move Right
          </button>
          <div className="my-1 border-t border-hs-border-strong/60" />
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card"
            onClick={() => handleExportScreen(contextMenu.screenId)}
          >
            Export This Screen
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
              ? 'Enable'
              : 'Disable'}
          </button>
          <div className="my-1 border-t border-hs-border-strong/60" />
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card"
            onClick={() => {
              setEditingId(contextMenu.screenId);
              setEditValue(screens.find((s) => s.id === contextMenu.screenId)?.name ?? '');
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          {screens.length > 1 && (
            <button
              className="w-full px-3 py-1.5 text-left text-sm text-hs-danger hover:bg-hs-card"
              onClick={async () => {
                const screenName = screens.find((s) => s.id === contextMenu.screenId)?.name;
                setContextMenu(null);
                if (await useConfirmStore.getState().confirm(`Remove "${screenName}"?`)) {
                  removeScreen(contextMenu.screenId);
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}

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
      {showTemplatePicker && (
        <TemplatePicker
          onSelect={handleTemplateSelect}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}
    </>
  );
}
