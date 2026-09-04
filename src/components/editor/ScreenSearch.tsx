'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Search, LayoutPanelTop } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { getModuleDefinition, resolveModuleLabel } from '@/lib/module-registry';
import { searchScreens, type ScreenSearchResult } from '@/lib/screen-search';
import { isDialogOpen, isTypingTarget } from '@/lib/editor-keyboard';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useOutsidePointerDown } from '@/hooks/useOutsidePointerDown';
import { useTranslate, type TranslateFn } from '@/i18n';
import type { ModuleType, ScreenConfiguration } from '@/types/config';

const POPOVER_WIDTH = 420;

function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

/**
 * Magnifier icon at the end of the screen-tab strip. Opens a small popover
 * that finds screens by name or by the modules they hold, across every
 * display. Picking a result switches the editor to that screen (and display).
 * Cmd/Ctrl+K opens it from anywhere in the editor except a text field or
 * another dialog.
 */
export default function ScreenSearch() {
  const t = useTranslate('editor');
  const config = useEditorStore((s) => s.config);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const open = pos !== null;

  const openPopover = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const right = Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - POPOVER_WIDTH - 8));
    setPos({ top: rect.bottom + 6, right });
  }, []);

  const close = useCallback(() => setPos(null), []);

  // Cmd/Ctrl+K toggles from anywhere in the editor. It stays out of text
  // fields (opening would blur them and commit half-typed drafts, e.g. a tab
  // rename) except its own input, and defers to any other open dialog. It
  // deliberately does NOT defer to an open context menu: the menu closes on
  // the way through, and swallowing a keystroke the user typed on purpose
  // would leave the menu up with nothing happening.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'k') return;
      if (open) {
        e.preventDefault();
        close();
        return;
      }
      if (isTypingTarget(e.target) || isDialogOpen()) return;
      e.preventDefault();
      openPopover();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, close, openPopover]);

  if (!config) return null;

  const shortcut = isMacLike() ? '⌘K' : 'Ctrl+K';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-testid="screen-search-button"
        aria-label={t('screenSearch.buttonAriaLabel')}
        aria-expanded={open}
        title={t('screenSearch.buttonTitle', { shortcut })}
        onClick={() => (open ? close() : openPopover())}
        className={clsx(
          'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border transition-colors',
          open
            ? 'border-hs-border-strong bg-hs-card text-hs-text-primary'
            : 'border-transparent text-hs-text-muted hover:bg-hs-hover hover:text-hs-text-body',
        )}
      >
        <Search className="h-4 w-4" />
      </button>

      {pos && (
        <ScreenSearchPopover config={config} pos={pos} buttonRef={btnRef} onClose={close} t={t} />
      )}
    </>
  );
}

/**
 * The open popover. Mounted only while open so the focus trap can take focus
 * on mount and hand it back to whatever had it on unmount.
 */
