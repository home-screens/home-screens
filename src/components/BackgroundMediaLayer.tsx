'use client';

import type { BackgroundEffects, BackgroundShade } from '@/types/config';
import CrossfadeBackground from '@/components/display/CrossfadeBackground';
import BackgroundShadeOverlay from '@/components/BackgroundShadeOverlay';
import { buildBackgroundEffectsFilter } from '@/lib/background-effects';

/** Keeps the shade above media but below every widget, regardless of widget z-index. */
export default function BackgroundMediaLayer({ src, shade, effects, authenticate = false, drift = false, evening }: {
  src?: string; shade?: BackgroundShade; effects?: BackgroundEffects; authenticate?: boolean;
  /** Let the picture grow and slide very slowly for its first minute (a painting that fills the screen). */
  drift?: boolean;
  /** Evening light: `true` warms and dims the picture, `false` is day. Undefined when the screen has none, so nothing is drawn for it. */
  evening?: boolean;
}) {
  const filter = buildBackgroundEffectsFilter(effects);
  return (
    <div data-testid="background-media-layer" style={{ position: 'absolute', inset: 0, zIndex: -1, isolation: 'isolate', pointerEvents: 'none' }}>
      <CrossfadeBackground src={src} authenticate={authenticate} filter={filter} drift={drift} />
      {evening !== undefined && <EveningLightOverlay on={evening} />}
      <BackgroundShadeOverlay shade={shade} />
    </div>
  );
}

/**
 * Evening light over the picture: a warm wash and a dimming, so a painting
 * reads as paper under a lamp and not as a lit screen. Both ease in and out
 * over a minute and a half, slow enough that nobody sees the room change.
 */
function EveningLightOverlay({ on }: { on: boolean }) {
  const ease = 'opacity 90s ease-in-out';
  return (
    // Above both picture layers (z-index 0 to 2 while one fades over the other), so the light falls on whichever is showing.
    <div data-testid="evening-light" data-on={on} style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgb(255,150,60)', mixBlendMode: 'multiply', opacity: on ? 0.26 : 0, transition: ease }} />
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: on ? 0.28 : 0, transition: ease }} />
    </div>
  );
}
