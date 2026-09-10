import { randomUUID } from 'node:crypto';
import type { ScreenConfiguration, ChoreDefinition } from '@/types/config';
import type { FamilyData } from '@/types/family';
import type { TodoData } from '@/types/todos';
import { planFamilyMerge, validFamilyId, type LegacyFamilyMember } from './family-merge';
import { readConfig } from './config';
import { foldConfigTodos, validateTodoData } from './todo-data';
import { migrateUp } from './migrations';
import { planConfigMigrationBackup } from './config-migration-backup';
import { FamilyError } from './family-errors';
import { commitDataTransaction, readTransactionFile, type TransactionChange } from './data-transaction';

export interface FamilyRestoreContent {
  config?: ScreenConfiguration;
  family?: FamilyData;
  chores?: { chores: ChoreDefinition[]; members?: LegacyFamilyMember[] };
  choreCompletions?: unknown;
  meals?: unknown;
  rewards?: unknown;
  routines?: unknown;
  todos?: TodoData;
}
const json = (value: unknown) => JSON.stringify(value, null, 2);
const hasLegacy = (config: ScreenConfiguration) => config.screens?.some((screen) => screen.modules?.some((mod) => mod.type === 'todo' && Array.isArray((mod.config as { items?: unknown }).items)))
  || config.displays?.some((display) => display.screens?.some((screen) => screen.modules?.some((mod) => mod.type === 'todo' && Array.isArray((mod.config as { items?: unknown }).items))));

