'use client';

import { useState, useEffect, useRef } from 'react';
import type { ScreensaverMode, TimeFormat } from '@/types/config';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import { formatTimeInTZ } from '@/lib/timezone';
import { useFormattingLocale } from '@/i18n';
import { householdTimeFormat } from '@/lib/clock-time';

interface ScreensaverProps {
  mode: ScreensaverMode;
  timezone?: string;
  /** Household 12/24 choice; absent follows the formatting language's own clock. */
  timeFormat?: TimeFormat;
}

/**
 * Minimal drifting clock screensaver.
 * Moves slowly to prevent OLED/LCD burn-in.
 */
function DriftingClock({ timezone, timeFormat }: { timezone?: string; timeFormat?: TimeFormat }) {
  const [time, setTime] = useState('');
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const velocityRef = useRef({ dx: 0.3, dy: 0.2 });
  const locale = useFormattingLocale();
  const hour12 = householdTimeFormat(timeFormat, locale) === '12h';

  useEffect(() => {
    function tick() {
      setTime(formatTimeInTZ(new Date(), { timezone, locale, hour12 }));
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [timezone, locale, hour12]);

  // Drift position slowly — bounces off edges
  useEffect(() => {
    const id = setInterval(() => {
      setPosition((prev) => {
        const v = velocityRef.current;
        let nx = prev.x + v.dx;
        let ny = prev.y + v.dy;

        // Bounce off edges (keep 10-90% range to avoid clipping)
        if (nx <= 10 || nx >= 90) {
          v.dx = -v.dx;
          nx = Math.max(10, Math.min(90, nx));
        }
        if (ny <= 10 || ny >= 90) {
          v.dy = -v.dy;
          ny = Math.max(10, Math.min(90, ny));
        }

        return { x: nx, y: ny };
      });
    }, 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        transition: 'left 0.5s linear, top 0.5s linear',
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: '4rem',
        fontWeight: 200,
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        letterSpacing: '0.05em',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {time}
    </div>
  );
}

export default function Screensaver({ mode, timezone, timeFormat }: ScreensaverProps) {
  if (mode === 'off' || mode === 'blank') return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: DISPLAY_LAYERS.screensaver,
        pointerEvents: 'none',
      }}
    >
      {mode === 'clock' && <DriftingClock timezone={timezone} timeFormat={timeFormat} />}
    </div>
  );
}
