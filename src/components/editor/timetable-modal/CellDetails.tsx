'use client';

/**
 * The room and the course group of one lesson.
 *
 * It opens from a small button in the cell's corner rather than a long press
 * or a double click: the grid underneath is a painting surface and both of
 * those gestures fight a drag. Positioned `fixed` against that button, because
 * the grid scrolls and a panel placed inside it would be clipped by its own
 * scroll box.
 *
 * Typing commits when a field is left, never on the keystroke. The window
 * autosaves on a debounce, so a save per letter would be a write per letter.
 * Every way out commits what is in the fields, Escape included: there is no
 * Save button to press, and dropping somebody's typing quietly is the one
 * thing this window must not do.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate } from '@/i18n';
import { TIMETABLE_LIMITS, type DayKey, type TimetableSubject } from '@/types/timetables';
import { subjectTint } from './SubjectPalette';
import FieldHint from '@/components/ui/FieldHint';

/** A lesson's details. An empty string clears the field; a missing one leaves it alone. */
export interface CellDetailsPatch {
  room?: string;
  course?: string;
}

/**
 * Where the two edits go. The pair travels together so a grid can never be
 * wired up with half of it and offer a Copy button that saves nothing.
 */
export interface CellDetailsHandlers {
  /** One lesson, in the week on screen. */
  onCell: (day: DayKey, period: number, patch: CellDetailsPatch) => void;
  /** Every lesson of this subject, in both weeks. */
  onSubject: (subjectId: string, patch: CellDetailsPatch) => void;
}

const WIDTH = 262;

/** How tall the panel stands before it has been measured, on the first frame only. */
const HEIGHT = 288;

/** How close to the window edge the panel is allowed to sit. */
const EDGE = 8;

interface CellDetailsProps {
  subject: TimetableSubject;
  /** Which lesson this is, spelled by the grid so the popover never formats a day. */
  where: string;
  room: string;
  course: string;
  /** The pencil it opened from, in viewport coordinates. */
  anchor: { bottom: number; left: number };
  onSave: (patch: CellDetailsPatch) => void;
  onCopyToSubject: (patch: CellDetailsPatch) => void;
  onClose: () => void;
}

