'use client';

/**
 * The timetables window.
 *
 * Three tabs over one document: the weeks themselves, the schools whose bells
 * they hang off, and the subject list they all paint from. The draft, the
 * person being edited and the brush live here rather than in a tab, because a
 * tab is unmounted the moment another one is picked.
 *
 * Changes save as they are made, so the only button is Done. What that means
 * for a failed save is that it has to be said out loud: a refusal shows as a
 * banner rather than as an edit that quietly never landed.
 */

import { useRef, useState } from 'react';
import { ChevronLeft, School, Table } from 'lucide-react';
import Button from '@/components/ui/Button';
import CRUDModalShell from '@/components/editor/CRUDModalShell';
import { useFamilyData } from '@/hooks/useFamilyData';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { editorFetch } from '@/lib/editor-fetch';
import { checkSheetNow } from '@/lib/timetable-client';
import { useFormattingLocale, useTranslate } from '@/i18n';
import type { TimetableData, TimetableSchool, TimetableWeek, WeekLetter } from '@/types/timetables';
import DatesTab, { upcomingNoteCount } from './DatesTab';
import ImportView from './ImportView';
import { PROSE_CLASS } from './prose';
import SchoolsTab from './SchoolsTab';
import SubjectsTab from './SubjectsTab';
import TimetablesTab from './TimetablesTab';
import {
  EMPTY_TIMETABLE_DATA,
  addTimetable,
  findSchool,
  findTimetable,
  makeSubject,
  nextSubjectColor,
  schoolMembers,
  stashedWeeksB,
  type SheetCheckOutcome,
  useTimetableDraft,
  stopFollowingEditedWeek,
  withAddedSubject,
  withRestoredWeeksB,
  withSheetSync,
  withTimetable,
  withWeekCycle,
  withWeeksAB,
  type TimetableBrush,
} from './use-timetable-draft';

const TABS = ['timetables', 'schools', 'subjects', 'dates'] as const;
type TabKey = (typeof TABS)[number];

/**
 * Somebody whose week is waiting on a school being added.
 *
 * The window used to throw the household onto another tab with no word about
 * why, never name the child once it got there, and leave them to work out on
 * their own that they had to come back and press the same button again. So the
 * detour is remembered: it says whose week it is for, and finishes the job when
 * the school arrives.
 *
 * `start` is a week that does not exist yet; `move` is a week that does, whose
 * School box is where the household asked for a new school.
 */
interface PendingSchool {
  memberId: string;
  mode: 'start' | 'move';
}

const BANNER_CLASS = `mx-4 mt-3 rounded-lg border px-3 py-2 ${PROSE_CLASS}`;

interface TimetableModalProps {
  /** Open on this person, so the panel's "+ Add" lands where it was clicked. */
  memberId?: string;
  onClose: () => void;
}

