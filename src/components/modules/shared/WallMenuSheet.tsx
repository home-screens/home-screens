'use client';

import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { CalendarCog, CalendarPlus, Check, Plus, ShoppingCart } from 'lucide-react';
import type { MealSlotType, SavedMeal } from '@/types/config';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';
import { FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { addMealieRecipeToList, MealClientError, mealieClientProblem } from '@/lib/meal-client';
import { fromISODate, getMealSlotLabelKey, resolveMealWithEntry, toISODate } from '@/lib/meal-constants';
import { mainDishMark, wallCanPlanMeal, wallDayTap, wallPlanKind, wallPlanWeeks, type WallPlanChange } from '@/lib/meal-plan-wall';
import MealPicture from '@/components/meals/MealPicture';
import { BookIcon, type Px } from './recipe-book/RecipeBookParts';
import { FMP_WALL_VARS, useMealOverlayTheme, useMealRecipeContext, type MealRecipeContextValue, type MealServingRef } from './MealRecipeContext';
import { useMealMinutes } from './useMealMinutes';
import { useWallOverlayScale } from './useWallOverlayScale';
import { WALL_SHOPPING_URL } from './useWallGrocery';
import { WallAskInSheet, type WallAskChoice } from './WallAskInSheet';
import { WallChoiceChips } from './WallChoiceChips';
import { WallOverlay } from './WallOverlay';
import { wallPressProps } from './wallPress';
import {
  capitalised, groceryWords, outcomeKey, refusalKeys, useFailureWords, useWallMenuSend, useWallMenuStatus, useWallMenuWords, useWallPlanKind,
  useTapGuard, WALL_MENU_IDLE_MS, WallMenuStatusLine,
} from './wallMenu';

const HEADER_FONT = "var(--font-dm-serif), 'DM Serif Display', Georgia, serif";

/** Whether this module's wall may put `meal` on the menu: planning on, and the recipe lives where the plan does. */
export function useCanPutOnMenu(meal: SavedMeal | null | undefined): boolean {
  const ctx = useMealRecipeContext();
  return !!ctx?.wallPlan && wallCanPlanMeal(meal, !!ctx.planInMealie);
}

/** The meal of the day a planning sheet starts on: the one it was opened from, else dinner, else the day's last meal. */
export function startingSlot(slots: readonly MealSlotType[], from?: MealSlotType): MealSlotType {
  if (from && slots.includes(from)) return from;
  return slots.includes('dinner') ? 'dinner' : slots[slots.length - 1] ?? 'dinner';
}

/**
 * "Put on the menu" on a recipe card: the one button there that changes the
 * plan, so it is the filled one. Opens the day sheet. Draws nothing where
 * the wall may not plan this recipe.
 */
export function WallPutOnMenuButton({ meal, at, P, measuring = false, style }: {
  meal: SavedMeal;
  /** The day and meal the card was opened from; the sheet starts on that meal. */
  at?: MealServingRef;
  P: Px;
  /** One of a recipe card's hidden measuring copies: the same room, nothing to find or tap. */
  measuring?: boolean;
  style?: CSSProperties;
}) {
  const t = useTranslate('modules');
  // What the button said when it was tapped: the sheet keeps that heading after the meal is taken off under it.
  const [open, setOpen] = useState<{ planned: boolean } | null>(null);
  const ctx = useMealRecipeContext();
  // Opened from a meal on the menu, the button is the way to move it or take
  // it off, and "Put on the menu" reads as the opposite: it says "Change the
  // menu" while the recipe is still on that meal.
  const planned = !!at && !!ctx && wallDayTap(ctx.plan, at.date, at.slot, meal.id, wallPlanKind(meal)) === 'off';
  const slot = at?.slot;
  if (!useCanPutOnMenu(meal)) return null;
  return (
    <>
      <button
        type="button"
        {...wallPressProps}
        data-testid={measuring ? undefined : 'meal-put-on-menu'}
        onClick={(e) => { e.stopPropagation(); setOpen({ planned }); }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4em', flexShrink: 0,
          minHeight: Math.max(44, P(64)), padding: `0 ${P(26)}px`, borderRadius: 999, border: 0,
          background: 'var(--fmp-accent)', color: 'var(--fmp-on-accent, #fff)',
          font: 'inherit', fontSize: P(28), fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer',
          ...style,
        }}
      >
        {planned ? <CalendarCog size="1.1em" strokeWidth={2.2} aria-hidden="true" /> : <CalendarPlus size="1.1em" strokeWidth={2.2} aria-hidden="true" />}
        {t(planned ? 'meal-planner.menu.change' : 'meal-planner.menu.put')}
      </button>
      {open && <WallMenuSheet meal={meal} startSlot={slot} planned={open.planned} onClose={() => setOpen(null)} />}
    </>
  );
}

