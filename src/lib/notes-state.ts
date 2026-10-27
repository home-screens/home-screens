import type { ProvidedStateKey } from './shared-state-types';
import type { TranslateFn } from '@/i18n';
import { isLive } from './notes-rules';
import type { Note } from '@/types/notes';

/**
 * The notes board on the shared state bus, published by the display shell
 * (`useSharedDisplayData`) from the same read every Notes module makes, so
 * a layout can show a board only when there is something on it whether or
 * not that screen holds a Notes module. Counts, never text: the Text module
 * can say "{notes.count} notes", and a visibility rule can ask
 * `notes.important > 0`.
 */
export const NOTES_STATE_KEYS = {
  count: 'notes.count',
  important: 'notes.important',
  pinned: 'notes.pinned',
} as const;

export const NOTES_STATE_KEY_LIST: readonly string[] = Object.values(NOTES_STATE_KEYS);

/** The values for `now`. An empty board publishes zeros, never clears: zero is a fact. */
export function deriveNotesState(notes: readonly Note[], now: Date): Record<string, number> {
  const live = notes.filter((n) => isLive(n, now));
  return {
    [NOTES_STATE_KEYS.count]: live.length,
    [NOTES_STATE_KEYS.important]: live.filter((n) => n.important).length,
    [NOTES_STATE_KEYS.pinned]: live.filter((n) => n.pinned).length,
  };
}

/** What the editor's condition picker offers. No precondition: the board always exists. */
export function notesProvidedStateKeys(t: TranslateFn): ProvidedStateKey[] {
  return [
    { key: NOTES_STATE_KEYS.count, label: t('stateKeys.notes.count'), sampleValues: ['3'] },
    { key: NOTES_STATE_KEYS.important, label: t('stateKeys.notes.important'), sampleValues: ['1'] },
    { key: NOTES_STATE_KEYS.pinned, label: t('stateKeys.notes.pinned'), sampleValues: ['1'] },
  ];
}
