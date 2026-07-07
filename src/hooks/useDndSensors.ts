import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
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
