'use client';

import type { DisplayOverrideSummary } from '@/lib/display-defaults-backlinks';
import DefaultsBacklinkBanner from '@/components/editor/settings/DefaultsBacklinkBanner';

interface DefaultsPageShellProps {
  breadcrumb: string;
  heading: string;
  /** Rendered directly below the heading — a plain `<p>` for most pages, or
   *  richer markup (multi-part copy, notes) where a page needs it. */
  description: React.ReactNode;
  /** Displays currently overriding this page's fields, for the backlink banner. */
  overrides: DisplayOverrideSummary[];
  children: React.ReactNode;
}

/**
 * Shared scaffold for the `Defaults → X` pages: the breadcrumb + heading
 * header block and the backlink banner listing which displays override this
 * page's fields. The body (`children`) and description content stay per-page
 * because they differ in structure between the pages.
 */
export default function DefaultsPageShell({
  breadcrumb,
  heading,
  description,
  overrides,
  children,
}: DefaultsPageShellProps) {
  return (
    <>
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-1">
          {breadcrumb}
        </div>
        <h1 className="text-xl font-semibold text-hs-text-primary">
          {heading}
        </h1>
        {description}
      </div>
      <DefaultsBacklinkBanner overrides={overrides} />
      {children}
    </>
  );
}
