'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import { isFamilySnapshot, useFamilyData, type FamilySnapshot } from '@/hooks/useFamilyData';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { Sunrise, Sun, Sunset, Clock, Settings, Hand, ChevronRight } from 'lucide-react';
import type {
  ChoreChartConfig,
  ChoreDefinition,
  ChoreCompletion,
  ChoreGrab,
  ChoreSettings,
  ChoreTimeOfDay,
  ChoreToggleRequest,
  ChoreToggleResponse,
  FullscreenChoreCelebration,
} from '@/types/config';
import { asChoreSnapshot, ChoreSession, type ChoreSnapshot } from '@/lib/chore-client';
import {
  resolveAssignee,
  choreAppliesToday,
  buildCompletionSet,
  completionKey,
  isChoreComplete,
  isChoreSkipped,
  addDaysISO,
  TIME_OF_DAY_META,
  getTimeOfDayLabelKey,
  getCurrentTimeOfDay,
} from '@/components/modules/chore-chart/types';
import { planChoreToggle } from '@/components/modules/chore-chart/chore-toggle';
import { atGrabLimit, canPutBack, readChoreSettings, countsSinceReset, resetViewDay, resolveBonusFor, type BonusMarks, type BonusRefusal } from '@/lib/chore-bonus';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { editorFetch, isSessionExpired, throwIfNotOk } from '@/lib/editor-fetch';
import { useTranslate, useFormattingLocale } from '@/i18n';
import ChoreHistoryNav from './ChoreHistoryNav';
import ChoreHistoryBanner from './ChoreHistoryBanner';
import ChoreRow from './ChoreRow';
import BonusChoreRow from './BonusChoreRow';
import ChoreActionSheet, { type ChoreAction } from './ChoreActionSheet';
import ChoreSettingsSheet from './ChoreSettingsSheet';
import ConfirmSheet from './ConfirmSheet';
import ChoresManageView from './ChoresManageView';
import RewardsView, { type RewardsData } from './RewardsView';
import DayCompleteSheet from './DayCompleteSheet';
import { goalProgress, resolveSavingsGoal } from '@/lib/reward-rules';
import { choreStepLines } from '@/components/modules/chore-chart/chore-form-presentation';
import { forgetCelebrated, rememberCelebrated, wasCelebratedToday } from '@/lib/celebrated-today';
import { choresUrl } from '@/lib/fetch-keys';
import { logger } from '@/lib/logger';
import { useHouseholdNow, useHouseholdToday } from '../household-clock';
import AtHomePill from './AtHomePill';

const log = logger('chores');

const TOD_ICONS: Record<ChoreTimeOfDay, typeof Sunrise> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  anytime: Clock,
};

/**
 * Which member this device last picked. A kid's tablet opens on that kid, not
 * on whichever grown-up happens to be first in the list.
 */
const SELECTED_MEMBER_STORAGE_KEY = 'hs-chores-selected-member';
/** How long a message under a bonus row ("Cleo is already on that one") stays. */
const ROW_NOTICE_MS = 5000;

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
  const dayOfWeek = new Date(day + 'T00:00:00').getDay();
  for (const member of members) {
    const hasChore = chores.some(
      (c) => choreAppliesToday(c, dayOfWeek, day) && resolveAssignee(c, day, groups).includes(member.id),
    );
    if (hasChore) return member.id;
  }
  return members[0]?.id ?? '';
}

