/**
 * Which library pictures a backup carries, as the browser remembers it, and
 * the one way every export path saves the file.
 *
 * Like the icons switch (`custom-icon-backup.ts`), the choice is remembered
 * per browser and shared by the editor's Save a backup, the phone's Backup
 * row and the reminder's one-tap button. It starts at `used`: a backup that
 * cannot put the screens back on a new hub is not the backup anyone meant
 * to make, and the size sits on the label for the family to weigh.
 *
 * With pictures the file is a zip the hub streams (`POST /api/backup/archive`);
 * without them it is the JSON file it always was.
 */

import { downloadBlob } from './download';
import { backupFileName } from './backup-file-name';
import type { EditorFetchInit } from './editor-fetch';
import type { PictureBackupChoice, PictureBackupSummary } from './backup-pictures-types';

export type { PictureBackupChoice, PictureBackupSummary } from './backup-pictures-types';

const KEY = 'hs-backup-pictures';

type FetchFn = (url: string, options?: EditorFetchInit) => Promise<Response>;

export function getPictureBackupChoice(): PictureBackupChoice {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === 'off' || raw === 'all' ? raw : 'used';
  } catch {
    return 'used';
  }
}

export function setPictureBackupChoice(choice: PictureBackupChoice): void {
  try {
    window.localStorage.setItem(KEY, choice);
  } catch { /* private mode: the choice lasts this visit */ }
}

/** The phone's tap order: left out, then the ones on screen, then everything. */
export function nextPictureBackupChoice(choice: PictureBackupChoice): PictureBackupChoice {
  return choice === 'off' ? 'used' : choice === 'used' ? 'all' : 'off';
}

/** Counts and sizes for the labels; null when the hub could not say. */
export async function fetchPictureBackupSummary(fetchFn: FetchFn): Promise<PictureBackupSummary | null> {
  try {
    const res = await fetchFn('/api/backup/pictures?summary=1');
    if (!res.ok) return null;
    const summary = (await res.json()) as Partial<PictureBackupSummary> | null;
    if (!summary || typeof summary.used?.count !== 'number' || typeof summary.all?.count !== 'number') return null;
    return summary as PictureBackupSummary;
  } catch {
    return null;
  }
}

export interface SavedBackup {
  filename: string;
  /** The choice asked for pictures and the zip could not be made, so the JSON file was saved instead. */
  picturesLeftOut: boolean;
}

/**
 * Save an assembled bundle as the file the remembered choice calls for.
 * A backup without the pictures still beats no backup: when the zip cannot
 * be made the JSON file is saved and `picturesLeftOut` says so, so the
 * caller can tell the family to try again.
 */
export async function saveBackupFile(
  bundle: object,
  fetchFn: FetchFn,
  options: { timezone?: string; withKeys?: boolean; pictures?: PictureBackupChoice } = {},
): Promise<SavedBackup> {
  const choice = options.pictures ?? getPictureBackupChoice();
  if (choice !== 'off') {
    try {
      const res = await fetchFn('/api/backup/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle, pictures: choice }),
        // A library can be gigabytes over Wi-Fi.
        timeoutMs: null,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // 204: the chosen set holds no files, so the JSON file is the backup.
      if (res.status === 204) return { ...saveJson(bundle, options), picturesLeftOut: false };
      // Chrome and Firefox page a large blob to disk; the browser then
      // downloads it like any file.
      const blob = await res.blob();
      const filename = backupFileName(options.timezone, { withKeys: options.withKeys, extension: 'zip' });
      downloadBlob(blob, filename);
      return { filename, picturesLeftOut: false };
    } catch {
      return { ...saveJson(bundle, options), picturesLeftOut: true };
    }
  }
  return { ...saveJson(bundle, options), picturesLeftOut: false };
}

function saveJson(bundle: object, options: { timezone?: string; withKeys?: boolean }): { filename: string } {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const filename = backupFileName(options.timezone, { withKeys: options.withKeys });
  downloadBlob(blob, filename);
  return { filename };
}

/** What a staged zip holds, as `POST /api/backup/upload` answers it. */
export interface StagedBackup {
  id: string;
  hasCredentials: boolean;
  credentialsEncrypted: boolean;
  hasCustomIcons: boolean;
  usesCustomIcons: boolean;
  pictures: { count: number; bytes: number; skipped: number };
}

export function isZipBackup(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
}

/**
 * Put a zip backup on the hub and learn what it holds. Throws with the hub's
 * sentence when it is not a backup or does not fit.
 */
export async function stageZipBackup(file: File, fetchFn: FetchFn): Promise<StagedBackup> {
  const res = await fetchFn('/api/backup/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: file,
    timeoutMs: null,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`);
  return data as StagedBackup;
}
