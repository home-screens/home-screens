'use client';

import { useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock } from 'lucide-react';
import { useTranslate, type TranslateFn } from '@/i18n';
import type { Screen } from '@/types/config';

function DurationBadge({ ms, t }: { ms: number; t: TranslateFn }) {
  if (ms === 0) {
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
      className={`flex shrink-0 items-center gap-1 rounded-t-md px-3 py-1.5 text-sm cursor-pointer transition-colors ${
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
            <span className="ml-0.5 text-[10px] text-hs-text-faint" aria-label={t('screenTabs.disabledIndicatorAriaLabel')}>
              ⊘
            </span>
          )}
          {isSelected && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu(e);
              }}
              className="ml-1 text-xs text-hs-text-faint hover:text-hs-text-body"
              title={t('screenTabs.screenOptionsTitle')}
              aria-label={t('screenTabs.screenOptionsAriaLabel', { name: screen.name })}
            >
              &#9998;
            </button>
          )}
        </>
      )}
      {canDelete && !isEditing && (
        <button
          onClick={onDelete}
          className="ml-1 text-xs text-hs-text-faint hover:text-hs-danger"
          aria-label={t('screenTabs.deleteTabAriaLabel', { name: screen.name })}
        >
          x
        </button>
      )}
    </div>
  );
}
