/**
 * What an automatic settings snapshot is, read from its file name, so the
 * Backups page can lead with "Before updating from 1.9.0" instead of a name
 * whose time stamp is in UTC.
 *
 * The names come from two writers:
 * - `upgrade.sh backup`: `config-v<running version>-<UTC stamp>.json` before
 *   each update, and `last-stable-config.json`, pinned the first time a normal
 *   release is replaced by an early access or test build.
 * - `planConfigMigrationBackup`: `config-v<version>-[<pre>.]migration.<schema>.
 *   <id>-<UTC stamp>.json`, the settings exactly as they were before this
 *   version brought them up to date.
 */
export type ConfigBackupKind =
  | { kind: 'lastStable' }
  | { kind: 'update'; version: string }
  | { kind: 'migration'; version: string }
  | { kind: 'other' };

export const LAST_STABLE_BACKUP = 'last-stable-config.json';

const STAMP = String.raw`-\d{8}-\d{6}\.json$`;
const VERSION = String.raw`\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+?)?`;
// Checked first: a migration name would also pass for an update snapshot
// whose version ran on to "-migration.12.<id>".
const MIGRATION_RE = new RegExp(`^config-v(${VERSION})[-.]migration\\.\\d+\\.[a-f0-9]{32}${STAMP}`);
const UPDATE_RE = new RegExp(`^config-v(${VERSION})${STAMP}`);

export function describeConfigBackup(name: string): ConfigBackupKind {
  if (name === LAST_STABLE_BACKUP) return { kind: 'lastStable' };
  const migration = MIGRATION_RE.exec(name);
  if (migration) return { kind: 'migration', version: migration[1] };
  const update = UPDATE_RE.exec(name);
  if (update) return { kind: 'update', version: update[1] };
  return { kind: 'other' };
}
