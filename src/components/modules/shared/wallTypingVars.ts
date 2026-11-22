import type { CSSProperties } from 'react';
import { buildThemeCSSVars, onAccentFor, type FullscreenThemeTokens } from '@/lib/fullscreen-themes';

/**
 * The colours the wall's typing pieces read (`WallKeyboard`, `WallTextField`,
 * `WallNotice`, `WallTypingSheet`): `--wt-bg`, `--wt-surface`, `--wt-text`,
 * `--wt-text-2`, `--wt-text-3`, `--wt-border`, `--wt-border-sub`,
 * `--wt-accent` and `--wt-on-accent`. Whoever opens them sets these on a
 * box around them: a full-screen theme and the module's accent here, or the
 * recipe book's own `--fmp-*` colours (`RecipeBookPanel`).
 */
export function wallTypingVars(theme: FullscreenThemeTokens, accent: string): CSSProperties {
  return {
    ...buildThemeCSSVars('wt', theme),
    '--wt-accent': accent,
    '--wt-on-accent': onAccentFor(accent),
  } as CSSProperties;
}
