'use client';

import type { Screen } from '@/types/config';

interface PaginationDotsProps {
  screens: Screen[];
  activeIndex: number;
  paused: boolean;
  onDotClick: (index: number) => void;
}

/**
 * The kiosk's screen indicator: one dot per screen, plus the PAUSED affordance.
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
  if (screens.length <= 1) return null;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          bottom: 16,
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
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.85)',
              backgroundColor: 'rgba(0,0,0,0.45)',
              padding: '3px 8px',
              borderRadius: 6,
              animation: 'pause-fade-in 0.3s ease-out',
            }}
          >
            PAUSED
          </span>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {screens.map((s, i) => {
            const isActive = i === activeIndex;
            const showPause = isActive && paused;
            return (
              <button
                key={s.id}
                onClick={() => onDotClick(i)}
                aria-label={
                  showPause
                    ? 'Resume rotation'
                    : isActive
                      ? 'Pause rotation (double-tap)'
                      : `Go to screen ${i + 1}${s.name ? `: ${s.name}` : ''}`
                }
                aria-current={isActive ? 'true' : undefined}
                style={{
                  width: 44,
                  height: 44,
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {showPause ? (
                  <span
                    style={{
                      display: 'flex',
                      gap: 2,
                      filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))',
                    }}
                  >
                    <span style={{ width: 3, height: 10, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.85)' }} />
                    <span style={{ width: 3, height: 10, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.85)' }} />
                  </span>
                ) : (
                  <span
                    style={{
                      width: 10,
                      height: 10,
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
      </div>

      {paused && (
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
