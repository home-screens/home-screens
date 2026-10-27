import { FETCH_KEY_REGISTRY, notesUrl } from './fetch-keys';
import type { CreateNoteInput, NoteAction, NotePatch } from './notes-actions';
import type { Note } from '@/types/notes';

/**
 * Requests against the notes board, shared by the phone tab and anything
 * else that writes it, so a change to a route's shape lands in one place.
 */

export const NOTES_TTL_MS = FETCH_KEY_REGISTRY['notes']?.ttlMs ?? 5_000;

export interface NotesPayload {
  notes: Note[];
}

export interface NotesWriteRequest {
  path: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/** Every note, live and gone (the phone's read); the wall asks `notesUrl()` for live notes only. */
export function allNotesUrl(): string {
  return notesUrl().replace(/\?live=1$/, '');
}

export function createNoteRequest(input: CreateNoteInput): NotesWriteRequest {
  return { path: '/api/notes', method: 'POST', body: input };
}

export function updateNoteRequest(id: string, patch: NotePatch): NotesWriteRequest {
  return { path: `/api/notes/${encodeURIComponent(id)}`, method: 'PATCH', body: patch };
}

export function noteActionRequest(id: string, action: NoteAction): NotesWriteRequest {
  return { path: `/api/notes/${encodeURIComponent(id)}`, method: 'PATCH', body: { action } };
}

export function deleteNoteRequest(id: string): NotesWriteRequest {
  return { path: `/api/notes/${encodeURIComponent(id)}`, method: 'DELETE' };
}

export type NotesFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface NotesWriteResult extends NotesPayload {
  created?: Note;
}

/**
 * Send one write and hand back the server's notes. A non-OK answer throws
 * the server's own message when it gave one (the actions speak plainly:
 * "The board is full"), else `fallback`.
 */
export async function sendNotesWrite(fetchFn: NotesFetch, request: NotesWriteRequest, fallback: string): Promise<NotesWriteResult> {
  const res = await fetchFn(request.path, {
    method: request.method,
    ...(request.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) } : {}),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const message = json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string' ? (json as { error: string }).error : fallback;
    throw new Error(message);
  }
  const payload = (json ?? {}) as Partial<NotesWriteResult>;
  return { notes: Array.isArray(payload.notes) ? payload.notes : [], created: payload.created };
}
