'use client';

import type { ComponentProps } from 'react';
import { wallPress, wallRowPress } from './wallPress';

export interface WallButtonProps extends ComponentProps<'button'> {
  /**
   * A full-width row (a recipe, a story, a reward line): it tints under the
   * finger instead of shrinking (`wallRowPress`).
   */
  row?: boolean;
}

/**
 * A button on the wall. It is `type="button"` and draws the pressed look the
 * moment a finger lands (`wallPress`), so a tap on a slow Pi is answered
 * before the hub is and nobody taps twice. Its own classes and pointer
 * handlers are kept, after the press. Every wall `<button>` is one of these
 * or spreads `wallPress` / `wallRowPress` itself; a unit check holds that.
 */
export function WallButton({
  row = false, type = 'button', className, onPointerDown, onPointerUp, onPointerCancel, onPointerLeave, ...rest
}: WallButtonProps) {
  const press = (row ? wallRowPress : wallPress)(className, { onPointerDown, onPointerUp, onPointerCancel, onPointerLeave });
  return <button type={type} {...rest} {...press} />;
}
