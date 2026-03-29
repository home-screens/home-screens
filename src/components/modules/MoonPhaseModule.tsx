'use client';

import SunCalc from 'suncalc';
import { formatTimeInTZ } from '@/lib/timezone';
import { useTZClock } from '@/hooks/useTZClock';
import type { MoonPhaseConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { LocationRequired } from './LocationRequired';
import { TEXT_OPACITY } from '@/lib/constants';

interface MoonPhaseModuleProps {
  config: MoonPhaseConfig;
  style: ModuleStyle;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

function getPhaseName(phase: number): string {
  if (phase < 0.0625) return 'New Moon';
  if (phase < 0.1875) return 'Waxing Crescent';
  if (phase < 0.3125) return 'First Quarter';
  if (phase < 0.4375) return 'Waxing Gibbous';
  if (phase < 0.5625) return 'Full Moon';
  if (phase < 0.6875) return 'Waning Gibbous';
  if (phase < 0.8125) return 'Last Quarter';
  if (phase < 0.9375) return 'Waning Crescent';
  return 'New Moon';
}



function MoonVisual({ phase }: { phase: number }) {
  // phase: 0 = new moon, 0.5 = full moon, 1 = new moon again
  // We render a circle with an SVG overlay to simulate the shadow.
  const size = 64;
  const r = size / 2;

  // Determine the illuminated side and sweep of the terminator.
  // phase 0..0.5: right side lit (waxing), 0.5..1: left side lit (waning)
  const isWaxing = phase < 0.5;

  // Map phase to how much is illuminated (0=none, 0.5=full, 1=none)
  const illumination = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;

  // The terminator is an ellipse whose x-radius varies.
  // When illumination=0, the shadow covers everything.
  // When illumination=1, no shadow.
  // The terminator x-radius: cos of illumination mapped to angle
  const terminatorX = Math.abs(illumination * 2 - 1) * r;

  // Build the shadow path: a half-circle + elliptical arc for the terminator
  // Shadow covers one half and extends/retracts via the terminator curve.
  let shadowPath: string;

  if (isWaxing) {
    // Shadow is on the left side, shrinking as phase grows
    if (illumination <= 0.5) {
      // Shadow covers more than half: left half-circle + right bulge
      shadowPath = `M ${r} 0 A ${r} ${r} 0 0 0 ${r} ${size} A ${terminatorX} ${r} 0 0 0 ${r} 0`;
    } else {
      // Shadow covers less than half: left half-circle + left indent
      shadowPath = `M ${r} 0 A ${r} ${r} 0 0 0 ${r} ${size} A ${terminatorX} ${r} 0 0 1 ${r} 0`;
    }
  } else {
    // Shadow is on the right side, growing as phase goes from 0.5 to 1
    if (illumination <= 0.5) {
      // Shadow covers more than half: right half-circle + left bulge
      shadowPath = `M ${r} 0 A ${r} ${r} 0 0 1 ${r} ${size} A ${terminatorX} ${r} 0 0 1 ${r} 0`;
    } else {
      // Shadow covers less than half: right half-circle + right indent
      shadowPath = `M ${r} 0 A ${r} ${r} 0 0 1 ${r} ${size} A ${terminatorX} ${r} 0 0 0 ${r} 0`;
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={r} cy={r} r={r} fill="#e5e7eb" />
      <path d={shadowPath} fill="rgba(0,0,0,0.85)" />
    </svg>
  );
}

export default function MoonPhaseModule({ config, style, latitude, longitude, timezone }: MoonPhaseModuleProps) {
  const now = useTZClock(timezone);

  if (latitude == null || longitude == null) {
    return <LocationRequired style={style} />;
  }

  const illumination = SunCalc.getMoonIllumination(now);
  const phaseName = getPhaseName(illumination.phase);
  const illuminationPct = Math.round(illumination.fraction * 100);

  const moonTimes = config.showMoonTimes
    ? SunCalc.getMoonTimes(now, latitude, longitude)
    : null;

  return (
    <ModuleWrapper style={style}>
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <MoonVisual phase={illumination.phase} />
        <p className="text-center font-medium" style={{ fontSize: '1.1em' }}>
          {phaseName}
        </p>
        {config.showIllumination && (
          <p className="text-center" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.secondary }}>
            {illuminationPct}% illuminated
          </p>
        )}
        {config.showMoonTimes && moonTimes && (
          <div className="text-center" style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.secondary }}>
            {moonTimes.rise && <p>Rise: {formatTimeInTZ(moonTimes.rise, timezone)}</p>}
            {moonTimes.set && <p>Set: {formatTimeInTZ(moonTimes.set, timezone)}</p>}
          </div>
        )}
      </div>
    </ModuleWrapper>
  );
}
