import { FAMILY_FILE_PATH } from './constants';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ScreenConfiguration } from '@/types/config';
import { FAMILY_LIMITS, type FamilyData, type FamilyGroup, type FamilyMember, type FamilyResponse } from '@/types/family';
import { commitDataTransaction, getDataRoot, onDataTransactionCommit, readTransactionFile, withDataTransaction, type TransactionChange } from './data-transaction';
import { planFamilyMerge, validateFamilyData, validFamilyColor, validFamilyId, type LegacyCalendarPerson, type LegacyFamilyMember } from './family-merge';
import { migrateUp } from './migrations';
import { planConfigMigrationBackup } from './config-migration-backup';
import { FamilyError } from './family-errors';
import { MEMBER_REFERENCE_DOMAINS } from './member-references';
import { removeChoreGroups } from './member-references/chores';
import { pruneGroupMembers, sameGroupName } from './family-groups';
export { FamilyError } from './family-errors';

export { validateFamilyData } from './family-merge';
export { FAMILY_FILE_PATH };
const json = (value: unknown) => JSON.stringify(value, null, 2);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function familyValidationError(value: unknown): string | null {
  return validateFamilyData(value) ? null : 'Invalid family data: check member identities, names, colors, timestamps and aliases.';
}
export function familyRevision(data: FamilyData): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 24);
}
export function familyResponse(data: FamilyData): FamilyResponse {
  return { members: data.members, groups: data.groups ?? [], revision: familyRevision(data) };
}
function parseObject(raw: string | null, fallback: Record<string, unknown>, filename: string): Record<string, unknown> {
  if (raw === null) return fallback;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new FamilyError('family.dataInvalid', `${filename} is corrupt. Please restore or repair it before changing family data.`, { status: 409 }); }
  if (!isRecord(parsed)) throw new FamilyError('family.dataInvalid', `${filename} must contain an object.`, { status: 409 });
  return parsed;
}
/** The saved object, or null when the file holds something else entirely. */
function readableObject(raw: string): Record<string, unknown> | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  return isRecord(parsed) ? parsed : null;
}
async function readRawFamily(): Promise<FamilyData> {
  const value = parseObject(await readTransactionFile(FAMILY_FILE_PATH), { members: [] }, 'family.json');
  if (!validateFamilyData(value)) throw new FamilyError('family.dataInvalid', familyValidationError(value)!, { status: 409 });
  return value;
}

// Multiple participating reads in one locked Promise.all share the same fold.
// This map is entered only AFTER acquiring the global coordinator.
const migrationKey = Symbol.for('home-screens.family-migration.in-flight');
const globals = globalThis as typeof globalThis & { [migrationKey]?: Map<string, Promise<void>> };
const migrations = globals[migrationKey] ??= new Map<string, Promise<void>>();
const settledKey = Symbol.for('home-screens.family-migration.settled');
const settledGlobals = globalThis as typeof globalThis & { [settledKey]?: Map<string, string> };
const settledSources = settledGlobals[settledKey] ??= new Map<string, string>();
const failureKey = Symbol.for('home-screens.family-migration.failures');
interface MigrationFailure { retryAt: number; message: string; sources: string }
const failureGlobals = globalThis as typeof globalThis & { [failureKey]?: Map<string, MigrationFailure> };
const migrationFailures = failureGlobals[failureKey] ??= new Map<string, MigrationFailure>();
// Explicit restore/import commits can repair a failed source. Let their next
// read proceed immediately, while ordinary polls avoid retrying corrupt input.
onDataTransactionCommit(() => { const root = getDataRoot(); migrationFailures.delete(root); settledSources.delete(root); });

