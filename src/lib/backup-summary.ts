/**
 * What a backup holds, for the prompts a restore runs before it posts: the
 * password, the missing icons, the plaintext keys, the picture count. No
 * server imports, so the hub (a zip staged from a computer, a copy it kept)
 * and both restore buttons (the editor's and the phone's, for a JSON file
 * they read themselves) answer the same questions the same way.
 */
import { isEncryptedEnvelope } from './backup-credentials-types';
import { collectCustomIconIds } from './custom-icons';
import type { InspectedArchive } from './backup-archive';
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

/** A backup made with its icons left out, from a household that used some: say so before it replaces anything. */
export function lacksCustomIcons(summary: Pick<BackupContentsSummary, 'hasCustomIcons' | 'usesCustomIcons'>): boolean {
  return summary.usesCustomIcons && !summary.hasCustomIcons;
}
