/**
 * The browser tab and bookmark name of each page, in the household's
 * language.
 *
 * Server-only: each route group's `generateMetadata` reads the saved locale
 * and the `core` dictionary here (through `householdWords`), so a phone's
 * home-screen icon for the kids' page says "Kids' chores" in German as well
 * as English, rather than one English name the dictionaries never saw. The remote, kids' page and editor
 * carry the same names the launcher shows on their cards.
 */

import type { Metadata } from 'next';
import { householdWords } from '@/lib/household-words';

/** The product's own name: the wall's tab and the pages that have no name of their own. */
export const PRODUCT_NAME = 'Home Screens';

const PAGE_TITLE_KEYS = {
  remote: 'launcher.remote.title',
  chores: 'launcher.chores.title',
  editor: 'launcher.editor.title',
  signIn: 'login.title',
} as const;

export type NamedPage = keyof typeof PAGE_TITLE_KEYS;

/** The name of `page` in the saved locale, English when that locale has none yet. */
export async function pageTitle(page: NamedPage): Promise<string> {
  const { t } = await householdWords('core');
  const key = PAGE_TITLE_KEYS[page];
  const title = t(key);
  return title === key ? PRODUCT_NAME : title;
}

/** `generateMetadata` for a route group or page named `page`. */
export async function pageMetadata(page: NamedPage): Promise<Metadata> {
  return { title: await pageTitle(page) };
}
