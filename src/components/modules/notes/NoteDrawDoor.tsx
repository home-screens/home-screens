'use client';

import { Pencil } from 'lucide-react';
import { DIVIDER, ink } from '@/lib/constants';
import { wallRowPress } from '../shared/wallPress';

/**
 * "Draw a note": the row at the foot of a Notes card on a touch wall, the
 * same piece as a list card's Add row with a pencil in place of the plus.
 * The whole row is the target, at least 52 px tall, outside the fitted list
 * so it never gives way to a note. It opens the drawing sheet
 * (`NoteDrawSheet`).
 */
export function NoteDrawDoor({ label, accent, onPress }: { label: string; accent: string; onPress: () => void }) {
  return (
    <button
      type="button"
      data-testid="note-draw-door"
      onClick={onPress}
      {...wallRowPress('flex items-center w-full text-left cursor-pointer select-none shrink-0')}
      style={{
        gap: '0.56em', minHeight: 52, padding: '0.36em 0', marginTop: '0.2em', border: 0, borderTop: `1px solid ${DIVIDER.strong}`,
        background: 'none', font: 'inherit', fontSize: '0.9em', fontWeight: 550, color: ink(0.82), touchAction: 'manipulation',
      }}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center rounded-full shrink-0"
        style={{
          width: '1.3em', height: '1.3em', background: `color-mix(in srgb, ${accent} 30%, transparent)`,
          // The accent lifted toward the card's ink, so the pencil reads on a dark card and a light one.
          color: `color-mix(in srgb, ${accent} 55%, ${ink(1)})`,
        }}
      >
        <Pencil style={{ width: '0.7em', height: '0.7em' }} strokeWidth={2.6} />
      </span>
      <span className="truncate min-w-0">{label}</span>
    </button>
  );
}

/**
 * The same button for a material that fills its card to the edge: a pill in
 * the material's own hand and ink, set by the tray (the whiteboard's
 * markers, the chalkboard's chalk) or at the foot of the paper.
 */
export function MaterialDrawDoor({ label, onPress, color, background, border, fontFamily, style }: {
  label: string;
  onPress: () => void;
  color: string;
  background?: string;
  border: string;
  fontFamily?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      data-testid="note-draw-door"
      onClick={onPress}
      {...wallRowPress('inline-flex items-center justify-center cursor-pointer select-none shrink-0')}
      style={{
        gap: '0.35em', minHeight: 52, padding: '0.1em 0.9em', borderRadius: 999, border, background: background ?? 'transparent', color,
        font: 'inherit', fontFamily, fontSize: '0.9em', fontWeight: 700, whiteSpace: 'nowrap', touchAction: 'manipulation', ...style,
      }}
    >
      <Pencil style={{ width: '0.8em', height: '0.8em' }} strokeWidth={2.4} aria-hidden="true" />
      {label}
    </button>
  );
}
