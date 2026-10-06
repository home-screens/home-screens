'use client';

/**
 * One person's week: who it belongs to on the left, their school and class
 * along the top, and the grid they paint under it.
 *
 * The people come from Family and are never edited here. A name, a colour or a
 * picture belongs to the person across chores, calendars and the wall, so this
 * window only ever says which of them has a timetable.
 */

import Link from 'next/link';
import { Table, Trash2 } from 'lucide-react';
import { useConfirmStore } from '@/stores/confirm-store';
import LabeledField from '@/components/ui/LabeledField';
import LabeledSelect from '@/components/ui/LabeledSelect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Toggle from '@/components/ui/Toggle';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate } from '@/i18n';
import { settingsPath } from '@/lib/settings-route';
import type { FamilyMember } from '@/types/family';
import { TIMETABLE_LIMITS, type DayKey, type Timetable, type TimetableData, type WeekLetter } from '@/types/timetables';
import MemberDot from './MemberDot';
import PaintGrid from './PaintGrid';
import { PROSE_CLASS } from './prose';
import SourcePanel from './SourcePanel';
import SubjectPalette from './SubjectPalette';
import {
  findSchool,
  findTimetable,
  type SheetCheckOutcome,
  usedSubjectIds,
  withCellDetails,
  withPaintedCell,
  withSubjectDetails,
  withTimetable,
  withoutTimetable,
  type TimetableBrush,
} from './use-timetable-draft';

/** A value no saved id can collide with, for splitting a sentence around a link. */
const MARKER = '\u0000';

interface TimetablesTabProps {
  data: TimetableData;
  members: readonly FamilyMember[];
  selectedMemberId: string | null;
  onSelectMember: (memberId: string) => void;
  /** Start a week for somebody who has none, or send them to add a school. */
  onAddTimetable: (memberId: string) => void;
  /** Add a school for this person, who is waiting on one. */
  onAddSchool: (memberId: string) => void;
  brush: TimetableBrush;
  onBrush: (brush: TimetableBrush) => void;
  onAddSubject: (code: string) => void;
  showing: WeekLetter;
  onShowing: (letter: WeekLetter) => void;
  onWeeksAB: (on: boolean) => void;
  /** Open the import screen, for a week that wants putting back on its sheet. */
  onImportAgain: () => void;
  /**
   * Save pending edits, check this person's sheet and reload its result.
   */
  onCheck: (memberId: string) => Promise<SheetCheckOutcome>;
  update: (change: (data: TimetableData) => TimetableData) => void;
}

