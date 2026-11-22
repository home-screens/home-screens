import type { ScreenConfiguration } from '@/types/config';
import { getLatestSchemaVersion } from '@/lib/migrations';
import { validateDisplays, validateAllSchedules, isValidDisplayTransform, isValidTouchMatrix, DISPLAY_TRANSFORMS, TOUCH_MATRIX_ERROR } from '@/lib/display-filter';
import { autoBackupSettingsProblem } from '@/lib/auto-backup-policy';
import { calendarOverridesProblem } from '@/lib/calendar-overrides';

/**
 * The one gate every path that persists a whole config goes through: the
 * editor's save, a backup restore, and an offline snapshot restore. It
 * checks the current persisted shape only; legacy folds run after it on the
 * paths that accept older documents.
 *
 * Returns the first problem as a sentence, or `null` when the config may be
 * written. Callers that already know the value is an object may pass it as
 * `unknown`; a non-object is refused here rather than crashing a validator.
 */
export function validateConfigForWrite(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Invalid config: must be an object';
  const config = value as Partial<ScreenConfiguration>;
  if (!Array.isArray(config.screens) || !config.settings || typeof config.settings !== 'object' || Array.isArray(config.settings)) {
    return 'Invalid config: must include screens array and settings';
  }
  const mappings = config.settings.calendar?.personSources;
  if (mappings !== undefined && (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)
    || Object.values(mappings).some((ids) => !Array.isArray(ids) || ids.some((id) => typeof id !== 'string')))) {
    return 'Calendar ownership must list calendar source ids for each person.';
  }
  const looksProblem = calendarOverridesProblem(config.settings.calendar?.calendarOverrides);
  if (looksProblem) return looksProblem;
  if (!isValidDisplayTransform(config.settings.displayTransform)) {
    return `Screen rotation must be one of: ${DISPLAY_TRANSFORMS.join(', ')}`;
  }
  if (!isValidTouchMatrix(config.settings.touchMatrix)) return TOUCH_MATRIX_ERROR;
  const autoBackupProblem = autoBackupSettingsProblem(config.settings.autoBackup);
  if (autoBackupProblem) return autoBackupProblem;
  // The display and schedule validators walk nested records and assume the
  // shape above; a hand-edited document can still break that assumption.
  try {
    return validateDisplays(config as ScreenConfiguration) || validateAllSchedules(config as ScreenConfiguration);
  } catch {
    return 'Invalid config: malformed screens, displays or schedules';
  }
}

/**
 * Why a config from a backup cannot be put back on this version, or `null`.
 *
 * A backup made by a newer Home Screens carries a newer schema. This version
 * has no migration that reads it, so writing it as is leaves the hub running
 * on a layout it only half understands, with a version number that tells the
 * update checks the wrong thing. Only the restore paths ask: the editor's own
 * save sends back the version it was given.
 */
export function newerSchemaProblem(value: unknown): string | null {
  const version = (value as { version?: unknown } | null)?.version;
  if (typeof version !== 'number' || version <= getLatestSchemaVersion()) return null;
  return 'This backup was made by a newer version of Home Screens. Update Home Screens first, then restore the backup again.';
}
