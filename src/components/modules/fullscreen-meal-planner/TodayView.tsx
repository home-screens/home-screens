import type { MealPlannerViewProps } from './meal-planner-utils';
import { SLOT_META, SLOT_ORDER, SLOT_WINDOWS, resolveMeal, getDifficultyColor } from './meal-planner-utils';

export default function TodayView({
  savedMeals, plan, now, slots, activeSlot, bu, s, pad, showEmoji, showPrepTime, showTags, showDifficulty, headerFont, bodyFont,
}: MealPlannerViewProps) {
  const currentHour = now.getHours();
  const todayDow = now.getDay();
  const activeOrder = SLOT_ORDER.filter((sl) => slots.includes(sl));

  // Find current/hero meal
  const heroSlot = activeSlot ?? activeOrder[0] ?? 'dinner';
  const heroMeal = resolveMeal(todayDow, heroSlot, plan, savedMeals);
  const heroMeta = SLOT_META[heroSlot];

  // Other meals (non-hero)
  const otherSlots = activeOrder.filter((sl) => sl !== heroSlot);

  // Determine if a slot is past
  const isSlotPast = (sl: typeof SLOT_ORDER[number]) => {
    const w = SLOT_WINDOWS[sl];
    return currentHour >= w.end;
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      fontFamily: bodyFont, padding: pad,
    }}>
      {/* Header */}
      <div style={{
        fontFamily: headerFont, fontSize: s * 2.2, fontWeight: 400,
        color: 'var(--fmp-text)', marginBottom: s * 1.5,
      }}>
        Today&rsquo;s Meals
      </div>

      {/* Hero card */}
      <div style={{
        background: 'var(--fmp-surface)',
        borderRadius: bu * 1,
        padding: `${s * 2}px`,
        boxShadow: `0 0 ${s * 2}px color-mix(in srgb, var(--fmp-accent) 15%, transparent)`,
        border: `1px solid color-mix(in srgb, var(--fmp-accent) 25%, transparent)`,
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: s * 0.8,
      }}>
        {/* Badge */}
        <span style={{
          fontSize: s * 0.65, fontWeight: 600, textTransform: 'uppercase' as const,
          letterSpacing: '0.1em', color: 'var(--fmp-accent)',
          background: `color-mix(in srgb, var(--fmp-accent) 12%, transparent)`,
          padding: `${s * 0.15}px ${s * 0.6}px`, borderRadius: s * 0.3,
        }}>
          ⚡ Now &mdash; {heroMeta.label}
        </span>

        {heroMeal ? (
          <>
            {showEmoji && heroMeal.emoji && (
              <span style={{ fontSize: s * 3.5, lineHeight: 1 }}>{heroMeal.emoji}</span>
            )}
            <span style={{
              fontFamily: headerFont, fontSize: s * 1.8, fontWeight: 400,
              color: 'var(--fmp-text)', textAlign: 'center' as const,
            }}>
              {heroMeal.name}
            </span>
            {heroMeal.notes && (
              <span style={{
                fontSize: s * 0.8, fontStyle: 'italic', color: 'var(--fmp-text-2)',
                textAlign: 'center' as const, maxWidth: '80%',
              }}>
                {heroMeal.notes}
              </span>
            )}
            {/* Meta pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: s * 0.4, justifyContent: 'center' }}>
              {showPrepTime && heroMeal.prepTime && (
                <span style={{
                  fontSize: s * 0.65, color: 'var(--fmp-text-3)',
                  background: 'var(--fmp-border-sub)', padding: `${s * 0.1}px ${s * 0.5}px`,
                  borderRadius: s * 0.3,
                }}>
                  &#9201; {heroMeal.prepTime}m
                </span>
              )}
              {showDifficulty && heroMeal.difficulty && (() => {
                const dc = getDifficultyColor(heroMeal.difficulty);
                return (
                  <span style={{
                    fontSize: s * 0.65,
                    color: dc ?? 'var(--fmp-text-3)',
                    background: 'var(--fmp-border-sub)',
                    border: dc ? `1px solid ${dc}40` : undefined,
                    padding: `${s * 0.1}px ${s * 0.5}px`,
                    borderRadius: s * 0.3,
                  }}>
                    {heroMeal.difficulty}
                  </span>
                );
              })()}
              {showTags && heroMeal.tags?.map((tag) => (
                <span key={tag} style={{
                  fontSize: s * 0.6, color: 'var(--fmp-text-3)',
                  background: 'var(--fmp-border-sub)', padding: `${s * 0.1}px ${s * 0.5}px`,
                  borderRadius: s * 0.3,
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </>
        ) : (
          <span style={{ fontSize: s * 1.2, color: 'var(--fmp-text-3)', padding: `${s * 2}px 0` }}>
            No meal planned
          </span>
        )}
      </div>

      {/* Also Today */}
      {otherSlots.length > 0 && (
        <>
          <div style={{
            fontSize: s * 0.75, fontWeight: 600, textTransform: 'uppercase' as const,
            letterSpacing: '0.08em', color: 'var(--fmp-text-3)',
            marginTop: s * 2, marginBottom: s * 0.8,
          }}>
            Also Today
          </div>
          <div style={{ display: 'flex', gap: s * 0.6, flexWrap: 'wrap' as const }}>
            {otherSlots.map((sl) => {
              const meal = resolveMeal(todayDow, sl, plan, savedMeals);
              const meta = SLOT_META[sl];
              const past = isSlotPast(sl);

              return (
                <div key={sl} style={{
                  flex: 1, minWidth: s * 10,
                  background: 'var(--fmp-surface)', borderRadius: bu * 0.8,
                  border: '1px solid var(--fmp-border-sub)',
                  padding: `${s * 0.8}px ${s * 1}px`,
                  display: 'flex', alignItems: 'center', gap: s * 0.6,
                  opacity: past ? `var(--fmp-past-op)` : 1,
                } as React.CSSProperties}>
                  {/* Slot color bar */}
                  <span style={{
                    width: s * 0.3, height: s * 2, borderRadius: s * 0.15,
                    background: meta.color, flexShrink: 0,
                  }} />
                  {showEmoji && meal?.emoji && (
                    <span style={{ fontSize: s * 1.2, lineHeight: 1, flexShrink: 0 }}>{meal.emoji}</span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: s * 0.55, fontWeight: 600, textTransform: 'uppercase' as const,
                      letterSpacing: '0.06em', color: meta.color, marginBottom: s * 0.1,
                    }}>
                      {meta.label}
                    </div>
                    <div style={{
                      fontSize: s * 0.8, fontWeight: 600, color: 'var(--fmp-text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                    }}>
                      {meal?.name ?? 'Not planned'}
                    </div>
                  </div>
                  {showPrepTime && meal?.prepTime && (
                    <span style={{ fontSize: s * 0.6, color: 'var(--fmp-text-3)', flexShrink: 0 }}>
                      {meal.prepTime}m
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
