'use client';

import type { ReactNode } from 'react';

/** The left column every tab shares: entries that work like folders, in groups. */
export function PickerSidebar({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="w-[180px] shrink-0 border-r border-hs-border-strong flex flex-col" data-testid="picker-sidebar">
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">{children}</div>
      {footer && <div className="p-2 border-t border-hs-border-strong text-[10px] text-hs-text-faint text-center">{footer}</div>}
    </div>
  );
}

export function PickerGroup({ title }: { title: string }) {
  return <div className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-wider text-hs-text-faint">{title}</div>;
}

/** One entry: an album, a person, an idea, a group of built-in pictures. */
export function PickerEntry({ label, count, selected, onClick, leading, testId }: {
  label: string;
  count?: number | null;
  selected: boolean;
  onClick: () => void;
  /** A face or icon before the name. */
  leading?: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      title={count == null ? label : `${label} (${count})`}
      className={`flex w-full items-center gap-1.5 text-left text-xs px-2 py-1 rounded transition-colors ${
        selected ? 'bg-hs-accent/20 text-hs-accent-hover' : 'text-hs-text-secondary hover:bg-hs-card'
      }`}
    >
      {leading}
      <span className="truncate">{label}</span>
      {count != null && <span className="text-hs-text-faint text-[10px] shrink-0">{count}</span>}
    </button>
  );
}
