/**
 * Thrown by the pure notes actions (`notes-actions.ts`); the routes map it to
 * a JSON error response. In its own file so the actions stay free of the
 * store's file system imports and the phone can run the same rules for its
 * optimistic view.
 */
export class NotesError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'NotesError';
  }
}
