import { SLOT_META, SLOT_ORDER, SLOT_WINDOWS, getMealSlotLabelKey, resolveMealWithEntry, toISODate, formatMealTime, resolvePlannedMealTime } from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate, formatDateSync } from '@/i18n';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { FIT_MEASURE_ATTR } from '@/hooks/useFitScale';
import { getDifficultyColor, px } from './meal-planner-utils';
import { MealTapTarget } from '../shared/MealTapTarget';

/**
 * Today's meals, sized for a wall. The hero (the meal that matters right now)
 * takes the larger share of the column and the other slots become full-width
 * rows that split what is left, so the view fills a 1920px panel instead of
 * ending a fifth of the way down it. Every size is an authored canvas pixel
 * at 1080 wide / `medium` (see `px`), so typographySize keeps scaling it.
 */
export default function TodayView({
  settings, timeFormat, savedMeals, plan, now, slots, activeSlot, s, showEmoji, showPrepTime, showTags, showDifficulty, showTitle, headerFont, bodyFont, recipeTapMode, landscape,
}: MealPlannerViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const P = (n: number) => px(s, n);
  const currentHour = now.getHours();
  const todayISO = toISODate(now);
  const activeOrder = SLOT_ORDER.filter((sl) => slots.includes(sl));

  // Find current/hero meal + the badge label that goes with it.
  // Three cases, in priority order:
  //   1. Currently inside a slot window     → "Now"
  //   2. Before some slot starts later today → "Up Next"
  //   3. Past all of today's slots          → "Tonight" (show today's last slot)
  // Without case 3, late-evening (e.g. 9:30pm — past dinner's [17,21) window)
  // would fall back to activeOrder[0] = breakfast and mislabel it as "Now".
  let heroSlot: typeof SLOT_ORDER[number];
  let heroLabel: string;
  if (activeSlot) {
    heroSlot = activeSlot;
    heroLabel = t('fullscreen-meal-planner.heroLabels.now');
  } else {
    const upcoming = activeOrder.find((sl) => currentHour < SLOT_WINDOWS[sl].start);
    if (upcoming) {
      heroSlot = upcoming;
      heroLabel = t('fullscreen-meal-planner.heroLabels.upNext');
    } else {
      heroSlot = activeOrder[activeOrder.length - 1] ?? 'dinner';
      heroLabel = t('fullscreen-meal-planner.heroLabels.tonight');
    }
  }
  const { meal: heroMeal, planned: heroPlanned } = resolveMealWithEntry(todayISO, heroSlot, plan, savedMeals);
  const heroTime = resolvePlannedMealTime(heroPlanned, heroSlot, settings.defaultSlotTimes);

  const otherSlots = activeOrder.filter((sl) => sl !== heroSlot);
  const heroAlone = otherSlots.length === 0;

  const isSlotPast = (sl: typeof SLOT_ORDER[number]) => {
    const w = SLOT_WINDOWS[sl];
    return currentHour >= w.end;
  };

  const dateStr = formatDateSync(now, 'EEEE, MMMM d', { locale });
  const pillStyle: React.CSSProperties = {
    fontSize: P(26), color: 'var(--fmp-text-3)',
    background: 'var(--fmp-border-sub)', padding: `${P(8)}px ${P(20)}px`,
    borderRadius: P(12),
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      fontFamily: bodyFont, padding: `${P(56)}px ${P(56)}px ${P(48)}px`,
    }}>
      {/* Header */}
      {showTitle && (
        <div style={{ flexShrink: 0, marginBottom: P(36) }}>
          <div style={{ fontFamily: headerFont, fontSize: P(60), fontWeight: 400, lineHeight: 1, color: 'var(--fmp-text)', letterSpacing: '-0.01em' }}>
            {t('fullscreen-meal-planner.todaysMeals')}
          </div>
          <div style={{ fontSize: P(26), color: 'var(--fmp-text-3)', marginTop: P(10) }}>
            {dateStr}
          </div>
        </div>
      )}

      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: landscape ? 'row' : 'column',
        gap: landscape ? P(40) : 0,
      }}>
        {/* Hero card. Stamped for the fit loop: content taller than the card
            would overlap the rows below without ever leaving the root box,
            which the root's own overflow check cannot see. */}
        <div {...{ [FIT_MEASURE_ATTR]: '' }} style={{
          flex: heroAlone ? 1 : (landscape ? '0 0 60%' : 1.55), minHeight: 0, minWidth: 0,
          background: 'var(--fmp-surface)',
          borderRadius: P(36),
          padding: P(40),
          boxShadow: `0 0 ${P(60)}px color-mix(in srgb, var(--fmp-accent) 14%, transparent)`,
          border: `2px solid color-mix(in srgb, var(--fmp-accent) 28%, transparent)`,
          display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
          gap: heroAlone ? P(30) : P(22), textAlign: 'center' as const,
        }}>
          {/* Badge */}
          <span style={{
            fontSize: P(26), fontWeight: 700, textTransform: 'uppercase' as const,
            letterSpacing: '0.12em', color: 'var(--fmp-accent)',
            background: `color-mix(in srgb, var(--fmp-accent) 12%, transparent)`,
            padding: `${P(10)}px ${P(24)}px`, borderRadius: P(12),
            display: 'inline-flex', alignItems: 'center', gap: P(10),
          }}>
            <span>⚡ {heroLabel} · {t(getMealSlotLabelKey(heroSlot))}</span>
            {heroTime && (
              <span style={{
                fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                textTransform: 'none' as const, letterSpacing: 0, opacity: 0.85,
              }}>
                {formatMealTime(heroTime, timeFormat)}
              </span>
            )}
          </span>

          {heroMeal ? (
            <>
              <MealTapTarget
                meal={heroMeal}
                mode={recipeTapMode}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: P(22), maxWidth: '100%',
                }}
              >
                {showEmoji && heroMeal.emoji && (
                  <span style={{ fontSize: P(heroAlone ? 320 : 250), lineHeight: 1 }}>{heroMeal.emoji}</span>
                )}
                <span style={{
                  fontFamily: headerFont, fontSize: P(heroAlone ? 96 : 84), fontWeight: 400,
                  color: 'var(--fmp-text)', lineHeight: 1.05, letterSpacing: '-0.01em',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                  overflow: 'hidden',
                }}>
                  {heroMeal.name}
                </span>
              </MealTapTarget>
              {heroMeal.notes && (
                <span style={{
                  fontSize: P(30), fontStyle: 'italic', color: 'var(--fmp-text-2)',
                  maxWidth: '80%', lineHeight: 1.3,
                }}>
                  {heroMeal.notes}
                </span>
              )}
              {/* Meta pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: P(14), justifyContent: 'center' }}>
                {showPrepTime && heroMeal.prepTime && (
                  <span style={pillStyle}>
                    &#9201; {t('fullscreen-meal-planner.prepTimeMinShort', { minutes: heroMeal.prepTime })}
                  </span>
                )}
                {showDifficulty && heroMeal.difficulty && (() => {
                  const dc = getDifficultyColor(heroMeal.difficulty);
                  return (
                    <span style={{
                      ...pillStyle,
                      color: dc ?? 'var(--fmp-text-3)',
                      border: dc ? `1px solid ${dc}40` : undefined,
                    }}>
                      {heroMeal.difficulty}
                    </span>
                  );
                })()}
                {showTags && heroMeal.tags?.map((tag) => (
                  <span key={tag} style={pillStyle}>
                    {tag}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <span style={{ fontSize: P(60), fontFamily: headerFont, color: 'var(--fmp-text-3)', lineHeight: 1.1 }}>
              {t('fullscreen-meal-planner.noMealPlanned')}
            </span>
          )}
        </div>

        {/* Also Today */}
        {!heroAlone && (
          <div style={{
            flex: 1, minHeight: 0, minWidth: 0,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              flexShrink: 0,
              fontSize: P(22), fontWeight: 700, textTransform: 'uppercase' as const,
              letterSpacing: '0.12em', color: 'var(--fmp-text-3)',
              margin: landscape ? `0 0 ${P(18)}px` : `${P(40)}px 0 ${P(18)}px`,
            }}>
              {t('fullscreen-meal-planner.alsoToday')}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: P(18) }}>
              {otherSlots.map((sl) => {
                const { meal, planned } = resolveMealWithEntry(todayISO, sl, plan, savedMeals);
                const slotTime = resolvePlannedMealTime(planned, sl, settings.defaultSlotTimes);
                const meta = SLOT_META[sl];
                const past = isSlotPast(sl);

                return (
                  <div key={sl} {...{ [FIT_MEASURE_ATTR]: '' }} style={{
                    flex: 1, minHeight: 0,
                    background: 'var(--fmp-surface)', borderRadius: P(24),
                    border: '1px solid var(--fmp-border-sub)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                    padding: `0 ${P(32)}px`,
                    display: 'flex', alignItems: 'center', gap: P(24),
                    opacity: past ? `var(--fmp-past-op)` : 1,
                  } as React.CSSProperties}>
                    {/* Slot color bar */}
                    <span style={{
                      width: P(10), height: '60%', borderRadius: P(5),
                      background: meta.color, flexShrink: 0,
                    }} />
                    <MealTapTarget
                      meal={meal}
                      mode={recipeTapMode}
                      style={{ display: 'flex', alignItems: 'center', gap: P(24), flex: 1, minWidth: 0 }}
                    >
                      {showEmoji && meal?.emoji && (
                        <span style={{ fontSize: P(76), lineHeight: 1, flexShrink: 0 }}>{meal.emoji}</span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: P(24), fontWeight: 700, textTransform: 'uppercase' as const,
                          letterSpacing: '0.08em', color: meta.color,
                          display: 'flex', alignItems: 'baseline', gap: P(12),
                        }}>
                          <span>{t(getMealSlotLabelKey(sl))}</span>
                          {slotTime && (
                            <span style={{
                              color: 'var(--fmp-text-3)', fontWeight: 600,
                              textTransform: 'none' as const,
                              letterSpacing: 0,
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {formatMealTime(slotTime, timeFormat)}
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: P(46), fontWeight: 600, color: 'var(--fmp-text)', marginTop: P(4),
                          letterSpacing: '-0.01em', lineHeight: 1.15,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                          textAlign: 'left' as const,
                        }}>
                          {meal?.name ?? t('fullscreen-meal-planner.notPlanned')}
                        </div>
                      </div>
                    </MealTapTarget>
                    {showPrepTime && meal?.prepTime && (
                      <span style={{ fontSize: P(26), color: 'var(--fmp-text-3)', flexShrink: 0 }}>
                        {t('fullscreen-meal-planner.prepTimeMinShort', { minutes: meal.prepTime })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
