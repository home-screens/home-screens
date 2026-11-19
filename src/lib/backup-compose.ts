/**
 * The backup bundle, built on the hub. `GET /api/backup` answers it as is
 * (the editor and the phone then add the icons and keys they chose); an
 * automatic backup asks for the icons and the locked keys as well. A new
 * store joins both by its one `BACKUP_SECTIONS` row.
 */
import { settleTodoMigration } from './todo-data';
import { withFamilyData } from './family-api';
import { BACKUP_SECTIONS } from './backup-sections';
import { readCustomIconBackup } from './custom-icon-data';
import { collectCredentials } from './backup-credentials';
import { encryptCredentials } from './backup-crypto';
import type { EncryptedCredentialEnvelope } from './backup-credentials-types';

export interface BackupBundle {
  _type: 'home-screens-backup';
  _version: 2;
  _createdAt: string;
  config?: unknown;
  customIcons?: unknown;
  credentials?: EncryptedCredentialEnvelope;
  [section: string]: unknown;
}

export interface BuildBundleOptions {
  /** Add the family's own icons, when there are any. */
  customIcons?: boolean;
  /** Add the keys and connected accounts, locked with this password. */
  credentialsPassphrase?: string;
  now?: Date;
}

/**
 * Every content section, read under the family lock so the sections agree
 * with each other, plus whatever `options` asks for. The keys are only ever
 * added locked: the caller has already decided that a password exists.
 */
export async function buildBackupBundle(options: BuildBundleOptions = {}): Promise<BackupBundle> {
  const bundle = await withFamilyData(async () => {
    // The fold rewrites config.json, so let it finish before the reads below:
    // in parallel the very first export after an upgrade could pair a
    // pre-fold config with post-fold lists and back up neither faithfully.
    await settleTodoMigration();
    const sections = await Promise.all(BACKUP_SECTIONS.map(async (section) => [section.key, await section.read()] as const));
    return {
      _type: 'home-screens-backup',
      // v2 adds the optional `credentials` section. A v2 bundle without that
      // section is byte-identical in effect to v1, and v1 bundles still restore.
      _version: 2,
      _createdAt: (options.now ?? new Date()).toISOString(),
      // A section whose store has nothing saved reads as null and is left out,
      // so a restore does not create its file.
      ...Object.fromEntries(sections.filter(([, value]) => value !== null)),
    } as BackupBundle;
  });
  if (options.customIcons) {
    const icons = await readCustomIconBackup();
    if (icons.icons.length > 0) bundle.customIcons = icons;
  }
  if (options.credentialsPassphrase) {
    bundle.credentials = await encryptCredentials(await collectCredentials(), options.credentialsPassphrase);
  }
  return bundle;
}
