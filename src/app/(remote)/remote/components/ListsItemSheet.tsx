'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import { TODO_LIMITS, type TodoListItem } from '@/types/todos';
import type { FamilyMember } from '@/types/family';
import { classifyDue } from '@/lib/todo-due-labels';
import { addDaysISO } from '@/components/modules/chore-chart/types';
import BottomSheet from './BottomSheet';
import {
  DANGER_BUTTON,
  GHOST_BUTTON,
  HELPER_TEXT,
  PRIMARY_BUTTON,
  SEGMENT_ROW,
  SHEET_FIELD,
  SHEET_LABEL,
  personChipStyle,
  segmentStyle,
} from './lists-styles';

type DueMode = 'none' | 'today' | 'tomorrow' | 'pick';

interface ListsItemSheetProps {
  item: TodoListItem;
  todayISO: string;
  /** The family roster, in roster order. Empty shows the way to the Family screen. */
  members: FamilyMember[];
  onSave: (patch: { text: string; dueDate: string; assigneeIds: string[] }) => void;
  onDelete: () => void;
  onClose: () => void;
  /** Opens the Family screen over this sheet. */
  onAddPeople: () => void;
}

function initialMode(dueDate: string | undefined, todayISO: string): DueMode {
  if (!dueDate) return 'none';
  const kind = classifyDue(dueDate, todayISO);
  if (kind === 'today') return 'today';
  if (kind === 'tomorrow') return 'tomorrow';
  return 'pick';
}

/** The sheet behind the pencil: text, a due day, and who it is for. */
export default function ListsItemSheet({ item, todayISO, members, onSave, onDelete, onClose, onAddPeople }: ListsItemSheetProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const [text, setText] = useState(item.text);
  const [mode, setMode] = useState<DueMode>(() => initialMode(item.dueDate, todayISO));
  const [pickedDate, setPickedDate] = useState(item.dueDate ?? '');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(item.assigneeIds ?? []);

  const toggleAssignee = (id: string) =>
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const resolvedDue =
    mode === 'none' ? '' : mode === 'today' ? todayISO : mode === 'tomorrow' ? addDaysISO(todayISO, 1) : pickedDate;

  const save = () => {
    const clean = text.trim();
    if (!clean) return;
    // Ids of people since removed from the roster are dropped on save.
    onSave({ text: clean, dueDate: resolvedDue, assigneeIds: assigneeIds.filter((id) => members.some((m) => m.id === id)) });
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

        <span style={SHEET_LABEL} id="todo-who-label">{t('lists.itemSheet.whoLabel')}</span>
        {members.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-labelledby="todo-who-label">
            {members.map((m) => {
              const on = assigneeIds.includes(m.id);
              return (
                <button key={m.id} type="button" aria-pressed={on} onClick={() => toggleAssignee(m.id)} style={personChipStyle(on)}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: m.color,
                      color: '#111',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 800,
                      flex: 'none',
                    }}
                  >
                    {m.name.trim().charAt(0).toUpperCase()}
                  </span>
                  {m.name}
                </button>
              );
            })}
          </div>
        ) : (
          // An empty roster used to hide this row, which made the gap
          // invisible: say so and point at the Family screen instead.
          <div data-testid="todo-who-empty" role="group" aria-labelledby="todo-who-label">
            <div style={{ ...HELPER_TEXT, marginTop: 0 }}>{tCore('family.emptyTitle')}</div>
            <button type="button" className="press-scale" style={{ ...GHOST_BUTTON, marginTop: 8 }} onClick={onAddPeople}>
              {t('lists.itemSheet.whoAdd')}
            </button>
          </div>
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
