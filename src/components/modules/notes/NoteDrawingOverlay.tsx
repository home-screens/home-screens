'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Undo2, X } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { NOTE_PAGE_LOOKS, type NoteSurface } from '@/lib/note-drawing';
import { textLength } from '@/lib/text-length';
import { UNDO_WINDOW_MS } from '@/lib/undo-window';
import type { Note } from '@/types/notes';
import { NoteDrawingArt } from '@/components/notes/NoteDrawingArt';
import { EVENT_DETAIL_AUTO_DISMISS_MS } from '../shared/EventDetailOverlay';
import { useWallOverlayScale } from '../shared/useWallOverlayScale';
import { useSheetTapGuard } from '@/hooks/useSheetTapGuard';
import { WallButton } from '../shared/WallButton';
import { WallOverlay } from '../shared/WallOverlay';
import { wallTypingVars } from '../shared/wallTypingVars';
import { AuthorBubble } from './AuthorBubble';
import type { NoteAuthor } from './shared';

const SHEET_THEME = getThemeTokens('charcoal');

/** The type a note's words are read at when opened large, in authored pixels: the longer the note, the smaller. */
function wordsSize(text: string): number {
  const length = textLength(text);
  return length <= 80 ? 60 : length <= 200 ? 48 : 38;
}

/**
 * A note opened large: who it is from and when, then the drawing as big as
 * the wall allows or every word of a typed note (a card shows two or three
 * lines of it), and Close. Nothing here changes the note. A tap on the dark
 * part closes it, and so does nobody touching it for a while.
 */
export function NoteDrawingOverlay({ note, author, age, surface, accent, onClose }: {
  note: Note;
  author: NoteAuthor;
  /** "5h ago", or empty when the card hides ages. */
  age: string;
  surface: NoteSurface;
  accent: string;
  onClose: () => void;
}) {
  const t = useTranslate('modules');
  const { w, h, P } = useWallOverlayScale();
  // A double tap on Close must not reach the drawing underneath and open it again.
  useSheetTapGuard();
  // The note on the page of the card it was opened from: chalk on the chalkboard, dark ink on paper.
  const look = NOTE_PAGE_LOOKS[surface];
  // As wide as the wall allows with the card's own margins, and never taller than the window.
  const pageWidth = Math.min(w - P(180), (h - P(330)) * (4 / 3));
  return (
    <WallOverlay label={t(note.drawing ? 'notes.drawingFrom' : 'notes.noteFrom', { name: author.name })} testId="note-drawing-overlay" onClose={onClose} autoCloseMs={EVENT_DETAIL_AUTO_DISMISS_MS}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...wallTypingVars(SHEET_THEME, accent),
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', animation: 'wall-card-in 250ms ease-out',
          padding: `${P(36)}px ${P(44)}px ${P(44)}px`, borderRadius: P(44), background: 'var(--wt-surface)', color: 'var(--wt-text)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)', fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif', cursor: 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: P(18), fontSize: P(34), fontWeight: 600, marginBottom: P(22) }}>
          <span style={{ fontSize: P(44), display: 'inline-flex' }}><AuthorBubble author={author} /></span>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{author.name}</span>
          {age && <span style={{ color: 'var(--wt-text-3)', fontWeight: 400, whiteSpace: 'nowrap' }}>{age}</span>}
          <span style={{ flex: 1 }} />
          <WallButton
            data-testid="note-drawing-overlay-close"
            onClick={onClose}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: P(10), height: P(66), padding: `0 ${P(28)}px`, borderRadius: P(33),
              border: `${P(2)}px solid var(--wt-border)`, background: 'transparent', color: 'var(--wt-text)', font: 'inherit',
              fontSize: P(25), fontWeight: 600, cursor: 'pointer', flexShrink: 0,
            }}
          >
            <X size={P(26)} strokeWidth={2.6} aria-hidden="true" />
            {t('wallKeyboard.close')}
          </WallButton>
        </div>
        {note.drawing ? (
          <div
            style={{
              width: pageWidth, aspectRatio: '4 / 3', borderRadius: P(28), padding: P(10), boxSizing: 'border-box',
              background: look.background, color: look.ink, boxShadow: `0 0 0 ${P(2)}px var(--wt-border)`,
            }}
          >
            <NoteDrawingArt drawing={note.drawing} surface={surface} label={t('notes.drawing')} />
          </div>
        ) : (
          <div
            data-testid="note-words-large"
            style={{
              width: Math.min(pageWidth, P(900)), minHeight: P(260), maxHeight: h - P(330), overflowY: 'auto', scrollbarWidth: 'none', touchAction: 'pan-y',
              borderRadius: P(28), padding: `${P(34)}px ${P(40)}px`, boxSizing: 'border-box', background: look.background, color: look.ink,
              boxShadow: `0 0 0 ${P(2)}px var(--wt-border)`, fontSize: P(wordsSize(note.text)), fontWeight: 600, lineHeight: 1.28,
              whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
            }}
          >
            {note.text}
          </div>
        )}
      </div>
    </WallOverlay>
  );
}