/** Metadata catches atomic replacements and in-place edits by other processes. */
async function sourceSignature(root: string): Promise<string> {
  return (await Promise.all([FAMILY_FILE_PATH, 'data/chores.json', 'data/config.json'].map(async (file) => {
    try {
      const stat = await fs.stat(path.join(root, file), { bigint: true });
      return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
      throw error;
    }
  }))).join('|');
}
export async function settleFamilyMigration(): Promise<void> {
  return withDataTransaction(async () => {
    // The coordinator always recovers a pending journal before this fast path.
    const root = getDataRoot();
    const prior = migrations.get(root);
    if (prior) return prior;
    const run = (async () => {
      const sources = await sourceSignature(root);
      const failure = migrationFailures.get(root);
      if (failure?.sources === sources && Date.now() < failure.retryAt) throw new FamilyError('family.dataWaiting', `Home Screens could not read one of its saved files: ${failure.message} Try again in a minute, or restore a backup.`, { status: 503 });
      if (settledSources.get(root) === sources) return;
      try {
        await runMigration();
        migrationFailures.delete(root);
        // Do not latch an image that changed while it was read. A migration's
        // own writes also defer caching until the next stable validation.
        if (sources === await sourceSignature(root)) settledSources.set(root, sources);
      } catch (error) {
        migrationFailures.set(root, { sources, retryAt: Date.now() + 60_000, message: error instanceof Error ? error.message : 'The saved family sources could not be read.' });
        throw error;
      }
    })();
    migrations.set(root, run);
    try { await run; } finally { if (migrations.get(root) === run) migrations.delete(root); }
  });
}
async function runMigration(): Promise<void> {
  const [familyRaw, choreRaw, configRaw] = await Promise.all([
    readTransactionFile(FAMILY_FILE_PATH), readTransactionFile('data/chores.json'), readTransactionFile('data/config.json'),
  ]);
  const family = parseObject(familyRaw, { members: [] }, 'family.json');
  if (!validateFamilyData(family)) throw new FamilyError('family.dataInvalid', familyValidationError(family)!, { status: 409 });
  const chores = parseObject(choreRaw, { chores: [] }, 'chores.json');
  if (!Array.isArray(chores.chores) || (chores.members !== undefined && !Array.isArray(chores.members))) throw new FamilyError('family.dataInvalid', 'The saved chore data is invalid.', { status: 409 });
  const config = parseObject(configRaw, {}, 'config.json');
  if (configRaw !== null && (!isRecord(config.settings) || !Array.isArray(config.screens))) throw new FamilyError('family.dataInvalid', 'The saved configuration is invalid.', { status: 409 });
  const settings = (config.settings ?? {}) as Record<string, unknown>;
  if (settings.calendar !== undefined && !isRecord(settings.calendar)) throw new FamilyError('family.dataInvalid', 'The saved calendar settings are invalid.', { status: 409 });
  const calendar = (settings.calendar ?? {}) as Record<string, unknown>;
  const hasLegacyPeople = Object.prototype.hasOwnProperty.call(calendar, 'people');
  if (family.migrated && !Object.prototype.hasOwnProperty.call(chores, 'members') && !hasLegacyPeople) return;
  if (hasLegacyPeople && !Array.isArray(calendar.people)) throw new FamilyError('family.dataInvalid', 'The saved calendar people are invalid.', { status: 409 });
  const planned = planFamilyMerge({
    existingFamily: family, choreMembers: chores.members as LegacyFamilyMember[] | undefined,
    calendarPeople: calendar.people as LegacyCalendarPerson[] | undefined,
    personSources: calendar.personSources as Record<string, string[]> | undefined, now: new Date(),
  });
  const choreAfter = { ...chores }; delete choreAfter.members;
  let configAfter = config;
  if (configRaw !== null) {
    configAfter = migrateUp(config as unknown as ScreenConfiguration).config as unknown as Record<string, unknown>;
    const afterSettings = configAfter.settings as Record<string, unknown>;
    // Always preserve feature settings and saved ownership when a legacy fold re-enters.
    if (afterSettings.calendar !== undefined || hasLegacyPeople || Object.keys(planned.personSources).length) {
      const savedCalendar = afterSettings.calendar as Record<string, unknown> | undefined;
      const needsMappings = savedCalendar?.personSources !== undefined || Object.keys(planned.personSources).length > 0;
      const afterCalendar = { ...savedCalendar, ...(needsMappings ? { personSources: planned.personSources } : {}) };
      delete (afterCalendar as Record<string, unknown>).people;
      configAfter = { ...configAfter, settings: { ...afterSettings, calendar: afterCalendar } };
    }
  }
  const familyAfter = json(planned.family);
  const intermediate = json({ ...planned.family, migrated: false });
  const configChanged = configRaw !== null && configRaw !== json(configAfter);
  const configBackup = configChanged ? planConfigMigrationBackup(configRaw) : undefined;
  const changes: TransactionChange[] = [
    ...(configBackup ? [configBackup] : []),
    { path: FAMILY_FILE_PATH, before: familyRaw, after: familyAfter },
  ];
  if (configChanged) changes.push({ path: 'data/config.json', before: configRaw, after: json(configAfter) });
  if (choreRaw !== null && choreRaw !== json(choreAfter)) changes.push({ path: 'data/chores.json', before: choreRaw, after: json(choreAfter) });
  const transactionId = randomUUID();
  const hasRecords = (chores.members as unknown[] | undefined)?.length || (calendar.people as unknown[] | undefined)?.length;
  const evidence = hasRecords ? {
    path: await readTransactionFile('data/family-migration.json') === null ? 'data/family-migration.json' : `data/family-migrations/${transactionId}.json`,
    contents: json({ transactionId, createdAt: new Date().toISOString(), sources: { family: familyRaw, chores: choreRaw, config: configRaw }, existingFamily: family, personSources: calendar.personSources ?? {}, result: planned }),
  } : undefined;
  await commitDataTransaction({
    kind: 'family-migration', changes, evidence,
    steps: [
      ...(configBackup ? [{ path: configBackup.path, contents: configBackup.after }] : []),
      { path: FAMILY_FILE_PATH, contents: intermediate },
      ...changes.filter((change) => change.path !== FAMILY_FILE_PATH && change !== configBackup).map((change) => ({ path: change.path, contents: change.after })),
      { path: FAMILY_FILE_PATH, contents: familyAfter },
    ],
  });
}

