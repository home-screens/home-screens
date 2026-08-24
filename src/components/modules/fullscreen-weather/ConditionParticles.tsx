'use client';

import { useMemo } from 'react';

/**
 * Falling rain / snow, as transform-only CSS animations.
 *
 * These run on a Raspberry Pi in Chromium kiosk mode, so the budget is tight:
 * a fixed node count, no JS animation loop, and only `transform` animated so
 * every frame stays on the compositor. `animateConditions: false` skips the
 * layer entirely for slow hardware.
 */
export default function ConditionParticles({
  kind,
  height,
  seed = 1,
}: {
  kind: 'rain' | 'snow' | null;
  height: number;
  seed?: number;
}) {
  const particles = useMemo(() => {
    if (!kind) return [];
    // Deterministic scatter: a re-render on the fetch cadence must not
    // reshuffle every drop, which would read as a visual glitch.
    let s = seed * 9301 + 49297;
    const rand = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    const count = kind === 'rain' ? 46 : 34;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: rand() * 100,
      size: kind === 'rain' ? 40 + rand() * 70 : 3 + rand() * 5,
      drift: kind === 'rain' ? -40 - rand() * 50 : -70 + rand() * 140,
      duration: kind === 'rain' ? 0.75 + rand() * 0.5 : 7 + rand() * 7,
      delay: -rand() * (kind === 'rain' ? 2 : 12),
      opacity: kind === 'rain' ? 0.34 + rand() * 0.38 : 0.3 + rand() * 0.5,
    }));
  }, [kind, seed]);

  if (!kind) return null;
  const travel = Math.round(height + 80);

  return (
    <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes fsw-fall { to { transform: translate3d(var(--fsw-dx), ${travel}px, 0); } }
        @keyframes fsw-drift { to { transform: translate3d(var(--fsw-dx), ${travel}px, 0) rotate(360deg); } }
      `}</style>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: kind === 'rain' ? -60 : -30,
            left: `${p.left}%`,
            width: kind === 'rain' ? 2 : p.size,
            height: kind === 'rain' ? p.size : p.size,
            borderRadius: kind === 'rain' ? 2 : '50%',
            background: kind === 'rain'
              ? 'linear-gradient(180deg, transparent, var(--fsw-drop))'
              : 'var(--fsw-flake)',
            boxShadow: kind === 'snow' ? '0 0 0 1px var(--fsw-flake-ring)' : undefined,
            opacity: p.opacity,
            ['--fsw-dx' as string]: `${p.drift}px`,
            animation: `${kind === 'rain' ? 'fsw-fall' : 'fsw-drift'} ${p.duration}s linear ${p.delay}s infinite`,
            willChange: 'transform',
          }}
        />
      ))}
    </div>
  );
}
