'use client';

import { NOTE_PAGE_LOOKS, type NoteSurface } from '@/lib/note-drawing';
import type { Note } from '@/types/notes';
import { NoteDrawingArt } from '@/components/notes/NoteDrawingArt';
import { EVENT_DETAIL_AUTO_DISMISS_MS } from '../shared/EventDetailOverlay';
import { useWallOverlayScale } from '../shared/useWallOverlayScale';
import { WallButton } from '../shared/WallButton';
import { WallOverlay } from '../shared/WallOverlay';
import { WallScroller } from '../shared/WallScroller';
import { wallTypingVars } from '../shared/wallTypingVars';
import { AuthorBubble } from './AuthorBubble';
import { SHEET_THEME, SheetCloseButton } from './NoteDrawingOverlay';
import { NoteMarks, ageOf, authorOf, dangerTint, type NotesContext } from './shared';

/**
 * Every note the card is counting, in one sheet over the wall: what "and N
 * more" opens. A card shows the few notes that fit; here the whole board is
 * listed in the card's order and a finger scrolls it. Each note shows up to
 * four lines, and a tap opens it large (`NoteDrawingOverlay`) on top of this
 * list, so Close there comes back here. Nothing in it changes a note. It
 * closes by itself with nobody touching it, and waits while a note is open.
 */
export function NotesAllSheet({ notes, ctx, title, count, surface, accent, paused, onOpen, onClose }: {
  /** The card's notes after its filter, before its cap. */
  notes: readonly Note[];
  ctx: NotesContext;
  title: string;
  /** "8 notes". */
  count: string;
  /** The page a drawing is shown on: the card's own. */
  surface: NoteSurface;
  accent: string;
  /** A note is open on top. */
  paused: boolean;
  onOpen: (note: Note) => void;
  onClose: () => void;
}) {
  const { w, h, P } = useWallOverlayScale();
  const look = NOTE_PAGE_LOOKS[surface];
  return (
    <WallOverlay label={title} testId="notes-all-sheet" onClose={onClose} autoCloseMs={EVENT_DETAIL_AUTO_DISMISS_MS} paused={paused}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...wallTypingVars(SHEET_THEME, accent),
          // The rows' marks and bubbles are drawn in the card's ink: here that is the sheet's.
          ['--module-ink' as string]: 'var(--wt-text)',
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', animation: 'wall-card-in 250ms ease-out',
          display: 'flex', flexDirection: 'column', width: Math.min(w - P(180), P(900)), maxHeight: h - P(240), boxSizing: 'border-box',
          padding: `${P(36)}px ${P(44)}px 0`, borderRadius: P(44), background: 'var(--wt-surface)', color: 'var(--wt-text)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)', fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif', cursor: 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: P(18), marginBottom: P(22), flexShrink: 0 }}>
          <span style={{ fontSize: P(40), fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          <span style={{ fontSize: P(30), color: 'var(--wt-text-3)', whiteSpace: 'nowrap' }}>{count}</span>
          <span style={{ flex: 1 }} />
          <span style={{ alignSelf: 'center', display: 'inline-flex' }}><SheetCloseButton testId="notes-all-close" onClose={onClose} /></span>
        </div>
        <WallScroller
          enabled
          stays
          testId="notes-all-list"
          thumbColor="var(--wt-text-3)"
          thumbWidth={P(6)}
          // The important note's tint reaches past the words, as on the card.
          frameStyle={{ margin: `0 -${P(22)}px` }}
          style={{ padding: `0 ${P(22)}px`, touchAction: 'pan-y' }}
        >
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {notes.map((note, i) => {
              const author = authorOf(note, ctx.members, ctx.t);
              const age = ageOf(note, ctx);
              const imp = note.important;
              const last = i === notes.length - 1;
              return (
                <li key={note.id}>
                  <WallButton
                    row
                    data-testid="notes-all-note"
                    data-note={note.id}
                    onClick={() => onOpen(note)}
                    style={{
                      display: 'flex', gap: P(22), width: '100%', boxSizing: 'border-box', textAlign: 'left', font: 'inherit', fontSize: P(34),
                      color: 'inherit', cursor: 'pointer', touchAction: 'pan-y', border: 0,
                      borderBottom: imp || last ? 0 : `${P(2)}px solid var(--wt-border)`,
                      padding: imp ? `${P(26)}px ${P(22)}px` : `${P(26)}px 0`,
                      margin: imp ? `${P(6)}px -${P(22)}px` : 0,
                      // The tint's inset widens the row, so its words stay in line with the plain rows.
                      ...(imp ? { width: `calc(100% + ${P(44)}px)` } : null),
                      borderRadius: imp ? P(24) : 0,
                      background: imp ? dangerTint(0.13) : 'transparent',
                    }}
                  >
                    {ctx.showAuthor && <AuthorBubble author={author} em={1.7} style={{ marginTop: '0.1em' }} />}
                    <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.6em', fontSize: P(25), color: 'var(--wt-text-2)', marginBottom: P(8) }}>
                        {ctx.showAuthor && <b style={{ color: 'var(--wt-text)', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{author.name}</b>}
                        {age && <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{age}</span>}
                        <span style={{ marginLeft: 'auto', display: 'inline-flex' }}><NoteMarks note={note} t={ctx.t} /></span>
                      </span>
                      {note.drawing ? (
                        <span
                          style={{
                            display: 'block', height: P(150), width: P(200), borderRadius: P(16), padding: P(4), boxSizing: 'border-box',
                            background: look.background, color: look.ink, boxShadow: `0 0 0 ${P(2)}px var(--wt-border)`,
                          }}
                        >
                          <NoteDrawingArt drawing={note.drawing} surface={surface} label={ctx.t('notes.drawingFrom', { name: author.name })} />
                        </span>
                      ) : (
                        <span className="line-clamp-4" style={{ fontWeight: 500, lineHeight: 1.3, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                          {note.text}
                        </span>
                      )}
                    </span>
                  </WallButton>
                </li>
              );
            })}
          </ul>
        </WallScroller>
        <div style={{ flexShrink: 0, textAlign: 'center', fontSize: P(24), color: 'var(--wt-text-3)', padding: `${P(18)}px 0 ${P(26)}px` }}>
          {ctx.t('notes.tapToRead')}
        </div>
      </div>
    </WallOverlay>
  );
}
