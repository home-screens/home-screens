import type { CSSProperties } from 'react';
import { NoteGlyph } from '@/components/notes/NoteGlyph';
import { INK } from '@/lib/constants';

/**
 * A calendar day note on the wall: the family's own words for that day, in a
 * soft yellow wash with a yellow edge, above the day's events. Yellow is the
 * note colour everywhere (the phone's rows share it), and the text is yellow
 * mixed with the surface's own ink, so the same line reads on a dark photo
 * card and on a light one.
 *
 * `module` follows the Calendar card's ink (`--module-ink`); `fullscreen`
 * follows the full-screen calendar's theme (`dayNoteColors`, set on its
 * root). Sizes are the caller's: `style` carries the font size and spacing
 * each view needs.
 */

const YELLOW = '#facc15';
const DEEP_YELLOW = '#ca8a04';

/**
 * The full-screen calendar's note colours, set as CSS variables on its root
 * for its theme: a light theme takes a stronger wash with deep yellow words;
 * a dark one a lighter wash with bright words, since a strong yellow wash
 * over near-black reads as olive.
 */
export function dayNoteColors(isDark: boolean): Record<string, string> {
  return isDark
    ? {
        '--cal-note-bg': `color-mix(in srgb, ${YELLOW} 13%, transparent)`,
        '--cal-note-edge': YELLOW,
        '--cal-note-text': `color-mix(in srgb, ${YELLOW} 50%, var(--cal-text-primary))`,
      }
    : {
        '--cal-note-bg': `color-mix(in srgb, ${YELLOW} 22%, transparent)`,
        '--cal-note-edge': `color-mix(in srgb, ${DEEP_YELLOW} 85%, var(--cal-text-primary))`,
        '--cal-note-text': `color-mix(in srgb, ${DEEP_YELLOW} 55%, var(--cal-text-primary))`,
      };
}

const TONES = {
  module: {
    background: `color-mix(in srgb, ${YELLOW} 15%, transparent)`,
    edge: `color-mix(in srgb, ${YELLOW} 85%, ${INK})`,
    color: `color-mix(in srgb, ${YELLOW} 45%, ${INK})`,
  },
  fullscreen: {
    background: 'var(--cal-note-bg)',
    edge: 'var(--cal-note-edge)',
    color: 'var(--cal-note-text)',
  },
} as const;

interface DayNoteLineProps {
  text: string;
  tone: keyof typeof TONES;
  /** 1: one line cut with an ellipsis (grid cells, headers). 2 or 3: wraps before it is cut (columns and lists). */
  lines?: 1 | 2 | 3;
  style?: CSSProperties;
}

/** A day's notes, one line each in the order they were written; `style` applies to every line. */
export function DayNoteLines({ notes, ...line }: Omit<DayNoteLineProps, 'text'> & { notes: readonly string[] }) {
  return <>{notes.map((text, i) => <DayNoteLine key={`${i}:${text}`} text={text} {...line} />)}</>;
}

export function DayNoteLine({ text, tone, lines = 1, style }: DayNoteLineProps) {
  const colors = TONES[tone];
  const words: CSSProperties = lines === 1
    ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }
    : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere', hyphens: 'auto', minWidth: 0 };
  return (
    <div
      data-day-note=""
      style={{
        display: 'flex',
        alignItems: lines === 1 ? 'center' : 'flex-start',
        gap: '0.3em',
        lineHeight: 1.3,
        fontWeight: 600,
        textAlign: 'left',
        borderRadius: 3,
        background: colors.background,
        borderLeft: `2px solid ${colors.edge}`,
        color: colors.color,
        minWidth: 0,
        flexShrink: 0,
        ...style,
      }}
    >
      <NoteGlyph strokeWidth={2.2} style={{ color: colors.edge, ...(lines > 1 ? { marginTop: '0.15em' } : {}) }} />
      <span style={words}>{text}</span>
    </div>
  );
}
