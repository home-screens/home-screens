import type { SemanticColor } from './types';

/** Pulsing dot — uses Tailwind's built-in animate-ping and automatically
 * disables itself under prefers-reduced-motion via motion-reduce variant. */
export function PulseDot({ color = 'success' }: { color?: SemanticColor }) {
  const bg = color === 'success' ? 'bg-hs-success' : color === 'warning' ? 'bg-hs-warning' : 'bg-hs-danger';
  return (
    <span className="relative inline-flex w-2 h-2">
      <span className={`absolute inset-0 rounded-full ${bg} opacity-60 animate-ping motion-reduce:animate-none`} />
      <span className={`relative rounded-full w-2 h-2 ${bg}`} />
    </span>
  );
}
