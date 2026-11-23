'use client';

/**
 * The dated days one school does differently: a carnival Monday off, a
 * report-card morning that stops after the third period.
 *
 * School holidays and public holidays are not typed here. They come from the
 * holiday feed, so this list only holds what nobody outside the school knows.
 */

import { Plus, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate } from '@/i18n';
import { TIMETABLE_LIMITS, type TimetableSchool, type TimetableSpecialDay } from '@/types/timetables';
import NameInput from './NameInput';
import FieldHint from '@/components/ui/FieldHint';

interface SpecialDaysEditorProps {
  school: TimetableSchool;
  /** The school's period numbers, for the "ends after" choices. */
  periods: number[];
  onChange: (change: (school: TimetableSchool) => TimetableSchool) => void;
}

const DAY_OFF = 'off';

export default function SpecialDaysEditor({ school, periods, onChange }: SpecialDaysEditorProps) {
  const t = useTranslate('editor');

  const setDay = (index: number, patch: Partial<TimetableSpecialDay>) => {
    onChange((current) => ({
      ...current,
      specialDays: current.specialDays.map((day, at) => (at === index ? { ...day, ...patch } : day)),
    }));
  };

  const removeDay = (index: number) => {
    onChange((current) => ({ ...current, specialDays: current.specialDays.filter((_, at) => at !== index) }));
  };

  /**
   * A row that arrives named, and with its date still to answer.
   *
   * A row with no name is held out of the save, so one added with a blank
   * label was thrown away while staying on screen looking real: the same way
   * a nameless break and unnamed after-school care used to go. And a date
   * seeded to today read as an answer rather than a question, when a day the
   * school does differently is almost never today.
   */
  const addDay = () => {
    onChange((current) => ({
      ...current,
      specialDays: [
        ...current.specialDays,
        { date: '', label: t('timetableModal.specialDays.nameDefault'), kind: 'off' },
      ],
    }));
  };

  return (
    <div className="space-y-2">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-hs-text-faint">
        {t('timetableModal.specialDays.title')}
      </h3>

      <div className="space-y-1">
        {school.specialDays.map((day, index) => (
          // Keyed by position only. Keying by the date remounted the row on every
          // keystroke in the date field, which took the focus out of it.
          <div key={index} className="flex flex-wrap items-center gap-1.5">
            <span className="w-[136px] shrink-0">
              <input
                type="date"
                value={day.date}
                aria-label={t('timetableModal.specialDays.date')}
                onChange={(event) => setDay(index, { date: event.target.value })}
                className={`${MODAL_INPUT_CLASS} tabular-nums`}
              />
            </span>
            <span className="min-w-[120px] flex-1">
              {/*
                The placeholder says the middle box is the name, which nothing
                else on the row does, and the word typed here is kept when the
                box is emptied rather than taking the row with it.
              */}
              <NameInput
                value={day.label}
                maxLength={TIMETABLE_LIMITS.maxNameLength}
                placeholder={t('timetableModal.specialDays.nameDefault')}
                aria-label={t('timetableModal.specialDays.name')}
                onCommit={(label) => setDay(index, { label })}
                className={MODAL_INPUT_CLASS}
              />
            </span>
            <span className="w-[176px] shrink-0">
              <select
                value={day.kind === 'off' ? DAY_OFF : String(day.period ?? periods[0] ?? 1)}
                aria-label={t('timetableModal.specialDays.what')}
                onChange={(event) =>
                  setDay(
                    index,
                    event.target.value === DAY_OFF
                      ? { kind: 'off', period: undefined }
                      : { kind: 'ends-after', period: Number(event.target.value) },
                  )
                }
                className={MODAL_INPUT_CLASS}
              >
                <option value={DAY_OFF}>{t('timetableModal.specialDays.dayOff')}</option>
                {periods.map((number) => (
                  <option key={number} value={number}>
                    {t('timetableModal.specialDays.endsAfter', { number })}
                  </option>
                ))}
              </select>
            </span>
            <button
              type="button"
              aria-label={t('timetableModal.specialDays.remove')}
              onClick={() => removeDay(index)}
              className="rounded p-1 text-hs-text-faint transition-colors hover:bg-hs-card hover:text-hs-danger"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <Button
        size="sm"
        className="inline-flex items-center gap-1"
        onClick={addDay}
        disabled={school.specialDays.length >= TIMETABLE_LIMITS.maxSpecialDaysPerSchool}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {t('timetableModal.specialDays.add')}
      </Button>
      <FieldHint>{t('timetableModal.specialDays.help')}</FieldHint>
    </div>
  );
}
