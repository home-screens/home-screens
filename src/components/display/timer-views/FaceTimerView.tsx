'use client';

import { formatRemaining, pillStyle, type TimerViewProps } from './shared';

/**
 * "Timer Face" — the classic kids' visual timer: a bright clock face whose
 * colored wedge shrinks toward 12 as time runs out (area is readable before
 * kids can read clocks). Variant B of the approved mockup.
 */
export default function FaceTimerView({
  session, step, remainingMs, fraction, nudge, paused, title, s, t,
}: TimerViewProps) {
  const isRoutine = session.kind === 'routine';
  // The transparent gap grows clockwise from 12; the colored remaining wedge
  // is what's left of the disk.
  const gapDeg = (1 - fraction) * 360;
  const wedgeColor = nudge ? '#f59e0b' : '#e8503a';

  return (
    <div
      data-testid="timer-view"
      data-timer-view="face"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(180deg, #f7f4ee 0%, #efe9df 100%)',
        color: '#262b33',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div style={{ marginTop: 170 * s, fontSize: 54 * s, fontWeight: 700, letterSpacing: '-0.015em', maxWidth: '90%', textAlign: 'center' }}>
        {isRoutine ? step.label : title}
      </div>
      {isRoutine && (
        <div style={{ marginTop: 16 * s, fontSize: 34 * s, fontWeight: 500, color: 'rgba(38,43,51,0.5)' }}>
          {t('timer.stepCount', { current: session.stepIndex + 1, total: session.steps.length })}
        </div>
      )}

      {/* flexShrink 0: the dial's children are all absolutely positioned, so
          its min-content height is 0 and column overflow (e.g. a long wrapped
          routine title) would squash the circle into an oval. */}
      <div data-testid="timer-dial" style={{ position: 'relative', width: 780 * s, height: 780 * s, marginTop: 130 * s, flexShrink: 0 }}>
        <div
          style={{
            position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: '#fff',
            boxShadow: `0 ${30 * s}px ${80 * s}px rgba(38,43,51,0.16), inset 0 0 0 ${3 * s}px rgba(38,43,51,0.06)`,
          }}
        />
        <div
          style={{
            position: 'absolute', inset: 56 * s, borderRadius: '50%',
            background: `conic-gradient(from 0deg, transparent 0deg, transparent ${gapDeg}deg, ${wedgeColor} ${gapDeg}deg, ${wedgeColor} 360deg)`,
            animation: nudge ? 'hs-timer-pulse 1.6s ease-in-out infinite' : undefined,
          }}
        />
        <div
          style={{
            position: 'absolute', inset: 14 * s, borderRadius: '50%',
            background: `repeating-conic-gradient(from -1.2deg, rgba(38,43,51,0.5) 0deg 2.4deg, transparent 2.4deg 30deg)`,
            WebkitMask: 'radial-gradient(closest-side, transparent 88%, #000 88.5%)',
            mask: 'radial-gradient(closest-side, transparent 88%, #000 88.5%)',
          }}
        />
        <div
          style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 56 * s, height: 56 * s, borderRadius: '50%', backgroundColor: '#262b33',
            boxShadow: `0 ${4 * s}px ${12 * s}px rgba(0,0,0,0.3)`,
          }}
        />
      </div>

      {session.awaitingTap ? (
        <div style={{ ...pillStyle(s, '#fff', '#34d399'), marginTop: 120 * s, fontSize: 64 * s, padding: `${26 * s}px ${80 * s}px` }}>
          {t('timer.done')}
        </div>
      ) : (
        <div style={{ marginTop: 120 * s, fontSize: 170 * s, fontWeight: 700, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
          {formatRemaining(remainingMs)}
        </div>
      )}
      {paused && (
        <div style={{ ...pillStyle(s, '#fff', '#262b33'), marginTop: 20 * s }}>{t('timer.paused')}</div>
      )}

      {nudge && (
        <div style={{ marginTop: 'auto', marginBottom: 140 * s, fontSize: 30 * s, fontWeight: 500, color: 'rgba(38,43,51,0.4)' }}>
          {t('timer.almostDone')}
        </div>
      )}
    </div>
  );
}
