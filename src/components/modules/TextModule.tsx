'use client';

import { useState, useEffect, useRef, useMemo, useId } from 'react';
import type { TextConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import { useTypewriter } from '@/hooks/useTypewriter';
import { resolveTemplateVariables, parseMarkdown, splitRotationContent } from '@/lib/text-utils';
import { extractSharedStateKeys, resolveSharedStateTokens } from '@/lib/shared-state-template';
import { useSharedStateKeys } from '@/hooks/useSharedStateKeys';
import { useFormattingLocale } from '@/i18n';
import { resolveFontStack } from '@/lib/font-registry';
import { useAutoFit } from './text/useAutoFit';
import MarqueeLayout from './text/MarqueeLayout';
import { buildTextStyle } from './text/build-text-style';
import { collectKeyframes, PER_CHAR_EFFECTS, PER_CHAR_MAX_LENGTH } from './text/keyframes';
import Glyph from '@/components/ui/Glyph';

interface TextModuleProps {
  config: TextConfig;
  style: ModuleStyle;
  timezone?: string;
}

const DEFAULT_COLOR_CYCLE_PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];

/** Reveal-on-rotation wins when rotation is on; otherwise a one-shot fade-in
 *  covers the `fade-in` effect. Returns the CSS `animation` shorthand or undefined. */
function resolveRevealAnimation(rotationEnabled: boolean | undefined, reveal: string, effect: string): string | undefined {
  if (rotationEnabled && reveal !== 'none') {
    switch (reveal) {
      case 'fade':
        return '_textRevealFade 0.5s ease-out';
      case 'slide-up':
        return '_textRevealUp 0.5s ease-out';
      case 'slide-down':
        return '_textRevealDown 0.5s ease-out';
      default:
        return '_textRevealZoom 0.5s ease-out';
    }
  }
  if (effect === 'fade-in') return '_textFadeIn 0.5s ease-in-out';
  return undefined;
}

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

  // A per-character effect wraps every glyph in its own span, so a template
  // variable that resolves to a DIFFERENT LENGTH on the client than it did on
  // the server ("Good morning" -> "Good afternoon" across the boundary)
  // changes the child COUNT — which suppressHydrationWarning cannot cover, as
  // it only forgives text and attributes on the element carrying it. Those
  // strings render as one plain span until mount, then upgrade to the
  // animated per-character form. Text with no template variable is unaffected
  // and animates from the first paint as before.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
  const formattingLocale = useFormattingLocale();
  const resolvedContent = useMemo(
    () =>
      stateKeys.length > 0
        ? resolveSharedStateTokens(templateResolved, sharedStates, { locale: formattingLocale })
        : templateResolved,
    [templateResolved, stateKeys, sharedStates, formattingLocale],
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
    style.fontWeight,
    config.italic,
    config.lineHeight,
    config.wordSpacing,
  ]);

  // --- Derived style inputs shared across the text style, keyframes, and render ---
  const gradientOn = Boolean(config.gradientEnabled && config.gradientFrom && config.gradientTo);
  const colorCycleName = `_textColorCycle_${cycleId}`;
  const colorCyclePalette =
    config.colorCyclePalette && config.colorCyclePalette.length > 0
      ? config.colorCyclePalette
      : DEFAULT_COLOR_CYCLE_PALETTE;

  // --- Build text inline styles ---
  const textStyle = buildTextStyle({
    config,
    style,
    isVerticalLayout,
    textTransform,
    letterSpacing,
    writingModeStyles,
    fontStack,
    effect,
    animSeconds,
    wrapMode,
    gradientOn,
    colorCycleName,
  });

  // --- Per-char animation: wrap each char in its own span with staggered delay ---
  const renderPerCharText = (text: string, animName: string) => {
    const stagger = 0.05;
    return Array.from(text).map((ch, i) => (
      <span
        key={i}
        // Same reason as the whole-string spans below: a template variable
        // resolves against the wall clock, so the character the server wrote
        // may not be the one the client hydrates with.
        suppressHydrationWarning
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

  const hasTemplateToken = config.templateVariables === true && rawContent.includes('{{');
  const perCharReady = isPerChar && (mounted || !hasTemplateToken);

  // --- Render helpers ---
  // Template variables ({{time}}, {{greeting}}, {{date}}...) resolve against
  // the wall clock at render time, so the string the server rendered and the
  // one the client hydrates with disagree whenever a minute (or a greeting /
  // date boundary) falls between the two. That is a hydration mismatch React
  // reports as an uncaught error on the display. The client value is the
  // right one and React keeps it; suppressing the warning is the documented
  // escape hatch for clock-derived text, and matches the date, clock, and
  // countdown modules.
  const renderText = (text: string) => {
    const html = toHtml(text);
    const gradientAttr = gradientOn ? { 'data-text-gradient': '' } : {};

    // Per-char animations cannot use markdown; html mode short-circuits to whole-string animation.
    // Long text also falls back to whole-string animation to avoid GPU thrash from 100s of spans.
    if (perCharReady && !html && text.length <= PER_CHAR_MAX_LENGTH) {
      const animName =
        effect === 'wave' ? '_textWave' : effect === 'bounce' ? '_textBounce' : '_textShake';
      return (
        <span {...gradientAttr} style={textStyle} suppressHydrationWarning>
          {renderPerCharText(text, animName)}
        </span>
      );
    }

    if (html) {
      return <span {...gradientAttr} style={textStyle} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return <span {...gradientAttr} style={textStyle} suppressHydrationWarning>{text}</span>;
  };

  const iconEl = config.icon ? (
    <span style={{ flexShrink: 0, marginRight: isVerticalLayout ? 0 : '0.4em', marginBottom: isVerticalLayout ? '0.4em' : 0 }}>
      <Glyph value={config.icon} />
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

  // --- Which CSS keyframes are needed (drop-cap class is scoped per instance) ---
  const dropCapClass = `_dc_${cycleId}`;
  const needsCSS = collectKeyframes({
    config,
    effect,
    gradientOn,
    reveal,
    colorCycleName,
    colorCyclePalette,
    dropCapClass,
  });

  // --- Alignment → CSS ---
  const justifyH =
    config.alignment === 'left' ? 'flex-start' : config.alignment === 'right' ? 'flex-end' : 'center';
  const alignV = verticalAlign === 'top' ? 'flex-start' : verticalAlign === 'bottom' ? 'flex-end' : 'center';

  // --- Reveal-on-rotation (only when rotation enabled) ---
  const revealAnim = resolveRevealAnimation(config.rotationEnabled, reveal, effect);

  // =====================================================================
  // MARQUEE LAYOUT (early return)
  // =====================================================================
  if (config.marquee) {
    return (
      <MarqueeLayout
        style={style}
        css={needsCSS.join('\n')}
        rotationIndex={rotationIndex}
        direction={config.marqueeDirection ?? 'left'}
        speed={config.marqueeSpeed ?? 30}
      >
        {iconEl}
        {renderText(displayText)}
        {cursor}
      </MarqueeLayout>
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