export default function CellDetails({
  subject,
  where,
  room,
  course,
  anchor,
  onSave,
  onCopyToSubject,
  onClose,
}: CellDetailsProps) {
  const t = useTranslate('editor');
  const [draftRoom, setDraftRoom] = useState(room);
  const [draftCourse, setDraftCourse] = useState(course);
  const roomRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /**
   * The panel's own height, so the clamp that keeps it on screen is measured
   * rather than guessed. A guess is wrong the moment the copy is reworded or
   * translated: the copy button wraps to three lines in English, which left
   * 22px of the panel below the bottom of a 768px window.
   */
  const [height, setHeight] = useState(HEIGHT);

  const name = subject.name || subject.code;
  /** A copy of nothing is a mass delete, so the button waits for a value. */
  const nothingToCopy = draftRoom.trim() === '' && draftCourse.trim() === '';

  /** Only the fields that actually changed, so an untouched popover writes nothing. */
  const pending = useCallback((): CellDetailsPatch | null => {
    const patch: CellDetailsPatch = {};
    if (draftRoom !== room) patch.room = draftRoom;
    if (draftCourse !== course) patch.course = draftCourse;
    return patch.room === undefined && patch.course === undefined ? null : patch;
  }, [draftRoom, draftCourse, room, course]);

  const close = useCallback(() => {
    const patch = pending();
    if (patch) onSave(patch);
    onClose();
  }, [pending, onSave, onClose]);

  useEffect(() => {
    roomRef.current?.focus();
  }, []);

  // Escape is taken in the capture phase and stopped dead. The window this
  // sits in closes on Escape as well, and one key press closing both would
  // take the whole timetable off screen when somebody meant to shut a popover.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [close]);

  // Measured before the browser paints, and watched after that: the hint under
  // the copy button comes and goes as the boxes are typed in, and the copy
  // button itself wraps to a different number of lines in other languages.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const measure = () => {
      if (panel.offsetHeight > 0) setHeight(panel.offsetHeight);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  const top = Math.max(EDGE, Math.min(anchor.bottom + 6, window.innerHeight - height - EDGE));
  const left = Math.max(EDGE, Math.min(anchor.left - 4, window.innerWidth - WIDTH - EDGE));

  return (
    <>
      {/*
        A press anywhere else closes the popover, and this sheet swallows that
        press rather than letting it through. Outside here is mostly grid, and
        the grid paints on pointer down: dismissing a popover should never lay
        a subject over somebody's lesson.
      */}
      <div className="fixed inset-0 z-50" onPointerDown={close} data-testid="cell-details-backdrop" />

      <div
        ref={panelRef}
        role="dialog"
        aria-label={t('timetableModal.cell.edit', { subject: name })}
        className="fixed z-50 rounded-[10px] border border-hs-border-strong bg-hs-panel p-3 shadow-[0_14px_40px_rgba(0,0,0,0.45)]"
        style={{ top, left, width: WIDTH }}
      >
        <div className="mb-2.5 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-[19px] w-[19px] shrink-0 rounded-[5px]"
            style={subjectTint(subject.color, 60)}
          />
          <span className="truncate text-[13px] font-semibold text-hs-text-primary">{name}</span>
          <span className="ml-auto shrink-0 text-[11px] text-hs-text-faint">{where}</span>
        </div>

        <label className="mb-2.5 block">
          <span className="mb-1 block text-[11px] text-hs-text-muted">{t('timetableModal.cell.room')}</span>
          <input
            ref={roomRef}
            type="text"
            value={draftRoom}
            maxLength={TIMETABLE_LIMITS.maxRoomLength}
            placeholder={t('timetableModal.cell.roomPlaceholder')}
            onChange={(event) => setDraftRoom(event.target.value)}
            onBlur={() => {
              if (draftRoom !== room) onSave({ room: draftRoom });
            }}
            className={MODAL_INPUT_CLASS}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] text-hs-text-muted">{t('timetableModal.cell.course')}</span>
          <input
            type="text"
            value={draftCourse}
            maxLength={TIMETABLE_LIMITS.maxCodeLength}
            placeholder={t('timetableModal.cell.coursePlaceholder')}
            onChange={(event) => setDraftCourse(event.target.value)}
            onBlur={() => {
              if (draftCourse !== course) onSave({ course: draftCourse });
            }}
            className={MODAL_INPUT_CLASS}
          />
        </label>
        <FieldHint className="mb-2.5 mt-1">
          {t('timetableModal.cell.courseHint')}
        </FieldHint>

        <div className="border-t border-hs-border pt-2.5">
          <div className="flex items-center gap-2">
            {/*
              Only the boxes that say something. Sending both whatever they
              held made a button labelled "copy" into a mass delete: a lesson
              with no room of its own cleared the room off every other lesson
              of that subject, in both weeks, with nothing to undo it. An empty
              box and a deliberate clear cannot be told apart here, and the
              common reason a room box is empty is that this lesson has no room.
            */}
            <button
              type="button"
              disabled={nothingToCopy}
              onClick={() =>
                onCopyToSubject({
                  ...(draftRoom.trim() ? { room: draftRoom } : {}),
                  ...(draftCourse.trim() ? { course: draftCourse } : {}),
                })
              }
              className="flex-1 rounded-md border border-hs-border-strong bg-hs-card px-2 py-1 text-left text-[11.5px] leading-snug text-hs-text-body transition-colors hover:bg-hs-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-hs-card"
            >
              {t('timetableModal.cell.copyToSubject', { subject: name })}
            </button>
            <button
              type="button"
              onClick={close}
              className="shrink-0 rounded px-1.5 py-1 text-xs text-hs-accent transition-colors hover:underline"
            >
              {t('timetableModal.cell.done')}
            </button>
          </div>
          {nothingToCopy && (
            <FieldHint data-testid="cell-details-copy-hint" className="mt-1.5">
              {t('timetableModal.cell.copyNeedsValue')}
            </FieldHint>
          )}
        </div>
      </div>
    </>
  );
}
