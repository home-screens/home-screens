'use client';

import { useState, useEffect, useRef, useMemo, useId } from 'react';
import type { TextConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import { useTypewriter } from '@/hooks/useTypewriter';
import { resolveTemplateVariables, parseMarkdown, splitRotationContent } from '@/lib/text-utils';
import { extractSharedStateKeys, resolveSharedStateTokens } from '@/lib/shared-state-template';
import { useSharedStateKeys } from '@/hooks/useSharedStateKeys';
import { resolveFontStack } from '@/lib/font-registry';

interface TextModuleProps {
  config: TextConfig;
  style: ModuleStyle;
  timezone?: string;
}

// ---------------------------------------------------------------------------
// Auto-fit: scale content to fill container
// ---------------------------------------------------------------------------

interface AutoFitResult {
  scale: number;
  measuredWidth: number;
  measuredHeight: number;
}

function useAutoFit(
  containerRef: React.RefObject<HTMLDivElement | null>,
  measureRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  deps: unknown[],
): AutoFitResult {
  const [state, setState] = useState<AutoFitResult>({ scale: 1, measuredWidth: 0, measuredHeight: 0 });

  useEffect(() => {
    if (!enabled) {
      setState({ scale: 1, measuredWidth: 0, measuredHeight: 0 });
      return;
    }
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    let rafHandle: number;

    const remeasure = () => {
      cancelAnimationFrame(rafHandle);
      rafHandle = requestAnimationFrame(() => {
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const sw = measure.offsetWidth;
        const sh = measure.offsetHeight;

        if (sw > 0 && sh > 0 && cw > 0 && ch > 0) {
          setState({ scale: Math.min(cw / sw, ch / sh, 5), measuredWidth: sw, measuredHeight: sh });
        } else {
          setState({ scale: 1, measuredWidth: 0, measuredHeight: 0 });
        }
      });
    };

    remeasure();

    // Re-measure when container is resized (e.g. user resizes module in editor)
    const observer = new ResizeObserver(remeasure);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(rafHandle);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is a spread array from the caller; the linter can't statically verify its contents
  }, [enabled, ...deps]);

  return state;
}

// ---------------------------------------------------------------------------
// CSS keyframes (injected via <style> when needed)
// ---------------------------------------------------------------------------

const GRADIENT_TEXT_CSS = `
[data-text-gradient] {
  -webkit-background-clip: text !important;
  background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  color: transparent !important;
}`;

const GRADIENT_SWEEP_CSS = `
@keyframes _textGradientSweep {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}`;

const GLOW_CSS = `
@keyframes _textGlow {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.3); }
}`;

const NEON_CSS = `
@keyframes _textNeonFlicker {
  0%, 100% { opacity: 1; }
  41% { opacity: 1; }
  42% { opacity: 0.85; }
  43% { opacity: 1; }
}`;

const MARQUEE_CSS = `
@keyframes _marqueeLeft  { from { transform: translateX(100%);  } to { transform: translateX(-100%);  } }
@keyframes _marqueeRight { from { transform: translateX(-100%); } to { transform: translateX(100%);  } }
@keyframes _marqueeUp    { from { transform: translateY(100%);  } to { transform: translateY(-100%);  } }
@keyframes _marqueeDown  { from { transform: translateY(-100%); } to { transform: translateY(100%);  } }
`;

const FADE_IN_CSS = `
@keyframes _textFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}`;

const WAVE_CSS = `
@keyframes _textWave {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-0.4em); }
}`;

const BOUNCE_CSS = `
@keyframes _textBounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-0.5em); }
}`;

const SHAKE_CSS = `
@keyframes _textShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-2px) rotate(-1deg); }
  40% { transform: translateX(2px) rotate(1deg); }
  60% { transform: translateX(-2px) rotate(-0.5deg); }
  80% { transform: translateX(2px) rotate(0.5deg); }
}`;

const REVEAL_CSS = `
@keyframes _textRevealFade   { from { opacity: 0; } to { opacity: 1; } }
@keyframes _textRevealUp     { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes _textRevealDown   { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes _textRevealZoom   { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
`;

// Per-instance color-cycle keyframes (palette is dynamic, so we build the rule)
function buildColorCycleCss(name: string, palette: string[]): string {
  if (palette.length === 0) return '';
  const stops = palette
    .map((c, i) => {
      const pct = (i / palette.length) * 100;
      return `${pct.toFixed(2)}% { color: ${c}; }`;
    })
    .concat([`100% { color: ${palette[0]}; }`])
    .join(' ');
  return `@keyframes ${name} { ${stops} }`;
}

const PER_CHAR_EFFECTS = new Set<string>(['wave', 'bounce', 'shake']);
/** Above this many code points, per-char effects fall back to whole-string animation
 *  to avoid spawning hundreds of GPU-animated spans on a Pi. */
const PER_CHAR_MAX_LENGTH = 200;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TextModule({ config, style, timezone }: TextModuleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const cycleId = useId().replace(/[^a-zA-Z0-9]/g, '');

  const orientation = config.orientation ?? 'horizontal';
  const isVerticalLayout = orientation === 'vertical' || orientation === 'sideways';
  const writingModeStyles: React.CSSProperties =
    orientation === 'vertical'
      ? { writingMode: 'vertical-rl', textOrientation: 'upright' as const }
      : orientation === 'sideways'
        ? { writingMode: 'vertical-rl' as const }
        : {};
  const effect = config.effect ?? 'none';
  const textTransform = config.textTransform ?? 'none';
  const letterSpacing = config.letterSpacing ?? 0;
  const verticalAlign = config.verticalAlign ?? 'center';
  const autoFit = config.autoFit ?? false;
  const animSeconds = config.animationSpeed ?? 2;
  const reveal = config.revealOnRotation ?? 'none';
  const wrapMode = config.wrapMode ?? 'normal';
  const isPerChar = PER_CHAR_EFFECTS.has(effect);

  // --- 1. Split content for rotation ---
  const separator = config.rotationSeparator || '---';
  const contentItems = useMemo(() => {
    if (!config.rotationEnabled) return [config.content];
    return splitRotationContent(config.content, separator);
  }, [config.content, config.rotationEnabled, separator]);

  const rotationIndex = useRotatingIndex(contentItems.length, config.rotationIntervalMs ?? 5000);
  const rawContent = contentItems[rotationIndex] ?? contentItems[0] ?? '';

  // --- 2. Resolve template variables (useMemo for sync, tick for periodic refresh) ---
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!config.templateVariables) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [config.templateVariables]);

  const templateResolved = useMemo(
    () => (config.templateVariables ? resolveTemplateVariables(rawContent, timezone) : rawContent),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick drives periodic re-evaluation of time-based template variables
    [rawContent, config.templateVariables, timezone, tick],
  );

  // --- 2b. Substitute shared-state tokens ({plugin:ha:sensor.temp}) ---
  // Push-based and cheap: useSharedStateKeys only re-renders when a
  // referenced key's entry changes, and zero tokens means no subscription.
  const stateKeys = useMemo(() => extractSharedStateKeys(templateResolved), [templateResolved]);
  const sharedStates = useSharedStateKeys(stateKeys);
  const resolvedContent = useMemo(
    () => (stateKeys.length > 0 ? resolveSharedStateTokens(templateResolved, sharedStates) : templateResolved),
    [templateResolved, stateKeys, sharedStates],
  );

  // --- 3. Typewriter ---
  const typewriterOn = effect === 'typewriter';
  const { displayed: typewriterText, done: typewriterDone } = useTypewriter(resolvedContent, typewriterOn);
  const displayText = typewriterOn ? typewriterText : resolvedContent;

  // --- 4. Markdown ---
  const toHtml = (text: string) => (config.markdown ? parseMarkdown(text) : null);

  // --- 5. Auto-fit (measures full text, not typewriter partial) ---
  const fontStack = resolveFontStack(config.fontFamily) ?? resolveFontStack(style.fontFamily) ?? style.fontFamily;
  const { scale: autoFitScale, measuredWidth, measuredHeight } = useAutoFit(containerRef, measureRef, autoFit, [
    resolvedContent,
    config.icon,
    letterSpacing,
    textTransform,
    isVerticalLayout,
    config.markdown,
    style.fontSize,
    fontStack,
    config.fontWeight,
    config.italic,
    config.lineHeight,
    config.wordSpacing,
  ]);

  // --- Build text inline styles ---
  const textStyle: React.CSSProperties = {
    textAlign: isVerticalLayout ? undefined : config.alignment,
    textTransform: textTransform !== 'none' ? textTransform : undefined,
    letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
    wordSpacing: config.wordSpacing ? `${config.wordSpacing}px` : undefined,
    fontFamily: config.fontFamily ? fontStack : undefined,
    fontWeight: config.fontWeight,
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
  const gradientOn = config.gradientEnabled && config.gradientFrom && config.gradientTo;
  if (gradientOn) {
    const angle = config.gradientAngle ?? 90;
    textStyle.backgroundImage = `linear-gradient(${angle}deg, ${config.gradientFrom}, ${config.gradientTo})`;
    if (effect === 'gradient-sweep') {
      textStyle.backgroundSize = '200% 200%';
      textStyle.animation = `_textGradientSweep ${animSeconds * 1.5}s ease infinite`;
    }
  }

  // Visual effects
  if (effect === 'glow') {
    const c = config.accentColor || style.textColor;
    textStyle.textShadow = `0 0 10px ${c}, 0 0 20px ${c}, 0 0 40px ${c}80`;
    textStyle.animation = `_textGlow ${animSeconds}s ease-in-out infinite alternate`;
  }
  if (effect === 'neon') {
    const c = config.accentColor || '#22d3ee';
    textStyle.color = '#fff';
    textStyle.textShadow = [
      `0 0 4px ${c}`,
      `0 0 10px ${c}`,
      `0 0 20px ${c}`,
      `0 0 40px ${c}`,
    ].join(', ');
    textStyle.animation = `_textNeonFlicker ${animSeconds * 1.5}s linear infinite`;
  }
  if (effect === 'shadow') {
    const x = config.shadowOffsetX ?? 2;
    const y = config.shadowOffsetY ?? 2;
    const blur = config.shadowBlur ?? 4;
    const c = config.shadowColor ?? 'rgba(0,0,0,0.5)';
    textStyle.textShadow = `${x}px ${y}px ${blur}px ${c}`;
  }
  if (effect === '3d') {
    const c = config.accentColor || 'rgba(0,0,0,0.5)';
    textStyle.textShadow = [1, 2, 3, 4, 5, 6].map((n) => `${n}px ${n}px 0 ${c}`).join(', ');
  }
  if (effect === 'outline') {
    const w = config.outlineWidth ?? 2;
    const c = config.outlineColor ?? '#000';
    (textStyle as Record<string, unknown>).WebkitTextStrokeWidth = `${w}px`;
    (textStyle as Record<string, unknown>).WebkitTextStrokeColor = c;
  }

  // Color cycle — dynamic keyframes per instance
  const colorCycleName = `_textColorCycle_${cycleId}`;
  const colorCyclePalette = config.colorCyclePalette && config.colorCyclePalette.length > 0
    ? config.colorCyclePalette
    : ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];
  if (effect === 'color-cycle') {
    textStyle.animation = `${colorCycleName} ${animSeconds * 2}s linear infinite`;
  }

  // --- Per-char animation: wrap each char in its own span with staggered delay ---
  const renderPerCharText = (text: string, animName: string) => {
    const stagger = 0.05;
    return Array.from(text).map((ch, i) => (
      <span
        key={i}
        style={{
          display: 'inline-block',
          whiteSpace: 'pre',
          animation: `${animName} ${animSeconds}s ease-in-out infinite`,
          animationDelay: `${i * stagger}s`,
        }}
      >
        {ch}
      </span>
    ));
  };

  // --- Render helpers ---
  const renderText = (text: string) => {
    const html = toHtml(text);
    const gradientAttr = gradientOn ? { 'data-text-gradient': '' } : {};

    // Per-char animations cannot use markdown; html mode short-circuits to whole-string animation.
    // Long text also falls back to whole-string animation to avoid GPU thrash from 100s of spans.
    if (isPerChar && !html && text.length <= PER_CHAR_MAX_LENGTH) {
      const animName =
        effect === 'wave' ? '_textWave' : effect === 'bounce' ? '_textBounce' : '_textShake';
      return (
        <span {...gradientAttr} style={textStyle}>
          {renderPerCharText(text, animName)}
        </span>
      );
    }

    if (html) {
      return <span {...gradientAttr} style={textStyle} dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return <span {...gradientAttr} style={textStyle}>{text}</span>;
  };

  const iconEl = config.icon ? (
    <span style={{ flexShrink: 0, marginRight: isVerticalLayout ? 0 : '0.4em', marginBottom: isVerticalLayout ? '0.4em' : 0 }}>
      {config.icon}
    </span>
  ) : null;

  const cursor =
    typewriterOn && !typewriterDone ? (
      <span className="animate-pulse" style={{ color: config.accentColor ?? style.textColor }}>
        |
      </span>
    ) : null;

  const dividerColor = config.accentColor ?? style.textColor;
  const divider = config.showDividers ? (
    <div
      style={{
        width: 48,
        height: 2,
        borderRadius: 1,
        backgroundColor: dividerColor,
        opacity: 0.4,
        flexShrink: 0,
      }}
    />
  ) : null;

  // --- Which CSS keyframes are needed ---
  const needsCSS: string[] = [];
  if (gradientOn) needsCSS.push(GRADIENT_TEXT_CSS);
  if (effect === 'gradient-sweep' && gradientOn) needsCSS.push(GRADIENT_SWEEP_CSS);
  if (effect === 'glow') needsCSS.push(GLOW_CSS);
  if (effect === 'neon') needsCSS.push(NEON_CSS);
  if (effect === 'wave') needsCSS.push(WAVE_CSS);
  if (effect === 'bounce') needsCSS.push(BOUNCE_CSS);
  if (effect === 'shake') needsCSS.push(SHAKE_CSS);
  if (effect === 'color-cycle') needsCSS.push(buildColorCycleCss(colorCycleName, colorCyclePalette));
  if (config.marquee) needsCSS.push(MARQUEE_CSS);
  if (effect === 'fade-in') needsCSS.push(FADE_IN_CSS);
  if (config.rotationEnabled && reveal !== 'none') needsCSS.push(REVEAL_CSS);

  // --- Drop cap CSS (uses ::first-letter, scoped to a generated class) ---
  const dropCapClass = `_dc_${cycleId}`;
  if (config.dropCap) {
    const dcColor = config.dropCapColor ?? config.accentColor ?? 'inherit';
    needsCSS.push(`
.${dropCapClass}::first-letter {
  font-size: 2.5em;
  font-weight: 700;
  float: left;
  line-height: 0.9;
  margin-right: 0.08em;
  margin-top: 0.05em;
  color: ${dcColor};
}`);
  }

  // --- Alignment → CSS ---
  const justifyH =
    config.alignment === 'left' ? 'flex-start' : config.alignment === 'right' ? 'flex-end' : 'center';
  const alignV = verticalAlign === 'top' ? 'flex-start' : verticalAlign === 'bottom' ? 'flex-end' : 'center';

  // --- Reveal-on-rotation (only when rotation enabled) ---
  const revealAnim =
    config.rotationEnabled && reveal !== 'none'
      ? reveal === 'fade'
        ? '_textRevealFade 0.5s ease-out'
        : reveal === 'slide-up'
          ? '_textRevealUp 0.5s ease-out'
          : reveal === 'slide-down'
            ? '_textRevealDown 0.5s ease-out'
            : '_textRevealZoom 0.5s ease-out'
      : effect === 'fade-in'
        ? '_textFadeIn 0.5s ease-in-out'
        : undefined;

  // =====================================================================
  // MARQUEE LAYOUT (early return)
  // =====================================================================
  if (config.marquee) {
    const dir = config.marqueeDirection ?? 'left';
    const speed = config.marqueeSpeed ?? 30;
    const isH = dir === 'left' || dir === 'right';
    const animName = `_marquee${dir.charAt(0).toUpperCase() + dir.slice(1)}`;

    return (
      <ModuleWrapper style={style}>
        <style>{needsCSS.join('\n')}</style>
        <div className="h-full w-full overflow-hidden flex items-center">
          <div
            key={rotationIndex}
            style={{
              display: 'flex',
              flexDirection: isH ? 'row' : 'column',
              alignItems: 'center',
              gap: '0.4em',
              whiteSpace: isH ? 'nowrap' : undefined,
              animation: `${animName} ${speed}s linear infinite`,
            }}
          >
            {iconEl}
            {renderText(displayText)}
            {cursor}
          </div>
        </div>
      </ModuleWrapper>
    );
  }

  // =====================================================================
  // STANDARD LAYOUT
  // =====================================================================

  const contentBlock = (text: string, includeAutoFitTransform: boolean) => {
    const inner = (
      <div
        className={config.dropCap ? dropCapClass : undefined}
        style={{
          display: 'inline-flex',
          flexDirection: isVerticalLayout ? 'column' : 'row',
          alignItems: 'center',
          gap: '0.4em',
          whiteSpace: autoFit ? 'nowrap' : undefined,
          maxWidth: config.maxWidth && config.maxWidth > 0 ? `${config.maxWidth}px` : undefined,
        }}
      >
        {iconEl}
        {renderText(text)}
        {includeAutoFitTransform && cursor}
      </div>
    );

    // Wrap in a layout-aware div so flex alignment sees the scaled dimensions
    if (includeAutoFitTransform && autoFit && measuredWidth > 0 && measuredHeight > 0) {
      return (
        <div style={{ width: measuredWidth * autoFitScale, height: measuredHeight * autoFitScale, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, transform: `scale(${autoFitScale})`, transformOrigin: 'top left' }}>
            {inner}
          </div>
        </div>
      );
    }

    return inner;
  };

  const animatedContent = (
    <div
      key={`rot-${rotationIndex}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: justifyH === 'flex-start' ? 'flex-start' : justifyH === 'flex-end' ? 'flex-end' : 'center',
        gap: config.showDividers ? 8 : 0,
        animation: revealAnim,
      }}
    >
      {divider}
      {contentBlock(displayText, true)}
      {divider}
    </div>
  );

  return (
    <ModuleWrapper style={style}>
      {needsCSS.length > 0 && <style>{needsCSS.join('\n')}</style>}

      {/* Hidden measurement div for auto-fit (uses full resolved text, not typewriter partial) */}
      {autoFit && (
        <div
          ref={measureRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            visibility: 'hidden',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            width: 'max-content',
          }}
        >
          {contentBlock(resolvedContent, false)}
        </div>
      )}

      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: alignV,
          alignItems: justifyH,
        }}
      >
        {animatedContent}
      </div>
    </ModuleWrapper>
  );
}
