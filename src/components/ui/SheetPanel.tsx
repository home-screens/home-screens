'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { useSheetDialog } from '@/hooks/useSheetDialog';

/**
 * A sheet's panel as the modal dialog it is (`useSheetDialog`), as a
 * component: for a sheet drawn through `ModalPortal`, whose panel is not on
 * the page yet when the sheet itself mounts, so a hook called up there would
 * find nothing to hold focus in.
 */
export default function SheetPanel({
  onClose,
  style,
  ...rest
}: Omit<ComponentPropsWithoutRef<'div'>, 'role' | 'tabIndex' | 'onKeyDown'> & {
  /** What Escape does; leave out while the sheet must not be closed. */
  onClose?: () => void;
}) {
  const dialog = useSheetDialog<HTMLDivElement>({ onClose });
  return <div {...rest} {...dialog} style={{ outline: 'none', ...style }} />;
}