/**
 * The line a wall shows after a drawing goes up: what happened, and Undo for
 * the usual few seconds (`UNDO_WINDOW_MS`). It floats over the wall near the
 * bottom, takes no room in any card, and goes by itself.
 */
export function NotePostedNotice({ words, detail, onUndo, onDone }: {
  words: string;
  /** A second, smaller line: a drawing came down to make room. */
  detail?: string;
  /** Take the note off again. Throws when the hub would not. */
  onUndo: () => Promise<void>;
  /** Its time is up, or the Undo went through. */
  onDone: () => void;
}) {
  const t = useTranslate('modules');
  const { P } = useWallOverlayScale();
  // `asking`: Undo was tapped and the hub has not answered. The line says so
  // and waits for the answer however long it takes, so a slow hub never
  // leaves someone believing a drawing came down when it did not.
  const [state, setState] = useState<'offered' | 'asking' | 'failed'>('offered');
  const busy = useRef(false);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });
  useEffect(() => {
    if (state === 'asking') return;
    const timer = setTimeout(() => done.current(), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [state]);
  if (typeof document === 'undefined') return null;
  const failed = state === 'failed';
  const undo = async () => {
    if (busy.current) return;
    busy.current = true;
    setState('asking');
    try {
      await onUndo();
      done.current();
    } catch {
      setState('failed');
    } finally {
      busy.current = false;
    }
  };
  return createPortal(
    <div
      role="status"
      data-testid="note-posted-notice"
      style={{
        ...wallTypingVars(SHEET_THEME, '#3b82f6'),
        // At the top: the cards' own "Draw a note" buttons sit along the bottom, and the next child is reaching for one.
        position: 'fixed', left: '50%', top: P(48), transform: 'translateX(-50%)', zIndex: DISPLAY_LAYERS.moduleOverlay,
        display: 'flex', alignItems: 'center', gap: P(20), minHeight: P(100), padding: `0 ${P(16)}px 0 ${P(34)}px`, borderRadius: P(50),
        background: 'var(--wt-surface)', color: 'var(--wt-text)', border: `${P(2)}px solid var(--wt-border)`, boxShadow: '0 16px 50px rgba(0,0,0,0.6)',
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif', fontSize: P(30), fontWeight: 600, whiteSpace: 'nowrap',
        animation: 'wall-scrim-in 200ms ease-out',
      }}
    >
      {state === 'offered' && <Check size={P(38)} strokeWidth={3} style={{ color: '#4ade80', flexShrink: 0 }} aria-hidden="true" />}
      <span data-state={state} style={{ padding: `${P(16)}px ${state === 'offered' ? 0 : P(18)}px ${P(16)}px 0` }}>
        {failed ? t('notes.wallPost.undoFailed') : state === 'asking' ? t('notes.wallPost.undoing') : words}
        {state === 'offered' && detail && (
          <span data-testid="note-posted-detail" style={{ display: 'block', fontSize: P(23), fontWeight: 500, color: 'var(--wt-text-2)', marginTop: P(2) }}>{detail}</span>
        )}
      </span>
      {state === 'offered' && (
        <WallButton
          data-testid="note-posted-undo"
          onClick={() => void undo()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: P(10), height: P(68), padding: `0 ${P(30)}px`, borderRadius: P(34),
            background: 'var(--wt-bg)', color: 'var(--wt-text)', border: `${P(2)}px solid var(--wt-border)`, font: 'inherit', fontSize: P(27),
            fontWeight: 650, cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Undo2 size={P(28)} strokeWidth={2.4} aria-hidden="true" />
          {t('notes.wallPost.undo')}
        </WallButton>
      )}
    </div>,
    document.body,
  );
}
