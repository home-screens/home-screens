'use client';

import { useId, useState, type CSSProperties } from 'react';
import { Pin, TriangleAlert } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { timeLeftParts } from '@/lib/notes-rules';
import type { CreateNoteInput, NotePatch } from '@/lib/notes-actions';
import { DEFAULT_NOTE_LIFE, NOTE_LIVES, NOTES_LIMITS, type Note, type NoteLife } from '@/types/notes';
import type { FamilyMember } from '@/types/family';
import BottomSheet from './BottomSheet';
import { GHOST_BUTTON, HELPER_TEXT, SEGMENT_ROW, SHEET_FIELD, SHEET_LABEL, segmentStyle } from './remote-styles';
import PersonChip from './PersonChip';
import PrimaryButton from './PrimaryButton';
import { NoteDrawingArt } from '@/components/notes/NoteDrawingArt';

type NotesSheetProps = {
  /** The family roster, in roster order. */
  members: FamilyMember[];
  onClose: () => void;
} & (
  | {
      mode: 'new';
      /** Whatever was typed in the write bar. */
      initialText: string;
      /** The author this phone last posted as, already checked against the roster. */
      defaultAuthorId: string | null;
      onPost: (input: CreateNoteInput) => void;
      /** Closed without posting: hands back the draft so the write bar can keep it. */
      onDiscard: (draft: string) => void;
    }
  | {
      mode: 'edit';
      note: Note;
      now: Date;
      onSave: (patch: NotePatch) => void;
      onTakeDown: () => void;
    }
);

/** "22 hr", "4 days", "40 min" in the formatting language, for "Gone in ...". */
function formatSpan(unit: 'minute' | 'hour' | 'day', value: number, locale: string): string {
  try {
    // Long unit names ("3 Tage", "22 heures"): the short ones abbreviate oddly
    // in several languages and would not match the card's time-left chip.
    return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(value);
  } catch {
    return String(value);
  }
}

function toggleStyle(on: boolean, tone: 'plain' | 'danger'): CSSProperties {
  const danger = on && tone === 'danger';
  return {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    border: `1px solid ${danger ? 'color-mix(in srgb, var(--hs-danger) 60%, transparent)' : on ? 'var(--hs-text-primary)' : 'var(--hs-border-strong)'}`,
    background: danger ? 'color-mix(in srgb, var(--hs-danger) 12%, transparent)' : on ? 'var(--hs-bg-card)' : 'var(--hs-bg-input)',
    color: danger ? 'var(--hs-danger)' : on ? 'var(--hs-text-primary)' : 'var(--hs-text-muted)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '0 8px',
  };
}

/** "Nobody" has no face of their own: an empty dashed ring where one would be. */
const NOBODY_FACE: CSSProperties = { width: 18, height: 18, borderRadius: '50%', display: 'block', border: '1.5px dashed var(--hs-text-faint)', boxSizing: 'border-box' };

/**
 * One sheet for writing a note and for changing one: the text, who it is
 * from, how long it stays, and the two flags. Editing adds "Take it down
 * now", which ends the note's time on the wall without deleting it.
 */
