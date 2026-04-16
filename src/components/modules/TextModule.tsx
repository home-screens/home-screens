'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { TextConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import { useTypewriter } from '@/hooks/useTypewriter';
import { resolveTemplateVariables, parseMarkdown, splitRotationContent } from '@/lib/text-utils';

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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TextModule({ config, style, timezone }: TextModuleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

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

  const resolvedContent = useMemo(
    () => (config.templateVariables ? resolveTemplateVariables(rawContent, timezone) : rawContent),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick drives periodic re-evaluation of time-based template variables
    [rawContent, config.templateVariables, timezone, tick],
  );

  // --- 3. Typewriter ---
  const typewriterOn = effect === 'typewriter';
  const { displayed: typewriterText, done: typewriterDone } = useTypewriter(resolvedContent, typewriterOn);
  const displayText = typewriterOn ? typewriterText : resolvedContent;

  // --- 4. Markdown ---
  const toHtml = (text: string) => (config.markdown ? parseMarkdown(text) : null);

  // --- 5. Auto-fit (measures full text, not typewriter partial) ---
  const { scale: autoFitScale, measuredWidth, measuredHeight } = useAutoFit(containerRef, measureRef, autoFit, [
    resolvedContent,
    config.icon,
    letterSpacing,
    textTransform,
    isVerticalLayout,
    config.markdown,
    style.fontSize,
    style.fontFamily,
  ]);

  // --- Build text inline styles ---
  const textStyle: React.CSSProperties = {
    textAlign: isVerticalLayout ? undefined : config.alignment,
    textTransform: textTransform !== 'none' ? textTransform : undefined,
    letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
    ...writingModeStyles,
  };

  // Gradient text (clip properties applied via <style> rule to avoid React reconciliation issues)
  const gradientOn = config.gradientEnabled && config.gradientFrom && config.gradientTo;
  if (gradientOn) {
    const angle = config.gradientAngle ?? 90;
    textStyle.backgroundImage = `linear-gradient(${angle}deg, ${config.gradientFrom}, ${config.gradientTo})`;
    if (effect === 'gradient-sweep') {
      textStyle.backgroundSize = '200% 200%';
      textStyle.animation = '_textGradientSweep 3s ease infinite';
    }
  }

  // Glow effect
  if (effect === 'glow') {
    const c = config.accentColor || style.textColor;
    textStyle.textShadow = `0 0 10px ${c}, 0 0 20px ${c}, 0 0 40px ${c}80`;
    textStyle.animation = '_textGlow 2s ease-in-out infinite alternate';
  }

  // --- Render helpers ---
  const renderText = (text: string) => {
    const html = toHtml(text);
    const gradientAttr = gradientOn ? { 'data-text-gradient': '' } : {};
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
  if (config.marquee) needsCSS.push(MARQUEE_CSS);
  if (effect === 'fade-in') needsCSS.push(FADE_IN_CSS);

  // --- Alignment → CSS ---
  const justifyH =
    config.alignment === 'left' ? 'flex-start' : config.alignment === 'right' ? 'flex-end' : 'center';
  const alignV = verticalAlign === 'top' ? 'flex-start' : verticalAlign === 'bottom' ? 'flex-end' : 'center';

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
        style={{
          display: 'inline-flex',
          flexDirection: isVerticalLayout ? 'column' : 'row',
          alignItems: 'center',
          gap: '0.4em',
          whiteSpace: autoFit ? 'nowrap' : undefined,
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
        animation: effect === 'fade-in' ? '_textFadeIn 0.5s ease-in-out' : undefined,
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
