'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import type { MealCourseKind, MealSettings, MealSlotType, PlannedMeal, SavedMeal, TimeFormat } from '@/types/config';
import type { MealieProblem } from '@/lib/meal-sources';
import {
  SLOT_META,
  formatMealTime,
  getMealSlotLabelKey,
  resolveMealTimeFormat,
  resolvePlannedMealTime,
} from '@/lib/meal-constants';
import { getMealCourseLabelKey } from '@/lib/meal-courses';
import { mealShownMinutes, mealTagLabel } from '@/lib/meal-dish-rules';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useSheetTapGuard } from '@/hooks/useSheetTapGuard';
import { guardAfterRowRemoved } from '@/lib/sheet-tap-guard';
import { useFormattingLocale, useTranslate } from '@/i18n';
import MealTimeChip from '@/components/meals/MealTimeChip';
import MealThumb from './MealThumb';
import { MealiePausedNotice } from './MealsMealieStatus';
import { formatShownMinutes, type MealPickTarget } from './meals-shared';

interface MealSheetProps {
  date: string;
  slot: MealSlotType;
  /** The meal as the plan holds it now; the sheet closes once it is gone. */
  planned: PlannedMeal | undefined;
  /** Every dish the plan can name: the library, or Mealie's recipes. */
  meals: SavedMeal[];
  settings: MealSettings;
  globalTimeFormat: TimeFormat;
  todayISO: string;
  /** Changes save to Mealie (the subtitle says so, and the time note too). */
  fromMealie: boolean;
  /** Planning is paused while Mealie gives no answer; `updatedAt` is the copy's time, `problem` why. */
  paused: { updatedAt: number | null; problem: MealieProblem } | null;
  onRetry: () => Promise<void> | void;
  onClose: () => void;
  onPick: (target: MealPickTarget) => void;
  onMoveCourse: (from: number, to: number) => void;
  onRemoveCourse: (index: number) => void;
  onSetTime: (time: string | undefined) => void;
  onClear: () => void;
}

const SECTION: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--hs-text-faint)',
  margin: '0 0 8px',
  lineHeight: '16px',
  display: 'flex',
  justifyContent: 'space-between',
};

const CARD: CSSProperties = {
  background: 'var(--hs-bg-panel)',
  border: '1px solid var(--hs-border)',
};

const LINE_BUTTON: CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  padding: '4px 14px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid var(--hs-border)',
  background: 'transparent',
  color: 'var(--hs-text-muted)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  flex: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

/** The 36 px move and remove buttons, the size routine steps use. */
function MiniButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        border: 'none',
        background: 'var(--hs-bg-hover)',
        color: 'var(--hs-text-faint)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.3 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** The ways to add a course, in the order the sheet offers them. */
const ADD_KINDS: readonly MealCourseKind[] = ['side', 'dessert', 'drink', 'main'];

/**
 * One sheet for a whole planned meal: the main dish with Change, the courses
 * served with it (swap, move up and down, remove), four ways to add one, the
 * serving time, and Clear. Every change saves as it is made (in Mealie mode,
 * straight to Mealie).
 */
