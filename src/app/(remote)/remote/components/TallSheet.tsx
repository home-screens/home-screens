'use client';

import type { CSSProperties, ReactNode } from 'react';
import SheetFrame from './SheetFrame';
import type { RemoteLayer } from './remote-layers';

/**
 * A tall sheet that slides over most of the phone: the meal sheet, the
 * recipe picker, Meals settings. A grab handle and a header row that stays
 * put (`title`, `subtitle`, and the close control), then whatever the caller
 * draws: a body that scrolls (`flex: 1, minHeight: 0, overflowY: 'auto'`), a
 * button pinned underneath. Tapping the dimmed area or Back closes it too.
 *
 * `BottomSheet` is the short one, whose whole panel scrolls.
 */
export default function TallSheet({
  label,
  title,
  subtitle,
  onClose,
  children,
  layer = 'sheet',
  testId,
  size = { maxHeight: '85vh' },
  guardTaps = false,
}: {
  /** What a screen reader calls the sheet. */
  label: string;
  /** The header row's title: words, or words with a mark beside them. */
  title: ReactNode;
  /** A small line under the title: the day, where it saves. */
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  layer?: RemoteLayer;
  testId?: string;
  /** A fixed `height` for a sheet whose list fills in as it loads, so it does not jump; else a `maxHeight`. */
  size?: Pick<CSSProperties, 'height' | 'maxHeight'>;
  /** As on `BottomSheet`: a second tap of a double tap never reaches what the sheet covered. */
  guardTaps?: boolean;
}) {
  return (
    <SheetFrame
      layer={layer}
      label={label}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      guardTaps={guardTaps}
      testId={testId}
      handle
      titleRowStyle={{ padding: '2px 16px 12px', marginBottom: 0, borderBottom: '1px solid var(--hs-border)' }}
      panelStyle={{
        background: 'var(--hs-bg-body)',
        borderRadius: '16px 16px 0 0',
        ...size,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </SheetFrame>
  );
}
