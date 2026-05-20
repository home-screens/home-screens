import { createJsonStore } from './json-store';

export interface UpdateNotificationState {
  /** GitHub tag (with leading "v") of the most recently dismissed available version. */
  lastDismissedVersion: string | null;
}

const store = createJsonStore<UpdateNotificationState>({
  path: 'data/update-notification-state.json',
  defaultValue: { lastDismissedVersion: null },
});

export const readUpdateNotificationState = store.read;
export const writeUpdateNotificationState = store.write;
