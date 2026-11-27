import type { CSSProperties, ReactNode } from 'react';
import { ChevronRight, Pencil, Pin, TriangleAlert } from 'lucide-react';
import type { FamilyMember } from '@/types/family';
import type { Note } from '@/types/notes';
import type { TimeFormat } from '@/types/config';
import type { TranslateFn } from '@/i18n';
import { INK, ink } from '@/lib/constants';
import { formatNoteAge } from '@/lib/notes-rules';
import { getUniqueInitials, memberInitials } from '@/lib/family-avatar';
import { WallButton } from '../shared/WallButton';
import { NoteDrawingArt } from '@/components/notes/NoteDrawingArt';
import type { NoteSurface } from '@/lib/note-drawing';

/**
 * Pieces every Notes view shares: who wrote a note, how old it reads, the
 * pin and warning glyphs, the header, and the "and N more" line. The rules
 * (order, cap, expiry, age wording) live in `lib/notes-rules.ts`; this file
 * only draws them.
 */

/** The danger colour for important notes, the same red in every view. */
export const DANGER = '#f87171';

/**
 * Danger text: the red mixed with the card's ink, so it reads as a light red
 * on a dark card (close to the mockup's #fca5a5) and a deep red on a light one.
 */
export const DANGER_INK = `color-mix(in srgb, ${DANGER} 72%, ${INK})`;

/** The danger red at an alpha, for the tinted block behind an important note. */
export function dangerTint(alpha: number): string {
  return `color-mix(in srgb, ${DANGER} ${Math.round(alpha * 100)}%, transparent)`;
}

/** Everything a view needs to draw a note besides the note itself. */
export interface NotesContext {
  members: ReadonlyMap<string, FamilyMember>;
  showAuthor: boolean;
  showAge: boolean;
  /** A real instant, ticking once a minute. */
  now: Date;
  locale: string;
  /** The household's zone, for weekday ages and day headings. */
  timezone?: string;
  /** The household's clock. */
  timeFormat: TimeFormat;
  t: TranslateFn;
  /** The fitted base font size in px, for the fit measurements. */
  fontPx: number;
  /**
   * On a wall that takes touch: a tap on a drawing's picture opens it large. Unset in the editor's canvas.
   * A tap anywhere else on a note's row opens it too, typed notes included (`openFromTap` in `NotesModule`).
   */
  onOpenDrawing?: (note: Note) => void;
  /**
   * On a wall that takes touch: "and N more" is a button that opens every
   * note in one sheet (`NotesAllSheet`). Unset in the editor's canvas, where
   * the line is drawn the same and takes no tap.
   */
  onSeeAll?: () => void;
}

/**
 * What a note says where only words fit (a one-line bar, a ticker, a row of
 * a person's newest): its text, or "Drawing" for a note that was drawn.
 */
export function noteWords(note: Pick<Note, 'text' | 'drawing'>, t: TranslateFn): string {
  return note.drawing ? t('notes.drawing') : note.text;
}

/** A small pencil and "Drawing", where a one-line view has no room for the picture. */
export function DrawingWords({ t }: { t: TranslateFn }) {
  return (
    <span data-testid="notes-drawing-words" className="inline-flex items-center" style={{ gap: '0.3em' }}>
      <Pencil size="0.85em" strokeWidth={2.2} className="shrink-0" aria-hidden="true" />
      {t('notes.drawing')}
    </span>
  );
}

/** A note's words, or the pencil and "Drawing" for a drawn one, for a one-line view. */
export function NoteLine({ note, t }: { note: Pick<Note, 'text' | 'drawing'>; t: TranslateFn }) {
  return note.drawing ? <DrawingWords t={t} /> : <>{note.text}</>;
}

/**
 * How tall a drawing sits where a note's words would be: the two lines of
 * words a Board row shows at most, so a drawing costs the card exactly what
 * a typed note does. Any taller and one drawing pushes the notes
 * under it off the card; a tap opens it large.
 */
export const DRAWING_ROW_HEIGHT = '2.6em';

/**
 * A drawn note inside a view, where its words would be: 4 wide by 3 tall,
 * `height` tall and left-aligned, or as wide as its box with `fill`. On a
 * wall that takes touch the picture is a button that opens it large; in the
 * editor's canvas it is only a picture.
 */
