'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import type { TodoConfig, TodoCompletedPlacement, ModuleStyle } from '@/types/config';
import type { TodoList, TodoListItem } from '@/types/todos';
import type { FamilyMember } from '@/types/family';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState } from './ModuleStates';
import { TEXT_OPACITY, DIVIDER, ink, hasAccentColor } from '@/lib/constants';
import { MetadataText } from './shared/MetadataText';
import { TapCheckbox, TAP_CHECKBOX_ACCENT } from './shared/TapCheckbox';
import { usePressedKey } from './shared/usePressedKey';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { useTranslate, useFormattingLocale, type TranslateFn } from '@/i18n';
import { classifyDue, formatDueLabel, localISODate, parseISODate } from '@/lib/todo-due-labels';
import { createTZDate } from '@/lib/timezone';
import { useFetchData } from '@/hooks/useFetchData';
import { useOptimisticMutation } from '@/hooks/useOptimisticMutation';
import { displayFetch } from '@/lib/display-fetch';
import { displayCache } from '@/lib/display-cache';
import { todoListsUrl, familyUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';

/** Poll interval for the shared lists, from the registry so prefetch and the
 *  hook stay in lockstep. */
const TODO_TTL_MS = FETCH_KEY_REGISTRY['todo']?.ttlMs ?? 5_000;
/** Members change about never; one poll a minute keeps initials current. */
const MEMBERS_TTL_MS = FETCH_KEY_REGISTRY['family']?.ttlMs ?? 60_000;
/** Initials shown per item before the "+N" bubble (the five-plus-members rule). */
const MAX_INITIALS = 2;
/** Width of the ring that separates overlapping initial bubbles, in px. */
const RING_PX = 2;
/** The all-done green: a filled ring and its label, the same on every card. */
const ALL_DONE_GREEN = '#22c55e';
/** Overdue chips take the warning amber from the phone surface. */
const OVERDUE_AMBER = '#f59e0b';

/** How many open items the focus and progress views name before "and N more". */
const FOCUS_ITEMS = 3;
/** How many items a board column lists before "and N more". */
const BOARD_ITEMS = 5;

/** localStorage flag: the "tap a box" hint has been shown on this display. */
const TAP_HINT_SEEN_KEY = 'hs:todo-tap-hint-seen';
const TAP_HINT_SHOW_MS = 4_000;
const TAP_HINT_FADE_MS = 1_200;

type ListsPayload = { lists: TodoList[] };
type FamilyPayload = { members: FamilyMember[] };

const NO_MEMBERS: ReadonlyMap<string, FamilyMember> = new Map();

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
  /** Instance address, threaded by ScreenRenderer. Present only on the display. */
  displayId?: string;
  screenId?: string;
  moduleId?: string;
  /** The display's IANA timezone (Settings), applied to every module by buildModuleProps. */
  timezone?: string;
}

// ─── Pure helpers ───

/** Order items for the wall: done items sink, stay put, or leave. */
export function arrangeItems(items: TodoListItem[], placement: TodoCompletedPlacement | undefined): TodoListItem[] {
  if (placement === 'hidden') return items.filter((it) => !it.completed);
  if (placement === 'inline') return items;
  // `bottom` (the default): open first, then done, each group in store order.
  return [...items.filter((it) => !it.completed), ...items.filter((it) => it.completed)];
}

type DueTone = 'overdue' | 'today' | 'neutral';

/**
 * The chip for a due date, from the helper the phone uses so the two agree:
 * Overdue (never for a done item), Today, Tomorrow, the short weekday inside
 * the coming week, else a short date.
 */
export function describeDue(
  dueDate: string,
  now: Date,
  t: TranslateFn,
  locale: string,
  completed = false,
): { label: string; tone: DueTone } | null {
  if (!parseISODate(dueDate)) return null;
  const todayISO = localISODate(now);
  const kind = classifyDue(dueDate, todayISO, completed);
  const label = formatDueLabel(
    dueDate,
    todayISO,
    locale,
    { today: t('todo.due.today'), tomorrow: t('todo.due.tomorrow'), overdue: t('todo.due.overdue') },
    completed,
  );
  return { label, tone: kind === 'overdue' ? 'overdue' : kind === 'today' ? 'today' : 'neutral' };
}

function countDone(items: TodoListItem[]): { done: number; total: number } {
  let done = 0;
  for (const it of items) if (it.completed) done++;
  return { done, total: items.length };
}

