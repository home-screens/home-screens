'use client';

/**
 * The brushes under the paint grid: every subject, lunch, and the eraser.
 *
 * The subjects this person already has come first, so a week that uses six of
 * the twenty-two is six chips wide before it is a wall of colour, and the rest
 * stay one click away instead of behind a picker.
 */

import { useState } from 'react';
import { Eraser, Plus, Sandwich } from 'lucide-react';
import { subjectIcon } from '@/components/timetable/subject-icons';
import Button from '@/components/ui/Button';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate } from '@/i18n';
import { TIMETABLE_LIMITS, type TimetableSubject } from '@/types/timetables';
import { PROSE_CLASS } from './prose';
import type { TimetableBrush } from './use-timetable-draft';

export function SubjectIcon({ name, className }: { name: string; className?: string }) {
  const Icon = subjectIcon(name);
  return <Icon className={className ?? 'h-3.5 w-3.5'} aria-hidden="true" />;
}

/**
 * A subject's colour as a fill and a border, mixed against whatever is behind
 * it so the same chip works on the light and the dark editor.
 */
export function subjectTint(color: string, fill = 26): { backgroundColor: string; boxShadow: string } {
  return {
    backgroundColor: `color-mix(in srgb, ${color} ${fill}%, transparent)`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 55%, transparent)`,
  };
}

interface SubjectPaletteProps {
  subjects: readonly TimetableSubject[];
  /** The subjects already in this person's week, which lead the row. */
  usedIds: ReadonlySet<string>;
  brush: TimetableBrush;
  onBrush: (brush: TimetableBrush) => void;
  onAddSubject: (code: string) => void;
  showIcons?: boolean;
}

const CHIP_CLASS = 'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors';

export default function SubjectPalette({
  subjects,
  usedIds,
  brush,
  onBrush,
  onAddSubject,
  showIcons,
}: SubjectPaletteProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState('');

  const ordered = [
    ...subjects.filter((subject) => usedIds.has(subject.id)),
    ...subjects.filter((subject) => !usedIds.has(subject.id)),
  ];

  const submit = () => {
    const typed = code.trim();
    if (!typed) return;
    onAddSubject(typed);
    setCode('');
    setAdding(false);
  };

  const stopAdding = () => {
    setAdding(false);
    setCode('');
  };

  /** The box that takes a new subject's short code, wherever it is offered. */
  const codeBox = (
    <span className="flex items-center gap-1.5">
      <span className="w-24">
        <input
          type="text"
          value={code}
          autoFocus
          maxLength={TIMETABLE_LIMITS.maxCodeLength}
          aria-label={t('timetableModal.subjects.short')}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
            if (event.key === 'Escape') stopAdding();
          }}
          className={MODAL_INPUT_CLASS}
        />
      </span>
      <Button size="sm" variant="primary" disabled={!code.trim()} onClick={submit}>
        {tCore('actions.add')}
      </Button>
      <Button size="sm" onClick={stopAdding}>
        {tCore('actions.cancel')}
      </Button>
    </span>
  );

  /*
    With nothing to paint with, every chip in this row is a lie: the eraser is
    lit, the grid does nothing at all, and the footer used to ask for a subject
    that does not exist. So the brushes go and the row says what is missing.
  */
  if (subjects.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-hs-border px-4 py-2.5">
        <span className={`${PROSE_CLASS} text-hs-text-muted`}>{t('timetableModal.noSubjects')}</span>
        {adding ? (
          codeBox
        ) : (
          <Button size="sm" variant="primary" className="inline-flex items-center gap-1" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('timetableModal.subjects.add')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-hs-border px-4 py-2.5">
      <span className="mr-1 text-xs text-hs-text-muted">{t('timetableModal.paintWith')}</span>

      {ordered.map((subject) => {
        const picked = brush.kind === 'subject' && brush.subjectId === subject.id;
        return (
          <button
            key={subject.id}
            type="button"
            aria-pressed={picked}
            onClick={() => onBrush({ kind: 'subject', subjectId: subject.id })}
            className={`${CHIP_CLASS} ${picked ? 'text-hs-text-primary' : 'text-hs-text-body hover:bg-hs-hover'}`}
            style={picked ? subjectTint(subject.color, 32) : undefined}
          >
            {showIcons ? (
              <SubjectIcon name={subject.icon} className="h-3 w-3" />
            ) : (
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: subject.color }} />
            )}
            {subject.code}
          </button>
        );
      })}

      <button
        type="button"
        aria-pressed={brush.kind === 'lunch'}
        onClick={() => onBrush({ kind: 'lunch' })}
        className={`${CHIP_CLASS} border border-hs-border-strong ${
          brush.kind === 'lunch' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-body hover:bg-hs-hover'
        }`}
      >
        <Sandwich className="h-3 w-3" aria-hidden="true" />
        {t('timetableModal.lunchBrush')}
      </button>

      <button
        type="button"
        aria-pressed={brush.kind === 'clear'}
        onClick={() => onBrush({ kind: 'clear' })}
        className={`${CHIP_CLASS} border border-hs-border-strong ${
          brush.kind === 'clear' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-body hover:bg-hs-hover'
        }`}
      >
        <Eraser className="h-3 w-3" aria-hidden="true" />
        {t('timetableModal.clear')}
      </button>

      {adding ? (
        codeBox
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={subjects.length >= TIMETABLE_LIMITS.maxSubjects}
          className={`${CHIP_CLASS} border border-dashed border-hs-border-strong text-hs-text-muted hover:text-hs-text-body disabled:opacity-50`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t('timetableModal.subjects.add')}
        </button>
      )}
    </div>
  );
}
