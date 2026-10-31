'use client';

import { useEffect, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
// Types only: `mealie.ts` is the hub's client and holds the secrets.
import type { MealieValidation } from '@/lib/mealie';

/**
 * What the hub said when asked to talk to Mealie: the Test button's answer,
 * plus `network` for when the hub itself could not be asked.
 */
export type MealieCheck = MealieValidation | { ok: false; failure: 'network'; version?: undefined };

/** Ask the hub whether the saved Mealie address and token work (`GET /api/mealie/validate`). */
export async function checkMealie(): Promise<MealieCheck> {
  try {
    const res = await editorFetch('/api/mealie/validate');
    const json = (await res.json().catch(() => null)) as MealieValidation | null;
    if (!res.ok || !json || typeof json.ok !== 'boolean') return { ok: false, failure: 'network' };
    return json;
  } catch {
    return { ok: false, failure: 'network' };
  }
}

/**
 * The hub's answer about Mealie, asked once while `enabled` (and again when
 * `enabled` turns on): `undefined` while asking or when not asked.
 */
export function useMealieCheck(enabled: boolean): MealieCheck | undefined {
  const [check, setCheck] = useState<MealieCheck | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    checkMealie().then((result) => {
      if (!cancelled) setCheck(result);
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return enabled ? check : undefined;
}

/**
 * The name of the Mealie household whose plan shows, for the labels that say
 * so ("Family household"). Asked once while `enabled`; `undefined` while
 * asking, null when Mealie did not answer.
 */
export function useMealieHousehold(enabled: boolean): string | null | undefined {
  const check = useMealieCheck(enabled);
  if (!enabled) return null;
  return check ? (check.ok ? check.household : null) : undefined;
}