// ─── Small presentational pieces ───

/** The static check glyph: an em-sized box so it follows the fitted type. */
function CheckIcon({ done, color, size = '1.2em' }: { done: boolean; color: string; size?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" className="shrink-0" aria-hidden="true">
      {done ? (
        <>
          <rect x="1" y="1" width="16" height="16" rx="4" fill={color} />
          {/* White for contrast on the accent-filled box: chip ink, not card ink. */}
          <path d="M5.5 9.5L7.5 11.5L12.5 6.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : (
        <rect x="1" y="1" width="16" height="16" rx="4" fill="none" stroke={ink(0.35)} strokeWidth="1.5" />
      )}
    </svg>
  );
}

/** Filled green check ring plus "All done", replacing a count wherever one sits. */
function AllDoneBadge({ label, size = 1 }: { label: string; size?: number }) {
  return (
    <span
      data-testid="todo-all-done"
      className="inline-flex items-center font-semibold whitespace-nowrap"
      style={{ gap: '0.32em', fontSize: `${0.8 * size}em`, color: ALL_DONE_GREEN }}
    >
      <span
        className="inline-flex items-center justify-center rounded-full shrink-0"
        style={{ width: '1.1em', height: '1.1em', backgroundColor: ALL_DONE_GREEN }}
        aria-hidden="true"
      >
        <svg width="0.7em" height="0.7em" viewBox="0 0 24 24" fill="none">
          {/* White on the green fill: chip ink, not card ink. */}
          <path d="M5 12.5L10 17.5L19 7" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label}
    </span>
  );
}

function DueChip({ label, tone, accentColor }: { label: string; tone: DueTone; accentColor: string }) {
  const tint = tone === 'overdue' ? OVERDUE_AMBER : tone === 'today' ? accentColor : undefined;
  return (
    <span
      data-testid="todo-due"
      data-tone={tone}
      className="shrink-0 rounded-full font-bold whitespace-nowrap"
      style={{
        fontSize: '0.5em',
        padding: '0.32em 0.72em',
        // Neutral chips are the card's ink; tinted ones mix the tint with it
        // so they stay legible on a light card too.
        color: tint ? `color-mix(in srgb, ${tint} 70%, ${ink(1)})` : ink(0.7),
        backgroundColor: tint ? `color-mix(in srgb, ${tint} 22%, transparent)` : ink(0.1),
      }}
    >
      {label}
    </span>
  );
}

/** Up to two initials in member colours, then a "+N" bubble. */
function Assignees({ ids, members }: { ids: string[]; members: ReadonlyMap<string, FamilyMember> }) {
  const known = ids.map((id) => members.get(id)).filter((m): m is FamilyMember => !!m);
  if (known.length === 0) return null;
  const shown = known.slice(0, MAX_INITIALS);
  const extra = known.length - shown.length;
  const bubble = 'inline-flex items-center justify-center rounded-full shrink-0 font-extrabold';
  const bubbleStyle = { width: '1.12em', height: '1.12em', fontSize: '0.48em', marginLeft: '-0.24em' } as const;
  const ring = `0 0 0 ${RING_PX}px ${ink(0.15)}`;
  return (
    // The ring around each bubble is drawn OUTSIDE its box, and the last
    // bubble sits flush against the row's edge, where the list's own
    // `overflow: hidden` (which keeps part-rows from showing) would slice it
    // flat. `RING_PX` of padding gives the ring its room back.
    <span
      data-testid="todo-assignees"
      className="inline-flex shrink-0"
      style={{ paddingLeft: '0.24em', paddingRight: RING_PX }}
    >
      {shown.map((m) => (
        <span
          key={m.id}
          className={bubble}
          title={m.name}
          // Dark on the member's colour: chip ink, not card ink.
          style={{ ...bubbleStyle, backgroundColor: m.color, color: '#111', boxShadow: ring }}
        >
          {m.name.trim().charAt(0).toUpperCase()}
        </span>
      ))}
      {extra > 0 && (
        <span className={bubble} style={{ ...bubbleStyle, backgroundColor: ink(0.15), color: ink(0.7) }}>
          +{extra}
        </span>
      )}
    </span>
  );
}

