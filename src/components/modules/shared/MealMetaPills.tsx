'use client';

import type { CSSProperties } from 'react';
import type { SavedMeal } from '@/types/config';
import { useTranslate } from '@/i18n';
import { DIFFICULTY_COLORS } from '@/lib/meal-constants';
import { mealTagLabel } from '@/lib/meal-dish-rules';
import { useMealMinutes } from './useMealMinutes';
import { withAlpha } from '@/lib/hex-color';

interface MealMetaPillsProps {
  meal: SavedMeal | null;
  showPrepTime: boolean;
  showDifficulty: boolean;
  showTags: boolean;
  /** "25m" rather than "25 min". */
  shortMinutes?: boolean;
  /** Each pill's size and colours; the difficulty pill takes its own colour on top. */
  pillStyle: CSSProperties;
  gap: number;
}

/**
 * A full-screen meal card's row of pills under the dish: how long it takes,
 * how hard it is and its tags, each worded as the phone words them (the
 * core dictionary's difficulty, `mealTagLabel`). Nothing at all when the dish
 * has none of them to show.
 */
export function MealMetaPills({ meal, showPrepTime, showDifficulty, showTags, shortMinutes = false, pillStyle, gap }: MealMetaPillsProps) {
  const tCore = useTranslate('core');
  const mealMinutes = useMealMinutes();
  const minutes = showPrepTime ? mealMinutes(meal, shortMinutes) : null;
  const difficulty = showDifficulty ? meal?.difficulty : undefined;
  const tags = showTags && meal ? meal.tags ?? [] : [];
  if (!meal || (!minutes && !difficulty && tags.length === 0)) return null;
  const difficultyColor = difficulty ? DIFFICULTY_COLORS[difficulty] : undefined;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap }}>
      {minutes && (
        <span style={pillStyle}>
          &#9201; {minutes}
        </span>
      )}
      {difficulty && (
        <span style={{
          ...pillStyle,
          color: difficultyColor ?? 'var(--fmp-text-3)',
          border: difficultyColor ? `1px solid ${withAlpha(difficultyColor, 0.25)}` : undefined,
        }}>
          {tCore(`meal.difficulty.${difficulty}`)}
        </span>
      )}
      {tags.map((tag) => (
        <span key={tag} style={pillStyle}>
          {mealTagLabel(meal, tag)}
        </span>
      ))}
    </div>
  );
}
