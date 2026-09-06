import type { CSSProperties } from 'react';
import type { ClockConfig } from '@/types/config';

/**
 * Where the clock sits in its box, as the flex placement of each view's root.
 *
 * Every view's root is a flex container that used to hard-code
 * `items-center justify-center`. That centered the clock in a box that was
 * always bigger than it, and it is also why Text size could never pin a clock
 * to a corner: a line wider than the box grows out of the middle in both
 * directions, and ModuleWrapper clips both ends. With the placement here a
 * clock pinned top-left grows right and down out of that corner, the same way
 * the Text module's alignment behaves.
 *
 * The root's flex direction decides which axis each setting lands on, so the
 * view says which it is. Absent settings center, which is exactly what every
 * root rendered before the settings existed.
 */
const HORIZONTAL: Record<NonNullable<ClockConfig['alignment']>, CSSProperties['justifyContent']> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
};

const VERTICAL: Record<NonNullable<ClockConfig['verticalAlign']>, CSSProperties['justifyContent']> = {
  top: 'flex-start',
  center: 'center',
  bottom: 'flex-end',
};

export function clockAlignmentStyle(
  config: Pick<ClockConfig, 'alignment' | 'verticalAlign'>,
  direction: 'row' | 'column',
): Pick<CSSProperties, 'justifyContent' | 'alignItems'> {
  const horizontal = HORIZONTAL[config.alignment ?? 'center'] ?? 'center';
  const vertical = VERTICAL[config.verticalAlign ?? 'center'] ?? 'center';
  return direction === 'row'
    ? { justifyContent: horizontal, alignItems: vertical }
    : { justifyContent: vertical, alignItems: horizontal };
}
