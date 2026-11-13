import type { CSSProperties } from 'react';
import type { Px } from './recipe-book/RecipeBookParts';

// Keep close, favorite and rating buttons on the same size and spacing rules.
export function recipeCardActionStyle(P: Px, index: 0 | 1 | 2): CSSProperties {
  return {
    position: 'absolute', top: P(28 + 108 * index), right: P(28),
    width: P(92), height: P(92), minWidth: 0, minHeight: 0,
    padding: 0, border: 0, borderRadius: '50%',
    background: 'var(--fmp-border-sub)', color: 'var(--fmp-text-2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, fontSize: P(46), cursor: 'pointer',
  };
}
