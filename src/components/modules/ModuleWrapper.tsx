'use client';

import type { ModuleStyle } from '@/types/config';
import type { ReactNode } from 'react';
import { buildModuleShadow } from '@/lib/module-style';

interface ModuleWrapperProps {
  style: ModuleStyle;
  children: ReactNode;
}

export default function ModuleWrapper({ style, children }: ModuleWrapperProps) {
  const bw = style.borderWidth ?? 0;
  const bc = style.borderColor ?? 'rgba(255, 255, 255, 0.15)';

  return (
    <div
      className="w-full h-full overflow-hidden"
      style={{
        opacity: style.opacity,
        borderRadius: `${style.borderRadius}px`,
        padding: `${style.padding}px`,
        backgroundColor: style.backgroundColor,
        color: style.textColor,
        fontFamily: style.fontFamily,
        fontSize: `${style.fontSize}px`,
        backdropFilter: `blur(${style.backdropBlur}px)`,
        WebkitBackdropFilter: `blur(${style.backdropBlur}px)`,
        border: bw > 0 ? `${bw}px solid ${bc}` : 'none',
        boxShadow: buildModuleShadow(style.shadowSize ?? 0),
      }}
    >
      {children}
    </div>
  );
}
