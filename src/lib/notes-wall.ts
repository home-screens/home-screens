import type { NotesConfig, NotesView, ScreenConfiguration } from '@/types/config';
import { someConfigModule } from './config-modules';

/**
 * What the wall may put on the notes board. A kiosk holds the display token,
 * and so does any address on the sign-in bypass list, so the hub takes a
 * note from that token only as a drawing or as a few typed words, and each
 * only while a Notes card on some wall offers it ("Draw a note", "Write a
 * note", or "Leave a note" for both). Pins, "Keep" and removing stay with
 * the phone and the editor.
 *
 * The card reads the same rules (`notesCardDraws`, `notesCardWrites`) to
 * decide what its button offers, so a card never offers what the hub would
 * refuse. Pure: no server imports.
 */

/**
 * The views with room for the button: the ones that list notes. A one-line
 * bar, a count tile and the views that show one note at a time have nowhere
 * to put it.
 */
export const NOTES_DRAW_VIEWS: ReadonlySet<NotesView> = new Set<NotesView>([
  'board', 'cards', 'sticky', 'bubbles', 'timeline', 'focus', 'by-person', 'pinned-new',
  'chalkboard', 'whiteboard', 'fridge', 'notebook', 'receipt', 'headline',
]);

/** The views that show every note whatever "Which notes" says. */
const WHOLE_BOARD_VIEWS: ReadonlySet<NotesView> = new Set<NotesView>(['timeline', 'by-person']);

/**
 * A card that shows only pinned or only important notes would never show a
 * note made from it (a wall cannot pin or flag), so it has no button: a
 * child who draws there and sees nothing appear draws it again.
 */
export function notesCardShowsEveryNote(config: Partial<NotesConfig>): boolean {
  const view = config.view ?? 'board';
  return WHOLE_BOARD_VIEWS.has(view) || (config.filter !== 'pinned' && config.filter !== 'important');
}

/** A Notes card lets the wall draw a note: drawing on, a view with room for the button, and every note showing. */
export function notesCardDraws(config: Partial<NotesConfig>): boolean {
  return !!config.wallDraw && NOTES_DRAW_VIEWS.has(config.view ?? 'board') && notesCardShowsEveryNote(config);
}

/** A Notes card lets the wall type a note: writing on, and the same room and reach a drawing needs. */
export function notesCardWrites(config: Partial<NotesConfig>): boolean {
  return !!config.wallWrite && NOTES_DRAW_VIEWS.has(config.view ?? 'board') && notesCardShowsEveryNote(config);
}

/** What a card's button on the wall opens: the page and pens, the keyboard, or a sheet with both. */
export type NotesWallDoor = 'draw' | 'write' | 'both';

/** The button a Notes card draws on a touch wall, or null for none. */
export function notesCardDoor(config: Partial<NotesConfig>): NotesWallDoor | null {
  const draws = notesCardDraws(config);
  const writes = notesCardWrites(config);
  return draws && writes ? 'both' : draws ? 'draw' : writes ? 'write' : null;
}

/**
 * The most a note typed on the wall may hold. Shorter than the phone's 500:
 * the wall's keyboard is for a line or two, and the sheet shows every word
 * typed without scrolling.
 */
export const WALL_NOTE_MAX_LENGTH = 200;

function someLiveNotesCard(config: ScreenConfiguration, offers: (card: Partial<NotesConfig>) => boolean): boolean {
  return someConfigModule(config, (mod, site) => site.live && mod.enabled !== false && mod.type === 'notes' && offers(mod.config as Partial<NotesConfig>));
}

/** Whether some Notes card a wall draws lets the wall post a drawing. */
export function wallMayDraw(config: ScreenConfiguration): boolean {
  return someLiveNotesCard(config, notesCardDraws);
}

/** Whether some Notes card a wall draws lets the wall post typed words. */
export function wallMayWrite(config: ScreenConfiguration): boolean {
  return someLiveNotesCard(config, notesCardWrites);
}
