'use client';

import { useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, MoreHorizontal, X } from 'lucide-react';
import { useTranslate, type TranslateFn } from '@/i18n';
import type { Screen } from '@/types/config';

/** Fingers and trackpads alike: every control on a tab is a 24px square. */
const TAB_CONTROL = 'flex h-6 w-6 shrink-0 items-center justify-center rounded text-hs-text-faint transition-colors hover:bg-hs-hover';

function DurationBadge({ ms, t }: { ms: number; t: TranslateFn }) {
  if (ms === 0) {
    // A screen that never rotates on its own says so in a word; "0s" read
    // as a warning about a broken duration.
    return (
      <span
        className="ml-1 text-[9px] font-semibold tracking-wide text-hs-warning bg-hs-warning/15 border border-hs-warning/35 rounded-full px-1.5 py-[1px]"
        aria-hidden
      >
        {t('screenTabs.stickyBadge')}
      </span>
    );
  }
  const sec = Math.round(ms / 1000);
  // Sub-second durations keep the raw "ms" suffix — too short to round to
  // whole seconds without losing information. Translation surface stays at
  // the seconds-suffix level to avoid a separate sub-second key for an edge
  // case that already uses a non-localized number suffix.
  const label = sec < 1 ? `${ms}ms` : t('screenTabs.secondsSuffix', { seconds: sec });
  return (
    <span
      className="ml-1 text-[9px] font-semibold tracking-wide text-hs-accent-hover bg-hs-accent-soft border border-hs-accent/35 rounded-full px-1.5 py-[1px]"
      aria-hidden
    >
      {label}
    </span>
  );
}

interface ScreenTabProps {
  screen: Screen;
  isSelected: boolean;
  isEditing: boolean;
  editValue: string;
  onSelect: () => void;
  onStartEditing: () => void;
  onEditChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelEditing: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  canDelete: boolean;
}

export default function ScreenTab({
  screen,
  isSelected,
  isEditing,
  editValue,
  onSelect,
  onStartEditing,
  onEditChange,
  onCommitRename,
  onCancelEditing,
  onDelete,
  onContextMenu,
  canDelete,
}: ScreenTabProps) {
  const t = useTranslate('editor');
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: screen.id });

  // Lock to horizontal axis (y: 0 prevents clipping by overflow-y-hidden)
  // and preserve original size (scaleX/Y: 1 prevents resizing to match target slot)
  const clampedTransform = transform ? { ...transform, y: 0, scaleX: 1, scaleY: 1 } : null;

  const isDisabled = screen.enabled === false;

  const style = {
    transform: CSS.Transform.toString(clampedTransform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : (isDisabled && !isSelected ? 0.45 : undefined),
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-active={isSelected}
      title={(() => {
        const parts: string[] = [screen.name];
        if (screen.rotationDurationMs === 0) parts.push(t('screenTabs.stickyTooltip'));
        else if (screen.rotationDurationMs != null) parts.push(t('screenTabs.secondsSuffix', { seconds: Math.round(screen.rotationDurationMs / 1000) }));
        if (screen.schedule) parts.push(t('screenTabs.scheduledTooltip'));
        if (isDisabled) parts.push(t('screenTabs.disabledTooltip'));
        return parts.join(' · ');
      })()}
      className={`group flex shrink-0 items-center gap-1 rounded-t-md py-1 pl-3 pr-1.5 text-sm cursor-pointer transition-colors ${
        isSelected
          ? 'bg-hs-card text-hs-text-primary'
          : 'bg-hs-panel text-hs-text-muted hover:text-hs-text-body'
      }`}
      onClick={onSelect}
      onDoubleClick={onStartEditing}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename();
            if (e.key === 'Escape') onCancelEditing();
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-28 border-b border-hs-border-strong bg-transparent text-sm text-hs-text-primary outline-none"
        />
      ) : (
        <>
          <span className="max-w-32 truncate">{screen.name}</span>
          {screen.rotationDurationMs != null && <DurationBadge ms={screen.rotationDurationMs} t={t} />}
          {screen.schedule && (
            <Clock
              className="ml-0.5 h-3 w-3 text-hs-text-faint"
              aria-hidden="true"
            />
          )}
          {isDisabled && (
            <span
              className="ml-1 text-[9px] font-semibold tracking-wide text-hs-text-faint bg-hs-card border border-hs-border-strong rounded-full px-1.5 py-[1px] line-through decoration-hs-text-faint/60"
              aria-label={t('screenTabs.disabledIndicatorAriaLabel')}
            >
              {t('screenTabs.disabledBadge')}
            </span>
          )}
          {isSelected && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu(e);
              }}
              className={`ml-0.5 ${TAB_CONTROL} hover:text-hs-text-body`}
              title={t('screenTabs.screenOptionsTitle')}
              aria-label={t('screenTabs.screenOptionsAriaLabel', { name: screen.name })}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
      {/* Delete is only offered where it can be seen coming: on the active
          tab, or once the pointer is already on the tab. */}
      {canDelete && !isEditing && (
        <button
          type="button"
          onClick={onDelete}
          className={`${TAB_CONTROL} hover:text-hs-danger ${
            isSelected ? '' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
          }`}
          title={t('screenTabs.deleteTabAriaLabel', { name: screen.name })}
          aria-label={t('screenTabs.deleteTabAriaLabel', { name: screen.name })}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
