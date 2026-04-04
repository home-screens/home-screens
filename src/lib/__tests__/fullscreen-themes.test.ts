import { describe, it, expect } from 'vitest';
import {
  FULLSCREEN_THEMES,
  getThemeTokens,
  migrateFromDarkMode,
  buildThemeCSSVars,
  getTypoMultiplier,
  getDensityMultiplier,
} from '../fullscreen-themes';

// ---------------------------------------------------------------------------
// FULLSCREEN_THEMES registry
// ---------------------------------------------------------------------------
describe('FULLSCREEN_THEMES', () => {
  it('contains exactly 6 themes', () => {
    expect(FULLSCREEN_THEMES).toHaveLength(6);
  });

  it('has 3 light and 3 dark themes', () => {
    const light = FULLSCREEN_THEMES.filter((t) => t.group === 'light');
    const dark = FULLSCREEN_THEMES.filter((t) => t.group === 'dark');
    expect(light).toHaveLength(3);
    expect(dark).toHaveLength(3);
  });

  it('all themes have unique IDs', () => {
    const ids = FULLSCREEN_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all dark themes have isDark=true, light themes have isDark=false', () => {
    for (const theme of FULLSCREEN_THEMES) {
      expect(theme.tokens.isDark).toBe(theme.group === 'dark');
    }
  });

  it('all themes have valid pastOpacity between 0 and 1', () => {
    for (const theme of FULLSCREEN_THEMES) {
      expect(theme.tokens.pastOpacity).toBeGreaterThan(0);
      expect(theme.tokens.pastOpacity).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// getThemeTokens
// ---------------------------------------------------------------------------
describe('getThemeTokens', () => {
  it('returns correct tokens for known theme IDs', () => {
    const midnight = getThemeTokens('midnight');
    expect(midnight.bg).toBe('#0a0a0a');
    expect(midnight.isDark).toBe(true);

    const paper = getThemeTokens('paper');
    expect(paper.bg).toBe('#fafafa');
    expect(paper.isDark).toBe(false);
  });

  it('falls back to linen for undefined', () => {
    const tokens = getThemeTokens(undefined);
    expect(tokens.bg).toBe('#f5f1ea');
    expect(tokens.isDark).toBe(false);
  });

  it('falls back to linen for unknown theme ID', () => {
    const tokens = getThemeTokens('nonexistent');
    expect(tokens.bg).toBe('#f5f1ea');
  });

  it('returns every expected token field', () => {
    const tokens = getThemeTokens('slate');
    const expectedFields = [
      'bg', 'surface', 'surfaceHover', 'surfaceAlt',
      'text', 'textSecondary', 'textMuted',
      'border', 'borderSubtle', 'headerBg', 'cardShadow',
      'pastOpacity', 'isDark',
    ];
    for (const field of expectedFields) {
      expect(tokens).toHaveProperty(field);
    }
  });
});

// ---------------------------------------------------------------------------
// migrateFromDarkMode
// ---------------------------------------------------------------------------
describe('migrateFromDarkMode', () => {
  it('maps true to charcoal', () => {
    expect(migrateFromDarkMode(true)).toBe('charcoal');
  });

  it('maps false to linen', () => {
    expect(migrateFromDarkMode(false)).toBe('linen');
  });

  it('maps undefined to linen', () => {
    expect(migrateFromDarkMode(undefined)).toBe('linen');
  });
});

// ---------------------------------------------------------------------------
// buildThemeCSSVars
// ---------------------------------------------------------------------------
describe('buildThemeCSSVars', () => {
  it('generates CSS custom properties with the given prefix', () => {
    const tokens = getThemeTokens('charcoal');
    const vars = buildThemeCSSVars('meal', tokens);

    expect(vars['--meal-bg']).toBe(tokens.bg);
    expect(vars['--meal-surface']).toBe(tokens.surface);
    expect(vars['--meal-text']).toBe(tokens.text);
    expect(vars['--meal-text-2']).toBe(tokens.textSecondary);
    expect(vars['--meal-text-3']).toBe(tokens.textMuted);
    expect(vars['--meal-border']).toBe(tokens.border);
    expect(vars['--meal-border-sub']).toBe(tokens.borderSubtle);
    expect(vars['--meal-card-shadow']).toBe(tokens.cardShadow);
    expect(vars['--meal-past-op']).toBe(String(tokens.pastOpacity));
  });

  it('produces exactly 9 CSS properties', () => {
    const vars = buildThemeCSSVars('x', getThemeTokens('paper'));
    expect(Object.keys(vars)).toHaveLength(9);
  });

  it('uses different prefix correctly', () => {
    const vars = buildThemeCSSVars('chore', getThemeTokens('mist'));
    expect(vars).toHaveProperty('--chore-bg');
    expect(vars).not.toHaveProperty('--meal-bg');
  });
});

// ---------------------------------------------------------------------------
// getTypoMultiplier
// ---------------------------------------------------------------------------
describe('getTypoMultiplier', () => {
  it('returns correct multipliers for all valid sizes', () => {
    expect(getTypoMultiplier('small')).toBe(0.85);
    expect(getTypoMultiplier('medium')).toBe(1.0);
    expect(getTypoMultiplier('large')).toBe(1.15);
    expect(getTypoMultiplier('extra-large')).toBe(1.35);
    expect(getTypoMultiplier('2x-large')).toBe(1.6);
    expect(getTypoMultiplier('3x-large')).toBe(1.85);
  });

  it('returns 1.0 for unknown size strings', () => {
    expect(getTypoMultiplier('xxxl')).toBe(1.0);
    expect(getTypoMultiplier('')).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// getDensityMultiplier
// ---------------------------------------------------------------------------
describe('getDensityMultiplier', () => {
  it('returns 1.2 for cozy', () => {
    expect(getDensityMultiplier('cozy')).toBe(1.2);
  });

  it('returns 1.0 for any other value', () => {
    expect(getDensityMultiplier('compact')).toBe(1.0);
    expect(getDensityMultiplier('normal')).toBe(1.0);
    expect(getDensityMultiplier('')).toBe(1.0);
  });
});
