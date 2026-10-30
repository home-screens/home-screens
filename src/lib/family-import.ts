import { randomUUID } from 'node:crypto';
import type { ScreenConfiguration, ChoreDefinition } from '@/types/config';
import type { FamilyData } from '@/types/family';
import type { TodoData } from '@/types/todos';
import type { NotesData } from '@/types/notes';
import type { DayNotesData } from '@/types/day-notes';
import type { TimetableData } from '@/types/timetables';
import { planFamilyMerge, type LegacyFamilyMember } from './family-merge';
import { readConfig } from './config';
import { foldConfigTodos, validateTodoData } from './todo-data';
import { migrateUp } from './migrations';
import { planConfigMigrationBackup } from './config-migration-backup';
import { FamilyError } from './family-errors';
import { commitDataTransaction, readTransactionFile, type TransactionChange } from './data-transaction';
import { MEMBER_REFERENCE_DOMAINS } from './member-references';

export interface FamilyRestoreContent {
  config?: ScreenConfiguration;
  family?: FamilyData;
  chores?: { chores: ChoreDefinition[]; members?: LegacyFamilyMember[] };
  choreCompletions?: unknown;
  meals?: unknown;
  rewards?: unknown;
  routines?: unknown;
  todos?: TodoData;
  notes?: NotesData;
  dayNotes?: DayNotesData;
  timetables?: TimetableData;
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
    ['timetables', 'data/timetables.json'], ['notes', 'data/notes.json'], ['dayNotes', 'data/day-notes.json'],
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
  const referenceEvidence = await validateRestoredReferences(files, new Set(merged.family.members.map((member) => member.id)), new Set((merged.family.groups ?? []).map((group) => group.id)));
  const changes: TransactionChange[] = configTransformed && sourceConfigRaw !== null ? [planConfigMigrationBackup(sourceConfigRaw)] : [];
  for (const [path, value] of files) {
    const before = await readTransactionFile(path);
    const after = json(value);
    if (before !== after) changes.push({ path, before, after });
  }
  const moved = !!(chores.members?.length || config.settings.calendar?.people?.length);
  const evidence = moved || Object.keys(referenceEvidence).length > 0 || replacedConfigWarning ? {
    path: await readTransactionFile('data/family-migration.json') === null
      ? 'data/family-migration.json' : `data/family-migrations/${randomUUID()}.json`,
    contents: json({ kind: 'import', existingFamily: currentFamily ?? familyBefore, incomingFamily: body.family, choreMembers: chores.members, calendarPeople: config.settings.calendar?.people, personSources: config.settings.calendar?.personSources, result: merged,
      ...referenceEvidence,
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

/**
 * Check every member reference in the snapshot the restore will leave behind,
 * against the family it will have. Each file's policy (refuse, repair, keep
 * as history, drop) is its own domain's rule in `member-references`; this
 * walk reads whichever image is current (the incoming section, or the file on
 * disk when the bundle carries none), applies the plan and gathers evidence.
 * Only the in-memory after-images change here; nothing is written.
 */
async function validateRestoredReferences(files: Map<string, unknown>, members: Set<string>, groups: Set<string>) {
  const evidence: Record<string, Record<string, unknown>> = {};
  const missing: string[] = [];
  for (const domain of MEMBER_REFERENCE_DOMAINS) {
    let value = files.get(domain.path);
    if (!files.has(domain.path)) {
      const raw = await readTransactionFile(domain.path);
      if (raw === null) continue;
      try { value = JSON.parse(raw); } catch {
        // A bundle carrying no timetables of its own must not be stopped by a
        // file only the timetables page reads; every other store has to be
        // readable for the restore to reason about it.
        if (domain.unreadable === 'skip') continue;
        throw new Error(`${domain.path} is corrupt. Repair it before restoring family data.`);
      }
    }
    if (!isRecord(value)) {
      if (domain.unreadable === 'skip') continue;
      throw new Error(`${domain.path} must contain an object.`);
    }
    const plan = domain.planRestore(value, members, groups);
    if (plan.doc) files.set(domain.path, plan.doc);
    missing.push(...plan.missing);
    // Domains that share a policy share a key (chore history and reward
    // balances are both preserved ledgers), so their records are merged.
    for (const [key, records] of Object.entries(plan.evidence)) evidence[key] = { ...evidence[key], ...records };
  }
  if (missing.length > 0) throw new FamilyError(
    `Restore stopped because these assignments name people or groups missing from the restored family:\n${missing.join('\n')}\nRestore a backup containing their family records, or remove these assignments from the named records and retry.`,
  );
  return evidence;
}
