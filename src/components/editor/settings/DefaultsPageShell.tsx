'use client';

import { ExternalLink } from 'lucide-react';
import { useTranslate } from '@/i18n';
import type { DisplayOverrideSummary } from '@/lib/display-defaults-backlinks';
import DefaultsBacklinkBanner from '@/components/editor/settings/DefaultsBacklinkBanner';

interface DefaultsPageShellProps {
  breadcrumb: string;
  heading: string;
  /**
   * A plain string renders in the standard description paragraph; a node
   * renders as-is, for the pages whose intro needs several parts or a note.
   */
  description?: React.ReactNode;
  /**
   * Appends "Changes save automatically." to the description. Set on every
   * page whose fields commit on their own, so the promise is stated once per
   * page instead of only being implied by a pill in the window chrome.
   */
  savesAutomatically?: boolean;
  /** Docs URL for the header's "Learn more" link. */
  docsHref?: string;
  /** Displays currently overriding this page's fields, for the backlink banner. */
  overrides?: DisplayOverrideSummary[];
  children: React.ReactNode;
}

/**
 * Shared scaffold for every `Defaults → X` page: the breadcrumb + heading
 * header block, the optional docs link, and the backlink banner listing which
 * displays override this page's fields.
 *
 * Every Defaults page routes through this, including the ones that used to
 * open on a section label or straight into a card. A page that never names
 * itself leaves a deep link or a sidebar field-search result stranded: the
 * view scrolls to a field with no indication of which page it belongs to.
 *
 * `description` accepts a string for the common case so twelve callers don't
 * each repeat the paragraph's classes, and a node for the few pages (Screen,
 * On your phone) whose intro is multi-part.
 */
export default function DefaultsPageShell({
  breadcrumb,
  heading,
  description,
  savesAutomatically,
  docsHref,
  overrides,
  children,
}: DefaultsPageShellProps) {
  const t = useTranslate('editor');

  const autosaveNote = savesAutomatically ? (
    <span className="text-hs-text-faint/70"> {t('settings.shared.savesAutomatically')}</span>
  ) : null;

  return (
    <>
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-1">
          {breadcrumb}
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-xl font-semibold text-hs-text-primary">{heading}</h1>
          {docsHref && (
            <a
              href={docsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-xs text-hs-accent hover:underline"
            >
              {t('settings.shared.learnMore')}
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          )}
        </div>
        {typeof description === 'string' ? (
          <p className="text-sm text-hs-text-faint mt-1">
            {description}
            {autosaveNote}
          </p>
        ) : (
          <>
            {description}
            {autosaveNote && <p className="text-sm mt-1">{autosaveNote}</p>}
          </>
        )}
      </div>
      <DefaultsBacklinkBanner overrides={overrides ?? []} />
      {children}
    </>
  );
}
