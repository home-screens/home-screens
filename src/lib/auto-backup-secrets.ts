/**
 * What automatic backups need that must never reach a browser: the backup
 * password that locks the keys in each copy, the storage folder's sign-in
 * (a WebDAV folder or a network share), and the private download link's
 * token.
 *
 * Routes answer only whether each is set (`hasBackupPassword`, where the
 * storage folder is and the name used there); the link token goes to a
 * signed-in session that asks for it. The password and the storage folder
 * travel inside a backup's locked keys (`CredentialPayload.autoBackup`), so
 * a hub restored from one keeps sending without being set up again. The
 * link token does not: a new hub gets a new link.
 */
import { createJsonStore } from './json-store';
import { sanitizeDestination, type StorageDestination } from './storage-destination';

export type { ShareDestination, StorageDestination, WebdavDestination } from './storage-destination';

export const AUTO_BACKUP_SECRETS_FILE = 'data/auto-backup-secrets.json';

export interface AutoBackupSecrets {
  backupPassword?: string;
  /** The storage folder backups are sent to. */
  destination?: StorageDestination;
  /** base64url, 32 random bytes. */
  linkToken?: string;
}

const store = createJsonStore<AutoBackupSecrets>({
  path: AUTO_BACKUP_SECRETS_FILE,
  defaultValue: {},
  chmod: 0o600,
});

/** The saved secrets, with anything malformed dropped. */
export function sanitizeAutoBackupSecrets(raw: unknown): AutoBackupSecrets {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const v = raw as Record<string, unknown>;
  const out: AutoBackupSecrets = {};
  if (typeof v.backupPassword === 'string' && v.backupPassword) out.backupPassword = v.backupPassword;
  const destination = sanitizeDestination(v.destination);
  if (destination) out.destination = destination;
  if (typeof v.linkToken === 'string' && v.linkToken) out.linkToken = v.linkToken;
  return out;
}

export async function readAutoBackupSecrets(): Promise<AutoBackupSecrets> {
  return sanitizeAutoBackupSecrets(await store.read());
}

/** Change the saved secrets in one queued read-modify-write. */
export async function updateAutoBackupSecrets(mutate: (current: AutoBackupSecrets) => AutoBackupSecrets): Promise<AutoBackupSecrets> {
  return store.updateAtomic((current) => {
    const next = mutate(sanitizeAutoBackupSecrets(current));
    // Leave no empty keys behind: an absent field is what "not set" means.
    return Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined)) as AutoBackupSecrets;
  });
}

export const autoBackupSecretsStore = store;
