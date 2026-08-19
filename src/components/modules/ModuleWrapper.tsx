'use client';

import { DEFAULT_MODULE_STYLE, type ModuleStyle } from '@/types/config';
import type { CSSProperties, ReactNode } from 'react';
import { buildModuleShadow, colorWithAlpha, resolveTitleFontSize } from '@/lib/module-style';
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
  const titleFontSize = resolveTitleFontSize(style);

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

  // Untitled modules keep the exact original structure (no flex column, no
  // content box) so every existing screen stays pixel-identical — and the
  // forced-weight class sits on the wrapper itself as it always has. When a
  // title is present, the class moves to the content box instead: the strip
  // is then a sibling outside the override subtree, so titles (and anything
  // ever rendered inside them) keep their normal weight without per-element
  // carve-outs. The --module-font-weight var inherits down from the wrapper.
  const weightClass = hasWeight ? ' module-weight-override' : '';
  const inset = DEFAULT_MODULE_STYLE.padding;
  return (
    <div
      className={`w-full h-full overflow-hidden${title ? ' flex flex-col' : weightClass}`}
      style={wrapperStyle}
    >
      {title && (
        <div
          data-module-title
          className="w-full min-w-0 text-center truncate"
          style={{
            // Padded cards give the strip its top/side gap, so it only adds
            // the 8px below. Media modules (image, video, slideshow, iframe)
            // force the card padding to 0 so content runs edge to edge — the
            // strip must not, so it carries the default card inset itself.
            padding: style.padding > 0 ? '0 0 8px' : `${inset}px ${inset}px 8px`,
            fontSize: `${titleFontSize}px`,
          }}
        >
          {title}
        </div>
      )}
      {title ? <div className={`flex-1 min-h-0${weightClass}`}>{children}</div> : children}
    </div>
  );
}
