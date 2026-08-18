'use client';

import type { ModuleStyle } from '@/types/config';
import type { CSSProperties, ReactNode } from 'react';
import { buildModuleShadow, colorWithAlpha } from '@/lib/module-style';
import { resolveFontStack } from '@/lib/font-registry';

interface ModuleWrapperProps {
  style: ModuleStyle;
  children: ReactNode;
}

export default function ModuleWrapper({ style, children }: ModuleWrapperProps) {
  const bw = style.borderWidth ?? 0;
  const bc = style.borderColor ?? 'rgba(255, 255, 255, 0.15)';
  const hasBlur = style.backdropBlur > 0;
  // Weight is forced onto descendants via the .module-weight-override rule in
  // globals.css — plain inheritance never reaches text with its own weight.
  // Range-guarded so a hand-edited config can't emit invalid CSS (font-weight
  // 0 would be silently dropped, leaving the class active but inert).
  const fw = style.fontWeight;
  const hasWeight = typeof fw === 'number' && Number.isFinite(fw) && fw >= 100 && fw <= 900;
  // Whitespace-only titles render nothing — a strip of spaces must not
  // reserve height.
  const title = style.title?.trim() || '';
  // Range-guarded like fontWeight above: a hand-edited config with 0 or a
  // negative titleFontSize would render an invisible strip that still
  // reserves its padding, so invalid values fall back to the module size.
  const tfs = style.titleFontSize;
  const titleFontSize = typeof tfs === 'number' && Number.isFinite(tfs) && tfs > 0 ? tfs : style.fontSize;

  // IMPORTANT: When backdrop blur is active, bake opacity into the background
  // color's alpha channel. An opaque background completely covers the blurred
  // backdrop, making the blur invisible. Using rgba lets the blur show through.
  // Without this, backdrop-filter has no visible effect in Chrome.
  const bg = hasBlur
    ? colorWithAlpha(style.backgroundColor, style.opacity)
    : style.backgroundColor;

  const wrapperStyle: CSSProperties & Record<`--${string}`, string | number> = {
    opacity: hasBlur ? undefined : style.opacity,
    borderRadius: `${style.borderRadius}px`,
    padding: `${style.padding}px`,
    backgroundColor: bg,
    color: style.textColor,
    fontFamily: resolveFontStack(style.fontFamily) ?? style.fontFamily,
    fontSize: `${style.fontSize}px`,
    backdropFilter: hasBlur ? `blur(${style.backdropBlur}px)` : undefined,
    WebkitBackdropFilter: hasBlur ? `blur(${style.backdropBlur}px)` : undefined,
    border: bw > 0 ? `${bw}px solid ${bc}` : 'none',
    boxShadow: buildModuleShadow(style.shadowSize ?? 0),
  };
  if (hasWeight) wrapperStyle['--module-font-weight'] = fw;

  // Title-less modules render the exact original structure (no flex column,
  // no extra divs) so every existing screen stays pixel-identical.
  if (!title) {
    return (
      <div
        className={`w-full h-full overflow-hidden${hasWeight ? ' module-weight-override' : ''}`}
        style={wrapperStyle}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={`w-full h-full overflow-hidden flex flex-col${hasWeight ? ' module-weight-override' : ''}`}
      style={wrapperStyle}
    >
      {/* Title strip: centered single line, truncated with an ellipsis so the
          reserved height never varies with text length. No top padding — the
          card's own padding provides the gap; 8px below separates title from
          content. Explicit 400 beats the forced-weight class's inheritance
          (the rule itself spares [data-module-title], like it spares strong). */}
      <div
        data-module-title
        className="w-full min-w-0 text-center truncate"
        style={{
          paddingBottom: 8,
          fontSize: `${titleFontSize}px`,
          fontWeight: 400,
        }}
      >
        {title}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