/** Title row: the list name and either the count or the all-done badge. */
function Header({ title, showTitle, done, total, right, t }: {
  title: string;
  showTitle: boolean;
  done: number;
  total: number;
  /** Replaces the count (the focus view's "N left"). */
  right?: ReactNode;
  t: TranslateFn;
}) {
  const allDone = total > 0 && done === total;
  return (
    <div className="flex items-baseline justify-between" style={{ marginBottom: '0.56em', gap: '0.5em' }}>
      {showTitle && (
        <h2 className="font-semibold truncate" style={{ fontSize: '1.25em', letterSpacing: '-0.01em' }}>
          {title}
        </h2>
      )}
      <span className="ml-auto shrink-0">
        {allDone ? <AllDoneBadge label={t('todo.allDone')} /> : right ?? (
          <MetadataText className="tabular-nums">{done}/{total}</MetadataText>
        )}
      </span>
    </div>
  );
}

/** "Starts fresh every day / week", shown under an all-done list that resets. */
function RepeatLine({ list, t, className = 'mt-auto' }: { list: TodoList; t: TranslateFn; className?: string }) {
  if (list.repeat !== 'daily' && list.repeat !== 'weekly') return null;
  return (
    <div data-testid="todo-repeat" className={className} style={{ fontSize: '0.6em', color: ink(0.45), paddingTop: '0.4em' }}>
      {list.repeat === 'daily' ? t('todo.startsFreshDaily') : t('todo.startsFreshWeekly')}
    </div>
  );
}

// ─── Fitting rows to the box ───

/**
 * How many of a list's rows fit the box whole. A wall module has no
 * scrollbar, so a list taller than its card used to clip whichever row fell
 * on the edge in half. Instead the rows that do not fit are dropped and an
 * "and N more" line takes the last slot, the way the focus and progress
 * views already count what they leave out.
 *
 * Every change to the rows (a poll, a tap, a resize) renders them all once,
 * measures, and then renders only the ones that fit; the layout effect runs
 * before paint so the full render never shows.
 */
function useFitRows(
  ulRef: React.RefObject<HTMLUListElement | null>,
  rowsKey: string,
  reservePx: number,
): number | null {
  const [visible, setVisible] = useState<number | null>(null);
  const [measureKey, setMeasureKey] = useState(rowsKey);
  if (measureKey !== rowsKey) {
    // A new set of rows: show them all for one render so they can be measured.
    setMeasureKey(rowsKey);
    setVisible(null);
  }
  const measure = useCallback(() => {
    const ul = ulRef.current;
    if (!ul) return;
    const rows = Array.from(ul.children) as HTMLElement[];
    const box = ul.getBoundingClientRect();
    if (box.height <= 0) return;
    // Fractional rects, with a pixel of slack: rows are often n.5px tall,
    // and rounded offsets put the last row a pixel past a rounded height
    // that it fits in perfectly well.
    const limit = box.bottom + 1;
    const bottoms = rows.map((r) => r.getBoundingClientRect().bottom);
    let fit = rows.length;
    for (let i = 0; i < rows.length; i++) {
      if (bottoms[i] > limit) { fit = i; break; }
    }
    if (fit >= rows.length) { setVisible((v) => (v === null ? v : null)); return; }
    // Something has to go: leave room for the "and N more" line too.
    while (fit > 0 && bottoms[fit - 1] > limit - reservePx) fit--;
    setVisible((v) => (v === fit ? v : fit));
  }, [ulRef, reservePx]);
  useLayoutEffect(() => {
    if (visible === null) measure();
  }, [visible, measure, rowsKey]);
  useEffect(() => {
    const ul = ulRef.current;
    if (!ul || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setVisible(null));
    ro.observe(ul);
    return () => ro.disconnect();
  }, [ulRef]);
  return visible;
}

function rowsKeyOf(items: TodoListItem[]): string {
  return items.map((it) => `${it.id}:${it.completed ? 1 : 0}:${it.text.length}`).join('|');
}

/** "and N more" under a list that did not fit. */
function MoreLine({ n, t }: { n: number; t: TranslateFn }) {
  return (
    <div data-testid="todo-more" style={{ fontSize: '0.7em', color: ink(0.5), paddingTop: '0.3em' }}>
      {t('todo.andMore', { n })}
    </div>
  );
}

// ─── Rows ───

interface RowContext {
  accentColor: string;
  showDueDates: boolean;
  showAssignees: boolean;
  members: ReadonlyMap<string, FamilyMember>;
  now: Date;
  locale: string;
  t: TranslateFn;
}

