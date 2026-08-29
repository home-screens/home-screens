'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { TodoConfig, TodoItem, ModuleStyle } from '@/types/config';
import type { TodoState } from '@/lib/todo-data';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState } from './ModuleStates';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { MetadataText } from './shared/MetadataText';
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
          <path d="M5.5 9.5L7.5 11.5L12.5 6.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : (
        <rect x="1" y="1" width="16" height="16" rx="4" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      )}
    </svg>
  );
}

/** Shared row contents (checkbox + label) so the static <li> and the
 *  interactive <button> render identically. */
function TodoRow({ item, accentColor }: { item: TodoItem; accentColor: string }) {
  return (
    <>
      <CheckIcon done={item.completed} color={accentColor} />
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
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.06);
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
      void runToggle(itemId, {
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
      });
    },
    [displayId, screenId, moduleId, runToggle],
  );

  if (items.length === 0) {
    return <ModuleEmptyState style={style} message={t('todo.noTasksYet')} />;
  }

  const doneCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="flex flex-col h-full" style={{ fontSize: `${scaledFontSize}px` }}>
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
              return (
                <li key={item.id} style={{ borderBottom }}>
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    aria-pressed={item.completed}
                    className="flex items-start gap-2 w-full text-left py-2.5 cursor-pointer select-none active:opacity-60 transition-opacity"
                    style={{ minHeight: 44, opacity, touchAction: 'pan-y' }}
                  >
                    <TodoRow item={item} accentColor={accentColor} />
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
      </div>
    </ModuleWrapper>
  );
}
