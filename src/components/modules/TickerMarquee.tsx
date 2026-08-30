import type { ReactNode } from 'react';

interface TickerMarqueeProps {
  children: ReactNode;
  /** Number of rendered items — used to calculate animation duration */
  itemCount: number;
  /** Seconds per item for the scroll duration */
  speed: number;
  /** Tailwind-compatible gap value in spacing units (default 6) */
  gap?: number;
  /** Freeze the scroll in place (touch-to-pause). */
  paused?: boolean;
}

/**
 * A reusable infinite-scrolling ticker marquee.
 * Renders children twice for seamless looping with CSS animation.
 */
export default function TickerMarquee({ children, itemCount, speed, gap = 6, paused = false }: TickerMarqueeProps) {
  const duration = Math.max(1, itemCount) * speed;
  const gapPx = gap * 4; // Tailwind spacing: 1 unit = 4px

  return (
    <div className="flex items-center h-full w-full overflow-hidden">
      <div
        className="flex w-max animate-ticker-scroll whitespace-nowrap"
        style={{ animationDuration: `${duration}s`, animationPlayState: paused ? 'paused' : 'running' }}
      >
        <div className="flex shrink-0" style={{ gap: `${gapPx}px`, paddingRight: `${gapPx}px` }}>
          {children}
        </div>
        <div className="flex shrink-0" style={{ gap: `${gapPx}px`, paddingRight: `${gapPx}px` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