/** Build every content image before touching disk. Caller holds the coordinator. */
export async function planFamilyRestore(body: FamilyRestoreContent): Promise<{ changes: TransactionChange[]; config: ScreenConfiguration; evidence?: { path: string; contents: string } }> {
  const [familyBefore, configBefore, choresBefore] = await Promise.all([
    readTransactionFile('data/family.json'), readTransactionFile('data/config.json'), readTransactionFile('data/chores.json'),
  ]);
  // A supplied modern section replaces its file even if that old file is
  // corrupt. Never read/migrate a replaced input before planning the restore.
  const currentFamily = body.family === undefined ? parseSavedObject(familyBefore, { members: [] }, 'family.json') : undefined;
  const family = body.family ?? currentFamily as unknown as FamilyData;
  const config = body.config ?? (configBefore === null ? await readConfig() : parseSavedObject(configBefore, {}, 'config.json') as unknown as ScreenConfiguration);
  const sourceConfig = json(config);
  const sourceConfigRaw = body.config ? sourceConfig : configBefore;
  if (!isRecord(config.settings) || !Array.isArray(config.screens)) throw new Error('The restored configuration needs settings and screens.');
  if (config.settings.calendar !== undefined && !isRecord(config.settings.calendar)) throw new Error('The restored calendar settings are invalid.');
  const chores = body.chores ?? parseSavedObject(choresBefore, { chores: [] }, 'chores.json') as unknown as NonNullable<FamilyRestoreContent['chores']>;
  if (!Array.isArray(chores.chores)) throw new Error('The restored chore data needs a chores array.');
  let personSources = config.settings.calendar?.personSources;
  let replacedConfigWarning: string | undefined;
  // A legacy config has only people[].sourceIds. Fold that old ownership
  // into the live mappings rather than erasing calendars assigned since it
  // was backed up. A modern full-family backup retains replacement semantics.
  if (body.config && body.family === undefined && config.settings.calendar?.people !== undefined && configBefore !== null) {
    let oldSources: Record<string, string[]> | undefined;
    try {
      const previous = parseSavedObject(configBefore, {}, 'config.json');
      if (!isRecord(previous.settings)) throw new Error('The saved configuration needs settings.');
      const oldCalendar = previous.settings.calendar;
      if (oldCalendar !== undefined && !isRecord(oldCalendar)) throw new Error('The saved calendar settings are invalid.');
      const savedSources = isRecord(oldCalendar) ? oldCalendar.personSources : undefined;
      if (savedSources !== undefined) {
        // Validate the old mapping separately: a valid incoming configuration
        // can repair a broken file without adopting its unrecoverable ownership.
        planFamilyMerge({ existingFamily: family, choreMembers: chores.members, calendarPeople: config.settings.calendar?.people, personSources: savedSources as Record<string, string[]>, now: new Date() });
        oldSources = savedSources as Record<string, string[]>;
      }
    } catch (error) {
      replacedConfigWarning = error instanceof Error ? error.message : 'The old calendar ownership could not be recovered.';
    }
    if (oldSources) {
      if (personSources !== undefined && !isRecord(personSources)) throw new Error('The restored calendar source mapping is invalid.');
      const combined: Record<string, string[]> = {};
      for (const mapping of [oldSources, personSources ?? {}]) for (const [id, sources] of Object.entries(mapping)) {
        if (!Array.isArray(sources) || sources.some((source) => typeof source !== 'string')) throw new Error('The calendar source mapping is invalid.');
        combined[id] = [...new Set([...(combined[id] ?? []), ...sources])];
      }
      personSources = combined;
    }
  }
  const merged = planFamilyMerge({
    existingFamily: family,
    choreMembers: chores.members,
    calendarPeople: config.settings.calendar?.people,
    personSources,
    now: new Date(),
  });
  let nextConfig = migrateUp(config).config;
  if (nextConfig.settings.calendar) {
    const { people: _people, ...calendar } = nextConfig.settings.calendar;
    const needsMappings = calendar.personSources !== undefined || Object.keys(merged.personSources).length > 0;
    nextConfig = { ...nextConfig, settings: { ...nextConfig.settings, calendar: {
      ...calendar, ...(needsMappings ? { personSources: merged.personSources } : {}),
    } } };
  }
  const files = new Map<string, unknown>();
  files.set('data/family.json', merged.family);
  if (body.config || config.settings.calendar?.people !== undefined || JSON.stringify(config.settings.calendar?.personSources ?? {}) !== JSON.stringify(merged.personSources)) files.set('data/config.json', nextConfig);
  if (body.chores || Object.hasOwn(chores, 'members')) {
    const { members: _members, ...definitions } = chores;
    files.set('data/chores.json', definitions);
  }
  for (const [key, path] of [
    ['choreCompletions', 'data/chore-completions.json'], ['meals', 'data/meals.json'],
    ['rewards', 'data/rewards.json'], ['routines', 'data/routines.json'], ['todos', 'data/todos.json'],
  ] as const) if (body[key] !== undefined) files.set(path, body[key]);
  if (body.config && hasLegacy(body.config)) {
    const beforeTodos = await readTransactionFile('data/todos.json');
    const todos: TodoData = body.todos ?? (beforeTodos === null ? { lists: [] } : JSON.parse(beforeTodos));
    const invalid = validateTodoData(todos);
    if (invalid) throw new Error(invalid);
    const folded = foldConfigTodos(nextConfig, todos.lists);
    nextConfig = folded.config;
    files.set('data/config.json', nextConfig);
    files.set('data/todos.json', { ...todos, lists: [...todos.lists, ...folded.created], migratedFromConfig: true });
  }
  const configTransformed = sourceConfig !== json(nextConfig);
  if (configTransformed) files.set('data/config.json', nextConfig);
  const { historicalOrphans, rewardAssignmentRepairs } = await validateRestoredReferences(files, new Set(merged.family.members.map((member) => member.id)));
  const changes: TransactionChange[] = configTransformed && sourceConfigRaw !== null ? [planConfigMigrationBackup(sourceConfigRaw)] : [];
  for (const [path, value] of files) {
    const before = await readTransactionFile(path);
    const after = json(value);
    if (before !== after) changes.push({ path, before, after });
  }
  const moved = !!(chores.members?.length || config.settings.calendar?.people?.length);
  const hasHistoricalOrphans = historicalOrphans.completions.length > 0 || Object.keys(historicalOrphans.balances).length > 0;
  const evidence = moved || hasHistoricalOrphans || rewardAssignmentRepairs.length > 0 || replacedConfigWarning ? {
    path: await readTransactionFile('data/family-migration.json') === null
      ? 'data/family-migration.json' : `data/family-migrations/${randomUUID()}.json`,
    contents: json({ kind: 'import', existingFamily: currentFamily ?? familyBefore, incomingFamily: body.family, choreMembers: chores.members, calendarPeople: config.settings.calendar?.people, personSources: config.settings.calendar?.personSources, result: merged,
      ...(hasHistoricalOrphans ? { historicalOrphans: { policy: 'preserve-ledger-entries-without-creating-members', ...historicalOrphans } } : {}),
      ...(rewardAssignmentRepairs.length > 0 ? { rewardAssignmentRepairs: { policy: 'remove-missing-members-disable-if-none-remain', records: rewardAssignmentRepairs } } : {}),
      ...(replacedConfigWarning ? { replacedConfig: { before: configBefore, warning: replacedConfigWarning } } : {}),
    }),
  } : undefined;
  return { changes, config: nextConfig, evidence };
}

