'use client';

/**
 * Shared "Inherited / Forked" banner used at the top of SleepSection and
 * AlertSection in multi-display mode. These cards edit nested config
 * objects (`sleep`+`screensaver`, `alerts`) which the shallow-merge
 * contract forces to be full-replacement overrides — so the fork is
 * coarse-grained (the whole card is either inherited or forked as one
 * unit) rather than field-level like `InheritedField`.
 *
 * Extracted so the two sections can't drift — the banner copy, styling,
 * and button labels stay in one place.
 */
interface ForkBannerProps {
  label: string; // e.g. "Sleep settings", "Notifications"
  displayName: string;
  isForked: boolean;
  onFork: () => void;
  onReset: () => void;
}

export default function ForkBanner({ label, displayName, isForked, onFork, onReset }: ForkBannerProps) {
  return (
    <div className="mb-4 rounded-md border border-neutral-700 bg-neutral-800/40 px-3 py-2 flex items-center justify-between gap-3">
      <div className="text-xs text-neutral-400">
        {isForked
          ? `Editing ${label} for ${displayName} only.`
          : `Inherited from hub — this display uses the shared ${label}.`}
      </div>
      {isForked ? (
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] text-blue-400 hover:underline shrink-0"
        >
          Reset to inherited
        </button>
      ) : (
        <button
          type="button"
          onClick={onFork}
          className="text-[11px] uppercase tracking-wider text-neutral-300 hover:text-neutral-100 transition-colors px-2 py-1 rounded bg-neutral-700/60 border border-neutral-600 shrink-0"
        >
          Override for {displayName}
        </button>
      )}
    </div>
  );
}
