import { getMealSlotLabelKey, formatMealTime, resolvePlannedMealTime, getNextPlannedMeal, toISODate } from '@/lib/meal-constants';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { getDifficultyColor, px } from './meal-planner-utils';
import { MealTapTarget } from '../shared/MealTapTarget';

/**
 * The one-glance answer to "when's lunch?" from across the room: a badge,
 * the slot and time, a very large emoji and the dish name. Sizes are
 * authored canvas pixels at 1080 wide / `medium` (see `px`).
 */
export default function NextMealView({
  settings, timeFormat, savedMeals, plan, now, slots, s, pad, showEmoji, showPrepTime, showTags, showDifficulty, headerFont, bodyFont, recipeTapMode,
}: MealPlannerViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const P = (n: number) => px(s, n);
  const next = getNextPlannedMeal(toISODate(now), now.getHours(), plan, savedMeals, slots);

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

  const { meal, slot, context, date } = next;
  // Find the planned entry for this date+slot to grab its time
  const plannedEntry = plan.find((p) => p.date === date && p.slot === slot);
  const time = resolvePlannedMealTime(plannedEntry, slot, settings.defaultSlotTimes);

  const contextStyles: Record<string, { color: string; bg: string; label: string; icon: string }> = {
    now:       { color: 'var(--fmp-accent)', bg: `color-mix(in srgb, var(--fmp-accent) 12%, transparent)`, label: t('fullscreen-meal-planner.nextMealLabels.now'), icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    upcoming:  { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)', label: t('fullscreen-meal-planner.nextMealLabels.comingUp'), icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm1-13h-2v6l5.25 3.15.75-1.23-4-2.42V7z' },
    tomorrow:  { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', label: t('fullscreen-meal-planner.nextMealLabels.tomorrow'), icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm1-13h-2v6l5.25 3.15.75-1.23-4-2.42V7z' },
  };
  // Meals further out than tomorrow are badged with their weekday name.
  const ctx = context === 'future'
    ? { ...contextStyles.tomorrow, label: formatDateSync(new Date(date + 'T12:00:00'), 'EEEE', { locale }) }
    : contextStyles[context] ?? contextStyles.now;

  const pillStyle: React.CSSProperties = {
    fontSize: P(30), color: 'var(--fmp-text-3)',
    background: 'var(--fmp-border-sub)', padding: `${P(10)}px ${P(24)}px`,
    borderRadius: P(14),
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', fontFamily: bodyFont,
      padding: pad, gap: P(28), textAlign: 'center' as const,
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
          letterSpacing: '0.12em', color: 'var(--fmp-text-3)',
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
        {showEmoji && meal.emoji && (
          <span style={{ fontSize: P(380), lineHeight: 1, margin: `${P(20)}px 0` }}>
            {meal.emoji}
          </span>
        )}
        <span style={{
          fontFamily: headerFont, fontSize: P(112), fontWeight: 400,
          color: 'var(--fmp-text)', lineHeight: 1.05, letterSpacing: '-0.01em',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
        }}>
          {meal.name}
        </span>
      </MealTapTarget>

      {/* Notes */}
      {meal.notes && (
        <span style={{
          fontSize: P(36), fontStyle: 'italic', color: 'var(--fmp-text-2)',
          maxWidth: '80%', lineHeight: 1.3,
        }}>
          {meal.notes}
        </span>
      )}

      {/* Meta pills and tags share one row, like the today hero. */}
      {((showPrepTime && meal.prepTime) || (showDifficulty && meal.difficulty) || (showTags && meal.tags && meal.tags.length > 0)) && (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, justifyContent: 'center', gap: P(16) }}>
          {showPrepTime && meal.prepTime && (
            <span style={pillStyle}>
              &#9201; {t('fullscreen-meal-planner.prepTimeMin', { minutes: meal.prepTime })}
            </span>
          )}
          {showDifficulty && meal.difficulty && (() => {
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
          {showTags && meal.tags?.map((tag) => (
            <span key={tag} style={pillStyle}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
