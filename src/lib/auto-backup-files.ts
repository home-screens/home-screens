/**
 * The folder automatic backups are kept in, `data/auto-backups/`. Apart
 * from `data/backups/`, which belongs to the upgrade script's config
 * snapshots and its own rotation.
 *
 * A copy is written under `<name>.partial` and renamed once whole, so a
 * power cut never leaves a half file that reads as a backup; the scheduler
 * sweeps leftovers when it starts.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { getDataRoot } from './data-transaction';
import { describeAutoBackupName, isAutoBackupName } from './auto-backup-policy';

export const AUTO_BACKUP_DIR = 'data/auto-backups';
export const PARTIAL_SUFFIX = '.partial';

export function autoBackupRoot(): string {
  return path.join(getDataRoot(), AUTO_BACKUP_DIR);
}

/** The copy a name points at, or null for a name that is not one of ours. */
export function autoBackupPath(name: unknown): string | null {
  if (!isAutoBackupName(name)) return null;
  return path.join(autoBackupRoot(), name);
}

export interface AutoBackupCopy {
  name: string;
  bytes: number;
  /** When the copy was written, ISO. */
  savedAt: string;
  withKeys: boolean;
  withPictures: boolean;
}

/**
 * Every copy in the folder, newest first, read from the files themselves so
 * the list is what is really there. Anything else in the folder is ignored.
 */
export async function listAutoBackups(): Promise<AutoBackupCopy[]> {
  let names: string[];
  try {
    names = await fs.readdir(autoBackupRoot());
  } catch {
    return [];
  }
  const copies: (AutoBackupCopy & { mtimeMs: number })[] = [];
  for (const name of names) {
    const info = describeAutoBackupName(name);
    if (!info) continue;
    try {
      const stat = await fs.stat(path.join(autoBackupRoot(), name));
      if (!stat.isFile()) continue;
      copies.push({ name, bytes: stat.size, savedAt: stat.mtime.toISOString(), mtimeMs: stat.mtimeMs, ...info });
    } catch { /* removed while listing */ }
  }
  copies.sort((a, b) => b.mtimeMs - a.mtimeMs || (a.name < b.name ? 1 : -1));
  return copies.map(({ mtimeMs: _mtime, ...copy }) => copy);
}

/** Remove one copy. A copy already gone counts as removed. */
export async function removeAutoBackup(name: string): Promise<boolean> {
  const file = autoBackupPath(name);
  if (!file) return false;
  await fs.rm(file, { force: true });
  return true;
}

/** Drop half-written copies a stopped process left behind. */
export async function sweepPartialBackups(): Promise<void> {
  let names: string[];
  try {
    names = await fs.readdir(autoBackupRoot());
  } catch {
    return;
  }
  await Promise.all(names
    .filter((name) => name.endsWith(PARTIAL_SUFFIX))
    .map((name) => fs.rm(path.join(autoBackupRoot(), name), { force: true }).catch(() => {})));
}

/** Free bytes on the volume the folder is on, or undefined when it cannot be read. */
export async function autoBackupFreeBytes(): Promise<number | undefined> {
  try {
    await fs.mkdir(autoBackupRoot(), { recursive: true });
    const stats = await fs.statfs(autoBackupRoot());
    return stats.bsize * stats.bavail;
  } catch {
    return undefined;
  }
}

export { isAutoBackupName };
