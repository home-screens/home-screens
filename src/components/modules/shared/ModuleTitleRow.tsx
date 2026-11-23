import type { ReactNode } from 'react';
import { TEXT_OPACITY, ink } from '@/lib/constants';

/** The right-hand slot's size, so a caller drawing a mark of its own there can keep that mark's size. */
export const TITLE_ROW_RIGHT_EM = 0.75;

/**
 * A card's sentence-case title row: the heading on the left, cut short with
 * an ellipsis rather than wrapped, and a count or a short note on the right
 * in the card's quieter ink. To-do, notes, Todoist and every weather view
 * draw this one row, so two list cards side by side carry the same title at
 * the same size. (Traffic, history, garbage day, news and the calendar's
 * lists use the small uppercase `SectionHeader` instead.)
 *
 * The title is left out when the card hides it; the right-hand slot stays,
 * for cards whose count is the only place something is said.
 */
export function ModuleTitleRow({ title, right }: { title?: ReactNode; right?: ReactNode }) {
  if (title == null && right == null) return null;
  return (
    <div className="flex items-baseline justify-between gap-[1em] shrink-0 mb-[0.35em]">
      {title != null && (
        <h2 className="font-semibold truncate min-w-0" style={{ fontSize: '1.125em', opacity: TEXT_OPACITY.heading }}>{title}</h2>
      )}
      {right != null && (
        <span
          className="ml-auto shrink-0 whitespace-nowrap tabular-nums"
          style={{ fontSize: `${TITLE_ROW_RIGHT_EM}em`, color: ink(TEXT_OPACITY.secondary) }}
        >
          {right}
        </span>
      )}
    </div>
  );
}
