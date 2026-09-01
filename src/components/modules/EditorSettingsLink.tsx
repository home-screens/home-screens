'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';

/** Mirrors the editor canvas's drag activation distance (PointerSensor, 5px). */
const DRAG_DISTANCE = 5;

/**
 * A link inside a module empty state that only exists in the editor preview
 * (`buildModuleProps` sets the href for the editor surface alone).
 *
 * Two things make this more than an `<a>`: the canvas preview wrapper turns
 * pointer events off for the whole module, so the link opts itself back in;
 * and the module is draggable, so a press that starts on the link and travels
 * past the activation distance is a drag, not a click — dnd-kit stops the
 * click's propagation but does not cancel the anchor's navigation, which would
 * otherwise leave the editor mid-edit with the move unsaved.
 */
export function EditorSettingsLink({
  href,
  children,
  style,
}: {
  href: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  return (
    <a
      href={href}
      data-testid="location-settings-link"
      className="underline"
      style={{ ...style, pointerEvents: 'auto' }}
      onPointerDownCapture={(e) => { pressRef.current = { x: e.clientX, y: e.clientY }; }}
      onClick={(e) => {
        const press = pressRef.current;
        pressRef.current = null;
        if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) >= DRAG_DISTANCE) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </a>
  );
}
