'use client';

import { useRef } from 'react';
import type { FamilyMember } from '@/types/family';
import type { Note } from '@/types/notes';
import { DIVIDER, ink } from '@/lib/constants';
import { sortByTime } from '@/lib/notes-rules';
import { AuthorBubble } from './AuthorBubble';
import { useFitCount } from './useFitCount';
import { DANGER_INK, MORE_LINE_EM, MoreLine, WarnGlyph, authorOf, type NoteAuthor, type NotesContext } from './shared';

interface PersonRow {
  author: NoteAuthor;
  /** Their newest live note, if any. */
  newest: Note | null;
  count: number;
}

/**
 * One row per family member in roster order, then "Someone" for notes with
 * no author (or one who has left the family), only when there are any.
 */
function personRows(all: readonly Note[], roster: readonly FamilyMember[], ctx: NotesContext): PersonRow[] {
  const byAuthor = new Map<string, Note[]>();
  const someone: Note[] = [];
  for (const note of sortByTime(all)) {
    if (note.authorId && ctx.members.has(note.authorId)) {
      const list = byAuthor.get(note.authorId);
      if (list) list.push(note);
      else byAuthor.set(note.authorId, [note]);
    } else {
      someone.push(note);
    }
  }
  const rows: PersonRow[] = roster.map((member) => {
    const theirs = byAuthor.get(member.id) ?? [];
    return { author: { id: member.id, name: member.name, color: member.color }, newest: theirs[0] ?? null, count: theirs.length };
  });
  if (someone.length > 0) {
    rows.push({ author: authorOf({}, ctx.members, ctx.t), newest: someone[0], count: someone.length });
  }
  return rows;
}

/**
 * By person: who has said what. A person with nothing up keeps their row
 * ("No notes" in faint ink), so a kid finds their own row every time. Shows
 * the whole board whatever the filter or the note limit say.
 */
export function ByPersonView({ ctx, all, roster }: { ctx: NotesContext; all: Note[]; roster: readonly FamilyMember[] }) {
  const rows = personRows(all, roster, ctx);
  const listRef = useRef<HTMLUListElement>(null);
  const key = rows.map((r) => `${r.author.id}:${r.newest?.id ?? ''}:${r.newest?.text.length ?? 0}:${r.count}`).join('|') + `#${ctx.fontPx}`;
  const visible = useFitCount(listRef, key, ctx.fontPx * MORE_LINE_EM);
  const drawn = visible === null ? rows : rows.slice(0, visible);
  return (
    <>
      <ul ref={listRef} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {drawn.map((row, i) => {
          const imp = !!row.newest?.important;
          return (
            <li
              key={row.author.id ?? 'someone'}
              data-testid="notes-person"
              data-fit={row.author.id ?? 'someone'}
              className="flex items-center shrink-0 min-w-0"
              style={{ gap: '0.58em', padding: '0.46em 0', borderBottom: i === drawn.length - 1 ? 'none' : `1px solid ${DIVIDER.visible}` }}
            >
              <AuthorBubble author={row.author} em={1.06} />
              <span className="truncate shrink-0" style={{ width: '5.2em', fontSize: '0.8em', fontWeight: 600 }}>{row.author.name}</span>
              {row.newest ? (
                <span
                  data-testid="notes-note"
                  data-important={imp ? '' : undefined}
                  className="flex items-center flex-1 min-w-0"
                  style={{ gap: '0.3em', fontSize: '0.8em', color: imp ? DANGER_INK : ink(0.85) }}
                >
                  {imp && <WarnGlyph />}
                  <span className="truncate">{row.newest.text}</span>
                </span>
              ) : (
                <span className="truncate flex-1 min-w-0" style={{ fontSize: '0.8em', color: ink(0.35) }}>{ctx.t('notes.noNotes')}</span>
              )}
              {row.count > 0 && (
                <span
                  className="shrink-0 tabular-nums"
                  style={{ fontSize: '0.6em', fontWeight: 700, padding: '0.15em 0.65em', borderRadius: '1em', backgroundColor: ink(0.12), color: ink(0.7) }}
                >
                  {row.count}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <MoreLine n={rows.length - drawn.length} t={ctx.t} />
    </>
  );
}
