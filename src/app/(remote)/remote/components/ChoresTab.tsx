'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { Sunrise, Sun, Sunset, Clock, Settings } from 'lucide-react';
import type {
  ChoreChartConfig,
  ChoreMember,
  ChoreDefinition,
  ChoreCompletion,
  ChoreTimeOfDay,
  ChoreToggleRequest,
  ChoreToggleResponse,
} from '@/types/config';
import type { ChoreData } from '@/lib/chore-data';
import {
  resolveAssignee,
  choreAppliesToday,
  completionKey,
  todayStr,
  addDaysISO,
  TIME_OF_DAY_META,
  getTimeOfDayLabelKey,
  getCurrentTimeOfDay,
} from '@/components/modules/chore-chart/types';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { editorFetch, isSessionExpired, throwIfNotOk } from '@/lib/editor-fetch';
import { useTranslate, useFormattingLocale } from '@/i18n';
import ChoreHistoryNav from './ChoreHistoryNav';
import ChoreHistoryBanner from './ChoreHistoryBanner';
import ChoreRow from './ChoreRow';
import ChoresManageView from './ChoresManageView';
import RewardsView from './RewardsView';
import { logger } from '@/lib/logger';

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
/** How long the "all done" celebration stays up. */
const CELEBRATION_MS = 4000;

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
function defaultMemberFor(members: ChoreMember[], chores: ChoreDefinition[], day: string): string {
  const dayOfWeek = new Date(day + 'T00:00:00').getDay();
  for (const member of members) {
    const hasChore = chores.some(
      (c) => choreAppliesToday(c, dayOfWeek, day) && resolveAssignee(c, day).includes(member.id),
    );
    if (hasChore) return member.id;
  }
  return members[0]?.id ?? '';
}

interface ChoresTabProps {
  /** Display settings read from the first chore module placed on a screen. */
  config: ChoreChartConfig;
  /**
   * Household members and chores from the shared data file, read server-side
   * so the first paint is populated. These are data, not module config, which
   * is why they arrive as their own prop rather than inside `config`.
   */
  choreData: ChoreData;
  /** When false, hides Manage sub-view and restricts Rewards to redeem/history only. */
  isAdmin?: boolean;
}