export function readFamilyData(): Promise<FamilyData> {
  return withDataTransaction(async () => { await settleFamilyMigration(); return readRawFamily(); });
}
/** Low-level modern-restore writer; normal authoring goes through revision checks. */
export function writeFamilyData(data: FamilyData): Promise<void> {
  return withDataTransaction(async () => {
    if (!validateFamilyData(data)) throw new FamilyError('family.dataInvalid', familyValidationError(data)!);
    await commitDataTransaction({ kind: 'family-restore', changes: [{ path: FAMILY_FILE_PATH, before: await readTransactionFile(FAMILY_FILE_PATH), after: json(data) }] });
  });
}

export interface FamilyMemberInput {
  id?: string;
  name: string;
  color: string;
  emoji?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface ReplaceFamilyInput { members: FamilyMemberInput[]; revision: string; removedIds: string[] }
export async function replaceFamilyMembers(input: ReplaceFamilyInput): Promise<FamilyResponse> {
  return withDataTransaction(async () => {
    await settleFamilyMigration();
    const current = await readRawFamily();
    const snapshot = familyResponse(current);
    if (!input || typeof input.revision !== 'string' || !input.revision) throw new FamilyError('family.badRequest', 'Refresh the family list before saving. A revision is required.');
    if (input.revision !== snapshot.revision) throw new FamilyError('family.revision', 'Someone changed the family list. Refresh and apply your changes again.', { status: 409, current: snapshot });
    if (!Array.isArray(input.members) || !Array.isArray(input.removedIds) || input.removedIds.some((id) => !validFamilyId(id))
      || new Set(input.removedIds).size !== input.removedIds.length) throw new FamilyError('family.badRequest', 'Include the updated member list and the people being removed.');
    const byId = new Map(current.members.map((member) => [member.id, member]));
    const incomingIds = new Set<string>();
    const now = new Date().toISOString();
    let added = 0;
    const members: FamilyMember[] = input.members.map((item) => {
      if (!isRecord(item) || (item.id !== undefined && (!validFamilyId(item.id) || incomingIds.has(item.id)))
        || typeof item.name !== 'string' || !item.name.trim() || !validFamilyColor(item.color)
        || (item.emoji !== undefined && (typeof item.emoji !== 'string' || item.emoji.length > 32))) throw new FamilyError('family.badRequest', 'Each family member needs a unique identity, name and color.');
      if (item.id) incomingIds.add(item.id);
      const existing = item.id ? byId.get(item.id) : undefined;
      if (item.name.length > FAMILY_LIMITS.maxNameLength && item.name !== existing?.name) throw new FamilyError('family.nameTooLong', `Names can have up to ${FAMILY_LIMITS.maxNameLength} characters.`, { params: { max: FAMILY_LIMITS.maxNameLength } });
      if (existing && ((item.createdAt !== undefined && item.createdAt !== existing.createdAt) || (item.updatedAt !== undefined && item.updatedAt !== existing.updatedAt))) throw new FamilyError('family.badRequest', 'Member timestamps cannot be changed.');
      const name = item.name === existing?.name ? item.name : item.name.trim();
      if (!existing) { added++; return { id: randomUUID(), name, color: item.color, ...(item.emoji !== undefined ? { emoji: item.emoji } : {}), createdAt: now, updatedAt: now }; }
      const changed = name !== existing.name || item.color !== existing.color || item.emoji !== existing.emoji;
      return { ...existing, name, color: item.color, emoji: item.emoji, updatedAt: changed ? now : existing.updatedAt };
    });
    if (added > 0 && members.length > FAMILY_LIMITS.maxMembers) throw new FamilyError('family.tooManyMembers', `You can add people when the family has fewer than ${FAMILY_LIMITS.maxMembers} members.`, { params: { max: FAMILY_LIMITS.maxMembers } });
    const removed = current.members.filter((member) => !incomingIds.has(member.id)).map((member) => member.id);
    if (removed.length !== input.removedIds.length || removed.some((id) => !input.removedIds.includes(id))) throw new FamilyError('family.badRequest', 'Confirm exactly which people should be removed before saving.');
    const removedSet = new Set(removed);
    const aliases = Object.fromEntries(Object.entries(current.aliasIds ?? {}).filter(([, target]) => !removedSet.has(target)));
    const family: FamilyData = { ...current, members, aliasIds: aliases, migrated: true };
    if (current.groups !== undefined) family.groups = pruneGroupMembers(current.groups, removedSet);
    const changes: TransactionChange[] = [{ path: FAMILY_FILE_PATH, before: await readTransactionFile(FAMILY_FILE_PATH), after: json(family) }];
    if (removed.length) await planDeletion(removedSet, changes);
    await commitDataTransaction({ kind: removed.length ? 'family-deletion' : 'family-update', changes });
    return familyResponse(family);
  });
}

export interface FamilyGroupInput {
  id?: string;
  name: string;
  memberIds: string[];
}
export interface ReplaceGroupsInput { groups: FamilyGroupInput[]; revision: string }
/**
 * Replace the whole group list against a revision, the same way the member
 * list is saved. Names are trimmed, unknown members are refused rather than
 * dropped (a stale phone must not silently shrink a group), and timestamps
 * move only when a group actually changed. A group that is gone comes off
 * the chores that named it in the same commit, so no chore is ever left
 * pointing at a group that does not exist.
 */
export async function replaceFamilyGroups(input: ReplaceGroupsInput): Promise<FamilyResponse> {
  return withDataTransaction(async () => {
    await settleFamilyMigration();
    const current = await readRawFamily();
    const snapshot = familyResponse(current);
    if (!input || typeof input.revision !== 'string' || !input.revision) throw new FamilyError('family.badRequest', 'Refresh the family list before saving. A revision is required.');
    if (input.revision !== snapshot.revision) throw new FamilyError('family.revision', 'Someone changed the family list. Refresh and apply your changes again.', { status: 409, current: snapshot });
    if (!Array.isArray(input.groups)) throw new FamilyError('family.badRequest', 'Include the updated group list.');
    if (input.groups.length > FAMILY_LIMITS.maxGroups) throw new FamilyError('family.tooManyGroups', `You can have up to ${FAMILY_LIMITS.maxGroups} groups.`, { params: { max: FAMILY_LIMITS.maxGroups } });
    const memberIds = new Set(current.members.map((member) => member.id));
    const byId = new Map((current.groups ?? []).map((group) => [group.id, group]));
    const incomingIds = new Set<string>();
    const now = new Date().toISOString();
    const groups: FamilyGroup[] = input.groups.map((item) => {
      if (!isRecord(item) || (item.id !== undefined && (!validFamilyId(item.id) || incomingIds.has(item.id)))
        || typeof item.name !== 'string' || !item.name.trim() || !Array.isArray(item.memberIds)
        || item.memberIds.some((id) => typeof id !== 'string')) throw new FamilyError('family.badRequest', 'Each group needs a unique identity, a name and a list of people.');
      if (item.name.trim().length > FAMILY_LIMITS.maxGroupNameLength) throw new FamilyError('family.groupNameTooLong', `Group names can have up to ${FAMILY_LIMITS.maxGroupNameLength} characters.`, { params: { max: FAMILY_LIMITS.maxGroupNameLength } });
      const unknown = item.memberIds.find((id) => !memberIds.has(id));
      if (unknown !== undefined) throw new FamilyError('family.groupMemberRemoved', 'A group names someone who is not on the family list. Refresh and try again.', { status: 409, current: snapshot });
      if (item.id) incomingIds.add(item.id);
      const name = item.name.trim();
      // Family order, deduplicated, so a group reads the same everywhere.
      const ordered = current.members.filter((member) => item.memberIds.includes(member.id)).map((member) => member.id);
      const existing = item.id ? byId.get(item.id) : undefined;
      if (!existing) return { id: randomUUID(), name, memberIds: ordered, createdAt: now, updatedAt: now };
      const changed = name !== existing.name || ordered.join('\n') !== existing.memberIds.join('\n');
      return { ...existing, name, memberIds: ordered, updatedAt: changed ? now : existing.updatedAt };
    });
    // A group is picked by name, so two that read the same cannot be told apart.
    const repeated = groups.find((group, index) => groups.some((other, at) => at < index && sameGroupName(other.name, group.name)));
    if (repeated) throw new FamilyError('family.groupNameTaken', `You already have a group called ${repeated.name}.`, { params: { name: repeated.name } });
    const family: FamilyData = { ...current, groups, migrated: true };
    const changes: TransactionChange[] = [{ path: FAMILY_FILE_PATH, before: await readTransactionFile(FAMILY_FILE_PATH), after: json(family) }];
    const kept = new Set(groups.map((group) => group.id));
    const removed = new Set([...byId.keys()].filter((id) => !kept.has(id)));
    const choreRaw = removed.size > 0 ? await readTransactionFile('data/chores.json') : null;
    if (choreRaw !== null) {
      const before = parseObject(choreRaw, {}, 'chores.json');
      const next = removeChoreGroups(before, removed);
      if (next !== before) changes.push({ path: 'data/chores.json', before: choreRaw, after: json(next) });
    }
    await commitDataTransaction({ kind: 'family-groups', changes });
    return familyResponse(family);
  });
}

/**
 * Compute every dependent after-image before publishing any of the deletion.
 * What a removal means for each file is that file's own rule, declared in
 * `member-references`; this walk only reads, hands over and collects.
 */
async function planDeletion(removed: Set<string>, changes: TransactionChange[]) {
  for (const domain of MEMBER_REFERENCE_DOMAINS) {
    const raw = await readTransactionFile(domain.path);
    if (raw === null) continue;
    const filename = domain.path.slice('data/'.length);
    // A store nothing but its own page reads must not stop somebody being
    // removed when it cannot be read: it is skipped instead of refusing the save.
    const before = domain.unreadable === 'skip' ? readableObject(raw) : parseObject(raw, {}, filename);
    if (before === null) continue;
    const next = domain.removeMembers(before, removed);
    // The same object back means the domain had nothing to say about this
    // file, and a file it did not touch is not rewritten in its own style.
    if (next !== before && json(next) !== raw) changes.push({ path: domain.path, before: raw, after: json(next) });
  }
}
