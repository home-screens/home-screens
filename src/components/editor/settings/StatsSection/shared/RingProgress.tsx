import { colorVar } from './formatters';
import type { SemanticColor } from './types';

/** Radial percent ring — SVG, pure CSS transition on dashoffset. */
export function RingProgress({
  percent,
  size = 68,
  stroke = 8,
  color,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color: SemanticColor;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(percent, 0), 100);
  const dashoffset = c * (1 - clamped / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none"
                stroke="var(--hs-border-strong)" opacity={0.55} />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none"
                stroke={colorVar(color)} strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={dashoffset}
                style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.2, 0.8, 0.2, 1)' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
