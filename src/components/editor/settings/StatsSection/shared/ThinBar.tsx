import type { SemanticColor } from './types';

/** Thin accent bar used for the cache entries fill and inside other places
 * where the hero rings would be overkill. */
export function ThinBar({ percent, color }: { percent: number; color: SemanticColor }) {
  const bg = color === 'success' ? 'bg-hs-success' : color === 'warning' ? 'bg-hs-warning' : 'bg-hs-danger';
  return (
    <div className="h-1.5 bg-hs-card rounded-full overflow-hidden border border-hs-border-strong">
      <div className={`h-full rounded-full ${bg} transition-all duration-500`}
           style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
    </div>
  );
}
