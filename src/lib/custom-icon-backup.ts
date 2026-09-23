/**
 * Whether a backup carries the family's own icons, and adding them to one.
 *
 * `GET /api/backup` never includes the pictures; every export path (the
 * editor's Save a backup, the phone's backup row, the reminder's button) adds
 * them through `attachCustomIcons`, so one remembered switch decides for all
 * of them. It starts on: without the pictures, a restored meal plan quietly
 * shows the usual emoji, which should be a choice rather than an accident.
 */

const KEY = 'hs-backup-include-icons';

type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

export function getIncludeCustomIcons(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setIncludeCustomIcons(include: boolean): void {
  try {
    window.localStorage.setItem(KEY, include ? 'on' : 'off');
  } catch { /* private mode: the choice lasts this visit */ }
}

/** Add the `customIcons` section when the switch is on and there are any.
 *  Throws when the pictures could not be read, so the caller can decide
 *  whether to save the backup without them. */
export async function attachCustomIcons<T extends object>(bundle: T, fetchFn: FetchFn): Promise<T> {
  if (!getIncludeCustomIcons()) return bundle;
  const res = await fetchFn('/api/backup/custom-icons');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const section = (await res.json()) as { icons?: unknown[] };
  if (!section.icons?.length) return bundle;
  return { ...bundle, customIcons: section };
}

/** Count and size for the switch's label, without the pictures. */
export async function fetchCustomIconBackupSummary(fetchFn: FetchFn): Promise<{ count: number; bytes: number } | null> {
  try {
    const res = await fetchFn('/api/backup/custom-icons?summary=1');
    if (!res.ok) return null;
    return (await res.json()) as { count: number; bytes: number };
  } catch {
    return null;
  }
}
