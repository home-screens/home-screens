'use client';

/**
 * Reading a week out of a spreadsheet.
 *
 * A link is checked before anything is saved, and the check has three answers,
 * all of which land on this one screen:
 *
 * - the sheet listed its tabs, so each tab is matched to a person;
 * - the sheet answered but listed no tabs, which is not a failure: the
 *   household pastes one link per person instead, on the same screen;
 * - the sheet could not be read, which is the only one that is an error.
 *
 * Applying an import is an ordinary save of the whole document. Nothing here
 * writes on its own, and an import never adds a person: it fills in weeks for
 * people who are already in Family.
 */

import Link from 'next/link';
import { useRef, useState } from 'react';
import { ChevronRight, Table } from 'lucide-react';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { formatDateSync, useFormattingLocale, useTranslate } from '@/i18n';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { settingsPath } from '@/lib/settings-route';
import { checkSheetLink, checkTimetableFiles } from '@/lib/timetable-client';
import { addDays, dateInZone, mondayOf } from '@/lib/timetable-layout';
import type { TimetableImportCheckResult, TimetableImportTab } from '@/lib/timetable-api';
import type { ImportedTimetable } from '@/lib/timetable-import';
// The fold rule only, from its own module: the reader it belongs to resolves DNS
// and must never reach the editor bundle.
import { foldSheetCode } from '@/lib/timetable-codes';
import { weekFromImportedRows } from '@/lib/timetable-week';
import type { FamilyMember } from '@/types/family';
import {
  DAY_KEYS,
  type DayKey,
  type TimetableData,
  type TimetableSubject,
  type TimetableWeek,
} from '@/types/timetables';
import MemberDot from './MemberDot';
import { makeSubject, nextSubjectColor, periodsOf, shortCodeFor } from './use-timetable-draft';

/**
 * An example week, kept as a file under `public/` so it can be opened in a
 * spreadsheet and filled in. It carries every shape the reader understands:
 * a period column, a time column, the five weekday columns, a break row, a
 * free cell and a cell that names its room.
 */
const SAMPLE_SHEET = '/samples/timetable-example.csv';

/** The select value for a tab nobody is taking. */
const SKIP = '';
/** The unknown-code choice that makes the sheet's code a subject of its own. */
const AS_NEW = '\u0000new';
/**
 * An unknown code nobody has answered for yet.
 *
 * A weak suggestion used to be filled in as the answer, so an untouched Apply
 * accepted every guess: two shared letters is enough for "Ge" to prefix both
 * Geografie and Geschichte, and the tiebreak between them is name length. Codes
 * the reader is not confident about start here instead, and Apply waits.
 */
const UNSET = '\u0000unset';

/**
 * A sentence with a link in the middle, as the piece before it and the piece
 * after it. The whole sentence is one translated string, so the link can sit
 * wherever a language puts it.
 */
function around(sentence: string): [string, string] {
  const [before, after] = sentence.split('\u0000');
  return [before, after ?? ''];
}

interface ImportViewProps {
  data: TimetableData;
  members: readonly FamilyMember[];
  onApply: (next: TimetableData) => void;
  onCancel: () => void;
}

/** One person's tab, once somebody has been put against it. */
interface MappedTab {
  memberId: string;
  preview: ImportedTimetable;
  /** The sheet it came from. Empty for a file, which has nothing to go back to. */
  url: string;
  /**
   * The tab within that sheet. One link holds a tab per child, so a source that
   * records only the link would send every one of their hourly re-reads to
   * whichever tab the sheet hands out first, and one child's week would land on
   * all of them.
   */
  tab: string;
}

