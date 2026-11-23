'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, TriangleAlert, Undo2 } from 'lucide-react';
import type { MealCourseKind, MealSlotType, SavedMeal } from '@/types/config';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { displayFetch } from '@/lib/display-fetch';
import { grownUpFetch, isGrownUpCancelled } from '@/lib/grown-up-client';
import { MealClientError, sendWallPlanChange, type WallPlanAnswer, type WallPlanRefusal } from '@/lib/meal-client';
import { fromISODate } from '@/lib/meal-constants';
import { wallPlanKind, type WallPlanChange, type WallPlanOutcome } from '@/lib/meal-plan-wall';
import { COURSE_KINDS, getMealCourseLabelKey } from '@/lib/meal-courses';
import { mealieClientProblem, type MealieClientProblem } from '@/lib/meal-client';
import { mealieTitleKey, mealieWords } from './mealie-problem';
import { UNDO_WINDOW_MS } from '@/lib/undo-window';
import type { Px } from './recipe-book/RecipeBookParts';
import { wallPressProps } from './wallPress';

/**
 * The pieces the wall's two ways of planning a meal share (the day sheet a
 * recipe opens and the recipe book an empty meal opens): sending one change,
 * the words for a day and a meal, and the line that says what happened with
 * its Undo.
 */

/** How long a planning sheet waits with nobody touching it, like the look-ahead arrows' way back. */
export const WALL_MENU_IDLE_MS = 60_000;

export type WallMenuSent =
  | { state: 'done'; wall: WallPlanAnswer }
  | { state: 'refused'; reason: WallPlanRefusal }
  /** Nobody gave the grown-up code: nothing was sent and nothing needs saying. */
  | { state: 'cancelled' }
  /** `problem`: why, when the hub said Mealie was the trouble; else the hub itself did not answer. */
  | { state: 'failed'; problem?: MealieClientProblem };

/** Send one change (or an Undo) to the hub, asking for the grown-up code when the household wants it. */
export function useWallMenuSend(): (body: WallPlanChange | { undo: string }) => Promise<WallMenuSent> {
  const t = useTranslate('modules');
  const why = t('meal-planner.menu.codeWhy');
  return useCallback(async (body) => {
    try {
      const sent = await sendWallPlanChange(grownUpFetch(displayFetch, why), body);
      return sent.ok ? { state: 'done', wall: sent.wall } : { state: 'refused', reason: sent.reason };
    } catch (err) {
      if (isGrownUpCancelled(err)) return { state: 'cancelled' };
      const problem = mealieClientProblem(err);
      // `connection` is this wall not reaching Home Screens; anything else names Mealie.
      return err instanceof MealClientError && err.problem ? { state: 'failed', problem } : { state: 'failed' };
    }
  }, [why]);
}

export interface WallMenuWords {
  /** "Thursday" this week; "Thursday Dec 3" further out, so next week's Thursday is never taken for this one. */
  day: (date: string) => string;
  /** A day and a meal as one place on the menu: "Thursday dinner". */
  when: (date: string, slot: MealSlotType) => string;
}

export function useWallMenuWords(thisWeek: readonly string[]): WallMenuWords {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  return useMemo(() => {
    // A dated day without the comma a locale puts after the weekday: it sits mid-sentence ("Para la cena del lunes 30 nov ya hay...").
    const day = (date: string) => {
      const d = fromISODate(date);
      const weekday = d.toLocaleDateString(locale, { weekday: 'long' });
      return thisWeek.includes(date) ? weekday : `${weekday} ${d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}`;
    };
    return { day, when: (date, slot) => t(`meal-planner.menu.when.${slot}`, { day: day(date) }) };
  }, [t, locale, thisWeek]);
}