function ScreenSearchPopover({
  config,
  pos,
  buttonRef,
  onClose,
  t,
}: {
  config: ScreenConfiguration;
  pos: { top: number; right: number };
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  t: TranslateFn;
}) {
  const { selectedDisplayId, selectedScreenId, selectScreen, setSelectedDisplay } = useEditorStore();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  // Hover only moves the highlight when the pointer actually moved, so rows
  // sliding under a resting cursor (scrollIntoView) can't steal it.
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  const popoverRef = useFocusTrap<HTMLDivElement>();
  useEscapeKey(onClose);
  useOutsidePointerDown(true, [popoverRef, buttonRef], onClose);

  const resolveLabel = useCallback((type: ModuleType) => resolveModuleLabel(type, t), [t]);
  const results = useMemo<ScreenSearchResult[]>(
    () => searchScreens(config, query, resolveLabel, selectedDisplayId),
    [config, query, resolveLabel, selectedDisplayId],
  );

  // Reset the highlighted row whenever the result set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, results.length]);

  const goTo = useCallback(
    (result: ScreenSearchResult) => {
      if (result.displayId !== null && result.displayId !== selectedDisplayId) {
        setSelectedDisplay(result.displayId);
      }
      selectScreen(result.screen.id);
      onClose();
    },
    [selectedDisplayId, setSelectedDisplay, selectScreen, onClose],
  );

  const moveHighlight = (delta: 1 | -1) => {
    if (!results.length) return;
    const next = (activeIndex + delta + results.length) % results.length;
    setActiveIndex(next);
    (listRef.current?.children[next] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Handled here so it never reaches another overlay's window listener.
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveHighlight(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) goTo(target);
    }
  };

  const hasDisplays = (config.displays?.length ?? 0) > 0;
  const trimmed = query.trim();
  const listOpen = results.length > 0;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={t('screenSearch.buttonAriaLabel')}
      data-testid="screen-search-popover"
      className="fixed z-50 overflow-hidden rounded-[10px] border border-hs-border-strong bg-hs-panel shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
      style={{ top: pos.top, right: pos.right, width: POPOVER_WIDTH, maxWidth: 'calc(100vw - 16px)' }}
    >
      <div className="flex items-center gap-2 border-b border-hs-border-strong bg-hs-input px-3 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-hs-text-faint" />
        <input
          data-testid="screen-search-input"
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-autocomplete="list"
          aria-controls={listOpen ? 'screen-search-results' : undefined}
          aria-activedescendant={listOpen ? `screen-search-option-${activeIndex}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder={t('screenSearch.placeholder')}
          aria-label={t('screenSearch.placeholder')}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm text-hs-text-primary outline-none placeholder:text-hs-text-faint"
        />
        <Kbd>{t('screenSearch.keys.escape')}</Kbd>
      </div>

      {!trimmed ? (
        <p className="px-3 pb-3 pt-2.5 text-xs text-hs-text-faint">{t('screenSearch.hint')}</p>
      ) : results.length === 0 ? (
        <p data-testid="screen-search-empty" className="px-4 py-7 text-center text-[13px] text-hs-text-muted">
          {t('screenSearch.noResults', { query: trimmed })}
        </p>
      ) : (
        <>
          <ul
            ref={listRef}
            id="screen-search-results"
            role="listbox"
            className="max-h-80 overflow-y-auto p-1.5"
          >
            {results.map((result, index) => {
              const isCurrent = result.screen.id === selectedScreenId && result.displayId === selectedDisplayId;
              const otherDisplay = hasDisplays && result.displayId !== selectedDisplayId;
              return (
                <li
                  key={`${result.displayId ?? 'legacy'}:${result.screen.id}`}
                  id={`screen-search-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  data-testid="screen-search-result"
                  data-screen-id={result.screen.id}
                  data-display-id={result.displayId ?? undefined}
                  onMouseMove={(e) => {
                    const p = lastPointer.current;
                    if (p && p.x === e.clientX && p.y === e.clientY) return;
                    lastPointer.current = { x: e.clientX, y: e.clientY };
                    if (activeIndex !== index) setActiveIndex(index);
                  }}
                  onClick={() => goTo(result)}
                  className={clsx(
                    'flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2',
                    index === activeIndex && 'bg-hs-card shadow-[inset_0_0_0_1px_var(--hs-accent)]',
                  )}
                >
                  <LayoutPanelTop className="mt-0.5 h-4 w-4 shrink-0 text-hs-text-faint" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-hs-text-primary">
                      <span className="truncate">
                        <HighlightedName name={result.screen.name} range={result.nameRange} />
                      </span>
                      {otherDisplay && result.displayName && (
                        <span className="shrink-0 text-[11px] font-normal text-hs-text-faint">
                          · {result.displayName}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="shrink-0 rounded-full border border-hs-border-strong px-1.5 text-[10px] font-normal text-hs-text-faint">
                          {t('screenSearch.currentScreenTag')}
                        </span>
                      )}
                    </div>
                    {result.moduleHits.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {result.moduleHits.map((hit) => {
                          const Icon = getModuleDefinition(hit.type)?.icon;
                          return (
                            <span
                              key={hit.type}
                              className="inline-flex items-center gap-1 rounded-full border border-hs-accent/35 bg-hs-accent-soft py-0.5 pl-1.5 pr-2 text-[11px] text-hs-accent-hover"
                            >
                              {Icon && <Icon className="h-3 w-3" />}
                              {hit.label}
                              {hit.count > 1 && <span className="text-hs-text-faint">×{hit.count}</span>}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-3 border-t border-hs-border-strong px-3 py-1.5 text-[11px] text-hs-text-faint">
            <span>{t('screenSearch.resultCount', { count: results.length })}</span>
            <span className="flex-1" />
            <span className="flex items-center gap-1"><Kbd>↑↓</Kbd> {t('screenSearch.keys.move')}</span>
            <span className="flex items-center gap-1"><Kbd>↵</Kbd> {t('screenSearch.keys.go')}</span>
          </div>
        </>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-hs-border-strong bg-hs-panel px-1.5 py-px text-[10px] leading-[1.4] text-hs-text-faint">
      {children}
    </span>
  );
}

function HighlightedName({ name, range }: { name: string; range: { start: number; end: number } | null }) {
  if (!range) return <>{name}</>;
  return (
    <>
      {name.slice(0, range.start)}
      <mark className="bg-transparent text-hs-accent-hover">{name.slice(range.start, range.end)}</mark>
      {name.slice(range.end)}
    </>
  );
}
