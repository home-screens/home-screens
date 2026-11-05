'use client';

import type { ReactNode } from 'react';

/**
 * The two-way mode switch every rotation source uses (Unsplash Search/Collections,
 * Immich Pictures/Filters, Local Pictures/Folder). Convention: the hand-picked
 * "pictures" mode comes first.
 */
export default function SourceModeToggle<T extends string>({ options, value, onChange, testIdPrefix }: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-md bg-hs-card p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          data-testid={`${testIdPrefix}-${option.id}`}
          onClick={() => onChange(option.id)}
          className={`truncate rounded px-2 py-1 text-[11px] ${
            value === option.id ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Explanatory line shown at the top of a source's controls. */
export function SourceHint({ children, testId }: { children: ReactNode; testId?: string }) {
  return <p className="text-[10px] leading-relaxed text-hs-text-faint" data-testid={testId}>{children}</p>;
}
