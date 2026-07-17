'use client';

import { useEffect, useMemo, useState } from 'react';
import type { VisibilityCondition } from '@/types/config';
import { containsTimeCondition } from '@/lib/schedule';
import { createTZDate } from '@/lib/timezone';

/**
 * A timezone-shifted `now` for evaluating `time` conditions in the editor's
 * verdict chips. It ticks every 30s ONLY while the given tree actually
 * contains a `time` condition — trees without one never schedule a timer, so
 * the property panel keeps its old render cadence. `timezone` should be the
 * display's configured timezone so the editor's verdict matches what the
 * display will decide.
 */
export function useConditionClock(
  conditions: VisibilityCondition[],
  timezone: string | undefined,
): Date {
  const hasTime = useMemo(() => containsTimeCondition(conditions), [conditions]);
  const [now, setNow] = useState(() => createTZDate(timezone));
  useEffect(() => {
    if (!hasTime) return;
    setNow(createTZDate(timezone));
    const id = setInterval(() => setNow(createTZDate(timezone)), 30_000);
    return () => clearInterval(id);
  }, [hasTime, timezone]);
  return now;
}
