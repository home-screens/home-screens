'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { TodoConfig, TodoItem, ModuleStyle } from '@/types/config';
import type { TodoState } from '@/lib/todo-data';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState } from './ModuleStates';
import { TEXT_OPACITY, DIVIDER, ink } from '@/lib/constants';
import { MetadataText } from './shared/MetadataText';
import { TapCheckbox, TAP_CHECKBOX_ACCENT } from './shared/TapCheckbox';
import { usePressedKey } from './shared/usePressedKey';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { useTranslate } from '@/i18n';
import { useFetchData } from '@/hooks/useFetchData';
import { useOptimisticMutation } from '@/hooks/useOptimisticMutation';
import { displayFetch } from '@/lib/display-fetch';
import { displayCache } from '@/lib/display-cache';
import { todoStateUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';

/** Poll interval for runtime completion state — sourced from the shared
 *  registry so prefetch and the hook stay in lockstep. */
const TODO_STATE_TTL_MS = FETCH_KEY_REGISTRY['todo']?.ttlMs ?? 5_000;

/** localStorage flag: the "tap a box" hint has been shown on this display. */
const TAP_HINT_SEEN_KEY = 'hs:todo-tap-hint-seen';
const TAP_HINT_SHOW_MS = 4_000;
const TAP_HINT_FADE_MS = 1_200;

/**
 * One-time hint for a tappable list: shown on the first interactive render
 * of this display, fades after a few seconds, and never comes back (a flag
 * in localStorage, so a Chromium restart doesn't replay it). Dismissed early
 * by the first tap. Storage can be unavailable (private mode, blocked site
 * data); every access is guarded and the hint simply stays off.
 */
function useTapHint(enabled: boolean): { phase: 'hidden' | 'shown' | 'fading'; dismiss: () => void } {
  const [phase, setPhase] = useState<'hidden' | 'shown' | 'fading'>('hidden');
  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(TAP_HINT_SEEN_KEY)) return;
      localStorage.setItem(TAP_HINT_SEEN_KEY, '1');
    } catch {
      return;
    }
    setPhase('shown');
    const fade = setTimeout(() => setPhase('fading'), TAP_HINT_SHOW_MS);
    const hide = setTimeout(() => setPhase('hidden'), TAP_HINT_SHOW_MS + TAP_HINT_FADE_MS);
    return () => { clearTimeout(fade); clearTimeout(hide); };
  }, [enabled]);
  const dismiss = useCallback(() => setPhase('hidden'), []);
  return { phase, dismiss };
}

interface TodoModuleProps {
  config: TodoConfig;
  style: ModuleStyle;
  /** Instance address, threaded by ScreenRenderer — present only on the display. */
  displayId?: string;
  screenId?: string;
  moduleId?: string;
}

function CheckIcon({ done, color }: { done: boolean; color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0" style={{ marginTop: '0.1em' }}>
      {done ? (
        <>
          <rect x="1" y="1" width="16" height="16" rx="4" fill={color} />
          {/* White for contrast on the accent-filled box: chip ink, not card ink. */}
          <path d="M5.5 9.5L7.5 11.5L12.5 6.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : (
        <rect x="1" y="1" width="16" height="16" rx="4" fill="none" stroke={ink(0.25)} strokeWidth="1.5" />
      )}
    </svg>
  );
}

/** Row contents (checkbox + label). The static <li> keeps the small check
 *  glyph; the interactive <button> draws the shared 38px tap checkbox so a
 *  list that can be tapped looks different from one that can't. */
function TodoRow({ item, accentColor, tappable, pressed }: { item: TodoItem; accentColor: string; tappable?: boolean; pressed?: boolean }) {
  return (
    <>
      {tappable ? (
        // The authored default accent is black, which reads as a hole on a
        // dark card once the box is filled; the mockup's blue stands in.
        <TapCheckbox
          checked={item.completed}
          pressed={pressed}
          color={accentColor.toLowerCase() === '#000000' ? TAP_CHECKBOX_ACCENT : accentColor}
        />
      ) : (
        <CheckIcon done={item.completed} color={accentColor} />
      )}
      <span
        className="line-clamp-2"
        style={{
          textDecoration: item.completed ? 'line-through' : 'none',
          textDecorationColor: item.completed ? accentColor : undefined,
        }}
      >
        {item.text}
      </span>
    </>
  );
}

