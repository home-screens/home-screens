'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveSwatches } from '@/lib/calendar-color';
import { wallPress } from './wallPress';
import { DISPLAY_LAYERS } from '@/lib/display-layers';

const SWATCH = 52;
const GAP = 10;
const PAD = 14;
const COLUMNS = 4;
const WIDTH = COLUMNS * SWATCH + (COLUMNS - 1) * GAP + PAD * 2;
const EDGE = 8;

/**
 * Recolour one calendar by tapping its legend dot.
 *
 * Deliberately NOT `<input type="color">`, which every other colour control in
 * this app uses. That opens the operating system's colour dialog, and on the
 * kiosk that dialog is a separate window: there is no window manager chrome to
 * close it by touch, and while it is open Chromium delivers no further events
 * to the page, so a mis-tap would strand the wall until someone found a
 * keyboard. A handful of fixed swatches is also the better control at arm's
 * length, where a hue gradient cannot be hit accurately.
 *
 * The chosen colour previews immediately and is saved when the sheet is
 * dismissed, so a run through the swatches costs one write rather than one
 * per tap.
 */
export function LegendColorPopover({
  anchor, value, label, onPreview, onCommit, swatches,
}: {
  /** Where the tapped dot is, so the sheet opens beside it. */
  anchor: DOMRect;
  /** The colour the calendar is now, ringed in the grid. */
  value: string;
  /** Accessible name, e.g. "Colour for Birthdays". */
  label: string;
  /** Paint this colour on the wall straight away, without saving. */
  onPreview: (color: string) => void;
  /** Dismissed: save, or restore if nothing was chosen. */
  onCommit: (color: string | null) => void;
  /** The household's colours; absent means the ones every calendar is offered. */
  swatches?: string[];
}) {
  // The household's own, falling back per slot to the ones every calendar is
  // offered in Settings, so the wall and the editor agree on what is on offer.
  const palette = resolveSwatches(swatches);
  const [draft, setDraft] = useState<string | null>(null);
  // `onCommit` through a ref so the unmount cleanup cannot capture a stale
  // closure and save a colour the viewer has already moved on from.
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Escape closes it like any other sheet; a keyboard is rare on the wall but
  // the editor preview is reachable from one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') commitRef.current(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (typeof document === 'undefined') return null;

  // Centred under the dot, pulled back from either edge so a legend row at the
  // far right of a wide header cannot push the sheet off screen.
  const left = Math.min(
    Math.max(anchor.left + anchor.width / 2 - WIDTH / 2, EDGE),
    Math.max(window.innerWidth - WIDTH - EDGE, EDGE),
  );
  const below = anchor.bottom + 10;
  // Measured from the palette rather than assumed, so adding colours cannot
  // leave the flip-above test believing the sheet is shorter than it is.
  const rows = Math.ceil(palette.length / COLUMNS);
  const height = rows * SWATCH + (rows - 1) * GAP + PAD * 2;
  // Flip above the dot when there is no room beneath it.
  const top = below + height > window.innerHeight - EDGE
    ? Math.max(anchor.top - height - 10, EDGE)
    : below;

  const selected = (draft ?? value).toLowerCase();

  return createPortal(
    <div
      // Full-viewport catcher: anywhere outside the sheet saves and closes,
      // which is the only dismissal gesture that needs no visible button.
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) commitRef.current(draftRef.current);
      }}
      style={{ position: 'fixed', inset: 0, zIndex: DISPLAY_LAYERS.moduleOverlay, background: 'rgba(0,0,0,0.35)' }}
    >
      <div
        role="dialog"
        aria-label={label}
        data-testid="legend-color-popover"
        // Without this a drag across the swatches is read as a screen flick.
        data-swipe-ignore=""
        style={{
          position: 'fixed',
          left,
          top,
          width: WIDTH,
          padding: PAD,
          display: 'grid',
          gridTemplateColumns: `repeat(${COLUMNS}, ${SWATCH}px)`,
          gap: GAP,
          borderRadius: 16,
          background: '#1c1c1f',
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
        }}
      >
        {palette.map((color) => {
          const isCurrent = color.toLowerCase() === selected;
          return (
            <button
              key={color}
              {...wallPress()}
              type="button"
              aria-label={color}
              aria-pressed={isCurrent}
              onClick={() => { setDraft(color); onPreview(color); }}
              style={{
                width: SWATCH,
                height: SWATCH,
                borderRadius: '50%',
                background: color,
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                // The ring sits outside the circle so it never shrinks the
                // colour being judged.
                boxShadow: isCurrent ? '0 0 0 3px #1c1c1f, 0 0 0 6px #ffffff' : undefined,
              }}
            />
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
