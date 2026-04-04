import { createJsonStore } from './json-store';

export interface BackupState {
  lastBackupDate: string | null;
  lastDismissedDate: string | null;
}

const store = createJsonStore<BackupState>({
  path: 'data/backup-state.json',
  defaultValue: { lastBackupDate: null, lastDismissedDate: null },
});

export const readBackupState = store.read;
export const writeBackupState = store.write;
