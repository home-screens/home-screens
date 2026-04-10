'use client';

import { useDisplayTarget } from '../display-target';

/**
 * Segmented control at the top of the remote that lets the user pick which
 * display(s) commands target. Hidden entirely when no displays are
 * registered (single-display install) so it doesn't add visual noise to
 * setups that don't need it. With one or more displays the picker shows
 * "All" plus a button per display.
 */
export default function DisplayPicker() {
  const { target, setTarget, displays } = useDisplayTarget();

  if (displays.length === 0) return null;

  // Every option has an explicit string value — "all" for broadcast plus one
  // per registered display. The picker doesn't render in single-display mode,
  // so `target === undefined` is never possible here; we still normalize for
  // defensive clarity when comparing against the selected option.
  const options: Array<{ value: string; label: string }> = [
    { value: 'all', label: 'All' },
    ...displays.map((d) => ({ value: d.id, label: d.name })),
  ];
  const selected = target ?? 'all';

  return (
    <section className="mt-4 mx-5">
      <div className="text-[11px] uppercase tracking-wider text-hs-text-faint mb-2">
        Targeting
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <button
              key={opt.value}
              onClick={() => setTarget(opt.value)}
              className={`shrink-0 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-medium transition-all active:scale-[0.97] border ${
                active
                  ? 'bg-hs-accent-soft text-hs-accent-hover border-hs-accent/25'
                  : 'bg-hs-card text-hs-text-muted border-hs-border-strong'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
