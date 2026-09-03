'use client';

import { useTranslate } from '@/i18n';
import type { DefaultPageId } from '@/lib/settings-route';

/**
 * Docs target for each Defaults page's "Learn more" link. A page with no
 * entry renders no link rather than pointing at the docs front page, which
 * would be a link that answers nothing.
 *
 * Anchors are only used where the heading slug is stable and unambiguous
 * (`@sindresorhus/slugify` over the `##` text in `website/content/docs`);
 * the rest link to the page.
 */
const DOCS_BASE = 'https://homescreens.dev/docs';

const PAGE_DOCS: Partial<Record<DefaultPageId, string>> = {
  screen: `${DOCS_BASE}/editor#global-settings`,
  location: `${DOCS_BASE}/editor#global-settings`,
  weather: `${DOCS_BASE}/modules#before-some-modules-will-work`,
  calendar: `${DOCS_BASE}/getting-started#calendar-setup`,
  meals: `${DOCS_BASE}/modules`,
  phone: `${DOCS_BASE}/remote-control`,
  integrations: `${DOCS_BASE}/modules#before-some-modules-will-work`,
  automation: `${DOCS_BASE}/profiles`,
  security: `${DOCS_BASE}/networking`,
  network: `${DOCS_BASE}/networking`,
  system: `${DOCS_BASE}/getting-started#update-channel`,
  data: `${DOCS_BASE}/configuration`,
  stats: `${DOCS_BASE}/troubleshooting`,
};

export interface DefaultsPageHeader {
  breadcrumb: string;
  heading: string;
  docsHref?: string;
}

/**
 * Breadcrumb, H1 and docs link for one Defaults page.
 *
 * Both strings are composed from the sidebar's own labels rather than a
 * per-page copy of them. That is the fix for the settings pages having had
 * up to three names each: the row you clicked, the breadcrumb and the H1 are
 * now the same string by construction, and a rename lands in all three at
 * once. `PAGE_META` in `SettingsSidebar` keys its labels by page id, so the
 * lookup here needs no second mapping table.
 *
 * `headingOverride` exists for the one page whose H1 is deliberately longer
 * than its nav row: "Screen defaults", which has to distinguish itself from
 * the per-display screen settings it seeds.
 */
export function useDefaultsPageHeader(
  page: DefaultPageId,
  headingOverride?: string,
): DefaultsPageHeader {
  const t = useTranslate('editor');
  const label = t(`settings.sidebar.navLabels.${page}`);
  return {
    breadcrumb: `${t('settings.sidebar.defaults')} → ${label}`,
    heading: headingOverride ?? label,
    docsHref: PAGE_DOCS[page],
  };
}
