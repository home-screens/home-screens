import { FIELD_HINT_SIZE } from '@/components/ui/FieldHint';

/**
 * The type tier every sentence in the timetables window is set in.
 *
 * The help lines and the error messages in here were 10.5px to 11px, the
 * smallest type in the product, while the import screen's help had been raised
 * to 13px on its own because that screen's job is to teach. Every screen in
 * this window teaches: one of them at a size a parent can read and six below
 * it is not a decision. So the floor is declared once and imported, rather
 * than typed per file where the next screen forgets it.
 *
 * Labels, column headings and one-word captions are chrome and stay where they
 * are. This is for prose: the notes that explain a control, and the messages
 * that say why something was refused or kept. The notes are `FieldHint`s, which
 * the window sets on its `prose` surface, so the tier is declared there and
 * this reads it.
 */
export const PROSE_CLASS = FIELD_HINT_SIZE.prose;
