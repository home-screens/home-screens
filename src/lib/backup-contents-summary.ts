/**
 * A backup file on the hub's disk, read for what it holds (`summarizeBundle`
 * in `backup-summary.ts` has the rule; this file is the part that needs the
 * disk).
 */
import { promises as fs } from 'fs';
import { inspectRestoreArchive } from './backup-archive';
import { summarizeBundle } from './backup-summary';
import { MAX_RESTORE_BYTES } from './backup-limits';
import type { BackupContentsSummary } from './auto-backup-types';

function parseBundle(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && (parsed as { _type?: unknown })._type === 'home-screens-backup'
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/** A backup file on disk, JSON or zip, read for its summary. Null when it is not a backup of ours. */
export async function summarizeBackupFile(file: string): Promise<BackupContentsSummary | null> {
  if (file.endsWith('.zip')) {
    const inspected = await inspectRestoreArchive(file, MAX_RESTORE_BYTES);
    const bundle = inspected ? parseBundle(inspected.bundleText) : null;
    return bundle && inspected ? summarizeBundle(bundle, inspected) : null;
  }
  const stat = await fs.stat(file);
  if (stat.size > MAX_RESTORE_BYTES) return null;
  const bundle = parseBundle(await fs.readFile(file, 'utf8'));
  return bundle ? summarizeBundle(bundle, null) : null;
}

export { parseBundle as parseBackupBundleText };
