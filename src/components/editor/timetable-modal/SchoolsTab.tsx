'use client';

/**
 * Schools and times: the bell schedule everybody at one school shares, the
 * rule that decides which week is A, and the dated days that break the
 * pattern.
 *
 * A school is picked on the left and edited on the right, because the times
 * belong to the school and not to the child: changing them once changes them
 * for every brother and sister who goes there.
 */

import { useState } from 'react';
import { Plus, School, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import LabeledSelect from '@/components/ui/LabeledSelect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { formatClockTime } from '@/lib/clock-time';
import { useConfirmStore } from '@/stores/confirm-store';
import { useEditorStore } from '@/stores/editor-store';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { dateInZone, isoWeekNumber } from '@/lib/timetable-layout';
import type { FamilyMember } from '@/types/family';
import {
  TIMETABLE_LIMITS,
  type TimetableData,
  type TimetableSchool,
  type TimetableSlot,
} from '@/types/timetables';
import BellTimesEditor from './BellTimesEditor';
import MemberDot from './MemberDot';
import NameInput from './NameInput';
import { PROSE_CLASS } from './prose';
import SchoolHolidaysEditor from './SchoolHolidaysEditor';
import SpecialDaysEditor from './SpecialDaysEditor';
import {
  SCHOOL_TEMPLATES,
  makeSchool,
  periodsOf,
  schoolMembers,
  weekCycleLetters,
  withAddedSchool,
  withSchool,
  withoutSchool,
} from './use-timetable-draft';
import { useHouseholdTimeFormat } from '@/hooks/useHouseholdTimeFormat';

interface SchoolsTabProps {
  data: TimetableData;
  members: readonly FamilyMember[];
  selectedSchoolId: string | null;
  onSelectSchool: (schoolId: string) => void;
  /** Open on the add form, for the "Add school" option in the toolbar. */
  adding: boolean;
  onAdding: (adding: boolean) => void;
  /**
   * A school was added. The window may have sent somebody here to add it, in
   * which case it takes them back to the week that was waiting for it.
   */
  onAdded: (schoolId: string) => void;
  /**
   * Change a school's A/B rule. Held by the window rather than done here,
   * because turning the rule off takes the second week away from everybody at
   * the school and the window is what keeps those weeks and offers them back.
   */
  onWeekCycle: (schoolId: string, weekCycle: TimetableSchool['weekCycle']) => void;
  update: (change: (data: TimetableData) => TimetableData) => void;
}

type CycleChoice = 'off' | 'odd-a' | 'even-a';

/** The last time care runs to in any week, for the school card's sub-line. */
function latestCare(school: TimetableSchool): string | undefined {
  const times = Object.values(school.care?.until ?? {}).filter(Boolean);
  return times.length > 0 ? times.sort()[times.length - 1] : undefined;
}

export default function SchoolsTab({
  data,
  members,
  selectedSchoolId,
  onSelectSchool,
  adding,
  onAdding,
  onAdded,
  onWeekCycle,
  update,
}: SchoolsTabProps) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();
  const tCore = useTranslate('core');
  // Stored as 24-hour, shown in the household's own clock. See PaintGrid.
  const timeFormat = useHouseholdTimeFormat(useEditorStore((s) => s.config?.settings.timeFormat));
  // The household's zone, so this week's letter and number are the wall's.
  const timezone = useEditorHouseholdTimezone();
  const clock = (time: string) => formatClockTime(time, timeFormat);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState(SCHOOL_TEMPLATES[0].id);
  /**
   * The name put back after its box was left empty, so the restore can be
   * explained rather than just happening. Carries the school it belongs to:
   * picking another school in the rail is not the moment to read about this one.
   */
  const [nameKept, setNameKept] = useState<{ schoolId: string; name: string } | null>(null);

  const selected = data.schools.find((school) => school.id === selectedSchoolId) ?? data.schools[0];
  const byId = new Map(members.map((member) => [member.id, member]));

  const summaryOf = (school: { slots: readonly TimetableSlot[] }) => {
    const periods = periodsOf(school);
    // A school whose periods have all been taken away has nothing to count or
    // to run between, and "0 periods · to" would read as a fault rather than
    // as a school somebody is halfway through typing.
    if (periods.length === 0) return t('timetableModal.schools.noTimesYet');
    return t('timetableModal.schools.summary', {
      count: periods.length,
      start: clock(periods[0].start),
      end: clock(periods[periods.length - 1].end),
    });
  };

  // The starting points are named by the kind of school day they suit, and the
  // bells of the chosen one are previewed under the picker rather than being
  // its name: named by their times alone, three schedules read as the only
  // three a school can have.
  const chosenTemplate = SCHOOL_TEMPLATES.find((option) => option.id === template);

  const create = () => {
    const typed = name.trim();
    if (!typed) return;
    const school = makeSchool(typed, chosenTemplate?.slots ?? []);
    update((current) => withAddedSchool(current, school));
    onSelectSchool(school.id);
    setName('');
    onAdding(false);
    onAdded(school.id);
  };

  const changeSchool = (change: (school: TimetableSchool) => TimetableSchool) => {
    if (!selected) return;
    update((current) => withSchool(current, selected.id, change));
  };

  const cycleChoice: CycleChoice = !selected || selected.weekCycle.mode === 'off'
    ? 'off'
    : selected.weekCycle.oddWeek === 'A'
      ? 'odd-a'
      : 'even-a';

  const setCycle = (choice: CycleChoice) => {
    if (!selected) return;
    onWeekCycle(
      selected.id,
      choice === 'off' ? { mode: 'off' } : { mode: 'parity', oddWeek: choice === 'odd-a' ? 'A' : 'B' },
    );
  };

  const letters = selected && selected.weekCycle.mode !== 'off' ? weekCycleLetters(selected, new Date(), timezone) : null;

  /** Who goes to the selected school, which decides whether it can go. */
  const listNames = (names: string[]) =>
    new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);

  const attending = selected
    ? schoolMembers(data, selected.id)
        .map((id) => members.find((member) => member.id === id)?.name)
        .filter((name): name is string => Boolean(name))
    : [];

  /**
   * Remove a school nobody is at.
   *
   * Adding one was a one-way door, the same as a timetable was. A school still
   * in use stays: the store refuses a timetable whose school is not in the list,
   * so deleting one out from under a week would either refuse the whole document
   * or quietly move a child onto another school's bell times. The button says
   * who is there instead.
   */
  const removeSchool = async () => {
    if (!selected || attending.length > 0) return;
    const ok = await useConfirmStore.getState().confirm({
      title: t('timetableModal.schools.removeConfirm.title'),
      message: t('timetableModal.schools.removeConfirm.message', { name: selected.name }),
      confirmLabel: t('timetableModal.schools.removeConfirm.confirmLabel'),
      variant: 'danger',
    });
    if (!ok) return;
    const next = data.schools.find((school) => school.id !== selected.id);
    update((current) => withoutSchool(current, selected.id));
    if (next) onSelectSchool(next.id);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-[300px] shrink-0 space-y-1.5 overflow-y-auto border-r border-hs-border bg-hs-card/40 p-3">
        {data.schools.map((school) => {
          const users = schoolMembers(data, school.id)
            .map((memberId) => byId.get(memberId))
            .filter((member): member is FamilyMember => member !== undefined);
          const careUntil = latestCare(school);
          return (
            <button
              key={school.id}
              type="button"
              aria-pressed={selected?.id === school.id}
              onClick={() => onSelectSchool(school.id)}
              className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                selected?.id === school.id
                  ? 'border-hs-accent bg-hs-accent/10'
                  : 'border-hs-border bg-hs-panel hover:bg-hs-hover'
              }`}
            >
              <span className="block text-sm font-medium text-hs-text-primary">{school.name}</span>
              <span className="mt-0.5 block text-[11px] text-hs-text-muted">
                {summaryOf(school)}
                {school.care && careUntil
                  ? ` · ${t('timetableModal.schools.careSummary', { name: school.care.name, time: clock(careUntil) })}`
                  : ''}
              </span>
              {users.length > 0 && (
                <span className="mt-1.5 flex items-center gap-1.5">
                  <span className="flex -space-x-1.5">
                    {users.map((member) => (
                      <MemberDot key={member.id} member={member} size={18} />
                    ))}
                  </span>
                  <span className="text-[11px] text-hs-text-faint">
                    {users.map((member) => member.name).join(', ')}
                  </span>
                </span>
              )}
            </button>
          );
        })}

        {adding ? (
          <div className="space-y-1.5 rounded-lg border border-hs-border-strong bg-hs-panel p-2.5">
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-hs-text-muted">{t('timetableModal.schools.nameLabel')}</span>
              <input
                type="text"
                value={name}
                autoFocus
                maxLength={TIMETABLE_LIMITS.maxNameLength}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    create();
                  }
                }}
                className={MODAL_INPUT_CLASS}
              />
            </label>
            <div className="space-y-1">
              <LabeledSelect
                label={t('timetableModal.schools.startFrom')}
                value={template}
                onChange={setTemplate}
                options={SCHOOL_TEMPLATES.map((option) => ({
                  value: option.id,
                  label: t(`timetableModal.schools.templates.${option.id}`),
                }))}
                className={MODAL_INPUT_CLASS}
              />
              {chosenTemplate && (
                <p className="text-[11px] tabular-nums text-hs-text-muted">{summaryOf(chosenTemplate)}</p>
              )}
              <p className={`${PROSE_CLASS} text-hs-text-faint`}>{t('timetableModal.schools.startFromHelp')}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="primary" className="flex-1" disabled={!name.trim()} onClick={create}>
                {tCore('actions.add')}
              </Button>
              <Button size="sm" className="flex-1" onClick={() => { onAdding(false); setName(''); }}>
                {tCore('actions.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onAdding(true)}
            disabled={data.schools.length >= TIMETABLE_LIMITS.maxSchools}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-hs-border-strong p-2 text-xs text-hs-text-muted transition-colors hover:text-hs-text-body disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('timetableModal.schools.addSchool')}
          </button>
        )}
      </div>

      {/*
        One column until there is really room for two. A bell row is two native
        time boxes wide, and a 12-hour box needs about 110px of them, so an even
        split of this pane gave each side 391px and every row broke into pieces
        at every window size. Two columns only once the window is at its widest,
        where the bells get 500px and the A/B rule and the dated days take the
        280 beside them.
      */}
      {!selected && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <School size={38} strokeWidth={1.5} className="text-hs-text-faint opacity-40" aria-hidden="true" />
          <p className="mt-3 text-sm text-hs-text-body">{t('timetableModal.empty.schoolsTitle')}</p>
          <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-hs-text-faint">
            {t('timetableModal.empty.schoolsBody')}
          </p>
        </div>
      )}

      {selected && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <div className="flex items-end gap-1.5">
              <label className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-xs text-hs-text-muted">{t('timetableModal.schools.nameLabel')}</span>
                {/*
                  A blank never reaches the document, so clearing the box to
                  retype the name cannot delete the school or the weeks hanging
                  off it. The bin beside it refuses a school somebody is at for
                  the same reason, and now the two controls agree.
                */}
                <NameInput
                  value={selected.name}
                  maxLength={TIMETABLE_LIMITS.maxNameLength}
                  onCommit={(value) => {
                    setNameKept(null);
                    changeSchool((school) => ({ ...school, name: value }));
                  }}
                  onRestore={() => setNameKept({ schoolId: selected.id, name: selected.name })}
                  className={MODAL_INPUT_CLASS}
                />
              </label>
              <button
                type="button"
                disabled={attending.length > 0}
                aria-label={t('timetableModal.schools.remove', { name: selected.name })}
                title={
                  attending.length > 0
                    ? t('timetableModal.schools.removeBlocked', {
                        names: listNames(attending),
                      })
                    : t('timetableModal.schools.remove', { name: selected.name })
                }
                onClick={() => void removeSchool()}
                className="mb-1 rounded p-1 text-hs-text-faint transition-colors hover:bg-hs-card hover:text-hs-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-hs-text-faint"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            {nameKept?.schoolId === selected.id && (
              <p role="status" className={`${PROSE_CLASS} text-hs-text-muted`}>
                {t('timetableModal.schools.nameKept', { name: nameKept.name })}
              </p>
            )}
            <BellTimesEditor school={selected} onChange={changeSchool} />
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-hs-text-faint">
                {t('timetableModal.weekCycle.title')}
              </h3>
              <SegmentedControl
                label={t('timetableModal.weekCycle.title')}
                value={cycleChoice}
                onChange={setCycle}
                options={[
                  { value: 'off', label: t('timetableModal.weekCycle.off') },
                  { value: 'odd-a', label: t('timetableModal.weekCycle.oddIsA') },
                  { value: 'even-a', label: t('timetableModal.weekCycle.evenIsA') },
                ]}
              />
              {letters && (
                <p className={`${PROSE_CLASS} text-hs-text-faint`}>
                  {t('timetableModal.weekCycle.help', {
                    number: isoWeekNumber(dateInZone(new Date(), timezone)),
                    thisLetter: letters.thisLetter,
                    nextLetter: letters.nextLetter,
                  })}
                </p>
              )}
            </div>

            {/* The two of these answer one question between them: whose
                holidays this school follows, and then the days only the
                school itself knows about. They stand together so the second
                one's note can point at the first. */}
            <SchoolHolidaysEditor school={selected} onChange={changeSchool} />

            <SpecialDaysEditor
              school={selected}
              periods={periodsOf(selected).map((period) => period.n)}
              onChange={changeSchool}
            />
          </div>
        </div>
      )}
    </div>
  );
}
