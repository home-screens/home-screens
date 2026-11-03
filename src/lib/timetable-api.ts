/**
 * What the timetable routes hand back, in one place.
 *
 * The store and the spreadsheet reader are both deliberately route-free: one
 * throws a `TimetableError` the route wrapper answers with, the other answers
 * with message keys and never throws at all. This file is the thin layer
 * between them and a JSON reply, so both routes stay a handful of lines and
 * the editor has one module to import the reply shapes from.
 */

import { NextResponse } from 'next/server';
import type { FamilyMember } from '@/types/family';
import type { TimetableSubject } from '@/types/timetables';
import { readFamilyData } from './family-data';
import { readTimetables, replaceTimetables, type ReplaceTimetablesInput } from './timetable-data';
import {
  fetchSheetCsv,
  fetchSheetTabs,
  parseSheetLink,
  readTimetableCsv,
  type ImportedTimetable,
  type SheetLink,
  type SheetTab,
  type TimetableImportMessageKey,
} from './timetable-import';
import { syncDueSheetsInBackground } from './timetable-sync';

/**
 * The whole document and the revision a save has to quote back.
 *
 * This is also where the hourly sheet check gets its chance. Every wall polls
 * this route about once a minute, which is the only clock a single-process app
 * on a Pi has; the check is started and not waited for, so the answer served
 * here is always what is on disk, and a new week arrives on the next poll.
 *
 * A refusal the store raised (a file it cannot read) reaches the route
 * wrapper, which answers with its code.
 */
export async function timetableRead(): Promise<NextResponse> {
  const snapshot = await readTimetables();
  syncDueSheetsInBackground(snapshot.data);
  return NextResponse.json(snapshot);
}

/**
 * Save the whole document and answer with what is now on disk, so the editor
 * reconciles in one step. A save that started from an older copy is refused
 * with `timetables.revision` and the saved document alongside, which is what
 * lets the editor say somebody else changed this and offer to reload it; the
 * store raises that refusal with the copy it compared against, and the route
 * wrapper answers with it.
 */
export async function timetableWrite(input: ReplaceTimetablesInput): Promise<NextResponse> {
  return NextResponse.json(await replaceTimetables(input));
}

// ---------------------------------------------------------------------------
// Reading a spreadsheet
// ---------------------------------------------------------------------------

/**
 * How many tabs are previewed. Every tab costs one download, and a sheet with
 * more tabs than this in it holds something other than one household's week.
 */
const MAX_TABS = 16;

/** One tab of the sheet, with what the importer made of it. */
export interface TimetableImportTab {
  /** The key everything else uses. A tab is never addressed by name. */
  gid: string;
  /** The tab's own name, for the household to recognise. */
  name: string;
  /** The person whose name this tab's name matches, when one does. */
  memberId?: string;
  /** The week read out of the tab, absent when the tab could not be read. */
  preview?: ImportedTimetable;
  /** Why the tab could not be read. */
  messageKey?: TimetableImportMessageKey;
}

export type TimetableImportCheckResult =
  /** The sheet listed its tabs, and each of them was read. */
  | { ok: true; tabsListed: true; tabs: TimetableImportTab[] }
  /**
   * The sheet answered and its page was read, but the page carried no tab
   * list. This is not a failure and carries no message key: the household
   * pastes one link per tab instead, on the same screen. `tabs` holds the tab
   * the pasted link named, when it named one, and is empty otherwise.
   */
  | { ok: true; tabsListed: false; tabs: TimetableImportTab[] }
  | { ok: false; messageKey: TimetableImportMessageKey };

/** Lowercase and drop accents, so "Jörg" and "Jorg" compare equal. */
function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * The same, but spelling umlauts out the way German keyboards do without them,
 * so "Jörg" also compares equal to "Joerg" and "Müller" to "Mueller".
 *
 * Dropping the accent alone gives "jorg", which matches neither. A sheet's tabs
 * are named by whoever made the sheet, and a school that types Mueller rather
 * than Müller is the ordinary case, not the exotic one.
 */
