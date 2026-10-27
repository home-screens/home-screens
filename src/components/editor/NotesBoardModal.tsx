'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, MessageSquareText, Pin, TriangleAlert, type LucideIcon } from 'lucide-react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { displayCache } from '@/lib/display-cache';
import { FETCH_KEY_REGISTRY, notesUrl } from '@/lib/fetch-keys';
import {
  allNotesUrl,
  createNoteRequest,
  deleteNoteRequest,
  noteActionRequest,
  sendNotesWrite,
  updateNoteRequest,
  type NotesPayload,
  type NotesWriteRequest,
} from '@/lib/notes-client';
import { arrangeNotes, formatNoteAge, goneNotes, initialOf, isLive, timeLeftParts } from '@/lib/notes-rules';
import type { NotePatch } from '@/lib/notes-actions';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { useFamilyData } from '@/hooks/useFamilyData';
import Button from '@/components/ui/Button';
import LabeledField from '@/components/ui/LabeledField';
import Toggle from '@/components/ui/Toggle';
import CRUDModalShell from '@/components/editor/CRUDModalShell';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useConfirmStore } from '@/stores/confirm-store';
import { DEFAULT_NOTE_LIFE, NOTE_LIVES, NOTES_LIMITS, type Note, type NoteLife } from '@/types/notes';
import type { FamilyMember } from '@/types/family';

/** The author this editor last posted as. An empty string is a deliberate Nobody; no key is no pick yet. */
const AUTHOR_KEY = 'hs-editor-notes-author';

/** Ages and time left move on their own; a write also restamps the clock. */
const CLOCK_TICK_MS = 30_000;

/** A row's text: quiet until focused, so the board reads as notes and not a form. */
const ROW_TEXT_CLASS =
  'block w-full resize-none overflow-hidden px-2 py-1 text-sm leading-snug bg-transparent border border-transparent rounded-md text-hs-text-body focus:outline-none focus:border-hs-border-strong focus:bg-hs-input transition-colors';

/** A row's From and Show for pickers: the value reads as text until hovered or focused. */
const ROW_SELECT_CLASS =
  'max-w-[9rem] truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-hs-text-body hover:border-hs-border-strong focus:outline-none focus:border-hs-border-strong focus:bg-hs-input transition-colors';

function readRememberedAuthor(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(AUTHOR_KEY);
  } catch {
    return null;
  }
}

function rememberAuthor(authorId: string): void {
  try {
    window.localStorage.setItem(AUTHOR_KEY, authorId);
  } catch {
    /* private mode: the pick just does not stick */
  }
}

/** Grow a textarea to its text, so a long note is read whole rather than scrolled. */
function useAutoHeight(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}

// ── Small parts ───────────────────────────────────────────────────

/** The author's initial in their colour, or a dashed "?" for a note from nobody. */
function AuthorDot({ member }: { member: FamilyMember | undefined }) {
  if (!member) {
    return (
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-hs-border-strong text-[11px] font-bold text-hs-text-muted"
      >
        ?
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ backgroundColor: member.color, color: '#111' }}
    >
      {initialOf(member.name)}
    </span>
  );
}