type Asking = { date: string; about: 'ask' | 'off' };

/**
 * The day sheet: which meal of the day, then two weeks of days, each saying
 * what is on it. A tap on a free day plans the recipe at once; a day with a
 * different main dish asks first; a side or dessert joins the meal that is
 * there; the day the recipe is already on offers to take it off. What a tap
 * does is `wallDayTap`, and the hub applies the same rule to the plan as it
 * reads at that moment (`applyWallPlanChange`). It stays open so a second
 * day is one more tap.
 */
export function WallMenuSheet({ meal, startSlot, planned = false, onClose }: {
  meal: SavedMeal;
  startSlot?: MealSlotType;
  /** Opened from a meal on the menu: the heading says "Change the menu", as its button did. */
  planned?: boolean;
  onClose: () => void;
}) {
  const ctx = useMealRecipeContext();
  if (!ctx) return null;
  return <MenuSheet ctx={ctx} meal={meal} startSlot={startSlot} heading={planned ? 'meal-planner.menu.change' : 'meal-planner.menu.put'} onClose={onClose} />;
}

function MenuSheet({ ctx, meal, startSlot, heading: headingKey, onClose }: { ctx: MealRecipeContextValue; meal: SavedMeal; startSlot?: MealSlotType; heading: string; onClose: () => void }) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const { P, w, h, landscape } = useWallOverlayScale();
  const { theme, panelStyle } = useMealOverlayTheme();
  const minutes = useMealMinutes()(meal);
  const send = useWallMenuSend();
  const { plan, savedMeals, settings } = ctx;
  const slots = settings.enabledSlots;
  const [slot, setSlot] = useState<MealSlotType>(() => startingSlot(slots, startSlot));
  const todayISO = toISODate(ctx.now);
  const weeks = useMemo(() => wallPlanWeeks(todayISO, settings.weekStartDay), [todayISO, settings.weekStartDay]);
  const words = useWallMenuWords(weeks[0]);
  const kind = useWallPlanKind()(meal);
  const failureWords = useFailureWords();
  const guard = useTapGuard();
  const [asking, setAsking] = useState<Asking | null>(null);
  const [busy, setBusy] = useState(false);
  // The day whose change is on its way: it lights up at once, so a tap on a slow hub is seen to have been taken.
  const [pending, setPending] = useState<string | null>(null);
  const { status, canUndo, show } = useWallMenuStatus();
  // Mealie builds no shopping list from its plan, so the sheet offers the recipe's ingredients after a put.
  const [list, setList] = useState<'none' | 'offer' | 'adding'>('none');

  const planInMealie = !!ctx.planInMealie;
  const thisWeek = weeks[0];

  const run = useCallback(async (body: WallPlanChange | { undo: string }) => {
    setBusy(true);
    setPending('date' in body ? body.date : null);
    const sent = await send(body);
    setBusy(false);
    setPending(null);
    if (sent.state === 'cancelled') return;
    guard.hush();
    setAsking(null);
    setList('none');
    if (sent.state === 'failed') {
      // An Undo that did not get through keeps its button: the change is still there to take back.
      show('undo' in body
        ? { tone: 'error', title: t('meal-planner.menu.problem.undoFailed'), detail: failureWords(sent.problem), undo: body.undo }
        : { tone: 'error', title: t('meal-planner.menu.problem.failed'), detail: failureWords(sent.problem) });
      return;
    }
    if (sent.state === 'refused') {
      const keys = refusalKeys('undo' in body ? 'moved' : sent.reason);
      const day = 'date' in body ? words.day(body.date) : '';
      show({ tone: keys.tone, title: t(keys.title, { day }), ...(keys.detail ? { detail: t(keys.detail) } : {}) });
      return;
    }
    if ('undo' in body) {
      show({ tone: 'ok', title: t('meal-planner.menu.undone') });
      return;
    }
    const { outcome, undo, changed } = sent.wall;
    show({
      tone: 'ok',
      title: capitalised(t(outcomeKey(outcome), { meal: meal.name, when: words.when(body.date, body.slot) }), locale),
      ...(outcome !== 'off' ? { detail: groceryWords(t, meal, planInMealie, thisWeek.includes(body.date)) } : {}),
      ...(undo ? { undo } : {}),
    });
    if (planInMealie && changed && outcome !== 'off') setList('offer');
  }, [send, show, t, words, meal, planInMealie, thisWeek, locale, failureWords, guard]);

  const tap = (date: string) => {
    // The second tap of a double tap lands after the first one's answer: it must not plan, ask or take off again.
    if (busy || guard.quiet()) return;
    const what = wallDayTap(plan, date, slot, meal.id, kind);
    if (what === 'ask' || what === 'off') {
      show(null);
      guard.hush();
      setAsking({ date, about: what });
      return;
    }
    void run({ action: 'put', date, slot, mealId: meal.id, kind });
  };

  const addIngredients = async () => {
    setList('adding');
    try {
      const { wire, listName } = await addMealieRecipeToList(displayFetch, meal.id);
      displayCache.replace(WALL_SHOPPING_URL, wire, FETCH_KEY_REGISTRY['meal-planner']?.ttlMs ?? 60_000);
      setList('none');
      show({ tone: 'ok', title: t(listName ? 'meal-planner.menu.listAdded' : 'meal-planner.menu.listAddedPlain', { list: listName }) });
    } catch (err) {
      setList('offer');
      show({ tone: 'error', title: t('meal-planner.menu.problem.listFailed'), detail: failureWords(err instanceof MealClientError && err.problem ? mealieClientProblem(err) : undefined) });
    }
  };

  const label: CSSProperties = { fontSize: P(23), fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--fmp-text-3)' };
  const rowH = P(landscape ? 66 : 84);

  const todayWord = tCore('today');
  const dayRow = (date: string) => {
    const resolved = resolveMealWithEntry(date, slot, plan, savedMeals);
    const past = date < todayISO;
    const mine = wallDayTap(plan, date, slot, meal.id, kind) === 'off';
    const free = !resolved.name;
    const today = date === todayISO;
    const d = fromISODate(date);
    const extras = resolved.courses.map((c) => c.name).filter(Boolean).join(', ');
    const state = mine ? 'mine' : free ? 'free' : 'taken';
    return (
      <button
        key={date}
        type="button"
        {...wallPressProps}
        data-testid="wall-menu-day"
        data-date={date}
        data-state={past ? 'past' : state}
        disabled={past || busy}
        aria-label={`${words.when(date, slot)}: ${resolved.name ?? t('meal-planner.menu.free')}`}
        onClick={() => tap(date)}
        style={{
          display: 'flex', alignItems: 'center', gap: P(10), width: '100%', height: rowH, marginBottom: P(landscape ? 8 : 10), padding: `0 ${P(14)}px 0 0`,
          borderRadius: P(22), font: 'inherit', color: 'var(--fmp-text)', textAlign: 'left', cursor: past ? 'default' : 'pointer', overflow: 'hidden',
          opacity: past ? 0.38 : busy && pending !== date ? 0.5 : 1,
          outline: pending === date ? `${Math.max(2, P(4))}px solid var(--fmp-accent)` : undefined,
          background: mine ? 'color-mix(in srgb, var(--fmp-accent) 18%, var(--fmp-surface))' : free ? 'transparent' : 'var(--fmp-surface)',
          border: `${Math.max(1, P(2))}px ${free && !mine ? 'dashed' : 'solid'} ${mine ? 'var(--fmp-accent)' : today ? 'color-mix(in srgb, var(--fmp-accent) 45%, var(--fmp-border))' : free ? 'var(--fmp-border)' : 'var(--fmp-border-sub)'}`,
          boxShadow: free || past ? 'none' : 'var(--fmp-card-shadow, none)',
        }}
      >
        <span style={{ width: P(86), flexShrink: 0, textAlign: 'center', lineHeight: 1.05 }}>
          <span style={{ display: 'block', fontSize: P(20), fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: today ? 'color-mix(in srgb, var(--fmp-accent) 75%, var(--fmp-text))' : 'var(--fmp-text-2)' }}>
            {/* "Today" where the word fits the column; "Aujourd'hui" does not, and the accent says it instead. */}
            {today && todayWord.length <= 6 ? todayWord : d.toLocaleDateString(locale, { weekday: 'short' })}
          </span>
          <span style={{ fontSize: P(landscape ? 27 : 32), fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{d.getDate()}</span>
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: P(10) }}>
          {!free && <MealPicture meal={resolved.meal} photoSize={`${P(44)}px`} emojiStyle={{ fontSize: P(30), lineHeight: 1, flexShrink: 0 }} />}
          <span style={{ minWidth: 0 }}>
            <span data-testid="wall-menu-day-name" style={{ display: 'block', fontSize: P(26), fontWeight: mine ? 650 : free ? 500 : 550, color: free ? 'var(--fmp-text-2)' : 'var(--fmp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {resolved.name ?? t('meal-planner.menu.free')}
            </span>
            {extras && (
              <span style={{ display: 'block', fontSize: P(21), lineHeight: 1.1, color: 'var(--fmp-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                + {extras}
              </span>
            )}
          </span>
        </span>
        {!past && (mine || free) && (
          <span aria-hidden="true" style={{
            width: P(50), height: P(50), borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: mine ? 'var(--fmp-accent)' : 'color-mix(in srgb, var(--fmp-accent) 20%, var(--fmp-surface))',
            color: mine ? 'var(--fmp-on-accent, #fff)' : 'color-mix(in srgb, var(--fmp-accent) 70%, var(--fmp-text))',
          }}>
            {mine ? <Check size={P(28)} strokeWidth={3} /> : <Plus size={P(28)} strokeWidth={2.6} />}
          </span>
        )}
      </button>
    );
  };

  const chips = slots.length > 1 && (
    <WallChoiceChips
      P={P}
      label={t('meal-planner.menu.whichMeal')}
      testId="wall-menu-slots"
      options={slots.map((s) => ({ value: s, label: t(getMealSlotLabelKey(s)) }))}
      value={slot}
      onChange={(next) => { setSlot(next); setAsking(null); }}
    />
  );

  const doneButton = (
    <button
      type="button"
      {...wallPressProps}
      data-testid="wall-menu-done"
      onClick={onClose}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, minHeight: Math.max(44, P(76)), padding: `0 ${P(44)}px`,
        borderRadius: 999, border: 0, background: 'var(--fmp-accent)', color: 'var(--fmp-on-accent, #fff)', font: 'inherit', fontSize: P(28), fontWeight: 700, cursor: 'pointer',
      }}
    >
      {tCore('actions.done')}
    </button>
  );
  const listButton = list !== 'none' && (
    <button
      type="button"
      {...wallPressProps}
      data-testid="wall-menu-ingredients"
      disabled={list === 'adding'}
      onClick={() => void addIngredients()}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: P(12), minHeight: Math.max(44, P(76)), padding: `0 ${P(34)}px`, borderRadius: 999,
        border: `${Math.max(1, P(2))}px solid var(--fmp-border)`, background: 'var(--fmp-surface)', color: 'var(--fmp-text)',
        font: 'inherit', fontSize: P(28), fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', opacity: list === 'adding' ? 0.6 : 1,
      }}
    >
      <ShoppingCart size={P(30)} strokeWidth={2.2} aria-hidden="true" />
      {t('meal-planner.menu.addIngredients')}
    </button>
  );
  const statusLine = status && (
    <WallMenuStatusLine status={status} canUndo={canUndo} busy={busy} P={P} onUndo={() => { if (status.undo && !guard.quiet()) void run({ undo: status.undo }); }} style={{ flex: 1, minWidth: 0 }} />
  );
  const anyMine = weeks.some((days) => days.some((date) => date >= todayISO && wallDayTap(plan, date, slot, meal.id, kind) === 'off'));

  const hintLine = (
    <p data-testid="wall-menu-hint" style={{ margin: 0, fontSize: P(25), lineHeight: 1.4, color: 'var(--fmp-text-2)' }}>
      {t(anyMine ? 'meal-planner.menu.hintMine' : 'meal-planner.menu.hint', { meal: meal.name })}
    </p>
  );

  let body;
  if (asking) {
    const entry = plan.find((p) => p.date === asking.date && p.slot === slot);
    const dish = resolveMealWithEntry(asking.date, slot, plan, savedMeals).name ?? '';
    const day = words.day(asking.date);
    const when = words.when(asking.date, slot);
    const change = { date: asking.date, slot, mealId: meal.id, kind };
    const choices: WallAskChoice[] = asking.about === 'off'
      ? [{ id: 'off', label: t('meal-planner.menu.ask.offYes', { day }), tone: 'danger' }]
      : [
        { id: 'swap', label: t('meal-planner.menu.ask.swap'), detail: t('meal-planner.menu.ask.swapDetail', { meal: meal.name, dish }), tone: 'primary' },
        { id: 'both', label: t('meal-planner.menu.ask.both'), detail: t('meal-planner.menu.ask.bothDetail', { meal: meal.name, dish }), tone: 'plain' },
      ];
    body = (
      <WallAskInSheet
        testId="wall-menu-ask"
        // A sentence that may open with the day ("thursday dinner is ..." in a language that writes days small).
        title={capitalised(asking.about === 'off' ? t('meal-planner.menu.ask.offTitle', { meal: meal.name, when }) : t('meal-planner.menu.ask.title', { when, dish }), locale)}
        body={t(asking.about === 'off' ? 'meal-planner.menu.ask.offBody' : 'meal-planner.menu.ask.body')}
        choices={choices}
        cancelLabel={asking.about === 'off' ? t('meal-planner.menu.ask.offNo') : t('meal-planner.menu.ask.leave', { day })}
        // A double tap on the day that opened the question must not answer it, and one on "Leave it" must not plan the day under it.
        onPick={(id) => { if (!guard.quiet()) void run({ ...change, action: id as WallPlanChange['action'], ...(id === 'off' ? {} : { expect: mainDishMark(entry) }) }); }}
        onCancel={() => { if (guard.quiet()) return; guard.hush(); setAsking(null); }}
        theme={theme}
        accentColor="var(--fmp-accent)"
        onAccent="var(--fmp-on-accent, #fff)"
        busy={busy}
      />
    );
  } else {
    body = (
      <>
        {!landscape && chips && (
          <>
            <div style={{ ...label, margin: `${P(34)}px 0 ${P(14)}px` }}>{t('meal-planner.menu.whichMeal')}</div>
            {chips}
          </>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: P(22) }}>
          {weeks.map((days, i) => (
            <div key={days[0]} data-testid="wall-menu-week" style={{ minWidth: 0 }}>
              <div style={{ ...label, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: P(12), margin: `${P(landscape ? 20 : 34)}px 0 ${P(landscape ? 10 : 14)}px` }}>
                {/* No dates beside it: each day carries its own, and "La semaine prochaine" leaves no room for a range. */}
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(i === 0 ? 'meal-planner.menu.thisWeek' : 'meal-planner.menu.nextWeek')}</span>
              </div>
              {days.map(dayRow)}
            </div>
          ))}
        </div>
        {/* The hint and the line that replaces it share one place of one height, and Done is there from the
            start: the sheet is centred, so anything that grew it would move every day under a finger, and
            the second tap of a double tap would land on the next day. */}
        {landscape ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: P(16), marginTop: P(4), minHeight: P(104) }}>
            {statusLine ?? <span style={{ flex: 1, minWidth: 0 }}>{hintLine}</span>}
            {listButton}
            {doneButton}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: P(6), minHeight: P(124) }}>{statusLine ?? hintLine}</div>
            <div style={{ display: 'flex', justifyContent: listButton ? 'space-between' : 'flex-end', gap: P(14), marginTop: P(14) }}>
              {listButton}
              {doneButton}
            </div>
          </>
        )}
      </>
    );
  }

  const heading = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div data-testid="wall-menu-title" style={{ fontFamily: HEADER_FONT, fontSize: P(landscape ? 50 : 58), lineHeight: 1.08, color: 'var(--fmp-text)' }}>{t(headingKey)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: P(14), marginTop: P(landscape ? 4 : 8), fontSize: P(landscape ? 30 : 34), color: 'var(--fmp-text-2)', minWidth: 0 }}>
        <MealPicture meal={meal} photoSize={`${P(48)}px`} emojiStyle={{ fontSize: P(40), lineHeight: 1, flexShrink: 0 }} />
        <span data-testid="wall-menu-meal" style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meal.name}</span>
        {minutes && <span style={{ fontSize: P(26), color: 'var(--fmp-text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{minutes}</span>}
        {planInMealie && (
          <span style={{ fontSize: P(22), fontWeight: 650, border: `${Math.max(1, P(2))}px solid var(--fmp-border)`, borderRadius: 999, padding: `${P(2)}px ${P(14)}px`, flexShrink: 0 }}>Mealie</span>
        )}
      </div>
    </div>
  );

  return (
    <WallOverlay label={t(headingKey)} testId="wall-menu" onClose={onClose} autoCloseMs={WALL_MENU_IDLE_MS}>
      <div
        className="fmp-root"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...panelStyle,
          ...FMP_WALL_VARS,
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: Math.min(w - P(80), P(landscape ? 1240 : 1000)), maxHeight: h - P(landscape ? 60 : 140),
          borderRadius: P(44), boxShadow: '0 30px 80px rgba(0,0,0,0.5)', cursor: 'default', lineHeight: 1.3,
        }}
      >
        <div style={{ display: 'flex', alignItems: landscape ? 'center' : 'flex-start', gap: P(28), padding: `${P(landscape ? 36 : 44)}px ${P(44)}px 0`, flexShrink: 0 }}>
          {heading}
          {landscape && !asking && chips}
          <button
            type="button"
            {...wallPressProps}
            data-testid="wall-menu-close"
            aria-label={tCore('actions.close')}
            onClick={onClose}
            style={{
              width: P(92), height: P(92), borderRadius: '50%', border: 0, padding: 0, flexShrink: 0, cursor: 'pointer',
              background: 'var(--fmp-border-sub)', color: 'var(--fmp-text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <BookIcon name="x" size={P(46)} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', scrollbarWidth: 'none', touchAction: 'pan-y', padding: `0 ${P(44)}px ${P(landscape ? 32 : 44)}px` }}>
          {body}
        </div>
      </div>
    </WallOverlay>
  );
}