export default function NotesSheet(props: NotesSheetProps) {
  const { members, onClose } = props;
  const t = useTranslate('remote');
  const locale = useFormattingLocale();
  const ids = useId();
  const editing = props.mode === 'edit' ? props.note : null;

  const [text, setText] = useState(editing ? editing.text : props.mode === 'new' ? props.initialText : '');
  const [authorId, setAuthorId] = useState<string | null>(
    editing ? editing.authorId ?? null : props.mode === 'new' ? props.defaultAuthorId : null,
  );
  const [life, setLife] = useState<NoteLife>(editing ? editing.life : DEFAULT_NOTE_LIFE);
  const [lifeTouched, setLifeTouched] = useState(false);
  const [pinned, setPinned] = useState(editing ? editing.pinned : false);
  const [important, setImportant] = useState(editing ? editing.important : false);

  const clean = text.trim();
  // A note drawn on the wall: the picture stands where the words would be and cannot be changed here.
  const drawing = editing?.drawing;
  // An author since removed from the family reads as Nobody here, and saving
  // clears it, the way removing a person does.
  const knownAuthor = authorId !== null && members.some((m) => m.id === authorId) ? authorId : null;

  const close = () => {
    if (props.mode === 'new') props.onDiscard(text);
    onClose();
  };

  const submit = () => {
    if (!clean && !drawing) return;
    if (props.mode === 'new') {
      props.onPost({ text: clean, life, pinned, important, ...(knownAuthor ? { authorId: knownAuthor } : {}) });
      onClose();
      return;
    }
    const note = props.note;
    const patch: NotePatch = {};
    if (!drawing && clean !== note.text) patch.text = clean;
    if (knownAuthor !== (note.authorId ?? null)) patch.authorId = knownAuthor;
    if (pinned !== note.pinned) patch.pinned = pinned;
    if (important !== note.important) patch.important = important;
    // Any life in a patch restarts the note's time from now, the same preset
    // included ("pick again to start over"), so it goes only when a Show for
    // button was tapped in this sheet. A text, author or flag edit alone must
    // not move the expiry.
    if (lifeTouched) patch.life = life;
    if (Object.keys(patch).length > 0) props.onSave(patch);
    onClose();
  };

  let aside: string;
  if (props.mode === 'new') {
    aside = t('notes.counter', { used: text.length, max: NOTES_LIMITS.maxTextLength });
  } else {
    const left = timeLeftParts(props.note, props.now);
    aside = left.unit === null ? t('notes.keeps') : t('notes.goneIn', { time: formatSpan(left.unit, left.value, locale) });
  }

  return (
    <BottomSheet
      title={props.mode === 'new' ? t('notes.newNote') : t('notes.editNote')}
      titleAside={aside}
      onClose={close}
      testId="notes-sheet"
      // A new note was asked for by tapping +, so the keyboard is wanted.
      initialFocus={props.mode === 'new' ? 'field' : 'container'}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {drawing ? (
          <span style={{ ...SHEET_LABEL, marginTop: 0 }}>{t('notes.noteLabel')}</span>
        ) : (
          <label htmlFor={`${ids}-text`} style={{ ...SHEET_LABEL, marginTop: 0 }}>
            {t('notes.noteLabel')}
          </label>
        )}
        {drawing ? (
          <>
            {/* The picture and its line side by side, no taller than the text box it stands in for, so "Take it down now" stays on screen. */}
            <div
              id={`${ids}-text`}
              data-testid="notes-sheet-drawing"
              style={{ ...SHEET_FIELD, display: 'flex', alignItems: 'center', gap: 12, height: 'auto', minHeight: 96, padding: 8, color: 'var(--hs-text-primary)' }}
            >
              <span style={{ display: 'block', width: 112, aspectRatio: '4 / 3', flex: 'none' }}>
                <NoteDrawingArt drawing={drawing} label={t('notes.drawing')} />
              </span>
              <span style={{ ...HELPER_TEXT, margin: 0 }}>{t('notes.drawingHelp')}</span>
            </div>
          </>
        ) : (
          <textarea
            id={`${ids}-text`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={NOTES_LIMITS.maxTextLength}
            rows={3}
            autoFocus={props.mode === 'new'}
            data-testid="notes-sheet-text"
            style={{ ...SHEET_FIELD, display: 'block', minHeight: 96, lineHeight: 1.35, resize: 'none' }}
          />
        )}

        <span style={SHEET_LABEL} id={`${ids}-from`}>{t('notes.fromLabel')}</span>
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
          role="group"
          aria-labelledby={`${ids}-from`}
          data-testid="notes-sheet-author"
        >
          {members.map((m) => (
            <PersonChip
              key={m.id}
              member={m}
              selected={knownAuthor === m.id}
              aria-pressed={knownAuthor === m.id}
              data-author-id={m.id}
              onClick={() => setAuthorId(m.id)}
            />
          ))}
          <PersonChip
            member={{ name: t('notes.nobody'), color: 'var(--hs-text-muted)' }}
            selected={knownAuthor === null}
            face={<i aria-hidden="true" style={NOBODY_FACE} />}
            aria-pressed={knownAuthor === null}
            data-author-id=""
            onClick={() => setAuthorId(null)}
          />
        </div>

        <span style={SHEET_LABEL} id={`${ids}-life`}>{t('notes.lifeLabel')}</span>
        <div style={SEGMENT_ROW} role="group" aria-labelledby={`${ids}-life`} data-testid="notes-sheet-life">
          {NOTE_LIVES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={life === value}
              data-life={value}
              onClick={() => {
                setLife(value);
                setLifeTouched(true);
              }}
              style={{ ...segmentStyle(life === value), padding: '0 2px' }}
            >
              {t(`notes.life.${value}`)}
            </button>
          ))}
        </div>
        {props.mode === 'edit' && <div style={{ ...HELPER_TEXT, marginTop: 6 }}>{t('notes.lifeHelp')}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            type="button"
            aria-pressed={pinned}
            onClick={() => setPinned((v) => !v)}
            data-testid="notes-sheet-pin"
            style={toggleStyle(pinned, 'plain')}
          >
            <Pin size={18} aria-hidden="true" />
            {t('notes.pin')}
          </button>
          <button
            type="button"
            aria-pressed={important}
            onClick={() => setImportant((v) => !v)}
            data-testid="notes-sheet-important"
            style={toggleStyle(important, 'danger')}
          >
            <TriangleAlert size={18} aria-hidden="true" />
            {t('notes.important')}
          </button>
        </div>

        <PrimaryButton type="submit" data-testid="notes-sheet-submit" disabled={!clean && !drawing} style={{ marginTop: 18 }}>
          {props.mode === 'new' ? t('notes.post') : t('notes.save')}
        </PrimaryButton>
        {props.mode === 'edit' && (
          <button
            type="button"
            className="press-scale"
            data-testid="notes-sheet-take-down"
            onClick={() => {
              props.onTakeDown();
              onClose();
            }}
            style={GHOST_BUTTON}
          >
            {t('notes.takeDown')}
          </button>
        )}
      </form>
    </BottomSheet>
  );
}
