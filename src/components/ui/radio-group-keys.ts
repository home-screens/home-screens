import type { KeyboardEvent } from 'react';

/**
 * Keyboard for a hand-built `role="radiogroup"` whose options are buttons with
 * `role="radio"`: arrow keys, Home and End move the choice and the focus, the
 * way a native radio group does. Pair it with `radioTabIndex` so the group is
 * one tab stop. `SegmentedControl` does the same for its own look.
 */
export function radioGroupKeyDown<T>(values: readonly T[], current: T, select: (value: T) => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    const from = Math.max(0, values.indexOf(current));
    let to: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown': to = (from + 1) % values.length; break;
      case 'ArrowLeft':
      case 'ArrowUp': to = (from - 1 + values.length) % values.length; break;
      case 'Home': to = 0; break;
      case 'End': to = values.length - 1; break;
      default: return;
    }
    event.preventDefault();
    select(values[to]);
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus();
  };
}

/** Only the chosen option is a tab stop; with none chosen, the first is. */
export function radioTabIndex<T>(values: readonly T[], current: T, value: T): 0 | -1 {
  return value === current || (!values.includes(current) && value === values[0]) ? 0 : -1;
}