/** Row contents: the box, the text, then any due chip and initials. */
function RowBody({ item, ctx, tappable, pressed, boxSize }: {
  item: TodoListItem;
  ctx: RowContext;
  tappable: boolean;
  pressed: boolean;
  /** Tap checkbox size in px; the static glyph is em-sized. */
  boxSize?: number;
}) {
  const due = ctx.showDueDates && item.dueDate ? describeDue(item.dueDate, ctx.now, ctx.t, ctx.locale, item.completed) : null;
  return (
    <>
      {tappable ? (
        <TapCheckbox checked={item.completed} pressed={pressed} color={ctx.accentColor} size={boxSize} />
      ) : (
        <CheckIcon done={item.completed} color={ctx.accentColor} />
      )}
      <span
        className="line-clamp-2 flex-1 min-w-0"
        style={{
          lineHeight: 1.2,
          textDecoration: item.completed ? 'line-through' : 'none',
          textDecorationColor: item.completed ? ctx.accentColor : undefined,
        }}
      >
        {item.text}
      </span>
      {due && <DueChip label={due.label} tone={due.tone} accentColor={ctx.accentColor} />}
      {ctx.showAssignees && item.assigneeIds && item.assigneeIds.length > 0 && (
        <Assignees ids={item.assigneeIds} members={ctx.members} />
      )}
    </>
  );
}

/** One list row: a tap target when the wall can check it off, a plain row otherwise. */
function Row({ item, listId, ctx, tappable, pressed, onToggle, last, dense }: {
  item: TodoListItem;
  listId: string;
  ctx: RowContext;
  tappable: boolean;
  pressed: boolean;
  onToggle: (listId: string, item: TodoListItem) => void;
  last: boolean;
  /** Board columns: tighter rows and a smaller tap box. */
  dense?: boolean;
}) {
  const borderBottom = last || dense ? 'none' : `1px solid ${DIVIDER.default}`;
  const opacity = item.completed ? TEXT_OPACITY.dim : TEXT_OPACITY.primary;
  if (tappable) {
    return (
      <li style={{ borderBottom }}>
        <button
          type="button"
          data-testid="todo-item"
          onClick={() => onToggle(listId, item)}
          aria-pressed={item.completed}
          data-pressed={pressed ? '' : undefined}
          className="flex items-center w-full text-left cursor-pointer select-none transition-colors rounded-lg"
          style={{
            gap: dense ? '0.4em' : '0.56em',
            padding: dense ? '0.24em 0' : '0.4em 0',
            minHeight: dense ? 44 : 48,
            opacity,
            touchAction: 'pan-y',
            // The pressed row tints while its tap is in flight.
            backgroundColor: pressed ? ink(0.06) : undefined,
            margin: pressed ? '0 -0.5em' : undefined,
            paddingLeft: pressed ? '0.5em' : undefined,
            paddingRight: pressed ? '0.5em' : undefined,
            width: pressed ? 'calc(100% + 1em)' : undefined,
          }}
        >
          <RowBody item={item} ctx={ctx} tappable pressed={pressed} boxSize={dense ? 28 : undefined} />
        </button>
      </li>
    );
  }
  return (
    <li
      data-testid="todo-item"
      className="flex items-center"
      style={{
        gap: dense ? '0.4em' : '0.56em',
        padding: dense ? '0.32em 0' : '0.48em 0',
        minHeight: dense ? undefined : '2.08em',
        borderBottom,
        opacity,
      }}
    >
      <RowBody item={item} ctx={ctx} tappable={false} pressed={false} />
    </li>
  );
}

// ─── Module ───