export default function ChoresTab({ config, choreData, isAdmin = false }: ChoresTabProps) {
  const locale = useFormattingLocale();
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  // ── Lifted state (shared between Today + Manage views) ──
  const [members, setMembers] = useState<ChoreMember[]>(choreData.members ?? []);
  const [chores, setChores] = useState<ChoreDefinition[]>(choreData.chores ?? []);
  const [subView, setSubView] = useState<'today' | 'manage' | 'rewards'>('today');
  const accentColor = config.accentColor ?? '#f59e0b';

  // Re-render at midnight and advance the viewing window if the user is on "today"
  // Both initial values come from a single snapshot so they can't straddle midnight.
  const initialDate = useRef(todayStr()).current;
  const [dateKey, setDateKey] = useState(initialDate);
  const [viewingDate, setViewingDate] = useState<string>(initialDate);

  // ── Today view state ──
  // Shared with the Rewards view: the kid who checked off their chores is the
  // kid whose tickets Rewards shows, without picking themselves twice.
  const [selectedMemberId, setSelectedMemberId] = useState(
    () => defaultMemberFor(members, chores, initialDate),
  );
  const [completions, setCompletions] = useState<ChoreCompletion[]>([]);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  // Ticket balances per member, shown beside the progress header so a kid sees
  // the count grow as they check things off. null until the first fetch lands.
  const [balances, setBalances] = useState<Record<string, number> | null>(null);
  const [celebration, setCelebration] = useState<{ name: string; key: number } | null>(null);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Last warning surfaced from POST /api/chores (e.g. balance went negative on un-complete)
  // or a failed auto-save. Rendered as a dismissible banner so the user gets
  // in-UI feedback without DevTools.
  const [lastWarning, setLastWarning] = useState<string | null>(null);

  // Debounced auto-save. `skipInitial` skips the first effect run after mount
  // (initial state comes from props), and `flushOnUnmount` ensures any pending
  // save in the debounce window runs before the component unmounts.
  useDebouncedSave({
    values: [members, chores],
    flushOnUnmount: true,
    save: () =>
      editorFetch('/api/chores/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members,
          chores,
          force: members.length === 0 && chores.length === 0,
        }),
      }).then(throwIfNotOk),
    // Without `throwIfNotOk` above a 500 resolved and this never fired: the new
    // member stayed on screen and was gone after reload, with no warning.
    onError: (err) => {
      if (isSessionExpired(err)) return;
      log.error('Chore auto-save failed:', err);
      setLastWarning(t('choresTab.saveFailed'));
    },
  });

  // Track mounted state so in-flight fetches don't setState after unmount.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearTimeout(celebrationTimer.current);
    };
  }, []);

  // Restore this device's remembered member once, after mount (localStorage
  // is not available during the server render). An id that no longer exists
  // is ignored and the "first member with chores" default stands.
  useEffect(() => {
    const remembered = readRememberedMember();
    if (remembered && members.some((m) => m.id === remembered)) {
      setSelectedMemberId(remembered);
    }
    // Intentionally mount-only: later member edits are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectMember = useCallback((id: string) => {
    setSelectedMemberId(id);
    rememberMember(id);
  }, []);

  // The celebration belongs to the member and day it was earned on.
  useEffect(() => {
    clearTimeout(celebrationTimer.current);
    setCelebration(null);
  }, [selectedMemberId, viewingDate]);

  // Each new poll cancels the previous in-flight poll.
  const fetchAbortRef = useRef<AbortController | null>(null);

  // Keep selectedMemberId valid when members change
  useEffect(() => {
    if (members.length > 0 && !members.find((m) => m.id === selectedMemberId)) {
      setSelectedMemberId(members[0].id);
    }
  }, [members, selectedMemberId]);

  // Fetch completions
  const fetchCompletions = useCallback(async () => {
    // Cancel any prior in-flight poll
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    try {
      const res = await editorFetch('/api/chores', { signal: controller.signal });
      if (!res.ok) return;
      const data = await res.json();
      if (!isMountedRef.current || controller.signal.aborted) return;
      setCompletions((prev) => {
        const next: ChoreCompletion[] = data.completions ?? [];
        if (
          prev.length === next.length &&
          prev.every((c, i) => {
            const n = next[i];
            return c.choreId === n.choreId && c.memberId === n.memberId && c.date === n.date;
          })
        ) {
          return prev; // identity-stable when content unchanged
        }
        return next;
      });
    } catch { /* silent (includes AbortError) */ }
  }, []);

  const showBalances = !!config.showPoints;
  const fetchBalances = useCallback(async () => {
    try {
      const res = await editorFetch('/api/rewards');
      if (!res.ok) return;
      const data = await res.json();
      if (!isMountedRef.current) return;
      setBalances(data.balances ?? {});
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchCompletions();
    if (showBalances) fetchBalances();
    const interval = setInterval(() => {
      fetchCompletions();
      if (showBalances) fetchBalances();
    }, 15_000);
    return () => {
      clearInterval(interval);
      fetchAbortRef.current?.abort();
    };
  }, [fetchCompletions, fetchBalances, showBalances]);

  useEffect(() => {
    const check = () => {
      const now = todayStr();
      if (now !== dateKey) {
        setDateKey(now);
        // If the user was parked on what used to be today, walk them forward.
        // If they're explicitly viewing a past day, leave them alone.
        setViewingDate((prev) => (prev === dateKey ? now : prev));
      }
    };
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [dateKey]);

  const realToday = dateKey;
  const isViewingPast = viewingDate !== realToday;
  const canEdit = !isViewingPast || isAdmin;

  // Completion lookup
  const completionSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of completions) {
      set.add(completionKey(c.choreId, c.memberId, c.date));
    }
    return set;
  }, [completions]);

  // Assignments for the selected member on the currently-viewed date.
  // Authored order within each time-of-day section is kept as-is: the
  // strike-through already says what is done, and a row that jumps to the
  // bottom the moment it is tapped is the one thing a thumb cannot follow.
  const myAssignments = useMemo(() => {
    const day = viewingDate;
    const dayOfWeek = new Date(day + 'T00:00:00').getDay();
    const assignments: { choreId: string; choreName: string; choreEmoji: string; timeOfDay: ChoreTimeOfDay; points: number; isCompleted: boolean }[] = [];

    for (const chore of chores) {
      if (!choreAppliesToday(chore, dayOfWeek, day)) continue;
      const assignees = resolveAssignee(chore, day);
      if (!assignees.includes(selectedMemberId)) continue;

      assignments.push({
        choreId: chore.id,
        choreName: chore.name,
        choreEmoji: chore.emoji,
        timeOfDay: chore.timeOfDay,
        points: chore.points,
        isCompleted: completionSet.has(completionKey(chore.id, selectedMemberId, day)),
      });
    }

    return assignments.sort(
      (a, b) => TIME_OF_DAY_META[a.timeOfDay].order - TIME_OF_DAY_META[b.timeOfDay].order,
    );
  }, [chores, viewingDate, selectedMemberId, completionSet]);

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

  const totalDone = myAssignments.filter((a) => a.isCompleted).length;
  const totalCount = myAssignments.length;

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
        if (!resolveAssignee(c, day).includes(member.id)) continue;
        total++;
        if (completionSet.has(completionKey(c.id, member.id, day))) done++;
      }
      stats[member.id] = { total, done };
    }
    return stats;
  }, [members, chores, viewingDate, completionSet]);

  const selectedMember = members.find((m) => m.id === selectedMemberId);

  // Toggle completion — accepts the viewing date so backdated edits hit the right day
  const toggle = async (choreId: string) => {
    if (!canEdit) return; // kids viewing a past day can't edit
    const day = viewingDate;
    const key = completionKey(choreId, selectedMemberId, day);
    setToggling((prev) => new Set(prev).add(key));

    // Was this the last open chore of the day for this member? Decided before
    // the optimistic update so the celebration fires exactly once, on the tap
    // that finished the list (not on a poll that happens to agree).
    const target = myAssignments.find((a) => a.choreId === choreId);
    const finishesEverything =
      !!target && !target.isCompleted && !isViewingPast &&
      myAssignments.every((a) => a.isCompleted || a.choreId === choreId);
    if (finishesEverything && selectedMember) {
      clearTimeout(celebrationTimer.current);
      setCelebration({ name: selectedMember.name, key: Date.now() });
      celebrationTimer.current = setTimeout(() => setCelebration(null), CELEBRATION_MS);
    }

    // Optimistic update
    setCompletions((prev) => {
      const idx = prev.findIndex(
        (c) => c.choreId === choreId && c.memberId === selectedMemberId && c.date === day,
      );
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return [...prev, { choreId, memberId: selectedMemberId, date: day }];
    });

    try {
      const reqBody: ChoreToggleRequest = {
        choreId,
        memberId: selectedMemberId,
        date: day,
      };
      const res = await editorFetch('/api/chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      const data: ChoreToggleResponse = await res.json();
      if (!isMountedRef.current) return;
      setCompletions(data.completions ?? []);
      if (data.rewards?.balances) setBalances(data.rewards.balances);
      if (data.warning) {
        log.warn(data.warning);
        setLastWarning(data.warning);
      }
    } catch {
      if (isMountedRef.current) fetchCompletions();
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

  const dayName = (() => {
    const [y, m, d] = viewingDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long' });
  })();
  const currentTimeOfDay = getCurrentTimeOfDay(new Date().getHours());
  const yesterday = addDaysISO(realToday, -1);
  const balance = balances?.[selectedMemberId] ?? 0;

  return (
    <div>
      <div style={{ padding: '12px 0 4px' }}>
        <div style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>{dayName}</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--hs-text-primary)' }}>{t('choresTab.header')}</h2>
      </div>

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
              minHeight: 40,
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
        />
      ) : subView === 'manage' && isAdmin ? (
        <ChoresManageView
          members={members}
          chores={chores}
          onMembersChange={setMembers}
          onChoresChange={setChores}
        />
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
                      minHeight: 36,
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
              <ChoreHistoryBanner viewingDate={viewingDate} realToday={realToday} canEdit={canEdit} />
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
                      minHeight: 44,
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
                        <ChoreIcon value={member.emoji} size={18} color={isActive ? member.color : 'var(--hs-text-muted)'} />
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
                    {allDone && <span style={{ fontSize: 12, marginLeft: -2, flexShrink: 0 }}>&#10003;</span>}
                  </button>
                );
              })}
            </div>

            <div className="md:flex-1 md:min-w-0">
              {celebration && (
                <div
                  key={celebration.key}
                  role="status"
                  className="hs-pop-in"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '12px 16px',
                    marginBottom: 10,
                    borderRadius: 12,
                    background: `color-mix(in srgb, ${selectedMember?.color ?? accentColor} 16%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${selectedMember?.color ?? accentColor} 40%, transparent)`,
                    color: 'var(--hs-text-primary)',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  <span aria-hidden="true">🎉</span>
                  {t('choresTab.celebration', { name: celebration.name })}
                </div>
              )}

              <div style={{ padding: '0 0 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--hs-text-faint)' }}>
                    {t('choresTab.progress.completion', { done: totalDone, total: totalCount })}
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
                <div style={{ height: 8, background: 'var(--hs-border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 4,
                      width: totalCount > 0 ? `${(totalDone / totalCount) * 100}%` : '0%',
                      backgroundColor: selectedMember?.color ?? accentColor,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              <div style={{ paddingBottom: 80 }}>
                {myAssignments.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '48px 0' }}>
                    <p style={{ fontSize: 14, color: 'var(--hs-text-faint)' }}>{t('choresTab.noChoresToday')}</p>
                  </div>
                )}

                {(['morning', 'afternoon', 'evening', 'anytime'] as ChoreTimeOfDay[]).map((section) => {
                  const items = grouped.get(section);
                  if (!items?.length) return null;

                  const TodIcon = TOD_ICONS[section];
                  const isCurrent = !isViewingPast && section === currentTimeOfDay;
                  const sectionAllDone = items.every((a) => a.isCompleted);

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
                        {sectionAllDone && (
                          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--hs-success)' }}>&#10003;</span>
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
                            onToggle={() => toggle(assignment.choreId)}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
