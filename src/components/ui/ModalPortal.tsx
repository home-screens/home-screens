'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders a `fixed inset-0` modal at `document.body` so it ranks in the root
 * stacking context wherever it was opened from. Without this a modal opened
 * from inside the editor canvas frame (`isolation: isolate`) is trapped in
 * the frame's layer, and sibling chrome such as the canvas toolbar paints
 * over its backdrop and stays clickable.
 *
 * Portals need a DOM target, so nothing renders until after mount; modals
 * only open from user actions, so no first paint is ever lost.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.body); }, []);
  return target ? createPortal(children, target) : null;
}
