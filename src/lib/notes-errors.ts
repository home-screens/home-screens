import { RefusalError, type RefusalParams } from './refusal';

/**
 * Why a note write was turned down. Each one has a sentence in the `core`
 * dictionary under `refusals.notes`, shown on the phone and in the editor.
 */
export type NotesRefusalCode =
  | 'notes.textRequired'
  | 'notes.textTooLong'
  | 'notes.badAuthor'
  | 'notes.badLife'
  | 'notes.badRequest'
  | 'notes.noteGone'
  | 'notes.boardFull';

/**
 * Thrown by the pure notes actions (`notes-actions.ts`); the route wrapper
 * answers with its code. In its own file so the actions stay free of the
 * store's file system imports and the phone can run the same rules for its
 * optimistic view.
 */
export class NotesError extends RefusalError {
  constructor(status: number, code: NotesRefusalCode, message: string, params?: RefusalParams) {
    super(status, code, message, params ? { params } : {});
    this.name = 'NotesError';
  }
}