export default function MealSheet({
  date,
  slot,
  planned,
  meals,
  settings,
  globalTimeFormat,
  todayISO,
  fromMealie,
  paused,
  onRetry,
  onClose,
  onPick,
  onMoveCourse,
  onRemoveCourse,
  onSetTime,
  onClear,
}: MealSheetProps) {
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  const locale = useFormattingLocale();
  const dialogRef = useFocusTrap<HTMLDivElement>({ focus: 'container' });
  const bodyRef = useRef<HTMLDivElement>(null);
  // A double tap on a choice that closes the sheet (Clear, a dish taken off)
  // never reaches the plan under it.
  useSheetTapGuard();

  // The meal went (cleared here, or on another phone): nothing left to show.
  const gone = !planned;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);
  if (!planned) return null;

  const slotLabel = tModules(getMealSlotLabelKey(slot));
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' });
  const timeFormat = resolveMealTimeFormat(settings, globalTimeFormat);
  const usual = settings.defaultSlotTimes?.[slot];
  const time = resolvePlannedMealTime(planned, slot, settings.defaultSlotTimes);
  const byId = new Map(meals.map((m) => [m.id, m]));

  const main = planned.mealId ? byId.get(planned.mealId) ?? null : null;
  const mainName = main?.name ?? planned.customText?.trim() ?? null;
  const mainShown = mealShownMinutes(main);
  const mainTag = main?.tags?.[0];
  const mainMeta = [mainShown ? formatShownMinutes(mainShown, t) : null, main && mainTag ? mealTagLabel(main, mainTag) : null].filter(Boolean).join(' · ');
  const courses = (planned.courses ?? []).map((course, index) => {
    const meal = course.mealId ? byId.get(course.mealId) ?? null : null;
    return { course, index, meal, name: meal?.name ?? course.customText?.trim() ?? t('mealsPlan.slot.mealFallback') };
  });
  const locked: CSSProperties | undefined = paused ? { opacity: 0.45, pointerEvents: 'none' } : undefined;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('mealSheet.ariaLabel', { slot: slotLabel, date: dateLabel })}
        tabIndex={-1}
        data-testid="meal-sheet"
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          // The serving time's choices are a dialog of their own inside this
          // one: Escape there closes only them.
          if ((e.target as HTMLElement).closest('[role="dialog"]') !== e.currentTarget) return;
          e.stopPropagation();
          onClose();
        }}
        style={{
          outline: 'none',
          position: 'relative',
          background: 'var(--hs-bg-body)',
          borderRadius: '16px 16px 0 0',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0', flex: 'none' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--hs-text-faint)' }} />
        </div>
        <div style={{ padding: '4px 16px 12px', borderBottom: '1px solid var(--hs-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flex: 'none' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: 'var(--hs-text-primary)', lineHeight: '24px' }}>
              <span aria-hidden style={{ width: 3, height: 18, borderRadius: 2, background: SLOT_META[slot].color, flex: 'none' }} />
              {slotLabel}
            </div>
            <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 2, lineHeight: '18px' }}>
              {dateLabel}
              {fromMealie && (
                <>
                  {' · '}
                  <b style={{ color: 'var(--hs-text-muted)', fontWeight: 600 }}>{t('mealSheet.savesToMealie')}</b>
                </>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} style={LINE_BUTTON}>
            {t('mealSheet.done')}
          </button>
        </div>

        <div ref={bodyRef} style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '14px 16px 16px', flex: 1, minHeight: 0 }}>
          {paused && <MealiePausedNotice updatedAt={paused.updatedAt} problem={paused.problem} todayISO={todayISO} onRetry={onRetry} />}
          <div aria-disabled={paused ? true : undefined} style={locked}>
            <div style={SECTION}>{t('mealSheet.mainDish')}</div>
            {mainName ? (
              <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12 }}>
                <MealThumb meal={main} typedMark size={56} radius={10} emojiSize={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Whole, however long: the sheet is where a name cut short
                      on This Week or Plan is read in full. */}
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'var(--hs-text-primary)',
                      lineHeight: '20px',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {mainName}
                  </div>
                  {mainMeta && <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 2 }}>{mainMeta}</div>}
                  {/* The meal's own note (a Mealie note's text, "Pizza day in the cafeteria"). */}
                  {planned.notes?.trim() && (
                    <div style={{ fontSize: 12.5, color: 'var(--hs-text-muted)', marginTop: 4, lineHeight: '17px', fontStyle: 'italic' }}>{planned.notes.trim()}</div>
                  )}
                </div>
                <button
                  type="button"
                  style={LINE_BUTTON}
                  onClick={() => onPick({ date, slot, pick: 'main' })}
                  aria-label={t('mealSheet.changeAriaLabel', { meal: mainName })}
                >
                  {t('mealSheet.change')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onPick({ date, slot, pick: 'main' })}
                style={{
                  width: '100%',
                  minHeight: 56,
                  borderRadius: 12,
                  border: '1px dashed var(--hs-border-strong)',
                  background: 'transparent',
                  color: 'var(--hs-text-muted)',
                  fontSize: 14,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Plus size={15} strokeWidth={2} aria-hidden />
                {t('mealSheet.chooseMain')}
              </button>
            )}

            <div style={{ height: 16 }} />
            <div style={SECTION}>
              {t('mealSheet.withThisMeal')}
            </div>
            {courses.map(({ course, index, meal, name }) => {
              const kindLabel = tModules(getMealCourseLabelKey(course.kind));
              return (
                <div
                  key={`${index}-${course.sourceId ?? course.mealId ?? course.customText}`}
                  data-testid="meal-sheet-course"
                  // 5 px around the 44 px swap target: the row stays the 56 px the mockup draws.
                  style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 10, padding: '5px 6px 5px 8px', minHeight: 56, borderRadius: 10, marginBottom: 6 }}
                >
                  <button
                    type="button"
                    onClick={() => onPick({ date, slot, pick: 'swap', kind: course.kind, index })}
                    aria-label={t('mealSheet.swapAriaLabel', { kind: kindLabel, meal: name })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flex: 1,
                      minWidth: 0,
                      minHeight: 44,
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <MealThumb meal={meal} typedMark size={40} radius={8} emojiSize={24} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--hs-text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '14px' }}>
                        {kindLabel}
                      </span>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: meal ? 'var(--hs-text-primary)' : 'var(--hs-text-body)', overflowWrap: 'anywhere', lineHeight: '20px' }}>
                        {name}
                      </span>
                    </span>
                  </button>
                  <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
                    <MiniButton label={t('mealSheet.moveUp', { meal: name })} disabled={index === 0} onClick={() => onMoveCourse(index, index - 1)}>
                      <ArrowUp size={16} strokeWidth={2} aria-hidden />
                    </MiniButton>
                    <MiniButton label={t('mealSheet.moveDown', { meal: name })} disabled={index === courses.length - 1} onClick={() => onMoveCourse(index, index + 1)}>
                      <ArrowDown size={16} strokeWidth={2} aria-hidden />
                    </MiniButton>
                    <MiniButton label={t('mealSheet.remove', { meal: name })} onClick={() => { guardAfterRowRemoved(); onRemoveCourse(index); }}>
                      <X size={16} strokeWidth={2} aria-hidden />
                    </MiniButton>
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: courses.length > 0 ? 8 : 0 }}>
              {/* "Another main" needs a main dish to be another to. */}
              {ADD_KINDS.filter((kind) => kind !== 'main' || !!mainName).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => onPick({ date, slot, pick: 'add', kind })}
                  style={{
                    minHeight: 44,
                    borderRadius: 10,
                    border: '1px dashed var(--hs-border-strong)',
                    background: 'transparent',
                    color: 'var(--hs-text-muted)',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '6px 8px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'center',
                  }}
                >
                  <Plus size={15} strokeWidth={2} aria-hidden style={{ flex: 'none' }} />
                  {t(`mealSheet.add.${kind}`)}
                </button>
              ))}
            </div>

            <div style={{ height: 16 }} />
            <div style={SECTION}>{t('mealSheet.servingTime')}</div>
            <div
              style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '7px 8px 7px 12px', borderRadius: 10 }}
              // The time's choices open below the chip, at the foot of this
              // list: bring them into view.
              onClickCapture={() => {
                window.setTimeout(() => {
                  const body = bodyRef.current;
                  body?.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
                }, 30);
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--hs-text-muted)', lineHeight: '18px' }}>
                {/* Never "No usual time" beside "6:30 PM", which read as a
                    contradiction: without a usual time, say what the chip is for. */}
                {usual
                  ? t('mealSheet.usualTime', { time: formatMealTime(usual, timeFormat) })
                  : t(time ? 'mealSheet.timeThisMeal' : 'mealSheet.timePick')}
              </span>
              <MealTimeChip
                value={time}
                onChange={onSetTime}
                slot={slot}
                variant="darker"
                align="right"
                timeFormat={timeFormat}
              />
            </div>
            {fromMealie && (
              <p style={{ margin: '8px 2px 0', fontSize: 12, color: 'var(--hs-text-faint)', lineHeight: '17px' }}>
                {t(courses.length > 1 ? 'mealSheet.timeAndOrderKeptHere' : 'mealSheet.timeKeptHere')}
              </p>
            )}
          </div>
        </div>

        <div style={{ padding: '12px 16px 24px', borderTop: '1px solid var(--hs-border)', flex: 'none', background: 'var(--hs-bg-body)', borderRadius: 0 }}>
          <button
            type="button"
            onClick={onClear}
            disabled={!!paused}
            style={{
              width: '100%',
              padding: 12,
              minHeight: 44,
              borderRadius: 10,
              border: '1px solid var(--hs-border)',
              background: 'var(--hs-bg-panel)',
              color: 'var(--hs-danger)',
              fontSize: 14,
              fontWeight: 600,
              cursor: paused ? 'default' : 'pointer',
              fontFamily: 'inherit',
              opacity: paused ? 0.45 : 1,
            }}
          >
            {t(`mealSheet.clear.${slot}`)}
          </button>
        </div>
      </div>
    </div>
  );
}
