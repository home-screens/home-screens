import type { CSSProperties } from 'react';
import type { TextConfig, ModuleStyle } from '@/types/config';

interface BuildTextStyleParams {
  config: TextConfig;
  style: ModuleStyle;
  isVerticalLayout: boolean;
  textTransform: NonNullable<TextConfig['textTransform']>;
  letterSpacing: number;
  writingModeStyles: CSSProperties;
  fontStack: string | undefined;
  effect: string;
  animSeconds: number;
  wrapMode: NonNullable<TextConfig['wrapMode']>;
  gradientOn: boolean;
  colorCycleName: string;
}

/** Apply the shadow/stroke/animation styles for the one active `effect`.
 *  Effects are mutually exclusive (a single string value), so a switch reads
 *  clearer than the previous sequential-if chain while behaving identically. */
function applyEffectStyles(
  textStyle: CSSProperties,
  { config, style, effect, animSeconds, colorCycleName }: BuildTextStyleParams,
): void {
  switch (effect) {
    case 'glow': {
      const c = config.accentColor || style.textColor;
      textStyle.textShadow = `0 0 10px ${c}, 0 0 20px ${c}, 0 0 40px ${c}80`;
      textStyle.animation = `_textGlow ${animSeconds}s ease-in-out infinite alternate`;
      break;
    }
    case 'neon': {
      const c = config.accentColor || '#22d3ee';
      textStyle.color = '#fff';
      textStyle.textShadow = [`0 0 4px ${c}`, `0 0 10px ${c}`, `0 0 20px ${c}`, `0 0 40px ${c}`].join(', ');
      textStyle.animation = `_textNeonFlicker ${animSeconds * 1.5}s linear infinite`;
      break;
    }
    case 'shadow': {
      const x = config.shadowOffsetX ?? 2;
      const y = config.shadowOffsetY ?? 2;
      const blur = config.shadowBlur ?? 4;
      const c = config.shadowColor ?? 'rgba(0,0,0,0.5)';
      textStyle.textShadow = `${x}px ${y}px ${blur}px ${c}`;
      break;
    }
    case '3d': {
      const c = config.accentColor || 'rgba(0,0,0,0.5)';
      textStyle.textShadow = [1, 2, 3, 4, 5, 6].map((n) => `${n}px ${n}px 0 ${c}`).join(', ');
      break;
    }
    case 'outline': {
      const w = config.outlineWidth ?? 2;
      const c = config.outlineColor ?? '#000';
      (textStyle as Record<string, unknown>).WebkitTextStrokeWidth = `${w}px`;
      (textStyle as Record<string, unknown>).WebkitTextStrokeColor = c;
      break;
    }
    case 'color-cycle': {
      textStyle.animation = `${colorCycleName} ${animSeconds * 2}s linear infinite`;
      break;
    }
  }
}

/** Pure computation of the inline styles applied to the text span. Conditional
 *  keys are only present when their source config value is truthy, matching the
 *  original sequential-mutation build key-for-key. */
export function buildTextStyle(params: BuildTextStyleParams): CSSProperties {
  const {
    config,
    isVerticalLayout,
    textTransform,
    letterSpacing,
    writingModeStyles,
    fontStack,
    effect,
    animSeconds,
    wrapMode,
    gradientOn,
  } = params;

  const textStyle: CSSProperties = {
    textAlign: isVerticalLayout ? undefined : config.alignment,
    textTransform: textTransform !== 'none' ? textTransform : undefined,
    letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
    wordSpacing: config.wordSpacing ? `${config.wordSpacing}px` : undefined,
    fontFamily: config.fontFamily ? fontStack : undefined,
    fontStyle: config.italic ? 'italic' : undefined,
    lineHeight: config.lineHeight,
    ...writingModeStyles,
  };

  // Decoration
  const decoration = config.textDecoration ?? 'none';
  if (decoration !== 'none') {
    textStyle.textDecorationLine = decoration;
    if (config.textDecorationColor) textStyle.textDecorationColor = config.textDecorationColor;
    if (config.textDecorationThickness) textStyle.textDecorationThickness = `${config.textDecorationThickness}px`;
  }

  // Wrap mode (text-wrap is wired through a long-hand prop set via inline string)
  if (wrapMode === 'nowrap') {
    textStyle.whiteSpace = 'nowrap';
  } else if (wrapMode === 'balance' || wrapMode === 'pretty') {
    (textStyle as Record<string, unknown>).textWrap = wrapMode;
  }

  // Text background — paint behind glyphs without affecting wrapper
  if (config.textBackground) {
    textStyle.backgroundColor = config.textBackground;
    textStyle.padding = `${config.textBackgroundPadding ?? 4}px ${(config.textBackgroundPadding ?? 4) * 1.5}px`;
    textStyle.borderRadius = `${config.textBackgroundRadius ?? 4}px`;
    textStyle.boxDecorationBreak = 'clone';
    textStyle.WebkitBoxDecorationBreak = 'clone';
  }

  // Gradient text (clip properties applied via <style> rule to avoid React reconciliation issues)
  if (gradientOn) {
    const angle = config.gradientAngle ?? 90;
    textStyle.backgroundImage = `linear-gradient(${angle}deg, ${config.gradientFrom}, ${config.gradientTo})`;
    if (effect === 'gradient-sweep') {
      textStyle.backgroundSize = '200% 200%';
      textStyle.animation = `_textGradientSweep ${animSeconds * 1.5}s ease infinite`;
    }
  }

  applyEffectStyles(textStyle, params);

  return textStyle;
}