/** The pasted link, short enough to read back. */
function sheetLabel(url: string): string {
  const bare = url.replace(/^https?:\/\//, '').split(/[?#]/)[0];
  return bare.length > 48 ? `${bare.slice(0, 47)}…` : bare;
}

/** How many numbered periods a tab holds. */
function periodCount(preview: ImportedTimetable): number {
  return preview.rows.filter((row) => row.kind === 'period').length;
}

/**
 * The week a tab holds, with every code turned into a subject id.
 *
 * A cell whose code was neither known nor given a subject is left out rather
 * than guessed at: an empty period is easy to spot and fill in, a wrong
 * subject is not.
 */
/**
 * The household's answer for one of the sheet's codes.
 *
 * Keyed by the folded code, because that is the identity the rest of the
 * pipeline uses. Keying by the raw spelling meant a sheet writing Bio, BIO and
 * bio in one week showed one question, answered one cell and left the other two
 * periods empty - and then the hourly check, which does fold, filled them in an
 * hour later and changed a week somebody had already checked.
 */
export function codeAnswer(choices: Record<string, string>, code: string): string | undefined {
  return choices[foldSheetCode(code)];
}

/**
 * The starting answers for a checked sheet: a confident suggestion is taken,
 * anything weaker is left for the household to settle.
 */
export function seedCodeChoices(answer: TimetableImportCheckResult): Record<string, string> {
  if (!answer.ok) return {};
  const out: Record<string, string> = {};
  for (const tab of answer.tabs) {
    for (const code of tab.preview?.unknownCodes ?? []) {
      const suggestion = code.suggestion;
      out[foldSheetCode(code.code)] = suggestion
        ? suggestion.confident ? suggestion.subjectId : UNSET
        : AS_NEW;
    }
  }
  return out;
}

export function weekFromPreview(preview: ImportedTimetable, subjectFor: (code: string) => string | undefined): TimetableWeek {
  return weekFromImportedRows(preview, (cell) => cell.subjectId ?? subjectFor(cell.code));
}

/**
 * The document an import would save: the mapped weeks written onto the people
 * they belong to, plus any subject the household chose to add for a code the
 * sheet uses. Everything else about a person's timetable is left as it was.
 */
export function buildImport(
  data: TimetableData,
  mapped: MappedTab[],
  codeChoices: Record<string, string>,
  sync: boolean,
  /**
   * The school the imported weeks belong to.
   *
   * Passed in rather than taken as `schools[0]`, which is what this used to do.
   * A household with a child at primary and a child at secondary got the first
   * school for both, so the second week was drawn against the wrong bell
   * schedule - and any lesson in a period that school has no bell for is not
   * drawn at all, on the wall or in the editor, while sitting in the saved file.
   * Somebody who has a timetable already keeps the school they are at.
   */
  schoolId: string,
): TimetableData {
  const subjects = [...data.subjects];
  const created = new Map<string, string>();
  const subjectFor = (code: string): string | undefined => {
    const choice = codeAnswer(codeChoices, code);
    if (choice === undefined || choice === SKIP || choice === UNSET) return undefined;
    if (choice !== AS_NEW) return choice;
    // One new subject per folded code, so Bio and BIO do not become two.
    const key = foldSheetCode(code);
    const already = created.get(key);
    if (already) return already;
    // The sheet's own word becomes the name; the code beside it is short enough
    // for a cell, and for the store, which refuses anything longer.
    const subject = makeSubject(shortCodeFor(code), nextSubjectColor(subjects), code);
    subjects.push(subject);
    created.set(key, subject.id);
    return subject.id;
  };

  const importedAt = new Date().toISOString();
  const timetables = [...data.timetables];
  for (const entry of mapped) {
    // The answers this person's tab actually needed, so an hourly re-read makes
    // the same sense of the same codes instead of emptying the periods the
    // household has just finished pointing at a subject.
    const answered = new Map<string, string>();
    const week = weekFromPreview(entry.preview, (code) => {
      const subjectId = subjectFor(code);
      // Saved folded, so an hourly re-read finds it however the sheet spells
      // the code that day.
      if (subjectId) answered.set(foldSheetCode(code), subjectId);
      return subjectId;
    });
    // A file carries no link, so there is nothing to record and nothing to keep
    // in sync with. The week is simply theirs from the moment it lands.
    const source = entry.url
      ? {
          kind: 'sheet' as const,
          url: entry.url,
          importedAt,
          sync,
          ...(entry.tab ? { tab: entry.tab } : {}),
          ...(answered.size > 0 ? { codes: Object.fromEntries(answered) } : {}),
        }
      : undefined;
    const at = timetables.findIndex((timetable) => timetable.memberId === entry.memberId);
    if (at === -1) {
      timetables.push({
        memberId: entry.memberId,
        schoolId,
        weeks: { A: week },
        ...(source ? { source } : {}),
      });
    } else {
      const previous = timetables[at];
      timetables[at] = {
        ...previous,
        weeks: { ...previous.weeks, A: week },
        // A file replacing a week that used to follow a sheet takes it off the
        // sheet, rather than leaving a link that no longer describes it.
        ...(source ? { source } : { source: undefined }),
      };
    }
  }
  return { ...data, subjects, timetables };
}

export default function ImportView({ data, members, onApply, onCancel }: ImportViewProps) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();

  const [link, setLink] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TimetableImportCheckResult | null>(null);
  const [checkedLink, setCheckedLink] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [codeChoices, setCodeChoices] = useState<Record<string, string>>({});
  const [sync, setSync] = useState(false);
  const [applying, setApplying] = useState(false);
  const [reading, setReading] = useState(false);
  /** One link per person, for a sheet that would not list its tabs. */
  const [ownLinks, setOwnLinks] = useState<Record<string, string>>({});
  const [ownTabs, setOwnTabs] = useState<Record<string, TimetableImportTab>>({});
  const [ownBusy, setOwnBusy] = useState<string | null>(null);
  /**
   * The school the imported weeks belong to, when the household has more than
   * one. Null means "not chosen yet", and falls back below to the school the
   * first mapped person is already at, or the only school there is.
   */
  const [pickedSchoolId, setPickedSchoolId] = useState<string | null>(null);
  /**
   * The dropdown for each of the sheet's unknown codes.
   *
   * A row that is blocking the import can be several hundred pixels up a
   * scrolling panel, so the line that says so takes the household to it.
   */
  const codeSelects = useRef<Record<string, HTMLSelectElement | null>>({});

  const monday = mondayOf(dateInZone(new Date()));
  const dayName = (day: DayKey) =>
    formatDateSync(new Date(`${addDays(monday, DAY_KEYS.indexOf(day))}T12:00:00`), 'EEEE', { locale });

  const failure = (messageKey: string) => t(`timetableModal.import.errors.${messageKey}`);

  const listNames = (names: string[]) =>
    new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);

  /**
   * Read files the household picked, and land on the same screen a link does.
   *
   * The browser reads the text; the server turns it into a preview, because
   * that needs the subject list and the family roster. A file carries no link,
   * so `checkedLink` is cleared: an import from one records no spreadsheet and
   * has nothing to sync against.
   */
  const readFiles = async (picked: FileList | null) => {
    const list = picked ? [...picked] : [];
    if (list.length === 0) return;
    setReading(true);
    setError(null);
    try {
      const files = await Promise.all(list.map(async (file) => ({ name: file.name, text: await file.text() })));
      const answer = await checkTimetableFiles(editorFetch, files, t('common.saveError'));
      if (!answer.ok) {
        setError(failure(answer.messageKey));
        return;
      }
      setResult(answer);
      setCheckedLink('');
      setMapping(Object.fromEntries(answer.tabs.map((tab) => [tab.gid, tab.memberId ?? SKIP])));
      setCodeChoices(seedCodeChoices(answer));
    } catch (cause) {
      if (isSessionExpired(cause)) return;
      setError(cause instanceof Error && cause.message ? cause.message : t('common.saveError'));
    } finally {
      setReading(false);
    }
  };

  const check = async (url: string, forMember?: string) => {
    const typed = url.trim();
    if (!typed) return;
    if (forMember) setOwnBusy(forMember);
    else setChecking(true);
    setError(null);
    try {
      const answer = await checkSheetLink(editorFetch, typed, t('common.saveError'));
      if (!answer.ok) {
        setError(failure(answer.messageKey));
        if (!forMember) setResult(null);
        return;
      }
      if (forMember) {
        const tab = answer.tabs[0];
        if (!tab || !tab.preview) {
          setError(failure(tab?.messageKey ?? 'tabNotFound'));
          return;
        }
        setOwnTabs((current) => ({ ...current, [forMember]: tab }));
        return;
      }
      setResult(answer);
      setCheckedLink(typed);
      setMapping(Object.fromEntries(answer.tabs.map((tab) => [tab.gid, tab.memberId ?? SKIP])));
      setCodeChoices(seedCodeChoices(answer));
    } catch (cause) {
      if (isSessionExpired(cause)) return;
      setError(cause instanceof Error && cause.message ? cause.message : t('common.saveError'));
    } finally {
      setChecking(false);
      setOwnBusy(null);
    }
  };

  /** The school a person is already at, which an import should not move them off. */
  const ownSchoolOf = (memberId: string) =>
    data.timetables.find((timetable) => timetable.memberId === memberId)?.schoolId;

  const listed = result !== null && result.ok && result.tabsListed ? result : null;
  const unlisted = result !== null && result.ok && !result.tabsListed ? result : null;
  const mapped: MappedTab[] = listed
    ? (listed.tabs
        .map((tab) =>
          tab.preview && mapping[tab.gid] && mapping[tab.gid] !== SKIP
            ? { memberId: mapping[tab.gid], preview: tab.preview, url: checkedLink, tab: tab.gid }
            : null,
        )
        .filter(Boolean) as MappedTab[])
    : Object.entries(ownTabs)
        .filter(([, tab]) => tab.preview)
        .map(([memberId, tab]) => ({
          memberId,
          preview: tab.preview as ImportedTimetable,
          url: ownLinks[memberId] ?? checkedLink,
          tab: tab.gid,
        }));

  const unknownCodes = (listed ? listed.tabs : Object.values(ownTabs))
    .filter((tab) => mapped.some((entry) => entry.preview === tab.preview))
    .flatMap((tab) => tab.preview?.unknownCodes ?? []);
  const uniqueCodes = [...new Map(unknownCodes.map((code) => [code.code, code])).values()];

  /**
   * Which school the weeks land at: what the household picked, else the school
   * the first of them is already at, else the only one there is.
   */
  const schoolId =
    pickedSchoolId ?? mapped.map((entry) => ownSchoolOf(entry.memberId)).find(Boolean) ?? data.schools[0]?.id ?? '';
  const school = data.schools.find((entry) => entry.id === schoolId);
  /** How many numbered periods the chosen school rings a bell for. */
  const schoolPeriods = school ? periodsOf(school).length : 0;
  /**
   * Tabs holding more periods than the school has bells for.
   *
   * Those lessons would be saved and then drawn nowhere - the card and the paint
   * grid both walk the school's own rows - so the screen says so before Apply
   * rather than leaving somebody to notice a missing afternoon on the wall.
   */
  const overrun = mapped.filter((entry) => periodCount(entry.preview) > schoolPeriods);

  /** Codes still waiting on an answer, which Apply will not go without. */
  const unanswered = uniqueCodes.filter((code) => codeAnswer(codeChoices, code.code) === UNSET);

  /** Take the household to the first row that is holding the import up. */
  const showFirstUnanswered = () => {
    const first = unanswered[0];
    const node = first ? codeSelects.current[foldSheetCode(first.code)] : null;
    node?.scrollIntoView({ block: 'center' });
    node?.focus();
  };

  const apply = () => {
    if (mapped.length === 0 || !schoolId || unanswered.length > 0) return;
    setApplying(true);
    onApply(buildImport(data, mapped, codeChoices, sync, schoolId));
  };

  const memberOptions = (own: string) =>
    members.filter((member) => own === member.id || !Object.values(mapping).includes(member.id));

  const familyHref = settingsPath({ kind: 'defaults', page: 'family' });

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="space-y-1">
          <label className="flex flex-col gap-0.5">
            <span className="text-sm text-hs-text-muted">{t('timetableModal.import.linkLabel')}</span>
            <span className="flex items-center gap-2">
              <input
                type="url"
                value={link}
                autoFocus
                onChange={(event) => setLink(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void check(link);
                  }
                }}
                className={MODAL_INPUT_CLASS}
              />
              <Button size="sm" variant="primary" disabled={!link.trim() || checking} onClick={() => void check(link)}>
                {checking ? t('timetableModal.import.checking') : t('timetableModal.import.check')}
              </Button>
            </span>
          </label>
          <p className="max-w-[100ch] text-[13px] leading-relaxed text-hs-text-muted">{t('timetableModal.import.linkHelp')}</p>
          <SampleSheetLine />

          {/* The sample this screen offers is a CSV, so not being able to hand a
              filled-in one back was a hole exactly the size of what we gave
              them. Read in the browser and posted as text: the file itself goes
              nowhere and nothing is written to disk. */}
          <div className="flex flex-wrap items-center gap-2 pt-1.5">
            <span className="text-sm text-hs-text-muted">{t('timetableModal.import.orFile')}</span>
            <label className="inline-flex">
              <span
                className="cursor-pointer rounded-md border border-hs-border-strong bg-hs-card px-2.5 py-1 text-sm text-hs-text-body transition-colors hover:bg-hs-hover"
                role="button"
                tabIndex={0}
              >
                {reading ? t('timetableModal.import.reading') : t('timetableModal.import.chooseFile')}
              </span>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                multiple
                className="sr-only"
                aria-label={t('timetableModal.import.chooseFile')}
                onChange={(event) => void readFiles(event.target.files)}
              />
            </label>
          </div>
          <p className="max-w-[100ch] text-[13px] leading-relaxed text-hs-text-muted">{t('timetableModal.import.fileHelp')}</p>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-hs-danger/30 bg-hs-danger/10 px-3 py-2 text-[13px] text-hs-danger">
            {error}
          </div>
        )}

        {listed && (
          <div className="space-y-3 rounded-lg border border-hs-success/30 bg-hs-success/10 p-3">
            <p className="text-sm font-medium text-hs-text-primary">
              {t('timetableModal.import.found', { count: listed.tabs.length, title: sheetLabel(checkedLink) })}
            </p>
            {listed.tabs.map((tab) => {
              const chosen = mapping[tab.gid] ?? SKIP;
              const unmatched = !tab.memberId && tab.name !== '';
              return (
                <div key={tab.gid} className="flex flex-wrap items-center gap-2">
                  <span className="flex w-[150px] items-center gap-1.5 text-xs text-hs-text-body">
                    <Table className="h-3.5 w-3.5 text-hs-success" aria-hidden="true" />
                    <span className="truncate">{tab.name}</span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-hs-text-faint" aria-hidden="true" />
                  <span className="w-[220px] shrink-0">
                    <select
                      value={chosen}
                      aria-label={t('timetableModal.import.mapTo')}
                      onChange={(event) => setMapping((current) => ({ ...current, [tab.gid]: event.target.value }))}
                      className={MODAL_INPUT_CLASS}
                    >
                      <option value={SKIP}>{t('timetableModal.import.skip')}</option>
                      {memberOptions(chosen).map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span className="flex-1 text-[13px] text-hs-text-faint">
                    {tab.messageKey ? (
                      <span className="text-hs-danger">{failure(tab.messageKey)}</span>
                    ) : unmatched && chosen === SKIP ? (
                      <NotInFamily name={tab.name} href={familyHref} />
                    ) : tab.preview && tab.preview.days.length > 0 ? (
                      t('timetableModal.import.tabSummary', {
                        count: periodCount(tab.preview),
                        firstDay: dayName(tab.preview.days[0]),
                        lastDay: dayName(tab.preview.days[tab.preview.days.length - 1]),
                      })
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Not a failure: a sheet that will not list its tabs is answered by one
            link per person, on this same screen. It used to arrive as a bare
            panel of empty boxes with nothing saying what had happened. */}
        {unlisted && (
          <div className="space-y-3 rounded-lg border border-hs-border bg-hs-card/60 p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-hs-text-primary">{t('timetableModal.import.unlistedTitle')}</p>
              <p className="max-w-[100ch] text-[13px] leading-relaxed text-hs-text-muted">
                {t('timetableModal.import.unlistedHelp')}
              </p>
            </div>
            {members.map((member) => {
              const tab = ownTabs[member.id];
              return (
                <div key={member.id} className="flex flex-wrap items-center gap-2">
                  <span className="flex w-[150px] items-center gap-1.5 text-xs text-hs-text-body">
                    <MemberDot member={member} size={20} />
                    <span title={member.name} className="truncate">
                      {member.name}
                    </span>
                  </span>
                  <span className="w-[260px] shrink-0">
                    <input
                      type="url"
                      value={ownLinks[member.id] ?? ''}
                      // Every box on this screen used to be called "Link to the
                      // sheet", so a screen reader heard three fields with one
                      // name and no way to tell whose was whose.
                      aria-label={t('timetableModal.import.linkFor', { name: member.name })}
                      onChange={(event) => setOwnLinks((current) => ({ ...current, [member.id]: event.target.value }))}
                      className={MODAL_INPUT_CLASS}
                    />
                  </span>
                  <Button
                    size="sm"
                    disabled={!ownLinks[member.id]?.trim() || ownBusy === member.id}
                    onClick={() => void check(ownLinks[member.id] ?? '', member.id)}
                  >
                    {ownBusy === member.id ? t('timetableModal.import.checking') : t('timetableModal.import.check')}
                  </Button>
                  <span className="flex-1 text-[13px] text-hs-text-faint">
                    {tab?.preview && tab.preview.days.length > 0
                      ? t('timetableModal.import.tabSummary', {
                          count: periodCount(tab.preview),
                          firstDay: dayName(tab.preview.days[0]),
                          lastDay: dayName(tab.preview.days[tab.preview.days.length - 1]),
                        })
                      : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {uniqueCodes.length > 0 && (
          <div className="space-y-2 rounded-lg border border-hs-border bg-hs-card/60 p-3">
            <p className="text-sm font-medium text-hs-text-primary">
              {t('timetableModal.import.unknownCode', {
                count: uniqueCodes.length,
                codes: uniqueCodes.map((code) => code.code).join(', '),
              })}
            </p>
            {uniqueCodes.map((code) => (
              <div key={code.code} className="space-y-0.5">
                <label className="flex flex-wrap items-center gap-2">
                  {/* The code itself names the control: what this row asks is
                      which subject the sheet meant by it. */}
                  <span className="w-[90px] text-sm text-hs-text-body">{code.code}</span>
                  <span className="w-[260px] shrink-0">
                    <select
                      ref={(node) => {
                        codeSelects.current[foldSheetCode(code.code)] = node;
                      }}
                      value={codeAnswer(codeChoices, code.code) ?? AS_NEW}
                      onChange={(event) =>
                        setCodeChoices((current) => ({
                          ...current,
                          [foldSheetCode(code.code)]: event.target.value,
                        }))
                      }
                      className={MODAL_INPUT_CLASS}
                    >
                      {codeAnswer(codeChoices, code.code) === UNSET && (
                        <option value={UNSET}>{t('timetableModal.import.pickSubject')}</option>
                      )}
                      {/* A dropdown option is a phrase, not the palette's
                          "+ Subject" button label. */}
                      <option value={AS_NEW}>{t('timetableModal.import.addAsNew')}</option>
                      {data.subjects.map((subject: TimetableSubject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
                {/* A weak suggestion is deliberately not taken, so the line
                    under it must not say the code has been matched: the
                    dropdown above it is asking. */}
                {code.suggestion && (
                  <p className="text-[13px] text-hs-text-faint">
                    {t(
                      code.suggestion.confident
                        ? 'timetableModal.import.unknownHelp'
                        : 'timetableModal.import.unknownHelpMaybe',
                      { subject: code.suggestion.name },
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Which school these weeks belong to. Only worth asking when there is
            more than one: with a single school there is nothing to choose, and
            the row would be a control that can only say one thing. */}
        {mapped.length > 0 && data.schools.length > 1 && (
          <div className="space-y-1 rounded-lg border border-hs-border bg-hs-card/60 p-3">
            <label className="flex flex-wrap items-center gap-2">
              <span className="w-[150px] shrink-0 text-sm text-hs-text-body">
                {t('timetableModal.import.school')}
              </span>
              <span className="w-[260px] shrink-0">
                <select
                  value={schoolId}
                  onChange={(event) => setPickedSchoolId(event.target.value)}
                  className={MODAL_INPUT_CLASS}
                >
                  {data.schools.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <p className="text-[13px] text-hs-text-faint">{t('timetableModal.import.schoolHelp')}</p>
          </div>
        )}

        {/* A week with more periods than the school rings a bell for. Those
            lessons save and then show up nowhere, so it is said here. */}
        {overrun.length > 0 && school && (
          <div
            role="status"
            className="space-y-1 rounded-lg border border-hs-warning/30 bg-hs-warning/10 p-3 text-[13px] text-hs-text-body"
          >
            <p>
              {t('timetableModal.import.tooManyPeriods', {
                names: listNames(
                  overrun.map(
                    (entry) => members.find((member) => member.id === entry.memberId)?.name ?? '',
                  ).filter(Boolean),
                ),
                school: school.name,
                count: schoolPeriods,
              })}
            </p>
            <p className="text-hs-text-faint">{t('timetableModal.import.tooManyPeriodsHelp')}</p>
          </div>
        )}

        {/* Import needs a school to hang the weeks off, and the picker above is
            only drawn when there is a choice to make, so with one school or
            none the screen held no clue at all about a dead button. */}
        {mapped.length > 0 && !schoolId && (
          <div
            role="status"
            className="rounded-lg border border-hs-warning/30 bg-hs-warning/10 p-3 text-[13px] text-hs-text-body"
          >
            {t('timetableModal.import.needSchool')}
          </div>
        )}

        {/* And a code nobody has answered for, which can be a long way up a
            scrolling panel, so the codes take you to the row that is waiting. */}
        {mapped.length > 0 && unanswered.length > 0 && (
          <div
            role="status"
            className="rounded-lg border border-hs-warning/30 bg-hs-warning/10 p-3 text-[13px] text-hs-text-body"
          >
            <NeedCodes codes={unanswered.map((entry) => entry.code)} onShow={showFirstUnanswered} />
          </div>
        )}

        {/* The resting screen used to be a link box and then a great deal of
            nothing. Laying the sheet out is the slowest part of a first import,
            and a drawn example says the shape faster than the paragraph above
            it does. Gone the moment there is a real answer to show instead. */}
        {result === null && !error && <SheetShape />}

        {mapped.some((entry) => entry.url) && (
          <div className="space-y-1 rounded-lg border border-hs-border bg-hs-card/60 p-3">
            <Toggle label={t('timetableModal.import.sync')} checked={sync} onChange={setSync} />
            <p className="text-[13px] text-hs-text-faint">{t('timetableModal.import.syncHelp')}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-hs-border-strong px-5 py-3">
        <p className="flex-1 text-[13px] text-hs-text-faint">{t('timetableModal.import.footerNote')}</p>
        <Button size="sm" onClick={onCancel}>
          {t('timetableModal.import.cancel')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={mapped.length === 0 || !schoolId || unanswered.length > 0 || applying}
          onClick={apply}
        >
          {applying
            ? t('timetableModal.import.working')
            : t('timetableModal.import.apply', { count: mapped.length })}
        </Button>
      </div>
    </>
  );
}

/**
 * A drawn example of the sheet this screen can read.
 *
 * Every rule beside it is one the reader actually applies, so it is a
 * description rather than a suggestion: the days are found by their names in
 * any of the languages we ship, a row whose left-hand cell says Break or Lunch
 * becomes a break, a cell is "subject" or "subject / room", and an empty one is
 * a free period.
 */
function SheetShape() {
  const t = useTranslate('editor');
  const cell = 'border border-hs-border px-2.5 py-1 whitespace-nowrap';
  const head = `${cell} bg-hs-card text-hs-text-muted font-semibold`;
  const days = ['Monday', 'Tuesday', 'Wednesday'];
  const rows: [string, string, string[]][] = [
    ['1', '08:15-09:00', ['Math / A107', 'English', 'Bio']],
    ['2', '09:05-09:50', ['Math', 'English', 'Bio']],
    [t('timetableModal.import.shapeBreak'), '09:50-10:05', ['', '', '']],
    ['3', '10:05-10:50', ['Art', 'Hist', 'Math']],
  ];

  return (
    <section className="rounded-lg border border-hs-border bg-hs-card/40 p-4">
      <h3 className="text-[15px] font-semibold text-hs-text-primary">{t('timetableModal.import.shapeTitle')}</h3>
      <p className="mt-1 max-w-[80ch] text-[13px] leading-relaxed text-hs-text-muted">{t('timetableModal.import.shapeIntro')}</p>

      <div className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-4">
        <div className="overflow-x-auto">
          <table className="border-collapse text-[13px] tabular-nums text-hs-text-body">
            <thead>
              <tr>
                <th className={head}>{t('timetableModal.import.shapePeriod')}</th>
                <th className={head}>{t('timetableModal.import.shapeTime')}</th>
                {days.map((day) => (
                  <th key={day} className={head}>{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([period, time, lessons]) => (
                <tr key={period}>
                  <td className={`${cell} text-hs-text-muted`}>{period}</td>
                  <td className={`${cell} text-hs-text-muted`}>{time}</td>
                  {lessons.map((lesson, index) => (
                    <td key={`${period}-${days[index]}`} className={cell}>{lesson}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="max-w-[46ch] space-y-2 text-[13px] leading-relaxed text-hs-text-muted">
          {['ruleTabs', 'ruleRoom', 'ruleBreak', 'ruleEmpty', 'ruleCodes'].map((rule) => (
            <li key={rule} className="flex gap-2">
              <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-hs-text-faint" />
              <span>{t(`timetableModal.import.${rule}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * The line under the link box that says what a sheet has to look like, with
 * the example itself one click away. Guessing the layout is the slowest part
 * of a first import, and an example says it faster than a paragraph would.
 */
function SampleSheetLine() {
  const t = useTranslate('editor');
  const [before, after] = around(t('timetableModal.import.sampleHelp', { link: '\u0000' }));
  return (
    <p className="max-w-[100ch] text-[13px] leading-relaxed text-hs-text-muted">
      {before}
      <a href={SAMPLE_SHEET} download className="text-hs-accent hover:underline">
        {t('timetableModal.import.sample')}
      </a>
      {after}
    </p>
  );
}

/**
 * What the import is still waiting for.
 *
 * The codes in the middle of the sentence are the control: pressing them puts
 * the first row that needs an answer on screen and in focus.
 */
function NeedCodes({ codes, onShow }: { codes: string[]; onShow: () => void }) {
  const t = useTranslate('editor');
  const [before, after] = around(
    t('timetableModal.import.needCodes', { count: codes.length, codes: '\u0000' }),
  );
  return (
    <p>
      {before}
      <button type="button" onClick={onShow} className="text-hs-accent hover:underline">
        {codes.join(', ')}
      </button>
      {after}
    </p>
  );
}

/**
 * The note on a tab whose name matches nobody in Family.
 *
 * Not a failure, and not drawn as one: a sheet whose tabs are called Sheet1 is
 * perfectly ordinary, and the answer is the dropdown sitting next to this line.
 * So it says that first, and offers the Family page second, for the case where
 * the tab really is named after somebody who is not on the roster yet.
 */
function NotInFamily({ name, href }: { name: string; href: string }) {
  const t = useTranslate('editor');
  const [before, after] = around(t('timetableModal.import.notInFamily', { name, link: '\u0000' }));
  return (
    <span>
      {before}
      <Link href={href} className="text-hs-accent hover:underline">
        {t('timetableModal.import.addPerson', { name })}
      </Link>
      {after}
    </span>
  );
}