function FlagButton({ on, label, icon: Icon, danger, testId, onClick }: {
  on: boolean;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
      className={clsx(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors',
        on
          ? danger
            ? 'border-hs-danger/30 bg-hs-danger/10 text-hs-danger'
            : 'border-hs-accent/40 bg-hs-accent/20 text-hs-accent'
          : 'border-transparent text-hs-text-faint hover:bg-hs-card hover:text-hs-text-body',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

// ── A note on the wall ────────────────────────────────────────────

interface RowProps {
  note: Note;
  members: FamilyMember[];
  author: FamilyMember | undefined;
  age: string;
  left: string;
  onSaveText: (id: string, text: string) => void;
  onPatch: (id: string, patch: NotePatch) => void;
  onTakeDown: (id: string) => void;
}

function NoteRow({ note, members, author, age, left, onSaveText, onPatch, onTakeDown }: RowProps) {
  const t = useTranslate('editor');
  const [text, setText] = useState(note.text);
  // Counts keystrokes, not text changes: the save follows what was typed
  // here, never the server's wording being adopted. Keyed on the text
  // itself, adopting a stale copy (the row's blur lands before the save's
  // answer) would schedule a save of the old words over the new ones.
  const [edits, setEdits] = useState(0);
  const typed = useRef(text);
  typed.current = text;
  const editing = useRef(false);
  const textRef = useAutoHeight(text);

  // Text is local-first: the row keeps what was typed and the debounced save
  // catches up. A pending edit is flushed when the row unmounts (modal closed
  // or note taken down); `onSaveText` skips notes that no longer exist and
  // text the server already holds.
  const { flush, hasPending } = useDebouncedSave({
    values: [edits],
    save: () => onSaveText(note.id, typed.current),
    flushOnUnmount: true,
  });

  // Adopt the server's wording when it changes and this row is not mid-edit,
  // so an edit made on a phone shows here instead of sitting behind a stale
  // copy. Only a change of the server's text counts: leaving the field is
  // not a reason to re-read it, since the save sent on blur has not been
  // answered yet.
  useEffect(() => {
    if (!editing.current && !hasPending()) setText(note.text);
  }, [note.text, hasPending]);

  // An authorless note reads as from "Someone", as it does on the wall and
  // the phone: "from Nobody" is ungrammatical in several languages.
  const name = author?.name ?? t('notesBoardModal.someone');

  return (
    <li
      data-testid="notes-modal-row"
      data-note-id={note.id}
      className={clsx(
        'space-y-0.5 rounded-md border bg-hs-card/60 px-2 py-1.5',
        note.important ? 'border-hs-danger/30' : 'border-hs-border',
      )}
    >
      <div className="flex items-center gap-1.5">
        <AuthorDot member={author} />
        <select
          value={author ? author.id : ''}
          onChange={(e) => onPatch(note.id, { authorId: e.target.value || null })}
          aria-label={t('notesBoardModal.fromLabel')}
          data-testid="notes-modal-row-author"
          className={ROW_SELECT_CLASS}
        >
          <option value="">{t('notesBoardModal.nobody')}</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <span className="shrink-0 text-[11px] text-hs-text-faint">{age}</span>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <FlagButton
            on={note.pinned}
            label={t('notesBoardModal.pin')}
            icon={Pin}
            testId="notes-modal-row-pin"
            onClick={() => onPatch(note.id, { pinned: !note.pinned })}
          />
          <FlagButton
            on={note.important}
            label={t('notesBoardModal.important')}
            icon={TriangleAlert}
            danger
            testId="notes-modal-row-important"
            onClick={() => onPatch(note.id, { important: !note.important })}
          />
          <select
            value={note.life}
            onChange={(e) => onPatch(note.id, { life: e.target.value as NoteLife })}
            aria-label={t('notesBoardModal.lifeLabel')}
            title={t('notesBoardModal.lifeHelp')}
            data-testid="notes-modal-row-life"
            className={ROW_SELECT_CLASS}
          >
            {NOTE_LIVES.map((life) => <option key={life} value={life}>{t(`notesBoardModal.life.${life}`)}</option>)}
          </select>
          <span className="min-w-16 shrink-0 whitespace-nowrap text-[11px] text-hs-text-faint" data-testid="notes-modal-row-left">{left}</span>
          <Button size="sm" variant="ghost" data-testid="notes-modal-take-down" onClick={() => onTakeDown(note.id)}>
            {t('notesBoardModal.takeDown')}
          </Button>
        </div>
      </div>

      <textarea
        ref={textRef}
        rows={1}
        value={text}
        maxLength={NOTES_LIMITS.maxTextLength}
        onChange={(e) => {
          setText(e.target.value);
          setEdits((n) => n + 1);
        }}
        onFocus={() => { editing.current = true; }}
        onBlur={() => {
          editing.current = false;
          // Only a real pending edit: a click through an untouched row must
          // not write its copy of the text back to the server.
          if (hasPending()) flush();
        }}
        aria-label={t('notesBoardModal.rowTextLabel', { name })}
        data-testid="notes-modal-row-text"
        className={ROW_TEXT_CLASS}
      />
    </li>
  );
}

// ── Modal ─────────────────────────────────────────────────────────

/**
 * The family notes board, written from the editor: post a note, change the
 * ones on the wall, take them down, and bring back or delete the ones that
 * came down this week. Every change goes straight to `/api/notes`, each
 * answer replaces the local copy with server truth, and the canvas preview
 * is handed the same answer so it changes with the click.
 */
export default function NotesBoardModal({ onClose }: { onClose: () => void }) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const timezone = useEditorHouseholdTimezone();
  const { members } = useFamilyData();
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Stamped with every answer as well as on the tick: a note taken down a
  // moment ago carries an expiry of "now", and a clock read before it would
  // still count it as on the wall.
  const [now, setNow] = useState(() => new Date());
  const [goneOpen, setGoneOpen] = useState(false);

  // ── New note ──
  const [draft, setDraft] = useState('');
  const [rememberedAuthor, setRememberedAuthor] = useState<string | null>(readRememberedAuthor);
  const [life, setLife] = useState<NoteLife>(DEFAULT_NOTE_LIFE);
  const [pinned, setPinned] = useState(false);
  const [important, setImportant] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  // The latest notes the modal knows about, for callbacks that outlive a
  // render (a row's unmount flush must not resurrect a deleted note).
  const notesRef = useRef<Note[]>([]);
  notesRef.current = notes;
  // Only the most recently issued write may replace the local copy. Two
  // rapid writes can still reach the server in the other order, in which
  // case the answer we keep predates the one we dropped; once every request
  // has settled after such a drop, the board is fetched afresh.
  const requestSeq = useRef(0);
  const inFlight = useRef(0);
  const droppedResponse = useRef(false);

  const saveFailed = t('common.saveError');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  /** Take the server's board as the truth here and on the canvas preview. */
  const adopt = useCallback((next: Note[]) => {
    const at = new Date();
    setNotes(next);
    setNow(at);
    displayCache.replace(notesUrl(), { notes: next.filter((n) => isLive(n, at)) }, FETCH_KEY_REGISTRY.notes.ttlMs);
  }, []);

  useEffect(() => {
    editorFetch(allNotesUrl())
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<NotesPayload>;
      })
      .then((data) => {
        setNotes(Array.isArray(data.notes) ? data.notes : []);
        setNow(new Date());
        setLoaded(true);
      })
      .catch((e) => {
        if (isSessionExpired(e)) return;
        setLoadError(t('notesBoardModal.loadError'));
      });
    // Read once when the modal opens; every write answers with the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Bring the local copy back in step with the server: after a dropped
   * out-of-order answer, or after a write the server refused (the
   * optimistic change must not stand). The answer is adopted only if no
   * write started while it was on its way; otherwise it is stale by
   * definition and the next settle fetches again.
   */
  const reconcile = useCallback(() => {
    const seqAtStart = requestSeq.current;
    editorFetch(allNotesUrl())
      .then((res) => (res.ok ? (res.json() as Promise<NotesPayload>) : null))
      .then((data) => {
        if (!data) return;
        if (seqAtStart !== requestSeq.current) {
          droppedResponse.current = true;
          return;
        }
        adopt(data.notes);
      })
      .catch(() => { /* the next write or reopen brings the board back in step */ });
  }, [adopt]);

  /** Run one write now and adopt its answer unless a later write has been sent since. */
  const writeNow = useCallback(
    async (req: NotesWriteRequest): Promise<boolean> => {
      const seq = ++requestSeq.current;
      inFlight.current += 1;
      try {
        const { notes: next } = await sendNotesWrite(editorFetch, req, saveFailed);
        // A write that went through clears an earlier refusal; the reconcile
        // after a refusal does not, or the message would vanish unread.
        setError(null);
        if (seq !== requestSeq.current) {
          droppedResponse.current = true;
          return true;
        }
        adopt(next);
        return true;
      } catch (e) {
        if (isSessionExpired(e)) return false;
        setError(e instanceof Error && e.message ? e.message : saveFailed);
        // Whatever this write changed locally was refused: fetch the truth
        // once the other requests are done with it.
        droppedResponse.current = true;
        return false;
      } finally {
        inFlight.current -= 1;
        if (inFlight.current === 0 && droppedResponse.current) {
          droppedResponse.current = false;
          reconcile();
        }
      }
    },
    [adopt, reconcile, saveFailed],
  );

  // Writes go out one at a time, in the order they were asked for, the way
  // the phone's hook sends them: a pin and an unpin a moment apart must land
  // in that order, or the board keeps the first one.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const write = useCallback(
    (req: NotesWriteRequest): Promise<boolean> => {
      const run = queueRef.current.then(() => writeNow(req));
      queueRef.current = run.catch(() => undefined);
      return run;
    },
    [writeNow],
  );

  // Only an id in today's roster is ever sent: a note naming someone no
  // longer in the family would stop a backup from restoring.
  const authorId = rememberedAuthor && membersById.has(rememberedAuthor) ? rememberedAuthor : '';

  const pickAuthor = (id: string) => {
    setRememberedAuthor(id);
    rememberAuthor(id);
  };

  const post = async () => {
    const text = draft.trim();
    if (!text) return;
    // Clear the field now, not when the server answers: whoever typed this
    // may already be typing the next one. A refused post puts the text back
    // if nothing new has been typed since.
    setDraft('');
    draftRef.current?.focus();
    const ok = await write(createNoteRequest({
      text,
      life,
      pinned,
      important,
      ...(authorId ? { authorId } : {}),
    }));
    if (ok) {
      setPinned(false);
      setImportant(false);
    } else {
      setDraft((current) => current || text);
    }
  };

  // ── Rows ──
  // The wording last sent for each note, while its save is still out. An
  // edit is judged against that, not against the last answer: a change from
  // A to B and back to A before B is saved must send A again, or B wins.
  const sentTextRef = useRef(new Map<string, string>());
  const saveText = (id: string, text: string) => {
    const current = notesRef.current.find((n) => n.id === id);
    const trimmed = text.trim();
    if (!current || !trimmed) return;
    const base = sentTextRef.current.get(id) ?? current.text;
    if (trimmed === base) return;
    sentTextRef.current.set(id, trimmed);
    void write(updateNoteRequest(id, { text: trimmed })).finally(() => {
      if (sentTextRef.current.get(id) === trimmed) sentTextRef.current.delete(id);
    });
  };

  const patch = (id: string, change: NotePatch) => {
    // Flags and the author show at once; a new life waits for the server,
    // which works out the expiry from its own clock.
    setNotes((prev) => prev.map((n) => {
      if (n.id !== id) return n;
      const next: Note = { ...n };
      if (change.pinned !== undefined) next.pinned = change.pinned;
      if (change.important !== undefined) next.important = change.important;
      if (change.authorId !== undefined) {
        if (change.authorId) next.authorId = change.authorId;
        else delete next.authorId;
      }
      return next;
    }));
    void write(updateNoteRequest(id, change));
  };

  const takeDown = (id: string) => {
    void write(noteActionRequest(id, 'take-down'));
  };

  const repost = (id: string) => {
    void write(noteActionRequest(id, 'repost'));
  };

  const remove = async (id: string) => {
    const ok = await useConfirmStore.getState().confirm({
      title: t('notesBoardModal.deleteConfirm.title'),
      message: t('notesBoardModal.deleteConfirm.message'),
      confirmLabel: t('notesBoardModal.deleteConfirm.confirmLabel'),
      variant: 'danger',
    });
    if (!ok) return;
    void write(deleteNoteRequest(id));
  };

  const live = useMemo(() => arrangeNotes(notes, now).shown, [notes, now]);
  const gone = useMemo(() => goneNotes(notes, now), [notes, now]);

  // A kept note says nothing here: its Show for picker already reads "Keep".
  const timeLeftText = (note: Note): string => {
    const left = timeLeftParts(note, now);
    if (left.unit === null) return '';
    return t(`notesBoardModal.timeLeft.${left.unit}`, { count: left.value });
  };

  return (
    <CRUDModalShell
      title={t('notesBoardModal.title')}
      icon={<MessageSquareText className="h-4 w-4 text-hs-accent-hover" aria-hidden="true" />}
      subtitle={loaded ? t('notesBoardModal.subtitle', { count: live.length, gone: gone.length }) : undefined}
      maxWidth="max-w-2xl"
      onClose={onClose}
    >
      <div data-testid="notes-modal" className="flex min-h-0 flex-1 flex-col">
        {loadError && (
          <div role="alert" className="mx-4 mt-3 rounded-lg border border-hs-danger/30 bg-hs-danger/10 px-3 py-2 text-xs text-hs-danger">
            {loadError}
          </div>
        )}
        {error && (
          <div role="alert" className="mx-4 mt-3 rounded-lg border border-hs-danger/30 bg-hs-danger/10 px-3 py-2 text-xs text-hs-danger">
            {error}
          </div>
        )}

        {!loaded ? (
          !loadError && (
            <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-hs-text-faint">
              {tCore('loading')}
            </div>
          )
        ) : (
          <>
            <section aria-label={t('notesBoardModal.newNote')} className="space-y-2 border-b border-hs-border-strong px-4 py-3">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-semibold text-hs-text-muted">{t('notesBoardModal.newNote')}</h3>
                <span className="text-[11px] tabular-nums text-hs-text-faint">
                  {t('notesBoardModal.counter', { used: draft.length, max: NOTES_LIMITS.maxTextLength })}
                </span>
              </div>
              <textarea
                ref={draftRef}
                rows={3}
                value={draft}
                maxLength={NOTES_LIMITS.maxTextLength}
                placeholder={t('notesBoardModal.textPlaceholder')}
                aria-label={t('notesBoardModal.textLabel')}
                data-testid="notes-modal-text"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void post();
                  }
                }}
                className={`${MODAL_INPUT_CLASS} resize-none`}
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2">
                <LabeledField label={t('notesBoardModal.fromLabel')}>
                  <select
                    value={authorId}
                    onChange={(e) => pickAuthor(e.target.value)}
                    data-testid="notes-modal-author"
                    className={MODAL_INPUT_CLASS}
                  >
                    <option value="">{t('notesBoardModal.nobody')}</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </LabeledField>
                <LabeledField label={t('notesBoardModal.lifeLabel')}>
                  <select
                    value={life}
                    onChange={(e) => setLife(e.target.value as NoteLife)}
                    data-testid="notes-modal-life"
                    className={MODAL_INPUT_CLASS}
                  >
                    {NOTE_LIVES.map((l) => <option key={l} value={l}>{t(`notesBoardModal.life.${l}`)}</option>)}
                  </select>
                </LabeledField>
              </div>
              <div className="flex items-center gap-4">
                <div className="min-w-36" data-testid="notes-modal-pin">
                  <Toggle label={t('notesBoardModal.pin')} checked={pinned} onChange={setPinned} />
                </div>
                <div className="min-w-36" data-testid="notes-modal-important">
                  <Toggle label={t('notesBoardModal.important')} checked={important} onChange={setImportant} />
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  className="ml-auto"
                  title={t('notesBoardModal.postHint')}
                  data-testid="notes-modal-post"
                  disabled={!draft.trim()}
                  onClick={() => void post()}
                >
                  {t('notesBoardModal.post')}
                </Button>
              </div>
            </section>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
              <section aria-labelledby="notes-modal-on-wall">
                <h3 id="notes-modal-on-wall" className="mb-1.5 text-xs font-semibold text-hs-text-muted">
                  {t('notesBoardModal.onWall')}
                </h3>
                {live.length === 0 ? (
                  <p className="py-6 text-center text-sm text-hs-text-faint" data-testid="notes-modal-empty">
                    {t('notesBoardModal.empty')}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {live.map((note) => (
                      <NoteRow
                        key={note.id}
                        note={note}
                        members={members}
                        author={membersById.get(note.authorId ?? '')}
                        age={formatNoteAge(note.createdAt, now, locale, timezone)}
                        left={timeLeftText(note)}
                        onSaveText={saveText}
                        onPatch={patch}
                        onTakeDown={takeDown}
                      />
                    ))}
                  </ul>
                )}
              </section>

              {gone.length > 0 && (
                <section>
                  <button
                    type="button"
                    aria-expanded={goneOpen}
                    aria-controls="notes-modal-gone"
                    data-testid="notes-modal-gone-toggle"
                    onClick={() => setGoneOpen((v) => !v)}
                    className="flex items-center gap-1 text-xs font-semibold text-hs-text-muted hover:text-hs-text-body"
                  >
                    {goneOpen
                      ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                    {t('notesBoardModal.gone', { count: gone.length })}
                  </button>
                  {goneOpen && (
                    <div id="notes-modal-gone" className="mt-1.5 space-y-1.5">
                      <p className="text-[11px] text-hs-text-faint">{t('notesBoardModal.goneHelp')}</p>
                      <ul className="space-y-1">
                        {gone.map((note) => {
                          const author = membersById.get(note.authorId ?? '');
                          return (
                            <li
                              key={note.id}
                              data-testid="notes-modal-gone-row"
                              data-note-id={note.id}
                              className="flex items-center gap-2 rounded-md border border-hs-border px-2 py-1"
                            >
                              <AuthorDot member={author} />
                              <span className="sr-only">{author?.name ?? t('notesBoardModal.someone')}</span>
                              <span className="min-w-0 flex-1 truncate text-sm text-hs-text-muted" title={note.text}>
                                {note.text}
                              </span>
                              <Button size="sm" data-testid="notes-modal-repost" onClick={() => repost(note.id)}>
                                {t('notesBoardModal.postAgain')}
                              </Button>
                              <Button size="sm" variant="ghost" data-testid="notes-modal-delete" onClick={() => void remove(note.id)}>
                                {t('notesBoardModal.delete')}
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </CRUDModalShell>
  );
}
