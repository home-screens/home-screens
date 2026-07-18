import { randomUUID } from 'crypto';
import { createJsonStore } from './json-store';

/**
 * iCloud account credentials for CalDAV/CardDAV access. Stored outside
 * config.json (like data/google-tokens.json) so app passwords never ride
 * along with config reads, backups, or editor saves. App passwords are
 * created at account.apple.com and only unlock the standards-based
 * endpoints (calendars/contacts) — never full iCloud.
 */
export interface ICloudAccount {
  id: string;
  appleId: string;
  appPassword: string;
}

/** Credential-free projection safe to return to the editor. */
export interface ICloudAccountInfo {
  id: string;
  appleId: string;
}

interface ICloudAccountsFile {
  accounts: ICloudAccount[];
}

const store = createJsonStore<ICloudAccountsFile>({
  path: 'data/icloud-accounts.json',
  defaultValue: { accounts: [] },
  chmod: 0o600,
  errorHandling: 'throw-corrupt',
});

export async function listICloudAccounts(): Promise<ICloudAccount[]> {
  const file = await store.read();
  return file.accounts;
}

export async function listICloudAccountInfo(): Promise<ICloudAccountInfo[]> {
  const accounts = await listICloudAccounts();
  return accounts.map(({ id, appleId }) => ({ id, appleId }));
}

export async function getICloudAccount(id: string): Promise<ICloudAccount | null> {
  const accounts = await listICloudAccounts();
  return accounts.find((a) => a.id === id) ?? null;
}

export async function addICloudAccount(appleId: string, appPassword: string): Promise<ICloudAccountInfo> {
  const account: ICloudAccount = { id: randomUUID(), appleId, appPassword };
  await store.updateAtomic((current) => {
    // Re-adding the same Apple ID replaces its credentials instead of duplicating
    const others = current.accounts.filter((a) => a.appleId !== appleId);
    const existing = current.accounts.find((a) => a.appleId === appleId);
    if (existing) account.id = existing.id;
    return { accounts: [...others, account] };
  });
  return { id: account.id, appleId: account.appleId };
}

export async function removeICloudAccount(id: string): Promise<void> {
  await store.updateAtomic((current) => {
    if (!current.accounts.some((a) => a.id === id)) return current;
    return { accounts: current.accounts.filter((a) => a.id !== id) };
  });
}
