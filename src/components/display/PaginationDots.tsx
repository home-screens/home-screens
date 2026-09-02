'use client';

import { useEffect, useRef, useState } from 'react';
import type { Screen } from '@/types/config';
import { useTranslate } from '@/i18n';
import {
  MAX_PAGINATION_DOTS as MAX_DOTS,
  PAGINATION_DOT_PX,
  PAGINATION_HIT_PX,
  PAGINATION_GAP_PX,
  PAGINATION_BOTTOM_PX,
  PAGINATION_PROGRESS_W_PX,
  PAGINATION_PROGRESS_H_PX,
} from '@/lib/constants';

export interface RotationProgress {
  /** Epoch ms the current dwell was armed (useScreenRotationTimer). */
  startedAt: number;
  /** The dwell length; the line is full when this much has elapsed. */
  durationMs: number;
}

interface PaginationDotsProps {
  screens: Screen[];
  activeIndex: number;
  paused: boolean;
  onDotClick: (index: number) => void;
  /**
   * Tap on the paused pill. Omitted (editor preview) and the pill is a plain
   * "Paused" badge with no countdown and nothing to tap.
   */
  onResume?: () => void;
  /** When the paused rotation resumes on its own; null = only a tap resumes it. */
  pausedUntil?: number | null;
  /** Progress line under the active dot; null hides it (sticky screen, or off in settings). */
  progress?: RotationProgress | null;
}

/** How long the screen name stays up after a tap. */
const NAME_FLASH_MS = 2_000;

/**
 * The kiosk's screen indicator: one dot per screen, a thin progress line
 * under the active dot that fills over the screen's dwell, and the paused
 * pill. With more than MAX_DOTS screens it collapses to `‹  7 / 24  ›`, where
 * the counter is the active dot (double-tap to pause) and the arrows step.
 * A tap on any of it flashes the destination screen's name for a moment.
 *
 * Purely presentational. The double-tap-to-pause gesture lives in
 * `usePauseRotation` — this only reports which dot was tapped, and the pill's
 * tap calls `onResume`.
 *
 * Hit targets are 44px (the dots themselves are 10px) because this is driven by
 * fingers on a wall-mounted panel, not a mouse. The pill is sized to be read
 * from across the room (22px at the wall's native pixels).
 *
 * The progress line is a CSS animation, not a rAF loop: a Pi paints one
 * transform per frame on the compositor and the main thread stays free. A
 * negative animation-delay syncs it to `startedAt` when the dots mount after
 * the dwell was armed; `animation-play-state: paused` freezes it while paused.
 */