function foldTransliterated(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Both spellings of each word in `text`.
 *
 * One fold cannot produce "jorg" and "joerg" at once, so a name is carried as
 * the set of its readings and a match on either counts.
 */
function wordVariants(text: string): string[][] {
  const plain = fold(text).split(/[^a-z0-9]+/).filter(Boolean);
  const spelt = foldTransliterated(text).split(/[^a-z0-9]+/).filter(Boolean);
  // The two splits can disagree in length only if a fold introduced a separator,
  // which neither does, so they line up word for word.
  return plain.map((word, index) => (spelt[index] && spelt[index] !== word ? [word, spelt[index]] : [word]));
}

function words(text: string): string[] {
  return wordVariants(text).flat();
}

/**
 * The person a tab is for, by name. Sheets label a tab "Leon", "Leon 7c" or
 * "7c Leon", so somebody matches when their whole name, or at least their
 * first name, turns up among the tab's words. Two people matching equally
 * well is not a guess worth making, so nobody is suggested and the editor
 * asks.
 */
function suggestMember(tabName: string, members: readonly FamilyMember[]): string | undefined {
  const tabWords = new Set(words(tabName));
  if (tabWords.size === 0) return undefined;

  let best: { id: string; score: number } | null = null;
  let tied = false;
  for (const member of members) {
    const parts = wordVariants(member.name);
    if (parts.length === 0) continue;
    // A word of the name counts when the tab wrote it either way round.
    const hit = (variants: string[]) => variants.find((variant) => tabWords.has(variant));
    const everyPart = parts.map(hit);
    const matched = everyPart.every((found): found is string => found !== undefined)
      ? everyPart
      : hit(parts[0]) !== undefined
        ? [hit(parts[0]) as string]
        : null;
    if (!matched) continue;
    const score = matched.join('').length;
    if (!best || score > best.score) {
      best = { id: member.id, score };
      tied = false;
    } else if (score === best.score) {
      tied = true;
    }
  }
  return best && !tied ? best.id : undefined;
}

/**
 * Read one tab and match its codes against the household's subjects. A tab
 * that will not download is reported on its own rather than failing the whole
 * check: one child's tab being deleted should not hide their siblings'.
 */
async function previewTab(
  link: SheetLink,
  tab: SheetTab,
  subjects: TimetableSubject[],
  members: readonly FamilyMember[],
): Promise<TimetableImportTab> {
  const csv = await fetchSheetCsv(link, tab.gid);
  // The download names the tab when the tab list did not.
  const name = tab.name || (csv.ok ? csv.tabName ?? '' : '');
  const memberId = suggestMember(name, members);
  const found = memberId ? { memberId } : {};
  if (!csv.ok) return { gid: tab.gid, name, ...found, messageKey: csv.messageKey };
  return { gid: tab.gid, name, ...found, preview: readTimetableCsv(csv.text, subjects) };
}

/**
 * The same reading, for a file the household picked off their own machine.
 *
 * The sample sheet this window offers is a CSV, so not being able to hand a
 * filled-in one back was a hole with a shape exactly the size of what we gave
 * them. The text is read in the browser and posted here rather than uploaded,
 * because the reader needs the household's subject list and its family roster
 * and both of those live on this side.
 *
 * A file has no link, so nothing comes back to sync against: `gid` names the
 * file rather than a tab, and an import from one records no spreadsheet on the
 * timetable. There is nothing to go back to.
 */
export async function readTimetableFiles(
  files: readonly { name: string; text: string }[],
): Promise<TimetableImportCheckResult> {
  const [{ data }, family] = await Promise.all([readTimetables(), readFamilyData()]);
  const tabs = files.slice(0, MAX_TABS).map((file): TimetableImportTab => {
    // "Taylor.csv" is a file for Taylor, the same way a tab called Taylor is.
    const name = file.name.replace(/\.[^.]+$/, '').trim();
    const memberId = suggestMember(name, family.members);
    return {
      gid: file.name,
      name,
      ...(memberId ? { memberId } : {}),
      preview: readTimetableCsv(file.text, data.subjects),
    };
  });
  return { ok: true, tabsListed: true, tabs };
}

/**
 * Everything the import screen needs from a pasted link: which tabs the sheet
 * has, what each one holds, which codes are new, and who each tab looks like
 * it belongs to. Nothing is saved here; applying an import is an ordinary
 * save from the editor.
 */
export async function checkTimetableSheet(text: string): Promise<TimetableImportCheckResult> {
  const link = parseSheetLink(text);
  if (!link) return { ok: false, messageKey: 'linkNotUnderstood' };

  const listed = await fetchSheetTabs(link);
  if (!listed.ok && listed.reason === 'failed') return { ok: false, messageKey: listed.messageKey };

  // A link that named a tab is still readable without a tab list, which is
  // what the one-link-per-tab fallback pastes.
  const tabs: SheetTab[] = listed.ok
    ? listed.tabs.slice(0, MAX_TABS)
    : link.gid !== undefined
      ? [{ gid: link.gid, name: '' }]
      : [];
  if (tabs.length === 0) return { ok: true, tabsListed: false, tabs: [] };

  const [{ data }, family] = await Promise.all([readTimetables(), readFamilyData()]);
  const previews = await Promise.all(
    tabs.map((tab) => previewTab(link, tab, data.subjects, family.members)),
  );
  return listed.ok
    ? { ok: true, tabsListed: true, tabs: previews }
    : { ok: true, tabsListed: false, tabs: previews };
}
