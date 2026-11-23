'use client';

import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { MealSlotType, SavedMeal } from '@/types/config';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { fromISODate, getMealSlotLabelKey, resolveMealWithEntry, toISODate } from '@/lib/meal-constants';
import { planEntryMealIds } from '@/lib/meal-courses';
import { mainDishMark, wallCanPlanMeal, wallDayTap, wallPlanDayOpen, wallPlanWeeks, type WallPlanChange } from '@/lib/meal-plan-wall';
import { BookIcon, type Px } from './recipe-book/RecipeBookParts';
import { RecipeBookPanel } from './recipe-book/RecipeBookPanel';
import { RECIPE_BOOK_SHEET_AUTO_CLOSE_MS } from './recipe-book/RecipeBookSheet';
import { useWallRecipeBook } from './recipe-book/useWallRecipeBook';
import { FMP_WALL_VARS, useMealOverlayTheme, useMealRecipeContext, type MealRecipeContextValue } from './MealRecipeContext';
import { useWallOverlayScale } from './useWallOverlayScale';
import { WallAskInSheet } from './WallAskInSheet';
import { WallChoiceChips } from './WallChoiceChips';
import { startingSlot } from './WallMenuSheet';
import { WallOverlay } from './WallOverlay';
import { wallPressProps } from './wallPress';
import {
  capitalised, groceryWords, outcomeKey, refusalKeys, useFailureWords, useWallMenuSend, useWallMenuStatus, useWallMenuWords, useWallPlanKind,
  useTapGuard, WallMenuStatusLine,
} from './wallMenu';

/**
 * How long the book stays once a main dish is on with nobody touching it:
 * long enough to add a side or ask the table, short enough that a wall
 * nobody is at goes back to the week.
 */
const SETTLED_CLOSE_MS = 20_000;

const HEADER_FONT = "var(--font-dm-serif), 'DM Serif Display', Georgia, serif";

/** Which empty meal a view asked to plan. With no `slot` (a day with no meals of its own), the sheet asks which. */
export interface MealPickTarget {
  date: string;
  slot?: MealSlotType;
}

/**
 * Planning from an empty meal, for the views that draw one (Week, List).
 * `open(date, slot)` answers whether that day may be planned from this wall
 * (planning on, today to the end of next week) and, called as a handler,
 * opens the recipe book for it; `sheet` is the book, to draw once.
 */
export function useWallMealPick(): { canPlan: (date: string) => boolean; open: (date: string, slot?: MealSlotType) => void; sheet: ReactNode } {
  const ctx = useMealRecipeContext();
  const [target, setTarget] = useState<MealPickTarget | null>(null);
  // Nothing to tap for where there is nothing to pick: a library with no recipe the wall could plan.
  const enabled = !!ctx?.wallPlan && (!!ctx.planInMealie || ctx.savedMeals.some((meal) => wallCanPlanMeal(meal, false)));
  const todayISO = ctx ? toISODate(ctx.now) : '';
  const weekStartDay = ctx?.settings.weekStartDay ?? 'sunday';
  const canPlan = useCallback(
    (date: string) => enabled && wallPlanDayOpen(date, todayISO, weekStartDay),
    [enabled, todayISO, weekStartDay],
  );
  const open = useCallback((date: string, slot?: MealSlotType) => setTarget({ date, ...(slot ? { slot } : {}) }), []);
  const close = useCallback(() => setTarget(null), []);
  const sheet = target && ctx ? <PickSheet key={`${target.date}|${target.slot ?? ''}`} ctx={ctx} target={target} onClose={close} /> : null;
  return { canPlan, open, sheet };
}

/** The plus an empty meal shows where the wall may plan it. Sized by the view; the whole cell is the target. */
export function MealPlanPlus({ size, color, style }: {
  size: number;
  /** The plus's own colour, for a card outside the full-screen theme (its accent). */
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span aria-hidden="true" data-testid="meal-plan-plus" style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
      background: 'var(--fmp-surface, rgba(128,128,128,0.14))', border: '1px solid var(--fmp-border, rgba(128,128,128,0.35))',
      color: color ?? 'color-mix(in srgb, var(--fmp-accent, currentColor) 75%, var(--fmp-text, currentColor))',
      ...style,
    }}>
      <Plus size={size * 0.52} strokeWidth={2.6} />
    </span>
  );
}

/**
 * The recipe book over the wall, opened for one meal: a tap on a recipe puts
 * it on that meal. It is the day sheet's other door, with the same rules
 * (`wallDayTap`), the same line saying what happened and the same Undo. The
 * sheet is for one meal, so a tap on another recipe swaps this sheet's own
 * pick; a main dish somebody else planned meanwhile is never swapped from
 * here.
 */