export default function PaginationDots({
  screens,
  activeIndex,
  paused,
  onDotClick,
  onResume,
  pausedUntil = null,
  progress = null,
}: PaginationDotsProps) {
  const t = useTranslate('core');
  const [flashedName, setFlashedName] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // Countdown clock for the pill, ticking only while there is a deadline.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!paused || pausedUntil === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [paused, pausedUntil]);

  if (screens.length <= 1) return null;

  const tap = (index: number) => {
    onDotClick(index);
    if (index === activeIndex) return;
    const name = screens[index]?.name;
    if (!name) return;
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashedName(name);
    flashTimer.current = setTimeout(() => setFlashedName(null), NAME_FLASH_MS);
  };

  const compact = screens.length > MAX_DOTS;
  const activeLabel = paused ? 'Resume rotation' : 'Pause rotation (double-tap)';

  const hitTarget: React.CSSProperties = {
    position: 'relative',
    minWidth: PAGINATION_HIT_PX,
    height: PAGINATION_HIT_PX,
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.85)',
  };

  const pauseGlyph = (
    <span style={{ display: 'flex', gap: 2, filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }}>
      <span style={{ width: 3, height: 10, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.85)' }} />
      <span style={{ width: 3, height: 10, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.85)' }} />
    </span>
  );

  // The line sits just under the dot, inside the 44px hit target, and is
  // wider than the target on purpose (overflow is visible).
  const progressLine = progress && progress.durationMs > 0 ? (
    <span
      aria-hidden="true"
      data-testid="rotation-progress"
      style={{
        position: 'absolute',
        left: '50%',
        top: PAGINATION_HIT_PX / 2 + PAGINATION_DOT_PX / 2 + 8,
        width: PAGINATION_PROGRESS_W_PX,
        height: PAGINATION_PROGRESS_H_PX,
        transform: 'translateX(-50%)',
        borderRadius: PAGINATION_PROGRESS_H_PX,
        backgroundColor: 'rgba(255,255,255,0.12)',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <span
        key={progress.startedAt}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(255,255,255,0.6)',
          transformOrigin: 'left center',
          transform: 'scaleX(0)',
          animation: `hs-rotation-progress ${progress.durationMs}ms linear forwards`,
          animationDelay: `-${Math.min(Math.max(Date.now() - progress.startedAt, 0), progress.durationMs)}ms`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
      />
    </span>
  ) : null;

  let resumeText: string | null = null;
  if (paused && onResume) {
    if (pausedUntil === null) {
      resumeText = t('pagination.tapToResume');
    } else {
      const remaining = Math.max(0, pausedUntil - now);
      const time = remaining >= 60_000
        ? t('pagination.minutes', { count: Math.ceil(remaining / 60_000) })
        : t('pagination.seconds', { count: Math.max(1, Math.ceil(remaining / 1_000)) });
      resumeText = t('pagination.resumesIn', { time });
    }
  }

  return (
    <>
      <div
        style={{
          position: 'absolute',
          bottom: PAGINATION_BOTTOM_PX,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          zIndex: 100,
          viewTransitionName: 'pagination',
        }}
      >
        {paused && (
          <button
            type="button"
            data-testid="pause-pill"
            onClick={onResume}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 8,
              padding: '16px 28px 16px 22px',
              borderRadius: 999,
              border: '1px solid #3a3b41',
              backgroundColor: 'rgba(20,21,26,0.92)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
              color: '#fff',
              fontSize: 22,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              cursor: onResume ? 'pointer' : 'default',
              animation: 'pause-fade-in 0.3s ease-out',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                backgroundColor: '#e6e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                flex: 'none',
              }}
            >
              <span style={{ width: 5, height: 16, borderRadius: 1, backgroundColor: '#111' }} />
              <span style={{ width: 5, height: 16, borderRadius: 1, backgroundColor: '#111' }} />
            </span>
            <span style={{ fontWeight: 600 }}>{t('pagination.paused')}</span>
            {resumeText && <span style={{ color: '#9aa0ab' }}>{resumeText}</span>}
          </button>
        )}
        {flashedName && (
          <span
            data-testid="pagination-label"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.85)',
              backgroundColor: 'rgba(0,0,0,0.45)',
              padding: '3px 8px',
              borderRadius: 6,
              maxWidth: 360,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              animation: 'pause-fade-in 0.3s ease-out',
            }}
          >
            {flashedName}
          </span>
        )}
        {compact ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} data-testid="pagination-compact">
            <button
              onClick={() => tap((activeIndex - 1 + screens.length) % screens.length)}
              aria-label="Previous screen"
              style={{ ...hitTarget, fontSize: 22, lineHeight: 1 }}
            >
              ‹
            </button>
            <button
              onClick={() => tap(activeIndex)}
              aria-label={activeLabel}
              aria-current="true"
              style={{ ...hitTarget, gap: 8, padding: '0 6px' }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.04em',
                  textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                }}
              >
                {activeIndex + 1} / {screens.length}
              </span>
              {paused && pauseGlyph}
              {progressLine}
            </button>
            <button
              onClick={() => tap((activeIndex + 1) % screens.length)}
              aria-label="Next screen"
              style={{ ...hitTarget, fontSize: 22, lineHeight: 1 }}
            >
              ›
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: PAGINATION_GAP_PX }}>
            {screens.map((s, i) => {
              const isActive = i === activeIndex;
              const showPause = isActive && paused;
              return (
                <button
                  key={s.id}
                  onClick={() => tap(i)}
                  aria-label={
                    isActive ? activeLabel : `Go to screen ${i + 1}${s.name ? `: ${s.name}` : ''}`
                  }
                  aria-current={isActive ? 'true' : undefined}
                  style={{ ...hitTarget, width: PAGINATION_HIT_PX }}
                >
                  {showPause ? pauseGlyph : (
                    <span
                      style={{
                        width: PAGINATION_DOT_PX,
                        height: PAGINATION_DOT_PX,
                        borderRadius: '50%',
                        backgroundColor: isActive ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)',
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)',
                        transition: 'background-color 0.3s',
                        display: 'block',
                      }}
                    />
                  )}
                  {isActive && progressLine}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pause-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes hs-rotation-progress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </>
  );
}