export default function TodoModule({ config, style, displayId, screenId, moduleId }: TodoModuleProps) {
  const t = useTranslate('modules');
  const title = config.title ?? t('todo.defaultTitle');
  const { containerRef, scaledFontSize } = useScaledFontSize(style, 0.06);
  const accentColor = config.accentColor ?? '#000000';

  // Interactive only when explicitly opted in AND the renderer threaded the
  // instance address. The editor preview (no screenId/moduleId) stays static.
  const interactive = !!config.interactive && !!screenId && !!moduleId;

  // Authored items (text + default completion) come straight from config. The
  // editor owns these; they change only on a config save, never on a tap.
  const authoredItems = useMemo(() => config.items ?? [], [config.items]);

  // Map of authored defaults (itemId → completed). Synced into a ref *during
  // render* (not a post-render effect) so a tap landing in the
  // render-to-commit window after a config change still reads the current
  // default, not a stale one.
  const authoredMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const it of authoredItems) map[it.id] = it.completed;
    return map;
  }, [authoredItems]);
  const authoredMapRef = useRef(authoredMap);
  authoredMapRef.current = authoredMap;

  // Runtime completion overrides (itemId → completed), reconciled from the
  // /api/todo/state poll and optimistically updated on tap. An item absent here
  // falls back to its authored default. Because completion no longer rides on
  // config, the 3s config poll carries no completion data and can't clobber a
  // tap — the only reconciliation is this dedicated poll, guarded below.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  // Shared optimistic-mutation runner. Its `pending` set holds ids with a
  // toggle request in flight; polls skip these so a response that predates the
  // tap can't flash the old value back (the old flicker).
  const { run: runToggle, pending: pendingRef } = useOptimisticMutation();
  // Which row's tap is in flight (pressed checkbox), and the one-time hint.
  const [pressedId, press] = usePressedKey();
  const tapHint = useTapHint(interactive);
  // After a successful toggle we hold server-confirmed local state for one poll
  // interval. `GET /api/todo/state` is a plain read, NOT serialized with the
  // toggle's atomic write, so a poll that read the file *before* our write
  // landed can resolve *after* the request settles (past the pendingRef guard)
  // and revert the item. Silencing polls for the TTL lets the next fresh poll
  // catch up — same guard `useChoreData` uses for the rewards balance.
  const overrideUntilRef = useRef<number>(0);

  const [fetchedState] = useFetchData<TodoState>(
    interactive ? todoStateUrl() : '',
    TODO_STATE_TTL_MS,
  );

  useEffect(() => {
    if (!fetchedState) return;
    // Drop polls inside the post-toggle override window — they may predate our
    // last write and would otherwise flash the old value back.
    if (Date.now() < overrideUntilRef.current) return;
    setOverrides((prev) => {
      const next: Record<string, boolean> = { ...(fetchedState.completed ?? {}) };
      // Preserve optimistic values for items still mid-request.
      for (const id of pendingRef.current) {
        if (id in prev) next[id] = prev[id];
      }
      return next;
    });
    // pendingRef is a stable ref from useOptimisticMutation; listed to satisfy
    // exhaustive-deps without changing when this effect runs.
  }, [fetchedState, pendingRef]);

  // Merge runtime overrides over authored defaults for render. When the module
  // is not interactive (read-only, or tap-mode turned off in the editor), render
  // the authored items verbatim — runtime overrides from a prior interactive
  // session must not leak into the static view.
  const items = useMemo<TodoItem[]>(
    () =>
      interactive
        ? authoredItems.map((it) => ({
            ...it,
            completed: it.id in overrides ? overrides[it.id] : it.completed,
          }))
        : authoredItems,
    [interactive, authoredItems, overrides],
  );

  const toggle = useCallback(
    (itemId: string) => {
      tapHint.dismiss();
      void press(itemId, () => runToggle(itemId, {
        apply: () => {
          const authored = authoredMapRef.current[itemId] ?? false;
          // Optimistic flip — read the current effective value (override, else
          // authored default) inside the updater so it's computed from live state.
          setOverrides((prev) => {
            const cur = itemId in prev ? prev[itemId] : authored;
            return { ...prev, [itemId]: !cur };
          });
        },
        request: async () => {
          const res = await displayFetch('/api/todo/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayId, screenId, moduleId, itemId }),
          });
          if (!res.ok) throw new Error('Failed to toggle');
          const data: TodoState = await res.json();
          const serverVal = data.completed?.[itemId];
          if (typeof serverVal === 'boolean') {
            setOverrides((prev) => ({ ...prev, [itemId]: serverVal }));
          }
          // Prime the shared cache so sibling todo instances / the next poll see
          // post-write state, and hold local state for one TTL so a stale
          // in-flight poll can't revert this confirmed flip.
          displayCache.set(todoStateUrl(), data, TODO_STATE_TTL_MS);
          overrideUntilRef.current = Date.now() + TODO_STATE_TTL_MS;
        },
        // Surgical revert: flip ONLY this item back. The optimistic value is
        // still in `prev` (the pending guard kept polls from touching it and
        // the double-tap guard blocks a second toggle), so `!prev[itemId]`
        // restores the exact pre-toggle value without a stale snapshot.
        rollback: () => {
          setOverrides((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
        },
      }));
    },
    [displayId, screenId, moduleId, runToggle, press, tapHint],
  );

  if (items.length === 0) {
    return <ModuleEmptyState style={style} type="todo" message={t('todo.noTasksYet')} />;
  }

  const doneCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="flex flex-col h-full relative" style={{ fontSize: `${scaledFontSize}px` }}>
        <div className="flex items-baseline justify-between mb-3">
          {config.showTitle !== false && (
            <h2 className="font-semibold" style={{ fontSize: '1.25em' }}>
              {title}
            </h2>
          )}
          <MetadataText className="tabular-nums ml-auto">
            {doneCount}/{totalCount}
          </MetadataText>
        </div>
        <ul className="flex flex-col">
          {items.map((item, i) => {
            const borderBottom = i < items.length - 1 ? `1px solid ${DIVIDER.default}` : 'none';
            const opacity = item.completed ? TEXT_OPACITY.tertiary : TEXT_OPACITY.primary;

            if (interactive) {
              const pressed = pressedId === item.id;
              return (
                <li key={item.id} style={{ borderBottom }}>
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    aria-pressed={item.completed}
                    data-pressed={pressed ? '' : undefined}
                    className="flex items-center gap-3 w-full text-left py-2 cursor-pointer select-none transition-colors rounded-lg"
                    style={{
                      minHeight: 48,
                      opacity,
                      touchAction: 'pan-y',
                      // The pressed row tints while its tap is in flight.
                      backgroundColor: pressed ? ink(0.06) : undefined,
                      margin: pressed ? '0 -0.5em' : undefined,
                      padding: pressed ? '0.5em 0.5em' : undefined,
                      width: pressed ? 'calc(100% + 1em)' : undefined,
                    }}
                  >
                    <TodoRow item={item} accentColor={accentColor} tappable pressed={pressed} />
                  </button>
                </li>
              );
            }

            return (
              <li
                key={item.id}
                className="flex items-start gap-2 py-1.5"
                style={{ borderBottom, opacity }}
              >
                <TodoRow item={item} accentColor={accentColor} />
              </li>
            );
          })}
        </ul>
        {interactive && tapHint.phase !== 'hidden' && (
          <div
            data-testid="todo-tap-hint"
            role="status"
            className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full font-semibold pointer-events-none"
            style={{
              bottom: '0.4em',
              fontSize: '0.8em',
              padding: '0.45em 1.1em',
              // A light pill with its own dark text, readable on any card: chip ink.
              color: '#111',
              backgroundColor: 'rgba(255,255,255,0.92)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              opacity: tapHint.phase === 'fading' ? 0 : 1,
              transition: `opacity ${TAP_HINT_FADE_MS}ms ease`,
            }}
          >
            {t('todo.tapHint')}
          </div>
        )}
      </div>
    </ModuleWrapper>
  );
}
