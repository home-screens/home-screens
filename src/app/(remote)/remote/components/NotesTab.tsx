'use client';

import { useId, useMemo, useState, type CSSProperties } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, ChevronUp, Pin, RotateCcw, TriangleAlert } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useFamilyData } from '@/hooks/useFamilyData';
import { arrangeNotes, formatNoteAge, goneNotes, timeLeftParts } from '@/lib/notes-rules';
import { DEFAULT_NOTE_LIFE, NOTES_LIMITS, type Note } from '@/types/notes';
import type { FamilyMember } from '@/types/family';
import { useNotes } from '../hooks/useNotes';
import { useHouseholdTimezone } from '../household-clock';
import AddBar, { ADD_BAR_HEIGHT } from './AddBar';
import ConfirmSheet from './ConfirmSheet';
import NotesSheet from './NotesSheet';
import { readRememberedAuthor, rememberAuthor } from './notes-author';
import { DANGER_BUTTON, GHOST_BUTTON } from './remote-styles';
import { NoteIcon } from '@/components/notes/NoteGlyph';
import DayNotesPage from './DayNotesPage';
import TabNotSetUp from './TabNotSetUp';
import TabHeader from './TabHeader';
import SegmentedTabs from './SegmentedTabs';
import { LoadFailed } from './RetryButton';
import EmptyState from './EmptyState';
import { memberInitials, memberInk } from '@/lib/family-avatar';


type SheetState = { mode: 'new'; text: string } | { mode: 'edit'; id: string };

const CARD: CSSProperties = {
  width: '100%',
  borderRadius: 14,
  border: '1px solid var(--hs-border)',
  background: 'var(--hs-bg-panel)',
  padding: '12px 12px 10px 14px',
  marginBottom: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  textAlign: 'left',
  color: 'inherit',
  fontFamily: 'inherit',
};

const TOP_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: 'var(--hs-text-muted)',
  minWidth: 0,
};

const NOTE_TEXT: CSSProperties = {
  display: 'block',
  fontSize: 15,
  lineHeight: 1.3,
  color: 'var(--hs-text-primary)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
};

const MARK: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: '3px 7px',
  borderRadius: 7,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const MARK_IMPORTANT: CSSProperties = {
  ...MARK,
  background: 'color-mix(in srgb, var(--hs-danger) 18%, transparent)',
  color: 'var(--hs-danger)',
};

const MARK_SOON: CSSProperties = {
  ...MARK,
  padding: '2px 6px',
  background: 'color-mix(in srgb, var(--hs-warning) 18%, transparent)',
  color: 'var(--hs-warning-ink)',
};

/** The author's initial in their colour with dark ink; a dashed ring for Someone. */
function AuthorBubble({ member }: { member: FamilyMember | undefined }) {
  const base: CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: '50%',
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 800,
  };
  if (!member) {
    return <span aria-hidden="true" style={{ ...base, border: '1.5px dashed var(--hs-text-faint)', boxSizing: 'border-box' }} />;
  }
  return (
    <span aria-hidden="true" style={{ ...base, background: member.color, color: memberInk(member.color) }}>
      {memberInitials(member.name)}
    </span>
  );
}

export type NotesPage = 'board' | 'calendar';

const PAGE_ICONS: Record<NotesPage, React.ReactNode> = {
  board: <NoteIcon size={16} strokeWidth={1.8} />,
  calendar: <CalendarDays size={16} strokeWidth={1.8} />,
};

/**
 * The /remote Notes tab: two pages under one title. Board is the family notes
 * board; Calendar is the day notes every calendar on the wall draws. A page
 * with nowhere to show yet (no Notes card, no calendar with Day notes on)
 * explains that instead, so the switch never hides a page.
 */
export default function NotesTab({ page, onPageChange, boardReady, calendarReady }: {
  page: NotesPage;
  onPageChange: (page: NotesPage) => void;
  boardReady: boolean;
  calendarReady: boolean;
}) {
  const t = useTranslate('remote');
  return (
    <div>
      <TabHeader title={t('notes.title')} />
      <SegmentedTabs
        ariaLabel={t('notes.title')}
        value={page}
        onChange={onPageChange}
        style={{ marginBottom: 14 }}
        tabs={(['board', 'calendar'] as const).map((p) => ({
          id: p,
          label: t(`notes.pages.${p}`),
          icon: PAGE_ICONS[p],
          testId: `notes-page-${p}`,
        }))}
      />
      {page === 'board'
        ? (boardReady ? <NotesBoard onOpenCalendar={calendarReady ? () => onPageChange('calendar') : undefined} /> : <TabNotSetUp kind="notes" />)
        : (calendarReady ? <DayNotesPage /> : <TabNotSetUp kind="dayNotes" />)}
    </div>
  );
}

