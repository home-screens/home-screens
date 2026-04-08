'use client';

import Link from 'next/link';
import { Info } from 'lucide-react';
import type { DisplayOverrideSummary } from '@/lib/display-defaults-backlinks';

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
  pageLabel = 'this page',
}: DefaultsBacklinkBannerProps) {
  if (overrides.length === 0) return null;

  return (
    <div className="mb-5 rounded-lg border border-blue-500/20 bg-blue-500/[0.07] px-4 py-3 flex items-start gap-3">
      <Info className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
      <div className="text-xs text-blue-200 leading-relaxed">
        {overrides.length === 1 ? (
          <SingleDisplayLine summary={overrides[0]} pageLabel={pageLabel} />
        ) : (
          <MultiDisplayLine summaries={overrides} pageLabel={pageLabel} />
        )}
      </div>
    </div>
  );
}

function SingleDisplayLine({
  summary,
  pageLabel,
}: {
  summary: DisplayOverrideSummary;
  pageLabel: string;
}) {
  const { displayId, displayName, overriddenFields } = summary;
  const fieldCount = overriddenFields.length;
  return (
    <>
      <strong className="text-neutral-100">{displayName}</strong> currently overrides{' '}
      <strong className="text-neutral-100">
        {fieldCount} {fieldCount === 1 ? 'field' : 'fields'}
      </strong>{' '}
      on {pageLabel}.{' '}
      <Link
        href={`?section=display&id=${encodeURIComponent(displayId)}`}
        className="text-blue-300 hover:text-blue-200 underline decoration-dashed underline-offset-2"
      >
        Open {displayName}
      </Link>{' '}
      to see or clear its overrides.
    </>
  );
}

function MultiDisplayLine({
  summaries,
  pageLabel,
}: {
  summaries: DisplayOverrideSummary[];
  pageLabel: string;
}) {
  return (
    <>
      <strong className="text-neutral-100">{summaries.length} displays</strong> currently override
      fields on {pageLabel}:{' '}
      {summaries.map((summary, idx) => (
        <span key={summary.displayId}>
          <Link
            href={`?section=display&id=${encodeURIComponent(summary.displayId)}`}
            className="text-blue-300 hover:text-blue-200 underline decoration-dashed underline-offset-2"
          >
            {summary.displayName}
          </Link>
          <span className="text-blue-300/70"> ({summary.overriddenFields.length})</span>
          {idx < summaries.length - 1 ? ', ' : '.'}
        </span>
      ))}
    </>
  );
}
