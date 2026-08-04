'use client';

import type { CSSProperties } from 'react';
import { formatRemaining, formatStepLength, pillStyle, type TimerViewProps } from './shared';

const STAR_FIELD = [
  [12, 8, 2.5, 0.8], [78, 5, 2, 0.6], [90, 22, 3, 0.5], [30, 18, 2, 0.55],
  [62, 12, 2.5, 0.7], [8, 38, 2, 0.4], [94, 46, 2.5, 0.45], [18, 60, 2, 0.35],
  [85, 70, 2.5, 0.4], [10, 84, 2, 0.35],
] as const;

const starBackground = STAR_FIELD.map(
  ([x, y, size, alpha]) =>
    `radial-gradient(${size}px ${size}px at ${x}% ${y}%, rgba(255,255,255,${alpha}) 50%, transparent 51%)`,
).join(', ');

/**
 * "Adventure Path" — playful starry trail for younger kids: steps are stops
 * on a dotted path, finished stops get a check badge, the current stop grows
 * into the countdown ring. Variant D of the approved mockup.
 */
export default function PathTimerView({
  session, step, remainingMs, fraction, nudge, paused, title, s, t,
}: TimerViewProps) {
  const isRoutine = session.kind === 'routine';
  const deg = fraction * 360;
  const doneCount = session.stepIndex;
  const leftCount = session.steps.length - session.stepIndex;
  const prev = session.stepIndex > 0 ? session.steps[session.stepIndex - 1] : undefined;
  const upcoming = session.steps.slice(session.stepIndex + 1, session.stepIndex + 3);
  const hiddenAfter = session.steps.length - (session.stepIndex + 1) - upcoming.length;
  const ringMask = 'radial-gradient(closest-side, transparent 89%, #000 89.5%)';

  const bubbleStyle = (dim: number): CSSProperties => ({
    width: 170 * s, height: 170 * s, borderRadius: '50%',
    backgroundColor: '#262051', border: `${4 * s}px solid rgba(255,255,255,0.22)`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 78 * s, lineHeight: 1,
    filter: dim > 0 ? `saturate(${1 - dim * 0.3}) brightness(${1 - dim * 0.15})` : undefined,
  });

  return (
    <div
      style={{
        position: 'absolute', inset: 0, color: '#fff', overflow: 'hidden',
        background: 'radial-gradient(140% 100% at 80% 0%, #2b1f5e 0%, #1a1440 45%, #100c2a 100%)',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, backgroundImage: starBackground }} />

      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ paddingTop: 110 * s, textAlign: 'center' }}>
          <div style={{ fontSize: 52 * s, fontWeight: 700, letterSpacing: '-0.01em', maxWidth: '90vw' }}>
            {session.icon ? `${title} ${session.icon}` : title}
          </div>
          {isRoutine && (
            <div style={{ marginTop: 14 * s, fontSize: 32 * s, fontWeight: 500, color: 'rgba(255,255,255,0.55)' }}>
              {t('timer.progressWords', { done: doneCount, left: leftCount })}
            </div>
          )}
        </div>

        {/* Dotted trail behind the nodes; nodes have opaque backgrounds so the
            trail reads as passing behind each stop. */}
        {isRoutine && (
          <div
            style={{
              position: 'absolute', left: '50%', top: 330 * s, bottom: 130 * s, width: 8 * s,
              transform: 'translateX(-50%)', borderRadius: 999,
              background: `repeating-linear-gradient(180deg, rgba(255,255,255,0.28) 0 ${26 * s}px, transparent ${26 * s}px ${52 * s}px)`,
            }}
          />
        )}

        <div
          style={{
            position: 'relative', flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 44 * s, paddingBottom: 60 * s,
          }}
        >
          {prev && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ ...bubbleStyle(0), backgroundColor: '#17403a', borderColor: '#34d399' }}>{prev.icon}</div>
                <div
                  style={{
                    position: 'absolute', top: -6 * s, right: -6 * s, width: 56 * s, height: 56 * s,
                    borderRadius: '50%', backgroundColor: '#34d399', color: '#06281c',
                    fontSize: 34 * s, fontWeight: 800, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', boxShadow: `0 ${6 * s}px ${18 * s}px rgba(0,0,0,0.35)`,
                  }}
                >
                  ✓
                </div>
              </div>
              <div style={{ marginTop: 18 * s, fontSize: 30 * s, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
                {prev.label}
              </div>
            </div>
          )}

          <div
            style={{
              position: 'relative', width: 560 * s, height: 560 * s, borderRadius: '50%',
              backgroundColor: '#221b50', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', textAlign: 'center',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', WebkitMask: ringMask, mask: ringMask }} />
            <div
              style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: nudge
                  ? `conic-gradient(from 0deg, #fbbf24, #f59e0b ${deg}deg, transparent ${deg}deg)`
                  : `conic-gradient(from 0deg, #fbbf24, #f472b6 ${deg}deg, transparent ${deg}deg)`,
                WebkitMask: ringMask, mask: ringMask,
                filter: `drop-shadow(0 0 ${34 * s}px rgba(244,114,182,0.4))`,
                animation: nudge ? 'hs-timer-pulse 1.6s ease-in-out infinite' : undefined,
              }}
            />
            <div style={{ fontSize: 130 * s, lineHeight: 1 }}>{step.icon}</div>
            {step.label && (
              <div style={{ marginTop: 20 * s, fontSize: 56 * s, fontWeight: 700, maxWidth: 460 * s }}>{step.label}</div>
            )}
            {session.awaitingTap ? (
              <div style={{ ...pillStyle(s, '#06281c', '#34d399'), marginTop: 24 * s }}>{t('timer.done')}</div>
            ) : (
              <div style={{ marginTop: 14 * s, fontSize: 120 * s, fontWeight: 800, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
                {formatRemaining(remainingMs)}
              </div>
            )}
            {paused && (
              <div style={{ ...pillStyle(s, '#100c2a', 'rgba(255,255,255,0.85)'), marginTop: 18 * s }}>
                {t('timer.paused')}
              </div>
            )}
          </div>

          {upcoming.map((up) => (
            <div key={up.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={bubbleStyle(1)}>{up.icon}</div>
              <div style={{ marginTop: 14 * s, fontSize: 30 * s, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
                {up.label}
              </div>
              <div style={{ marginTop: 6 * s, fontSize: 26 * s, fontWeight: 500, color: 'rgba(255,255,255,0.45)' }}>
                {formatStepLength(up.durationSec, t)}
              </div>
            </div>
          ))}
          {hiddenAfter > 0 && (
            <div style={{ fontSize: 30 * s, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>
              {t('timer.moreSteps', { count: hiddenAfter })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
