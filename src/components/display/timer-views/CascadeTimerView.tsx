'use client';

import { formatRemaining, formatStepLength, pillStyle, type TimerViewProps } from './shared';

/**
 * "Cascade" — the whole screen is the timer: a warm color column drains
 * downward as time passes, readable from across the room. Variant C of the
 * approved mockup.
 */
export default function CascadeTimerView({
  session, step, remainingMs, fraction, nudge, paused, title, s, t,
}: TimerViewProps) {
  const isRoutine = session.kind === 'routine';
  const next = isRoutine ? session.steps[session.stepIndex + 1] : undefined;

  return (
    <div data-testid="timer-view" data-timer-view="cascade" style={{ position: 'absolute', inset: 0, backgroundColor: '#0c0f14', color: '#fff', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: `${fraction * 100}%`,
          background: 'linear-gradient(180deg, #f59e0b 0%, #ea7a2b 60%, #e8503a 100%)',
          transition: 'height 1s linear',
          animation: nudge ? 'hs-timer-pulse 1.6s ease-in-out infinite' : undefined,
        }}
      >
        <div
          style={{
            position: 'absolute', top: -6 * s, left: 0, right: 0, height: 12 * s,
            backgroundColor: 'rgba(255,255,255,0.55)', filter: `blur(${6 * s}px)`,
          }}
        />
      </div>

      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {isRoutine && (
          <div style={{ display: 'flex', gap: 16 * s, marginTop: 110 * s, width: 800 * s }}>
            {session.steps.map((seg, i) => {
              const isDone = i < session.stepIndex;
              const isCurrent = i === session.stepIndex;
              return (
                <div
                  key={seg.id}
                  style={{
                    height: 14 * s, borderRadius: 999, flex: isCurrent ? 2.2 : 1,
                    backgroundColor: isDone || isCurrent ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.16)',
                    boxShadow: isCurrent ? `0 0 ${20 * s}px rgba(255,255,255,0.5)` : undefined,
                  }}
                />
              );
            })}
          </div>
        )}
        <div
          style={{
            marginTop: isRoutine ? 44 * s : 150 * s, fontSize: 36 * s, fontWeight: 600,
            letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)',
            maxWidth: '90%', textAlign: 'center',
          }}
        >
          {title}
        </div>

        {session.awaitingTap ? (
          <div style={{ ...pillStyle(s, '#0c0f14', '#fff'), marginTop: 170 * s, fontSize: 84 * s, padding: `${34 * s}px ${100 * s}px` }}>
            {t('timer.done')}
          </div>
        ) : (
          <div
            style={{
              marginTop: 150 * s, fontSize: 300 * s, fontWeight: 800, letterSpacing: '-0.045em',
              lineHeight: 1, fontVariantNumeric: 'tabular-nums',
              textShadow: `0 ${8 * s}px ${40 * s}px rgba(0,0,0,0.25)`,
            }}
          >
            {formatRemaining(remainingMs)}
          </div>
        )}

        {isRoutine && (
          <div style={{ marginTop: 60 * s, display: 'flex', alignItems: 'center', gap: 28 * s, maxWidth: '90%' }}>
            <div style={{ fontSize: 84 * s, lineHeight: 1 }}>{step.icon}</div>
            <div style={{ fontSize: 74 * s, fontWeight: 700, letterSpacing: '-0.02em' }}>{step.label}</div>
          </div>
        )}
        {paused && (
          <div style={{ ...pillStyle(s, '#0c0f14', 'rgba(255,255,255,0.9)'), marginTop: 40 * s }}>
            {t('timer.paused')}
          </div>
        )}
        {nudge && !session.awaitingTap && (
          <div style={{ marginTop: 40 * s, fontSize: 40 * s, fontWeight: 600 }}>{t('timer.almostDone')}</div>
        )}

        <div style={{ marginTop: 'auto', marginBottom: 120 * s, fontSize: 34 * s, fontWeight: 500, color: 'rgba(255,255,255,0.75)' }}>
          {next && (
            <>
              {t('timer.nextUp')}{' '}
              <span style={{ fontWeight: 700, color: '#fff' }}>{next.label}</span>
              {' · '}
              {formatStepLength(next.durationSec, t)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
