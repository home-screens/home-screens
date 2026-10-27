import type { Note } from '@/types/notes';
import type { NotesContext } from '../shared';

/**
 * What the module hands every material view. A material is its own card:
 * the wrapper draws no surface, so the view paints one that fills the box
 * and applies `padding` itself. `shown` and `hidden` are the capped wall
 * order; `all` is every live note for the stepping materials.
 */
export interface MaterialViewProps {
  ctx: NotesContext;
  all: Note[];
  shown: Note[];
  hidden: number;
  max: number;
  stepSeconds: number;
  /** The heading with the module's default already applied ("Notes"). */
  title: string;
  /** The heading as typed, empty when unset, for a material with its own default (the newspaper's masthead). */
  heading: string;
  showTitle: boolean;
  padding: number;
  width: number;
  height: number;
}
