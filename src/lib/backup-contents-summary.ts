/**
 * What a backup holds, for the prompts a restore runs before it posts: the
 * password, the missing icons, the plaintext keys, the picture count. Shared
 * by a zip staged from a computer and a copy kept on the hub.
 */
import { promises as fs } from 'fs';
import { isEncryptedEnvelope } from './backup-credentials-types';
import { collectCustomIconIds } from './custom-icons';
import { inspectRestoreArchive, type InspectedArchive } from './backup-archive';
import { MAX_RESTORE_BYTES } from './backup-limits';
import type { BackupContentsSummary } from './auto-backup-types';

export function summarizeBundle(bundle: Record<string, unknown>, inspected: Pick<InspectedArchive, 'pictures' | 'skipped'> | null): BackupContentsSummary {
  return {
    hasCredentials: bundle.credentials !== undefined,
    credentialsEncrypted: bundle.credentials !== undefined && isEncryptedEnvelope(bundle.credentials),
    hasCustomIcons: bundle.customIcons !== undefined,
    usesCustomIcons: collectCustomIconIds(bundle).size > 0,
    pictures: {
      count: inspected?.pictures.length ?? 0,
      bytes: inspected?.pictures.reduce((sum, picture) => sum + picture.bytes, 0) ?? 0,
      skipped: inspected?.skipped ?? 0,
    },
  };
}

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
