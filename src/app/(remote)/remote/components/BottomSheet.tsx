'use client';

import type { ReactNode } from 'react';
import SheetFrame from './SheetFrame';
import type { RemoteLayer } from './remote-layers';

/**
 * A short sheet that slides up from the bottom of the phone: the item and
 * list sheets on the Lists tab, the chore menu, a day note. Its title row
 * carries the close control; tapping the dimmed area or Back closes it too.
 * Sits on the `sheet` layer; one opened over another sheet takes
 * `sheetOverSheet`, and a question asked over a form takes `confirm`.
 */
export default function BottomSheet({
  title,
  titleAside,
  onClose,
  children,
  layer = 'sheet',
  testId,
  guardTaps = false,
  initialFocus = 'container',
}: {
  title: string;
  /** Small text on the right of the title row: a character count, a time left. */
  titleAside?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  layer?: RemoteLayer;
  testId?: string;
  /**
   * When it closes from a tap, a second tap near there is ignored for a
   * moment: for a sheet over a list where that tap would tick or pay for
   * something (the chore menu).
   */
  guardTaps?: boolean;
  /**
   * Where focus lands as it opens. `container` (the default) keeps a phone's
   * keyboard down over a sheet nobody has read yet; `field` focuses the first
   * text box, for a sheet opened by a tap that already meant "write".
   */
  initialFocus?: 'container' | 'field';
}) {
  return (
    <SheetFrame
      layer={layer}
      label={title}
      title={title}
      titleAside={titleAside}
      onClose={onClose}
      guardTaps={guardTaps}
      focus={initialFocus}
      testId={testId}
      bottomGap={36}
      panelStyle={{
        maxHeight: '90dvh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        background: 'var(--hs-bg-panel)',
        borderRadius: '20px 20px 0 0',
        padding: '20px 16px',
      }}
    >
      {children}
    </SheetFrame>
  );
}