/** Imported calendar people and inline lists publish with their destination data. */
export async function saveImportedConfig(config: ScreenConfiguration): Promise<ScreenConfiguration> {
  const planned = await planFamilyRestore({ config });
  await commitDataTransaction({ kind: 'config-import', changes: planned.changes, evidence: planned.evidence, rollbackOnError: true });
  return planned.config;
}


const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function parseSavedObject(raw: string | null, fallback: Record<string, unknown>, filename: string): Record<string, unknown> {
  if (raw === null) return fallback;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(`${filename} is corrupt. Include a valid replacement in the restore.`); }
  if (!isRecord(value)) throw new Error(`${filename} must contain an object.`);
  return value;
}

/** Validate the resulting snapshot and plan repairs to stale reward eligibility.
 * Only the in-memory after-images change here; validation never writes to disk. */
async function validateRestoredReferences(files: Map<string, unknown>, members: Set<string>) {
  const historicalOrphans: { completions: Record<string, unknown>[]; balances: Record<string, number> } = { completions: [], balances: {} };
  const rewardAssignmentRepairs: { before: Record<string, unknown>; removedMemberIds: string[]; disabled: boolean }[] = [];
  const missingAssignments: string[] = [];
  async function state(file: string): Promise<Record<string, unknown> | null> {
    let value = files.get(file);
    if (!files.has(file)) {
      const raw = await readTransactionFile(file);
      if (raw === null) return null;
      try { value = JSON.parse(raw); } catch { throw new Error(`${file} is corrupt. Repair it before restoring family data.`); }
    }
    if (!isRecord(value)) throw new Error(`${file} must contain an object.`);
    return value;
  }
  function rows(value: unknown, label: string): Record<string, unknown>[] {
    if (!Array.isArray(value) || value.some((row) => !isRecord(row))) throw new Error(`${label} must be an array of records.`);
    return value;
  }
  function recordLabel(file: string, location: string, record: Record<string, unknown>): string {
    const name = record.name ?? record.text;
    return `${file}, ${location}${typeof name === 'string' ? ` ${JSON.stringify(name)}` : ''}${typeof record.id === 'string' ? ` (id ${JSON.stringify(record.id)})` : ''}`;
  }
  function checkedIds(value: unknown, label: string): string[] {
    if (!Array.isArray(value)) throw new FamilyError(`${label} must be a list of person IDs.`);
    const invalid = value.filter((id) => !validFamilyId(id));
    if (invalid.length > 0) throw new FamilyError(`${label} contains invalid person IDs: ${invalid.map((id) => JSON.stringify(id)).join(', ')}. Repair this record and retry.`);
    return value;
  }
  function memberIds(value: unknown, label: string): void {
    const missing = [...new Set(checkedIds(value, label).filter((id) => !members.has(id)))];
    if (missing.length > 0) missingAssignments.push(`${label}: ${missing.map((id) => JSON.stringify(id)).join(', ')}`);
  }
  const chores = await state('data/chores.json');
  if (chores) for (const [index, chore] of rows(chores.chores, 'Chores').entries()) {
    const label = recordLabel('data/chores.json', `chores[${index}]`, chore);
    memberIds(chore.assigneeIds, `${label}, assigneeIds`);
    if (chore.schedule !== undefined) {
      if (!isRecord(chore.schedule)) throw new FamilyError(`${label}, schedule must map person IDs to days.`);
      memberIds(Object.keys(chore.schedule), `${label}, schedule`);
      for (const [id, days] of Object.entries(chore.schedule)) {
        if (!Array.isArray(days) || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new FamilyError(`${label}, schedule for ${JSON.stringify(id)} contains invalid days.`);
      }
    }
  }
  const completions = await state('data/chore-completions.json');
  // Older deletion paths left completion history (and occasionally balances)
  // behind. Preserve these ledgers without inventing a person or assigning
  // future work to that identity. Evidence records every unresolved entry.
  if (completions) for (const completion of rows(completions.completions, 'Chore completions')) {
    if (!validFamilyId(completion.memberId)) throw new Error('A chore completion needs a valid member identity.');
    if (!members.has(completion.memberId)) historicalOrphans.completions.push(completion);
  }
  const rewards = await state('data/rewards.json');
  if (rewards) {
    const repairedRewards = rows(rewards.rewards, 'Rewards').map((reward, index) => {
      const ids = checkedIds(reward.memberIds, `${recordLabel('data/rewards.json', `rewards[${index}]`, reward)}, memberIds`);
      const removedMemberIds = [...new Set(ids.filter((id) => !members.has(id)))];
      if (removedMemberIds.length === 0) return reward;
      // The old detached deletion cascade removed eligibility and balances in
      // one write. Either may survive that write failing. Repair eligibility
      // without inventing people or broadening a restricted reward to everyone.
      const memberIds = ids.filter((id) => members.has(id));
      const disabled = memberIds.length === 0;
      rewardAssignmentRepairs.push({ before: reward, removedMemberIds, disabled });
      return { ...reward, memberIds, ...(disabled ? { enabled: false } : {}) };
    });
    if (rewardAssignmentRepairs.length > 0) files.set('data/rewards.json', { ...rewards, rewards: repairedRewards });
    if (!isRecord(rewards.balances)) throw new Error('Reward balances must be a member mapping.');
    for (const [id, balance] of Object.entries(rewards.balances)) {
      if (!validFamilyId(id)) throw new Error('A reward balance needs a valid member identity.');
      if (typeof balance !== 'number' || !Number.isFinite(balance)) throw new Error('A reward balance must be a finite number.');
      if (!members.has(id)) historicalOrphans.balances[id] = balance;
    }
    // Redemptions are denormalized historical facts: their person may have
    // been removed since redemption, so their member ids must remain intact.
    rows(rewards.redemptions, 'Reward redemptions');
  }
  const todos = await state('data/todos.json');
  if (todos) {
    const invalid = validateTodoData(todos);
    if (invalid) throw new Error(invalid);
    for (const [listIndex, list] of rows(todos.lists, 'To-do lists').entries()) for (const [itemIndex, item] of rows(list.items, 'To-do items').entries()) {
      const listLabel = recordLabel('data/todos.json', `lists[${listIndex}]`, list);
      const label = recordLabel(listLabel, `items[${itemIndex}]`, item);
      if (item.assigneeIds !== undefined) memberIds(item.assigneeIds, `${label}, assigneeIds`);
    }
  }
  if (missingAssignments.length > 0) throw new FamilyError(
    `Restore stopped because these assignments name people missing from the restored family:\n${missingAssignments.join('\n')}\nRestore a backup containing their family records, or remove these assignments from the named records and retry.`,
  );
  return { historicalOrphans, rewardAssignmentRepairs };
}
