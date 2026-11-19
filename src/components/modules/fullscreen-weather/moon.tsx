'use client';

import { useId } from 'react';
import { moonLitFraction, moonShadowPath } from '@/lib/weather/moon-shape';

/**
 * The moon as a photograph at its real phase: the Galileo spacecraft's full
 * moon (NASA/JPL/USGS image PIA00405, public domain, shipped greyscale as
 * public/sky/moon.png) with the unlit part covered by a soft-edged shadow,
 * a little limb darkening, and the faintest earthshine on the dark side.
 * The phase geometry follows the Celestial plugin's moon.
 *
 * `phase` is 0 at new moon, .5 at full, waxing below .5 (SunCalc's
 * convention). The terminator is an ellipse whose width follows the
 * illuminated fraction, drawn as one SVG path over the picture.
 */
export function MoonImage({ phase, size, glow = false, style }: {
  phase: number; size: number | string; glow?: boolean; style?: React.CSSProperties;
}) {
  const uid = useId();
  const S = 120;
  // The shape comes from the shared rule every moon drawing uses.
  const lit = moonLitFraction(phase);
  const shadow = moonShadowPath(phase, S);
  const blurId = `${uid}-blur`;
  return (
    <div style={{
      // Width plus an aspect ratio, not a height: a max-height from the
      // caller then transfers through the ratio and the disc stays round.
      position: 'relative', width: size, aspectRatio: '1 / 1', flex: 'none', borderRadius: '50%',
      backgroundImage: 'url(/sky/moon.png)', backgroundSize: 'cover',
      // A faint cool halo, for the sky only; the card sits on its own surface.
      boxShadow: glow ? '0 0 36px 6px rgba(190,205,255,.14), inset 0 0 18px 2px rgba(0,0,0,.22)' : 'inset 0 0 14px 2px rgba(0,0,0,.22)',
      ...style,
    }}>
      <svg viewBox={`0 0 ${S} ${S}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden' }}>
        <defs>
          <filter id={blurId} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.4" /></filter>
        </defs>
        {lit < 0.995 && <path d={shadow} fill="rgba(5,7,22,.94)" filter={`url(#${blurId})`} />}
        {lit > 0.02 && lit < 0.98 && <path d={shadow} fill="rgba(130,155,190,.08)" filter={`url(#${blurId})`} />}
      </svg>
    </div>
  );
}