/** How often a chore save that failed is sent again. */
const SAVE_RETRY_MS = 10_000;

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
  const tModules = useTranslate('modules');
  // ── Lifted state (shared between Today + Manage views) ──
  const [roster, setRoster] = useState(family);
  const followsRoster = !!family;
  const { members, groups, revision: familyRevision, loaded: familyLoaded, error: familyError, refresh: refreshFamily } = useFamilyData(roster);
  const [chores, setChores] = useState<ChoreDefinition[]>(choreData.chores ?? []);
  // The list as last received from or saved to the hub, and the list on screen
  // right now: an edit not yet saved shows as the two differing, and a poll
  // that finds another phone's edit must not replace it.
  const cleanChoresRef = useRef<ChoreDefinition[]>(chores);
  const choresRef = useRef(chores);
  choresRef.current = chores;
  // Saves go through one session (`lib/chore-client.ts`): they run in order,
  // each quoting the revision the previous one was answered with, so a list
  // from an older copy cannot overwrite what another phone saved since.
  const [session] = useState(() => new ChoreSession(editorFetch, choreData));
  // A list the hub handed us (a reload, or a conflict's current copy) is
  // already saved: the auto-save below must not send it straight back.
  const adoptedRef = useRef<ChoreDefinition[] | null>(null);
  const [choreSettings, setChoreSettings] = useState<ChoreSettings>(choreData.settings);
  // Bumped when a settings save starts and ends: a poll that overlapped one
  // read the file before it and would put the old rules back.
  const settingsSaveRef = useRef(0);
  const adoptChores = useCallback((snapshot: ChoreSnapshot) => {
    adoptedRef.current = snapshot.chores;
    cleanChoresRef.current = snapshot.chores;
    session.adopt(snapshot);
    setChores(snapshot.chores);
    setChoreSettings(snapshot.settings);
  }, [session]);
  // Only the exact empty list produced by a deliberate last-chore deletion
  // may bypass the server guard. Missing props or reload data never grant it.
  const intentionalEmpty = useRef<ChoreDefinition[] | null>(null);
  const [subView, setSubView] = useState<'today' | 'manage' | 'rewards'>('today');
  const accentColor = config.accentColor ?? '#f59e0b';

  // The household's day, rolling over at midnight in the household's zone,
  // not the phone's. The hub's day as the page was drawn is the first paint,
  // so it matches on any clock.
  const householdDay = useHouseholdToday();
  const householdNow = useHouseholdNow();
  const initialDate = useRef(choreData.today ?? householdDay).current;
  const [viewingDate, setViewingDate] = useState<string>(initialDate);
  const [hubToday, setHubToday] = useState<string | null>(choreData.today ?? null);

  // ── Today view state ──
  // Shared with the Rewards view: the kid who checked off their chores is the
  // kid whose tickets Rewards shows, without picking themselves twice.
  const [selectedMemberId, setSelectedMemberId] = useState(
    () => defaultMemberFor(members, groups, chores, initialDate),
  );
  const [completions, setCompletions] = useState<ChoreCompletion[]>([]);
  // Who is holding which bonus chore, and when each "put it back" one was last put back.
  const [grabs, setGrabs] = useState<ChoreGrab[]>([]);
  const [bonusResets, setBonusResets] = useState<Record<string, string>>({});
  // The grown-up's menu for one chore, opened by holding it; and the settings sheet.
  const [menuChoreId, setMenuChoreId] = useState<string | null>(null);
  // "Cleo is already on that one": said under the row that was tapped, and
  // gone after a few seconds, not in a red banner at the top of the page.
  // Kept with the person and day it was said to: switching to another child
  // or day must not show it under their row.
  const [rowNotice, setRowNotice] = useState<{ choreId: string; memberId: string; date: string; text: string; limit?: boolean } | null>(null);
  useEffect(() => {
    if (!rowNotice) return;
    const id = setTimeout(() => setRowNotice(null), ROW_NOTICE_MS);
    return () => clearTimeout(id);
  }, [rowNotice]);
  // A put-back waiting for the grown-up to confirm it.
  const [putBackChoreId, setPutBackChoreId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  // The rewards answer, shared with the Rewards view: one poll feeds both the
  // ticket balances beside the progress header (so a kid sees the count grow
  // as they check things off) and the store. null until the first read lands.
  const [rewardsData, setRewardsData] = useState<RewardsData | null>(null);
  const balances = rewardsData?.balances ?? null;
  // The "all done" sheet, with the day's numbers as they stood at the tick that finished it.
  const [celebration, setCelebration] = useState<{ memberId: string; done: number; total: number; tickets: number; key: number } | null>(null);
  const celebrationStyle = config.celebration ?? 'simple';
  // Which chores have their steps open under the row, for the person and day
  // they were opened on. Several may be open: closing one as another opens
  // moved the rows under the finger.
  const [openSteps, setOpenSteps] = useState<ReadonlySet<string>>(() => new Set());
  // Last warning surfaced from POST /api/chores (e.g. balance went negative on un-complete)
  // or a failed auto-save. Rendered as a dismissible banner so the user gets
  // in-UI feedback without DevTools.
  const [lastWarning, setLastWarning] = useState<string | null>(null);

  // Debounced auto-save. `skipInitial` skips the first effect run after mount
  // (initial state comes from props), and `flushOnUnmount` ensures any pending
  // save in the debounce window runs before the component unmounts.
  // A save that failed is sent again: when the phone is back on the network,
  // and every few seconds until it lands. The list on screen already shows
  // the change, so leaving it unsent meant a chore that looked saved and was
  // gone after a reload.
  const [unsaved, setUnsaved] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(0);
  useEffect(() => {
    if (!unsaved) return;
    const again = () => setSaveAttempt((n) => n + 1);
    window.addEventListener('online', again);
    const id = setInterval(again, SAVE_RETRY_MS);
    return () => {
      window.removeEventListener('online', again);
      clearInterval(id);
    };
  }, [unsaved]);

  useDebouncedSave({
    values: [chores, saveAttempt],
    flushOnUnmount: true,
    save: async () => {
      if (chores === adoptedRef.current) return;
      const outcome = await session.save(chores, chores === intentionalEmpty.current);
      // Somebody else saved first. Show their list rather than replace it;
      // the change made here has to be made again on top of it.
      if (outcome.kind === 'conflict') {
        adoptChores(outcome.snapshot);
        setUnsaved(false);
        setLastWarning(t('choresTab.changedElsewhere'));
      } else if (outcome.kind === 'saved') {
        cleanChoresRef.current = chores;
        setUnsaved(false);
        const failed = t('choresTab.saveFailed');
        setLastWarning((warning) => (warning === failed ? null : warning));
      }
    },
    // The session rejects on any other failure; without that a 500 resolved
    // and this never fired: the new member stayed on screen and was gone
    // after reload, with no warning.
    onError: (err) => {
      if (isSessionExpired(err)) return;
      log.error('Chore auto-save failed:', err);
      setUnsaved(true);
      setLastWarning(t('choresTab.saveFailed'));
    },
  });

  // Track mounted state so in-flight fetches don't setState after unmount.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  // The celebration and the open steps belong to the member and day they were earned on.
  useEffect(() => {
    setCelebration(null);
    setOpenSteps(new Set());
  }, [selectedMemberId, viewingDate]);

  // Each new poll cancels the previous in-flight poll.
  const fetchAbortRef = useRef<AbortController | null>(null);

  // Keep selectedMemberId valid when members change
  useEffect(() => {
    if (members.length > 0 && !members.find((m) => m.id === selectedMemberId)) {
      const remembered = readRememberedMember();
      setSelectedMemberId(remembered && members.some((m) => m.id === remembered) ? remembered : defaultMemberFor(members, groups, chores, initialDate));
    }
  }, [members, groups, selectedMemberId, chores, initialDate]);

  // Every chore route answers with the same lists. Each is kept identity-
  // stable when its content is unchanged, so a quiet poll re-renders nothing.
  const applyMarks = useCallback((data: Partial<BonusMarks>) => {
    const keep = <T,>(next: T | undefined) => (prev: T): T =>
      next === undefined || JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    setCompletions(keep(data.completions as ChoreCompletion[] | undefined));
    setGrabs(keep(data.grabs as ChoreGrab[] | undefined));
    setBonusResets(keep(data.bonusResets as Record<string, string> | undefined));
  }, []);

  // Fetch completions
  const fetchCompletions = useCallback(async () => {
    // Cancel any prior in-flight poll
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const settingsSave = settingsSaveRef.current;
    try {
      // The kids' page never looks further back than yesterday, so it asks
      // for the recent history; the grown-ups' history strip needs it all.
      // `chores=1` adds the chore list's revision, so a list another phone
      // edited or deleted from is picked up here too, not only its ticks.
      const res = await editorFetch(`${isAdmin ? '/api/chores?' : `${choresUrl()}&`}chores=1`, { signal: controller.signal });
      if (!res.ok) return;
      const data = await res.json();
      if (!isMountedRef.current || controller.signal.aborted) return;
      applyMarks(data);
      if (
        Array.isArray(data?.chores)
        && typeof data.choresRevision === 'string'
        && data.choresRevision !== session.currentRevision
        && choresRef.current === cleanChoresRef.current
      ) {
        adoptChores({ chores: data.chores, settings: readChoreSettings(data.settings), revision: data.choresRevision });
      }
      if (followsRoster && isFamilySnapshot(data?.family)) {
        const next: FamilySnapshot = data.family;
        setRoster((prev) => (prev?.revision === next.revision ? prev : next));
      }
      if (typeof data?.today === 'string') setHubToday(data.today);
      if (data?.settings && settingsSave === settingsSaveRef.current) {
        const next = readChoreSettings(data.settings);
        setChoreSettings((prev) => (prev.grabLimit === next.grabLimit && prev.grabHold === next.grabHold ? prev : next));
      }
    } catch { /* silent (includes AbortError) */ }
  }, [applyMarks, adoptChores, isAdmin, session, followsRoster]);

  const showBalances = !!config.showPoints;
  const fetchRewards = useCallback(async () => {
    try {
      const res = await editorFetch('/api/rewards');
      if (!res.ok) return;
      const data = await res.json();
      if (!isMountedRef.current) return;
      setRewardsData(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchCompletions();
    const interval = setInterval(fetchCompletions, 15_000);
    return () => {
      clearInterval(interval);
      fetchAbortRef.current?.abort();
    };
  }, [fetchCompletions]);

  // Back on the network: read again now, not at the next poll.
  useEffect(() => {
    const onOnline = () => {
      refreshFamily();
      void fetchCompletions();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refreshFamily, fetchCompletions]);

  // Read only while the balances or the Rewards view are on screen.
  const inRewardsView = subView === 'rewards';
  const wantsRewards = showBalances || inRewardsView;
  // Also re-read on entering or leaving the Rewards view: the balances beside
  // the progress header may be up to a poll old, and a redeem or a list edit
  // built from them is refused.
  useEffect(() => {
    if (!wantsRewards) return;
    fetchRewards();
    const interval = setInterval(fetchRewards, 15_000);
    // A phone picked up again reads at once: two parents giving tickets
    // within a quarter of a minute were otherwise looking at different numbers.
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchRewards(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchRewards, wantsRewards, inRewardsView]);

  // Today is the hub's calendar day once it has said so: a phone with a wrong
  // clock (or near midnight) must not show or tick a different day than the
  // wall and the other phones. The household clock covers a hub that cannot
  // be reached.
  const realToday = hubToday ?? householdDay;
  // If the user was parked on what used to be today, walk them forward.
  // If they're explicitly viewing a past day, leave them alone.
  const shownToday = useRef(realToday);
  useEffect(() => {
    const before = shownToday.current;
    if (before === realToday) return;
    shownToday.current = realToday;
    setViewingDate((prev) => (prev === before ? realToday : prev));
  }, [realToday]);
  const isViewingPast = viewingDate !== realToday;
  const canEdit = !isViewingPast || isAdmin;

  // Completion lookup
  const completionSet = useMemo(() => buildCompletionSet(completions), [completions]);

  // Assignments for the selected member on the currently-viewed date.
  // Authored order within each time-of-day section is kept as-is: the
  // strike-through already says what is done, and a row that jumps to the
  // bottom the moment it is tapped is the one thing a thumb cannot follow.
  const myAssignments = useMemo(() => {
    const day = viewingDate;
    const dayOfWeek = new Date(day + 'T00:00:00').getDay();
    const assignments: { choreId: string; choreName: string; choreEmoji: string; timeOfDay: ChoreTimeOfDay; points: number; isCompleted: boolean; isSkipped: boolean; steps: string[] }[] = [];

    for (const chore of chores) {
      if (!choreAppliesToday(chore, dayOfWeek, day)) continue;
      const assignees = resolveAssignee(chore, day, groups);
      if (!assignees.includes(selectedMemberId)) continue;

      assignments.push({
        choreId: chore.id,
        choreName: chore.name,
        choreEmoji: chore.emoji,
        timeOfDay: chore.timeOfDay,
        points: chore.points,
        isCompleted: isChoreComplete(completionSet, chore.id, selectedMemberId, day),
        isSkipped: isChoreSkipped(completionSet, chore.id, selectedMemberId, day),
        steps: choreStepLines(chore.steps),
      });
    }

    return assignments.sort(
      (a, b) => TIME_OF_DAY_META[a.timeOfDay].order - TIME_OF_DAY_META[b.timeOfDay].order,
    );
  }, [chores, groups, viewingDate, selectedMemberId, completionSet]);

  // Group by time of day
  const grouped = useMemo(() => {
    const groups = new Map<ChoreTimeOfDay, typeof myAssignments>();
    for (const a of myAssignments) {
      const existing = groups.get(a.timeOfDay) ?? [];
      existing.push(a);
      groups.set(a.timeOfDay, existing);
    }
    return groups;
  }, [myAssignments]);

  // A chore marked "not today" is owed by nobody, so it is out of the count.
  const owed = myAssignments.filter((a) => !a.isSkipped);
  const totalDone = owed.filter((a) => a.isCompleted).length;
  const totalCount = owed.length;

  // Bonus chores open to the person picked. They never count; they only pay.
  const marks = useMemo<BonusMarks>(() => ({ completions, grabs, bonusResets }), [completions, grabs, bonusResets]);
  const bonusItems = useMemo(
    () => resolveBonusFor(chores, members, viewingDate, marks, groups, choreSettings, realToday)
      // A put-back chore done on an earlier day is a grown-up's to reopen; kids do not see it.
      .filter((item) => item.eligibleIds.includes(selectedMemberId) && (isAdmin || !item.waiting)),
    [chores, members, viewingDate, marks, groups, choreSettings, selectedMemberId, isAdmin, realToday],
  );
  const selectedAtLimit = atGrabLimit(selectedMemberId, chores, realToday, marks, choreSettings, groups);
  const onlyBonus = myAssignments.length === 0 && bonusItems.length > 0;
  // "Finish your grab first" goes as soon as it stops being true.
  const limitNoticeStale = !!rowNotice?.limit && !selectedAtLimit;
  useEffect(() => { if (limitNoticeStale) setRowNotice(null); }, [limitNoticeStale]);


  // Per-member completion counts for tabs (on the currently-viewed date)
  const memberTabStats = useMemo(() => {
    const day = viewingDate;
    const dayOfWeek = new Date(day + 'T00:00:00').getDay();
    const stats: Record<string, { total: number; done: number }> = {};
    for (const member of members) {
      let total = 0;
      let done = 0;
      for (const c of chores) {
        if (!choreAppliesToday(c, dayOfWeek, day)) continue;
        if (!resolveAssignee(c, day, groups).includes(member.id)) continue;
        if (isChoreSkipped(completionSet, c.id, member.id, day)) continue;
        total++;
        if (isChoreComplete(completionSet, c.id, member.id, day)) done++;
      }
      stats[member.id] = { total, done };
    }
    return stats;
  }, [members, groups, chores, viewingDate, completionSet]);

  const selectedMember = members.find((m) => m.id === selectedMemberId);
  // What they are saving for, drawn under the progress header while the balances are shown.
  const goal = showBalances && rewardsData ? resolveSavingsGoal(rewardsData, selectedMemberId) : null;
  const goalState = goal ? goalProgress(balances?.[selectedMemberId] ?? 0, goal) : null;
  const closeCelebration = useCallback(() => setCelebration(null), []);

  // Toggle completion — accepts the viewing date so backdated edits hit the right day
  const toggle = async (choreId: string) => {
    if (!canEdit) return; // kids viewing a past day can't edit
    const day = viewingDate;
    const key = completionKey(choreId, selectedMemberId, day);
    setToggling((prev) => new Set(prev).add(key));

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

    // One plan drives both the optimistic update and the direction the server
    // is told. Sending the direction makes the write idempotent, so two people
    // reaching for one chore at the same moment no longer flip it twice and
    // leave it undone. Worked out here rather than inside a state updater:
    // React may run an updater during the next render instead of at the call,
    // and the direction has to be known now, for the request below.
    const chore = chores.find((c) => c.id === choreId);
    const plan = planChoreToggle(completions, choreId, selectedMemberId, day, (c) => !chore || countsSinceReset(chore, c, bonusResets, resetViewDay(day, realToday)));

    // Optimistic update
    const before = completions;
    setCompletions(plan.completions);

    try {
      const reqBody: ChoreToggleRequest = {
        choreId,
        memberId: selectedMemberId,
        date: day,
        direction: plan.direction,
      };
      const res = await editorFetch('/api/chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (res.status === 409) {
        // A bonus chore someone else got to first: say who under the row, and
        // show where it stands now from the lists the answer carries.
        const refused = await res.json().catch(() => null);
        if (!isMountedRef.current) return;
        if (refused?.completions) applyMarks(refused);
        else void fetchCompletions();
        if (!quietRefusal(refused?.reason)) {
          setRowNotice({ choreId, memberId: selectedMemberId, date: day, text: refused?.reason ? refusalMessage(refused) : t('choresTab.saveFailed') });
        }
        return;
      }
      if (!res.ok) throw new Error('Failed to toggle');
      const data: ChoreToggleResponse = await res.json();
      if (!isMountedRef.current) return;
      applyMarks(data);
      // This one saved, so a "that didn't save" under the row has been answered.
      setRowNotice((notice) => (notice?.choreId === choreId ? null : notice));
      // Only what a toggle moves: balances and the redemption history. The
      // answer also carries the reward list, but this phone's copy of the list
      // is the one its revision belongs to. Taking the list without its
      // revision would show another phone's new reward and then have the
      // next reward save here refused as stale.
      const moved = data.rewards;
      if (moved) {
        setRewardsData((prev) => (prev ? { ...prev, balances: moved.balances, redemptions: moved.redemptions } : prev));
      }
      if (data.overspent) {
        const { memberId, balance } = data.overspent;
        const owed = Math.abs(balance);
        setLastWarning(t(owed === 1 ? 'choresTab.overspentOne' : 'choresTab.overspentMany', {
          name: members.find((m) => m.id === memberId)?.name ?? t('choresTab.overspentSomeone'),
          balance,
          owed,
        }));
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      // Nothing was saved, so the tick comes off again now, with a word under
      // the row about why. Left on until the next poll, it looked done (and,
      // with no network, stayed looking done) and then quietly was not.
      setCompletions((current) => (current === plan.completions ? before : current));
      if (finishesEverything) {
        setCelebration(null);
        forgetCelebrated(selectedMemberId, day);
      }
      if (!isSessionExpired(err)) {
        setRowNotice({ choreId, memberId: selectedMemberId, date: day, text: t('choresTab.saveFailed') });
      }
      void fetchCompletions();
    } finally {
      if (isMountedRef.current) {
        setToggling((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    }
  };

  const nameOf = (id: string | undefined) => members.find((m) => m.id === id)?.name ?? t('choresTab.overspentSomeone');
  // On the kids' page a "limit" refusal needs no notice: the lists it carries
  // redraw the row with its own "Finish your grab first" line, said to "you".
  const quietRefusal = (reason: BonusRefusal | undefined) => reason === 'limit' && !isAdmin;
  function refusalMessage(refused: { reason: BonusRefusal; memberId?: string }): string {
    switch (refused.reason) {
      case 'grabbed': return t('choresTab.bonus.refused.grabbed', { name: nameOf(refused.memberId) });
      case 'taken': return t('choresTab.bonus.refused.taken', { name: nameOf(refused.memberId) });
      case 'limit': return t(choreSettings.grabLimit > 1 ? 'choresTab.bonus.refused.limitMany' : 'choresTab.bonus.refused.limit', { name: nameOf(selectedMemberId) });
      case 'not-yours': return t('choresTab.bonus.refused.notYours', { name: nameOf(selectedMemberId) });
      case 'not-today': return t('choresTab.bonus.refused.notToday');
      default: return t('choresTab.saveFailed');
    }
  }

  // Grab, let go, not today and put back all answer with the chore lists.
  const postMarks = async (url: string, body: unknown, busyKey: string, rowChoreId?: string) => {
    setToggling((prev) => new Set(prev).add(busyKey));
    try {
      const res = await editorFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!isMountedRef.current) return;
      if (!res.ok) {
        if (res.status === 409 && data?.reason && rowChoreId) {
          if (data.completions) applyMarks(data);
          else void fetchCompletions();
          if (!quietRefusal(data.reason)) setRowNotice({ choreId: rowChoreId, memberId: selectedMemberId, date: viewingDate, text: refusalMessage(data) });
          return;
        }
        setLastWarning(t('choresTab.saveFailed'));
        void fetchCompletions();
        return;
      }
      applyMarks(data ?? {});
    } catch (err) {
      if (isSessionExpired(err)) return;
      if (isMountedRef.current) {
        setLastWarning(t('choresTab.saveFailed'));
        void fetchCompletions();
      }
    } finally {
      if (isMountedRef.current) {
        setToggling((prev) => {
          const next = new Set(prev);
          next.delete(busyKey);
          return next;
        });
      }
    }
  };
  const grabChore = (choreId: string) =>
    postMarks('/api/chores/grab', { choreId, memberId: selectedMemberId, action: 'grab' }, `bonus-${choreId}`, choreId);
  const letGoOfChore = (choreId: string, memberId: string) =>
    postMarks('/api/chores/grab', { choreId, memberId, action: 'let-go' }, `bonus-${choreId}`, choreId);
  const markNotToday = (choreId: string, memberIds: string[], skipped: boolean) =>
    postMarks('/api/chores/skip', { choreId, memberIds, date: viewingDate, skipped }, completionKey(choreId, selectedMemberId, viewingDate));
  const putBack = (choreId: string) => postMarks('/api/chores/put-back', { choreId }, `bonus-${choreId}`);

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
  // day on screen; null when there is nothing to offer, and then the row has
  // no ••• and no hold.
  const menuFor = (choreId: string): { title: string; actions: ChoreAction[] } | null => {
    const chore = chores.find((c) => c.id === choreId);
    const person = selectedMember;
    if (!chore || !person) return null;
    const actions: ChoreAction[] = [];
    if (chore.bonus) {
      const item = bonusItems.find((i) => i.chore.id === chore.id);
      if (!item) return null;
      const doneOn = item.grab ? (item.grab.status === 'done' && item.grab.memberId === person.id ? item.grab.date : undefined) : item.doneOn[person.id];
      // On an earlier day of today's round, a held chore is finished or let go
      // from today's page: a tick here would finish today's job.
      const held = item.grab?.status === 'grabbed' && (item.grab.memberId !== person.id || item.roundIsToday);
      if (doneOn === viewingDate) {
        actions.push({ id: 'toggle', mark: '✓', label: t('choresTab.dayMenu.notDone', { name: person.name }), onSelect: () => void toggle(chore.id) });
      } else if (!doneOn && item.grab?.status !== 'done' && !held) {
        actions.push({ id: 'toggle', mark: '✓', label: t('choresTab.dayMenu.didIt', { name: person.name }), onSelect: () => void toggle(chore.id) });
      }
      if (item.grab?.status === 'grabbed' && !item.roundIsToday) {
        const holder = item.grab.memberId;
        actions.push({ id: 'let-go', mark: '✋', label: t('choresTab.dayMenu.letGoOf', { name: nameOf(holder) }), onSelect: () => letGoOfChore(chore.id, holder) });
      }
      if (canPutBack(item) && !isViewingPast) {
        actions.push({ id: 'put-back', mark: '↺', label: t('choresTab.dayMenu.putBack'), hint: t('choresTab.dayMenu.putBackHint'), onSelect: () => setPutBackChoreId(chore.id) });
      }
      return actions.length ? { title: chore.name, actions } : null;
    }
    const mine = myAssignments.find((a) => a.choreId === chore.id);
    if (!mine) return null;
    if (mine.isSkipped) {
      actions.push({ id: 'undo-skip', mark: '↺', label: t('choresTab.dayMenu.undoNotToday', { name: person.name }), onSelect: () => markNotToday(chore.id, [person.id], false) });
    } else {
      actions.push({
        id: 'toggle', mark: '✓',
        label: mine.isCompleted ? t('choresTab.dayMenu.notDone', { name: person.name }) : t('choresTab.dayMenu.didIt', { name: person.name }),
        onSelect: () => void toggle(chore.id),
      });
      if (!mine.isCompleted) {
        actions.push({ id: 'skip', mark: '–', label: t('choresTab.dayMenu.notTodayFor', { name: person.name }), hint: t('choresTab.dayMenu.notTodayHint', { name: person.name }), onSelect: () => markNotToday(chore.id, [person.id], true) });
      }
    }
    const everyone = resolveAssignee(chore, viewingDate, groups).filter((id) => members.some((m) => m.id === id));
    const openForEveryone = everyone.filter((id) => !isChoreComplete(completionSet, chore.id, id, viewingDate) && !isChoreSkipped(completionSet, chore.id, id, viewingDate));
    if (everyone.length > 1 && openForEveryone.length > 0) {
      actions.push({ id: 'skip-all', mark: '–', label: t('choresTab.dayMenu.notTodayEveryone'), hint: t('choresTab.dayMenu.notTodayEveryoneHint', { n: openForEveryone.length }), onSelect: () => markNotToday(chore.id, openForEveryone, true) });
    }
    // Undo "not today for everyone" in one go, not one person at a time.
    const skippedForSomeone = everyone.filter((id) => isChoreSkipped(completionSet, chore.id, id, viewingDate));
    if (skippedForSomeone.length > 1) {
      actions.push({ id: 'undo-skip-all', mark: '↺', label: t('choresTab.dayMenu.onTodayEveryone'), onSelect: () => markNotToday(chore.id, skippedForSomeone, false) });
    }
    return { title: chore.name, actions };
  };
  const menuActions = menuChoreId ? menuFor(menuChoreId) : null;
  // What the menu offered when it opened. A refresh that changes the choices
  // (someone grabbed the chore meanwhile) closes it rather than swapping a
  // choice under the finger: "Ada did it" must not become "Let go of Bram's grab".
  const menuChoices = (menu: { actions: ChoreAction[] } | null) => menu?.actions.map((a) => `${a.id}:${a.label}`).join('|') ?? '';
  const [menuOpenedWith, setMenuOpenedWith] = useState('');
  const openMenu = (choreId: string) => {
    setMenuChoreId(choreId);
    setMenuOpenedWith(menuChoices(menuFor(choreId)));
  };
  const menuChanged = menuActions !== null && menuChoices(menuActions) !== menuOpenedWith;
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
  const yesterday = addDaysISO(realToday, -1);
  const balance = balances?.[selectedMemberId] ?? 0;

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

      {/* Server-side warning banner — e.g. a save that failed, or a balance that went
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
          refreshData={fetchRewards}
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
            void fetchCompletions();
            void fetchRewards();
          }}
          onChoresChange={(next) => {
            intentionalEmpty.current = chores.length > 0 && next.length === 0 ? next : null;
            setChores(next);
          }}
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
        <>
          {isAdmin ? (
            <ChoreHistoryNav
              viewingDate={viewingDate}
              realToday={realToday}
              members={members}
              groups={groups}
              chores={chores}
              completionSet={completionSet}
              accentColor={accentColor}
              onSelect={setViewingDate}
            />
          ) : (
            /* Kids get yesterday and today, not a 90-day strip: yesterday is
               read-only for them anyway, so there is nothing further back a
               kid can act on, and the strip was the biggest thing on the page. */
            <div
              role="group"
              aria-label={t('choresTab.dayToggle.ariaLabel')}
              style={{
                display: 'inline-flex',
                gap: 2,
                padding: 3,
                background: 'var(--hs-bg-card)',
                borderRadius: 10,
                marginTop: 4,
              }}
            >
              {([
                { date: yesterday, label: t('choresTab.dayToggle.yesterday') },
                { date: realToday, label: t('choresTab.dayToggle.today') },
              ] as const).map(({ date, label }) => {
                const active = viewingDate === date;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setViewingDate(date)}
                    aria-pressed={active}
                    style={{
                      padding: '6px 14px',
                      minHeight: 44,
                      minWidth: 44,
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      background: active ? 'var(--hs-bg-hover)' : 'transparent',
                      color: active ? 'var(--hs-text-body)' : 'var(--hs-text-faint)',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* History banner — visible only when the user has navigated away from today */}
          {isViewingPast && (
            <div style={{ marginTop: 10 }}>
              <ChoreHistoryBanner viewingDate={viewingDate} canEdit={canEdit} />
            </div>
          )}

          {/* Phones stack the member pills above the list; from 768px up the
              members become a left column and the chores take the rest. */}
          <div className="md:flex md:items-start md:gap-6">
            <div
              className="md:w-56 md:shrink-0 md:flex-col md:sticky md:top-4"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 0' }}
            >
              {members.map((member) => {
                const isActive = member.id === selectedMemberId;
                const tabStats = memberTabStats[member.id];
                const allDone = (tabStats?.total ?? 0) > 0 && tabStats?.done === tabStats?.total;

                return (
                  <button
                    key={member.id}
                    className="press-scale md:w-full"
                    onClick={() => selectMember(member.id)}
                    aria-label={
                      allDone
                        ? t('choresTab.memberAriaLabelAllDone', { name: member.name })
                        : t('choresTab.memberAriaLabel', { name: member.name })
                    }
                    aria-pressed={isActive}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      // A fixed height: the ✓ that appears when someone finishes
                      // is taller than the name, and grew the chip, moving the
                      // whole list under a finger.
                      height: 44,
                      maxWidth: '100%',
                      borderRadius: 999,
                      border: `2px solid ${isActive ? member.color : 'transparent'}`,
                      background: isActive ? `color-mix(in srgb, ${member.color} 15%, transparent)` : 'var(--hs-bg-card)',
                      color: isActive ? member.color : 'var(--hs-text-muted)',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                    }}
                  >
                    {member.emoji ? (
                      <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                        <ChoreIcon value={member.emoji} size={18} color={isActive ? member.color : 'var(--hs-text-muted)'} fallback={<span style={{ fontSize: 16, fontWeight: 600 }}>{member.name[0]}</span>} />
                      </span>
                    ) : (
                      <span style={{ fontSize: 16, fontWeight: 600, flexShrink: 0 }}>{member.name[0]}</span>
                    )}
                    {/* A very long name gets an ellipsis instead of pushing
                        every other member off the screen. */}
                    <span
                      style={{
                        maxWidth: 140,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' as const,
                      }}
                    >
                      {member.name}
                    </span>
                    {allDone && <span style={{ fontSize: 12, lineHeight: 1, marginLeft: -2, flexShrink: 0 }}>&#10003;</span>}
                  </button>
                );
              })}
            </div>

            <div className="md:flex-1 md:min-w-0">
              {celebration && selectedMember && selectedMember.id === celebration.memberId && (
                <DayCompleteSheet
                  key={celebration.key}
                  member={selectedMember}
                  done={celebration.done}
                  total={celebration.total}
                  tickets={celebration.tickets}
                  onClose={closeCelebration}
                  modal={!isAdmin}
                />
              )}

              <div style={{ padding: '0 0 12px' }}>
                {/* A fixed height: "All done!" and the ticket count changing must
                    not nudge the list under a finger. */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, height: 26 }}>
                  <span style={{ fontSize: 13, color: 'var(--hs-text-faint)' }}>
                    {/* Everything "not today" leaves nothing to count: a day off, not 0/0.
                        Someone with only bonus chores has nothing to count at all. */}
                    {totalCount === 0 && myAssignments.length > 0
                      ? tModules('chore-chart.dayOff')
                      : onlyBonus ? null : t('choresTab.progress.completion', { done: totalDone, total: totalCount })}
                    {totalCount > 0 && totalDone === totalCount && (
                      <span style={{ color: 'var(--hs-success)', fontWeight: 500, marginLeft: 8 }}>{t('choresTab.progress.allDone')}</span>
                    )}
                  </span>
                  {showBalances && balances !== null && (
                    <span
                      key={balance}
                      className="hs-pulse-once"
                      data-testid="ticket-balance"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 13,
                        fontWeight: 600,
                        color: selectedMember?.color ?? accentColor,
                        whiteSpace: 'nowrap' as const,
                      }}
                    >
                      <span aria-hidden="true">🎟</span>
                      <span>
                        {balance === 1
                          ? t('choresTab.ticketCountSingular', { n: balance })
                          : t('choresTab.ticketCountPlural', { n: balance })}
                      </span>
                    </span>
                  )}
                </div>
                {!onlyBonus && <div style={{ height: 8, background: 'var(--hs-border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 4,
                      width: totalCount > 0 ? `${(totalDone / totalCount) * 100}%` : '0%',
                      backgroundColor: selectedMember?.color ?? accentColor,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>}
                {/* What they are saving for, as one fixed-height line: icon, name,
                    bar, how far to go. A tap opens Rewards. Fixed so it never
                    nudges the list, and absent rather than empty without a goal. */}
                {goal && goalState && (
                  <button
                    type="button"
                    data-testid="today-goal-line"
                    className="press-scale"
                    onClick={() => setSubView('rewards')}
                    aria-label={t('choresTab.goalLine.ariaLabel', { name: goal.name })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 44, marginTop: 4,
                      background: 'none', border: 'none', padding: 0, color: 'var(--hs-text-muted)', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                      <ChoreIcon value={goal.emoji} size={16} color={selectedMember?.color ?? accentColor} />
                    </span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '48%' }}>
                      {t('choresTab.goalLine.label', { name: goal.name })}
                    </span>
                    <span style={{ flex: 1, height: 5, background: 'var(--hs-border)', borderRadius: 9, overflow: 'hidden', minWidth: 24 }}>
                      <span style={{ display: 'block', height: '100%', borderRadius: 9, background: selectedMember?.color ?? accentColor, width: `${goalState.fraction * 100}%`, transition: 'width 0.3s ease' }} />
                    </span>
                    <span style={{ whiteSpace: 'nowrap', flexShrink: 0, color: goalState.reached ? (selectedMember?.color ?? accentColor) : undefined, fontWeight: goalState.reached ? 600 : 400 }}>
                      {goalState.reached
                        ? t('choresTab.goalLine.ready')
                        : goalState.stillNeeded === 1
                          ? t('choresTab.goalLine.moreToGoSingular', { n: goalState.stillNeeded })
                          : t('choresTab.goalLine.moreToGoPlural', { n: goalState.stillNeeded })}
                    </span>
                    <ChevronRight size={16} aria-hidden style={{ flexShrink: 0, color: 'var(--hs-text-faint)' }} />
                  </button>
                )}
              </div>

              <div style={{ paddingBottom: 80 }}>
                {myAssignments.length === 0 && bonusItems.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '48px 0' }}>
                    <p style={{ fontSize: 14, color: 'var(--hs-text-faint)' }}>{t('choresTab.noChoresToday')}</p>
                  </div>
                )}

                {(['morning', 'afternoon', 'evening', 'anytime'] as ChoreTimeOfDay[]).map((section) => {
                  const items = grouped.get(section);
                  if (!items?.length) return null;

                  const TodIcon = TOD_ICONS[section];
                  const isCurrent = !isViewingPast && section === currentTimeOfDay;
                  const sectionAllDone = items.every((a) => a.isCompleted || a.isSkipped);

                  return (
                    <div key={section} style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0' }}>
                        <TodIcon size={16} color={isCurrent ? accentColor : 'var(--hs-text-faint)'} strokeWidth={2} />
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.08em',
                            color: isCurrent ? accentColor : 'var(--hs-text-faint)',
                          }}
                        >
                          {tModules(getTimeOfDayLabelKey(section))}
                        </span>
                        {/* lineHeight 1: the ✓ is taller than the label, and made the
                            heading grow, moving every row under it, when a section finished. */}
                        {sectionAllDone && (
                          <span style={{ marginLeft: 'auto', fontSize: 12, lineHeight: 1, color: 'var(--hs-success)' }}>&#10003;</span>
                        )}
                      </div>

                      {items.map((assignment) => {
                        const key = completionKey(assignment.choreId, selectedMemberId, viewingDate);
                        return (
                          <ChoreRow
                            key={assignment.choreId}
                            assignment={assignment}
                            isToggling={toggling.has(key)}
                            readOnly={!canEdit}
                            holdToUncheck={!isAdmin}
                            checkedColor={selectedMember?.color ?? accentColor}
                            showPoints={!!config.showPoints}
                            onToggle={() => {
                              // A grown-up's tap on a "not today" takes the mark away.
                              if (assignment.isSkipped) void markNotToday(assignment.choreId, [selectedMemberId], false);
                              else void toggle(assignment.choreId);
                            }}
                            onLongPress={isAdmin && canEdit ? () => openMenu(assignment.choreId) : undefined}
                            onMenu={isAdmin && canEdit ? () => openMenu(assignment.choreId) : undefined}
                            view={`${selectedMemberId}:${viewingDate}`}
                            notice={rowNotice && rowNotice.choreId === assignment.choreId && rowNotice.memberId === selectedMemberId && rowNotice.date === viewingDate ? rowNotice.text : null}
                            steps={assignment.steps}
                            stepsOpen={openSteps.has(assignment.choreId)}
                            onToggleSteps={() => setOpenSteps((open) => {
                              const next = new Set(open);
                              if (next.has(assignment.choreId)) next.delete(assignment.choreId);
                              else next.add(assignment.choreId);
                              return next;
                            })}
                          />
                        );
                      })}
                    </div>
                  );
                })}

                {bonusItems.length > 0 && (
                  <div data-testid="bonus-section" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0 2px' }}>
                      <Hand size={16} color="#f59e0b" strokeWidth={2} />
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#f59e0b' }}>
                        {tModules('chore-chart.bonus.heading')}
                      </span>
                    </div>
                    {/* The hint says what to do; on a past day there is nothing to grab. */}
                    {!isViewingPast && (
                      <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '0 0 8px' }}>{t('choresTab.bonus.sectionHint')}</p>
                    )}
                    {bonusItems.map((item) => (
                      <BonusChoreRow
                        key={item.chore.id}
                        item={item}
                        memberId={selectedMemberId}
                        members={members}
                        date={viewingDate}
                        today={realToday}
                        canEdit={canEdit}
                        canGrab={!isViewingPast}
                        atLimit={selectedAtLimit}
                        grabLimit={choreSettings.grabLimit}
                        isBusy={toggling.has(`bonus-${item.chore.id}`) || toggling.has(completionKey(item.chore.id, selectedMemberId, viewingDate))}
                        holdToUncheck={!isAdmin}
                        checkedColor={selectedMember?.color ?? accentColor}
                        onTick={() => void toggle(item.chore.id)}
                        onGrab={() => void grabChore(item.chore.id)}
                        onLimitTap={() => setRowNotice({
                          choreId: item.chore.id, memberId: selectedMemberId, date: viewingDate, limit: true,
                          // A grown-up is told about the child by name; a kid, as "you".
                          text: isAdmin
                            ? t(choreSettings.grabLimit > 1 ? 'choresTab.bonus.refused.limitMany' : 'choresTab.bonus.refused.limit', { name: nameOf(selectedMemberId) })
                            : t(choreSettings.grabLimit > 1 ? 'choresTab.bonus.limitLineMany' : 'choresTab.bonus.limitLine'),
                        })}
                        onLetGo={() => void letGoOfChore(item.chore.id, selectedMemberId)}
                        notice={rowNotice && rowNotice.choreId === item.chore.id && rowNotice.memberId === selectedMemberId && rowNotice.date === viewingDate ? rowNotice.text : null}
                        onLongPress={isAdmin && menuFor(item.chore.id) ? () => openMenu(item.chore.id) : undefined}
                        onMenu={isAdmin && menuFor(item.chore.id) ? () => openMenu(item.chore.id) : undefined}
                        onPutBack={isAdmin && !isViewingPast && canPutBack(item) ? () => setPutBackChoreId(item.chore.id) : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
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

      {menuActions && menuActions.actions.length > 0 && (
        <ChoreActionSheet
          title={menuActions.title}
          subtitle={`${selectedMember?.name ?? ''} · ${dayName}`}
          actions={menuActions.actions}
          onClose={() => setMenuChoreId(null)}
        />
      )}
      {showSettings && (
        <ChoreSettingsSheet settings={choreSettings} onSave={saveSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
