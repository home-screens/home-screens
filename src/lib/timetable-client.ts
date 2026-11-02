/**
 * The client half of the timetable store.
 *
 * The editor loads the whole document and saves the whole document, quoting
 * the revision it started from, so this is a two-call module: one read, one
 * write, plus the spreadsheet check the import screen asks for. What an edit
 * *means* lives in the modal; this file only knows how a call is shaped and
 * what its answer says.
 *
 * Every reply is checked before it is believed. `editorFetch` resolves for
 * every status except 401, so a save the server refused would otherwise look
 * exactly like one that landed, and the window would keep showing an edit that
 * is not saved anywhere.
 */

import { displayCache } from './display-cache';
import { FETCH_KEY_REGISTRY, timetablesUrl } from './fetch-keys';
import type { TimetableData } from '@/types/timetables';
import type { TimetableImportCheckResult } from './timetable-api';
import { readJson, refusalMessage } from './hub-request';
import type { EditorFetchInit } from './editor-fetch';

/** How long a loaded document stays fresh for everything else on the page. */
export const TIMETABLES_TTL_MS = FETCH_KEY_REGISTRY['timetable']?.ttlMs ?? 60_000;

/**
 * `editorFetch` in the editor (a 401 goes to the sign-in page). Injected
 * rather than imported so the calls can be exercised without a browser.
 */
export type TimetableFetch = (url: string, init?: EditorFetchInit) => Promise<Response>;

/** The document and the revision the next save has to quote back. */
export interface TimetableSnapshot {
  data: TimetableData;
  revision: string;
}

export type TimetableSaveResult =
  | { kind: 'saved'; snapshot: TimetableSnapshot }
  /**
   * Somebody else saved first. The refusal carries what is saved now, so the
   * window can adopt it instead of sending the household back to a blank
   * screen; `snapshot` is null only when the refusal came back without it.
   */
  | { kind: 'conflict'; snapshot: TimetableSnapshot | null };

const SYNC_URL = '/api/timetables/sync';
const IMPORT_FILE_URL = `${timetablesUrl()}/import/file`;
const IMPORT_CHECK_URL = `${timetablesUrl()}/import/check`;

function isList(value: unknown): boolean {
  return Array.isArray(value);
}

/** A reply that really is a document, or null when it is anything else. */
function asSnapshot(json: unknown): TimetableSnapshot | null {
  if (!json || typeof json !== 'object') return null;
  const { data, revision } = json as { data?: unknown; revision?: unknown };
  if (typeof revision !== 'string' || !revision) return null;
  if (!data || typeof data !== 'object') return null;
  const { schools, subjects, timetables } = data as Record<string, unknown>;
  if (!isList(schools) || !isList(subjects) || !isList(timetables)) return null;
  return { data: data as TimetableData, revision };
}

/** Hand a document that is already in hand to everything showing this URL. */
export function primeTimetableCache(snapshot: TimetableSnapshot): void {
  displayCache.replace(timetablesUrl(), snapshot, TIMETABLES_TTL_MS);
}

/** Load the whole document. Rejects with a plain reason when it cannot. */
export async function loadTimetables(
  fetcher: TimetableFetch,
  fallbackMessage: string,
): Promise<TimetableSnapshot> {
  const res = await fetcher(timetablesUrl());
  const json = await readJson(res);
  const snapshot = res.ok ? asSnapshot(json) : null;
  if (!snapshot) throw new Error(refusalMessage(json, fallbackMessage));
  primeTimetableCache(snapshot);
  return snapshot;
}

/**
 * Save the whole document.
 *
 * A save that started from an older copy comes back as a conflict rather than
 * an error, because it is the one failure the window can do something about.
 * Anything else rejects, so a debounced saver reaches its `onError` instead of
 * quietly reporting success.
 */
export async function saveTimetables(
  fetcher: TimetableFetch,
  snapshot: TimetableSnapshot,
  fallbackMessage: string,
): Promise<TimetableSaveResult> {
  const res = await fetcher(timetablesUrl(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: snapshot.data, revision: snapshot.revision }),
  });
  const json = await readJson(res);
  // A 409 is only a conflict when the store says it was about the revision. It
  // also answers 409 for a person who has left the family and for a file it
  // cannot read, and adopting the saved document for either of those discarded
  // everything unsaved to explain a race that never happened. Those reject with
  // the store's own plain sentence instead.
  if (res.status === 409 && (json as { reason?: unknown } | null)?.reason === 'revision') {
    return { kind: 'conflict', snapshot: asSnapshot(json) };
  }
  const saved = res.ok ? asSnapshot(json) : null;
  if (!saved) throw new Error(refusalMessage(json, fallbackMessage));
  primeTimetableCache(saved);
  return { kind: 'saved', snapshot: saved };
}

/**
 * Look at one person's sheet now, and answer once the store has been written.
 *
 * The caller reloads the document afterwards rather than being handed one: the
 * check may have changed a week, recorded a failure, or done neither, and the
 * window already knows how to read the whole document back.
 */
export async function checkSheetNow(
  fetcher: TimetableFetch,
  memberId: string,
  fallbackMessage: string,
): Promise<void> {
  const res = await fetcher(SYNC_URL, {
    method: 'POST',
    // Reading the sheet is several calls to its host, under the hub's own limits.
    timeoutMs: null,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId }),
  });
  const json = await readJson(res);
  if (!res.ok) throw new Error(refusalMessage(json, fallbackMessage));
}

/**
 * Read spreadsheets the household picked off their own machine.
 *
 * The text is read in the browser and posted, so the file itself never leaves
 * the machine and nothing is written anywhere. Answers in the same shape a
 * pasted link does, so the screen behind it does not care which one it got.
 */
export async function checkTimetableFiles(
  fetcher: TimetableFetch,
  files: readonly { name: string; text: string }[],
  fallbackMessage: string,
): Promise<TimetableImportCheckResult> {
  const res = await fetcher(IMPORT_FILE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });
  const json = await readJson(res);
  if (!res.ok) throw new Error(refusalMessage(json, fallbackMessage));
  const result = json as TimetableImportCheckResult | null;
  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') {
    throw new Error(fallbackMessage);
  }
  return result;
}

/**
 * Read a pasted spreadsheet link without saving anything.
 *
 * The reply models three outcomes and only one of them is a failure: a sheet
 * that answered but listed no tabs is an ordinary result the import screen
 * keeps working from, so it is handed back untouched rather than thrown.
 */
export async function checkSheetLink(
  fetcher: TimetableFetch,
  url: string,
  fallbackMessage: string,
): Promise<TimetableImportCheckResult> {
  const res = await fetcher(IMPORT_CHECK_URL, {
    method: 'POST',
    // Reading the sheet is several calls to its host, under the hub's own limits.
    timeoutMs: null,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const json = await readJson(res);
  if (!res.ok) throw new Error(refusalMessage(json, fallbackMessage));
  const result = json as TimetableImportCheckResult | null;
  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') {
    throw new Error(fallbackMessage);
  }
  return result;
}
