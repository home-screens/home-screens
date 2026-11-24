import { FETCH_KEY_REGISTRY, notesUrl } from './fetch-keys';
import type { CreateNoteInput, NoteAction, NotePatch } from './notes-actions';
import type { Note } from '@/types/notes';
import { sendJsonWrite } from './hub-request';

/**
 * Requests against the notes board, shared by the phone tab and anything
 * else that writes it, so a change to a route's shape lands in one place.
 */

export const NOTES_TTL_MS = FETCH_KEY_REGISTRY['notes']?.ttlMs ?? 5_000;

/** How often the phone's and the editor's ages and time left move on when nothing else changed. */
export const NOTES_CLOCK_TICK_MS = 30_000;

export interface NotesPayload {
  notes: Note[];
}

export interface NotesWriteRequest {
  url: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/** Every note, live and gone (the phone's read); the wall asks `notesUrl()` for live notes only. */
export function allNotesUrl(): string {
  return notesUrl().replace(/\?live=1$/, '');
}

export function createNoteRequest(input: CreateNoteInput): NotesWriteRequest {
  return { url: '/api/notes', method: 'POST', body: input };
}

/** Words typed on the wall: the note, who it is from and how long it stays. */
export function createWallNoteRequest(input: Pick<CreateNoteInput, 'text' | 'authorId' | 'life'>): NotesWriteRequest {
  return { url: '/api/notes', method: 'POST', body: input };
}

/** A drawing from the wall: its lines, who drew it and how long it stays. */
export function createDrawingRequest(input: Pick<CreateNoteInput, 'drawing' | 'authorId' | 'life'>): NotesWriteRequest {
  return { url: '/api/notes', method: 'POST', body: input };
}

export function updateNoteRequest(id: string, patch: NotePatch): NotesWriteRequest {
  return { url: `/api/notes/${encodeURIComponent(id)}`, method: 'PATCH', body: patch };
}

export function noteActionRequest(id: string, action: NoteAction): NotesWriteRequest {
  return { url: `/api/notes/${encodeURIComponent(id)}`, method: 'PATCH', body: { action } };
}

export function deleteNoteRequest(id: string): NotesWriteRequest {
  return { url: `/api/notes/${encodeURIComponent(id)}`, method: 'DELETE' };
}

export type NotesFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface NotesWriteResult extends NotesPayload {
  created?: Note;
  /** How many drawings a new drawing took down to make room. */
  madeRoom?: number;
}

/**
 * Send one write and hand back the server's notes. A refusal throws a
 * `RefusalError` carrying the hub's code (the surface phrases it with
 * `refusalText`), else `fallback`, and so does an answer without notes, so
 * it is never taken for an empty board; a hub out of reach and an expired
 * session come through as themselves.
 */
export async function sendNotesWrite(fetchFn: NotesFetch, request: NotesWriteRequest, fallback: string): Promise<NotesWriteResult> {
  const payload = (await sendJsonWrite(fetchFn, request, fallback)) as Partial<NotesWriteResult> | null;
  if (!Array.isArray(payload?.notes)) throw new Error(fallback);
  return { notes: payload.notes, created: payload.created, madeRoom: typeof payload.madeRoom === 'number' ? payload.madeRoom : undefined };
}
