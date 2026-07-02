import type { EventOverlapMode } from '@/types/config';

export interface OverlapLayout {
  left: number;   // 0-1 fraction of the day column
  width: number;  // 0-1 fraction; 0 = hidden overflow (columns mode only)
  zIndex: number; // z-index for the event block (base 2, above hour lines)
}

interface OverlapInput {
  id: string;
  startHour: number;
  endHour: number;
}

const MAX_VISIBLE_COLUMNS = 3; // columns mode: concurrent events beyond this are hidden
const STACK_INDENT = 0.12;     // stacked mode: fraction indented per overlap level
const MAX_STACK_LEVEL = 5;     // stacked mode: indent stops growing past this level
const MAX_STACK_ZINDEX_LEVEL = 7; // stacked mode: z-index stops rising past this level — must stay below the NowLine's zIndex 10

export function computeOverlapLayout(
  events: OverlapInput[],
  mode: EventOverlapMode = 'columns',
): Map<string, OverlapLayout> {
  const result = new Map<string, OverlapLayout>();
  if (events.length === 0) return result;

  // Sort by start time, then by duration (longer first)
  const sorted = [...events].sort((a, b) =>
    a.startHour - b.startHour || (b.endHour - b.startHour) - (a.endHour - a.startHour),
  );

  // Greedy column assignment
  const columns: Array<{ endHour: number; id: string }>[] = [];
  const eventColumn = new Map<string, number>();

  for (const ev of sorted) {
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      const last = columns[col][columns[col].length - 1];
      if (last.endHour <= ev.startHour) {
        columns[col].push(ev);
        eventColumn.set(ev.id, col);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([ev]);
      eventColumn.set(ev.id, columns.length - 1);
    }
  }

  if (mode === 'stacked') {
    // Cascade: each overlap level is indented and raised, nothing is hidden
    for (const ev of sorted) {
      const col = eventColumn.get(ev.id) ?? 0;
      const left = Math.min(col, MAX_STACK_LEVEL) * STACK_INDENT;
      result.set(ev.id, { left, width: 1 - left, zIndex: 2 + Math.min(col, MAX_STACK_ZINDEX_LEVEL) });
    }
    return result;
  }

  const maxCols = Math.min(columns.length, MAX_VISIBLE_COLUMNS);
  const colWidth = 1 / maxCols;

  for (const ev of sorted) {
    const col = eventColumn.get(ev.id) ?? 0;
    if (col >= maxCols) {
      // Overflow events get hidden (parent skips rendering width-0 layouts)
      result.set(ev.id, { left: 0, width: 0, zIndex: 2 });
    } else {
      result.set(ev.id, { left: col * colWidth, width: colWidth, zIndex: 2 });
    }
  }

  return result;
}