export default function TimetableModal({ memberId, onClose }: TimetableModalProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const { members } = useFamilyData();
  const timezone = useEditorHouseholdTimezone();

  const draft = useTimetableDraft({
    loadFailed: t('timetableModal.loadError'),
    saveFailed: t('common.saveError'),
  });
  const data = draft.data ?? EMPTY_TIMETABLE_DATA;

  const [tab, setTab] = useState<TabKey>('timetables');
  const [importing, setImporting] = useState(false);
  const [checkingSheet, setCheckingSheet] = useState(false);
  const checkingSheetRef = useRef(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(memberId ?? null);
  const [pickedSchoolId, setPickedSchoolId] = useState<string | null>(null);
  const [addingSchool, setAddingSchool] = useState(false);
  /** Whose week sent us to the Schools tab, and what to do when one arrives. */
  const [pending, setPending] = useState<PendingSchool | null>(null);
  const [brush, setBrush] = useState<TimetableBrush | null>(null);
  /** Whose week just stopped following its spreadsheet, until they have been told. */
  const [stoppedFollowing, setStoppedFollowing] = useState<string | null>(null);
  /**
   * A close was asked for and the save behind it was refused. The banner then
   * offers the exit outright, so a refusal that will not clear cannot hold the
   * window open against somebody.
   */
  const [closeRefused, setCloseRefused] = useState(false);
  const [showing, setShowing] = useState<WeekLetter>('A');
  /**
   * Second weeks that were turned off while this window has been open, so
   * turning the switch straight back on puts the week back rather than
   * handing back a copy of week A.
   */
  const weekStash = useRef<Record<string, TimetableWeek>>({});
  /**
   * The same, for a whole school: turning its A/B rule off takes the second
   * week away from everybody who goes there, so the weeks are held by school
   * and by person until the rule comes back on.
   */
  const cycleStash = useRef<Record<string, Record<string, TimetableWeek>>>({});
  /** The school whose rule was just turned off, and whose weeks are waiting. */
  const [cycleTurnedOff, setCycleTurnedOff] = useState<{
    schoolId: string;
    memberIds: string[];
    previous: TimetableSchool['weekCycle'];
  } | null>(null);

  const selected = selectedMemberId ?? members.find((member) => findTimetable(data, member.id))?.id ?? null;
  const schoolId = pickedSchoolId ?? findTimetable(data, selected)?.schoolId ?? data.schools[0]?.id ?? null;
  const paintBrush: TimetableBrush =
    brush ?? (data.subjects[0] ? { kind: 'subject', subjectId: data.subjects[0].id } : { kind: 'clear' });

  /**
   * Going to a tab by hand, which drops any school detour: the promise to come
   * back is only good while the household is still on the errand it was sent on.
   */
  const goToTab = (next: TabKey) => {
    if (next !== 'schools') setPending(null);
    setTab(next);
  };

  const openTab = (next: TabKey) => {
    goToTab(next);
    document.getElementById(`timetable-tab-${next}`)?.focus();
  };

  const startTimetable = (forMember: string) => {
    setSelectedMemberId(forMember);
    // Without a school there is no bell schedule to paint against, so the
    // first thing a household needs is the school, not the grid.
    if (data.schools.length === 0) {
      setPending({ memberId: forMember, mode: 'start' });
      setAddingSchool(true);
      setTab('schools');
      return;
    }
    const school = schoolId ?? data.schools[0].id;
    draft.update((current) => addTimetable(current, forMember, school));
  };

  /** The "+ Add a school" beside a person's School box: their week is waiting. */
  const addSchoolFor = (forMember: string) => {
    setSelectedMemberId(forMember);
    setPending({ memberId: forMember, mode: 'move' });
    setAddingSchool(true);
    setTab('schools');
  };

  /**
   * A school arrived while somebody's week was waiting for it, so the errand
   * finishes itself: the week is started (or moved onto the new school) and the
   * household lands back on it rather than on the tab they were sent to.
   */
  const schoolAdded = (newSchoolId: string) => {
    if (!pending) return;
    const { memberId: forMember, mode } = pending;
    setPending(null);
    setSelectedMemberId(forMember);
    setPickedSchoolId(null);
    // A new school is not an edit to anybody's week, so this cannot be the
    // change that takes a week off its spreadsheet.
    draft.update((current) =>
      mode === 'start'
        ? addTimetable(current, forMember, newSchoolId)
        : withTimetable(current, forMember, (entry) => ({ ...entry, schoolId: newSchoolId })),
    );
    setTab('timetables');
  };

  const addSubjectFromPalette = (code: string) => {
    const subject = makeSubject(code, nextSubjectColor(data.subjects));
    draft.update((current) => withAddedSubject(current, subject));
    setBrush({ kind: 'subject', subjectId: subject.id });
  };

  const setWeeksAB = (on: boolean) => {
    if (!selected) return;
    const current = findTimetable(data, selected);
    if (!on && current?.weeks.B) weekStash.current[selected] = current.weeks.B;
    const stashed = on ? weekStash.current[selected] : undefined;
    draft.update((document) => {
      const next = withWeeksAB(document, selected, on);
      return stashed
        ? withTimetable(next, selected, (entry) => ({ ...entry, weeks: { A: entry.weeks.A, B: stashed } }))
        : next;
    });
    setShowing(on ? 'B' : 'A');
  };

  /**
   * A school's A/B rule, and the second weeks it holds up.
   *
   * Turning the rule off takes week B away from every child at that school,
   * because the store refuses a week B at a school that does not alternate.
   * One click on an unfamiliar control used to destroy a term's typing for
   * every brother and sister there, and clicking straight back on handed out a
   * copy of week A instead of what had been typed. So the weeks are kept for
   * the session: putting the rule back puts them back, and the banner says
   * what went and offers it back for a parent who was only poking at it.
   */
  const setWeekCycle = (schoolId: string, weekCycle: TimetableSchool['weekCycle']) => {
    if (weekCycle.mode === 'off') {
      const stash = stashedWeeksB(data, schoolId);
      const memberIds = Object.keys(stash);
      if (memberIds.length > 0) {
        cycleStash.current[schoolId] = { ...cycleStash.current[schoolId], ...stash };
      }
      const previous = findSchool(data, schoolId)?.weekCycle;
      setCycleTurnedOff(memberIds.length > 0 && previous ? { schoolId, memberIds, previous } : null);
      draft.update((current) => withWeekCycle(current, schoolId, weekCycle));
      return;
    }
    const stash = cycleStash.current[schoolId];
    delete cycleStash.current[schoolId];
    setCycleTurnedOff(null);
    draft.update((current) => {
      const next = withWeekCycle(current, schoolId, weekCycle);
      return stash ? withRestoredWeeksB(next, stash) : next;
    });
  };

  /**
   * Every edit to a week goes through here, so a week that follows a
   * spreadsheet is let off it the moment somebody changes it by hand.
   *
   * The alternative is an hourly check that throws away the cell a parent just
   * fixed. The rule compares the weeks either side of the change rather than
   * asking the control that made it, so a new way of editing cannot forget it.
   */
  const updateWeeks = (change: (current: TimetableData) => TimetableData) => {
    const result = stopFollowingEditedWeek(data, change(data), selected);
    draft.update(() => result.data);
    if (result.stopped) setStoppedFollowing(result.stopped);
  };

  const applyImport = (next: TimetableData) => {
    draft.update(() => next);
    setImporting(false);
    setTab('timetables');
  };

  /**
   * Closing, which waits for the last save.
   *
   * A refusal keeps the window open with its banner, because closing over one
   * threw the household's last edit away and said so on a window that was no
   * longer there. But a refusal that will not clear - a mistyped bell time, a
   * hub that is down - must not make the window a trap: every exit routes
   * through here, so a save that keeps failing left no way out but reloading
   * the editor, which discards the draft anyway.
   *
   * So the first attempt reports, and after that the way out is open. The
   * banner says what is unsaved and offers the same exit explicitly.
   */
  const close = async () => {
    if (checkingSheetRef.current) return;
    if (await draft.flushNow()) {
      onClose();
      return;
    }
    setCloseRefused(true);
  };

  /**
   * A check somebody asked for, and what it turned out to be.
   *
   * The button used to change nothing on screen whatever happened, so a check
   * that worked looked exactly like a dead one. The hub answers with a count of
   * the sheets it looked at rather than what they said, so the answer is read
   * off the document itself: this person's week before the check against their
   * week after it.
   */
  const checkedSheet = async (forMember: string): Promise<SheetCheckOutcome> => {
    if (checkingSheetRef.current) return null;
    checkingSheetRef.current = true;
    setCheckingSheet(true);
    try {
      const before = JSON.stringify(findTimetable(data, forMember)?.weeks ?? null);
      // A refused save keeps its draft and banner. Never reload over it.
      if (!await draft.flushNow()) return null;
      await checkSheetNow(editorFetch, forMember, t('common.saveError'));
      const next = await draft.reload();
      if (!next) return null;
      return JSON.stringify(findTimetable(next, forMember)?.weeks ?? null) === before ? 'unchanged' : 'changed';
    } finally {
      checkingSheetRef.current = false;
      setCheckingSheet(false);
    }
  };

  /** The week that is actually drawn, which is what the paint hint is about. */
  const shownTimetable = findTimetable(data, selected);
  const gridShowing = Boolean(shownTimetable && findSchool(data, shownTimetable.schoolId));
  /**
   * The other week's letter, for the key under the grid. Null for a household
   * that has one week, whose cells never carry the small line the key is about.
   */
  const otherLetter: WeekLetter | null = shownTimetable?.weeks.B ? (showing === 'A' ? 'B' : 'A') : null;

  const footerNote = () => {
    if (tab === 'subjects') return t('timetableModal.subjects.footerNote');
    if (tab === 'dates') return t('timetableModal.dates.footerNote');
    // Only when there is a week on screen with something to paint on it: the
    // hint used to ask a household with no grid and no palette to pick a
    // subject and drag across a week that was not there.
    if (tab === 'timetables') {
      if (!gridShowing) return '';
      const lines: string[] = [];
      if (data.subjects.length > 0) lines.push(t('timetableModal.grid.hint'));
      // The small line inside a cell that differs between the weeks is the one
      // thing drawn in this window with no words anywhere saying what it is,
      // and a household with a single week never sees it at all.
      if (otherLetter) lines.push(t('timetableModal.grid.otherWeekKey', { letter: otherLetter }));
      return lines.join(' ');
    }
    const school = findSchool(data, schoolId ?? undefined);
    if (!school) return '';
    const names = schoolMembers(data, school.id)
      .map((id) => members.find((member) => member.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    if (names.length === 0) return '';
    return t('timetableModal.schools.sharedNote', {
      names: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names),
    });
  };

  return (
    <CRUDModalShell
      title={importing ? t('timetableModal.import.title') : t('timetableModal.title')}
      subtitle={importing ? t('timetableModal.import.subtitle') : t('timetableModal.autosaveHint')}
      icon={
        importing ? (
          <button
            type="button"
            aria-label={t('timetableModal.import.back')}
            onClick={() => setImporting(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-hs-text-muted transition-colors hover:bg-hs-card hover:text-hs-text-body"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <School className="h-4 w-4 text-hs-accent-hover" aria-hidden="true" />
        )
      }
      maxWidth="max-w-[1140px]"
      hideFooter
      closable={!checkingSheet}
      onClose={() => void close()}
    >
      <fieldset
        disabled={checkingSheet}
        aria-busy={checkingSheet}
        className="m-0 flex min-h-0 min-w-0 flex-1 flex-col border-0 p-0"
        onPointerDownCapture={(event) => { if (checkingSheetRef.current) event.stopPropagation(); }}
      >
      {draft.loadError && (
        <div role="alert" className={`${BANNER_CLASS} border-hs-danger/30 bg-hs-danger/10 text-hs-danger`}>
          {draft.loadError}
        </div>
      )}
      {draft.saveError && !draft.conflict && (
        <div
          role="alert"
          className={`${BANNER_CLASS} flex flex-wrap items-center gap-2 border-hs-danger/30 bg-hs-danger/10 text-hs-danger`}
        >
          <span className="min-w-0 flex-1">{draft.saveError}</span>
          {closeRefused && (
            <Button size="sm" onClick={onClose}>
              {t('timetableModal.closeAnyway')}
            </Button>
          )}
        </div>
      )}
      {/* The other document is already in the draft by the time this is drawn,
          so there is nothing left to refresh and nothing to compare: the
          banner used to send a household off to check an edit that had been
          thrown away, behind a button that implied they still had a choice. */}
      {draft.conflict && (
        <div
          role="alert"
          className={`${BANNER_CLASS} flex items-center gap-2 border-hs-danger/30 bg-hs-danger/10 text-hs-danger`}
        >
          <span className="flex-1">{t('timetableModal.saveConflict')}</span>
        </div>
      )}
      {pending && (
        <div
          role="status"
          className={`${BANNER_CLASS} flex items-center gap-2 border-hs-accent/30 bg-hs-accent/10 text-hs-text-body`}
        >
          <span className="flex-1">
            {t(pending.mode === 'start' ? 'timetableModal.schoolFirst' : 'timetableModal.schoolForMember', {
              name: members.find((member) => member.id === pending.memberId)?.name ?? '',
            })}
          </span>
        </div>
      )}
      {stoppedFollowing && (
        <div
          role="status"
          className={`${BANNER_CLASS} flex items-center gap-2 border-hs-warning/30 bg-hs-warning/10 text-hs-text-body`}
        >
          <span className="flex-1">
            {t('timetableModal.source.stopped', {
              name: members.find((member) => member.id === stoppedFollowing)?.name ?? '',
            })}
          </span>
          <Button
            size="sm"
            onClick={() => {
              draft.update((current) => withSheetSync(current, stoppedFollowing, true));
              setStoppedFollowing(null);
            }}
          >
            {t('timetableModal.source.undo')}
          </Button>
          {/* Undo used to be its only control, so a household that was happy
              with the change kept the bar at the top of the window for the
              rest of the session. */}
          <Button size="sm" onClick={() => setStoppedFollowing(null)}>
            {t('timetableModal.source.stoppedAck')}
          </Button>
        </div>
      )}
      {cycleTurnedOff && (
        <div
          role="status"
          className={`${BANNER_CLASS} flex items-center gap-2 border-hs-warning/30 bg-hs-warning/10 text-hs-text-body`}
        >
          <span className="flex-1">
            {t('timetableModal.weekCycle.turnedOff', {
              names: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
                cycleTurnedOff.memberIds.map(
                  (id) => members.find((member) => member.id === id)?.name ?? '',
                ),
              ),
            })}
          </span>
          <Button size="sm" onClick={() => setWeekCycle(cycleTurnedOff.schoolId, cycleTurnedOff.previous)}>
            {t('timetableModal.source.undo')}
          </Button>
        </div>
      )}

      {!draft.loaded ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-hs-text-faint">
          {draft.loadError ? '' : tCore('loading')}
        </div>
      ) : importing ? (
        <ImportView data={data} members={members} onApply={applyImport} onCancel={() => setImporting(false)} />
      ) : (
        <>
          <div className="flex items-center gap-4 border-b border-hs-border px-4">
            <div role="tablist" aria-label={t('timetableModal.title')} className="flex items-center">
              {TABS.map((key, index) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`timetable-tab-${key}`}
                  aria-selected={tab === key}
                  // One panel is rendered at a time, so every tab points at
                  // it: aria-controls naming an element that is not there
                  // tells a screen reader about a panel it cannot reach.
                  aria-controls="timetable-panel"
                  tabIndex={tab === key ? 0 : -1}
                  onClick={() => goToTab(key)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowRight') {
                      event.preventDefault();
                      openTab(TABS[(index + 1) % TABS.length]);
                    } else if (event.key === 'ArrowLeft') {
                      event.preventDefault();
                      openTab(TABS[(index - 1 + TABS.length) % TABS.length]);
                    } else if (event.key === 'Home') {
                      event.preventDefault();
                      openTab(TABS[0]);
                    } else if (event.key === 'End') {
                      event.preventDefault();
                      openTab(TABS[TABS.length - 1]);
                    }
                  }}
                  className={`mr-6 border-b-2 px-1 py-2.5 text-sm transition-colors ${
                    tab === key
                      ? 'border-hs-accent text-hs-text-primary'
                      : 'border-transparent text-hs-text-faint hover:text-hs-text-secondary'
                  }`}
                >
                  {t(`timetableModal.tabs.${key}`)}
                  {/* How many dates are still to come, so a parent sees at a
                      glance that there is something on the tab. */}
                  {key === 'dates' && upcomingNoteCount(data, timezone) > 0 && (
                    <span className="ml-1.5 rounded-full bg-hs-hover px-1.5 py-px text-[10px] font-bold tabular-nums text-hs-text-body">
                      {upcomingNoteCount(data, timezone)}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => {
                // The banner is about one person's week; the import screen is
                // not showing it, so it has nothing to say there.
                setStoppedFollowing(null);
                setImporting(true);
              }}
            >
              <span className="flex items-center gap-1.5">
                <Table className="h-3.5 w-3.5" aria-hidden="true" />
                {t('timetableModal.import.open')}
              </span>
            </Button>
          </div>

          <div
            role="tabpanel"
            id="timetable-panel"
            aria-labelledby={`timetable-tab-${tab}`}
            className="flex min-h-0 flex-1 flex-col"
          >
            {tab === 'timetables' && (
              <TimetablesTab
                data={data}
                members={members}
                selectedMemberId={selected}
                onSelectMember={(nextMember) => {
                  // The banner names one person's week. Another child's week is
                  // not the place to read about it, or to undo it.
                  if (nextMember !== selected) setStoppedFollowing(null);
                  setSelectedMemberId(nextMember);
                }}
                onAddTimetable={startTimetable}
                onAddSchool={addSchoolFor}
                brush={paintBrush}
                onBrush={setBrush}
                onAddSubject={addSubjectFromPalette}
                showing={showing}
                onShowing={setShowing}
                onWeeksAB={setWeeksAB}
                onImportAgain={() => {
                  setStoppedFollowing(null);
                  setImporting(true);
                }}
                onCheck={checkedSheet}
                update={updateWeeks}
              />
            )}
            {tab === 'schools' && (
              <SchoolsTab
                data={data}
                members={members}
                selectedSchoolId={schoolId}
                onSelectSchool={setPickedSchoolId}
                adding={addingSchool}
                onAdding={setAddingSchool}
                onAdded={schoolAdded}
                onWeekCycle={setWeekCycle}
                update={draft.update}
              />
            )}
            {tab === 'subjects' && <SubjectsTab data={data} members={members} update={draft.update} />}
            {tab === 'dates' && <DatesTab data={data} members={members} update={draft.update} />}
          </div>

          <div className="flex items-center gap-3 border-t border-hs-border-strong px-5 py-3">
            <p className={`flex-1 ${PROSE_CLASS} text-hs-text-faint`}>{footerNote()}</p>
            <Button size="sm" variant="primary" onClick={() => void close()}>
              {t('timetableModal.done')}
            </Button>
          </div>
        </>
      )}
      </fieldset>
    </CRUDModalShell>
  );
}
