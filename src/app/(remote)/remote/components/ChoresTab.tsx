'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import { isFamilySnapshot, useFamilyData, type FamilySnapshot } from '@/hooks/useFamilyData';
import { Settings } from 'lucide-react';
import type {
  ChoreChartConfig,
  ChoreDefinition,
  ChoreSettings,
  FullscreenChoreCelebration,
} from '@/types/config';
import { asChoreSnapshot, type ChoreSnapshot } from '@/lib/chore-client';
import { useChoreAutosave } from '@/components/chores/useChoreAutosave';
import { buildCompletionSet, choresAssignedTo, choresOwedBy, isAssignedOn, isChoreComplete, isChoreSkipped } from '@/lib/chore-assignments';
import { TIME_OF_DAY_META, getCurrentTimeOfDay } from '@/components/modules/chore-chart/types';
import { atGrabLimit, readChoreSettings, resolveBonusFor, type BonusRefusal } from '@/lib/chore-bonus';
import { choreDayMenu, choreDayMenuKey, type ChoreDayMenuAction } from '@/lib/chore-day-menu';
import { editorFetch, throwIfNotOk } from '@/lib/editor-fetch';
import { useTranslate, useFormattingLocale } from '@/i18n';
import ChoreActionSheet, { type ChoreAction } from './ChoreActionSheet';
import ChoreSettingsSheet from './ChoreSettingsSheet';
import ConfirmSheet from './ConfirmSheet';
import ChoresManageView from './ChoresManageView';
import RewardsView from './RewardsView';
import ChoresTodayView, { type DayCelebration, type TodayAssignment } from './ChoresTodayView';
import { goalProgress, resolveSavingsGoal } from '@/lib/reward-rules';
import { choreStepLines } from '@/components/modules/chore-chart/chore-form-presentation';
import { forgetCelebrated, rememberCelebrated, wasCelebratedToday } from '@/lib/celebrated-today';
import { choresUrl } from '@/lib/fetch-keys';
import { logger } from '@/lib/logger';
import { useHouseholdNow, useHouseholdToday } from '../household-clock';
import { useChoreMarks } from '../hooks/useChoreMarks';
import { useRewardsPoll } from '../hooks/useRewardsPoll';
import { useHouseholdDayRollover } from '../hooks/useHouseholdDayRollover';
import AtHomePill from './AtHomePill';
import { REMOTE_ACCENT } from './chore-form-styles';

const log = logger('chores');

/**
 * Which member this device last picked. A kid's tablet opens on that kid, not
 * on whichever grown-up happens to be first in the list.
 */
const SELECTED_MEMBER_STORAGE_KEY = 'hs-chores-selected-member';

