'use client';

/**
 * The subject list every timetable paints from.
 *
 * One row is one subject: its colour and picture, the short code a narrow cell
 * shows, the full name, what to bring for it, and who has it. Because the list
 * is shared, changing a colour or a bring note here reaches every child's card
 * at once, which is the point of keeping it in one place.
 */

import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate } from '@/i18n';
import { useConfirmStore } from '@/stores/confirm-store';
import { TIMETABLE_SUBJECT_ICONS } from '@/lib/timetable-subjects/types';
import type { FamilyMember } from '@/types/family';
import { TIMETABLE_LIMITS, type TimetableData, type TimetableSubject } from '@/types/timetables';
import MemberDot from './MemberDot';
import { SubjectIcon, subjectTint } from './SubjectPalette';
import {
  makeSubject,
  nextSubjectColor,
  subjectMembers,
  withAddedSubject,
  withSubject,
  withoutSubject,
} from './use-timetable-draft';
import FieldHint from '@/components/ui/FieldHint';
import { buildDeleteConfirm } from '@/lib/delete-confirmations';


/** Up to this many people are spelled out; past it the column counts them. */
const NAMED_USERS = 2;

/** Faces drawn in the narrow column before the count carries the rest. */
const SHOWN_DOTS = 3;

const COLUMNS = 'grid grid-cols-[44px_90px_minmax(0,1fr)_170px_130px_28px] items-center gap-3';

interface SubjectsTabProps {
  data: TimetableData;
  members: readonly FamilyMember[];
  update: (change: (data: TimetableData) => TimetableData) => void;
}

