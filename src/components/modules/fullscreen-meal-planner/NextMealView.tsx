import { getMealSlotLabelKey, formatMealTime, resolvePlannedMealTime, getNextPlannedMeal, toISODate, minutesOfDay } from '@/lib/meal-constants';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { getDifficultyColor, px } from './meal-planner-utils';
import { MealTapTarget } from '../shared/MealTapTarget';
import MealPicture, { mealHasPicture } from '@/components/meals/MealPicture';
import { MealCourseLines } from '../shared/MealCourseLines';
import { useMealMinutes } from '../shared/useMealMinutes';

/**
 * The one-glance answer to "when's lunch?" from across the room: a badge,
 * the slot and time, a very large emoji and the dish name. Sizes are
 * authored canvas pixels at 1080 wide / `medium` (see `px`).
 */
export default function NextMealView({
  settings, timeFormat, savedMeals, plan, now, slots, s, pad, showEmoji, showPrepTime, showTags, showDifficulty, headerFont, bodyFont, recipeTapMode, photoBackdrop,
}: MealPlannerViewProps) {
  const t = useTranslate('modules');
  const mealMinutes = useMealMinutes();
  const locale = useFormattingLocale();
  const P = (n: number) => px(s, n);
  const next = getNextPlannedMeal(toISODate(now), minutesOfDay(now), plan, savedMeals, slots, settings.defaultSlotTimes);

  if (!next) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', fontFamily: bodyFont,
        gap: P(30), color: 'var(--fmp-text-3)', padding: pad, textAlign: 'center' as const,
      }}>
        <span style={{ fontSize: P(200), lineHeight: 1, opacity: 0.3 }}>&#127869;</span>
        <span style={{ fontSize: P(48), fontFamily: headerFont, lineHeight: 1.1 }}>{t('fullscreen-meal-planner.noUpcomingMeals')}</span>
      </div>
    );
  }

  const { meal, name, slot, context, date, courses, notes } = next;
  // Over a photo the text turns light and the pills and badge darken so they
  // hold over any picture; without one the theme's own ink stays.
  const ink = photoBackdrop
    ? { text: '#ffffff', text2: 'rgba(255,255,255,0.9)', text3: 'rgba(255,255,255,0.72)', pillBg: 'rgba(255,255,255,0.16)', pillFg: 'rgba(255,255,255,0.88)' }
    : { text: 'var(--fmp-text)', text2: 'var(--fmp-text-2)', text3: 'var(--fmp-text-3)', pillBg: 'var(--fmp-border-sub)', pillFg: 'var(--fmp-text-3)' };
  // Find the planned entry for this date+slot to grab its time
  const plannedEntry = plan.find((p) => p.date === date && p.slot === slot);
  const time = resolvePlannedMealTime(plannedEntry, slot, settings.defaultSlotTimes);

  const contextStyles: Record<string, { color: string; bg: string; label: string; icon: string }> = {
    now:       { color: 'var(--fmp-accent)', bg: `color-mix(in srgb, var(--fmp-accent) 12%, transparent)`, label: t('fullscreen-meal-planner.nextMealLabels.now'), icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    upcoming:  { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)', label: t('fullscreen-meal-planner.nextMealLabels.comingUp'), icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm1-13h-2v6l5.25 3.15.75-1.23-4-2.42V7z' },
    tomorrow:  { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', label: t('fullscreen-meal-planner.nextMealLabels.tomorrow'), icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm1-13h-2v6l5.25 3.15.75-1.23-4-2.42V7z' },
  };
  // Meals further out than tomorrow are badged with their weekday name.
  const ctxBase = context === 'future'
    ? { ...contextStyles.tomorrow, label: formatDateSync(new Date(date + 'T12:00:00'), 'EEEE', { locale }) }
    : contextStyles[context] ?? contextStyles.now;
  // Over a photo a tinted pill turned brown under the orange label and read
  // poorly; a dark one keeps the label's colour readable on any picture.
  const ctx = photoBackdrop ? { ...ctxBase, bg: 'rgba(0, 0, 0, 0.62)' } : ctxBase;

  const pillStyle: React.CSSProperties = {
    fontSize: P(30), color: ink.pillFg,
    background: ink.pillBg, padding: `${P(10)}px ${P(24)}px`,
    borderRadius: P(14),
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', fontFamily: bodyFont,
      padding: pad, gap: P(28), textAlign: 'center' as const, color: ink.text,
    }}>
      {/* Context badge */}
      <span style={{
        fontSize: P(36), fontWeight: 700, textTransform: 'uppercase' as const,
        letterSpacing: '0.14em', color: ctx.color, background: ctx.bg,
        padding: `${P(14)}px ${P(34)}px`, borderRadius: P(16),
        display: 'inline-flex', alignItems: 'center', gap: P(14),
      }}>
        <svg width={P(36)} height={P(36)} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
          <path d={ctx.icon} />
        </svg>
        {ctx.label}
      </span>

      {/* Slot label + serving time */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: P(18) }}>
        <span style={{
          fontSize: P(40), fontWeight: 600, textTransform: 'uppercase' as const,
          letterSpacing: '0.12em', color: ink.text3,
        }}>
          {t(getMealSlotLabelKey(slot))}
        </span>
        {time && (
          <span style={{
            fontSize: P(40), fontWeight: 700, color: 'var(--fmp-accent)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatMealTime(time, timeFormat)}
          </span>
        )}
      </div>

      {/* Giant emoji + name */}
      <MealTapTarget
        meal={meal}
        mode={recipeTapMode}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: P(28), maxWidth: '100%',
        }}
      >
        {/* The emoji, or the plate for a Mealie recipe with no photo. A photo
            is the backdrop instead, never a picture in the stack. */}
        {showEmoji && !photoBackdrop && !meal?.photoUrl && mealHasPicture(meal) && (
          <MealPicture meal={meal} photoSize={`${P(380)}px`} emojiStyle={{ fontSize: P(380), lineHeight: 1, margin: `${P(20)}px 0` }} />
        )}
        <span style={{
          fontFamily: headerFont, fontSize: P(112), fontWeight: 400,
          color: ink.text, lineHeight: 1.05, letterSpacing: '-0.01em',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
        }}>
          {name}
        </span>
      </MealTapTarget>

      <MealCourseLines
        courses={courses}
        labelSize={`${P(28)}px`}
        nameSize={`${P(44)}px`}
        gap={`${P(24)}px`}
        rowGap={`${P(10)}px`}
        centered
        labelStyle={{ color: ink.text3, fontWeight: 700 }}
        nameStyle={{ color: ink.text2, fontWeight: 500, lineHeight: 1.2, whiteSpace: 'normal' }}
      />

      {/* Notes: the day's, then the dish's own */}
      {notes.map((note) => (
        <span key={note} style={{
          fontSize: P(36), fontStyle: 'italic', color: ink.text2,
          maxWidth: '80%', lineHeight: 1.3,
        }}>
          {note}
        </span>
      ))}

      {/* Meta pills and tags share one row, like the today hero. */}
      {((showPrepTime && mealMinutes(meal)) || (showDifficulty && meal?.difficulty) || (showTags && meal?.tags && meal.tags.length > 0)) && (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, justifyContent: 'center', gap: P(16) }}>
          {showPrepTime && mealMinutes(meal) && (
            <span style={pillStyle}>
              &#9201; {mealMinutes(meal)}
            </span>
          )}
          {showDifficulty && meal?.difficulty && (() => {
            const dc = getDifficultyColor(meal.difficulty);
            return (
              <span style={{
                ...pillStyle,
                color: dc ?? 'var(--fmp-text-3)',
                border: dc ? `1px solid ${dc}40` : undefined,
              }}>
                {meal.difficulty}
              </span>
            );
          })()}
          {showTags && meal?.tags?.map((tag) => (
            <span key={tag} style={pillStyle}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
