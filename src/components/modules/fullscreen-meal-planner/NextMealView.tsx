import type { MealPlannerViewProps } from './meal-planner-utils';
import { SLOT_META, getNextMeal, getDifficultyColor } from './meal-planner-utils';

export default function NextMealView({
  savedMeals, plan, now, slots, s, pad, showEmoji, showPrepTime, showTags, showDifficulty, headerFont, bodyFont,
}: MealPlannerViewProps) {
  const next = getNextMeal(now, plan, savedMeals, slots);

  if (!next) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', fontFamily: bodyFont,
        gap: s * 1, color: 'var(--fmp-text-3)',
      }}>
        <span style={{ fontSize: s * 3, lineHeight: 1, opacity: 0.3 }}>&#127869;</span>
        <span style={{ fontSize: s * 1.2, fontWeight: 500 }}>No upcoming meals planned</span>
      </div>
    );
  }

  const { meal, slot, context } = next;
  const meta = SLOT_META[slot];

  const contextStyles: Record<string, { color: string; bg: string; label: string; icon: string }> = {
    now:       { color: 'var(--fmp-accent)', bg: `color-mix(in srgb, var(--fmp-accent) 12%, transparent)`, label: 'Now', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    upcoming:  { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)', label: 'Coming Up', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm1-13h-2v6l5.25 3.15.75-1.23-4-2.42V7z' },
    tomorrow:  { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', label: 'Tomorrow', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm1-13h-2v6l5.25 3.15.75-1.23-4-2.42V7z' },
  };
  const ctx = contextStyles[context] ?? contextStyles.now;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', fontFamily: bodyFont,
      padding: pad, gap: s * 0.8,
    }}>
      {/* Context badge */}
      <span style={{
        fontSize: s * 0.7, fontWeight: 700, textTransform: 'uppercase' as const,
        letterSpacing: '0.12em', color: ctx.color, background: ctx.bg,
        padding: `${s * 0.2}px ${s * 0.8}px`, borderRadius: s * 0.4,
        display: 'inline-flex', alignItems: 'center', gap: s * 0.3,
      }}>
        <svg width={s * 0.8} height={s * 0.8} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
          <path d={ctx.icon} />
        </svg>
        {ctx.label}
      </span>

      {/* Slot label */}
      <span style={{
        fontSize: s * 0.8, fontWeight: 600, textTransform: 'uppercase' as const,
        letterSpacing: '0.1em', color: 'var(--fmp-text-3)',
      }}>
        {meta.label}
      </span>

      {/* Giant emoji */}
      {showEmoji && meal.emoji && (
        <span style={{ fontSize: s * 5.5, lineHeight: 1, margin: `${s * 0.5}px 0` }}>
          {meal.emoji}
        </span>
      )}

      {/* Meal name */}
      <span style={{
        fontFamily: headerFont, fontSize: s * 2.5, fontWeight: 400,
        color: 'var(--fmp-text)', textAlign: 'center' as const,
        lineHeight: 1.2,
      }}>
        {meal.name}
      </span>

      {/* Notes */}
      {meal.notes && (
        <span style={{
          fontSize: s * 0.85, fontStyle: 'italic', color: 'var(--fmp-text-2)',
          textAlign: 'center' as const, maxWidth: '80%',
        }}>
          {meal.notes}
        </span>
      )}

      {/* Meta pills */}
      {(showPrepTime || showDifficulty) && (meal.prepTime || meal.difficulty) && (
        <div style={{
          display: 'flex', gap: s * 0.5, marginTop: s * 0.3,
        }}>
          {showPrepTime && meal.prepTime && (
            <span style={{
              fontSize: s * 0.7, color: 'var(--fmp-text-3)',
              background: 'var(--fmp-border-sub)', padding: `${s * 0.15}px ${s * 0.6}px`,
              borderRadius: s * 0.3,
            }}>
              &#9201; {meal.prepTime} min
            </span>
          )}
          {showDifficulty && meal.difficulty && (() => {
            const dc = getDifficultyColor(meal.difficulty);
            return (
              <span style={{
                fontSize: s * 0.7,
                color: dc ?? 'var(--fmp-text-3)',
                background: 'var(--fmp-border-sub)',
                border: dc ? `1px solid ${dc}40` : undefined,
                padding: `${s * 0.15}px ${s * 0.6}px`,
                borderRadius: s * 0.3,
              }}>
                {meal.difficulty}
              </span>
            );
          })()}
        </div>
      )}

      {/* Tags */}
      {showTags && meal.tags && meal.tags.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap' as const, gap: s * 0.4,
          justifyContent: 'center', marginTop: s * 0.3,
        }}>
          {meal.tags.map((tag) => (
            <span key={tag} style={{
              fontSize: s * 0.6, color: 'var(--fmp-text-2)',
              background: 'var(--fmp-border-sub)', padding: `${s * 0.1}px ${s * 0.5}px`,
              borderRadius: s * 0.3,
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
