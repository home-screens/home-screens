'use client';

import { useMemo, useRef } from 'react';

/**
 * True once any of `values` differs from what it was on the first render.
 *
 * The phone forms (member, chore, reward, meal, routine) each keep their
 * fields in local state seeded from the record being edited, so "dirty" is
 * simply "does the current field set still serialize to what it started as".
 * A JSON snapshot is enough: every field is a string, number, boolean, array,
 * or plain object, and the comparison only has to be right, not fast.
 *
 * Pass the same values in the same order on every render.
 */
export function useFormDirty(values: unknown[]): boolean {
  const serialized = JSON.stringify(values);
  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) initialRef.current = serialized;
  const initial = initialRef.current;
  return useMemo(() => serialized !== initial, [serialized, initial]);
}
