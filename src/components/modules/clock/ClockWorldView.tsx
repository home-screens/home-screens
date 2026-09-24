'use client';

import { clockTimeInTZ, parseClockTime } from '@/lib/date-info';
import { wallClockParts } from '@/lib/timezone';
import { useTranslate } from '@/i18n';
import { TEXT_OPACITY, ink } from '@/lib/constants';
import { clockAlignmentStyle } from './alignment';
import type { ClockViewProps } from './types';

/**
 * World clock — primary local time displayed large on top,
 * with compact timezone rows below showing up to 3 additional zones.
 */
/** Whole days from one `YYYY-MM-DD` to another. */
function daysBetween(from: string, to: string): number {
  const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

export default function ClockWorldView({ config, instant, time, timezone, scaledFontSize, fitToBox, containerRef }: ClockViewProps) {
  const t = useTranslate('modules');
  const { hStr, mStr, sStr, hours } = parseClockTime(config.format24h, time);
  const period = config.format24h ? '' : hours >= 12 ? t('clock.pm') : t('clock.am');

  const primaryTime = config.showSeconds
    ? `${hStr}:${mStr}:${sStr}`
    : `${hStr}:${mStr}`;

  // Each zone reads the same instant as the main clock, so the rows tick
  // together and hydrate with it.
  const homeDay = wallClockParts(instant, timezone).isoDate;
  const zones = (config.worldZones || []).slice(0, 3).map((zone) => {
    const { hours: zoneHours, minutes: zoneMinutes } = clockTimeInTZ(instant, zone.timezone);

    const zh = config.format24h ? zoneHours : zoneHours % 12 || 12;
    const zhStr = config.format24h ? String(zh).padStart(2, '0') : String(zh);
    const zmStr = String(zoneMinutes).padStart(2, '0');
    const zoneAmpm = config.format24h ? '' : zoneHours >= 12 ? t('clock.pm') : t('clock.am');

    const zoneTimeStr = `${zhStr}:${zmStr}`;

    // Day offset: the zone's calendar day against the clock's own.
    const dayOffset = daysBetween(homeDay, wallClockParts(instant, zone.timezone).isoDate);

    return {
      label: zone.label,
      time: zoneTimeStr,
      ampm: zoneAmpm,
      dayOffset,
    };
  });

  const primaryFontSize = scaledFontSize * 2.8;
  const zoneFontSize = scaledFontSize * 1.1;
  const labelFontSize = scaledFontSize * 0.8;
  const badgeFontSize = scaledFontSize * 0.55;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col"
      style={{ ...clockAlignmentStyle(config, 'column'), gap: scaledFontSize * 1.0  }}
    >
      {/* Primary time */}
      <div className="flex flex-col items-center">
        <div
          className="tabular-nums font-light tracking-wide"
          style={{ fontSize: primaryFontSize, lineHeight: 1 }}
          suppressHydrationWarning
        >
          {primaryTime}
        </div>
        {period && (
          <div
            className="uppercase tracking-widest font-light"
            style={{ fontSize: scaledFontSize * 0.65, marginTop: 3, opacity: TEXT_OPACITY.tertiary }}
            suppressHydrationWarning
          >
            {period}
          </div>
        )}
      </div>

      {/* Zone rows */}
      {zones.length > 0 && (
        <div
          className="flex flex-col"
          style={{
            width: fitToBox ? '100%' : scaledFontSize * 16,
            maxWidth: scaledFontSize * 16,
            gap: scaledFontSize * 0.3,
          }}
        >
          {zones.map((zone, i) => (
            <div key={zone.label + i}>
              {/* Subtle divider */}
              <div
                className="opacity-10 mx-auto"
                style={{
                  height: 1,
                  backgroundColor: 'currentColor',
                  marginBottom: scaledFontSize * 0.35,
                }}
              />

              <div className="flex items-center justify-between px-2">
                {/* Label */}
                <span
                  className="uppercase tracking-wider font-light truncate"
                  style={{
                    fontSize: labelFontSize,
                    maxWidth: '40%',
                    opacity: TEXT_OPACITY.dim,
                  }}
                >
                  {zone.label}
                </span>

                {/* Time + optional day badge */}
                <div className="flex items-center" style={{ gap: scaledFontSize * 0.3 }}>
                  <span
                    className="tabular-nums font-light"
                    style={{ fontSize: zoneFontSize, opacity: TEXT_OPACITY.heading }}
                    suppressHydrationWarning
                  >
                    {zone.time}
                  </span>
                  {zone.ampm && (
                    <span
                      className="uppercase font-light"
                      style={{ fontSize: badgeFontSize, opacity: TEXT_OPACITY.tertiary }}
                      suppressHydrationWarning
                    >
                      {zone.ampm}
                    </span>
                  )}
                  {zone.dayOffset !== 0 && (
                    <span
                      className="rounded-full tabular-nums font-medium flex items-center justify-center"
                      style={{
                        fontSize: badgeFontSize,
                        minWidth: scaledFontSize * 1.2,
                        height: scaledFontSize * 0.85,
                        backgroundColor: ink(0.1),
                        paddingLeft: scaledFontSize * 0.2,
                        paddingRight: scaledFontSize * 0.2,
                      }}
                      suppressHydrationWarning
                    >
                      {zone.dayOffset > 0 ? '+' : ''}{zone.dayOffset}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
