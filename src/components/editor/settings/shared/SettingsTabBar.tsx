'use client';

/**
 * The row of underlined tabs at the top of a Settings page that splits into
 * panels (Screen, Automation, a display's own page). One component so the
 * three rows stay one look.
 */
export default function SettingsTabBar<T extends string>({
  tabs,
  active,
  onPick,
  label,
  testIdPrefix,
  capitalize = false,
}: {
  tabs: readonly T[];
  active: T;
  onPick: (tab: T) => void;
  label: (tab: T) => string;
  /** Each tab gets `<prefix>-<tab>` as its test id. */
  testIdPrefix?: string;
  /** For labels that fall back to a raw id when a translation is missing. */
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-center border-b border-hs-border mb-5">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          data-testid={testIdPrefix ? `${testIdPrefix}-${tab}` : undefined}
          onClick={() => onPick(tab)}
          className={`px-1 py-2.5 mr-6 text-sm ${capitalize ? 'capitalize ' : ''}transition-colors border-b-2 ${
            active === tab
              ? 'text-hs-text-primary border-hs-accent'
              : 'text-hs-text-faint border-transparent hover:text-hs-text-secondary'
          }`}
        >
          {label(tab)}
        </button>
      ))}
    </div>
  );
}
