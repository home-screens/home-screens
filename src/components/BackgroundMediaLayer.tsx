'use client';

import type { BackgroundEffects, BackgroundShade } from '@/types/config';
import CrossfadeBackground from '@/components/display/CrossfadeBackground';
import BackgroundShadeOverlay from '@/components/BackgroundShadeOverlay';
import { buildBackgroundEffectsFilter } from '@/lib/background-effects';

/** Keeps the shade above media but below every widget, regardless of widget z-index. */
export default function BackgroundMediaLayer({ src, shade, effects, authenticate = false }: { src?: string; shade?: BackgroundShade; effects?: BackgroundEffects; authenticate?: boolean }) {
  const filter = buildBackgroundEffectsFilter(effects);
  return (
    <div data-testid="background-media-layer" style={{ position: 'absolute', inset: 0, zIndex: -1, isolation: 'isolate', pointerEvents: 'none' }}>
      <CrossfadeBackground src={src} authenticate={authenticate} filter={filter} />
      <BackgroundShadeOverlay shade={shade} />
    </div>
  );
}
