/**
 * Migration 023: conditions with no key picked are taken out of card and
 * screen visibility.
 *
 * Pressing "Add condition" saved a row with an empty key at once, and the
 * display read an empty key as a value not reported yet, so the card (or the
 * whole screen, through "Leave the screen out") went off the wall until a key
 * was chosen, and stayed off if nobody came back to it. The display now skips
 * such a row (`completeConditions` in schedule.ts). A row saved before that
 * is removed here, with any and/or/not group it leaves empty, so a stored
 * config means the same thing as the display now reads it: whatever an
 * unfinished condition was hiding comes back.
 *
 * Only module and screen visibility change. A display rule or a text look
 * with such a row still never fires, as before, so they are left alone.
 *
 * The pruning is a copy frozen here rather than the live rule, so a later
 * change to the display's rule cannot rewrite what this step did.
 */

import type { ModuleInstance, Screen, ScreenConfiguration } from '@/types/config';
import { mapConfigScreens } from '@/lib/config-modules';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The list without unpicked rows and emptied groups, or the list itself when nothing went. */
function pruned(conditions: unknown[]): unknown[] {
  let changed = false;
  const out: unknown[] = [];
  for (const c of conditions) {
    if (!isRecord(c)) {
      out.push(c);
      continue;
    }
    if ((c.kind === 'and' || c.kind === 'or' || c.kind === 'not') && Array.isArray(c.conditions)) {
      const inner = pruned(c.conditions);
      if (inner.length === 0) {
        changed = true;
        continue;
      }
      if (inner !== c.conditions) changed = true;
      out.push(inner === c.conditions ? c : { ...c, conditions: inner });
    } else if ((c.kind === 'state' || c.kind === 'numeric') && c.sourceKey === '') {
      changed = true;
    } else {
      out.push(c);
    }
  }
  return changed ? out : conditions;
}

/** `holder` with its visibility pruned, or `holder` itself when there was nothing to take out. */
function withPrunedVisibility<T extends ModuleInstance | Screen>(holder: T): T {
  if (!isRecord(holder) || !isRecord(holder.visibility) || !Array.isArray(holder.visibility.conditions)) return holder;
  const conditions = pruned(holder.visibility.conditions);
  if (conditions === holder.visibility.conditions) return holder;
  return { ...holder, visibility: { ...holder.visibility, conditions } } as T;
}

export const v22ToV23 = {
  version: 23,
  description: 'Card and screen conditions with no key picked are removed',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({
    ...config,
    ...mapConfigScreens(config, (screen) => {
      if (!isRecord(screen)) return screen;
      const own = withPrunedVisibility(screen);
      if (!Array.isArray(own.modules)) return own;
      let changed = false;
      const modules = own.modules.map((mod) => {
        const next = withPrunedVisibility(mod);
        if (next !== mod) changed = true;
        return next;
      });
      return changed ? { ...own, modules } : own;
    }),
    version: 23,
  }),
};
