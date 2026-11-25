import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Note } from '@/types/notes';
import type { FamilyMember } from '@/types/family';
import type { NotesContext } from '../shared';
import { DANGER } from '../shared';

// Every note fits: this test is about the paper, not the fitting.
vi.mock('../useFittedNotes', () => ({
  useFittedNotes: (_ctx: unknown, notes: Note[]) => ({ ref: { current: null }, drawn: notes, more: 0 }),
}));

const { StickyView } = await import('../StickyView');

// Marshall's colour is the important red itself; Alex's is pink.
const MARSHALL = { id: 'm1', name: 'Marshall', color: DANGER } as FamilyMember;
const ALEX = { id: 'm2', name: 'Alex', color: '#f472b6' } as FamilyMember;

function note(id: string, authorId: string, important: boolean): Note {
  const at = '2026-11-24T12:00:00.000Z';
  return { id, text: `Note ${id}`, authorId, important, pinned: false, life: '1d', createdAt: at, updatedAt: at, expiresAt: null };
}

const ctx: NotesContext = {
  members: new Map([[MARSHALL.id, MARSHALL], [ALEX.id, ALEX]]),
  showAuthor: true,
  showAge: false,
  now: new Date('2026-11-24T13:00:00.000Z'),
  locale: 'en-US',
  timeFormat: '12h' as NotesContext['timeFormat'],
  t: ((key: string) => (key === 'notes.important' ? 'Important' : key)) as NotesContext['t'],
  fontPx: 20,
};

/** Each paper's markup, keyed by its note id. */
function papers(notes: Note[]): Map<string, string> {
  const html = renderToStaticMarkup(<StickyView ctx={ctx} shown={notes} hidden={0} width={900} />);
  const parts = html.split('data-testid="notes-note"').slice(1);
  return new Map(parts.map((part) => [/data-fit="([^"]+)"/.exec(part)![1], part]));
}

describe('StickyView papers', () => {
  it('draws an ordinary note on its author paper even when that colour is the important red, with no band', () => {
    const paper = papers([note('a', MARSHALL.id, false)]).get('a')!;
    expect(paper).toContain(`${DANGER} 55%`);
    expect(paper).not.toContain('notes-sticky-band');
    expect(paper).not.toContain('Important');
  });

  it('keeps an important note on its author paper and marks it with the band, the sign and the word', () => {
    const paper = papers([note('b', ALEX.id, true)]).get('b')!;
    expect(paper).toContain('#f472b6 55%');
    expect(paper).toContain('data-testid="notes-sticky-band"');
    expect(paper).toContain('Important');
  });

  it('tells Marshall\'s ordinary note from his important one only by the band', () => {
    const drawn = papers([note('c', MARSHALL.id, false), note('d', MARSHALL.id, true)]);
    expect(drawn.get('c')).not.toContain('notes-sticky-band');
    expect(drawn.get('d')).toContain('notes-sticky-band');
    // The paper (the first background in its markup) is the same for both:
    // red paper alone never means important.
    const paperOf = (html: string) => /background:([^;"]+)/.exec(html)![1];
    expect(paperOf(drawn.get('c')!)).toBe(paperOf(drawn.get('d')!));
  });
});
