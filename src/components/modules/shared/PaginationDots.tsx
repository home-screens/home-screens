import { ink } from '@/lib/constants';

/**
 * Which page of a card's list is showing: a dot per page, or "3 / 12" past
 * `threshold` pages. In the card's ink, so the dots read on a light card too.
 */
export function PaginationDots({ total, current, threshold = 10 }: { total: number; current: number; threshold?: number }) {
  if (total <= 1) return null;

  if (total <= threshold) {
    return (
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full transition-colors"
            style={{ backgroundColor: ink(i === current ? 0.8 : 0.2) }}
          />
        ))}
      </div>
    );
  }

  return (
    <span className="tabular-nums" style={{ fontSize: '0.6em', color: ink(0.3) }}>
      {current + 1} / {total}
    </span>
  );
}
