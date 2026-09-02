'use client';

import { useEffect, useRef, useState } from 'react';
import { Monitor, ChevronDown, Check, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEditorStore } from '@/stores/editor-store';
import { useDisplayHeartbeats } from '@/hooks/useDisplayHeartbeats';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useOutsidePointerDown } from '@/hooks/useOutsidePointerDown';
import { declaredCanvasDimensions } from '@/lib/display-filter';
import { formatLastSeen } from '@/lib/time-format';
import { settingsPath } from '@/lib/settings-route';
import { useTranslate } from '@/i18n';

/** A display that has checked in within this window is treated as switched on. */
const ONLINE_WINDOW_MS = 30_000;

/**
 * Display picker for the editor toolbar. Shows which display the editor is
 * currently laying out, and lets the user switch to any registered display
 * without leaving the editor.
 *
 * A real dropdown, not an invisible `<select>` stretched over a styled pill:
 * the OS menu it used to pop was in the OS theme, showed no size for the
 * display you were already on, and could not say which displays were actually
 * switched on.
 *
 * Hidden entirely when `config.displays` is empty (legacy single-display
 * install) so the editor looks exactly like it used to for users who don't
 * care about multi-display.
 */
export default function DisplaySwitcher() {
  const t = useTranslate('editor');
  const router = useRouter();
  const { config, selectedDisplayId, setSelectedDisplay } = useEditorStore();
  // Position measured from the button and rendered `fixed`: the editor toolbar
  // has two overflow-hidden ancestors, which clip an absolutely-positioned
  // menu out of sight entirely. Same pattern as the screen tabs' add menu.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const open = menuPos !== null;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // One ref per menuitem (each display row, plus "Add display" at the end),
  // so arrow-key navigation and initial focus have something to move to.
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const displays = config?.displays ?? [];
  // The heartbeat poll only runs while the menu is open: a closed toolbar pill
  // has nothing to show with it, and the editor already polls plenty.
  const { data } = useDisplayHeartbeats({ enabled: open && displays.length > 0 });

  useEscapeKey(() => setMenuPos(null), open);
  // Capture-phase outside-pointerdown closer, same as every other non-modal
  // menu in the editor (screen tabs' add menu, module context menu) — a
  // popover nested inside this one that stops propagation still closes it.
  useOutsidePointerDown(open, [rootRef, menuRef], () => setMenuPos(null));
  useEffect(() => {
    if (!open) return;
    // A scroll or resize would leave the menu behind where the button was.
    const close = () => setMenuPos(null);
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    // Move focus into the menu on open — landing on the current display's
    // row when possible — so arrow keys work immediately, matching the
    // native <select> this replaced.
    const activeIndex = displays.findIndex((d) => d.id === selectedDisplayId);
    const target = itemRefs.current[activeIndex >= 0 ? activeIndex : 0];
    target?.focus();
    // Only re-run when the menu opens/closes — refocusing on every render
    // while it's open would steal focus back from whatever the user tabbed to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const focusMenuItem = (index: number) => {
    const items = itemRefs.current;
    if (items.length === 0) return;
    items[(index + items.length) % items.length]?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = itemRefs.current;
    const currentIndex = items.findIndex((el) => el === document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusMenuItem(currentIndex === -1 ? 0 : currentIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusMenuItem(currentIndex === -1 ? items.length - 1 : currentIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusMenuItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusMenuItem(items.length - 1);
    }
  };

  if (displays.length === 0) return null;

  const active = displays.find((d) => d.id === selectedDisplayId) ?? displays[0];
  // Show orientation-corrected dimensions so the pill matches whatever the
  // canvas is actually rendering, even if the stored values are in the
  // "wrong" order relative to the rotation.
  const dimensionsFor = (d: typeof active) => {
    const oriented = d.displayWidth && d.displayHeight
      ? declaredCanvasDimensions(d.displayWidth, d.displayHeight, d.displayTransform)
      : null;
    return oriented ? `${oriented.width}×${oriented.height}` : null;
  };
  const dimensions = dimensionsFor(active);
  const heartbeats = new Map((data?.displays ?? []).map((d) => [d.id, d.lastSeen]));

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (open) {
            setMenuPos(null);
            return;
          }
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left });
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('displaySwitcher.label')}
        title={t('displaySwitcher.title')}
        data-testid="display-switcher"
        className="flex items-center gap-2 rounded-md border border-hs-border-strong bg-hs-card/70 px-2.5 py-1.5 text-xs text-hs-text-body hover:bg-hs-hover transition-colors"
      >
        <Monitor className="w-3.5 h-3.5 text-hs-text-faint shrink-0" />
        <div className="flex flex-col items-start leading-tight">
          <span className="font-medium text-hs-text-body">{active.name}</span>
          {dimensions && (
            <span className="text-[10px] text-hs-text-faint tabular-nums">
              {dimensions}
              {active.displayTransform && active.displayTransform !== 'normal'
                ? ` · ${active.displayTransform}°`
                : ''}
            </span>
          )}
        </div>
        <ChevronDown className="w-3 h-3 text-hs-text-faint shrink-0" />
      </button>

      {menuPos && (
        <div
          ref={menuRef}
          role="menu"
          data-testid="display-switcher-menu"
          className="fixed z-50 w-64 rounded-lg border border-hs-border-strong bg-hs-panel p-1 shadow-2xl"
          style={{ top: menuPos.top, left: menuPos.left }}
          onKeyDown={onMenuKeyDown}
        >
          {displays.map((d, i) => {
            const lastSeen = heartbeats.get(d.id) ?? null;
            const online = lastSeen != null && Date.now() - lastSeen < ONLINE_WINDOW_MS;
            const dims = dimensionsFor(d);
            return (
              <button
                key={d.id}
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitem"
                onClick={() => {
                  setSelectedDisplay(d.id);
                  setMenuPos(null);
                }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                  d.id === active.id ? 'bg-hs-accent-soft' : 'hover:bg-hs-hover'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? 'bg-hs-success' : 'bg-hs-text-faint'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-hs-text-body">{d.name}</span>
                  <span className="block truncate text-[10px] tabular-nums text-hs-text-faint">
                    {dims ? `${dims} · ` : ''}
                    {online
                      ? t('displaySwitcher.onNow')
                      : t('displaySwitcher.lastSeen', { time: formatLastSeen(lastSeen) })}
                  </span>
                </span>
                {d.id === active.id && <Check className="h-3.5 w-3.5 shrink-0 text-hs-accent-hover" />}
              </button>
            );
          })}
          <div className="my-1 h-px bg-hs-border" />
          <button
            ref={(el) => { itemRefs.current[displays.length] = el; }}
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuPos(null);
              router.push(settingsPath({ kind: 'displays' }));
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-hs-text-muted hover:bg-hs-hover hover:text-hs-text-body"
          >
            <Plus className="h-3 w-3" />
            {t('displaySwitcher.addDisplay')}
          </button>
        </div>
      )}
    </div>
  );
}
