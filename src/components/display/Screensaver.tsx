'use client';

import { useState, useEffect } from 'react';
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

/** Where the clock sits, in percent of the screen, and which way it heads next. */
interface Spot {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

const START: Spot = { x: 50, y: 50, dx: 6, dy: 4 };
/** Kept off the edges so the text does not clip. */
const EDGE_MIN = 10;
const EDGE_MAX = 90;

/** One step along the path, turning back off the edges. */
function nextSpot({ x, y, dx, dy }: Spot): Spot {
  let nx = x + dx;
  let ny = y + dy;
  if (nx <= EDGE_MIN || nx >= EDGE_MAX) {
    dx = -dx;
    nx = Math.max(EDGE_MIN, Math.min(EDGE_MAX, nx));
  }
  if (ny <= EDGE_MIN || ny >= EDGE_MAX) {
    dy = -dy;
    ny = Math.max(EDGE_MIN, Math.min(EDGE_MAX, ny));
  }
  return { x: nx, y: ny, dx, dy };
}

/** A few ms past the boundary, so the new minute has begun when the timer fires. */
function msToNextMinute(nowMs: number): number {
  return 60_000 - (nowMs % 60_000) + 5;
}

/**
 * Minimal drifting clock screensaver, shown while the wall is dimmed (most of
 * the day once idle dim is on).
 *
 * It moves one step when the minute changes, together with its text, and has
 * no transition: a dimmed wall then draws one frame a minute. A glide would
 * redo style, layout and paint on every frame for as long as the wall is
 * dimmed, and burn-in protection only needs the clock not to stay in one place.
 */
function DriftingClock({ timezone, timeFormat }: { timezone?: string; timeFormat?: TimeFormat }) {
  const [time, setTime] = useState('');
  const [spot, setSpot] = useState(START);
  const locale = useFormattingLocale();
  const hour12 = householdTimeFormat(timeFormat, locale) === '12h';

  useEffect(() => {
    const read = () => setTime(formatTimeInTZ(new Date(), { timezone, locale, hour12 }));
    read();
    // A chain rather than an interval: each wait is measured from the clock
    // again, so a clock step or a late timer never leaves it off the boundary.
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => {
      id = setTimeout(() => {
        read();
        setSpot(nextSpot);
        schedule();
      }, msToNextMinute(Date.now()));
    };
    schedule();
    return () => clearTimeout(id);
  }, [timezone, locale, hour12]);

  return (
    <div
      style={{
        position: 'absolute',
        left: `${spot.x}%`,
        top: `${spot.y}%`,
        transform: 'translate(-50%, -50%)',
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