export default function TodoModule({ config, style, screenId, moduleId, timezone }: TodoModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const { containerRef, scaledFontSize } = useScaledFontSize(style, 0.06);
  // A black accent (the pre-v2 default) reads as a hole on a dark card once a
  // box is filled; the shared tap-checkbox blue stands in for it.
  const accentColor = hasAccentColor(config.accentColor) ? config.accentColor : TAP_CHECKBOX_ACCENT;
  const view = config.view ?? 'list';
  const placement = config.completedPlacement ?? 'bottom';
  const showDueDates = config.showDueDates !== false;
  const showAssignees = config.showAssignees !== false;

  // Interactive only when opted in AND the renderer threaded the instance
  // address. The editor preview (no screenId/moduleId) stays static. Only the
  // views that draw a checkbox take taps.
  const interactive = !!config.interactive && !!screenId && !!moduleId;
  const tappable = interactive && (view === 'list' || view === 'board');

  const [fetched, fetchError] = useFetchData<ListsPayload>(todoListsUrl(), TODO_TTL_MS);
  const serverLists = useMemo(() => fetched?.lists ?? [], [fetched]);

  // Optimistic completion overrides (itemId to completed), applied over the
  // polled lists and cleared by the next poll outside the post-write window.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  // Shared optimistic-mutation runner. Its `pending` set holds ids with a
  // request in flight; polls keep their optimistic value so a response that
  // predates the tap can't flash the old value back.
  const { run: runToggle, pending: pendingRef } = useOptimisticMutation();
  const [pressedId, press] = usePressedKey();
  const tapHint = useTapHint(tappable);
  // After a successful write we hold local state for one poll interval. The
  // lists GET is a plain read, not serialized with the write, so a poll that
  // read the file before our write landed can resolve after the request
  // settles (past the pending guard) and revert the item. Silencing polls for
  // the TTL lets the next fresh poll catch up.
  const overrideUntilRef = useRef<number>(0);

  useEffect(() => {
    if (!fetched) return;
    if (Date.now() < overrideUntilRef.current) return;
    setOverrides((prev) => {
      const next: Record<string, boolean> = {};
      for (const id of pendingRef.current) {
        if (id in prev) next[id] = prev[id];
      }
      // Same keys and values: keep the object so the poll doesn't re-render.
      const prevKeys = Object.keys(prev);
      if (prevKeys.length === Object.keys(next).length && prevKeys.every((k) => next[k] === prev[k])) return prev;
      return next;
    });
    // pendingRef is a stable ref from useOptimisticMutation; listed to satisfy
    // exhaustive-deps without changing when this effect runs.
  }, [fetched, pendingRef]);

  const lists = useMemo<TodoList[]>(() => {
    if (Object.keys(overrides).length === 0) return serverLists;
    return serverLists.map((list) => ({
      ...list,
      items: list.items.map((it) => (it.id in overrides ? { ...it, completed: overrides[it.id] } : it)),
    }));
  }, [serverLists, overrides]);

  const list = useMemo(
    () => (config.listId ? lists.find((l) => l.id === config.listId) ?? null : null),
    [lists, config.listId],
  );

  // The roster is fetched only while some visible item names someone, so a
  // household that never assigns anything never makes the request. Several
  // cards cost one: useFetchData shares a request per URL.
  const visibleLists = view === 'board' ? lists : list ? [list] : [];
  const needsMembers = showAssignees
    && visibleLists.some((l) => l.items.some((it) => it.assigneeIds && it.assigneeIds.length > 0));
  const [membersData] = useFetchData<FamilyPayload>(needsMembers ? familyUrl() : '', MEMBERS_TTL_MS);
  const members = useMemo<ReadonlyMap<string, FamilyMember>>(
    () => (membersData?.members ? new Map(membersData.members.map((m) => [m.id, m])) : NO_MEMBERS),
    [membersData],
  );

  const toggle = useCallback(
    (listId: string, item: TodoListItem) => {
      tapHint.dismiss();
      const before = item.completed;
      const next = !before;
      void press(item.id, () => runToggle(item.id, {
        apply: () => setOverrides((prev) => ({ ...prev, [item.id]: next })),
        request: async () => {
          const res = await displayFetch(
            `/api/todo/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(item.id)}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ completed: next }),
            },
          );
          if (!res.ok) throw new Error('Failed to update the item');
          const data: ListsPayload = await res.json();
          const serverItem = data.lists?.find((l) => l.id === listId)?.items.find((it) => it.id === item.id);
          if (serverItem) {
            setOverrides((prev) => ({ ...prev, [item.id]: serverItem.completed }));
          }
          // Prime the shared cache so sibling todo instances and the next poll
          // see post-write state, and hold local state for one TTL so a stale
          // in-flight poll can't revert this confirmed flip.
          displayCache.set(todoListsUrl(), data, TODO_TTL_MS);
          overrideUntilRef.current = Date.now() + TODO_TTL_MS;
        },
        // Surgical revert: only this item goes back to what it showed before
        // the tap (the double-tap guard blocks a second flip in between).
        rollback: () => setOverrides((prev) => ({ ...prev, [item.id]: before })),
      }));
    },
    [runToggle, press, tapHint],
  );

  // "Today" for the due chips is the household's day, not the Pi's: the
  // shipped image keeps the OS on UTC, so an item due today would read
  // Overdue from early evening onwards otherwise.
  const now = createTZDate(timezone);
  const ctx: RowContext = { accentColor, showDueDates, showAssignees, members, now, locale, t };

  // First fetch still in flight: a plain card, never a crash. A failed fetch
  // falls through to the empty states below rather than a blank card forever.
  if (!fetched && !fetchError) {
    return (
      <ModuleWrapper style={style}>
        <div ref={containerRef} className="h-full" />
      </ModuleWrapper>
    );
  }

  const shell = (body: ReactNode) => (
    <ModuleWrapper style={style}>
      <div
        ref={containerRef}
        data-testid="todo-module"
        data-view={view}
        className="flex flex-col h-full relative"
        style={{ fontSize: `${scaledFontSize}px` }}
      >
        {body}
        {tappable && tapHint.phase !== 'hidden' && (
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

  if (view === 'board') {
    if (lists.length === 0) {
      return <ModuleEmptyState style={style} type="todo" message={t('todo.noListsYet')} />;
    }
    return shell(
      <BoardView lists={lists} placement={placement} ctx={ctx} tappable={tappable} pressedId={pressedId} onToggle={toggle} />,
    );
  }

  if (!list) {
    return <ModuleEmptyState style={style} type="todo" message={t('todo.pickAList')} />;
  }
  if (list.items.length === 0) {
    return <ModuleEmptyState style={style} type="todo" message={t('todo.noTasksYet')} />;
  }

  const viewProps: ViewProps = {
    list,
    title: config.title?.trim() || list.name,
    showTitle: config.showTitle !== false,
    placement,
    accentColor,
    t,
  };

  if (view === 'focus') return shell(<FocusView {...viewProps} />);
  if (view === 'progress') return shell(<ProgressView {...viewProps} />);
  if (view === 'compact') return shell(<CompactView {...viewProps} fontPx={scaledFontSize} />);
  return shell(
    <ListView {...viewProps} ctx={ctx} tappable={tappable} pressedId={pressedId} onToggle={toggle} fontPx={scaledFontSize} />,
  );
}

// ─── Views ───

interface ViewProps {
  list: TodoList;
  title: string;
  showTitle: boolean;
  placement: TodoCompletedPlacement;
  accentColor: string;
  t: TranslateFn;
}

interface TappableViewProps extends ViewProps {
  ctx: RowContext;
  tappable: boolean;
  pressedId: string | null;
  onToggle: (listId: string, item: TodoListItem) => void;
}

function ListView({ list, title, showTitle, placement, ctx, tappable, pressedId, onToggle, fontPx }: TappableViewProps & { fontPx: number }) {
  const { done, total } = countDone(list.items);
  const items = arrangeItems(list.items, placement);
  const allDone = total > 0 && done === total;
  const ulRef = useRef<HTMLUListElement>(null);
  const visible = useFitRows(ulRef, rowsKeyOf(items), fontPx * 1.3);
  const shown = visible === null ? items : items.slice(0, visible);
  const more = items.length - shown.length;
  return (
    <>
      <Header title={title} showTitle={showTitle} done={done} total={total} t={ctx.t} />
      <ul ref={ulRef} className="relative flex flex-col min-h-0 overflow-hidden">
        {shown.map((item, i) => (
          <Row
            key={item.id}
            item={item}
            listId={list.id}
            ctx={ctx}
            tappable={tappable}
            pressed={pressedId === item.id}
            onToggle={onToggle}
            last={i === shown.length - 1}
          />
        ))}
      </ul>
      {more > 0 && <MoreLine n={more} t={ctx.t} />}
      {allDone && <RepeatLine list={list} t={ctx.t} />}
    </>
  );
}

function FocusView({ list, title, showTitle, placement, accentColor, t }: ViewProps) {
  const { done, total } = countDone(list.items);
  const allDone = total > 0 && done === total;
  const open = list.items.filter((it) => !it.completed);
  // The next three open items; once everything is done the finished items
  // stand in (struck through) so the card never goes blank, unless hidden.
  const pool = open.length > 0 ? open : arrangeItems(list.items, placement);
  const shown = pool.slice(0, FOCUS_ITEMS);
  const more = pool.length - shown.length;
  const sizes = ['1.55em', '1.15em', '1.15em'];
  const weights = [700, 600, 600];
  const opacities = [1, 0.85, 0.6];
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <>
      <Header
        title={title}
        showTitle={showTitle}
        done={done}
        total={total}
        right={<MetadataText className="tabular-nums">{t('todo.nLeft', { n: open.length })}</MetadataText>}
        t={t}
      />
      {!allDone && (
        <div className="font-bold uppercase" style={{ fontSize: '0.6em', letterSpacing: '0.12em', color: ink(0.5), marginBottom: '0.32em' }}>
          {t('todo.upNext')}
        </div>
      )}
      <div className="flex flex-col min-h-0 overflow-hidden">
        {shown.map((item, i) => (
          <div
            key={item.id}
            data-testid="todo-item"
            className="line-clamp-2"
            style={{
              fontSize: sizes[i],
              fontWeight: weights[i],
              opacity: item.completed ? TEXT_OPACITY.dim : opacities[i],
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              marginBottom: '0.36em',
              textDecoration: item.completed ? 'line-through' : 'none',
              textDecorationColor: item.completed ? accentColor : undefined,
            }}
          >
            {item.text}
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-col" style={{ gap: '0.4em', paddingTop: '0.4em' }}>
        {more > 0 && (
          <div style={{ fontSize: '0.7em', color: ink(0.5) }}>{t('todo.andMore', { n: more })}</div>
        )}
        {allDone && <RepeatLine list={list} t={t} className="" />}
        <div
          style={{ height: '0.24em', borderRadius: '0.12em', backgroundColor: ink(0.14), overflow: 'hidden' }}
          aria-hidden="true"
        >
          <div style={{ height: '100%', width: `${pct}%`, backgroundColor: allDone ? ALL_DONE_GREEN : accentColor, transition: 'width 300ms ease' }} />
        </div>
      </div>
    </>
  );
}

function ProgressView({ list, title, showTitle, placement, accentColor, t }: ViewProps) {
  const { done, total } = countDone(list.items);
  const allDone = total > 0 && done === total;
  // The open items by name; once everything is done the finished ones stand
  // in (struck through) so the card never goes blank, unless hidden.
  const open = list.items.filter((it) => !it.completed);
  const pool = open.length > 0 ? open : arrangeItems(list.items, placement);
  const named = pool.slice(0, FOCUS_ITEMS);
  const more = pool.length - named.length;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const frac = total > 0 ? done / total : 0;
  return (
    <div className="flex flex-col items-center text-center h-full">
      {/* The ring and its captions read as one centred block: packed to the
          top they leave the whole lower half of a tall card empty. The
          repeat line stays under them, at the bottom of the card. */}
      <div className="flex flex-1 min-h-0 w-full flex-col items-center justify-center">
      <div className="relative shrink-0" style={{ width: '7.6em', height: '7.6em', marginBottom: '0.48em' }}>
        <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx="50" cy="50" r={radius} stroke={ink(0.14)} strokeWidth="10" fill="none" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke={allDone ? ALL_DONE_GREEN : accentColor}
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - frac)}
            style={{ transition: 'stroke-dashoffset 300ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular-nums" style={{ fontSize: '2em', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }}>
            {done}
            <span style={{ fontSize: '0.5em', opacity: 0.5, margin: '0 0.12em', fontWeight: 400 }}>{t('todo.of')}</span>
            {total}
          </span>
          {allDone ? (
            <span style={{ marginTop: '0.24em' }}><AllDoneBadge label={t('todo.allDone')} size={0.75} /></span>
          ) : (
            <span style={{ fontSize: '0.6em', color: ink(0.55), marginTop: '0.24em' }}>{t('todo.done')}</span>
          )}
        </div>
      </div>
      {showTitle && (
        <div className="font-semibold truncate max-w-full" style={{ fontSize: '1.1em' }}>{title}</div>
      )}
      {named.length > 0 && (
        <div style={{ fontSize: '0.68em', color: ink(0.6), marginTop: '0.32em', lineHeight: 1.5 }}>
          <span className="line-clamp-2">
            {named.map((it, i) => (
              <span
                key={it.id}
                data-testid="todo-item"
                style={{ textDecoration: it.completed ? 'line-through' : 'none', textDecorationColor: it.completed ? accentColor : undefined }}
              >
                {it.text}{i < named.length - 1 ? ', ' : ''}
              </span>
            ))}
          </span>
          {more > 0 && <div>{t('todo.andMore', { n: more })}</div>}
        </div>
      )}
      </div>
      {allDone && <RepeatLine list={list} t={t} className="" />}
    </div>
  );
}

function CompactView({ list, title, showTitle, placement, accentColor, t, fontPx }: ViewProps & { fontPx: number }) {
  const { done, total } = countDone(list.items);
  const allDone = total > 0 && done === total;
  const items = arrangeItems(list.items, placement);
  const ulRef = useRef<HTMLUListElement>(null);
  const visible = useFitRows(ulRef, rowsKeyOf(items), fontPx * 1.1);
  const shown = visible === null ? items : items.slice(0, visible);
  const more = items.length - shown.length;
  return (
    <>
      <Header title={title} showTitle={showTitle} done={done} total={total} t={t} />
      <ul ref={ulRef} className="relative flex flex-col min-h-0 overflow-hidden">
        {shown.map((item) => (
          <li
            key={item.id}
            data-testid="todo-item"
            className="flex items-center"
            style={{ gap: '0.4em', padding: '0.28em 0', fontSize: '0.85em', opacity: item.completed ? TEXT_OPACITY.secondary : TEXT_OPACITY.primary }}
          >
            <span
              className="rounded-full shrink-0"
              style={{ width: '0.32em', height: '0.32em', backgroundColor: item.completed ? ink(0.35) : accentColor }}
              aria-hidden="true"
            />
            <span
              className="truncate"
              style={{ lineHeight: 1.2, textDecoration: item.completed ? 'line-through' : 'none', textDecorationColor: item.completed ? accentColor : undefined }}
            >
              {item.text}
            </span>
          </li>
        ))}
      </ul>
      {more > 0 && <MoreLine n={more} t={t} />}
      {allDone && <RepeatLine list={list} t={t} />}
    </>
  );
}

function BoardView({ lists, placement, ctx, tappable, pressedId, onToggle }: {
  lists: TodoList[];
  placement: TodoCompletedPlacement;
  ctx: RowContext;
  tappable: boolean;
  pressedId: string | null;
  onToggle: (listId: string, item: TodoListItem) => void;
}) {
  return (
    <div className="flex h-full min-h-0" style={{ gap: '0.96em' }}>
      {lists.map((list) => {
        const { done, total } = countDone(list.items);
        const allDone = total > 0 && done === total;
        const items = arrangeItems(list.items, placement);
        const shown = items.slice(0, BOARD_ITEMS);
        const more = items.length - shown.length;
        return (
          <div key={list.id} data-testid="todo-board-column" className="flex flex-col flex-1 min-w-0">
            <div
              className="flex items-center"
              style={{ gap: '0.4em', marginBottom: '0.4em', paddingBottom: '0.4em', borderBottom: `2px solid ${ink(0.14)}` }}
            >
              <span
                className="rounded-full shrink-0"
                style={{ width: '0.48em', height: '0.48em', backgroundColor: list.color || ctx.accentColor }}
                aria-hidden="true"
              />
              <span className="font-bold truncate flex-1" style={{ fontSize: '0.95em' }}>{list.name}</span>
              {allDone ? (
                <AllDoneBadge label={ctx.t('todo.allDone')} size={0.78} />
              ) : (
                <span className="tabular-nums shrink-0" style={{ fontSize: '0.62em', color: ink(0.55) }}>
                  {ctx.t('todo.nLeft', { n: total - done })}
                </span>
              )}
            </div>
            <ul className="flex flex-col min-h-0 overflow-hidden" style={{ fontSize: '0.82em' }}>
              {shown.map((item, i) => (
                <Row
                  key={item.id}
                  item={item}
                  listId={list.id}
                  ctx={ctx}
                  tappable={tappable}
                  pressed={pressedId === item.id}
                  onToggle={onToggle}
                  last={i === shown.length - 1}
                  dense
                />
              ))}
            </ul>
            {more > 0 && (
              <div style={{ fontSize: '0.62em', color: ink(0.45), marginTop: '0.24em' }}>{ctx.t('todo.andMore', { n: more })}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
