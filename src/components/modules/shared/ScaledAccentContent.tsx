'use client';

import type { ReactNode } from 'react';
import type { ModuleStyle } from '@/types/config';
import ModuleWrapper from '../ModuleWrapper';
import { resolveAccent } from '@/lib/constants';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';

interface Accent {
  accentColor: string;
  hasAccent: boolean;
}

interface ScaledAccentContentProps {
  style: ModuleStyle;
  /** Config carrying an optional accentColor, passed straight to resolveAccent. */
  config: { accentColor?: string };
  /** Minimum font-scale factor for useScaledFontSize (layout differs per module). */
  minScale: number;
  /** Inner container classes for the scaled flex box. */
  className: string;
  /** Renders the module body with the resolved accent values. */
  children: (accent: Accent) => ReactNode;
}

/**
 * Shared scaffold for the accent-text modules (quote, dad joke, history,
 * word of day): a ModuleWrapper wrapping a font-scaled container that carries
 * the accent gradient. The body is a render prop so each module can consume
 * the resolved `accentColor` / `hasAccent` without recomputing them.
 */
export function ScaledAccentContent({ style, config, minScale, className, children }: ScaledAccentContentProps) {
  const { containerRef, scaledFontSize } = useScaledFontSize(style, minScale);
  const { accentColor, hasAccent, gradientStyle } = resolveAccent(config);

  return (
    <ModuleWrapper style={style}>
      <div
        ref={containerRef}
        className={className}
        style={{ fontSize: `${scaledFontSize}px`, ...gradientStyle }}
      >
        {children({ accentColor, hasAccent })}
      </div>
    </ModuleWrapper>
  );
}
