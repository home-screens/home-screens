'use client';

import { formatRemaining, formatStepLength, pillStyle, stepWindow, type TimerViewProps } from './shared';

/**
 * "Focus Ring" — calm glassy dark view matching the display's overlay
 * language. Ring drains clockwise; routine steps sit as chips along the
 * bottom. The approved mockup is variant A of
 * `.claude/mockups/visual-timer-takeover.html`.
 */
export default function RingTimerView({
  session, step, remainingMs, fraction, nudge, paused, title, s, t,
}: TimerViewProps) {
  const isRoutine = session.kind === 'routine';
  const deg = fraction * 360;
  const ringColors = nudge
    ? { from: '#fbbf24', to: '#f59e0b', glow: 'rgba(245,158,11,0.55)' }
    : { from: '#2dd4bf', to: '#34d399', glow: 'rgba(45,212,191,0.35)' };
  const mask = `radial-gradient(closest-side, transparent 76.5%, #000 77%)`;
  const chips = stepWindow(session.steps, session.stepIndex, 5);

  return (
    <div
      data-testid="timer-view"
      data-timer-view="ring"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(120% 90% at 50% 30%, #101a26 0%, #0a0f16 55%, #070a0f 100%)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          marginTop: 120 * s,
          fontSize: 40 * s,
          fontWeight: 600,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.55)',
          maxWidth: '90%',
          textAlign: 'center',
        }}
      >
        {title}
      </div>
      {isRoutine && (
        <div style={{ marginTop: 18 * s, fontSize: 34 * s, fontWeight: 500, color: 'rgba(255,255,255,0.35)' }}>
          {t('timer.stepCount', { current: session.stepIndex + 1, total: session.steps.length })}
        </div>
      )}

      <div data-testid="timer-dial" style={{ position: 'relative', width: 720 * s, height: 720 * s, marginTop: 110 * s, flexShrink: 0 }}>
        <div
          style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'rgba(255,255,255,0.07)',
            WebkitMask: mask, mask,
          }}
        />
        <div
          style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: `conic-gradient(from 0deg, ${ringColors.from}, ${ringColors.to} ${deg}deg, transparent ${deg}deg)`,
            WebkitMask: mask, mask,
            filter: `drop-shadow(0 0 ${40 * s}px ${ringColors.glow})`,
            animation: nudge ? 'hs-timer-pulse 1.6s ease-in-out infinite' : undefined,
          }}
        />
        {fraction > 0.01 && (
          <div style={{ position: 'absolute', inset: 0, transform: `rotate(${deg}deg)` }}>
            <div
              style={{
                position: 'absolute', top: 22 * s, left: '50%', transform: 'translateX(-50%)',
                width: 42 * s, height: 42 * s, borderRadius: '50%',
                backgroundColor: ringColors.to,
                boxShadow: `0 0 ${24 * s}px ${ringColors.glow}`,
              }}
            />
          </div>
        )}
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 90 * s,
          }}
        >
          <div style={{ fontSize: 110 * s, lineHeight: 1 }}>{step.icon}</div>
          {step.label && (
            <div style={{ marginTop: 28 * s, fontSize: 58 * s, fontWeight: 600, letterSpacing: '-0.01em' }}>
              {step.label}
            </div>
          )}
          {session.awaitingTap ? (
            <div style={{ ...pillStyle(s, '#06281c', '#34d399'), marginTop: 36 * s }}>
              {t('timer.done')}
            </div>
          ) : (
            <div style={{ marginTop: 20 * s, fontSize: 150 * s, fontWeight: 700, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
              {formatRemaining(remainingMs)}
            </div>
          )}
          {nudge && !session.awaitingTap && (
            <div style={{ marginTop: 26 * s, fontSize: 40 * s, fontWeight: 600, color: '#fbbf24' }}>
              {t('timer.almostDone')}
            </div>
          )}
          {paused && (
            <div style={{ ...pillStyle(s, '#0a0f16', 'rgba(255,255,255,0.85)'), marginTop: 30 * s }}>
              {t('timer.paused')}
            </div>
          )}
        </div>
      </div>

      {isRoutine && (
        <div
          style={{
            marginTop: 'auto', marginBottom: 130 * s, display: 'flex',
            gap: 24 * s, padding: `0 ${60 * s}px`, alignItems: 'stretch',
          }}
        >
          {chips.steps.map((chip, i) => {
            const index = chips.offset + i;
            const isDone = index < session.stepIndex;
            const isCurrent = index === session.stepIndex;
            return (
              <div
                key={chip.id}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 * s,
                  padding: `${30 * s}px ${26 * s}px`, borderRadius: 28 * s, minWidth: 200 * s,
                  backgroundColor: isCurrent ? 'rgba(45,212,191,0.12)' : 'rgba(255,255,255,0.05)',
                  border: `2px solid ${isCurrent ? 'rgba(45,212,191,0.55)' : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: isCurrent ? `0 0 ${44 * s}px rgba(45,212,191,0.18)` : undefined,
                  opacity: isDone ? 0.45 : isCurrent ? 1 : 0.6,
                }}
              >
                <div style={{ fontSize: 56 * s, lineHeight: 1 }}>{chip.icon}</div>
                <div style={{ fontSize: 28 * s, fontWeight: 600, color: 'rgba(255,255,255,0.85)', textAlign: 'center' }}>
                  {chip.label}
                </div>
                {isDone ? (
                  <div style={{ fontSize: 24 * s, fontWeight: 700, color: '#34d399' }}>
                    ✓ {t('actions.done')}
                  </div>
                ) : (
                  <div style={{ fontSize: 24 * s, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>
                    {formatStepLength(chip.durationSec, t)}
                  </div>
                )}
              </div>
            );
          })}
          {chips.hiddenAfter > 0 && (
            <div style={{ alignSelf: 'center', fontSize: 30 * s, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>
              {t('timer.moreSteps', { count: chips.hiddenAfter })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
