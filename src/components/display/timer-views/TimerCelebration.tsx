'use client';

import { formatRemaining, type TimerTranslate } from './shared';
import type { MaterializedTimerSession } from '@/types/timers';

const CONFETTI = [
  [180, 13, 26, 44, '#f472b6', 24], [320, 79, 22, 38, '#fbbf24', -32],
  [120, 55, 20, 36, '#60a5fa', 58], [520, 20, 24, 40, '#34d399', -14],
  [640, 83, 20, 34, '#a78bfa', 40], [260, 35, 18, 32, '#e8503a', -52],
  [900, 11, 22, 38, '#fbbf24', 70], [1050, 85, 26, 42, '#f472b6', -24],
  [1500, 18, 20, 36, '#60a5fa', 16], [1620, 78, 24, 40, '#34d399', -40],
] as const;

/**
 * Shown for the linger window after a routine finishes (or a quick timer
 * ends), then the overlay dismisses and normal rotation is visible again.
 */
export default function TimerCelebration({
  session, title, s, t,
}: {
  session: MaterializedTimerSession;
  title: string;
  s: number;
  t: TimerTranslate;
}) {
  const isRoutine = session.kind === 'routine';
  const totalMs = (session.completedAt ?? session.startedAt) - session.startedAt;

  return (
    <div
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden', color: '#fff',
        background: 'radial-gradient(120% 90% at 50% 30%, #0f2018 0%, #0a1410 55%, #070d0a 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}
    >
      {CONFETTI.map(([top, leftPct, w, h, color, rotate], i) => (
        <div
          key={i}
          style={{
            position: 'absolute', top: top * s * 0.55, left: `${leftPct}%`,
            width: w * s, height: h * s, backgroundColor: color, borderRadius: 4 * s,
            ['--hs-confetti-rotate' as string]: `${rotate}deg`,
            animation: `hs-timer-confetti 2.6s ease-in-out ${i * 0.18}s infinite alternate`,
          }}
        />
      ))}

      <div
        style={{
          marginTop: 460 * s, width: 400 * s, height: 400 * s, borderRadius: '50%',
          backgroundColor: 'rgba(52,211,153,0.14)', border: `${8 * s}px solid #34d399`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 200 * s, fontWeight: 800, color: '#34d399',
          boxShadow: `0 0 ${120 * s}px rgba(52,211,153,0.35)`,
        }}
      >
        ✓
      </div>
      <div style={{ marginTop: 90 * s, fontSize: 110 * s, fontWeight: 800, letterSpacing: '-0.02em' }}>
        {isRoutine ? t('timer.allDone') : t('timer.timesUp')}
      </div>
      <div style={{ marginTop: 24 * s, fontSize: 44 * s, fontWeight: 500, color: 'rgba(255,255,255,0.6)', maxWidth: '90%', textAlign: 'center' }}>
        {t('timer.finished', { name: title })}
      </div>

      {isRoutine && (
        <div style={{ marginTop: 80 * s, display: 'flex', gap: 32 * s }}>
          <div style={{ padding: `${34 * s}px ${54 * s}px`, borderRadius: 32 * s, backgroundColor: 'rgba(255,255,255,0.06)', border: `2px solid rgba(255,255,255,0.1)`, textAlign: 'center' }}>
            <div style={{ fontSize: 64 * s, fontWeight: 800, color: '#34d399' }}>{session.steps.length}</div>
            <div style={{ marginTop: 8 * s, fontSize: 28 * s, fontWeight: 500, color: 'rgba(255,255,255,0.55)' }}>
              {t('timer.stepsDone')}
            </div>
          </div>
          <div style={{ padding: `${34 * s}px ${54 * s}px`, borderRadius: 32 * s, backgroundColor: 'rgba(255,255,255,0.06)', border: `2px solid rgba(255,255,255,0.1)`, textAlign: 'center' }}>
            <div style={{ fontSize: 64 * s, fontWeight: 800, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
              {formatRemaining(totalMs)}
            </div>
            <div style={{ marginTop: 8 * s, fontSize: 28 * s, fontWeight: 500, color: 'rgba(255,255,255,0.55)' }}>
              {t('timer.totalTime')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
