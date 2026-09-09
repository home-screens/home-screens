'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import { TODO_LIMITS, type TodoListItem } from '@/types/todos';
import { classifyDue } from '@/lib/todo-due-labels';
import { addDaysISO } from '@/components/modules/chore-chart/types';
import BottomSheet from './BottomSheet';
import {
  DANGER_BUTTON,
  PRIMARY_BUTTON,
  SEGMENT_ROW,
  SHEET_FIELD,
  SHEET_LABEL,
  segmentStyle,
} from './lists-styles';

type DueMode = 'none' | 'today' | 'tomorrow' | 'pick';

interface ListsItemSheetProps {
  item: TodoListItem;
  todayISO: string;
  onSave: (patch: { text: string; dueDate: string }) => void;
  onDelete: () => void;
  onClose: () => void;
}

function initialMode(dueDate: string | undefined, todayISO: string): DueMode {
  if (!dueDate) return 'none';
  const kind = classifyDue(dueDate, todayISO);
  if (kind === 'today') return 'today';
  if (kind === 'tomorrow') return 'tomorrow';
  return 'pick';
}

/** The sheet behind the pencil: text, a due day, and who it is for. */
export default function ListsItemSheet({ item, todayISO, onSave, onDelete, onClose }: ListsItemSheetProps) {
  const t = useTranslate('remote');
  const [text, setText] = useState(item.text);
  const [mode, setMode] = useState<DueMode>(() => initialMode(item.dueDate, todayISO));
  const [pickedDate, setPickedDate] = useState(item.dueDate ?? '');

  const resolvedDue =
    mode === 'none' ? '' : mode === 'today' ? todayISO : mode === 'tomorrow' ? addDaysISO(todayISO, 1) : pickedDate;

  const save = () => {
    const clean = text.trim();
    if (!clean) return;
    onSave({ text: clean, dueDate: resolvedDue });
  };


  const modes: Array<{ id: DueMode; label: string }> = [
    { id: 'none', label: t('lists.itemSheet.dueNone') },
    { id: 'today', label: t('lists.due.today') },
    { id: 'tomorrow', label: t('lists.due.tomorrow') },
    { id: 'pick', label: t('lists.itemSheet.duePick') },
  ];

  return (
    <BottomSheet title={t('lists.itemSheet.title')} onClose={onClose} testId="todo-item-sheet">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={TODO_LIMITS.maxItemTextLength}
          aria-label={t('lists.itemSheet.textLabel')}
          style={SHEET_FIELD}
        />

        <span style={SHEET_LABEL} id="todo-due-label">{t('lists.itemSheet.dueLabel')}</span>
        <div style={SEGMENT_ROW} role="group" aria-labelledby="todo-due-label">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
              style={segmentStyle(mode === m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === 'pick' && (
          <input
            type="date"
            value={pickedDate}
            onChange={(e) => setPickedDate(e.target.value)}
            aria-label={t('lists.itemSheet.dayLabel')}
            style={{ ...SHEET_FIELD, marginTop: 8 }}
          />
        )}


        <button type="submit" className="press-btn" style={{ ...PRIMARY_BUTTON, marginTop: 22 }} disabled={!text.trim()}>
          {t('lists.itemSheet.save')}
        </button>
        <button type="button" className="press-scale" style={DANGER_BUTTON} onClick={onDelete}>
          {t('lists.itemSheet.delete')}
        </button>
      </form>
    </BottomSheet>
  );
}
