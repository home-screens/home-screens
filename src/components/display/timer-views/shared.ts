import type { CSSProperties } from 'react';
import type { MaterializedTimerSession, RoutineStep } from '@/types/timers';

/** Fraction of the step remaining at which the almost-done nudge kicks in. */
export const NUDGE_FRACTION = 0.2;

export type TimerTranslate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Common contract for the four takeover views. All sizes inside views are
 * mockup pixels (1080-wide portrait canvas) multiplied by `s`, the same
 * canvas scale AlertOverlay uses, so the views reproduce the approved mockup
 * proportions on any display resolution.
 */
export interface TimerViewProps {
  session: MaterializedTimerSession;
  step: RoutineStep;
  remainingMs: number;
  /** Remaining fraction of the current step, clamped 0..1. */
  fraction: number;
  nudge: boolean;
  paused: boolean;
  /** Localized session title (routine name, or "N minute timer"). */
  title: string;
  s: number;
  t: TimerTranslate;
}

/**
 * Localized name for an ad-hoc quick timer: "30 second timer" under a minute,
 * "5 minute timer" on whole minutes, "1:30 timer" otherwise. Key prefix
 * differs per surface ('timer' in core for the display, 'timers' in remote).
 */
export function formatQuickName(
  durationSec: number,
  t: TimerTranslate,
  keyPrefix: 'timer' | 'timers',
): string {
  if (durationSec < 60) return t(`${keyPrefix}.quickNameSeconds`, { seconds: durationSec });
  if (durationSec % 60 === 0) return t(`${keyPrefix}.quickName`, { minutes: durationSec / 60 });
  return t(`${keyPrefix}.quickNameClock`, { time: formatRemaining(durationSec * 1000) });
}

/**
 * A step's authored length for chips/next-up rows: whole minutes read as
 * "3 min", anything else as clock notation ("1:30") — rounding a 90s step
 * to "2 min" would misstate what the author typed.
 */
export function formatStepLength(durationSec: number, t: TimerTranslate): string {
  if (durationSec % 60 === 0) return t('timer.minutesShort', { minutes: durationSec / 60 });
  return formatRemaining(durationSec * 1000);
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Steps to show in a routine strip (ring chips / path nodes). Long routines
 * get a window around the current step so the strip never overflows;
 * `hiddenAfter` is how many steps fell off the end.
 */
export function stepWindow(
  steps: RoutineStep[],
  currentIndex: number,
  max: number,
): { steps: RoutineStep[]; offset: number; hiddenAfter: number } {
  if (steps.length <= max) return { steps, offset: 0, hiddenAfter: 0 };
  const offset = Math.min(Math.max(0, currentIndex - 1), steps.length - max);
  return {
    steps: steps.slice(offset, offset + max),
    offset,
    hiddenAfter: steps.length - (offset + max),
  };
}

/** Shared "Paused" / "Done!" pill used by every view. */
export const pillStyle = (s: number, color: string, bg: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${14 * s}px ${44 * s}px`,
  borderRadius: 999,
  fontSize: 40 * s,
  fontWeight: 700,
  color,
  backgroundColor: bg,
});
