'use client';

import Link from 'next/link';
import { Info } from 'lucide-react';
import type { DisplayOverrideSummary } from '@/lib/display-defaults-backlinks';
import { settingsHref } from '@/lib/settings-route';
import { useTranslate, type TranslateFn } from '@/i18n';

/**
 * Banner rendered at the top of every `Defaults → X` page that lists which
 * displays currently override fields belonging to *this specific* defaults
 * page. The "click to open the overriding display" link closes the
 * bidirectional loop: from any per-display field you can jump to its
 * Defaults page (via OverrideRow's help text), and from a Defaults page
 * you can jump back to the displays that override it.
 *
 * Empty input renders nothing. The component is deliberately silent when
 * there are no overrides — a "no displays override this page" placeholder
 * would be visual noise on every Defaults page in a multi-display install
 * that hasn't customized anything yet.
 *
 * The banner builds the per-display URL itself rather than taking a
 * `hrefForDisplay` callback, because the routing convention is locked in
 * by the plan and a per-page override would invite drift.
 */
interface DefaultsBacklinkBannerProps {
  overrides: DisplayOverrideSummary[];
  /** Optional human label for the page being viewed, used in the copy
   *  ("X displays override fields on this page"). The page name is not
   *  baked in — Display, Sleep, and Alerts share this banner. */
  pageLabel?: string;
}

export default function DefaultsBacklinkBanner({
  overrides,
  pageLabel,
}: DefaultsBacklinkBannerProps) {
  const t = useTranslate('editor');
  if (overrides.length === 0) return null;

  // Resolve `pageLabel` at render time so the default value follows the
  // active locale. Callers can still pass an explicit override.
  const resolvedPageLabel = pageLabel ?? t('settings.backlinkBanner.thisPage');

  return (
    <div className="mb-5 rounded-lg border border-hs-accent/20 bg-hs-accent/[0.07] px-4 py-3 flex items-start gap-3">
      <Info className="w-4 h-4 text-hs-accent-hover shrink-0 mt-0.5" />
      <div className="text-xs text-hs-accent-hover leading-relaxed">
        {overrides.length === 1 ? (
          <SingleDisplayLine summary={overrides[0]} pageLabel={resolvedPageLabel} t={t} />
        ) : (
          <MultiDisplayLine summaries={overrides} pageLabel={resolvedPageLabel} t={t} />
        )}
      </div>
    </div>
  );
}

function SingleDisplayLine({
  summary,
  pageLabel,
  t,
}: {
  summary: DisplayOverrideSummary;
  pageLabel: string;
  t: TranslateFn;
}) {
  const { displayId, displayName, overriddenFields } = summary;
  const fieldCount = overriddenFields.length;
  const fieldText =
    fieldCount === 1
      ? t('settings.backlinkBanner.singleFieldCount', { count: fieldCount })
      : t('settings.backlinkBanner.multiFieldCount', { count: fieldCount });
  return (
    <>
      <strong className="text-hs-text-primary">{displayName}</strong>
      {t('settings.backlinkBanner.singleDisplayCurrentlyOverrides')}
      <strong className="text-hs-text-primary">{fieldText}</strong>
      {t('settings.backlinkBanner.singleDisplayPart3', { pageLabel })}
      <Link
        href={settingsHref({ kind: 'display', displayId, subtab: 'overview' })}
        className="text-hs-accent hover:text-hs-accent-hover underline decoration-dashed underline-offset-2"
      >
        {t('settings.backlinkBanner.openDisplayLink', { name: displayName })}
      </Link>
      {t('settings.backlinkBanner.singleDisplayPart5')}
    </>
  );
}

function MultiDisplayLine({
  summaries,
  pageLabel,
  t,
}: {
  summaries: DisplayOverrideSummary[];
  pageLabel: string;
  t: TranslateFn;
}) {
  return (
    <>
      <strong className="text-hs-text-primary">
        {t('settings.backlinkBanner.multiDisplayLabel', { count: summaries.length })}
      </strong>
      {t('settings.backlinkBanner.multiDisplayCurrentlyOverride', { pageLabel })}
      {summaries.map((summary, idx) => (
        <span key={summary.displayId}>
          <Link
            href={settingsHref({ kind: 'display', displayId: summary.displayId, subtab: 'overview' })}
            className="text-hs-accent hover:text-hs-accent-hover underline decoration-dashed underline-offset-2"
          >
            {summary.displayName}
          </Link>
          <span className="text-hs-accent-hover/70"> ({summary.overriddenFields.length})</span>
          {idx < summaries.length - 1 ? ', ' : '.'}
        </span>
      ))}
    </>
  );
}
