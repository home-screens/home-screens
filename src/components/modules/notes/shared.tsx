import type { ReactNode } from 'react';
import { Pin, TriangleAlert } from 'lucide-react';
import type { FamilyMember } from '@/types/family';
import type { Note } from '@/types/notes';
import type { TranslateFn } from '@/i18n';
import { INK, ink } from '@/lib/constants';
import { formatNoteAge } from '@/lib/notes-rules';

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
  t: TranslateFn;
  /** The fitted base font size in px, for the fit measurements. */
  fontPx: number;
}

/** Who wrote a note, ready to draw: a member, or "Someone" with no colour. */
export interface NoteAuthor {
  /** Member id, or null for "Someone" (no author, or one no longer in the family). */
  id: string | null;
  name: string;
  /** The member's colour; null draws the neutral bubble. */
  color: string | null;
}

export function authorOf(note: Pick<Note, 'authorId'>, members: ReadonlyMap<string, FamilyMember>, t: TranslateFn): NoteAuthor {
  const member = note.authorId ? members.get(note.authorId) : undefined;
  if (!member) return { id: null, name: t('notes.someone'), color: null };
  return { id: member.id, name: member.name, color: member.color };
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
    .map((n) => `${n.id}:${n.updatedAt}:${n.text}:${n.pinned ? 1 : 0}${n.important ? 1 : 0}:${n.authorId ?? ''}`)
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

/** The title row of the views that have one: the title, and the count on the right. */
export function NotesHeader({ title, showTitle, meta }: { title: string; showTitle: boolean; meta: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between shrink-0" style={{ marginBottom: '0.66em', gap: '0.5em' }}>
      {showTitle && (
        <h2 className="font-semibold truncate" style={{ fontSize: '1.2em', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
          {title}
        </h2>
      )}
      <span className="ml-auto shrink-0 tabular-nums whitespace-nowrap" style={{ fontSize: '0.66em', color: ink(0.55) }}>
        {meta}
      </span>
    </div>
  );
}

/** Height kept for the "and N more" line when a fitted list first has to drop a row, in base ems. */
export const MORE_LINE_EM = 1.45;

/** "and N more" under a list that was capped or did not fit. */
export function MoreLine({ n, t }: { n: number; t: TranslateFn }) {
  if (n <= 0) return null;
  return (
    <div
      data-testid="notes-more"
      className="shrink-0"
      style={{ fontSize: '0.66em', lineHeight: 1.4, paddingTop: '0.6em', color: ink(0.5) }}
    >
      {t('notes.andMore', { n })}
    </div>
  );
}
