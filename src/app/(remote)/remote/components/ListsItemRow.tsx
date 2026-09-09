'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pencil } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { classifyDue, formatDueLabel } from '@/lib/todo-due-labels';
import type { TodoListItem } from '@/types/todos';

interface ListsItemRowProps {
  item: TodoListItem;
  todayISO: string;
  onToggle: () => void;
  onEdit: () => void;
}

/** One 52px row: grip, checkbox with the text, due chip, initials, pencil. */
export default function ListsItemRow({ item, todayISO, onToggle, onEdit }: ListsItemRowProps) {
  const t = useTranslate('remote');
  const locale = useFormattingLocale();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const dueKind = item.dueDate ? classifyDue(item.dueDate, todayISO, item.completed) : null;
  const dueLabel = item.dueDate
    ? formatDueLabel(item.dueDate, todayISO, locale, {
        today: t('lists.due.today'),
        tomorrow: t('lists.due.tomorrow'),
        overdue: t('lists.due.overdue'),
      }, item.completed)
    : null;

  return (
    <div
      ref={setNodeRef}
      data-testid="todo-item"
      data-completed={item.completed ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        minHeight: 52,
        padding: '4px 4px 4px 0',
        marginBottom: 6,
        borderRadius: 12,
        border: '1px solid var(--hs-border)',
        background: 'var(--hs-bg-panel)',
        opacity: isDragging ? 0.9 : item.completed ? 0.55 : 1,
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.35)' : undefined,
        transform: CSS.Transform.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 2 : undefined,
      }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('lists.item.move', { text: item.text })}
        style={{
          width: 28,
          minHeight: 44,
          flex: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          color: 'var(--hs-border-strong)',
          background: 'none',
          border: 'none',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <i style={{ display: 'block', width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
        <i style={{ display: 'block', width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
        <i style={{ display: 'block', width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
      </button>

      <button
        type="button"
        role="checkbox"
        aria-checked={item.completed}
        // The name is the text alone, not text plus due chip plus initials,
        // so "Oat milk" stays addressable once it gains a "Today" chip.
        aria-label={item.text}
        onClick={onToggle}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '4px 4px 4px 0',
          background: 'none',
          border: 'none',
          color: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          fontFamily: 'inherit',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            border: item.completed ? '2px solid var(--hs-success)' : '2px solid var(--hs-text-faint)',
            background: item.completed ? 'var(--hs-success)' : 'transparent',
            color: '#fff',
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 800,
            transition: 'all 0.15s',
          }}
        >
          {item.completed ? '✓' : ''}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 15,
            fontWeight: 500,
            lineHeight: 1.25,
            color: item.completed ? 'var(--hs-text-faint)' : 'var(--hs-text-body)',
            textDecoration: item.completed ? 'line-through' : 'none',
            overflowWrap: 'anywhere',
          }}
        >
          {item.text}
        </span>
        {dueLabel && (
          <span
            data-testid="todo-due-chip"
            style={{
              flex: 'none',
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 7px',
              borderRadius: 7,
              whiteSpace: 'nowrap',
              background:
                dueKind === 'today'
                  ? 'color-mix(in srgb, var(--hs-accent) 18%, transparent)'
                  : dueKind === 'overdue'
                    ? 'color-mix(in srgb, var(--hs-warning) 18%, transparent)'
                    : 'var(--hs-bg-card)',
              color:
                dueKind === 'today'
                  ? 'var(--hs-accent-hover)'
                  : dueKind === 'overdue'
                    ? 'var(--hs-warning)'
                    : 'var(--hs-text-muted)',
            }}
          >
            {dueLabel}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onEdit}
        aria-label={t('lists.item.edit', { text: item.text })}
        style={{
          width: 36,
          minHeight: 44,
          flex: 'none',
          borderRadius: 9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--hs-text-faint)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <Pencil size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
