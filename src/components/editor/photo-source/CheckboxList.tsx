'use client';

/**
 * A short list of named things to tick, for filters that take any of
 * several (Immich albums, people). Nothing ticked means "any".
 */
export default function CheckboxList({ options, selected, onChange, emptyLabel, testId }: {
  options: Array<{ id: string; label: string; thumbnailUrl?: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
  /** What the list says when there is nothing to tick. */
  emptyLabel: string;
  testId?: string;
}) {
  if (options.length === 0) return <p className="text-[10px] text-hs-text-faint">{emptyLabel}</p>;
  const chosen = new Set(selected);
  const toggle = (id: string, on: boolean) => {
    const next = on ? [...selected.filter((s) => s !== id), id] : selected.filter((s) => s !== id);
    onChange(next);
  };
  return (
    <div className="max-h-40 space-y-0.5 overflow-y-auto rounded border border-hs-border-strong bg-hs-card px-2 py-1" data-testid={testId}>
      {options.map((option) => (
        <label key={option.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-xs text-hs-text-body">
          <input
            type="checkbox"
            checked={chosen.has(option.id)}
            onChange={(e) => toggle(option.id, e.target.checked)}
            className="rounded border-hs-border-strong"
          />
          {option.thumbnailUrl && <img src={option.thumbnailUrl} alt="" className="h-5 w-5 rounded-full border border-hs-border-strong object-cover" />}
          <span className="truncate">{option.label}</span>
        </label>
      ))}
    </div>
  );
}
