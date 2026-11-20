import { KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * Sensor set shared by the editor's @dnd-kit sortable lists (screen tabs,
 * profile cards, per-profile screen rows): a PointerSensor with a small
 * activation distance so a drag doesn't fire on a click or a scroll, plus a
 * KeyboardSensor wired to the sortable coordinate getter for keyboard a11y.
 *
 * The activation distance is the only thing that varies between call sites
 * (screen tabs use 8px, the rest 5px), so it's the single parameter. The
 * freeform editor canvas is intentionally NOT a caller — it drags absolute
 * positions and omits the KeyboardSensor, so it keeps its own PointerSensor.
 */
export function useSortableSensors(activationDistance = 5) {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: activationDistance } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/**
 * Where a finished drag moves a row: both positions in `ids`, or null when
 * the row was dropped where it started, off the list, or either end is no
 * longer in it. Every sortable list in the editor ends its drag this way and
 * then either calls a store action or moves the array itself.
 */
export function dragEndIndices(
  event: DragEndEvent,
  ids: readonly (string | number)[],
): { from: number; to: number } | null {
  const { active, over } = event;
  if (!over || active.id === over.id) return null;
  const from = ids.indexOf(active.id);
  const to = ids.indexOf(over.id);
  return from === -1 || to === -1 ? null : { from, to };
}
