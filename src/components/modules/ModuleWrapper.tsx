'use client';

import type { ModuleStyle } from '@/types/config';
import type { ReactNode } from 'react';
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

  // IMPORTANT: When backdrop blur is active, bake opacity into the background
  // color's alpha channel. An opaque background completely covers the blurred
  // backdrop, making the blur invisible. Using rgba lets the blur show through.
  // Without this, backdrop-filter has no visible effect in Chrome.
  const bg = hasBlur
    ? colorWithAlpha(style.backgroundColor, style.opacity)
    : style.backgroundColor;

  return (
    <div
      className="w-full h-full overflow-hidden"
      style={{
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
      }}
    >
      {children}
    </div>
  );
}
