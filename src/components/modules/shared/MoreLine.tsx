import type { CSSProperties } from 'react';
import { ink } from '@/lib/constants';

/**
 * "and N more" under a list that was capped or did not fit (see
 * useFitCount). Nothing when nothing is left out. The caller brings the
 * words in its own dictionary and the size its list is set in.
 */
export function MoreLine({ n, label, testId, className, style }: {
  n: number;
  label: string;
  testId: string;
  className?: string;
  style?: CSSProperties;
}) {
  if (n <= 0) return null;
  return (
    <div data-testid={testId} className={className} style={{ color: ink(0.5), ...style }}>
      {label}
    </div>
  );
}
