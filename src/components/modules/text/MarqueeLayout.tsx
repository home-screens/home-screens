import type { ReactNode } from 'react';
import type { ModuleStyle } from '@/types/config';
import ModuleWrapper from '../ModuleWrapper';

interface MarqueeLayoutProps {
  style: ModuleStyle;
  /** Pre-joined keyframe rules for this instance. */
  css: string;
  /** Remounts the scroller on rotation so the animation restarts. */
  rotationIndex: number;
  direction: 'left' | 'right' | 'up' | 'down';
  speed: number;
  children: ReactNode;
}

/** Scrolling-text layout. Horizontal directions scroll a nowrap row; vertical
 *  directions scroll a column. */
export default function MarqueeLayout({ style, css, rotationIndex, direction, speed, children }: MarqueeLayoutProps) {
  const isH = direction === 'left' || direction === 'right';
  const animName = `_marquee${direction.charAt(0).toUpperCase() + direction.slice(1)}`;

  return (
    <ModuleWrapper style={style}>
      <style>{css}</style>
      <div className="h-full w-full overflow-hidden flex items-center">
        <div
          key={rotationIndex}
          style={{
            display: 'flex',
            flexDirection: isH ? 'row' : 'column',
            alignItems: 'center',
            gap: '0.4em',
            whiteSpace: isH ? 'nowrap' : undefined,
            animation: `${animName} ${speed}s linear infinite`,
          }}
        >
          {children}
        </div>
      </div>
    </ModuleWrapper>
  );
}
