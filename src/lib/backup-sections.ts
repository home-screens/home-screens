import type { ScreenConfiguration } from '@/types/config';
import type { FamilyData } from '@/types/family';
import type { TodoData } from '@/types/todos';
import type { NotesData } from '@/types/notes';
import type { DayNotesData } from '@/types/day-notes';
import type { TimetableData } from '@/types/timetables';
import type { LegacyFamilyMember } from './family-merge';
import { CONFIG_FILE_PATH, FAMILY_FILE_PATH } from './constants';
import { readConfig } from './config';
import { newerSchemaProblem, validateConfigForWrite } from './config-validation';
import { familyValidationError, readFamilyData } from './family-data';
import { CHORES_FILE, readChoreData, validateChoreData, type ChoreData } from './chore-data';
import { CHORE_COMPLETIONS_FILE, readCompletions, validateCompletionsData } from './chore-completion-data';
import { MEALS_FILE, readMealData } from './meal-data';
import { validateMealData } from './meal-validation';
import { REWARDS_FILE, readRewardData, validateRewardData } from './reward-data';
import { readRoutinesFile, validateRoutines } from './timer-data';
import { readTodoData, validateTodoData } from './todo-data';
import { NOTES_FILE, readNotesData, validateNotesData } from './notes-data';
import { DAY_NOTES_FILE, readDayNotesData, validateDayNotesData } from './day-notes-data';
import { TIMETABLES_FILE_PATH, readSavedTimetables, validateTimetableData } from './timetable-data';
import { isRecord } from './member-references/contract';

/**
 * The content sections of a backup bundle, one per restorable data file.
 * `config`, `family` and `chores` are typed because the restore planner
 * folds them together (a legacy roster on the chores, legacy calendar
 * people on the config); `todos` because a legacy config's inline items
 * are folded into it. The rest are written whole once their validator has
 * passed, so the planner never looks inside them.
 */
export interface BackupContent {
  config?: ScreenConfiguration;
  family?: FamilyData;
  /** `members` is the roster chores.json carried before family.json existed; a restore folds it into the family. */
  chores?: ChoreData & { members?: LegacyFamilyMember[] };
  choreCompletions?: unknown;
  meals?: unknown;
  rewards?: unknown;
  routines?: unknown;
  todos?: TodoData;
  notes?: NotesData;
  dayNotes?: DayNotesData;
  timetables?: TimetableData;
}

export type BackupSectionKey = keyof BackupContent;

export interface BackupSection {
  /** The bundle field. */
  key: BackupSectionKey;
  /** The file the section is written to, relative to the data root. */
  path: `data/${string}.json`;
  /** The current contents for an export. Null means nothing has been saved and the section is left out of the bundle. */
  read: () => Promise<unknown>;
  /**
   * Why the section cannot be written as the whole file, or null. The same
   * rule the file's own save route applies, so a restore can never land a
   * file the next save would refuse.
   */
  validate: (raw: unknown) => string | null;
}

/**
 * Every section a bundle may carry, in validation order. The export, the
 * restore's checks, its `restored` report and the planner's file table all
 * read this list, so a new store joins backups by adding one row.
 */
export const BACKUP_SECTIONS: readonly BackupSection[] = [
  { key: 'config', path: CONFIG_FILE_PATH, read: readConfig, validate: (raw) => validateConfigForWrite(raw) ?? newerSchemaProblem(raw) },
  { key: 'family', path: FAMILY_FILE_PATH, read: readFamilyData, validate: familyValidationError },
  { key: 'chores', path: CHORES_FILE, read: readChoreData, validate: validateChoreData },
  { key: 'choreCompletions', path: CHORE_COMPLETIONS_FILE, read: readCompletions, validate: validateCompletionsData },
  { key: 'meals', path: MEALS_FILE, read: readMealData, validate: validateMealData },
  { key: 'rewards', path: REWARDS_FILE, read: readRewardData, validate: validateRewardData },
  { key: 'routines', path: 'data/routines.json', read: readRoutinesFile, validate: (raw) => (isRecord(raw) ? validateRoutines(raw.routines) : 'Routines must be an object.') },
  { key: 'todos', path: 'data/todos.json', read: readTodoData, validate: validateTodoData },
  { key: 'notes', path: NOTES_FILE, read: readNotesData, validate: validateNotesData },
  { key: 'dayNotes', path: DAY_NOTES_FILE, read: readDayNotesData, validate: validateDayNotesData },
  // Left out until a household has saved one: the starting subjects a read
  // hands out are named in that household's language, and a restore must
  // not create the file with another household's words in it. The store
  // hands back the revision a save has to quote alongside the document; a
  // backup carries the document on its own.
  { key: 'timetables', path: TIMETABLES_FILE_PATH, read: readSavedTimetables, validate: validateTimetableData },
];
