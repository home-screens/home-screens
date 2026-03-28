'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import type { LayoutExport } from '@/types/layout-export';
import LayoutExportModal from './LayoutExportModal';
import LayoutImportModal from './LayoutImportModal';
import TemplatePicker from './TemplatePicker';


export default function ScreenTabs() {
  const { config, selectedScreenId, selectScreen, addScreen, removeScreen, updateScreen } = useEditorStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
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

  const screenSignature = config?.screens.map((screen) => `${screen.id}:${screen.name}`).join('|') ?? '';

  const updateScrollState = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    setCanScrollLeft(container.scrollLeft > 8);
    setCanScrollRight(maxScrollLeft > 8 && container.scrollLeft < maxScrollLeft - 8);
  };

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

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
  }, []);

  if (!config) return null;

  const commitRename = (screenId: string) => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== config.screens.find((s) => s.id === screenId)?.name) {
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

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <div
            ref={scrollContainerRef}
            className="scrollbar-none flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden px-9"
          >
            {config.screens.map((screen) => (
              <div
                key={screen.id}
                data-active={screen.id === selectedScreenId}
                title={screen.name}
                className={`flex shrink-0 items-center gap-1 rounded-t-md px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                  screen.id === selectedScreenId
                    ? 'bg-neutral-800 text-white'
                    : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                }`}
                onClick={() => selectScreen(screen.id)}
                onDoubleClick={() => {
                  setEditingId(screen.id);
                  setEditValue(screen.name);
                }}
                onContextMenu={(e) => handleContextMenu(e, screen.id)}
              >
                {editingId === screen.id ? (
                  <input
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitRename(screen.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(screen.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-28 border-b border-neutral-500 bg-transparent text-sm text-white outline-none"
                  />
                ) : (
                  <>
                    <span className="max-w-32 truncate">{screen.name}</span>
                    {screen.id === selectedScreenId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(screen.id);
                          setEditValue(screen.name);
                        }}
                        className="ml-1 text-xs text-neutral-500 hover:text-neutral-200"
                        title="Rename screen"
                        aria-label={`Rename ${screen.name}`}
                      >
                        &#9998;
                      </button>
                    )}
                  </>
                )}
                {config.screens.length > 1 && editingId !== screen.id && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (await useConfirmStore.getState().confirm(`Remove "${screen.name}"?`)) {
                        removeScreen(screen.id);
                      }
                    }}
                    className="ml-1 text-xs text-neutral-500 hover:text-red-400"
                    aria-label={`Delete ${screen.name}`}
                  >
                    x
                  </button>
                )}
              </div>
            ))}
          </div>
          <div
            className={clsx(
              'pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-neutral-900 via-neutral-900/95 to-transparent transition-opacity',
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
              'absolute left-1 top-1/2 -translate-y-1/2 rounded-full border border-neutral-700/80 bg-neutral-950/90 p-1 text-neutral-300 shadow-sm transition-all',
              canScrollLeft ? 'opacity-100 hover:border-neutral-500 hover:text-white' : 'pointer-events-none opacity-0',
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div
            className={clsx(
              'pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-neutral-900 via-neutral-900/95 to-transparent transition-opacity',
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
              'absolute right-1 top-1/2 -translate-y-1/2 rounded-full border border-neutral-700/80 bg-neutral-950/90 p-1 text-neutral-300 shadow-sm transition-all',
              canScrollRight ? 'opacity-100 hover:border-neutral-500 hover:text-white' : 'pointer-events-none opacity-0',
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
            className="flex items-center gap-0.5 rounded-md bg-neutral-700 px-2 py-1 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-600"
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
          className="fixed z-50 w-44 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
          style={{ top: addMenuPos.top, right: addMenuPos.right }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800"
            onClick={() => {
              addScreen();
              setAddMenuPos(null);
            }}
          >
            Blank Screen
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800"
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
          className="fixed z-50 w-44 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800"
            onClick={() => handleExportScreen(contextMenu.screenId)}
          >
            Export This Screen
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800"
            onClick={() => {
              setEditingId(contextMenu.screenId);
              setEditValue(config.screens.find((s) => s.id === contextMenu.screenId)?.name ?? '');
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          {config.screens.length > 1 && (
            <button
              className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-neutral-800"
              onClick={async () => {
                const screenName = config.screens.find((s) => s.id === contextMenu.screenId)?.name;
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