export default function TimetablesTab({
  data,
  members,
  selectedMemberId,
  onSelectMember,
  onAddTimetable,
  onAddSchool,
  brush,
  onBrush,
  onAddSubject,
  showing,
  onShowing,
  onWeeksAB,
  onImportAgain,
  onCheck,
  update,
}: TimetablesTabProps) {
  const t = useTranslate('editor');
  const tModules = useTranslate('modules');

  const withTimetables = members.filter((member) => findTimetable(data, member.id));
  const without = members.filter((member) => !findTimetable(data, member.id));
  const selected = members.find((member) => member.id === selectedMemberId) ?? withTimetables[0];
  const timetable = findTimetable(data, selected?.id ?? null);
  const school = findSchool(data, timetable?.schoolId);
  const letter: WeekLetter = timetable?.weeks.B ? showing : 'A';

  // The rail footer is one sentence with a link inside it. The sentence is
  // split around a marker no translation can contain, rather than kept as two
  // halves that only sit either side of a link in English word order.
  const [footerBefore, footerAfter] = t('timetableModal.rail.footer', { link: MARKER }).split(MARKER);

  const change = (patch: (timetable: Timetable) => Timetable) => {
    if (!selected) return;
    update((current) => withTimetable(current, selected.id, patch));
  };

  /**
   * Take this person's week away.
   *
   * Adding one used to be a one-way door: somebody picked by mistake, or a child
   * who has left school, stayed on the list for good, and the only way out was
   * removing them from the family, which takes their chores and their calendar
   * with them. The person is untouched here; only their week goes.
   */
  const removeTimetable = async () => {
    if (!selected) return;
    const ok = await useConfirmStore.getState().confirm({
      title: t('timetableModal.removeTimetable.title'),
      message: t('timetableModal.removeTimetable.message', { name: selected.name }),
      confirmLabel: t('timetableModal.removeTimetable.confirmLabel'),
      variant: 'danger',
    });
    if (!ok) return;
    const next = withTimetables.find((member) => member.id !== selected.id);
    update((current) => withoutTimetable(current, selected.id));
    if (next) onSelectMember(next.id);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[236px] shrink-0 flex-col border-r border-hs-border bg-hs-card/40">
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {withTimetables.length > 0 && (
            <p className="px-1 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-hs-text-faint">
              {t('timetableModal.rail.withTimetable')}
            </p>
          )}
          {withTimetables.map((member) => {
            const own = findTimetable(data, member.id);
            const ownSchool = findSchool(data, own?.schoolId);
            const subtitle = [own?.className, ownSchool?.name].filter(Boolean).join(' · ');
            return (
              <button
                key={member.id}
                type="button"
                aria-pressed={selected?.id === member.id}
                onClick={() => onSelectMember(member.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                  selected?.id === member.id ? 'border border-hs-border-strong bg-hs-panel' : 'border border-transparent hover:bg-hs-hover'
                }`}
              >
                <MemberDot member={member} size={28} />
                <span className="min-w-0 flex-1">
                  <span title={member.name} className="block truncate text-[13px] font-semibold text-hs-text-primary">
                    {member.name}
                  </span>
                  {subtitle && <span className="block truncate text-[11px] text-hs-text-muted">{subtitle}</span>}
                </span>
              </button>
            );
          })}

          {without.length > 0 && (
            <p className="px-1 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-hs-text-faint">
              {t('timetableModal.rail.without')}
            </p>
          )}
          {without.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => onAddTimetable(member.id)}
              className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:bg-hs-hover"
            >
              <MemberDot member={member} size={28} />
              <span className="min-w-0 flex-1">
                <span title={member.name} className="block truncate text-[13px] text-hs-text-body">
                  {member.name}
                </span>
                <span className="block truncate text-[11px] text-hs-text-faint">{t('timetableModal.rail.none')}</span>
              </span>
              <span className="text-[11px] text-hs-accent">{t('timetableModal.rail.add')}</span>
            </button>
          ))}
        </div>

        <p className={`border-t border-hs-border px-3 py-2 ${PROSE_CLASS} text-hs-text-faint`}>
          {footerBefore}
          <Link
            href={settingsPath({ kind: 'defaults', page: 'family' })}
            className="text-hs-accent hover:underline"
          >
            {t('timetableModal.rail.footerLink')}
          </Link>
          {footerAfter}
        </p>
      </div>

      {selected && timetable && school ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-end gap-3 border-b border-hs-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <MemberDot member={selected} size={40} />
              <span>
                <span className="block text-sm font-semibold text-hs-text-primary">{selected.name}</span>
                <span className="block text-[11px] text-hs-text-faint">{t('timetableModal.fromFamily')}</span>
              </span>
            </div>

            {/*
              Only schools in the list of schools. "Add school..." used to be
              the last option, which made an action look like a value and
              answered the question "which school?" with a jump to another tab.
              It is a button beside the box now, and it says who it is for.
            */}
            <LabeledSelect
              label={t('timetableModal.school')}
              value={timetable.schoolId}
              onChange={(value) => change((current) => ({ ...current, schoolId: value }))}
              options={data.schools.map((option) => ({ value: option.id, label: option.name }))}
              className={MODAL_INPUT_CLASS}
              fieldClassName="w-[196px]"
            />
            <button
              type="button"
              onClick={() => onAddSchool(selected.id)}
              className="mb-1 rounded px-1 py-0.5 text-[11px] text-hs-accent transition-colors hover:underline"
            >
              {t('timetableModal.addSchoolLink')}
            </button>

            {/*
              Capped like every other box in the window. Uncapped, one long
              paste sat 60 characters over what the store takes and refused
              every save until it was found: subjects, schools and every other
              person's week with it.
            */}
            <LabeledField label={t('timetableModal.class')} className="w-[72px]">
              <input
                type="text"
                value={timetable.className ?? ''}
                maxLength={TIMETABLE_LIMITS.maxNameLength}
                onChange={(event) => change((current) => ({ ...current, className: event.target.value }))}
                className={MODAL_INPUT_CLASS}
              />
            </LabeledField>

            <LabeledField label={t('timetableModal.weeks')} as="div" className="w-[188px]">
              <SegmentedControl
                label={t('timetableModal.weeks')}
                value={timetable.weeks.B ? 'ab' : 'same'}
                onChange={(value) => onWeeksAB(value === 'ab')}
                options={[
                  { value: 'same', label: t('timetableModal.weeksSame') },
                  { value: 'ab', label: t('timetableModal.weeksAB') },
                ]}
              />
            </LabeledField>

            {timetable.weeks.B && (
              <LabeledField label={t('timetableModal.showing')} as="div" className="w-[148px]">
                <SegmentedControl
                  label={t('timetableModal.showing')}
                  value={letter}
                  onChange={onShowing}
                  options={[
                    { value: 'A' as WeekLetter, label: tModules('timetable.weekLetter', { letter: 'A' }) },
                    { value: 'B' as WeekLetter, label: tModules('timetable.weekLetter', { letter: 'B' }) },
                  ]}
                />
              </LabeledField>
            )}

            {/* Only for a week that came from a spreadsheet: everybody else
                typed theirs, and has nothing to go back to. */}
            {timetable.source && (
              <SourcePanel
                memberId={selected.id}
                source={timetable.source}
                onImportAgain={onImportAgain}
                onCheck={onCheck}
                update={update}
              />
            )}

            {/*
              No `ml-auto` on this pair. Pushed to the far right of a row that
              wraps, it was thrown onto a line of its own below everything
              else, where a bin sitting under the next row read as belonging to
              it. Flowing with the rest of the row, it wraps as a continuation
              of the controls it belongs to.
            */}
            <div className="flex items-center gap-3">
              <Toggle
                label={t('timetableModal.showIcons')}
                checked={!!timetable.icons}
                onChange={(value) => change((current) => ({ ...current, icons: value }))}
              />
              <span aria-hidden="true" className="h-5 w-px bg-hs-border" />
              {/*
                It says what it does. The only way to take a week away was a
                bare bin with no words at all, one gap away from a display
                toggle, so the household had to hover an icon to find out
                whether it was the thing that throws their typing away.
              */}
              <button
                type="button"
                onClick={() => void removeTimetable()}
                className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-hs-text-muted transition-colors hover:bg-hs-card hover:text-hs-danger"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('timetableModal.removeTimetable.action', { name: selected.name })}
              </button>
            </div>
          </div>

          <PaintGrid
            school={school}
            week={letter === 'A' ? timetable.weeks.A : (timetable.weeks.B ?? {})}
            otherWeek={timetable.weeks.B ? (letter === 'A' ? timetable.weeks.B : timetable.weeks.A) : undefined}
            otherLetter={letter === 'A' ? 'B' : 'A'}
            subjects={data.subjects}
            showIcons={timetable.icons}
            onPaint={(day: DayKey, period: number) =>
              update((current) => withPaintedCell(current, selected.id, letter, day, period, brush))
            }
            details={{
              onCell: (day, period, patch) =>
                update((current) => withCellDetails(current, selected.id, letter, day, period, patch)),
              // Both weeks: a school teaches chemistry in the chemistry lab, and
              // a fixed room does not alternate.
              onSubject: (subjectId, patch) =>
                update((current) => withSubjectDetails(current, selected.id, subjectId, patch)),
            }}
          />

          <SubjectPalette
            subjects={data.subjects}
            usedIds={usedSubjectIds(timetable)}
            brush={brush}
            onBrush={onBrush}
            onAddSubject={onAddSubject}
            showIcons={timetable.icons}
          />
        </div>
      ) : (
        /*
          The first thing anybody ever sees in this window. It used to be 900 by
          1050 pixels of nothing, under a footer telling them to pick a subject
          and drag across a week that was not on screen.
        */
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <Table size={38} strokeWidth={1.5} className="text-hs-text-faint opacity-40" aria-hidden="true" />
          {withTimetables.length === 0 ? (
            <>
              <p className="mt-3 text-sm text-hs-text-body">{t('timetableModal.empty.timetablesTitle')}</p>
              <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-hs-text-faint">
                {t('timetableModal.empty.timetablesBody')}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-hs-text-body">{t('timetableModal.empty.timetablesPick')}</p>
          )}
        </div>
      )}
    </div>
  );
}
