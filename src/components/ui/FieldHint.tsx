'use client';

import { createContext, useContext, type HTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Which editor surface a field is drawn on. `panel` is the property panel's
 * narrow column of compact controls; `page` is the roomier Settings pages
 * and windows; `prose` is a window whose every screen teaches (the timetables
 * window), where the notes are set at the larger prose tier. Each has one
 * hint size, so a hint reads the same wherever it sits on that surface.
 */
export type FieldSurface = 'panel' | 'page' | 'prose';

const FieldSurfaceContext = createContext<FieldSurface>('panel');

/** Marks everything inside as being on one surface (the Settings page and `ModalFrame` wrap their content in `page`). */
export function FieldSurfaceProvider({ surface, children }: { surface: FieldSurface; children: ReactNode }) {
  return <FieldSurfaceContext.Provider value={surface}>{children}</FieldSurfaceContext.Provider>;
}

/** Type size of a hint on each surface. */
export const FIELD_HINT_SIZE: Record<FieldSurface, string> = {
  panel: 'text-[11px] leading-relaxed',
  page: 'text-xs',
  prose: 'text-[13px] leading-relaxed',
};

/**
 * The faint line under a field that says what it does. `LabeledField`'s
 * `hint`, `Toggle`'s `description` and `Slider`'s `hint` all draw through it;
 * a hand-written hint uses it directly. Size and colour come from here, so a
 * caller adds only spacing. Give it an `id` when a control points at it with
 * `aria-describedby`.
 *
 * `tone="warning"` is for the same line once the field's value will not work
 * as set (a group with nobody in it, a screen nothing opens): it keeps its
 * place and size and only turns amber.
 */
export default function FieldHint({
  tone,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLParagraphElement> & { tone?: 'warning' }) {
  const surface = useContext(FieldSurfaceContext);
  return (
    <p
      className={clsx(FIELD_HINT_SIZE[surface], tone === 'warning' ? 'text-hs-warning-ink' : 'text-hs-text-faint', className)}
      {...rest}
    >
      {children}
    </p>
  );
}
