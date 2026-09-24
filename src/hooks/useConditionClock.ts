'use client';

import { useMemo } from 'react';
import type { VisibilityCondition } from '@/types/config';
import { containsTimeCondition } from '@/lib/schedule';
import type { WallClock } from '@/lib/timezone';
import { useWallClock } from '@/hooks/useTZClock';

/**
 * A wall-clock reading for evaluating `time` conditions in the editor's
 * verdict chips. It ticks every 30s ONLY while the given tree actually
 * contains a `time` condition — trees without one never schedule a timer, so
 * the property panel keeps its old render cadence. `timezone` should be the
 * display's configured timezone so the editor's verdict matches what the
 * display will decide.
 */
export function useConditionClock(
  conditions: VisibilityCondition[],
  timezone: string | undefined,
): WallClock {
  const hasTime = useMemo(() => containsTimeCondition(conditions), [conditions]);
  return useWallClock(timezone, 30_000, hasTime);
}
