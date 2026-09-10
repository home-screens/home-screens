import { MEMBER_COLORS, type FamilyData, type FamilyMember } from '@/types/family';
import { FamilyMergeError } from './family-errors';
export { FamilyMergeError } from './family-errors';

export interface LegacyFamilyMember {
  id: string;
  name: string;
  color?: string;
  emoji?: string;
}
export interface LegacyCalendarPerson extends LegacyFamilyMember { sourceIds: string[] }
export interface FamilyMergeInput {
  existingFamily?: FamilyData;
  choreMembers?: LegacyFamilyMember[];
  calendarPeople?: LegacyCalendarPerson[];
  personSources?: Record<string, string[]>;
  now: string | Date;
}
export interface FamilyMergeDecision {
  kind: 'added' | 'identity' | 'name-match' | 'ambiguous-name' | 'blank-name' | 'color-repaired';
  source: 'chores' | 'calendar';
  sourceId: string;
  memberId: string;
}
export interface FamilyMergeResult {
  family: FamilyData;
  personSources: Record<string, string[]>;
  report: FamilyMergeDecision[];
}

const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const normalizeFamilyName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
export const validFamilyColor = (color: unknown): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
export const validFamilyId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200 && !['__proto__', 'prototype', 'constructor'].includes(id);

/** Preservation validator: authoring limits never invalidate an existing roster. */
export function validateFamilyData(value: unknown): value is FamilyData {
  if (!record(value) || !Array.isArray(value.members) || (value.migrated !== undefined && typeof value.migrated !== 'boolean')) return false;
  const ids = new Set<string>();
  for (const item of value.members) {
    if (!record(item) || !validFamilyId(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || !validFamilyColor(item.color)
      || (item.emoji !== undefined && typeof item.emoji !== 'string')
      || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))
      || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) return false;
    ids.add(item.id);
  }
  if (value.aliasIds !== undefined) {
    if (!record(value.aliasIds)) return false;
    for (const [alias, target] of Object.entries(value.aliasIds)) {
      if (!validFamilyId(alias) || typeof target !== 'string' || ids.has(alias) || !ids.has(target)) return false;
    }
  }
  return true;
}

function validateLegacy<T extends LegacyFamilyMember>(members: T[], calendar: boolean): T[] {
  if (!Array.isArray(members)) throw new FamilyMergeError('The legacy family list is invalid.');
  const seen = new Map<string, T>();
  for (const item of members) {
    if (!record(item) || !validFamilyId(item.id) || typeof item.name !== 'string'
      || (item.emoji !== undefined && typeof item.emoji !== 'string')
      || (calendar && (!Array.isArray(item.sourceIds) || item.sourceIds.some((s: unknown) => typeof s !== 'string')))) {
      throw new FamilyMergeError('A legacy family member is invalid.');
    }
    const prior = seen.get(item.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(item)) throw new FamilyMergeError(`Conflicting records use family id ${item.id}.`);
    seen.set(item.id, item);
  }
  return [...seen.values()];
}

export function planFamilyMerge(input: FamilyMergeInput): FamilyMergeResult {
  const existing = input.existingFamily ?? { members: [] };
  if (!validateFamilyData(existing)) throw new FamilyMergeError('The saved family roster is invalid.');
  const now = input.now instanceof Date ? input.now.toISOString() : input.now;
  if (!Number.isFinite(Date.parse(now))) throw new FamilyMergeError('Invalid migration timestamp.');
  const chores = validateLegacy(input.choreMembers ?? [], false);
  const calendar = validateLegacy(input.calendarPeople ?? [], true);
  const members = structuredClone(existing.members);
  const aliasIds: Record<string, string> = { ...existing.aliasIds };
  const personSources: Record<string, string[]> = {};
  const report: FamilyMergeDecision[] = [];
  const byId = new Map(members.map((m) => [m.id, m]));
  const choreById = new Map(chores.map((m) => [m.id, m]));
  const log = (kind: FamilyMergeDecision['kind'], source: 'chores' | 'calendar', sourceId: string, memberId = sourceId) => report.push({ kind, source, sourceId, memberId });
  const add = (item: LegacyFamilyMember, source: 'chores' | 'calendar') => {
    let name = item.name;
    if (!name.trim()) {
      const names = new Set([...members, ...chores, ...calendar].map((m) => normalizeFamilyName(m.name)));
      name = 'Someone';
      for (let n = 2; names.has(normalizeFamilyName(name)); n++) name = `Someone ${n}`;
      log('blank-name', source, item.id);
    }
    let color = item.color;
    if (!validFamilyColor(color)) { color = MEMBER_COLORS[members.length % MEMBER_COLORS.length]; log('color-repaired', source, item.id); }
    const member: FamilyMember = { id: item.id, name, color, ...(item.emoji !== undefined ? { emoji: item.emoji } : {}), createdAt: now, updatedAt: now };
    members.push(member); byId.set(member.id, member); log('added', source, item.id);
    return member;
  };
  for (const item of chores) {
    if (has(aliasIds, item.id)) throw new FamilyMergeError(`Chore id ${item.id} conflicts with a calendar alias.`);
    if (byId.has(item.id)) log('identity', 'chores', item.id); else add(item, 'chores');
  }
  for (const item of calendar) {
    const sameChore = choreById.get(item.id);
    if (sameChore && normalizeFamilyName(sameChore.name) !== normalizeFamilyName(item.name)) {
      throw new FamilyMergeError(`Calendar id ${item.id} belongs to a different chore member.`);
    }
    let member = byId.get(aliasIds[item.id] ?? item.id);
    if (member) log('identity', 'calendar', item.id, member.id);
    else {
      const matches = item.name.trim() ? members.filter((m) => normalizeFamilyName(m.name) === normalizeFamilyName(item.name)) : [];
      if (matches.length === 1) { member = matches[0]; aliasIds[item.id] = member.id; log('name-match', 'calendar', item.id, member.id); }
      else { if (matches.length > 1) log('ambiguous-name', 'calendar', item.id); member = add(item, 'calendar'); }
    }
    personSources[member.id] = [...new Set([...(personSources[member.id] ?? []), ...item.sourceIds])];
  }
  if (input.personSources !== undefined) {
    if (!record(input.personSources)) throw new FamilyMergeError('The calendar source mapping is invalid.');
    for (const [id, sources] of Object.entries(input.personSources)) {
      const target = aliasIds[id] ?? id;
      if (!byId.has(target) || !Array.isArray(sources) || sources.some((s) => typeof s !== 'string')) {
        throw new FamilyMergeError(`Calendar sources refer to an unknown or invalid member ${id}.`);
      }
      // Keep already-persisted mapping order, appending newly folded sources.
      personSources[target] = [...new Set([...sources, ...(personSources[target] ?? [])])];
    }
  }
  const family: FamilyData = { ...existing, members, aliasIds, migrated: true };
  if (!validateFamilyData(family)) throw new FamilyMergeError('The merged family identities conflict.');
  return { family, personSources, report };
}