export default function SubjectsTab({ data, members, update }: SubjectsTabProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [openId, setOpenId] = useState<string | null>(null);
  /** The Short box of every row, so a new subject can be put on screen. */
  const codeBoxes = useRef(new Map<string, HTMLInputElement | null>());
  /** The subject just added, until its row has been shown. */
  const [addedId, setAddedId] = useState<string | null>(null);

  const byId = new Map(members.map((member) => [member.id, member]));

  const change = (subjectId: string, patch: Partial<TimetableSubject>) => {
    update((current) => withSubject(current, subjectId, (subject) => ({ ...subject, ...patch })));
  };

  // A new subject joins the end of a list that is taller than the pane it
  // scrolls in, so pressing Add changed nothing anybody could see. Its name
  // box takes the focus, which brings the row into view and leaves the cursor
  // where the next thing to do is: typing over the placeholder name.
  useEffect(() => {
    if (!addedId) return;
    const box = codeBoxes.current.get(addedId);
    box?.focus();
    box?.select();
    setAddedId(null);
  }, [addedId]);

  // Named, not blank. An empty subject is dropped by `sanitizeTimetableData` on
  // the next save but stays on screen until the window is reopened, so clicking
  // Add and changing your mind left a row that looked real and was not. It
  // arrives with a name somebody can edit or a bin they can press.
  const add = () => {
    const subject = makeSubject(
      t('timetableModal.subjects.newCode'),
      nextSubjectColor(data.subjects),
      t('timetableModal.subjects.newName'),
    );
    update((current) => withAddedSubject(current, subject));
    setOpenId(null);
    setAddedId(subject.id);
  };

  const remove = async (subject: TimetableSubject) => {
    const users = subjectMembers(data, subject.id);
    if (users.length > 0) {
      const ok = await useConfirmStore.getState().confirm(buildDeleteConfirm({
        verb: 'delete',
        name: subject.name || subject.code,
        consequence: t('timetableModal.subjects.removeConfirm.message'),
      }, tCore));
      if (!ok) return;
    }
    update((current) => withoutSubject(current, subject.id));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className={`${COLUMNS} border-b border-hs-border pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-hs-text-faint`}>
          <span>{t('timetableModal.subjects.color')}</span>
          <span>{t('timetableModal.subjects.short')}</span>
          <span>{t('timetableModal.subjects.name')}</span>
          <span>{t('timetableModal.subjects.bring')}</span>
          <span>{t('timetableModal.subjects.usedBy')}</span>
          <span />
        </div>

        {data.subjects.map((subject) => {
          const users = subjectMembers(data, subject.id)
            .map((memberId) => byId.get(memberId))
            .filter((member): member is FamilyMember => member !== undefined);
          return (
            <div key={subject.id} className="border-b border-hs-border py-1.5">
              <div className={COLUMNS}>
                <button
                  type="button"
                  aria-label={t('timetableModal.subjects.color')}
                  aria-expanded={openId === subject.id}
                  onClick={() => setOpenId(openId === subject.id ? null : subject.id)}
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-md"
                  style={subjectTint(subject.color, 30)}
                >
                  <SubjectIcon name={subject.icon} className="h-3.5 w-3.5" />
                </button>
                <input
                  ref={(element) => {
                    codeBoxes.current.set(subject.id, element);
                    return () => {
                    codeBoxes.current.delete(subject.id);
                  };
                  }}
                  type="text"
                  value={subject.code}
                  maxLength={TIMETABLE_LIMITS.maxCodeLength}
                  aria-label={t('timetableModal.subjects.short')}
                  onChange={(event) => change(subject.id, { code: event.target.value })}
                  className={MODAL_INPUT_CLASS}
                />
                <input
                  type="text"
                  value={subject.name}
                  maxLength={TIMETABLE_LIMITS.maxNameLength}
                  aria-label={t('timetableModal.subjects.name')}
                  onChange={(event) => change(subject.id, { name: event.target.value })}
                  className={MODAL_INPUT_CLASS}
                />
                <input
                  type="text"
                  value={subject.bring ?? ''}
                  maxLength={TIMETABLE_LIMITS.maxBringLength}
                  placeholder={t('timetableModal.subjects.nothing')}
                  aria-label={t('timetableModal.subjects.bring')}
                  onChange={(event) => change(subject.id, { bring: event.target.value })}
                  className={MODAL_INPUT_CLASS}
                />
                <UsedBy users={users} />
                <button
                  type="button"
                  aria-label={t('timetableModal.subjects.remove', { name: subject.name || subject.code })}
                  onClick={() => void remove(subject)}
                  className="rounded p-1 text-hs-text-faint transition-colors hover:bg-hs-card hover:text-hs-danger"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              {openId === subject.id && (
                <div className="mt-1.5 flex flex-wrap items-center gap-3 rounded-md bg-hs-card/60 p-2">
                  <label className="flex items-center gap-1.5">
                    <span className="text-xs text-hs-text-muted">{t('timetableModal.subjects.color')}</span>
                    <input
                      type="color"
                      value={subject.color}
                      onChange={(event) => change(subject.id, { color: event.target.value })}
                      className="h-6 w-10 cursor-pointer rounded border border-hs-border-strong bg-transparent"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-hs-text-muted">{t('timetableModal.subjects.icon')}</span>
                    {TIMETABLE_SUBJECT_ICONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        aria-label={icon}
                        aria-pressed={subject.icon === icon}
                        onClick={() => change(subject.id, { icon })}
                        className={`rounded p-1 transition-colors ${
                          subject.icon === icon ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:bg-hs-hover'
                        }`}
                      >
                        <SubjectIcon name={icon} className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/*
        Pinned under the list rather than after it. A household's catalogue
        arrives seventeen subjects long and the list scrolls, so the button
        that adds one sat 465px below the bottom of the pane on arrival: the
        one control the screen is for was the one control nobody could see.
      */}
      <div className="flex flex-wrap items-center gap-2 border-t border-hs-border px-4 py-2.5">
        <Button size="sm" className="inline-flex items-center gap-1" onClick={add} disabled={data.subjects.length >= TIMETABLE_LIMITS.maxSubjects}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t('timetableModal.subjects.add')}
        </Button>
        <FieldHint>{t('timetableModal.subjects.note')}</FieldHint>
      </div>
    </div>
  );
}

/**
 * Who has this subject.
 *
 * Coloured dots on their own leave out anyone who cannot hover them, and two
 * children whose names start with the same letter draw the same dot, so the
 * names come with them: written out while one or two people have the subject,
 * counted once a bigger household would push the names off the end of the row.
 * Either way the full list is on hover and is read out whole.
 */
function UsedBy({ users }: { users: readonly FamilyMember[] }) {
  const t = useTranslate('editor');
  if (users.length === 0) return <span />;

  const names = users.map((member) => member.name).join(', ');
  const summary =
    users.length <= NAMED_USERS
      ? names
      : t('timetableModal.subjects.usedByCount', { count: users.length });

  return (
    <span className="flex min-w-0 items-center gap-1.5" title={names}>
      <span className="sr-only">{t('timetableModal.subjects.usedByNames', { names })}</span>
      <span aria-hidden="true" className="flex shrink-0 -space-x-1.5">
        {users.slice(0, SHOWN_DOTS).map((member) => (
          <MemberDot key={member.id} member={member} size={18} />
        ))}
      </span>
      <span aria-hidden="true" className="truncate text-[11px] text-hs-text-muted">
        {summary}
      </span>
    </span>
  );
}
