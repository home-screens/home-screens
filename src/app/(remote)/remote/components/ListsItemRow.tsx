'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties } from 'react';
import { Pencil } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { classifyDue, formatDueLabel } from '@/lib/todo-due-labels';
import type { TodoListItem } from '@/types/todos';
import type { FamilyMember } from '@/types/family';
import { memberInitials, memberInk } from '@/lib/family-avatar';
import TickRow, { TICK_DONE_OPACITY, TICK_ROW_FRAME } from './TickRow';
import IconButton from './IconButton';

/** Initials shown per row before the "+N" bubble (the five-plus-members rule). */
const MAX_INITIALS = 2;
const BUBBLE_PX = 22;
const OVERLAP_PX = 6;

interface ListsItemRowProps {
  item: TodoListItem;
  todayISO: string;
  members: ReadonlyMap<string, FamilyMember>;
  onToggle: () => void;
  onEdit: () => void;
}

/** Up to two initials in member colours, then "+N"; the full names sit in the tooltip. */
function Assignees({ ids, members }: { ids: string[]; members: ReadonlyMap<string, FamilyMember> }) {
  const known = ids.map((id) => members.get(id)).filter((m): m is FamilyMember => !!m);
  if (known.length === 0) return null;
  const shown = known.slice(0, MAX_INITIALS);
  const extra = known.length - shown.length;
  const bubble: CSSProperties = {
    width: BUBBLE_PX,
    height: BUBBLE_PX,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 800,
    marginLeft: -OVERLAP_PX,
    // The ring is the row's own background, so overlapping bubbles read as
    // separate coins rather than one blob.
    boxShadow: '0 0 0 2px var(--hs-bg-panel)',
    flex: 'none',
  };
  return (
    <span
      data-testid="todo-assignees"
      title={known.map((m) => m.name).join(', ')}
      style={{ display: 'inline-flex', flex: 'none', paddingLeft: OVERLAP_PX, paddingRight: 2 }}
    >
      {shown.map((m) => (
        <span key={m.id} style={{ ...bubble, background: m.color, color: memberInk(m.color) }} aria-hidden="true">
          {memberInitials(m.name)}
        </span>
      ))}
      {extra > 0 && (
        <span style={{ ...bubble, background: 'var(--hs-bg-card)', color: 'var(--hs-text-muted)' }} aria-hidden="true">
          +{extra}
        </span>
      )}
    </span>
  );
}

/** One 52px row: grip, the tick with the text, due chip and initials, pencil. */
export default function ListsItemRow({ item, todayISO, members, onToggle, onEdit }: ListsItemRowProps) {
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
        ...TICK_ROW_FRAME,
        opacity: isDragging ? 0.9 : item.completed ? TICK_DONE_OPACITY : 1,
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
        // 44 wide for small fingers; the negative margin takes back the row's
        // gap so the item text moves over as little as possible.
        style={{
          width: 44,
          marginRight: -4,
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

      <TickRow
        framed={false}
        checked={item.completed}
        onToggle={onToggle}
        label={item.text}
        // The name is the text alone, not text plus due chip plus initials,
        // so "Oat milk" stays addressable once it gains a "Today" chip.
        ariaLabel={item.text}
        trailing={(
          <>
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
                        ? 'var(--hs-warning-ink)'
                        : 'var(--hs-text-muted)',
                }}
              >
                {dueLabel}
              </span>
            )}
            {item.assigneeIds && item.assigneeIds.length > 0 && (
              <Assignees ids={item.assigneeIds} members={members} />
            )}
          </>
        )}
      />

      <IconButton label={t('lists.item.edit', { text: item.text })} onClick={onEdit} style={{ color: 'var(--hs-text-faint)' }}>
        <Pencil size={16} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
