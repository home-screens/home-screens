import { DEFAULT_MEAL_EMOJI } from './meal-constants';
import { DEFAULT_CHORE_ICON, DEFAULT_REWARD_ICON } from './chore-constants';

/**
 * What removing one of the household's pictures does to the things using it.
 * Pure: `deleteCustomIcon` applies it to each store inside the removal's
 * transaction.
 *
 * Every reference goes back to its kind's standard picture, so nothing is
 * left pointing at an icon that no longer exists: no blank chore badge, no
 * empty editor field, and no restore later blaming a backup for an icon that
 * was removed on purpose. A meal gets the plate it shows with no emoji, a
 * chore or reward the icon a new one starts with, a routine the stopwatch
 * the timer views already fall back to. A person's icon and a screen's icon
 * field are optional, so they are simply cleared: the person shows their
 * initial again, and a rule or Text prefix shows nothing.
 */

export const TIMER_FALLBACK_ICON = '⏱️';

/** The stores an icon field can live in, with what replaces a removed icon
 *  there (`undefined` drops the field). */
export const ICON_REFERENCE_STORES: ReadonlyArray<{ path: string; replacement: string | undefined }> = [
  { path: 'data/meals.json', replacement: DEFAULT_MEAL_EMOJI },
  { path: 'data/chores.json', replacement: DEFAULT_CHORE_ICON },
  { path: 'data/rewards.json', replacement: DEFAULT_REWARD_ICON },
  { path: 'data/routines.json', replacement: TIMER_FALLBACK_ICON },
  { path: 'data/family.json', replacement: undefined },
  { path: 'data/config.json', replacement: undefined },
];

/**
 * A copy of `doc` with every string exactly equal to `value` replaced (or,
 * with no replacement, dropped from its object or array). Returns the same
 * reference when nothing matched, so callers can skip the write.
 */
export function replaceIconReferences<T>(doc: T, value: string, replacement: string | undefined): T {
  return walk(doc) as T;

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) {
      let changed = false;
      const out: unknown[] = [];
      for (const item of node) {
        if (item === value) {
          changed = true;
          if (replacement !== undefined) out.push(replacement);
          continue;
        }
        const next = walk(item);
        if (next !== item) changed = true;
        out.push(next);
      }
      return changed ? out : node;
    }
    if (node && typeof node === 'object') {
      let changed = false;
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(node)) {
        if (item === value) {
          changed = true;
          if (replacement !== undefined) out[key] = replacement;
          continue;
        }
        const next = walk(item);
        if (next !== item) changed = true;
        out[key] = next;
      }
      return changed ? out : node;
    }
    return node;
  }
}
