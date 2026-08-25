import { describe, it, expect } from 'vitest';
import {
  FULLSCREEN_THEMES,
  getThemeTokens,
  migrateFromDarkMode,
  buildThemeCSSVars,
  getTypoMultiplier,
  getDensityMultiplier,
  resolveFullscreenAccent,
  surfaceBackdrop,
} from '../fullscreen-themes';

// ---------------------------------------------------------------------------
// FULLSCREEN_THEMES registry
// ---------------------------------------------------------------------------
describe('FULLSCREEN_THEMES', () => {
  it('contains exactly 12 themes', () => {
    expect(FULLSCREEN_THEMES).toHaveLength(12);
  });

  it('has 6 light and 6 dark themes', () => {
    const light = FULLSCREEN_THEMES.filter((t) => t.group === 'light');
    const dark = FULLSCREEN_THEMES.filter((t) => t.group === 'dark');
    expect(light).toHaveLength(6);
    expect(dark).toHaveLength(6);
  });

  it('leaves the six original themes free of atmosphere tokens', () => {
    // Adding optional tokens must not silently restyle a display someone
    // already chose, so the pre-existing themes stay on the defaults.
    for (const id of ['linen', 'paper', 'mist', 'charcoal', 'midnight', 'slate']) {
      const tokens = FULLSCREEN_THEMES.find((t) => t.id === id)!.tokens;
      expect(tokens.bgImage).toBeUndefined();
      expect(tokens.eventStyle).toBeUndefined();
      expect(tokens.accent).toBeUndefined();
      expect(tokens.todayFill).toBeUndefined();
    }
  });

  it('gives every themed event style a matching accent and on-accent pair', () => {
    for (const theme of FULLSCREEN_THEMES) {
      if (!theme.tokens.eventStyle) continue;
      expect(theme.tokens.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.tokens.onAccent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
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
    // Themes with no atmosphere layer still emit valid values.
    expect(vars['--meal-bg-image']).toBe('none');
    expect(vars['--meal-surface-backdrop']).toBe('none');
    expect(vars['--meal-text']).toBe(tokens.text);
    expect(vars['--meal-text-2']).toBe(tokens.textSecondary);
    expect(vars['--meal-text-3']).toBe(tokens.textMuted);
    expect(vars['--meal-border']).toBe(tokens.border);
    expect(vars['--meal-border-sub']).toBe(tokens.borderSubtle);
    expect(vars['--meal-card-shadow']).toBe(tokens.cardShadow);
    expect(vars['--meal-past-op']).toBe(String(tokens.pastOpacity));
  });

  it('produces exactly 11 CSS properties', () => {
    const vars = buildThemeCSSVars('x', getThemeTokens('paper'));
    expect(Object.keys(vars)).toHaveLength(11);
  });

  it('uses different prefix correctly', () => {
    const vars = buildThemeCSSVars('chore', getThemeTokens('mist'));
    expect(vars).toHaveProperty('--chore-bg');
    expect(vars).not.toHaveProperty('--meal-bg');
  });

  it('emits the atmosphere layer for themes that carry one', () => {
    const vars = buildThemeCSSVars('x', getThemeTokens('aurora'));
    expect(vars['--x-bg-image']).toMatch(/^radial-gradient/);
    expect(vars['--x-surface-backdrop']).toBe('blur(18px)');
  });
});

// ---------------------------------------------------------------------------
// surfaceBackdrop
// ---------------------------------------------------------------------------
describe('surfaceBackdrop', () => {
  it('is a real blur only when the theme asks for one', () => {
    // `blur(0px)` is not free on the Pi: it still promotes a backdrop
    // render surface for no visual change, so flat themes get `none`.
    expect(surfaceBackdrop(getThemeTokens('linen'))).toBe('none');
    expect(surfaceBackdrop(getThemeTokens('obsidian'))).toBe('blur(20px)');
  });
});

// ---------------------------------------------------------------------------
// resolveFullscreenAccent
// ---------------------------------------------------------------------------
describe('resolveFullscreenAccent', () => {
  it('lets a user color win over the theme accent', () => {
    expect(resolveFullscreenAccent('#ff0000', getThemeTokens('aurora'), '#000')).toBe('#ff0000');
  });

  it('falls through to the theme accent while the user color is empty', () => {
    expect(resolveFullscreenAccent('', getThemeTokens('aurora'), '#000')).toBe('#5EEAD4');
    expect(resolveFullscreenAccent(undefined, getThemeTokens('aurora'), '#000')).toBe('#5EEAD4');
  });

  it('uses the module fallback on a theme with no accent of its own', () => {
    expect(resolveFullscreenAccent('', getThemeTokens('charcoal'), '#f59e0b')).toBe('#f59e0b');
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
    expect(getTypoMultiplier('4x-large')).toBe(2.15);
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