/** A heading or sentence with its first letter large, for words that may open with a day name. */
export function capitalised(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** `wallPlanKind` with the words for a side, a dessert and a drink in the wall's language, for a household whose Mealie categories are in it. */
export function useWallPlanKind(): (meal: SavedMeal) => MealCourseKind {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  return useMemo(() => {
    const words = Object.fromEntries(COURSE_KINDS.map((kind) => [kind, [t(getMealCourseLabelKey(kind)), tCore(`meal.kind.${kind}`)]]));
    return (meal: SavedMeal) => wallPlanKind(meal, words);
  }, [t, tCore]);
}

/**
 * How long a planning sheet takes no tap after what is under the finger
 * changed: it just opened, a question opened or closed in it, or a change
 * landed. The second tap of a double tap lands in that moment, on whatever
 * is there now, and must never plan, swap or take off something nobody chose.
 */
export const WALL_MENU_TAP_GUARD_MS = 700;

/** The guard itself: `hush()` starts the quiet moment, `quiet()` says whether a tap falls inside it. Quiet from the moment the sheet opens. */
export function useTapGuard(): { hush: () => void; quiet: () => boolean } {
  const until = useRef(0);
  const hush = useCallback(() => { until.current = Date.now() + WALL_MENU_TAP_GUARD_MS; }, []);
  useEffect(hush, [hush]);
  return useMemo(() => ({ hush, quiet: () => Date.now() < until.current }), [hush]);
}

/** What the line under the days says. `undo` is the hub's ticket for taking the change back. */
export interface WallMenuStatus {
  tone: 'ok' | 'warn' | 'error';
  title: string;
  detail?: string;
  undo?: string;
}

/** The sentence for what a change did. */
export function outcomeKey(outcome: WallPlanOutcome | undefined): string {
  return `meal-planner.menu.did.${outcome ?? 'planned'}`;
}

/**
 * Where a planned recipe's ingredients went: Mealie keeps its own list, and a
 * plan kept in Home Screens builds each week's list from that week's meals.
 * Nothing for a recipe with no ingredients.
 */
export function groceryWords(t: (key: string) => string, meal: Pick<SavedMeal, 'ingredients'>, planInMealie: boolean, thisWeek: boolean): string | undefined {
  if (planInMealie) return t('meal-planner.menu.savedMealie');
  if (!(meal.ingredients ?? []).some((i) => i.name?.trim())) return undefined;
  return t(thisWeek ? 'meal-planner.menu.groceryThis' : 'meal-planner.menu.groceryNext');
}

/**
 * The second line of a failure: Mealie's own trouble in the words every
 * surface uses for it ("Can't reach Mealie right now"), else Home Screens
 * not answering.
 */
export function useFailureWords(): (problem: MealieClientProblem | undefined) => string {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  return useCallback((problem) => (problem && problem !== 'connection'
    ? tCore(mealieTitleKey(mealieWords(problem)))
    : t('meal-planner.menu.problem.failedDetail')), [t, tCore]);
}

/** The words for a change the hub would not make. */
export function refusalKeys(reason: WallPlanRefusal): { tone: 'warn' | 'error'; title: string; detail?: string } {
  if (reason === 'full') return { tone: 'warn', title: 'meal-planner.menu.problem.full' };
  if (reason === 'off') return { tone: 'warn', title: 'meal-planner.menu.problem.off' };
  if (reason === 'moved') return { tone: 'warn', title: 'meal-planner.menu.problem.undoLate' };
  if (reason === 'day') return { tone: 'warn', title: 'meal-planner.menu.problem.day' };
  return { tone: 'warn', title: 'meal-planner.menu.problem.changed', detail: 'meal-planner.menu.problem.changedDetail' };
}

/**
 * A status that offers its Undo only for the usual few seconds
 * (`UNDO_WINDOW_MS`): after that the line stays and the button goes.
 */
export function useWallMenuStatus(): {
  status: WallMenuStatus | null;
  canUndo: boolean;
  show: (status: WallMenuStatus | null) => void;
} {
  const [status, setStatus] = useState<WallMenuStatus | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = useCallback((next: WallMenuStatus | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setStatus(next);
    setCanUndo(!!next?.undo);
    if (next?.undo) timer.current = setTimeout(() => setCanUndo(false), UNDO_WINDOW_MS);
  }, []);
  return { status, canUndo, show };
}

const TONE = { ok: '#16a34a', warn: '#f59e0b', error: '#ef4444' } as const;

/** The line itself: green for done (with Undo while it lasts), amber or red for a change that was not made. */
export function WallMenuStatusLine({ status, canUndo, onUndo, busy, P, after, style }: {
  status: WallMenuStatus;
  canUndo: boolean;
  onUndo: () => void;
  busy: boolean;
  P: Px;
  /** Drawn at the line's end, after Undo. */
  after?: ReactNode;
  style?: React.CSSProperties;
}) {
  const t = useTranslate('modules');
  const hue = TONE[status.tone];
  const Icon = status.tone === 'ok' ? Check : status.tone === 'warn' ? TriangleAlert : CircleAlert;
  return (
    <div
      data-testid="wall-menu-status"
      data-tone={status.tone}
      role={status.tone === 'ok' ? 'status' : 'alert'}
      style={{
        display: 'flex', alignItems: 'center', gap: P(18), padding: `${P(16)}px ${P(18)}px ${P(16)}px ${P(24)}px`, borderRadius: P(20),
        fontSize: P(26), lineHeight: 1.35, textAlign: 'left',
        background: `color-mix(in srgb, ${hue} ${status.tone === 'ok' ? 13 : 16}%, var(--fmp-surface))`,
        border: `1px solid color-mix(in srgb, ${hue} 30%, transparent)`,
        color: `color-mix(in srgb, ${hue} 45%, var(--fmp-text))`,
        ...style,
      }}
    >
      <Icon size={P(36)} strokeWidth={2.4} aria-hidden="true" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: 'var(--fmp-text)' }}>{status.title}</div>
        {status.detail && <div style={{ fontSize: P(23) }}>{status.detail}</div>}
      </div>
      {status.undo && canUndo && (
        <button
          type="button"
          {...wallPressProps}
          data-testid="wall-menu-undo"
          disabled={busy}
          onClick={onUndo}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: P(10), flexShrink: 0, minHeight: Math.max(44, P(64)), padding: `0 ${P(26)}px`,
            borderRadius: 999, border: `${Math.max(1, P(2))}px solid var(--fmp-border)`, background: 'var(--fmp-surface)', color: 'var(--fmp-text)',
            font: 'inherit', fontSize: P(26), fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', opacity: busy ? 0.6 : 1,
          }}
        >
          <Undo2 size={P(26)} strokeWidth={2.4} aria-hidden="true" />
          {t('meal-planner.menu.undo')}
        </button>
      )}
      {after}
    </div>
  );
}
