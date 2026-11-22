'use client';

import { Plus } from 'lucide-react';
import { DIVIDER, ink } from '@/lib/constants';
import { wallRowPress } from './wallPress';

/**
 * The Add row at the foot of a list card on a touch wall ("Add to
 * Shopping"): the whole row is the target, at least as tall as an item row,
 * in the card's own type and accent, outside any scrolling part so it never
 * scrolls away. It opens the card's add sheet (`WallAddSheet`).
 */
export function WallAddRow({ label, accent, onPress, size = 'regular', testId = 'wall-add-row' }: {
  label: string;
  accent: string;
  onPress: () => void;
  /** `regular` under a List or grocery card; `small` under a Compact card or a Board column. */
  size?: 'regular' | 'small';
  testId?: string;
}) {
  const small = size === 'small';
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onPress}
      {...wallRowPress('flex items-center w-full text-left cursor-pointer select-none shrink-0')}
      style={{
        gap: small ? '0.45em' : '0.56em',
        minHeight: small ? 44 : 52,
        padding: small ? '0.24em 0' : '0.36em 0',
        marginTop: '0.2em',
        border: 0,
        borderTop: `1px solid ${DIVIDER.strong}`,
        background: 'none',
        font: 'inherit',
        fontSize: small ? '0.82em' : '0.9em',
        fontWeight: 550,
        color: ink(0.82),
        touchAction: 'manipulation',
      }}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center rounded-full shrink-0"
        style={{
          width: '1.3em',
          height: '1.3em',
          background: `color-mix(in srgb, ${accent} 30%, transparent)`,
          // The accent lifted toward the card's ink, so the + reads on a dark card and a light one.
          color: `color-mix(in srgb, ${accent} 55%, ${ink(1)})`,
        }}
      >
        <Plus style={{ width: '0.85em', height: '0.85em' }} strokeWidth={3} />
      </span>
      <span className="truncate min-w-0">{label}</span>
    </button>
  );
}
