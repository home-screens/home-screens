'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslate } from '@/i18n';

/**
 * The new visual primitive for a per-display field that may either inherit
 * from a Defaults page or be overridden just for this display.
 *
 * Replaces the previous `InheritedField` chip pattern, which packed "what
 * state is this in?" and "how do I change it?" into a single inline pill
 * that doubled as the trigger. The mockup explicitly rejected that fusion
 * because the pill was both indicator and action button at once, and
 * mis-clicks could silently fork or reset a field.
 *
 * Two clearly distinct affordances:
 *   - **Row state** — passive visual cue, never clickable on its own:
 *       default → child control rendered with `disabled: true`,
 *       overridden → child rendered fully interactive with a blue-tinted
 *                    row background.
 *   - **Action button** — explicit "Override" / "Reset to default", in
 *     the row's top-right.
 *
 * The `defaultsPageHref` lets every help-text link jump back to the
 * concrete Defaults page where the shared value lives, fulfilling the
 * "every default has a real visible page" structural rule. Together with
 * `findDisplaysOverridingFields` on the Defaults side, this gives every
 * field a bidirectional jump path.
 */
interface OverrideRowProps<T> {
  /** Visible label rendered above the control. */
  label: string;
  /** The value from the Defaults page that this field falls back to. */
  defaultValue: T;
  /** The override value, or `undefined` when this display is using the default. */
  override: T | undefined;
  /** Called when the user clicks the "Override" button. The current default
   *  value is passed as the seed so the freshly-forked control starts
   *  showing the same value the user was just looking at. */
  onFork: (seed: T) => void;
  /** Called when the user clicks "Reset to default" on an overridden field. */
  onReset: () => void;
  /** Href for the "Defaults → X" link in the help text. Always a search-
   *  param URL the same page can route on, never a hard navigation. */
  defaultsPageHref: string;
  /** Visible label for the "Defaults → X" link, e.g. "Defaults → Display". */
  defaultsPageLabel: string;
  /** Pretty-format the value for the help text. Defaults to `String(value)`. */
  formatValue?: (value: T) => string;
  /** Display name used in the "Overridden for {name}" copy. */
  displayName?: string;
  /** Render the control. `disabled` is true while the field is in the
   *  default state and the child should be visually + functionally inert. */
  children: (args: {
    value: T;
    onChange: (next: T) => void;
    disabled: boolean;
  }) => ReactNode;
}

export default function OverrideRow<T>({
  label,
  defaultValue,
  override,
  onFork,
  onReset,
  defaultsPageHref,
  defaultsPageLabel,
  formatValue,
  displayName,
  children,
}: OverrideRowProps<T>) {
  const t = useTranslate('editor');
  const isOverridden = override !== undefined;
  // The control reads from the override when set, otherwise from the
  // shared default. We never pass `undefined` down — the child always
  // sees a renderable value.
  const value = isOverridden ? (override as T) : defaultValue;
  const formattedDefault = formatValue ? formatValue(defaultValue) : String(defaultValue);

  // While the field is in the default state, child onChange events would
  // normally be a no-op (the control is disabled). We still wire it up so
  // a click-to-fork child (theme button, checkbox) can use a single user
  // gesture to both override AND set, mirroring the legacy InheritedField
  // semantics. Drag-style controls (sliders) should respect `disabled`.
  const handleChange = (next: T) => {
    onFork(next);
  };

  return (
    <div
      className={`px-4 py-3.5 border-b border-hs-border last:border-b-0 transition-colors ${
        isOverridden ? 'bg-hs-accent/[0.04]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-xs text-hs-text-muted">{label}</span>
        {isOverridden ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-accent-hover bg-hs-accent-soft border border-hs-accent/35 hover:bg-hs-accent/20 transition-colors whitespace-nowrap"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {t('settings.overrideRow.resetToDefault')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onFork(defaultValue)}
            className="text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-text-muted bg-hs-card border border-hs-border-strong hover:text-hs-text-body hover:bg-hs-hover transition-colors whitespace-nowrap"
          >
            {t('settings.overrideRow.override')}
          </button>
        )}
      </div>
      <div className={isOverridden ? undefined : 'opacity-70'}>
        {children({ value, onChange: handleChange, disabled: !isOverridden })}
      </div>
      <div className="text-[11px] text-hs-text-faint mt-2">
        {isOverridden ? (
          <>
            {displayName
              ? t('settings.overrideRow.overriddenForDisplay', { name: displayName })
              : t('settings.overrideRow.overriddenWithoutDisplay')}
            <strong className="text-hs-text-secondary">{formattedDefault}</strong>
            {t('settings.overrideRow.overriddenSuffix')}
            <Link
              href={defaultsPageHref}
              className="text-hs-accent hover:text-hs-accent-hover border-b border-dashed border-hs-accent/40 hover:border-hs-accent/60"
            >
              {defaultsPageLabel}
            </Link>
            {t('settings.overrideRow.overriddenSuffixEnd')}
          </>
        ) : (
          <>
            {t('settings.overrideRow.usingDefault')}
            <Link
              href={defaultsPageHref}
              className="text-hs-accent hover:text-hs-accent-hover border-b border-dashed border-hs-accent/40 hover:border-hs-accent/60"
            >
              {defaultsPageLabel}
            </Link>
            {t('settings.overrideRow.usingDefaultPart2')}
            <strong className="text-hs-text-secondary">{formattedDefault}</strong>
            {t('settings.overrideRow.usingDefaultPart3')}
          </>
        )}
      </div>
    </div>
  );
}