function readRememberedMember(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_MEMBER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberMember(id: string) {
  try {
    window.localStorage.setItem(SELECTED_MEMBER_STORAGE_KEY, id);
  } catch {
    /* private mode or storage disabled: the pick just isn't remembered */
  }
}

/** The first member who actually has something to do on `day`, else the first member. */
function defaultMemberFor(members: FamilyMember[], groups: FamilyGroup[], chores: ChoreDefinition[], day: string): string {
  const withChore = members.find((member) => chores.some((c) => isAssignedOn(c, member.id, day, groups)));
  return (withChore ?? members[0])?.id ?? '';
}

interface ChoresTabProps {
  /**
   * Display settings read from the first chore module placed on a screen, plus
   * what a finished day looks like, from the full-screen chart (`simple` when
   * there is none).
   */
  config: ChoreChartConfig & { celebration?: FullscreenChoreCelebration };
  /**
   * Household members and chores from the shared data file, read server-side
   * so the first paint is populated. These are data, not module config, which
   * is why they arrive as their own prop rather than inside `config`.
   */
  choreData: ChoreSnapshot;
  /** When false, hides Manage sub-view and restricts Rewards to redeem/history only. */
  isAdmin?: boolean;
  /**
   * The family, for the kids' page: it is open with no session, so it cannot
   * read the roster itself. It comes with the page and then with each chores
   * read. The phone leaves this out and reads the family as usual.
   */
  family?: FamilySnapshot;
}

export default function ChoresTab({ config, choreData, isAdmin = false, family }: ChoresTabProps) {
  const locale = useFormattingLocale();
  const t = useTranslate('remote');
  // ── Lifted state (shared between Today + Manage views) ──
  const [roster, setRoster] = useState(family);
  const followsRoster = !!family;
  const { members, groups, revision: familyRevision, loaded: familyLoaded, error: familyError, refresh: refreshFamily } = useFamilyData(roster);
  const [chores, setChores] = useState<ChoreDefinition[]>(choreData.chores ?? []);
  const [choreSettings, setChoreSettings] = useState<ChoreSettings>(choreData.settings);
  // Bumped when a settings save starts and ends: a poll that overlapped one
  // read the file before it and would put the old rules back.
  const settingsSaveRef = useRef(0);
  // Last warning surfaced from POST /api/chores (e.g. balance went negative on un-complete)
  // or a failed auto-save. Rendered as a dismissible banner so the user gets
  // in-UI feedback without DevTools.
  const [lastWarning, setLastWarning] = useState<string | null>(null);
  /** What the last failed save said, so the next save that lands can take it down. */
  const saveFailureRef = useRef<string | null>(null);
  // Saving is shared with the editor's chore window (`useChoreAutosave`):
  // saves in order, a failed one sent again until it lands, a conflict shown
  // as the other surface's list. The save is flushed on unmount so an edit
  // made just before leaving the tab is not lost.
  const { session, adopt: adoptChores, clean: choresClean } = useChoreAutosave(chores, {
    show: (snapshot) => {
      setChores(snapshot.chores);
      setChoreSettings(snapshot.settings);
    },
    conflict: () => setLastWarning(t('choresTab.changedElsewhere')),
    saved: () => {
      const failed = saveFailureRef.current;
      setLastWarning((warning) => (warning === failed ? null : warning));
    },
    failed: (text) => {
      log.error('Chore auto-save failed:', text);
      saveFailureRef.current = text;
      setLastWarning(text);
    },
  }, {
    initial: choreData,
    flushOnUnmount: true,
    words: { refused: t('choresTab.saveFailed'), unreachable: t('hubRequest.saveFailed') },
  });
  const [subView, setSubView] = useState<'today' | 'manage' | 'rewards'>('today');
  const accentColor = config.accentColor ?? REMOTE_ACCENT;

  // The hub's day as the page was drawn is the first paint, so it matches on any clock.
  const householdNow = useHouseholdNow();
  const householdDay = useHouseholdToday();
  const initialDate = useRef(choreData.today ?? householdDay).current;
  const [hubToday, setHubToday] = useState<string | null>(choreData.today ?? null);
  const { realToday, viewingDate, setViewingDate, isViewingPast } = useHouseholdDayRollover({ initialDate, hubToday });
  const canEdit = !isViewingPast || isAdmin;

  // ── Today view state ──
  // Shared with the Rewards view: the kid who checked off their chores is the
  // kid whose tickets Rewards shows, without picking themselves twice.
  const [selectedMemberId, setSelectedMemberId] = useState(
    () => defaultMemberFor(members, groups, chores, initialDate),
  );
  // The grown-up's menu for one chore, opened by holding it; and the settings sheet.
  const [menuChoreId, setMenuChoreId] = useState<string | null>(null);
  // A put-back waiting for the grown-up to confirm it.
  const [putBackChoreId, setPutBackChoreId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [celebration, setCelebration] = useState<DayCelebration | null>(null);
  const celebrationStyle = config.celebration ?? 'simple';

  const restoredMemberRef = useRef(false);

  // Restore this device's remembered member once the roster arrives, after mount (localStorage
  // is not available during the server render). An id that no longer exists
  // is ignored and the "first member with chores" default stands.
  useEffect(() => {
    if (restoredMemberRef.current || members.length === 0) return;
    restoredMemberRef.current = true;
    const remembered = readRememberedMember();
    if (remembered && members.some((m) => m.id === remembered)) {
      setSelectedMemberId(remembered);
    }
  }, [members]);

  const selectMember = useCallback((id: string) => {
    setSelectedMemberId(id);
    rememberMember(id);
  }, []);

  // The celebration belongs to the member and day it was earned on.
  useEffect(() => { setCelebration(null); }, [selectedMemberId, viewingDate]);

  // Keep selectedMemberId valid when members change
  useEffect(() => {
    if (members.length > 0 && !members.find((m) => m.id === selectedMemberId)) {
      const remembered = readRememberedMember();
      setSelectedMemberId(remembered && members.some((m) => m.id === remembered) ? remembered : defaultMemberFor(members, groups, chores, initialDate));
    }
  }, [members, groups, selectedMemberId, chores, initialDate]);

  const nameOf = (id: string | undefined) => members.find((m) => m.id === id)?.name ?? t('choresTab.overspentSomeone');
  const limitWords = (name: string) => t(choreSettings.grabLimit > 1 ? 'choresTab.bonus.refused.limitMany' : 'choresTab.bonus.refused.limit', { name });
  // On the kids' page a "limit" refusal needs no notice: the lists it carries
  // redraw the row with its own "Finish your grab first" line, said to "you".
  const refusalWords = (refused: { reason: BonusRefusal; memberId?: string }): string | null => {
    switch (refused.reason) {
      case 'grabbed': return t('choresTab.bonus.refused.grabbed', { name: nameOf(refused.memberId) });
      case 'taken': return t('choresTab.bonus.refused.taken', { name: nameOf(refused.memberId) });
      case 'limit': return isAdmin ? limitWords(nameOf(selectedMemberId)) : null;
      case 'not-yours': return t('choresTab.bonus.refused.notYours', { name: nameOf(selectedMemberId) });
      case 'not-today': return t('choresTab.bonus.refused.notToday');
      default: return t('choresTab.saveFailed');
    }
  };

  // The kids' page never looks further back than yesterday, so it asks for
  // the recent history; the grown-ups' history strip needs it all. `chores=1`
  // adds the chore list's revision, so a list another phone edited or deleted
  // from is picked up here too, not only its ticks.
  const { completions, marks, busy, rowNotice, setRowNotice, refresh: refreshMarks, toggle: toggleMark, write: writeMarks } = useChoreMarks({
    url: `${isAdmin ? '/api/chores?' : `${choresUrl()}&`}chores=1`,
    chores,
    today: realToday,
    before: () => settingsSaveRef.current,
    onPoll: (data, settingsSave) => {
      if (
        Array.isArray(data.chores)
        && typeof data.choresRevision === 'string'
        && data.choresRevision !== session.currentRevision
        // A poll that finds another phone's edit must not replace one made here and not yet saved.
        && choresClean()
      ) {
        adoptChores({ chores: data.chores as ChoreDefinition[], settings: readChoreSettings(data.settings), revision: data.choresRevision });
      }
      if (followsRoster && isFamilySnapshot(data.family)) {
        const next: FamilySnapshot = data.family;
        setRoster((prev) => (prev?.revision === next.revision ? prev : next));
      }
      if (typeof data.today === 'string') setHubToday(data.today);
      if (data.settings && settingsSave === settingsSaveRef.current) {
        const next = readChoreSettings(data.settings);
        setChoreSettings((prev) => (prev.grabLimit === next.grabLimit && prev.grabHold === next.grabHold ? prev : next));
      }
    },
    // Back on the network: the roster too, not at its next poll.
    onOnline: refreshFamily,
    onWarning: setLastWarning,
    words: { failed: t('choresTab.saveFailed'), refusal: refusalWords },
  });

  const showBalances = !!config.showPoints;
  // Read only while the balances or the Rewards view are on screen.
  const inRewardsView = subView === 'rewards';
  const { data: rewardsData, setData: setRewardsData, refresh: refreshRewards, applyMoved } = useRewardsPoll({
    enabled: showBalances || inRewardsView,
    view: subView,
  });
  const balances = rewardsData?.balances ?? null;

  // Completion lookup
  const completionSet = useMemo(() => buildCompletionSet(completions), [completions]);

  // Assignments for the selected member on the currently-viewed date.
  // Authored order within each time-of-day section is kept as-is: the
  // strike-through already says what is done, and a row that jumps to the
  // bottom the moment it is tapped is the one thing a thumb cannot follow.
  const myAssignments = useMemo<TodayAssignment[]>(() => {
    const day = viewingDate;
    return choresAssignedTo(chores, selectedMemberId, day, groups)
      .map((chore) => ({
        choreId: chore.id,
        choreName: chore.name,
        choreEmoji: chore.emoji,
        timeOfDay: chore.timeOfDay,
        points: chore.points,
        isCompleted: isChoreComplete(completionSet, chore.id, selectedMemberId, day),
        isSkipped: isChoreSkipped(completionSet, chore.id, selectedMemberId, day),
        steps: choreStepLines(chore.steps),
      }))
      .sort((a, b) => TIME_OF_DAY_META[a.timeOfDay].order - TIME_OF_DAY_META[b.timeOfDay].order);
  }, [chores, groups, viewingDate, selectedMemberId, completionSet]);

  // A chore marked "not today" is owed by nobody, so it is out of the count.
  const owed = myAssignments.filter((a) => !a.isSkipped);
  const totalDone = owed.filter((a) => a.isCompleted).length;
  const totalCount = owed.length;

  // Bonus chores open to the person picked. They never count; they only pay.
  const bonusItems = useMemo(
    () => resolveBonusFor(chores, members, viewingDate, marks, groups, choreSettings, realToday)
      // A put-back chore done on an earlier day is a grown-up's to reopen; kids do not see it.
      .filter((item) => item.eligibleIds.includes(selectedMemberId) && (isAdmin || !item.waiting)),
    [chores, members, viewingDate, marks, groups, choreSettings, selectedMemberId, isAdmin, realToday],
  );
  const selectedAtLimit = atGrabLimit(selectedMemberId, chores, realToday, marks, choreSettings, groups);
  // "Finish your grab first" goes as soon as it stops being true.
  const limitNoticeStale = !!rowNotice?.limit && !selectedAtLimit;
  useEffect(() => { if (limitNoticeStale) setRowNotice(null); }, [limitNoticeStale, setRowNotice]);

  // Per-member completion counts for tabs (on the currently-viewed date)
  const memberTabStats = useMemo(() => {
    const day = viewingDate;
    const stats: Record<string, { total: number; done: number }> = {};
    for (const member of members) {
      const owed = choresOwedBy(chores, member.id, day, completionSet, groups);
      stats[member.id] = {
        total: owed.length,
        done: owed.filter((c) => isChoreComplete(completionSet, c.id, member.id, day)).length,
      };
    }
    return stats;
  }, [members, groups, chores, viewingDate, completionSet]);

  const selectedMember = members.find((m) => m.id === selectedMemberId);
  // What they are saving for, drawn under the progress header while the balances are shown.
  const goal = showBalances && rewardsData ? resolveSavingsGoal(rewardsData, selectedMemberId) : null;
  const goalState = goal ? goalProgress(balances?.[selectedMemberId] ?? 0, goal) : null;
  const closeCelebration = useCallback(() => setCelebration(null), []);

  /** The row a write from this page lands on: the person picked, on the day on screen. */
  const rowFor = (choreId: string) => ({ choreId, memberId: selectedMemberId, date: viewingDate });

  // Toggle completion on the day on screen, so a grown-up's backdated edits hit the right day.
  const toggle = async (choreId: string) => {
    if (!canEdit) return; // kids viewing a past day can't edit
    const day = viewingDate;

    // Was this the last open chore of the day for this member? Decided before
    // the optimistic update so the celebration fires exactly once, on the tap
    // that finished the list (not on a poll that happens to agree).
    const target = owed.find((a) => a.choreId === choreId);
    const finishesEverything =
      !!target && !target.isCompleted && !isViewingPast &&
      owed.every((a) => a.isCompleted || a.choreId === choreId);
    // Once per kid per day, remembered in the browser: an un-tick and a
    // re-tick is a correction, not a second finish, even after a reload.
    if (finishesEverything && selectedMember && celebrationStyle !== 'off' && !wasCelebratedToday(selectedMemberId, day)) {
      rememberCelebrated(selectedMemberId, day);
      const tickets = owed.reduce((sum, a) => sum + ((a.isCompleted || a.choreId === choreId) ? a.points : 0), 0);
      setCelebration({ memberId: selectedMember.id, done: owed.length, total: owed.length, tickets, key: Date.now() });
    }

    const outcome = await toggleMark(rowFor(choreId));
    if (!outcome.ok) {
      if (finishesEverything) {
        setCelebration(null);
        forgetCelebrated(selectedMemberId, day);
      }
      return;
    }
    const { answer } = outcome;
    if (answer.rewards) applyMoved(answer.rewards);
    if (answer.overspent) {
      const { memberId, balance } = answer.overspent;
      const owedTickets = Math.abs(balance);
      setLastWarning(t(owedTickets === 1 ? 'choresTab.overspentOne' : 'choresTab.overspentMany', {
        name: members.find((m) => m.id === memberId)?.name ?? t('choresTab.overspentSomeone'),
        balance,
        owed: owedTickets,
      }));
    }
  };

  // Grab, let go, not today and put back all answer with the chore lists.
  const grabChore = (choreId: string) =>
    writeMarks({ kind: 'grab', choreId, memberId: selectedMemberId, action: 'grab' }, rowFor(choreId));
  const letGoOfChore = (choreId: string, memberId: string) =>
    writeMarks({ kind: 'grab', choreId, memberId, action: 'let-go' }, rowFor(choreId));
  const markNotToday = (choreId: string, memberIds: string[], skipped: boolean) =>
    writeMarks({ kind: 'skip', choreId, memberIds, date: viewingDate, skipped }, rowFor(choreId));
  const putBack = (choreId: string) => writeMarks({ kind: 'put-back', choreId }, rowFor(choreId));

  const saveSettings = async (next: ChoreSettings): Promise<boolean> => {
    settingsSaveRef.current += 1;
    try {
      const res = await editorFetch('/api/chores/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setChoreSettings(data.settings ?? next);
      return true;
    } catch {
      return false;
    } finally {
      settingsSaveRef.current += 1;
    }
  };

  // What the grown-up's menu offers for a chore, for the person picked, on the
  // day on screen (`choreDayMenu`); null when there is nothing to offer, and
  // then the row has no ••• and no hold.
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const menuFor = (choreId: string): ChoreDayMenuAction[] | null => {
    const chore = chores.find((c) => c.id === choreId);
    if (!chore || !selectedMember) return null;
    return choreDayMenu({
      chore,
      memberId: selectedMemberId,
      date: viewingDate,
      isPast: isViewingPast,
      memberIds,
      groups,
      completionSet,
      bonus: bonusItems.find((i) => i.chore.id === choreId),
    });
  };
  /** Each action in words, with what a tap on it does. */
  const describeAction = (action: ChoreDayMenuAction, chore: ChoreDefinition, person: FamilyMember): ChoreAction => {
    switch (action.id) {
      case 'toggle':
        return { id: action.id, mark: '✓', label: t(action.done ? 'choresTab.dayMenu.notDone' : 'choresTab.dayMenu.didIt', { name: person.name }), onSelect: () => void toggle(chore.id) };
      case 'let-go':
        return { id: action.id, mark: '✋', label: t('choresTab.dayMenu.letGoOf', { name: nameOf(action.memberId) }), onSelect: () => void letGoOfChore(chore.id, action.memberId) };
      case 'put-back':
        return { id: action.id, mark: '↺', label: t('choresTab.dayMenu.putBack'), hint: t('choresTab.dayMenu.putBackHint'), onSelect: () => setPutBackChoreId(chore.id) };
      case 'skip':
        return { id: action.id, mark: '–', label: t('choresTab.dayMenu.notTodayFor', { name: person.name }), hint: t('choresTab.dayMenu.notTodayHint', { name: person.name }), onSelect: () => void markNotToday(chore.id, [person.id], true) };
      case 'undo-skip':
        return { id: action.id, mark: '↺', label: t('choresTab.dayMenu.undoNotToday', { name: person.name }), onSelect: () => void markNotToday(chore.id, [person.id], false) };
      case 'skip-all':
        return { id: action.id, mark: '–', label: t('choresTab.dayMenu.notTodayEveryone'), hint: t('choresTab.dayMenu.notTodayEveryoneHint', { n: action.memberIds.length }), onSelect: () => void markNotToday(chore.id, action.memberIds, true) };
      case 'undo-skip-all':
        return { id: action.id, mark: '↺', label: t('choresTab.dayMenu.onTodayEveryone'), onSelect: () => void markNotToday(chore.id, action.memberIds, false) };
    }
  };
  const menuChore = menuChoreId ? chores.find((c) => c.id === menuChoreId) : undefined;
  const menuActions = menuChoreId ? menuFor(menuChoreId) : null;
  // What the menu offered when it opened. A refresh that changes the choices
  // (someone grabbed the chore meanwhile) closes it rather than swapping a
  // choice under the finger: "Ada did it" must not become "Let go of Bram's grab".
  const [menuOpenedWith, setMenuOpenedWith] = useState('');
  const openMenu = (choreId: string) => {
    setMenuChoreId(choreId);
    setMenuOpenedWith(choreDayMenuKey(menuFor(choreId)));
  };
  const menuChanged = menuActions !== null && choreDayMenuKey(menuActions) !== menuOpenedWith;
  useEffect(() => { if (menuChanged) setMenuChoreId(null); }, [menuChanged]);
  // A menu belongs to the child and day it was opened on. Left set, a menu
  // with nothing to offer opened by itself on the next child or day.
  useEffect(() => { setMenuChoreId(null); }, [selectedMemberId, viewingDate]);
  const menuEmpty = menuChoreId !== null && menuActions === null;
  useEffect(() => { if (menuEmpty) setMenuChoreId(null); }, [menuEmpty]);

  const formatDay = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long' });
  };
  const dayName = formatDay(viewingDate);
  // Morning, afternoon or evening at home: a phone left on another zone
  // must not light up the evening chores after lunch.
  const currentTimeOfDay = getCurrentTimeOfDay(householdNow.getHours());

  return (
    <div>
      {/* Whose chart this is, in the heading. A shared tablet opens on whoever
          used it last, and the only cue used to be one name pill outlined in
          colour halfway down the rail, so a kid could tick someone else's
          chores without ever seeing a name. The switch hint the Rewards tab
          already carries sits here too, on the tab people actually land on. */}
      <div style={{ padding: '12px 0 4px' }}>
        <div style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>{dayName}</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--hs-text-primary)' }}>
          {subView === 'today' && selectedMember
            ? t('choresTab.headerFor', { name: selectedMember.name })
            : t('choresTab.header')}
        </h2>
        {subView === 'today' && selectedMember && members.length > 1 && (
          <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '4px 0 0', lineHeight: 1.4 }}>
            {t('choresTab.switchHint', { name: selectedMember.name })}
          </p>
        )}
      </div>
      {/* Grown-ups only: the kids' page runs on the home tablet or a kid's
          phone at home, where the phone's clock is home's. */}
      {isAdmin && <AtHomePill style={{ marginTop: 8 }} />}

      {/* Sub-nav: Today / Manage / Rewards */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 3,
          background: 'var(--hs-bg-card)',
          borderRadius: 10,
          marginTop: 12,
          marginBottom: 16,
        }}
      >
        {(isAdmin ? ['today', 'manage', 'rewards'] as const : ['today', 'rewards'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setSubView(v)}
            style={{
              flex: 1,
              padding: '8px 12px',
              minHeight: 44,
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
              background: subView === v ? 'var(--hs-bg-hover)' : 'transparent',
              color: subView === v ? 'var(--hs-text-body)' : 'var(--hs-text-faint)',
            }}
          >
            {t(`choresTab.subNav.${v}`)}
          </button>
        ))}
      </div>

      {/* Server-side warning banner: a save that failed, or a balance that went
          negative after an un-complete. Rendered above the sub-view switch because the
          edits that produce these warnings happen in Manage, not in Today.
          Dismissible so the warning is acknowledged explicitly. */}
      {lastWarning && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            background: 'color-mix(in srgb, var(--hs-danger) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--hs-danger) 30%, transparent)',
            borderRadius: 10,
            marginBottom: 10,
            fontSize: 13,
            color: 'var(--hs-danger)',
            lineHeight: 1.4,
          }}
        >
          <span style={{ flex: 1 }}>{lastWarning}</span>
          <button
            type="button"
            onClick={() => setLastWarning(null)}
            aria-label={t('choresTab.warningDismissAriaLabel')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--hs-danger)',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: '0 4px',
              fontWeight: 700,
            }}
          >
            ×
          </button>
        </div>
      )}

      {subView === 'rewards' ? (
        <RewardsView
          members={members}
          accentColor={accentColor}
          isAdmin={isAdmin}
          selectedMemberId={selectedMemberId}
          onSelectMember={selectMember}
          data={rewardsData}
          setData={setRewardsData}
          refreshData={refreshRewards}
        />
      ) : subView === 'manage' && isAdmin ? (
        <ChoresManageView
          members={members}
          groups={groups}
          familyReady={familyRevision !== null}
          chores={chores}
          today={realToday}
          choreSettings={choreSettings}
          onFamilyChanged={() => {
            void editorFetch('/api/chores/data').then(throwIfNotOk).then((res) => res.json()).then((json) => {
              const snapshot = asChoreSnapshot(json);
              if (!snapshot) throw new Error('Malformed chore data');
              adoptChores(snapshot);
            }).catch(() => setLastWarning(t('choresTab.saveFailed')));
            void refreshMarks();
            void refreshRewards();
          }}
          onChoresChange={setChores}
          onOpenSettings={() => setShowSettings(true)}
        />
      ) : !familyLoaded && familyError ? (
        /* The family could not be read (a Wi-Fi blip as the tab opened). Said
           as that: "no chores set up yet" would send a grown-up off to set up
           chores that are all still there. */
        <div style={{ textAlign: 'center', padding: '48px 16px' }} data-testid="chores-load-error">
          <p role="alert" style={{ fontSize: 14, color: 'var(--hs-text-faint)', marginBottom: 16 }}>{t('choresTab.loadError')}</p>
          <button
            onClick={refreshFamily}
            className="press-btn"
            style={{
              padding: '10px 24px',
              minHeight: 44,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              background: 'var(--hs-hover)',
              color: 'var(--hs-text-primary)',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {t('choresTab.retry')}
          </button>
        </div>
      ) : members.length === 0 || chores.length === 0 ? (
        /* Empty state */
        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
          <Settings size={40} color="var(--hs-border-strong)" style={{ marginBottom: 16 }} />
          <p style={{ fontSize: 15, color: 'var(--hs-text-faint)', marginBottom: 4 }}>
            {t(isAdmin ? 'choresTab.empty.title' : 'choresTab.empty.kidTitle')}
          </p>
          <p style={{ fontSize: 13, color: 'var(--hs-text-faint)', marginBottom: 20 }}>
            {t(isAdmin ? 'choresTab.empty.description' : 'choresTab.empty.kidDescription')}
          </p>
          {isAdmin && (
          <button
            onClick={() => setSubView('manage')}
            style={{
              padding: '10px 24px',
              minHeight: 44,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              background: accentColor,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {t('choresTab.empty.setUpButton')}
          </button>
          )}
        </div>
      ) : (
        <ChoresTodayView
          isAdmin={isAdmin}
          accentColor={accentColor}
          showPoints={!!config.showPoints}
          showBalances={showBalances}
          balances={balances}
          members={members}
          groups={groups}
          chores={chores}
          completionSet={completionSet}
          viewingDate={viewingDate}
          realToday={realToday}
          onSelectDay={setViewingDate}
          isViewingPast={isViewingPast}
          canEdit={canEdit}
          currentTimeOfDay={currentTimeOfDay}
          selectedMemberId={selectedMemberId}
          selectedMember={selectedMember}
          onSelectMember={selectMember}
          memberTabStats={memberTabStats}
          assignments={myAssignments}
          totalDone={totalDone}
          totalCount={totalCount}
          bonusItems={bonusItems}
          selectedAtLimit={selectedAtLimit}
          grabLimit={choreSettings.grabLimit}
          celebration={celebration}
          onCloseCelebration={closeCelebration}
          goal={goal}
          goalState={goalState}
          onOpenRewards={() => setSubView('rewards')}
          busy={busy}
          rowNotice={rowNotice}
          onToggle={(choreId) => void toggle(choreId)}
          onUndoNotToday={(choreId) => void markNotToday(choreId, [selectedMemberId], false)}
          onGrab={(choreId) => void grabChore(choreId)}
          onLetGo={(choreId) => void letGoOfChore(choreId, selectedMemberId)}
          // A grown-up is told about the child by name; a kid, as "you".
          onLimitTap={(choreId) => setRowNotice({
            ...rowFor(choreId),
            limit: true,
            text: isAdmin
              ? limitWords(nameOf(selectedMemberId))
              : t(choreSettings.grabLimit > 1 ? 'choresTab.bonus.limitLineMany' : 'choresTab.bonus.limitLine'),
          })}
          onPutBack={setPutBackChoreId}
          hasMenu={(choreId) => menuFor(choreId) !== null}
          onOpenMenu={openMenu}
        />
      )}

      {putBackChoreId && (
        <ConfirmSheet
          title={t('choresTab.putBackConfirm.title')}
          description={t('choresTab.putBackConfirm.description', { chore: chores.find((c) => c.id === putBackChoreId)?.name ?? '' })}
          confirmLabel={t('choresTab.dayMenu.putBack')}
          confirmColor="var(--hs-accent)"
          settleMs={500}
          guardTaps
          onConfirm={() => { const id = putBackChoreId; setPutBackChoreId(null); void putBack(id); }}
          onCancel={() => setPutBackChoreId(null)}
        />
      )}

      {menuActions && menuChore && selectedMember && (
        <ChoreActionSheet
          title={menuChore.name}
          subtitle={`${selectedMember.name} · ${dayName}`}
          actions={menuActions.map((action) => describeAction(action, menuChore, selectedMember))}
          onClose={() => setMenuChoreId(null)}
        />
      )}
      {showSettings && (
        <ChoreSettingsSheet settings={choreSettings} onSave={saveSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
