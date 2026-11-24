import type { NotesConfig, NotesView, ScreenConfiguration } from '@/types/config';
import { someConfigModule } from './config-modules';

/**
 * What the wall may put on the notes board. A kiosk holds the display token,
 * and so does any address on the sign-in bypass list, so the hub takes a
 * note from that token only as a drawing, and only while a Notes card on
 * some wall offers its "Draw a note" button. Words, pins and removing stay
 * with the phone and the editor.
 *
 * The card reads the same rule (`notesCardDraws`) to decide whether to draw
 * the button, so a card never offers what the hub would refuse. Pure: no
 * server imports.
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
 * drawing made from it (a wall cannot pin or flag), so it has no button: a
 * child who draws there and sees nothing appear draws it again.
 */
export function notesCardShowsEveryNote(config: Partial<NotesConfig>): boolean {
  const view = config.view ?? 'board';
  return WHOLE_BOARD_VIEWS.has(view) || (config.filter !== 'pinned' && config.filter !== 'important');
}

/** A Notes card draws its "Draw a note" button: drawing on, a view with room for it, and every note showing. */
export function notesCardDraws(config: Partial<NotesConfig>): boolean {
  return !!config.wallDraw && NOTES_DRAW_VIEWS.has(config.view ?? 'board') && notesCardShowsEveryNote(config);
}

/** Whether some Notes card a wall draws lets the wall post a drawing. */
export function wallMayDraw(config: ScreenConfiguration): boolean {
  return someConfigModule(config, (mod, site) => site.live && mod.enabled !== false && mod.type === 'notes' && notesCardDraws(mod.config as Partial<NotesConfig>));
}