function PickSheet({ ctx, target, onClose }: { ctx: MealRecipeContextValue; target: MealPickTarget; onClose: () => void }) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const { P, landscape } = useWallOverlayScale();
  const { panelStyle } = useMealOverlayTheme();
  const send = useWallMenuSend();
  const { plan, settings } = ctx;
  const slots = settings.enabledSlots;
  const [slot, setSlot] = useState<MealSlotType>(() => startingSlot(slots, target.slot));
  const { date } = target;
  const todayISO = toISODate(ctx.now);
  const weeks = useMemo(() => wallPlanWeeks(todayISO, settings.weekStartDay), [todayISO, settings.weekStartDay]);
  const words = useWallMenuWords(weeks[0]);
  const book = useWallRecipeBook({ source: ctx.planInMealie ? 'mealie' : 'local', savedMeals: ctx.savedMeals, enabled: true });
  const [busy, setBusy] = useState(false);
  const { status, canUndo, show } = useWallMenuStatus();
  // The main dish this sheet put on the meal, which a tap on another recipe may swap.
  const [mine, setMine] = useState<string | null>(null);
  // What it had put there before its last change, which that change's Undo brings back.
  const [mineBefore, setMineBefore] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const planKind = useWallPlanKind();
  const failureWords = useFailureWords();
  const { theme } = useMealOverlayTheme();
  const guard = useTapGuard();
  // This sheet put something on the meal: it has done its job and closes soon after.
  const [didPlan, setDidPlan] = useState(false);
  // The recipe tapped for a meal that got a main dish from somewhere else meanwhile.
  const [asking, setAsking] = useState<SavedMeal | null>(null);

  const run = async (body: WallPlanChange | { undo: string }, meal?: SavedMeal) => {
    setBusy(true);
    const sent = await send(body);
    setBusy(false);
    if (sent.state === 'cancelled') return;
    guard.hush();
    setAsking(null);
    if (sent.state === 'failed') {
      // An Undo that did not get through keeps its button: the change is still there to take back.
      show('undo' in body
        ? { tone: 'error', title: t('meal-planner.menu.problem.undoFailed'), detail: failureWords(sent.problem), undo: body.undo }
        : { tone: 'error', title: t('meal-planner.menu.problem.failed'), detail: failureWords(sent.problem) });
      return;
    }
    if (sent.state === 'refused') {
      const keys = refusalKeys('undo' in body ? 'moved' : sent.reason);
      show({ tone: keys.tone, title: t(keys.title, { day: words.day(date) }) });
      return;
    }
    if ('undo' in body) {
      setMine(mineBefore);
      setMineBefore(null);
      show({ tone: 'ok', title: t('meal-planner.menu.undone') });
      return;
    }
    // Whatever this change's Undo brings back: the pick before a new main dish, the same pick after a side.
    setMineBefore(mine);
    if (body.kind === 'main') setMine(body.mealId);
    setDidPlan(true);
    show({
      tone: 'ok',
      title: capitalised(t(outcomeKey(sent.wall.outcome), { meal: meal?.name ?? '', when: words.when(date, slot) }), locale),
      ...(meal && sent.wall.outcome !== 'off' ? { detail: groceryWords(t, meal, !!ctx.planInMealie, weeks[0].includes(date)) } : {}),
      ...(sent.wall.undo ? { undo: sent.wall.undo } : {}),
    });
  };

  const pick = (meal: SavedMeal) => {
    // The second tap of a double tap lands after the first one's answer: it must not pick again.
    if (busy || guard.quiet()) return;
    const kind = planKind(meal);
    const what = wallDayTap(plan, date, slot, meal.id, kind);
    const change = { date, slot, mealId: meal.id, kind };
    // Already on this meal: nothing to do, and the line with its Undo stays as it is.
    if (what === 'off') return;
    if (what === 'ask') {
      const mark = mainDishMark(plan.find((p) => p.date === date && p.slot === slot));
      // This sheet's own pick is swapped without a word. A main dish somebody
      // else planned since the sheet opened is asked about, as the day sheet asks.
      if (mine && mark === `m:${mine}`) void run({ ...change, action: 'swap', expect: mark }, meal);
      else {
        show(null);
        guard.hush();
        setAsking(meal);
      }
      return;
    }
    void run({ ...change, action: 'put' }, meal);
  };

  // "On Wed": the first open day a recipe is already on, so nobody plans tacos twice by accident.
  const planned = useMemo(() => {
    const first = new Map<string, string>();
    const last = weeks[weeks.length - 1][6];
    for (const entry of [...plan].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      if (entry.date < todayISO || entry.date > last) continue;
      for (const id of planEntryMealIds(entry)) if (!first.has(id)) first.set(id, entry.date);
    }
    return first;
  }, [plan, weeks, todayISO]);
  const badge = (meal: SavedMeal): string | null => {
    const on = planned.get(meal.id);
    if (!on) return null;
    // "Today" says it alone: "On Today" reads wrong in every language.
    if (on === todayISO) return tCore('today');
    // Next week's day by its date: "Mon" alone would read as this Monday.
    const day = fromISODate(on).toLocaleDateString(locale, weeks[0].includes(on) ? { weekday: 'short' } : { month: 'short', day: 'numeric' });
    return t('meal-planner.menu.pick.on', { day });
  };

  const when = words.when(date, slot);
  const title = capitalised(when, locale);
  const closeButton = (
    <button
      type="button"
      {...wallPressProps}
      data-testid="meal-pick-close"
      aria-label={tCore('actions.close')}
      onClick={onClose}
      style={{
        width: P(92), height: P(92), borderRadius: '50%', border: 0, padding: 0, flexShrink: 0, cursor: 'pointer',
        background: 'var(--fmp-border-sub)', color: 'var(--fmp-text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <BookIcon name="x" size={P(46)} />
    </button>
  );
  const top = !target.slot && slots.length > 1 ? (
    <WallChoiceChips
      P={P as Px}
      label={t('meal-planner.menu.whichMeal')}
      testId="meal-pick-slots"
      options={slots.map((s) => ({ value: s, label: t(getMealSlotLabelKey(s)) }))}
      value={slot}
      onChange={(next) => { setSlot(next); setMine(null); setMineBefore(null); setAsking(null); show(null); }}
    />
  ) : undefined;

  // What the last tap did, and the question, float over the foot of the book:
  // drawn above the recipes they would push every tile down, and the second
  // tap of a double tap would land on the recipe in the row above.
  const entry = plan.find((p) => p.date === date && p.slot === slot);
  const dish = resolveMealWithEntry(date, slot, plan, ctx.savedMeals).name ?? '';
  const foot = asking ? (
    <WallAskInSheet
      testId="meal-pick-ask"
      title={capitalised(t('meal-planner.menu.ask.title', { when, dish }), locale)}
      body={t('meal-planner.menu.ask.body')}
      choices={[
        { id: 'swap', label: t('meal-planner.menu.ask.swap'), detail: t('meal-planner.menu.ask.swapDetail', { meal: asking.name, dish }), tone: 'primary' },
        { id: 'both', label: t('meal-planner.menu.ask.both'), detail: t('meal-planner.menu.ask.bothDetail', { meal: asking.name, dish }), tone: 'plain' },
      ]}
      cancelLabel={t('meal-planner.menu.ask.leave', { day: words.day(date) })}
      onPick={(id) => { if (!guard.quiet()) void run({ date, slot, mealId: asking.id, kind: planKind(asking), action: id as WallPlanChange['action'], expect: mainDishMark(entry) }, asking); }}
      onCancel={() => { if (guard.quiet()) return; guard.hush(); setAsking(null); }}
      theme={theme}
      accentColor="var(--fmp-accent)"
      onAccent="var(--fmp-on-accent, #fff)"
      busy={busy}
    />
  ) : status ? (
    <WallMenuStatusLine status={status} canUndo={canUndo} busy={busy} P={P} onUndo={() => { if (status.undo && !guard.quiet()) void run({ undo: status.undo }); }} />
  ) : null;

  // Once a recipe is on, the sheet has done its job: it closes soon after, unless it is touched again.
  const settled = status?.tone === 'ok' && didPlan;
  return (
    <WallOverlay
      label={title}
      testId="meal-pick-sheet"
      onClose={onClose}
      autoCloseMs={settled ? SETTLED_CLOSE_MS : RECIPE_BOOK_SHEET_AUTO_CLOSE_MS}
      restartKey={`${settled}|${mine}`}
      paused={cardOpen || busy}
      scrim="rgba(0,0,0,0.5)"
    >
      <div
        className="fmp-root"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...panelStyle,
          ...FMP_WALL_VARS,
          position: 'absolute', left: 0, right: 0, bottom: 0, height: landscape ? '92%' : '88%',
          borderRadius: `${P(44)}px ${P(44)}px 0 0`, boxShadow: '0 -20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ padding: `${P(20)}px 0 0`, flexShrink: 0 }}>
          <div style={{ width: P(96), height: P(10), borderRadius: P(5), background: 'var(--fmp-border)', margin: '0 auto' }} />
        </div>
        <RecipeBookPanel
          book={book}
          P={P}
          landscape={landscape}
          interactive
          headerFont={HEADER_FONT}
          mode="book"
          onCardChange={setCardOpen}
          pick={{ title, hint: t('meal-planner.menu.pick.hint'), end: closeButton, top, onPick: pick, badge, busy }}
        />
        {foot && (
          <div
            data-testid="meal-pick-foot"
            style={{
              position: 'absolute', left: P(40), right: P(40), bottom: P(36), borderRadius: P(26), background: 'var(--fmp-bg)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.35)', padding: asking ? `0 ${P(16)}px ${P(16)}px` : 0,
            }}
          >
            {foot}
          </div>
        )}
      </div>
    </WallOverlay>
  );
}