export function NoteDrawingBody({ note, ctx, surface = 'card', height = DRAWING_ROW_HEIGHT, fill = false, style }: {
  note: Note;
  ctx: NotesContext;
  surface?: NoteSurface;
  height?: string;
  /** Take the box's whole width (a sticky paper) instead of a set height. */
  fill?: boolean;
  style?: CSSProperties;
}) {
  if (!note.drawing) return null;
  const who = authorOf(note, ctx.members, ctx.t).name;
  // A set height gets a set width beside it rather than `aspect-ratio`: a
  // grid sizing its rows (the fridge's papers) takes an aspect-ratio box for
  // shorter than it is drawn, and the name under the picture then hangs out
  // of its paper. The picture inside keeps its shape either way.
  const sized = /(em|px)$/.test(height);
  const box: CSSProperties = {
    display: 'block',
    ...(fill ? { width: '100%', aspectRatio: '4 / 3' }
      : sized ? { height, width: `calc(${height} * 4 / 3)`, maxWidth: '100%', flexShrink: 0 }
        : { height, aspectRatio: '4 / 3', maxWidth: '100%' }),
    ...style,
  };
  const art = <NoteDrawingArt drawing={note.drawing} surface={surface} label={ctx.t('notes.drawingFrom', { name: who })} />;
  // A span, not a div: the newspaper's stories are paragraphs.
  if (!ctx.onOpenDrawing) return <span data-testid="notes-drawing" style={box}>{art}</span>;
  const open = ctx.onOpenDrawing;
  return (
    <WallButton
      data-testid="notes-drawing"
      aria-label={ctx.t('notes.openDrawing', { name: who })}
      onClick={() => open(note)}
      style={{ ...box, padding: 0, border: 0, background: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', touchAction: 'manipulation' }}
    >
      {art}
    </WallButton>
  );
}

/** Who wrote a note, ready to draw: a member, or "Someone" with no colour. */
export interface NoteAuthor {
  /** Member id, or null for "Someone" (no author, or one no longer in the family). */
  id: string | null;
  name: string;
  /** The member's colour; null draws the neutral bubble. */
  color: string | null;
  /** The letters for the author's bubble, unique across the family; "?" for "Someone". */
  initials: string;
}

/** Each roster's unique initials, worked out once per roster rather than once per note. */
const rosterInitials = new WeakMap<ReadonlyMap<string, FamilyMember>, Map<string, string>>();

export function authorOf(note: Pick<Note, 'authorId'>, members: ReadonlyMap<string, FamilyMember>, t: TranslateFn): NoteAuthor {
  const member = note.authorId ? members.get(note.authorId) : undefined;
  if (!member) return { id: null, name: t('notes.someone'), color: null, initials: '?' };
  // A bubble stands alone on its note, so two people never share its letters.
  let initials = rosterInitials.get(members);
  if (!initials) {
    initials = getUniqueInitials([...members.values()]);
    rosterInitials.set(members, initials);
  }
  return { id: member.id, name: member.name, color: member.color, initials: initials.get(member.id) ?? memberInitials(member.name) };
}

/** The note's age for the wall, or '' when the module hides ages. */
export function ageOf(note: Pick<Note, 'createdAt'>, ctx: NotesContext): string {
  return ctx.showAge ? formatNoteAge(note.createdAt, ctx.now, ctx.locale, ctx.timezone) : '';
}

/** A number setting from the config, rounded and held inside its range. */
export function clampSetting(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * What a fitted list is measured against: the notes it draws and anything
 * that changes their height. A new key renders every row once to measure.
 */
export function fitKeyOf(notes: readonly Note[], ...extra: (string | number | boolean)[]): string {
  // The wording itself, not its length: a space swapped for a line break
  // changes how a note wraps without changing how long it is.
  return notes
    .map((n) => `${n.id}:${n.updatedAt}:${n.text}:${n.drawing ? 'd' : ''}${n.pinned ? 1 : 0}${n.important ? 1 : 0}:${n.authorId ?? ''}`)
    .join('\u0000') + `#${extra.join(',')}`;
}

/** The pin glyph, em-sized so it follows the fitted type. */
export function PinGlyph({ size = '1.1em', color }: { size?: string; color?: string }) {
  return <Pin size={size} strokeWidth={2} className="shrink-0" style={{ color }} aria-hidden="true" />;
}

/** The warning triangle an important note carries in every view. */
export function WarnGlyph({ size = '1.1em', color = DANGER_INK }: { size?: string; color?: string }) {
  return <TriangleAlert size={size} strokeWidth={2.2} className="shrink-0" style={{ color }} aria-hidden="true" />;
}

/** The warning glyph and the word "Important", in the danger ink. */
export function ImportantFlag({ t }: { t: TranslateFn }) {
  return (
    <span
      data-testid="notes-important"
      className="inline-flex items-center shrink-0 whitespace-nowrap"
      style={{ gap: '0.25em', color: DANGER_INK, fontWeight: 700 }}
    >
      <WarnGlyph />
      {t('notes.important')}
    </span>
  );
}

/** The markers a note carries at the end of its author line: important first, then the pin. */
export function NoteMarks({ note, t, showPin = true, flag = true }: {
  note: Pick<Note, 'pinned' | 'important'>;
  t: TranslateFn;
  /** Off where the note sits under a "Pinned" heading already. */
  showPin?: boolean;
  /** The word "Important" beside the glyph; off where the line is short. */
  flag?: boolean;
}) {
  const pin = note.pinned && showPin;
  if (!note.important && !pin) return null;
  return (
    <span className="inline-flex items-center shrink-0" style={{ gap: '0.45em' }}>
      {note.important && (flag ? <ImportantFlag t={t} /> : <WarnGlyph />)}
      {pin && <PinGlyph color={ink(0.55)} />}
    </span>
  );
}

/** The pill's type as a share of the card's, its height and the gap above it, in its own ems. */
const MORE_PILL = { font: 0.66, height: 2.6, gap: 0.5 } as const;

/** Height kept for the "and N more" pill when a fitted list first has to drop a row, in base ems. */
export const MORE_LINE_EM = MORE_PILL.font * (MORE_PILL.height + MORE_PILL.gap);

const MORE_CHEVRON = <ChevronRight size="1em" strokeWidth={2.6} className="shrink-0" aria-hidden="true" />;

/**
 * "and N more" under a list that was capped or did not fit: a pill that
 * opens every note on a wall that takes touch. The editor's canvas draws the
 * same pill as a picture, so a card fits the same notes there as on the wall.
 */
export function MoreLine({ n, ctx }: { n: number; ctx: NotesContext }) {
  if (n <= 0) return null;
  const style: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.35em', minHeight: `${MORE_PILL.height}em`, padding: '0 1em 0 1.1em', border: 0,
    borderRadius: 999, background: ink(0.14), color: ink(0.92), font: 'inherit', fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap',
  };
  const words = ctx.t('notes.andMore', { n });
  return (
    <div className="shrink-0 flex" style={{ fontSize: `${MORE_PILL.font}em`, paddingTop: `${MORE_PILL.gap}em` }}>
      {ctx.onSeeAll ? (
        <WallButton data-testid="notes-more" onClick={ctx.onSeeAll} style={{ ...style, cursor: 'pointer', touchAction: 'manipulation' }}>
          {words}{MORE_CHEVRON}
        </WallButton>
      ) : (
        <span data-testid="notes-more" style={style}>{words}{MORE_CHEVRON}</span>
      )}
    </div>
  );
}

/**
 * A material's own "and N more" line, in its hand and ink and exactly the
 * box it has always had (some are measured as part of the fit): a button
 * that opens every note on a wall that takes touch, the same line as a
 * picture in the editor's canvas.
 */
export function MaterialMore({ n, ctx, as: Tag = 'div', className, style, ...attrs }: {
  n: number;
  ctx: NotesContext;
  /** The plain line's element where no tap is taken: a newspaper's is a paragraph. */
  as?: 'div' | 'p';
  className?: string;
  style?: CSSProperties;
  [attr: `data-${string}`]: string | undefined;
}) {
  if (n <= 0) return null;
  const words: ReactNode = (
    <>
      {ctx.t('notes.andMore', { n })}
      <ChevronRight size="0.95em" strokeWidth={2.6} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-0.12em', marginLeft: '0.2em' }} />
    </>
  );
  if (!ctx.onSeeAll) return <Tag data-testid="notes-more" {...attrs} className={className} style={style}>{words}</Tag>;
  return (
    <WallButton
      data-testid="notes-more"
      {...attrs}
      onClick={ctx.onSeeAll}
      // `notes-more-tap` reaches past the line, so a finger does not have to land on the letters.
      className={className ? `notes-more-tap ${className}` : 'notes-more-tap'}
      style={{
        font: 'inherit', display: 'block', width: '100%', padding: 0, margin: 0, border: 0, background: 'none', color: 'inherit',
        textAlign: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer', touchAction: 'manipulation', ...style,
      }}
    >
      {words}
    </WallButton>
  );
}
