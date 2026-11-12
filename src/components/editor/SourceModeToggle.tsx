'use client';

import type { ReactNode } from 'react';

/**
 * The mode switch a photo source with more than one way to name its pictures
 * shows (Library Folder/Pictures, Immich Filters/Pictures, Unsplash
 * Words/Collections/Pictures). Two choices share the width evenly; three
 * take the room their own words need, so a long word in one language
 * ("Sammlungen") is not cut short while a short one beside it has room to spare.
 */
export default function SourceModeToggle<T extends string>({ options, value, onChange, testIdPrefix }: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="flex gap-1 rounded-md bg-hs-card p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          data-testid={`${testIdPrefix}-${option.id}`}
          onClick={() => onChange(option.id)}
          className={`min-w-0 truncate rounded py-1 ${options.length > 2 ? 'flex-auto px-1 text-[10px]' : 'flex-1 px-2 text-[11px]'} ${
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
