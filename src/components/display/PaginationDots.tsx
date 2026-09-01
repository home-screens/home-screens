'use client';

import { useEffect, useRef, useState } from 'react';
import type { Screen } from '@/types/config';
import {
  MAX_PAGINATION_DOTS as MAX_DOTS,
  PAGINATION_DOT_PX,
  PAGINATION_HIT_PX,
  PAGINATION_GAP_PX,
  PAGINATION_BOTTOM_PX,
} from '@/lib/constants';

interface PaginationDotsProps {
  screens: Screen[];
  activeIndex: number;
  paused: boolean;
  onDotClick: (index: number) => void;
}

/** How long the screen name stays up after a tap. */
const NAME_FLASH_MS = 2_000;

/**
 * The kiosk's screen indicator: one dot per screen, plus the PAUSED affordance.
 * With more than MAX_DOTS screens it collapses to `‹  7 / 24  ›`, where the
 * counter is the active dot (double-tap to pause) and the arrows step.
 * A tap on any of it flashes the destination screen's name for a moment.
 *
 * Purely presentational. The double-tap-to-pause gesture lives in
 * `usePauseRotation` — this only reports which dot was tapped.
 *
 * Hit targets are 44px (the dots themselves are 10px) because this is driven by
 * fingers on a wall-mounted panel, not a mouse.
 */
export default function PaginationDots({
  screens,
  activeIndex,
  paused,
  onDotClick,
}: PaginationDotsProps) {
  const [flashedName, setFlashedName] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

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
        {(paused || flashedName) && (
          <span
            data-testid="pagination-label"
            style={{
              fontSize: flashedName ? 13 : 10,
              fontWeight: 600,
              letterSpacing: flashedName ? undefined : '0.1em',
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
            {flashedName ?? 'PAUSED'}
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
                </button>
              );
            })}
          </div>
        )}
      </div>

      {(paused || flashedName) && (
        <style>{`
          @keyframes pause-fade-in {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      )}
    </>
  );
}
