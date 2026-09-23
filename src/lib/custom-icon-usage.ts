import { collectCustomIconIds, parseCustomIconValue, type CustomIconUsage } from './custom-icons';

/**
 * Where each of the household's own icons is being used, so the manage page
 * can badge an icon "in use" and a removal can say what it touches. Pure:
 * the caller reads the stores.
 *
 * Only a removal's confirmation depends on this. Nothing is rewritten when an
 * icon goes: every renderer falls back to its usual picture for an id it
 * cannot find, which it has to do anyway after a restore or a hand edit.
 */
export interface CustomIconUsageSources {
  meals?: { savedMeals?: { name?: unknown; emoji?: unknown }[] } | null;
  chores?: { chores?: { name?: unknown; emoji?: unknown }[] } | null;
  rewards?: { rewards?: { name?: unknown; emoji?: unknown }[] } | null;
  family?: { members?: { name?: unknown; emoji?: unknown }[] } | null;
  routines?: { routines?: { name?: unknown; icon?: unknown; steps?: { label?: unknown; icon?: unknown }[] }[] } | null;
  /** The whole screen configuration: any string in it may be an icon field. */
  config?: unknown;
}

function emptyUsage(): CustomIconUsage {
  return { meals: [], chores: [], rewards: [], people: [], routines: [], screens: 0 };
}

export function scanCustomIconUsage(sources: CustomIconUsageSources): Map<string, CustomIconUsage> {
  const usage = new Map<string, CustomIconUsage>();
  const entry = (id: string) => {
    let found = usage.get(id);
    if (!found) usage.set(id, (found = emptyUsage()));
    return found;
  };
  const note = (value: unknown, list: keyof Omit<CustomIconUsage, 'screens'>, name: unknown) => {
    const id = typeof value === 'string' ? parseCustomIconValue(value) : null;
    if (!id) return;
    const names = entry(id)[list];
    const label = typeof name === 'string' && name.trim() ? name.trim() : '?';
    if (!names.includes(label)) names.push(label);
  };

  for (const meal of sources.meals?.savedMeals ?? []) note(meal.emoji, 'meals', meal.name);
  for (const chore of sources.chores?.chores ?? []) note(chore.emoji, 'chores', chore.name);
  for (const reward of sources.rewards?.rewards ?? []) note(reward.emoji, 'rewards', reward.name);
  for (const member of sources.family?.members ?? []) note(member.emoji, 'people', member.name);
  for (const routine of sources.routines?.routines ?? []) {
    note(routine.icon, 'routines', routine.name);
    for (const step of routine.steps ?? []) note(step.icon, 'routines', routine.name);
  }
  if (sources.config !== undefined) {
    countScreenUses(sources.config, (id) => { entry(id).screens += 1; });
  }
  return usage;
}

/** Counts each string that is a custom icon value, one per field. */
function countScreenUses(value: unknown, onUse: (id: string) => void): void {
  if (typeof value === 'string') {
    const id = parseCustomIconValue(value);
    if (id) onUse(id);
  } else if (Array.isArray(value)) {
    for (const item of value) countScreenUses(item, onUse);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) countScreenUses(item, onUse);
  }
}

/**
 * Ids a set of stores points at that the icon library doesn't hold. A
 * restore reports these, so a family knows why some pictures turned back
 * into the usual ones.
 */
export function missingCustomIconIds(sources: readonly unknown[], knownIds: ReadonlySet<string>): string[] {
  const referenced = new Set<string>();
  for (const source of sources) collectCustomIconIds(source, referenced);
  return [...referenced].filter((id) => !knownIds.has(id));
}

export type CustomIconUseKind = 'meal' | 'chore' | 'reward' | 'person' | 'routine' | 'screen';

/** One line per place an icon is used, for a "Used by" list. Screen uses
 *  have no name of their own, so they come as a single counted row. */
export function customIconUseRows(usage: CustomIconUsage | undefined): { name: string; kind: CustomIconUseKind; count?: number }[] {
  if (!usage) return [];
  return [
    ...usage.meals.map((name) => ({ name, kind: 'meal' as const })),
    ...usage.chores.map((name) => ({ name, kind: 'chore' as const })),
    ...usage.rewards.map((name) => ({ name, kind: 'reward' as const })),
    ...usage.people.map((name) => ({ name, kind: 'person' as const })),
    ...usage.routines.map((name) => ({ name, kind: 'routine' as const })),
    ...(usage.screens ? [{ name: '', kind: 'screen' as const, count: usage.screens }] : []),
  ];
}

export function customIconUseCount(usage: CustomIconUsage | undefined): number {
  if (!usage) return 0;
  return usage.meals.length + usage.chores.length + usage.rewards.length
    + usage.people.length + usage.routines.length + usage.screens;
}