/**
 * The Board page: the family notes board from `data/notes.json`.
 * Live notes in wall order (pinned first, then newest), each a card that
 * opens the edit sheet; the notes that came down in the last week in a
 * folded Gone group with Post again and Delete; and the write bar pinned
 * above the tab bar. Return in the bar posts at once as the remembered
 * author for the default time; the plus opens the full sheet with whatever
 * was typed carried in.
 */
function NotesBoard({ onOpenCalendar }: {
  /** Opens the Calendar page; absent when no calendar shows day notes. */
  onOpenCalendar?: () => void;
}) {
  const t = useTranslate('remote');
  const locale = useFormattingLocale();
  const timezone = useHouseholdTimezone();
  const api = useNotes();
  const { notes, now, loaded, loadError } = api;
  const { members } = useFamilyData();
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const live = useMemo(() => arrangeNotes(notes, now).shown, [notes, now]);
  const gone = useMemo(() => goneNotes(notes, now), [notes, now]);

  const [barText, setBarText] = useState('');
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [goneOpen, setGoneOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rememberedAuthor, setRememberedAuthor] = useState<string | null>(readRememberedAuthor);
  const goneListId = useId();

  // Only an id in today's roster is ever sent: the store keeps whatever it is
  // given, and a note naming someone no longer in the family would stop a
  // backup from restoring.
  const defaultAuthorId = rememberedAuthor && membersById.has(rememberedAuthor) ? rememberedAuthor : null;

  const nameOf = (note: Note) => membersById.get(note.authorId ?? '')?.name ?? t('notes.someone');
  const ageOf = (note: Note) => formatNoteAge(note.createdAt, now, locale, timezone, t('notes.justNow'));

  const editingNote = sheet?.mode === 'edit' ? api.findNote(sheet.id) : null;
  const deletingNote = deletingId ? api.findNote(deletingId) : null;

  const postFromBar = (text: string) =>
    api.post({ text, life: DEFAULT_NOTE_LIFE, ...(defaultAuthorId ? { authorId: defaultAuthorId } : {}) });

  return (
    <div>
      {!loaded && loadError ? (
        <LoadFailed testId="notes-load-error" message={t('notes.loadError')} onRetry={api.retry} />
      ) : !loaded ? null : (
        <>
          {live.length === 0 && gone.length === 0 ? (
            <EmptyState testId="notes-empty" icon={NoteIcon} title={t('notes.empty.title')} body={t('notes.empty.body')} />
          ) : (
            <div data-testid="notes-on-wall" style={{ fontSize: 13, color: 'var(--hs-text-faint)', margin: '0 0 12px' }}>
              {t('notes.onWall', { count: live.length })}
            </div>
          )}

          {/* The board's write bar cannot pick a day; people try it first. */}
          {onOpenCalendar && (
            <button
              type="button"
              data-testid="notes-to-calendar"
              onClick={onOpenCalendar}
              style={{
                // Room under the empty board's words, which end flush with their own box.
                width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, margin: `${live.length === 0 && gone.length === 0 ? 16 : 0}px 0 12px`, padding: '0 12px',
                borderRadius: 10, border: '1px solid var(--hs-border)', background: 'transparent', color: 'var(--hs-text-muted)',
                fontSize: 13, fontWeight: 600, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <CalendarDays size={16} aria-hidden="true" style={{ flex: 'none' }} />
              <span style={{ flex: 1 }}>{t('notes.boardToCalendar')}</span>
              <ChevronRight size={16} aria-hidden="true" style={{ flex: 'none' }} />
            </button>
          )}

          {live.map((note) => {
            const author = membersById.get(note.authorId ?? '');
            const name = author?.name ?? t('notes.someone');
            const left = timeLeftParts(note, now);
            const leftText = left.unit === null ? t('notes.keeps') : t(`notes.timeLeft.${left.unit}`, { count: left.value });
            const textId = `note-text-${note.id}`;
            return (
              <button
                key={note.id}
                type="button"
                data-testid="notes-card"
                data-note-id={note.id}
                data-important={note.important ? 'true' : undefined}
                data-pinned={note.pinned ? 'true' : undefined}
                aria-label={t('notes.editAria', { name })}
                aria-describedby={textId}
                onClick={() => setSheet({ mode: 'edit', id: note.id })}
                className="press-scale"
                style={{ ...CARD, cursor: 'pointer' }}
              >
                <span style={TOP_ROW}>
                  <AuthorBubble member={author} />
                  <b style={{ color: 'var(--hs-text-body)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                    {name}
                  </b>
                  <span style={{ whiteSpace: 'nowrap', flex: 'none' }}>{ageOf(note)}</span>
                  <span
                    data-testid="notes-time-left"
                    style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flex: 'none' }}
                  >
                    {note.pinned && (
                      <>
                        <Pin size={14} aria-hidden="true" />
                        {t('notes.pinned')} ·{' '}
                      </>
                    )}
                    {left.unit === 'minute' ? <span style={MARK_SOON}>{leftText}</span> : leftText}
                  </span>
                </span>
                <span id={textId} style={NOTE_TEXT}>{note.text}</span>
                {note.important && (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <span style={MARK_IMPORTANT}>
                      <TriangleAlert size={12} strokeWidth={2.4} aria-hidden="true" />
                      {t('notes.important')}
                    </span>
                  </span>
                )}
              </button>
            );
          })}

          {gone.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setGoneOpen((v) => !v)}
                aria-expanded={goneOpen}
                aria-controls={goneListId}
                data-testid="notes-gone-toggle"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 44,
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--hs-text-faint)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  margin: '6px 0 2px',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ flex: 1, textAlign: 'left' }}>{t('notes.gone', { count: gone.length })}</span>
                {goneOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
              </button>
              <div id={goneListId} hidden={!goneOpen}>
                {goneOpen &&
                  gone.map((note) => {
                    const author = membersById.get(note.authorId ?? '');
                    return (
                      <div key={note.id} data-testid="notes-gone-row" data-note-id={note.id} style={CARD}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.55 }}>
                          <span style={TOP_ROW}>
                            <AuthorBubble member={author} />
                            <b style={{ color: 'var(--hs-text-body)', fontWeight: 600 }}>{nameOf(note)}</b>
                            <span>{ageOf(note)}</span>
                          </span>
                          <span style={NOTE_TEXT}>{note.text}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                          <button
                            type="button"
                            className="press-scale"
                            data-testid="notes-repost"
                            onClick={() => api.repost(note.id)}
                            style={{ ...GHOST_BUTTON, marginTop: 0, minHeight: 44, flex: 1, gap: 6 }}
                          >
                            <RotateCcw size={16} aria-hidden="true" />
                            {t('notes.postAgain')}
                          </button>
                          <button
                            type="button"
                            className="press-scale"
                            data-testid="notes-delete"
                            onClick={() => setDeletingId(note.id)}
                            style={{ ...DANGER_BUTTON, marginTop: 0, minHeight: 44, flex: 1 }}
                          >
                            {t('notes.delete')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}

          {/* Room for the write bar pinned above the tab bar. */}
          <div style={{ height: ADD_BAR_HEIGHT }} />

          <AddBar
            placeholder={t('notes.writeNote')}
            buttonLabel={t('notes.newNote')}
            maxLength={NOTES_LIMITS.maxTextLength}
            onAdd={postFromBar}
            onExpand={(text) => setSheet({ mode: 'new', text })}
            value={barText}
            onValueChange={setBarText}
            enterKeyHint="send"
            inputTestId="notes-add-input"
            buttonTestId="notes-add-submit"
          />
        </>
      )}

      {sheet?.mode === 'new' && (
        <NotesSheet
          mode="new"
          members={members}
          initialText={sheet.text}
          defaultAuthorId={defaultAuthorId}
          onPost={(input) => {
            const authorId = input.authorId ?? null;
            rememberAuthor(authorId);
            setRememberedAuthor(authorId);
            // A post that fails hands its words back to the bar, like the fast path.
            void api.post(input).then((saved) => {
              if (!saved) setBarText((now) => (now.trim() ? now : input.text));
            });
          }}
          onDiscard={(draft) => {
            // Hand the words back to the bar, unless something new is already there.
            if (draft.trim()) setBarText((now) => (now.trim() ? now : draft));
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.mode === 'edit' && editingNote && (
        <NotesSheet
          key={sheet.id}
          mode="edit"
          members={members}
          note={editingNote}
          now={now}
          onSave={(patch) => api.update(editingNote.id, patch)}
          onTakeDown={() => api.takeDown(editingNote.id)}
          onClose={() => setSheet(null)}
        />
      )}

      {deletingNote && (
        <ConfirmSheet
          title={t('notes.deleteConfirm')}
          description={deletingNote.text}
          confirmLabel={t('notes.delete')}
          onConfirm={() => {
            api.remove(deletingNote.id);
            setDeletingId(null);
          }}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
