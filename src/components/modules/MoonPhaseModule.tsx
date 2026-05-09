'use client';

import SunCalc from 'suncalc';
import { formatTimeInTZ } from '@/lib/timezone';
import { useTZClock } from '@/hooks/useTZClock';
import type { MoonPhaseConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { LocationRequired } from './LocationRequired';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import { MetadataText } from './shared/MetadataText';

interface MoonPhaseModuleProps {
  config: MoonPhaseConfig;
  style: ModuleStyle;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

function getPhaseName(phase: number, t: TranslateFn): string {
  if (phase < 0.0625) return t('moon-phase.phases.newMoon');
  if (phase < 0.1875) return t('moon-phase.phases.waxingCrescent');
  if (phase < 0.3125) return t('moon-phase.phases.firstQuarter');
  if (phase < 0.4375) return t('moon-phase.phases.waxingGibbous');
  if (phase < 0.5625) return t('moon-phase.phases.fullMoon');
  if (phase < 0.6875) return t('moon-phase.phases.waningGibbous');
  if (phase < 0.8125) return t('moon-phase.phases.lastQuarter');
  if (phase < 0.9375) return t('moon-phase.phases.waningCrescent');
  return t('moon-phase.phases.newMoon');
}

function MoonVisual({ phase }: { phase: number }) {
  const size = 140;
  const r = size / 2;
  const isWaxing = phase < 0.5;
  const illumination = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
  const terminatorX = Math.abs(illumination * 2 - 1) * r;

  let shadowPath: string;

  if (isWaxing) {
    if (illumination <= 0.5) {
      shadowPath = `M ${r} 0 A ${r} ${r} 0 0 0 ${r} ${size} A ${terminatorX} ${r} 0 0 0 ${r} 0`;
    } else {
      shadowPath = `M ${r} 0 A ${r} ${r} 0 0 0 ${r} ${size} A ${terminatorX} ${r} 0 0 1 ${r} 0`;
    }
  } else {
    if (illumination <= 0.5) {
      shadowPath = `M ${r} 0 A ${r} ${r} 0 0 1 ${r} ${size} A ${terminatorX} ${r} 0 0 1 ${r} 0`;
    } else {
      shadowPath = `M ${r} 0 A ${r} ${r} 0 0 1 ${r} ${size} A ${terminatorX} ${r} 0 0 0 ${r} 0`;
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{
        filter: 'drop-shadow(0 0 18px rgba(255,255,255,0.15)) drop-shadow(0 0 6px rgba(200,220,255,0.10))',
      }}
    >
      <defs>
        <radialGradient id="moonLit" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#f5f5f0" />
          <stop offset="60%" stopColor="#e5e7eb" />
          <stop offset="100%" stopColor="#c0c4cc" />
        </radialGradient>
      </defs>
      <circle cx={r} cy={r} r={r} fill="url(#moonLit)" />
      <path d={shadowPath} fill="rgba(0,0,0,0.85)" />
    </svg>
  );
}

export default function MoonPhaseModule({ config, style, latitude, longitude, timezone }: MoonPhaseModuleProps) {
  const now = useTZClock(timezone);
  const t = useTranslate('modules');

  if (latitude == null || longitude == null) {
    return <LocationRequired style={style} />;
  }

  const illumination = SunCalc.getMoonIllumination(now);
  const phaseName = getPhaseName(illumination.phase, t);
  const illuminationPct = Math.round(illumination.fraction * 100);

  const moonTimes = config.showMoonTimes
    ? SunCalc.getMoonTimes(now, latitude, longitude)
    : null;

  return (
    <ModuleWrapper style={style}>
      <div
        className="flex flex-col items-center justify-center h-full gap-3"
        style={{ background: 'radial-gradient(ellipse at center, rgba(100,150,255,0.04), transparent 70%)' }}
      >
        <MoonVisual phase={illumination.phase} />
        <p className="text-center font-medium" style={{ fontSize: '1.1em' }}>
          {phaseName}
        </p>
        {config.showIllumination && (
          <p className="text-center" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.secondary }}>
            {t('moon-phase.illuminated', { percent: illuminationPct })}
          </p>
        )}
        {config.showMoonTimes && moonTimes && (
          <div className="flex items-center gap-3">
            {moonTimes.rise && (
              <MetadataText size="sm">
                <span style={{ opacity: TEXT_OPACITY.tertiary }}>{t('moon-phase.rise')}</span>{' '}
                <span className="tabular-nums">{formatTimeInTZ(moonTimes.rise, timezone)}</span>
              </MetadataText>
            )}
            {moonTimes.rise && moonTimes.set && (
              <span className="w-px h-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
            )}
            {moonTimes.set && (
              <MetadataText size="sm">
                <span style={{ opacity: TEXT_OPACITY.tertiary }}>{t('moon-phase.set')}</span>{' '}
                <span className="tabular-nums">{formatTimeInTZ(moonTimes.set, timezone)}</span>
              </MetadataText>
            )}
          </div>
        )}
      </div>
    </ModuleWrapper>
  );
}
