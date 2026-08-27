import type { EventOverlapMode } from '@/types/config';

export interface OverlapLayout {
  left: number;   // 0-1 fraction of the day column
  width: number;  // 0-1 fraction; 0 = hidden overflow (columns mode only)
  zIndex: number; // z-index for the event block (base 2, above hour lines)
}

/** The z-index of a block that sits on nothing. In stacked mode anything
 *  above it is layered over another block and must paint opaquely. */
export const EVENT_BLOCK_BASE_ZINDEX = 2;

interface OverlapInput {
  id: string;
  startHour: number;
  endHour: number;
}

const MAX_VISIBLE_COLUMNS = 3; // columns mode: concurrent events beyond this are hidden
const STACK_INDENT = 0.12;     // stacked mode: fraction indented per overlap level
const MAX_STACK_LEVEL = 5;     // stacked mode: indent stops growing past this level
const MAX_STACK_ZINDEX_LEVEL = 7; // stacked mode: z-index stops rising past this level — must stay below the NowLine's zIndex 10

/**
 * Split events (already sorted by start) into connected overlap clusters: a
 * run of events where each one starts before the furthest end reached so
 * far. Two clusters never share a moment, so each gets to size its own
 * columns — a lone 8 AM standup stays full width even when the evening has
 * a three-way pile-up. Sizing the whole day off the day's worst moment is
 * what made every title on a mostly-empty day truncate.
 */
function clusterByOverlap(sorted: OverlapInput[]): OverlapInput[][] {
  const clusters: OverlapInput[][] = [];
  let current: OverlapInput[] = [];
  let reach = -Infinity;
  for (const ev of sorted) {
    if (current.length > 0 && ev.startHour >= reach) {
      clusters.push(current);
      current = [];
      reach = -Infinity;
    }
    current.push(ev);
    reach = Math.max(reach, ev.endHour);
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

/** Greedy column assignment inside one cluster: reuse the first column whose
 *  last event has already ended. Returns each event's column index. */
function assignColumns(cluster: OverlapInput[]): { columnOf: Map<string, number>; count: number } {
  const columnEnds: number[] = [];
  const columnOf = new Map<string, number>();
  for (const ev of cluster) {
    let placed = false;
    for (let col = 0; col < columnEnds.length; col++) {
      if (columnEnds[col] <= ev.startHour) {
        columnEnds[col] = ev.endHour;
        columnOf.set(ev.id, col);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columnEnds.push(ev.endHour);
      columnOf.set(ev.id, columnEnds.length - 1);
    }
  }
  return { columnOf, count: columnEnds.length };
}

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

  for (const cluster of clusterByOverlap(sorted)) {
    const { columnOf, count } = assignColumns(cluster);

    if (mode === 'stacked') {
      // Cascade: each overlap level is indented and raised, nothing is hidden
      for (const ev of cluster) {
        const col = columnOf.get(ev.id) ?? 0;
        const left = Math.min(col, MAX_STACK_LEVEL) * STACK_INDENT;
        result.set(ev.id, { left, width: 1 - left, zIndex: EVENT_BLOCK_BASE_ZINDEX + Math.min(col, MAX_STACK_ZINDEX_LEVEL) });
      }
      continue;
    }

    const maxCols = Math.min(count, MAX_VISIBLE_COLUMNS);
    const colWidth = 1 / maxCols;
    for (const ev of cluster) {
      const col = columnOf.get(ev.id) ?? 0;
      if (col >= maxCols) {
        // Overflow events get hidden (parent skips rendering width-0 layouts)
        result.set(ev.id, { left: 0, width: 0, zIndex: EVENT_BLOCK_BASE_ZINDEX });
      } else {
        result.set(ev.id, { left: col * colWidth, width: colWidth, zIndex: EVENT_BLOCK_BASE_ZINDEX });
      }
    }
  }

  return result;
}
