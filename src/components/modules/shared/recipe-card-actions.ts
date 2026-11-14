import type { CSSProperties } from 'react';
import type { Px } from './recipe-book/RecipeBookParts';

/**
 * The round buttons down the recipe card's top corner, close then the heart,
 * on one size and spacing. Two is all the header keeps room for beside it
 * (`headerEndGap`): a third would sit over the Steps card on later pages.
 */
export function recipeCardActionStyle(P: Px, index: 0 | 1): CSSProperties {
  return {
    position: 'absolute', top: P(28 + 108 * index), right: P(28),
    width: P(92), height: P(92), minWidth: 0, minHeight: 0,
    padding: 0, border: 0, borderRadius: '50%',
    background: 'var(--fmp-border-sub)', color: 'var(--fmp-text-2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, fontSize: P(46), cursor: 'pointer',
  };
}
