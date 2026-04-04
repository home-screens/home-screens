import { SLOT_META, DAY_NAMES_SHORT, getOrderedDays, resolveMeal } from '@/lib/meal-constants';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { countPlanned } from './meal-planner-utils';

export default function WeekView({
  config, savedMeals, plan, now, slots, activeSlot, bu, s, pad, showEmoji, showPrepTime, headerFont, bodyFont,
}: MealPlannerViewProps) {
  const days = getOrderedDays(config.weekStartDay ?? 'sunday');
  const dateNow = now;
  const todayDow = dateNow.getDay();

  // Compute start-of-week date for the date range header
  let startOffset = days[0] - todayDow;
  if (startOffset > 0) startOffset -= 7;
  const weekStart = new Date(dateNow);
  weekStart.setDate(dateNow.getDate() + startOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const formatShort = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const dateRange = `${formatShort(weekStart)} – ${formatShort(weekEnd)}`;

  const { filled, total, pct } = countPlanned(plan, days.length * slots.length);

  // Determine past days using position within the ordered week
  const todayIndex = days.indexOf(todayDow);
  const isPast = (day: number) => days.indexOf(day) < todayIndex;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: bodyFont }}>
      {/* Header */}
      <div style={{
        padding: `${pad}px ${pad}px ${pad * 0.3}px`,
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: headerFont, fontSize: s * 2.8, fontWeight: 400, color: 'var(--fmp-text)' }}>
          This Week&rsquo;s Meals
        </div>
        <div style={{ fontSize: s * 1.1, color: 'var(--fmp-text-3)', marginTop: s * 0.3 }}>
          {dateRange}, {weekStart.getFullYear()}
        </div>
      </div>

      {/* Day rows */}
      <div className="fmp-scroll" style={{ flex: 1, minHeight: 0, padding: `0 ${pad}px`, display: 'flex', flexDirection: 'column', gap: s * 0.6 }}>
        {days.map((day) => {
          const isToday = day === todayDow;
          const dayPast = isPast(day);
          const dayDate = new Date(weekStart);
          dayDate.setDate(weekStart.getDate() + days.indexOf(day));
          const dateNum = dayDate.getDate();

          return (
            <div
              key={day}
              style={{
                opacity: dayPast && !isToday ? `var(--fmp-past-op)` : 1,
                background: isToday ? `color-mix(in srgb, var(--fmp-accent) 6%, transparent)` : 'transparent',
                border: isToday ? `1px solid color-mix(in srgb, var(--fmp-accent) 20%, transparent)` : '1px solid transparent',
                borderRadius: bu * 0.8,
                padding: `${s * 0.6}px ${s * 0.8}px`,
              } as React.CSSProperties}
            >
              {/* Day label row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: s * 0.5, marginBottom: s * 0.8 }}>
                <span style={{
                  fontSize: s * 1.2, fontWeight: 700, textTransform: 'uppercase' as const,
                  letterSpacing: '0.06em', color: isToday ? 'var(--fmp-accent)' : 'var(--fmp-text-2)',
                }}>
                  {DAY_NAMES_SHORT[day]}
                </span>
                <span style={{ fontSize: s * 1.1, color: 'var(--fmp-text-3)', fontWeight: 500 }}>
                  {dayDate.toLocaleDateString('en-US', { month: 'short' })} {dateNum}
                </span>
                {isToday && (
                  <span style={{
                    fontSize: s * 0.8, fontWeight: 700, color: 'var(--fmp-accent)',
                    background: `color-mix(in srgb, var(--fmp-accent) 12%, transparent)`,
                    padding: `${s * 0.15}px ${s * 0.6}px`, borderRadius: s * 0.3,
                    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
                    marginLeft: 'auto',
                  }}>
                    Today
                  </span>
                )}
              </div>

              {/* Meal cards row */}
              <div style={{ display: 'flex', gap: s * 0.6 }}>
                {slots.map((slot) => {
                  const meal = resolveMeal(day, slot, plan, savedMeals);
                  const meta = SLOT_META[slot];
                  const isActiveSlot = isToday && slot === activeSlot;

                  const slotLabel = (
                    <span style={{
                      fontSize: s * 0.7, fontWeight: 700,
                      textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                      color: meta.color, opacity: 0.85,
                    }}>
                      {meta.label}
                    </span>
                  );

                  if (!meal) {
                    return (
                      <div key={slot} style={{
                        flex: 1, minWidth: 0,
                        border: `1.5px dashed var(--fmp-border)`,
                        borderRadius: s * 0.8,
                        padding: `${s * 0.6}px ${s * 0.5}px ${s * 1}px`,
                        display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
                        justifyContent: 'center', gap: s * 0.4,
                        textAlign: 'center' as const,
                      }}>
                        {slotLabel}
                        <span style={{ color: 'var(--fmp-text-3)', fontSize: s * 1.6, fontWeight: 300, lineHeight: 1 }}>+</span>
                      </div>
                    );
                  }

                  return (
                    <div key={slot} style={{
                      flex: 1, minWidth: 0,
                      background: 'var(--fmp-surface)',
                      borderRadius: s * 0.8,
                      border: isActiveSlot
                        ? `2px solid var(--fmp-accent)`
                        : '1px solid var(--fmp-border-sub)',
                      borderTop: `3px solid ${meta.color}`,
                      boxShadow: isActiveSlot
                        ? `0 0 0 2px var(--fmp-accent), var(--fmp-card-shadow)`
                        : 'var(--fmp-card-shadow)',
                      padding: `${s * 0.5}px ${s * 0.5}px ${s * 0.8}px`,
                      display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
                      gap: s * 0.15,
                      position: 'relative' as const,
                      textAlign: 'center' as const,
                    }}>
                      {isActiveSlot && (
                        <span className="fmp-now-dot" style={{
                          position: 'absolute' as const, top: s * 0.5, right: s * 0.5,
                          width: s * 0.5, height: s * 0.5, borderRadius: '50%',
                          background: 'var(--fmp-accent)',
                        }} />
                      )}
                      {slotLabel}
                      {showEmoji && meal.emoji && (
                        <span style={{ fontSize: s * 3.2, lineHeight: 1.2 }}>
                          {meal.emoji}
                        </span>
                      )}
                      <span style={{
                        fontSize: s * 1.1, fontWeight: 600, color: 'var(--fmp-text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                        maxWidth: '100%',
                      }}>
                        {meal.name}
                      </span>
                      {showPrepTime && meal.prepTime && (
                        <span style={{ fontSize: s * 0.9, color: 'var(--fmp-text-3)' }}>
                          {meal.prepTime} min
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: `${pad * 0.6}px ${pad}px ${pad}px`, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: s * 1,
      }}>
        <span style={{ fontSize: s * 1, color: 'var(--fmp-text-3)', fontWeight: 500, whiteSpace: 'nowrap' as const }}>
          {filled} of {total} meals planned
        </span>
        <div style={{
          width: s * 6, height: s * 0.25, background: 'var(--fmp-border-sub)',
          borderRadius: s * 0.15, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', background: 'var(--fmp-accent)',
            borderRadius: s * 0.15, width: `${pct}%`, transition: 'width 0.5s ease',
          }} />
        </div>
      </div>
    </div>
  );
}
